import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { ReceiveStockTransferDto } from './dto/receive-stock-transfer.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

/** Beyond this many KG of variance between what was dispatched and what
 * arrived, receiving is still recorded, but flagged — matches
 * VARIANCE_TOLERANCE_KG's role in shipments.service.ts exactly, same
 * principle, same-shaped field. */
const VARIANCE_TOLERANCE_KG = 5;

@Injectable()
export class StockTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  list(actor: AuthenticatedUser, warehouseId?: string) {
    const { isGlobal, ids } = scopedLocationIds(actor, 'WAREHOUSE');
    let where: Record<string, unknown> = {};
    const locationFilter = warehouseId
      ? { OR: [{ sourceWarehouseId: warehouseId }, { destWarehouseId: warehouseId }] }
      : null;
    if (!isGlobal) {
      if (ids.length === 0) return Promise.resolve([]);
      const scopeFilter = { OR: [{ sourceWarehouseId: { in: ids } }, { destWarehouseId: { in: ids } }] };
      where = locationFilter ? { AND: [locationFilter, scopeFilter] } : scopeFilter;
    } else if (locationFilter) {
      where = locationFilter;
    }
    return this.prisma.stockTransfer.findMany({
      where,
      include: {
        sourceWarehouse: true,
        destWarehouse: true,
        product: true,
        packagingSize: true,
        requestedBy: true,
        receivedBy: true,
      },
      orderBy: { dispatchedAt: 'desc' },
    });
  }

  async findById(id: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: { sourceWarehouse: true, destWarehouse: true, product: true, packagingSize: true, requestedBy: true, receivedBy: true },
    });
    if (!transfer) throw new NotFoundException('Stock transfer not found.');
    return transfer;
  }

  /** Dispatch — moves physical stock out of the source warehouse into
   * EXTERNAL (the same in-transit pseudo-location paddy already uses),
   * never straight into the destination. Checked against reservations,
   * not just raw physical balance: transferring away stock a pending
   * sale is already counting on would silently break that sale's
   * ability to be fulfilled later. */
  async create(dto: CreateStockTransferDto, actor: AuthenticatedUser) {
    assertScope(actor, 'WAREHOUSE', dto.sourceWarehouseId, 'the source warehouse');

    const [sourceWarehouse, destWarehouse] = await Promise.all([
      this.prisma.warehouse.findUnique({ where: { id: dto.sourceWarehouseId } }),
      this.prisma.warehouse.findUnique({ where: { id: dto.destWarehouseId } }),
    ]);
    if (!sourceWarehouse || !sourceWarehouse.isActive) throw new BadRequestException('Source warehouse not found or inactive.');
    if (!destWarehouse || !destWarehouse.isActive) throw new BadRequestException('Destination warehouse not found or inactive.');
    if (dto.sourceWarehouseId === dto.destWarehouseId) throw new BadRequestException('Source and destination warehouse must be different.');

    const balance = await this.ledger.getBalance(this.prisma, {
      locationType: 'WAREHOUSE',
      locationId: dto.sourceWarehouseId,
      productId: dto.productId,
      packagingSizeId: dto.packagingSizeId,
    });
    const physicalBags = balance?.bagCount ?? 0;
    const activeReservations = await this.prisma.stockReservation.aggregate({
      where: { warehouseId: dto.sourceWarehouseId, productId: dto.productId, packagingSizeId: dto.packagingSizeId, status: 'ACTIVE' },
      _sum: { bagCount: true },
    });
    const availableToTransfer = physicalBags - (activeReservations._sum.bagCount ?? 0);
    if (dto.bagCount > availableToTransfer) {
      throw new BadRequestException({
        message: `Only ${availableToTransfer} bags are available to transfer from this warehouse for this product/size (${physicalBags} physical, ${activeReservations._sum.bagCount ?? 0} already reserved for pending sales).`,
        errorCode: 'INSUFFICIENT_STOCK',
      });
    }

    const transfer = await this.prisma.$transaction(async (tx) => {
      const count = await tx.stockTransfer.count();
      const transferNumber = `TRF-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;

      const created = await tx.stockTransfer.create({
        data: {
          transferNumber,
          sourceWarehouseId: dto.sourceWarehouseId,
          destWarehouseId: dto.destWarehouseId,
          productId: dto.productId,
          packagingSizeId: dto.packagingSizeId,
          bagCount: dto.bagCount,
          totalKg: dto.totalKg,
          reason: dto.reason,
          requestedById: actor.id,
          status: 'DISPATCHED',
        },
      });

      await this.ledger.recordTransaction(tx, {
        type: 'STOCK_TRANSFER',
        sourceLocationType: 'WAREHOUSE',
        sourceLocationId: dto.sourceWarehouseId,
        destLocationType: 'EXTERNAL',
        destLocationId: created.id,
        productId: dto.productId,
        packagingSizeId: dto.packagingSizeId,
        quantityKg: dto.totalKg,
        bagCount: dto.bagCount,
        referenceDocument: transferNumber,
        userId: actor.id,
      });
      await this.ledger.adjustBalance(tx, { locationType: 'WAREHOUSE', locationId: dto.sourceWarehouseId, productId: dto.productId, packagingSizeId: dto.packagingSizeId }, -dto.totalKg, -dto.bagCount);
      await this.ledger.adjustBalance(tx, { locationType: 'EXTERNAL', locationId: created.id, productId: dto.productId, packagingSizeId: dto.packagingSizeId }, dto.totalKg, dto.bagCount);

      await this.audit.record(
        { userId: actor.id, action: 'stock_transfer.dispatch', entity: 'StockTransfer', entityId: created.id, afterValue: created },
        tx,
      );
      return created;
    });

    return this.findById(transfer.id);
  }

  /** Receipt — the second, genuinely separate step. Moves stock out of
   * EXTERNAL into the destination warehouse, capturing variance the
   * same way Shipment does for paddy, rather than assuming everything
   * dispatched always arrives intact. */
  async receive(id: string, dto: ReceiveStockTransferDto, actor: AuthenticatedUser) {
    const transfer = await this.findById(id);
    if (transfer.status !== 'DISPATCHED') {
      throw new BadRequestException(`Only DISPATCHED transfers can be received (current status: ${transfer.status}).`);
    }
    assertScope(actor, 'WAREHOUSE', transfer.destWarehouseId, 'the destination warehouse');

    const varianceKg = dto.receivedKg - Number(transfer.totalKg);

    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.stockTransfer.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          receivedBagCount: dto.receivedBagCount,
          receivedKg: dto.receivedKg,
          varianceKg,
          receivedById: actor.id,
          receivedAt: new Date(),
        },
      });

      await this.ledger.recordTransaction(tx, {
        type: 'STOCK_TRANSFER',
        sourceLocationType: 'EXTERNAL',
        sourceLocationId: transfer.id,
        destLocationType: 'WAREHOUSE',
        destLocationId: transfer.destWarehouseId,
        productId: transfer.productId,
        packagingSizeId: transfer.packagingSizeId,
        quantityKg: dto.receivedKg,
        bagCount: dto.receivedBagCount,
        referenceDocument: transfer.transferNumber,
        userId: actor.id,
        reason: varianceKg !== 0 ? `Variance: ${varianceKg.toFixed(2)} KG` : undefined,
      });
      await this.ledger.adjustBalance(tx, { locationType: 'EXTERNAL', locationId: transfer.id, productId: transfer.productId, packagingSizeId: transfer.packagingSizeId }, -Number(transfer.totalKg), -transfer.bagCount);
      await this.ledger.adjustBalance(tx, { locationType: 'WAREHOUSE', locationId: transfer.destWarehouseId, productId: transfer.productId, packagingSizeId: transfer.packagingSizeId }, dto.receivedKg, dto.receivedBagCount);

      await this.audit.record(
        {
          userId: actor.id,
          action: 'stock_transfer.receive',
          entity: 'StockTransfer',
          entityId: id,
          afterValue: { receivedBagCount: dto.receivedBagCount, receivedKg: dto.receivedKg, varianceKg },
        },
        tx,
      );
      return record;
    });

    return this.findById(updated.id);
  }
}
