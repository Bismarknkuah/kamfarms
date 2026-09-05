import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { RejectInventoryAdjustmentDto } from './dto/reject-inventory-adjustment.dto';
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

  async create(dto: CreateInventoryAdjustmentDto, actor: AuthenticatedUser) {
    assertScope(actor, dto.locationType === 'FARM' ? 'FARM' : 'WAREHOUSE', dto.locationId, 'this location');

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

  async approve(id: string, actor: AuthenticatedUser) {
    const adjustment = await this.findById(id);
    if (adjustment.status !== 'PENDING') {
      throw new BadRequestException(`Only PENDING adjustments can be approved (current status: ${adjustment.status}).`);
    }
    if (adjustment.requestedById === actor.id) {
      throw new ForbiddenException('You cannot approve your own adjustment request.');
    }
    assertScope(actor, adjustment.locationType === 'FARM' ? 'FARM' : 'WAREHOUSE', adjustment.locationId, 'this location');

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.ledger.recordTransaction(tx, {
        type: 'STOCK_ADJUSTMENT',
        destLocationType: adjustment.locationType,
        destLocationId: adjustment.locationId,
        paddyGradeId: adjustment.paddyGradeId,
        productId: adjustment.productId,
        packagingSizeId: adjustment.packagingSizeId,
        quantityKg: Math.abs(Number(adjustment.adjustmentKg)),
        bagCount: Math.abs(adjustment.adjustmentBags),
        referenceDocument: adjustment.adjustmentNumber,
        userId: actor.id,
        reason: adjustment.reason,
      });
      await this.ledger.adjustBalance(
        tx,
        { locationType: adjustment.locationType, locationId: adjustment.locationId, paddyGradeId: adjustment.paddyGradeId, productId: adjustment.productId, packagingSizeId: adjustment.packagingSizeId },
        Number(adjustment.adjustmentKg),
        adjustment.adjustmentBags,
      );

      const record = await tx.inventoryAdjustment.update({
        where: { id },
        data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() },
      });

      await this.audit.record(
        { userId: actor.id, action: 'inventory_adjustment.approve', entity: 'InventoryAdjustment', entityId: id, afterValue: record },
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
