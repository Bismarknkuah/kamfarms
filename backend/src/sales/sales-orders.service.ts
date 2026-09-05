import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { ApproveSalesOrderDto } from './dto/approve-sales-order.dto';
import { RejectSalesOrderDto } from './dto/reject-sales-order.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  async list(filters: { status?: string; customerId?: string }) {
    return this.prisma.salesOrder.findMany({
      where: { status: filters.status as any, customerId: filters.customerId },
      include: { customer: true, salesOfficer: true, items: { include: { product: true, packagingSize: true } } },
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

    throw new BadRequestException({
      message: 'No price is configured for this product/package size, and no price was supplied.',
      errorCode: 'PRICE_NOT_CONFIGURED',
    });
  }

  async create(dto: CreateSalesOrderDto, actor: AuthenticatedUser) {
    if (dto.items.length === 0) throw new BadRequestException('A sales order needs at least one item.');

    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer || !customer.isActive) throw new BadRequestException('Customer not found or inactive.');

    const order = await this.prisma.$transaction(async (tx) => {
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

  async approve(id: string, dto: ApproveSalesOrderDto, actor: AuthenticatedUser) {
    const order = await this.findById(id);
    if (order.status !== 'SUBMITTED') {
      throw new BadRequestException(`Only SUBMITTED orders can be approved (current status: ${order.status}).`);
    }
    if (order.submittedById === actor.id) {
      throw new ForbiddenException('You cannot approve your own sales order.');
    }

    const warehouseId = dto.allocatedWarehouseId ?? order.preferredWarehouseId;
    if (!warehouseId) {
      throw new BadRequestException('No warehouse specified and the order has no preferred warehouse — allocatedWarehouseId is required.');
    }

    const shortfalls: string[] = [];
    for (const item of order.items) {
      const available = await this.availableToSell(warehouseId, item.productId, item.packagingSizeId);
      if (available < item.bagCount) {
        shortfalls.push(`${item.product.name} (${item.packagingSize.label}): requested ${item.bagCount} bags, only ${available} available.`);
      }
    }
    if (shortfalls.length > 0) {
      throw new BadRequestException({
        message: `Insufficient stock to fulfill this order at the selected warehouse: ${shortfalls.join(' ')}`,
        errorCode: 'INSUFFICIENT_STOCK',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const approvedOrder = await tx.salesOrder.update({
        where: { id },
        data: { status: 'RESERVED', approvedById: actor.id, approvedAt: new Date(), allocatedWarehouseId: warehouseId },
      });

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

      await this.audit.record(
        { userId: actor.id, action: 'sales_order.approve', entity: 'SalesOrder', entityId: id, afterValue: { status: 'RESERVED', warehouseId } },
        tx,
      );

      return approvedOrder;
    });

    return this.findById(updated.id);
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
    return this.findById(updated.id);
  }

  async fulfill(id: string, actor: AuthenticatedUser) {
    const order = await this.findById(id);
    if (order.status !== 'RESERVED') {
      throw new BadRequestException(`Only RESERVED orders can be fulfilled (current status: ${order.status}).`);
    }
    if (!order.allocatedWarehouseId) {
      throw new BadRequestException('Order has no allocated warehouse.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const reservation of order.reservations.filter((r) => r.status === 'ACTIVE')) {
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

      await this.audit.record(
        { userId: actor.id, action: 'sales_order.fulfill', entity: 'SalesOrder', entityId: id, afterValue: { status: 'FULFILLED' } },
        tx,
      );

      return fulfilledOrder;
    });

    return this.findById(updated.id);
  }

  async cancel(id: string, actor: AuthenticatedUser) {
    const order = await this.findById(id);
    if (!['DRAFT', 'SUBMITTED', 'RESERVED'].includes(order.status)) {
      throw new BadRequestException(`Orders in status ${order.status} cannot be cancelled.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.stockReservation.updateMany({
        where: { salesOrderId: id, status: 'ACTIVE' },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      const cancelled = await tx.salesOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.record(
        { userId: actor.id, action: 'sales_order.cancel', entity: 'SalesOrder', entityId: id, afterValue: { status: 'CANCELLED' } },
        tx,
      );
      return cancelled;
    });

    return this.findById(updated.id);
  }
}
