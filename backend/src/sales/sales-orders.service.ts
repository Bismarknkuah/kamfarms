import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
const LocationType = { WAREHOUSE: 'WAREHOUSE' as any, CUSTOMER: 'CUSTOMER' as any };
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { ApproveSalesOrderDto } from './dto/approve-sales-order.dto';
import { RejectSalesOrderDto } from './dto/reject-sales-order.dto';
import { ReleaseSalesOrderDto } from './dto/release-sales-order.dto';
import { AttachReceiptDto } from './dto/attach-receipt.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

// Who hears about each step of a sale. Role codes, the same way every
// other service here finds its recipients.
export const FINANCE_REVIEW_ROLE_CODES = ['FINANCE_DIRECTOR'];
export const RELEASE_ROLE_CODES = ['MD', 'CEO'];
export const DELIVERY_ROLE_CODES = ['WAREHOUSE_SUPERVISOR'];

const money = (n: unknown) => `GHS ${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/**
 * A sale's journey, one accountable person at each step:
 *
 *   Sales Officer  creates and submits          DRAFT -> SUBMITTED
 *   Finance Director  reviews and approves      SUBMITTED -> APPROVED  (or REJECTED)
 *   MD / CEO  releases it to the Warehouse      APPROVED -> RESERVED   (picks the warehouse,
 *             Supervisor for delivery                                  stock is reserved, a
 *                                                                      delivery task is created)
 *   Warehouse Supervisor  delivers it           RESERVED -> FULFILLED
 *
 * Whoever holds the order next is notified at every step, and every
 * transition is guarded so two people can never act on the same order
 * at once.
 */
@Injectable()
export class SalesOrdersService {
  private readonly logger = new Logger(SalesOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  private async userIdsWithRoles(roleCodes: string[]): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE', roles: { some: { role: { code: { in: roleCodes } } } } },
      select: { id: true },
    });
    return users.map((u: { id: string }) => u.id);
  }

  /** Never throws: the order step has already been committed, and a failed
   * notification must not turn that into an error for the person who just
   * did their part. The person who acted is never notified of their own action. */
  private async tell(userIds: string[], input: { type: string; title: string; body: string }, orderId: string, actorId: string) {
    const recipients = Array.from(new Set(userIds)).filter((uid) => uid !== actorId);
    if (recipients.length === 0) return;
    try {
      await this.notifications.notify({ userIds: recipients, ...input, entityType: 'SalesOrder', entityId: orderId });
    } catch (err) {
      this.logger.warn(`Could not send "${input.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Moves an order from one stage to the next only if it is still in the
   * stage the caller read. If someone else got there first, nothing is
   * written and the caller is told so. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async transition(tx: any, id: string, from: string, data: Record<string, unknown>) {
    const res = await tx.salesOrder.updateMany({ where: { id, status: from }, data });
    if (res.count !== 1) {
      throw new ConflictException('Someone else has just acted on this order. Refresh to see where it is now.');
    }
  }

  async list(filters: { status?: string; customerId?: string }) {
    return this.prisma.salesOrder.findMany({
      where: { status: filters.status as any, customerId: filters.customerId },
      include: { customer: true, salesOfficer: true, approvedBy: true, allocatedWarehouse: true, tasks: { include: { createdBy: true } }, items: { include: { product: true, packagingSize: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        salesOfficer: true,
        preferredWarehouse: true,
        allocatedWarehouse: true,
        approvedBy: true,
        // The delivery task is how "who released this, and when" is known.
        tasks: { include: { createdBy: true } },
        items: { include: { product: true, packagingSize: true } },
        reservations: true,
      },
    });
    if (!order) throw new NotFoundException('Sales order not found.');
    return order;
  }

  private async resolveUnitPrice(productId: string, packagingSizeId: string, customerId: string, override?: number): Promise<number> {
    const customerPrice = await this.prisma.productPrice.findFirst({
      where: { productId, packagingSizeId, customerId, isActive: true, effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (customerPrice) return Number(customerPrice.pricePerBag);

    const listPrice = await this.prisma.productPrice.findFirst({
      where: { productId, packagingSizeId, customerId: null, isActive: true, effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (listPrice) return Number(listPrice.pricePerBag);

    if (override != null) return override;

    // Say WHAT has no price, and who can set one: a Sales Officer cannot fix this themselves.
    let what = 'this product and size';
    try {
      const [product, size] = await Promise.all([
        this.prisma.product.findUnique({ where: { id: productId }, select: { name: true } }),
        this.prisma.packagingSize.findUnique({ where: { id: packagingSizeId }, select: { label: true } }),
      ]);
      if (product && size) what = `${product.name} ${size.label}`;
    } catch {
      /* the message below still makes sense without the names */
    }
    throw new BadRequestException({
      message: `No price is set for ${what} yet, so this order cannot be created. Ask the System Administrator to add the price in Price list, then try again.`,
      errorCode: 'PRICE_NOT_CONFIGURED',
    });
  }

  async create(dto: CreateSalesOrderDto, actor: AuthenticatedUser) {
    if (dto.items.length === 0) throw new BadRequestException('A sales order needs at least one item.');

    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer || !customer.isActive) throw new BadRequestException('Customer not found or inactive.');

    const order = await this.prisma.$transaction(async (tx: any) => {
      const year = new Date().getFullYear();
      const prefix = `SO-${year}-`;
      const count = await tx.salesOrder.count({ where: { orderNumber: { startsWith: prefix } } });
      const orderNumber = `${prefix}${String(count + 1).padStart(6, '0')}`;

      let totalKg = 0;
      let totalAmount = 0;
      const itemRows: {
        productId: string;
        packagingSizeId: string;
        bagCount: number;
        totalKg: number;
        unitPrice: number;
        lineTotal: number;
      }[] = [];

      for (const item of dto.items) {
        const size = await tx.packagingSize.findUnique({ where: { id: item.packagingSizeId } });
        if (!size || !size.isActive) throw new BadRequestException('Packaging size not found or inactive.');

        const unitPrice = await this.resolveUnitPrice(item.productId, item.packagingSizeId, dto.customerId, item.unitPrice);
        const lineKg = Number(size.sizeKg) * item.bagCount;
        const lineTotal = unitPrice * item.bagCount;

        itemRows.push({
          productId: item.productId,
          packagingSizeId: item.packagingSizeId,
          bagCount: item.bagCount,
          totalKg: lineKg,
          unitPrice,
          lineTotal,
        });
        totalKg += lineKg;
        totalAmount += lineTotal;
      }

      const created = await tx.salesOrder.create({
        data: {
          orderNumber,
          customerId: dto.customerId,
          salesOfficerId: actor.id,
          preferredWarehouseId: dto.preferredWarehouseId,
          requestedDeliveryDate: dto.requestedDeliveryDate ? new Date(dto.requestedDeliveryDate) : null,
          deliveryLocation: dto.deliveryLocation,
          notes: dto.notes,
          totalKg,
          totalAmount,
          status: 'DRAFT',
          submittedById: actor.id,
          items: { create: itemRows },
        },
      });

      await this.audit.record(
        { userId: actor.id, action: 'sales_order.create', entity: 'SalesOrder', entityId: created.id, afterValue: created },
        tx,
      );
      return created;
    });

    return this.findById(order.id);
  }

  async submit(id: string, actor: AuthenticatedUser) {
    const order = await this.findById(id);
    if (order.status !== 'DRAFT') {
      throw new BadRequestException(`Only DRAFT orders can be submitted (current status: ${order.status}).`);
    }
    if (order.submittedById !== actor.id) {
      throw new ForbiddenException('Only the original submitter can submit this order.');
    }

    const updated = await this.prisma.salesOrder.update({ where: { id }, data: { status: 'SUBMITTED', submittedAt: new Date() } });
    await this.audit.record({ userId: actor.id, action: 'sales_order.submit', entity: 'SalesOrder', entityId: id, afterValue: updated });

    // The request to the Finance Director: the first hand-off in the chain.
    await this.tell(
      await this.userIdsWithRoles(FINANCE_REVIEW_ROLE_CODES),
      {
        type: 'sales_order.awaiting_finance',
        title: `Sales order ${order.orderNumber} needs your review`,
        body: `${order.customer?.name ?? 'A customer'}: ${Number(order.totalKg).toLocaleString()} KG, ${money(order.totalAmount)}. Submitted by ${order.salesOfficer?.firstName ?? ''} ${order.salesOfficer?.lastName ?? ''}.`.replace(/\s+\./, '.'),
      },
      id,
      actor.id,
    );
    return this.findById(updated.id);
  }

  // Deliberately not restricted by order status - a receipt can
  // genuinely need attaching before submission (proof of an earlier
  // deposit), right after (supporting the approval decision), or well
  // after (a correction). The only real restriction is who: the
  // original submitter, matching submit()'s own rule, since this is
  // their evidence for their own order.
  async attachReceipt(id: string, dto: AttachReceiptDto, actor: AuthenticatedUser) {
    const order = await this.findById(id);
    if (order.submittedById !== actor.id) {
      throw new ForbiddenException('Only the original submitter can attach a receipt to this order.');
    }

    const updated = await this.prisma.salesOrder.update({ where: { id }, data: { receiptUrl: dto.receiptUrl } });
    await this.audit.record({ userId: actor.id, action: 'sales_order.attach_receipt', entity: 'SalesOrder', entityId: id, afterValue: { receiptUrl: dto.receiptUrl } });
    return this.findById(updated.id);
  }

  private async availableToSell(warehouseId: string, productId: string, packagingSizeId: string) {
    const balance = await this.ledger.getBalance(this.prisma, {
      locationType: 'WAREHOUSE',
      locationId: warehouseId,
      productId,
      packagingSizeId,
    });
    const totalBags = balance?.bagCount ?? 0;

    const activeReservations = await this.prisma.stockReservation.aggregate({
      where: { warehouseId, productId, packagingSizeId, status: 'ACTIVE' },
      _sum: { bagCount: true },
    });
    const reservedBags = activeReservations._sum.bagCount ?? 0;

    return totalBags - reservedBags;
  }

  /** The Finance Director's decision: is this a sale the company is
   * happy to make? Purely financial - it does not pick a warehouse or
   * touch stock, which is the Managing Director's release step. */
  async approve(id: string, dto: ApproveSalesOrderDto, actor: AuthenticatedUser) {
    const order = await this.findById(id);
    if (order.status !== 'SUBMITTED') {
      throw new BadRequestException(`Only SUBMITTED orders can be approved (current status: ${order.status}).`);
    }
    if (order.submittedById === actor.id) {
      throw new ForbiddenException('You cannot approve your own sales order.');
    }

    await this.prisma.$transaction(async (tx: any) => {
      await this.transition(tx, id, 'SUBMITTED', { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() });
      await this.audit.record(
        { userId: actor.id, action: 'sales_order.approve', entity: 'SalesOrder', entityId: id, afterValue: { status: 'APPROVED', note: dto?.note ?? null } },
        tx,
      );
    });

    const remark = dto?.note ? ` Finance note: ${dto.note}` : '';
    // Next hand-off: the Managing Director (and CEO) take it from here.
    await this.tell(
      await this.userIdsWithRoles(RELEASE_ROLE_CODES),
      {
        type: 'sales_order.awaiting_release',
        title: `Order ${order.orderNumber} approved - release it for delivery`,
        body: `${order.customer?.name ?? 'A customer'}, ${money(order.totalAmount)}. Approved by the Finance Director; choose a warehouse and release it to the Warehouse Supervisor.${remark}`,
      },
      id,
      actor.id,
    );
    await this.tell(
      [order.submittedById],
      { type: 'sales_order.approved', title: `Order ${order.orderNumber} approved by Finance`, body: 'It is now with the Managing Director, who will release it to the Warehouse Supervisor for delivery.' },
      id,
      actor.id,
    );
    return this.findById(id);
  }

  /** Which warehouses could deliver this order right now - what the
   * Finance Director glances at while reviewing and the Managing Director
   * uses to choose where it leaves from. Available means in stock minus
   * what other orders already hold. */
  async availability(id: string) {
    const order = await this.findById(id);
    const warehouses = await this.prisma.warehouse.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
    const rows = [];
    for (const w of warehouses) {
      const lines = [];
      for (const item of order.items) {
        const available = await this.availableToSell(w.id, item.productId, item.packagingSizeId);
        lines.push({
          itemId: item.id,
          product: item.product?.name ?? '',
          size: item.packagingSize?.label ?? '',
          requestedBags: item.bagCount,
          availableBags: Math.max(available, 0),
          enough: available >= item.bagCount,
        });
      }
      rows.push({ warehouseId: w.id, warehouseName: w.name, canFulfillAll: lines.every((l) => l.enough), lines });
    }
    // Warehouses that can cover the whole order first.
    rows.sort((x, y) => Number(y.canFulfillAll) - Number(x.canFulfillAll) || x.warehouseName.localeCompare(y.warehouseName));
    return { orderId: order.id, preferredWarehouseId: order.preferredWarehouseId, warehouses: rows };
  }

  /** The Managing Director's step: with Finance's approval in hand, choose
   * the warehouse, lock the stock, and hand the delivery to the Warehouse
   * Supervisor as a real task. */
  async release(id: string, dto: ReleaseSalesOrderDto, actor: AuthenticatedUser) {
    const order = await this.findById(id);
    if (order.status !== 'APPROVED') {
      throw new BadRequestException(
        order.status === 'SUBMITTED'
          ? 'This order is still waiting for the Finance Director\'s approval.'
          : `Only orders approved by the Finance Director can be released for delivery (current status: ${order.status}).`,
      );
    }

    const warehouseId = dto?.allocatedWarehouseId ?? order.preferredWarehouseId;
    if (!warehouseId) {
      throw new BadRequestException('Choose the warehouse the rice will be delivered from.');
    }
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, name: true, isActive: true } });
    if (!warehouse || !warehouse.isActive) {
      throw new BadRequestException('That warehouse was not found or is not active.');
    }

    const shortfalls: string[] = [];
    for (const item of order.items) {
      const available = await this.availableToSell(warehouseId, item.productId, item.packagingSizeId);
      if (available < item.bagCount) {
        shortfalls.push(`${item.product.name} (${item.packagingSize.label}): requested ${item.bagCount} bags, only ${Math.max(available, 0)} available.`);
      }
    }
    if (shortfalls.length > 0) {
      throw new BadRequestException({
        message: `${warehouse.name} cannot cover this order right now: ${shortfalls.join(' ')} Choose another warehouse.`,
        errorCode: 'INSUFFICIENT_STOCK',
      });
    }

    await this.prisma.$transaction(async (tx: any) => {
      await this.transition(tx, id, 'APPROVED', { status: 'RESERVED', allocatedWarehouseId: warehouseId });

      for (const item of order.items) {
        await tx.stockReservation.create({
          data: {
            salesOrderId: order.id,
            salesOrderItemId: item.id,
            warehouseId,
            productId: item.productId,
            packagingSizeId: item.packagingSizeId,
            bagCount: item.bagCount,
            totalKg: item.totalKg,
            status: 'ACTIVE',
          },
        });
      }

      // The hand-off to the Warehouse Supervisor: a real, traceable task
      // (not just an order they might notice), linked back to this order.
      const year = new Date().getFullYear();
      const taskPrefix = `TASK-${year}-`;
      const taskCount = await tx.task.count({ where: { taskNumber: { startsWith: taskPrefix } } });
      await tx.task.create({
        data: {
          taskNumber: `${taskPrefix}${String(taskCount + 1).padStart(6, '0')}`,
          title: `Deliver order ${order.orderNumber}`,
          description:
            `${order.items.length} item(s), ${Number(order.totalKg).toLocaleString()} KG for ${order.customer?.name ?? 'the customer'}, ` +
            `from ${warehouse.name}. Delivery: ${order.deliveryLocation ?? 'see the order'}.` +
            (dto?.note ? ` Instruction: ${dto.note}` : ''),
          warehouseId,
          assignedRoleCode: DELIVERY_ROLE_CODES[0],
          salesOrderId: order.id,
          dueDate: order.requestedDeliveryDate,
          createdById: actor.id,
        },
      });

      await this.audit.record(
        { userId: actor.id, action: 'sales_order.release', entity: 'SalesOrder', entityId: id, afterValue: { status: 'RESERVED', warehouseId, note: dto?.note ?? null } },
        tx,
      );
    });

    const managers = await this.prisma.warehouseManager.findMany({ where: { warehouseId }, select: { userId: true } });
    await this.tell(
      await this.userIdsWithRoles(DELIVERY_ROLE_CODES),
      {
        type: 'sales_order.delivery_assigned',
        title: `Deliver order ${order.orderNumber}`,
        body: `${order.customer?.name ?? 'A customer'}: ${Number(order.totalKg).toLocaleString()} KG from ${warehouse.name}, delivery to ${order.deliveryLocation ?? 'the address on the order'}.${dto?.note ? ` Instruction: ${dto.note}` : ''}`,
      },
      id,
      actor.id,
    );
    await this.tell(
      managers.map((m: { userId: string }) => m.userId),
      { type: 'sales_order.delivery_from_your_warehouse', title: `Order ${order.orderNumber} will be delivered from your warehouse`, body: 'The Warehouse Supervisor is coordinating the delivery. The stock is reserved.' },
      id,
      actor.id,
    );
    await this.tell(
      [order.submittedById],
      { type: 'sales_order.released', title: `Order ${order.orderNumber} released for delivery`, body: `From ${warehouse.name}. The Warehouse Supervisor is arranging the delivery.` },
      id,
      actor.id,
    );
    return this.findById(id);
  }

  async reject(id: string, dto: RejectSalesOrderDto, actor: AuthenticatedUser) {
    const order = await this.findById(id);
    if (order.status !== 'SUBMITTED') {
      throw new BadRequestException(`Only SUBMITTED orders can be rejected (current status: ${order.status}).`);
    }
    if (order.submittedById === actor.id) {
      throw new ForbiddenException('You cannot reject your own sales order.');
    }

    const updated = await this.prisma.salesOrder.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: dto.reason } });
    await this.audit.record({
      userId: actor.id,
      action: 'sales_order.reject',
      entity: 'SalesOrder',
      entityId: id,
      afterValue: { status: 'REJECTED' },
      reason: dto.reason,
    });
    await this.tell(
      [order.submittedById],
      { type: 'sales_order.rejected', title: `Order ${order.orderNumber} was not approved`, body: `Reason given: ${dto.reason}` },
      id,
      actor.id,
    );
    return this.findById(updated.id);
  }

  async fulfill(id: string, actor: AuthenticatedUser) {
    const order = await this.findById(id);
    if (order.status !== 'RESERVED') {
      throw new BadRequestException(
        order.status === 'APPROVED'
          ? 'This order has not been released for delivery yet. The Managing Director releases it to the Warehouse Supervisor first.'
          : `Only RESERVED orders can be fulfilled (current status: ${order.status}).`,
      );
    }
    if (!order.allocatedWarehouseId) {
      throw new BadRequestException('Order has no allocated warehouse.');
    }

    const updated = await this.prisma.$transaction(async (tx: any) => {
      for (const reservation of order.reservations.filter((r: any) => r.status === 'ACTIVE')) {
        await this.ledger.recordTransaction(tx, {
          type: 'PACKAGED_RICE_SOLD',
          sourceLocationType: LocationType.WAREHOUSE,
          sourceLocationId: order.allocatedWarehouseId!,
          destLocationType: LocationType.CUSTOMER,
          destLocationId: order.customerId,
          productId: reservation.productId,
          packagingSizeId: reservation.packagingSizeId,
          quantityKg: Number(reservation.totalKg),
          bagCount: reservation.bagCount,
          referenceDocument: order.orderNumber,
          userId: actor.id,
        });

        await this.ledger.adjustBalance(
          tx,
          { locationType: LocationType.WAREHOUSE, locationId: order.allocatedWarehouseId!, productId: reservation.productId, packagingSizeId: reservation.packagingSizeId },
          -Number(reservation.totalKg),
          -reservation.bagCount,
        );
        await this.ledger.adjustBalance(
          tx,
          { locationType: LocationType.CUSTOMER, locationId: order.customerId, productId: reservation.productId, packagingSizeId: reservation.packagingSizeId },
          Number(reservation.totalKg),
          reservation.bagCount,
        );

        await tx.stockReservation.update({ where: { id: reservation.id }, data: { status: 'CONSUMED' } });
      }

      const fulfilledOrder = await tx.salesOrder.update({ where: { id }, data: { status: 'FULFILLED', fulfilledAt: new Date() } });

      // The delivery task has done its job; close it so it leaves the
      // Warehouse Supervisor's list rather than sitting there forever.
      await tx.task.updateMany({
        where: { salesOrderId: id, status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'SUBMITTED', 'REVIEW'] } },
        data: { status: 'COMPLETED', completedById: actor.id, completedAt: new Date() },
      });

      await this.audit.record(
        { userId: actor.id, action: 'sales_order.fulfill', entity: 'SalesOrder', entityId: id, afterValue: { status: 'FULFILLED' } },
        tx,
      );

      return fulfilledOrder;
    });

    // Delivered: tell everyone who handled the order, so it is closed
    // out for each of them. Finance needs to know to invoice it.
    await this.tell(
      [order.submittedById, ...(await this.userIdsWithRoles([...FINANCE_REVIEW_ROLE_CODES, ...RELEASE_ROLE_CODES]))],
      { type: 'sales_order.delivered', title: `Order ${order.orderNumber} delivered`, body: `${order.customer?.name ?? 'The customer'} has received ${Number(order.totalKg).toLocaleString()} KG.` },
      id,
      actor.id,
    );
    return this.findById(updated.id);
  }

  async cancel(id: string, actor: AuthenticatedUser) {
    const order = await this.findById(id);
    if (!['DRAFT', 'SUBMITTED', 'APPROVED', 'RESERVED'].includes(order.status)) {
      throw new BadRequestException(`Orders in status ${order.status} cannot be cancelled.`);
    }

    const updated = await this.prisma.$transaction(async (tx: any) => {
      await tx.stockReservation.updateMany({
        where: { salesOrderId: id, status: 'ACTIVE' },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      // Close any delivery task for it: nobody should still be chasing a
      // delivery for an order that no longer exists.
      await tx.task.updateMany({
        where: { salesOrderId: id, status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] } },
        data: { status: 'CANCELLED' },
      });
      const cancelled = await tx.salesOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.record(
        { userId: actor.id, action: 'sales_order.cancel', entity: 'SalesOrder', entityId: id, afterValue: { status: 'CANCELLED' } },
        tx,
      );
      return cancelled;
    });

    // Tell whoever currently holds the order that it is off.
    const holders =
      order.status === 'SUBMITTED' ? FINANCE_REVIEW_ROLE_CODES : order.status === 'APPROVED' ? RELEASE_ROLE_CODES : order.status === 'RESERVED' ? DELIVERY_ROLE_CODES : [];
    if (holders.length > 0) {
      await this.tell(
        await this.userIdsWithRoles(holders),
        { type: 'sales_order.cancelled', title: `Order ${order.orderNumber} was cancelled`, body: 'The Sales Officer cancelled it. There is nothing further to do for this order.' },
        id,
        actor.id,
      );
    }
    return this.findById(updated.id);
  }

  /** Section 26's traceability, final link: which packaging batch(es) a
   * fulfilled line item actually came from. Deliberately its own small
   * endpoint, separate from fulfill() itself - fulfillment is about
   * moving stock and closing the order; this is optional annotation
   * added after the fact once someone actually knows the answer, and
   * keeping it separate means fulfill() doesn't need a more complex
   * per-item input shape just to support an optional traceability note. */
  async annotateFulfillmentSource(itemId: string, sourceReferenceNumbers: string[], actor: AuthenticatedUser) {
    const item = await this.prisma.salesOrderItem.findUnique({ where: { id: itemId }, include: { salesOrder: true } });
    if (!item) throw new NotFoundException('Sales order item not found.');
    if (item.salesOrder.status !== 'FULFILLED') {
      throw new BadRequestException('Only items on a fulfilled order can have their source annotated.');
    }

    const updated = await this.prisma.salesOrderItem.update({
      where: { id: itemId },
      data: { fulfilledFromReferenceNumbers: sourceReferenceNumbers },
    });
    await this.audit.record({
      userId: actor.id,
      action: 'sales_order_item.annotate_fulfillment_source',
      entity: 'SalesOrderItem',
      entityId: itemId,
      afterValue: { sourceReferenceNumbers },
    });
    return updated;
  }
}
