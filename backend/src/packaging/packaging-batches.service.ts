import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { scopedLocationIds } from '../common/utils/scope.util';
import { CreatePackagingBatchDto } from './dto/create-packaging-batch.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class PackagingBatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  /** Was returning packaging batches from every warehouse, company-wide,
   * to anyone with warehouse.inventory.view or packaging.create —
   * including an Operations Officer scoped to just one warehouse. An
   * explicit warehouseId filter from a non-global caller now gets
   * intersected with their real scope rather than trusted outright. */
  list(actor: AuthenticatedUser, warehouseId?: string) {
    const { isGlobal, ids } = scopedLocationIds(actor, 'WAREHOUSE');
    let effectiveWarehouseId: string | { in: string[] } | undefined = warehouseId;
    if (!isGlobal) {
      if (ids.length === 0) return Promise.resolve([]);
      effectiveWarehouseId = warehouseId && ids.includes(warehouseId) ? warehouseId : { in: ids };
    }
    return this.prisma.packagingBatch.findMany({
      where: effectiveWarehouseId ? { warehouseId: effectiveWarehouseId as any } : undefined,
      include: { product: true, packagingSize: true, millingCenter: true, warehouse: true, operator: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const batch = await this.prisma.packagingBatch.findUnique({
      where: { id },
      include: { product: true, packagingSize: true, millingCenter: true, warehouse: true, operator: true },
    });
    if (!batch) throw new NotFoundException('Packaging batch not found.');
    return batch;
  }

  /** No separate approval workflow here — spec section 17 describes
   * packaging as a direct operational record, not a multi-step approval
   * chain like paddy/delivery/production. The safety net is the ledger
   * itself: you cannot package more bulk rice than actually exists (the
   * balance check throws), and every quantity is computed server-side,
   * never trusted from the request body (spec section 17: "Total KG =
   * package size × number of bags"). */
  async create(dto: CreatePackagingBatchDto, actor: AuthenticatedUser) {
    const center = await this.prisma.millingCenter.findUnique({ where: { id: dto.millingCenterId } });
    if (!center || !center.isActive) throw new BadRequestException('Milling center not found or inactive.');

    const size = await this.prisma.packagingSize.findUnique({ where: { id: dto.packagingSizeId } });
    if (!size || !size.isActive) throw new BadRequestException('Packaging size not found or inactive.');

    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product || !product.isActive) throw new BadRequestException('Product not found or inactive.');

    // Total KG is ALWAYS derived from size × bag count — never accepted
    // as a client-supplied number (spec section 17 example: 25 KG × 100
    // bags = 2,500 KG).
    const totalKg = Number(size.sizeKg) * dto.bagCount;
    const sourceBulkKg = dto.sourceBulkKg ?? totalKg;
    const packagingLossKg = sourceBulkKg - totalKg;

    if (packagingLossKg < -0.001) {
      throw new BadRequestException({
        message: `Bulk rice consumed (${sourceBulkKg} KG) cannot be less than packaged output (${totalKg} KG) — that would create mass from nothing.`,
        errorCode: 'PACKAGING_LOSS_NEGATIVE',
      });
    }

    const batch = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const prefix = `PKG-${year}-`;
      const count = await tx.packagingBatch.count({ where: { batchNumber: { startsWith: prefix } } });
      const batchNumber = `${prefix}${String(count + 1).padStart(6, '0')}`;

      const created = await tx.packagingBatch.create({
        data: {
          batchNumber,
          productId: dto.productId,
          packagingSizeId: dto.packagingSizeId,
          bagCount: dto.bagCount,
          totalKg,
          sourceBulkKg,
          packagingLossKg,
          millingCenterId: dto.millingCenterId,
          warehouseId: center.warehouseId,
          packagingDate: new Date(dto.packagingDate),
          operatorId: actor.id,
          notes: dto.notes,
        },
      });

      // Bulk unpackaged rice leaves the milling center...
      await this.ledger.recordTransaction(tx, {
        type: 'PACKAGED_RICE_CREATED',
        sourceLocationType: LocationType.MILLING_CENTER,
        sourceLocationId: dto.millingCenterId,
        destLocationType: LocationType.WAREHOUSE,
        destLocationId: center.warehouseId,
        productId: dto.productId,
        packagingSizeId: dto.packagingSizeId,
        quantityKg: totalKg,
        bagCount: dto.bagCount,
        batchNumber,
        referenceDocument: batchNumber,
        userId: actor.id,
        reason: packagingLossKg > 0 ? `Packaging loss: ${packagingLossKg.toFixed(2)} KG.` : undefined,
      });

      // ...consuming sourceBulkKg of bulk (unpackaged) stock. This throws
      // if there isn't enough bulk rice — RULE 1, never negative inventory.
      await this.ledger.adjustBalance(
        tx,
        { locationType: LocationType.MILLING_CENTER, locationId: dto.millingCenterId, productId: dto.productId, packagingSizeId: null },
        -sourceBulkKg,
      );

      // ...and the packaged bags land in the warehouse's finished-goods balance.
      await this.ledger.adjustBalance(
        tx,
        { locationType: LocationType.WAREHOUSE, locationId: center.warehouseId, productId: dto.productId, packagingSizeId: dto.packagingSizeId },
        totalKg,
        dto.bagCount,
      );

      if (packagingLossKg > 0) {
        await this.ledger.recordTransaction(tx, {
          type: 'STOCK_LOSS',
          sourceLocationType: LocationType.MILLING_CENTER,
          sourceLocationId: dto.millingCenterId,
          productId: dto.productId,
          quantityKg: packagingLossKg,
          batchNumber,
          referenceDocument: batchNumber,
          userId: actor.id,
          reason: 'Packaging loss.',
        });
      }

      await this.audit.record(
        { userId: actor.id, action: 'packaging.create', entity: 'PackagingBatch', entityId: created.id, afterValue: created },
        tx,
      );

      return created;
    });

    return this.findById(batch.id);
  }
}
