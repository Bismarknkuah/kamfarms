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
import { PERMISSIONS } from '../common/constants/permissions';
import { scopedLocationIds } from '../common/utils/scope.util';
import { AssignWarehouseDto } from './dto/assign-warehouse.dto';
import { DispatchSalesOrderDto } from './dto/dispatch-sales-order.dto';
import { StepNoteDto } from './dto/step-note.dto';
import { CancelSalesOrderDto } from './dto/cancel-sales-order.dto';
import { UploadReceiptDto } from './dto/upload-receipt.dto';
import { OrderVisibility, canSee, orderVisibility, visibilityWhere } from './order-visibility';
import { actorSnapshot } from './order-events';
import { MAX_RECEIPTS_PER_ORDER, RECEIPT_MAX_BYTES, ReceiptUpload, detectReceipt, isHeic, receiptFileName } from './receipt-file.util';

// Who hears about each step of a sale. Role codes, the same way every
// other service here finds its recipients.
export const FINANCE_REVIEW_ROLE_CODES = ['FINANCE_DIRECTOR'];
export const RELEASE_ROLE_CODES = ['MD', 'CEO'];
export const DELIVERY_ROLE_CODES = ['WAREHOUSE_SUPERVISOR']; // the Warehouse Supervisor assigns a released order to a warehouse
export const PROCESS_ROLE_CODES = ['WAREHOUSE_MANAGER']; // the assigned warehouse's team prepares and sends it

