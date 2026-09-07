import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { RejectInventoryAdjustmentDto } from './dto/reject-inventory-adjustment.dto';
import { ApproveInventoryAdjustmentDto } from './dto/approve-inventory-adjustment.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class InventoryAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  list(actor: AuthenticatedUser, status?: string) {
    const farmScope = scopedLocationIds(actor, 'FARM');
    const warehouseScope = scopedLocationIds(actor, 'WAREHOUSE');
    const isGlobal = farmScope.isGlobal;

    const where: Record<string, unknown> = { status: status as any };
    if (!isGlobal) {
      const or: Record<string, unknown>[] = [];
      if (farmScope.ids.length) or.push({ locationType: 'FARM', locationId: { in: farmScope.ids } });
      if (warehouseScope.ids.length) or.push({ locationType: 'WAREHOUSE', locationId: { in: warehouseScope.ids } });
      if (or.length === 0) return Promise.resolve([]);
      where.OR = or;
    }

    return this.prisma.inventoryAdjustment.findMany({
      where,
      include: { paddyGrade: true, product: true, packagingSize: true, requestedBy: true, approvedBy: true },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async findById(id: string) {
    const adjustment = await this.prisma.inventoryAdjustment.findUnique({
      where: { id },
      include: { paddyGrade: true, product: true, packagingSize: true, requestedBy: true, approvedBy: true },
    });
    if (!adjustment) throw new NotFoundException('Inventory adjustment not found.');
    return adjustment;
  }

  /** A MillingCenter's own id is never itself a WAREHOUSE-scope id - a
   * real, confirmed bug in this file's first version: passing it
   * straight to assertScope('WAREHOUSE', millingCenterId) could never
   * match a genuinely warehouse-scoped actor's own id list, since that
   * list contains Warehouse ids, not MillingCenter ids. The established
   * fix (already proven in MachinesService and ProductionRecordsService)
   * is to resolve the milling center's parent warehouseId first and
   * check that instead - a milling center's inventory is scoped through
   * whichever warehouse actually owns it. */
  private async assertLocationScope(actor: AuthenticatedUser, locationType: string, locationId: string) {
    if (locationType === 'FARM') {
      assertScope(actor, 'FARM', locationId, 'this farm');
      return;
    }
    if (locationType === 'MILLING_CENTER') {
      const center = await this.prisma.millingCenter.findUnique({ where: { id: locationId } });
      if (!center) throw new BadRequestException('Milling center not found.');
      assertScope(actor, 'WAREHOUSE', center.warehouseId, 'this milling center');
      return;
    }
    assertScope(actor, 'WAREHOUSE', locationId, 'this warehouse');
  }

  async create(dto: CreateInventoryAdjustmentDto, actor: AuthenticatedUser) {
    await this.assertLocationScope(actor, dto.locationType, dto.locationId);

    if (!dto.paddyGradeId && !dto.productId) {
      throw new BadRequestException('Either paddyGradeId or productId (with packagingSizeId) must be provided.');
    }

    const currentBalance = await this.ledger.getBalance(this.prisma, {
      locationType: dto.locationType,
      locationId: dto.locationId,
      paddyGradeId: dto.paddyGradeId,
      productId: dto.productId,
      packagingSizeId: dto.packagingSizeId,
    });
    const systemQuantityKg = Number(currentBalance?.quantityKg ?? 0);
    const systemBagCount = currentBalance?.bagCount ?? 0;

    if (systemQuantityKg + dto.adjustmentKg < 0) {
      throw new BadRequestException(`This adjustment would take the balance negative (${systemQuantityKg} KG on hand, ${dto.adjustmentKg} KG requested). Not allowed.`);
    }

    const count = await this.prisma.inventoryAdjustment.count();
    const adjustmentNumber = `ADJ-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;

    const created = await this.prisma.inventoryAdjustment.create({
      data: {
        adjustmentNumber,
        locationType: dto.locationType,
        locationId: dto.locationId,
        paddyGradeId: dto.paddyGradeId,
        productId: dto.productId,
        packagingSizeId: dto.packagingSizeId,
        systemQuantityKg,
        systemBagCount,
        adjustmentKg: dto.adjustmentKg,
        adjustmentBags: dto.adjustmentBags,
        reason: dto.reason,
        requestedById: actor.id,
        status: 'PENDING',
      },
    });

    await this.audit.record({ userId: actor.id, action: 'inventory_adjustment.request', entity: 'InventoryAdjustment', entityId: created.id, afterValue: created });
    return this.findById(created.id);
  }

  async approve(id: string, dto: ApproveInventoryAdjustmentDto, actor: AuthenticatedUser) {
    const adjustment = await this.findById(id);
    if (adjustment.status !== 'PENDING') {
      throw new BadRequestException(`Only PENDING adjustments can be approved (current status: ${adjustment.status}).`);
    }
    if (adjustment.requestedById === actor.id) {
      throw new ForbiddenException('You cannot approve your own adjustment request.');
    }
    await this.assertLocationScope(actor, adjustment.locationType, adjustment.locationId);

    // The Farm Manager's originally submitted figures, corrected here
    // if the Farm Supervisor caught a mistake - the approval step
    // itself is the correction point, rather than forcing a decline
    // and a whole new resubmission for something as simple as a typo
    // in the bag count.
    const finalKg = dto.adjustmentKg ?? Number(adjustment.adjustmentKg);
    const finalBags = dto.adjustmentBags ?? adjustment.adjustmentBags;
    const finalReason = dto.reason ?? adjustment.reason;

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.ledger.recordTransaction(tx, {
        type: 'STOCK_ADJUSTMENT',
        destLocationType: adjustment.locationType,
        destLocationId: adjustment.locationId,
        paddyGradeId: adjustment.paddyGradeId,
        productId: adjustment.productId,
        packagingSizeId: adjustment.packagingSizeId,
        quantityKg: Math.abs(finalKg),
        bagCount: Math.abs(finalBags),
        referenceDocument: adjustment.adjustmentNumber,
        userId: actor.id,
        reason: finalReason,
      });
      await this.ledger.adjustBalance(
        tx,
        { locationType: adjustment.locationType, locationId: adjustment.locationId, paddyGradeId: adjustment.paddyGradeId, productId: adjustment.productId, packagingSizeId: adjustment.packagingSizeId },
        finalKg,
        finalBags,
      );

      const record = await tx.inventoryAdjustment.update({
        where: { id },
        data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date(), adjustmentKg: finalKg, adjustmentBags: finalBags, reason: finalReason },
      });

      await this.audit.record(
        {
          userId: actor.id,
          action: 'inventory_adjustment.approve',
          entity: 'InventoryAdjustment',
          entityId: id,
          beforeValue: { adjustmentKg: Number(adjustment.adjustmentKg), adjustmentBags: adjustment.adjustmentBags, reason: adjustment.reason },
          afterValue: record,
        },
        tx,
      );
      return record;
    });

    return this.findById(updated.id);
  }

  async reject(id: string, dto: RejectInventoryAdjustmentDto, actor: AuthenticatedUser) {
    const adjustment = await this.findById(id);
    if (adjustment.status !== 'PENDING') {
      throw new BadRequestException(`Only PENDING adjustments can be rejected (current status: ${adjustment.status}).`);
    }
    if (adjustment.requestedById === actor.id) {
      throw new ForbiddenException('You cannot reject your own adjustment request.');
    }

    const updated = await this.prisma.inventoryAdjustment.update({
      where: { id },
      data: { status: 'REJECTED', approvedById: actor.id, approvedAt: new Date(), rejectionReason: dto.reason },
    });
    await this.audit.record({
      userId: actor.id,
      action: 'inventory_adjustment.reject',
      entity: 'InventoryAdjustment',
      entityId: id,
      afterValue: { status: 'REJECTED' },
      reason: dto.reason,
    });
    return this.findById(updated.id);
  }
}