const money = (n: unknown) => `GHS ${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/**
 * A sale's journey, one accountable person at each step, every step written to the order's activity trail:
 *
 *   Sales Officer        creates, attaches the payment receipt, submits   DRAFT      -> SUBMITTED
 *   Finance Director     reviews the details; approves or rejects*        SUBMITTED  -> APPROVED  (or REJECTED)
 *   MD / CEO             reviews the details; releases or rejects*        APPROVED   -> RELEASED  (or REJECTED)
 *   Warehouse Supervisor assigns a warehouse (its stock is reserved)      RELEASED   -> RESERVED
 *   Warehouse team       starts processing (picking and packing)          RESERVED   -> PROCESSING
 *   Warehouse team       dispatches: the order is "on track"              PROCESSING -> ON_TRACK
 *   Warehouse team       confirms it was delivered (stock leaves)         ON_TRACK   -> FULFILLED
 *
 *   * a rejection must always carry a comment.
 *
 * Whoever holds the order next is notified at every step, and every transition is guarded so two people can never act on
 * the same order at once. A Sales Officer sees only their own orders (order-visibility.ts).
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

  // ───────────── who may see what, and the activity trail ─────────────

  /** The rule that keeps each Sales Officer's work their own (order-visibility.ts). With no actor (internal use) nothing is hidden. */
  private visibility(actor?: AuthenticatedUser): OrderVisibility {
    return actor ? orderVisibility(actor) : { kind: 'all' };
  }

  async list(filters: { status?: string; customerId?: string }, actor?: AuthenticatedUser) {
    return this.prisma.salesOrder.findMany({
      where: { AND: [visibilityWhere(this.visibility(actor)), { status: filters.status as any, customerId: filters.customerId }] },
      include: {
        customer: true,
        salesOfficer: true,
        approvedBy: true,
        allocatedWarehouse: true,
        tasks: { include: { createdBy: true } },
        items: { include: { product: true, packagingSize: true } },
        // The latest step, so a list can say how long an order has been where it is.
        events: { where: { toStatus: { not: null } }, orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { receipts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, actor?: AuthenticatedUser) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        salesOfficer: true,
        preferredWarehouse: true,
        allocatedWarehouse: true,
        approvedBy: true,
        tasks: { include: { createdBy: true } },
        items: { include: { product: true, packagingSize: true } },
        reservations: true,
        // Who did what, in order: the trail anyone who may see the order can read.
        events: { orderBy: { createdAt: 'asc' } },
        // Everything about a receipt except the file itself, which is fetched on its own.
        receipts: {
          select: { id: true, fileName: true, mimeType: true, sizeBytes: true, note: true, uploadedById: true, uploadedByName: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    // An order outside the person's reach is reported as not found, so its existence is not revealed either.
    if (!order || (actor && !canSee(orderVisibility(actor), order))) throw new NotFoundException('Sales order not found.');
    return order;
  }

  /** One line in the order's activity trail: who did it, in which role, when, and what they said. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async record(client: any, orderId: string, actor: AuthenticatedUser, input: { type: string; fromStatus?: string; toStatus?: string; comment?: string | null; meta?: Record<string, unknown> }) {
    await client.salesOrderEvent.create({
      data: {
        salesOrderId: orderId,
        type: input.type,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        ...actorSnapshot(actor),
        comment: input.comment?.trim() || null,
        meta: input.meta,
      },
    });
  }

  /** A warehouse's team works only on orders assigned to their own warehouse; the Supervisor and administrators on any. */
  private assertWarehouseDuty(actor: AuthenticatedUser, order: { allocatedWarehouseId?: string | null }) {
    const scope = scopedLocationIds(actor, 'WAREHOUSE');
    if (scope.isGlobal) return;
    if (!order.allocatedWarehouseId || !scope.ids.includes(order.allocatedWarehouseId)) {
      throw new ForbiddenException('This order is assigned to a different warehouse. Only that warehouse\'s team can work on it.');
    }
  }

  private officerName(order: { salesOfficer?: { firstName?: string; lastName?: string } | null }) {
    return `${order.salesOfficer?.firstName ?? ''} ${order.salesOfficer?.lastName ?? ''}`.trim() || 'the Sales Officer';
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
      await this.record(tx, created.id, actor, { type: 'CREATED', toStatus: 'DRAFT' });
      return created;
    });

    return this.findById(order.id, actor);
  }

  async submit(id: string, actor: AuthenticatedUser) {
    const order = await this.findById(id, actor);
    if (order.status !== 'DRAFT') {
      throw new BadRequestException(`Only DRAFT orders can be submitted (current status: ${order.status}).`);
    }
    if (order.submittedById !== actor.id) {
      throw new ForbiddenException('Only the original submitter can submit this order.');
    }

    await this.prisma.$transaction(async (tx: any) => {
      await this.transition(tx, id, 'DRAFT', { status: 'SUBMITTED', submittedAt: new Date() });
      await this.record(tx, id, actor, { type: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' });
      await this.audit.record({ userId: actor.id, action: 'sales_order.submit', entity: 'SalesOrder', entityId: id, afterValue: { status: 'SUBMITTED' } }, tx);
    });

    // The request to the Finance Director: the first hand-off in the chain.
    await this.tell(
      await this.userIdsWithRoles(FINANCE_REVIEW_ROLE_CODES),
      {
        type: 'sales_order.awaiting_finance',
        title: `Sales order ${order.orderNumber} needs your review`,
        body: `${order.customer?.name ?? 'A customer'}: ${Number(order.totalKg).toLocaleString()} KG, ${money(order.totalAmount)}. Submitted by ${this.officerName(order)}.`,
      },
      id,
      actor.id,
    );
    return this.findById(id, actor);
  }

  /** Kept for orders that already carry a link. New receipts are uploaded as files (addReceipt). */
  async attachReceipt(id: string, dto: AttachReceiptDto, actor: AuthenticatedUser) {
    const order = await this.findById(id, actor);
    if (order.submittedById !== actor.id) {
      throw new ForbiddenException('Only the original submitter can attach a receipt to this order.');
    }
    const updated = await this.prisma.salesOrder.update({ where: { id }, data: { receiptUrl: dto.receiptUrl } });
    await this.audit.record({ userId: actor.id, action: 'sales_order.attach_receipt', entity: 'SalesOrder', entityId: id, afterValue: { receiptUrl: dto.receiptUrl } });
    return this.findById(updated.id, actor);
  }

  // ───────────── payment receipts: uploaded from a phone or computer ─────────────

  /** Only the Sales Officer who made the order adds receipts (their evidence for their own order). Allowed at any open stage:
   * before submitting, to support the approval, or later as a correction. */
  async addReceipt(id: string, file: ReceiptUpload | undefined, dto: UploadReceiptDto, actor: AuthenticatedUser) {
    const order = await this.findById(id, actor);
    if (order.submittedById !== actor.id) {
      throw new ForbiddenException('Only the Sales Officer who made this order can add a receipt to it.');
    }
    if (['CANCELLED', 'REJECTED'].includes(order.status)) {
      throw new BadRequestException('This order is closed, so a receipt cannot be added to it.');
    }
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Choose a photo or a PDF of the receipt to upload.');
    }
    if (file.buffer.length > RECEIPT_MAX_BYTES) {
      throw new BadRequestException(`That file is too large. A receipt can be up to ${Math.round(RECEIPT_MAX_BYTES / (1024 * 1024))} MB.`);
    }
    if (isHeic(file.buffer)) {
      throw new BadRequestException('That photo is in HEIC format, which cannot be shown on every device. Take it again as a JPEG, or upload a screenshot of the receipt.');
    }
    const kind = detectReceipt(file.buffer);
    if (!kind) {
      throw new BadRequestException('Only photos (JPEG, PNG or WebP) and PDF files can be uploaded as a receipt.');
    }
    const count = await this.prisma.salesReceipt.count({ where: { salesOrderId: id } });
    if (count >= MAX_RECEIPTS_PER_ORDER) {
      throw new BadRequestException(`An order can hold up to ${MAX_RECEIPTS_PER_ORDER} receipt files.`);
    }

    const who = actorSnapshot(actor);
    const fileName = receiptFileName(file.originalname, kind.ext);
    const saved = await this.prisma.salesReceipt.create({
      data: {
        salesOrderId: id,
        fileName,
        mimeType: kind.mime,
        sizeBytes: file.buffer.length,
        data: file.buffer,
        note: dto?.note?.trim() || null,
        uploadedById: actor.id,
        uploadedByName: who.actorName,
      },
      select: { id: true },
    });
    await this.record(this.prisma, id, actor, { type: 'RECEIPT_ADDED', comment: dto?.note, meta: { receiptId: saved.id, fileName } });
    await this.audit.record({ userId: actor.id, action: 'sales_order.add_receipt', entity: 'SalesOrder', entityId: id, afterValue: { receiptId: saved.id, fileName, sizeBytes: file.buffer.length } });
    return this.findById(id, actor);
  }

  /** The file itself, for anyone who may see the order (so the Finance Director and MD can open it while deciding). */
  async getReceiptFile(id: string, receiptId: string, actor: AuthenticatedUser) {
    await this.findById(id, actor);
    const receipt = await this.prisma.salesReceipt.findFirst({ where: { id: receiptId, salesOrderId: id } });
    if (!receipt) throw new NotFoundException('Receipt not found.');
    return { fileName: receipt.fileName as string, mimeType: receipt.mimeType as string, data: receipt.data as Buffer };
  }

  /** A receipt can be taken off only while the order is still a draft. Once it has been submitted it is part of the record. */
  async removeReceipt(id: string, receiptId: string, actor: AuthenticatedUser) {
    const order = await this.findById(id, actor);
    if (order.submittedById !== actor.id) {
      throw new ForbiddenException('Only the Sales Officer who made this order can remove its receipts.');
    }
    if (order.status !== 'DRAFT') {
      throw new BadRequestException('A receipt cannot be removed once the order has been submitted: it is part of the record. Add a corrected one instead.');
    }
    const receipt = await this.prisma.salesReceipt.findFirst({ where: { id: receiptId, salesOrderId: id }, select: { id: true, fileName: true } });
    if (!receipt) throw new NotFoundException('Receipt not found.');
    await this.prisma.salesReceipt.delete({ where: { id: receiptId } });
    await this.record(this.prisma, id, actor, { type: 'RECEIPT_REMOVED', meta: { fileName: receipt.fileName } });
    await this.audit.record({ userId: actor.id, action: 'sales_order.remove_receipt', entity: 'SalesOrder', entityId: id, afterValue: { receiptId } });
    return this.findById(id, actor);
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

  /** The Finance Director's decision: is this a sale the company is happy to make? Purely financial: it picks no warehouse and
   * touches no stock. */
  async approve(id: string, dto: ApproveSalesOrderDto, actor: AuthenticatedUser) {
    const order = await this.findById(id, actor);
    if (order.status !== 'SUBMITTED') {
      throw new BadRequestException(`Only SUBMITTED orders can be approved (current status: ${order.status}).`);
    }
    if (order.submittedById === actor.id) {
      throw new ForbiddenException('You cannot approve your own sales order.');
    }

    await this.prisma.$transaction(async (tx: any) => {
      await this.transition(tx, id, 'SUBMITTED', { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() });
      await this.record(tx, id, actor, { type: 'APPROVED', fromStatus: 'SUBMITTED', toStatus: 'APPROVED', comment: dto?.note });
      await this.audit.record(
        { userId: actor.id, action: 'sales_order.approve', entity: 'SalesOrder', entityId: id, afterValue: { status: 'APPROVED', note: dto?.note ?? null } },
        tx,
      );
    });

    const remark = dto?.note ? ` Finance note: ${dto.note}` : '';
    // Next hand-off: the Managing Director (and CEO).
    await this.tell(
      await this.userIdsWithRoles(RELEASE_ROLE_CODES),
      {
        type: 'sales_order.awaiting_release',
        title: `Order ${order.orderNumber} approved - review and release it`,
        body: `${order.customer?.name ?? 'A customer'}, ${money(order.totalAmount)}. Approved by the Finance Director. Open it, check the details, then release it to the Warehouse Supervisor.${remark}`,
      },
      id,
      actor.id,
    );
    await this.tell(
      [order.submittedById],
      { type: 'sales_order.approved', title: `Order ${order.orderNumber} approved by Finance`, body: 'It is now with the Managing Director for release.' },
      id,
      actor.id,
    );
    return this.findById(id, actor);
  }

  /** Which warehouses could deliver this order right now - what the
   * Finance Director and Managing Director glance at while reviewing and the
   * Warehouse Supervisor uses to choose where it leaves from. Available means in stock minus
   * what other orders already hold. */
  async availability(id: string, actor?: AuthenticatedUser) {
    const order = await this.findById(id, actor);
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

  /** The Managing Director's step: with Finance's approval in hand, and having looked at the details, release the order to the
   * warehouse side. The Warehouse Supervisor then chooses which warehouse sends it. */
  async release(id: string, dto: ReleaseSalesOrderDto, actor: AuthenticatedUser) {
    const order = await this.findById(id, actor);
    if (order.status !== 'APPROVED') {
      throw new BadRequestException(
        order.status === 'SUBMITTED'
          ? 'This order is still waiting for the Finance Director\'s approval.'
          : `Only orders approved by the Finance Director can be released for delivery (current status: ${order.status}).`,
      );
    }

    await this.prisma.$transaction(async (tx: any) => {
      await this.transition(tx, id, 'APPROVED', { status: 'RELEASED' });
      await this.record(tx, id, actor, { type: 'RELEASED', fromStatus: 'APPROVED', toStatus: 'RELEASED', comment: dto?.note });
      await this.audit.record(
        { userId: actor.id, action: 'sales_order.release', entity: 'SalesOrder', entityId: id, afterValue: { status: 'RELEASED', note: dto?.note ?? null } },
        tx,
      );
    });

    const instruction = dto?.note ? ` Instruction: ${dto.note}` : '';
    await this.tell(
      await this.userIdsWithRoles(DELIVERY_ROLE_CODES),
      {
        type: 'sales_order.awaiting_assignment',
        title: `Order ${order.orderNumber} released - assign a warehouse`,
        body: `${order.customer?.name ?? 'A customer'}: ${Number(order.totalKg).toLocaleString()} KG, delivery to ${order.deliveryLocation ?? 'the address on the order'}. Released by the Managing Director. Choose the warehouse that will prepare and send it.${instruction}`,
      },
      id,
      actor.id,
    );
    await this.tell(
      [order.submittedById],
      { type: 'sales_order.released', title: `Order ${order.orderNumber} released by the Managing Director`, body: 'The Warehouse Supervisor is choosing the warehouse that will send it.' },
      id,
      actor.id,
    );
    return this.findById(id, actor);
  }

  /** Rejecting: Finance can reject an order waiting for Finance, the Managing Director one waiting for release. Either way the
   * reason is mandatory, and it is shown to the Sales Officer and written to the trail. */
  async reject(id: string, dto: RejectSalesOrderDto, actor: AuthenticatedUser) {
    const order = await this.findById(id, actor);
    const atFinance = order.status === 'SUBMITTED';
    const atMd = order.status === 'APPROVED';
    if (!atFinance && !atMd) {
      throw new BadRequestException(`Only orders waiting for the Finance Director or the Managing Director can be rejected (current status: ${order.status}).`);
    }
    if (!actor.permissionCodes?.has(atFinance ? PERMISSIONS.SALES_APPROVE : PERMISSIONS.SALES_RELEASE)) {
      throw new ForbiddenException(atFinance ? 'Only the Finance Director can reject an order at this stage.' : 'Only the Managing Director or CEO can reject an order at this stage.');
    }
    if (order.submittedById === actor.id) {
      throw new ForbiddenException('You cannot reject your own sales order.');
    }
    const reason = (dto?.reason ?? '').trim();
    if (reason.length < 3) {
      throw new BadRequestException('A comment is required when rejecting: say why.');
    }

    await this.prisma.$transaction(async (tx: any) => {
      await this.transition(tx, id, order.status, { status: 'REJECTED', rejectionReason: reason });
      await this.record(tx, id, actor, { type: 'REJECTED', fromStatus: order.status, toStatus: 'REJECTED', comment: reason, meta: { stage: atFinance ? 'FINANCE' : 'MD' } });
      await this.audit.record(
        { userId: actor.id, action: 'sales_order.reject', entity: 'SalesOrder', entityId: id, afterValue: { status: 'REJECTED' }, reason },
        tx,
      );
    });

    const who = atFinance ? 'the Finance Director' : 'the Managing Director';
    await this.tell(
      [order.submittedById],
      { type: 'sales_order.rejected', title: `Order ${order.orderNumber} was not approved`, body: `Rejected by ${who}. Reason given: ${reason}` },
      id,
      actor.id,
    );
    if (atMd) {
      // Finance approved it, so Finance is told it did not go through.
      await this.tell(
        await this.userIdsWithRoles(FINANCE_REVIEW_ROLE_CODES),
        { type: 'sales_order.rejected_after_approval', title: `Order ${order.orderNumber} was rejected by the Managing Director`, body: `Reason given: ${reason}` },
        id,
        actor.id,
      );
    }
    return this.findById(id, actor);
  }

  /** The Warehouse Supervisor's step: choose the warehouse that will prepare and send the order. Its stock is reserved there, and
   * the warehouse's team is told. While the warehouse has not started, the Supervisor can still move it to another one. */
  async assignWarehouse(id: string, dto: AssignWarehouseDto, actor: AuthenticatedUser) {
    const order = await this.findById(id, actor);
    if (!['RELEASED', 'RESERVED'].includes(order.status)) {
      throw new BadRequestException(
        order.status === 'SUBMITTED'
          ? 'This order is still waiting for the Finance Director\'s approval.'
          : order.status === 'APPROVED'
            ? 'This order has not been released by the Managing Director yet.'
            : `Only released orders can be assigned to a warehouse (current status: ${order.status}).`,
      );
    }
    const reassign = order.status === 'RESERVED';
    if (reassign && order.allocatedWarehouseId === dto.warehouseId) {
      throw new BadRequestException('The order is already assigned to that warehouse.');
    }
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId }, select: { id: true, name: true, isActive: true } });
    if (!warehouse || !warehouse.isActive) {
      throw new BadRequestException('That warehouse was not found or is not active.');
    }

    const shortfalls: string[] = [];
    for (const item of order.items) {
      const available = await this.availableToSell(warehouse.id, item.productId, item.packagingSizeId);
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
      await this.transition(tx, id, order.status, { status: 'RESERVED', allocatedWarehouseId: warehouse.id });

      if (reassign) {
        // Moved before the first warehouse started: its hold on the stock and its task end.
        await tx.stockReservation.updateMany({ where: { salesOrderId: id, status: 'ACTIVE' }, data: { status: 'RELEASED', releasedAt: new Date() } });
        await tx.task.updateMany({ where: { salesOrderId: id, status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] } }, data: { status: 'CANCELLED' } });
      }

      for (const item of order.items) {
        await tx.stockReservation.create({
          data: {
            salesOrderId: order.id,
            salesOrderItemId: item.id,
            warehouseId: warehouse.id,
            productId: item.productId,
            packagingSizeId: item.packagingSizeId,
            bagCount: item.bagCount,
            totalKg: item.totalKg,
            status: 'ACTIVE',
          },
        });
      }

      // The hand-off to the warehouse's team: a real, traceable task linked back to this order.
      const year = new Date().getFullYear();
      const taskPrefix = `TASK-${year}-`;
      const taskCount = await tx.task.count({ where: { taskNumber: { startsWith: taskPrefix } } });
      await tx.task.create({
        data: {
          taskNumber: `${taskPrefix}${String(taskCount + 1).padStart(6, '0')}`,
          title: `Process order ${order.orderNumber}`,
          description:
            `${order.items.length} item(s), ${Number(order.totalKg).toLocaleString()} KG for ${order.customer?.name ?? 'the customer'}, ` +
            `from ${warehouse.name}. Delivery: ${order.deliveryLocation ?? 'see the order'}.` +
            (dto?.note ? ` Instruction: ${dto.note}` : ''),
          warehouseId: warehouse.id,
          assignedRoleCode: PROCESS_ROLE_CODES[0],
          salesOrderId: order.id,
          dueDate: order.requestedDeliveryDate,
          createdById: actor.id,
        },
      });

      await this.record(tx, id, actor, {
        type: reassign ? 'REASSIGNED' : 'ASSIGNED',
        fromStatus: order.status,
        toStatus: 'RESERVED',
        comment: dto?.note,
        meta: { warehouseId: warehouse.id, warehouseName: warehouse.name },
      });
      await this.audit.record(
        { userId: actor.id, action: reassign ? 'sales_order.reassign_warehouse' : 'sales_order.assign_warehouse', entity: 'SalesOrder', entityId: id, afterValue: { status: 'RESERVED', warehouseId: warehouse.id, note: dto?.note ?? null } },
        tx,
      );
    });

    const managers = await this.prisma.warehouseManager.findMany({ where: { warehouseId: warehouse.id }, select: { userId: true } });
    await this.tell(
      managers.map((m: { userId: string }) => m.userId),
      {
        type: 'sales_order.assigned_to_your_warehouse',
        title: `Order ${order.orderNumber} is assigned to your warehouse`,
        body: `${order.customer?.name ?? 'A customer'}: ${Number(order.totalKg).toLocaleString()} KG, delivery to ${order.deliveryLocation ?? 'the address on the order'}. Start processing it when you are ready.${dto?.note ? ` Instruction: ${dto.note}` : ''}`,
      },
      id,
      actor.id,
    );
    await this.tell(
      [order.submittedById, ...(await this.userIdsWithRoles(RELEASE_ROLE_CODES))],
      { type: 'sales_order.assigned', title: `Order ${order.orderNumber} assigned to ${warehouse.name}`, body: 'The warehouse team will process it next.' },
      id,
      actor.id,
    );
    return this.findById(id, actor);
  }

  /** The assigned warehouse starts picking and packing. */
  async startProcessing(id: string, dto: StepNoteDto, actor: AuthenticatedUser) {
    const order = await this.findById(id, actor);
    if (order.status !== 'RESERVED') {
      throw new BadRequestException(
        order.status === 'RELEASED'
          ? 'The Warehouse Supervisor has not assigned this order to a warehouse yet.'
          : `Only orders assigned to a warehouse can be processed (current status: ${order.status}).`,
      );
    }
    this.assertWarehouseDuty(actor, order);

    await this.prisma.$transaction(async (tx: any) => {
      await this.transition(tx, id, 'RESERVED', { status: 'PROCESSING' });
      await tx.task.updateMany({ where: { salesOrderId: id, status: 'TODO' }, data: { status: 'IN_PROGRESS' } });
      await this.record(tx, id, actor, { type: 'PROCESSING', fromStatus: 'RESERVED', toStatus: 'PROCESSING', comment: dto?.note });
      await this.audit.record({ userId: actor.id, action: 'sales_order.start_processing', entity: 'SalesOrder', entityId: id, afterValue: { status: 'PROCESSING' } }, tx);
    });

    await this.tell(
      [order.submittedById, ...(await this.userIdsWithRoles([...DELIVERY_ROLE_CODES, ...RELEASE_ROLE_CODES]))],
      { type: 'sales_order.processing', title: `Order ${order.orderNumber} is being prepared`, body: `${order.allocatedWarehouse?.name ?? 'The warehouse'} has started picking and packing it.` },
      id,
      actor.id,
    );
    return this.findById(id, actor);
  }

  /** The order has left the warehouse: "on track". What the driver, vehicle and expected arrival are is what the Sales Officer
   * can tell the customer. */
  async dispatch(id: string, dto: DispatchSalesOrderDto, actor: AuthenticatedUser) {
    const order = await this.findById(id, actor);
    if (order.status !== 'PROCESSING') {
      throw new BadRequestException(
        order.status === 'RESERVED'
          ? 'Start processing the order first, then mark it on track once it has left.'
          : `Only orders being processed can be marked on track (current status: ${order.status}).`,
      );
    }
    this.assertWarehouseDuty(actor, order);

    const tracking = {
      driverName: dto?.driverName?.trim() || null,
      vehicleNumber: dto?.vehicleNumber?.trim() || null,
      expectedDeliveryAt: dto?.expectedDeliveryAt ?? null,
    };
    await this.prisma.$transaction(async (tx: any) => {
      await this.transition(tx, id, 'PROCESSING', { status: 'ON_TRACK' });
      await this.record(tx, id, actor, { type: 'ON_TRACK', fromStatus: 'PROCESSING', toStatus: 'ON_TRACK', comment: dto?.note, meta: tracking });
      await this.audit.record({ userId: actor.id, action: 'sales_order.dispatch', entity: 'SalesOrder', entityId: id, afterValue: { status: 'ON_TRACK', ...tracking } }, tx);
    });

    const detail = [tracking.driverName && `Driver ${tracking.driverName}`, tracking.vehicleNumber && `vehicle ${tracking.vehicleNumber}`].filter(Boolean).join(', ');
    await this.tell(
      [order.submittedById, ...(await this.userIdsWithRoles([...DELIVERY_ROLE_CODES, ...RELEASE_ROLE_CODES]))],
      {
        type: 'sales_order.on_track',
        title: `Order ${order.orderNumber} is on track`,
        body: `It has left ${order.allocatedWarehouse?.name ?? 'the warehouse'} for ${order.deliveryLocation ?? 'the customer'}.${detail ? ` ${detail}.` : ''}`,
      },
      id,
      actor.id,
    );
    return this.findById(id, actor);
  }

  /** The delivery is confirmed: the stock leaves the warehouse and the sale is complete. */
  async fulfill(id: string, dto: StepNoteDto, actor: AuthenticatedUser) {
    const order = await this.findById(id, actor);
    if (order.status !== 'ON_TRACK') {
      throw new BadRequestException(
        ['RESERVED', 'PROCESSING'].includes(order.status)
          ? 'This order has not been sent yet. Mark it on track once it has left the warehouse, then confirm delivery.'
          : order.status === 'RELEASED'
            ? 'The Warehouse Supervisor has not assigned this order to a warehouse yet.'
            : order.status === 'APPROVED'
              ? 'This order has not been released for delivery yet. The Managing Director releases it first.'
              : `Only orders that are on track can be marked delivered (current status: ${order.status}).`,
      );
    }
    if (!order.allocatedWarehouseId) {
      throw new BadRequestException('Order has no allocated warehouse.');
    }
    this.assertWarehouseDuty(actor, order);

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

      // The delivery task has done its job; close it so it leaves the team's list rather than sitting there forever.
      await tx.task.updateMany({
        where: { salesOrderId: id, status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'SUBMITTED', 'REVIEW'] } },
        data: { status: 'COMPLETED', completedById: actor.id, completedAt: new Date() },
      });

      await this.record(tx, id, actor, { type: 'DELIVERED', fromStatus: 'ON_TRACK', toStatus: 'FULFILLED', comment: dto?.note });
      await this.audit.record(
        { userId: actor.id, action: 'sales_order.fulfill', entity: 'SalesOrder', entityId: id, afterValue: { status: 'FULFILLED' } },
        tx,
      );

      return fulfilledOrder;
    });

    // Delivered: tell everyone who handled the order, so it is closed out for each of them. Finance needs to know to invoice it.
    await this.tell(
      [order.submittedById, ...(await this.userIdsWithRoles([...FINANCE_REVIEW_ROLE_CODES, ...RELEASE_ROLE_CODES, ...DELIVERY_ROLE_CODES]))],
      {
        type: 'sales_order.delivered',
        title: `Order ${order.orderNumber} delivered`,
        body: `${order.customer?.name ?? 'The customer'} has received ${Number(order.totalKg).toLocaleString()} KG, ${money(order.totalAmount)}.${dto?.note ? ` Note: ${dto.note}` : ''}`,
      },
      id,
      actor.id,
    );
    return this.findById(updated.id, actor);
  }

  /** The Sales Officer who made the order (or the Managing Director) can cancel it until the warehouse has started on it. */
  async cancel(id: string, dto: CancelSalesOrderDto | undefined, actor: AuthenticatedUser) {
    const order = await this.findById(id, actor);
    if (!['DRAFT', 'SUBMITTED', 'APPROVED', 'RELEASED', 'RESERVED'].includes(order.status)) {
      throw new BadRequestException(`Orders in status ${order.status} cannot be cancelled.`);
    }
    if (order.submittedById !== actor.id && !actor.permissionCodes?.has(PERMISSIONS.SALES_RELEASE)) {
      throw new ForbiddenException('Only the Sales Officer who made this order, or the Managing Director, can cancel it.');
    }

    const updated = await this.prisma.$transaction(async (tx: any) => {
      await tx.stockReservation.updateMany({
        where: { salesOrderId: id, status: 'ACTIVE' },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      // Close any task for it: nobody should still be chasing a delivery for an order that no longer exists.
      await tx.task.updateMany({
        where: { salesOrderId: id, status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] } },
        data: { status: 'CANCELLED' },
      });
      const cancelled = await tx.salesOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.record(tx, id, actor, { type: 'CANCELLED', fromStatus: order.status, toStatus: 'CANCELLED', comment: dto?.reason });
      await this.audit.record(
        { userId: actor.id, action: 'sales_order.cancel', entity: 'SalesOrder', entityId: id, afterValue: { status: 'CANCELLED', reason: dto?.reason ?? null } },
        tx,
      );
      return cancelled;
    });

    // Tell whoever currently holds the order that it is off.
    let holders: string[] = [];
    if (order.status === 'SUBMITTED') holders = await this.userIdsWithRoles(FINANCE_REVIEW_ROLE_CODES);
    else if (order.status === 'APPROVED') holders = await this.userIdsWithRoles(RELEASE_ROLE_CODES);
    else if (order.status === 'RELEASED') holders = await this.userIdsWithRoles(DELIVERY_ROLE_CODES);
    else if (order.status === 'RESERVED') {
      const managers = order.allocatedWarehouseId ? await this.prisma.warehouseManager.findMany({ where: { warehouseId: order.allocatedWarehouseId }, select: { userId: true } }) : [];
      holders = [...(await this.userIdsWithRoles(DELIVERY_ROLE_CODES)), ...managers.map((m: { userId: string }) => m.userId)];
    }
    if (holders.length > 0) {
      await this.tell(
        holders,
        { type: 'sales_order.cancelled', title: `Order ${order.orderNumber} was cancelled`, body: `It was cancelled${dto?.reason ? `: ${dto.reason}` : ''}. There is nothing further to do for this order.` },
        id,
        actor.id,
      );
    }
    return this.findById(updated.id, actor);
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
