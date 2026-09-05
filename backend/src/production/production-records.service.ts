import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { scopedLocationIds } from '../common/utils/scope.util';
import { CreateProductionRecordDto } from './dto/create-production-record.dto';
import { RejectProductionRecordDto } from './dto/reject-production-record.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

/** Same principle as the meter-reading anomaly alert: whoever
 * supervises Operations Officers, plus the top executives — not
 * everyone who happens to hold milling.view. */
const MASS_BALANCE_ALERT_ROLE_CODES = ['OPERATIONS_MANAGER', 'MD', 'CEO'];
const IMPOSSIBLE_OUTPUT_TOLERANCE = 1.005;
const ABNORMAL_VARIANCE_PERCENT = 5;

@Injectable()
export class ProductionRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Was returning production records from every milling center,
   * company-wide, to anyone with milling.view — including an
   * Operations Officer scoped to just Warehouse 1's milling center.
   * UserScope for this role is WAREHOUSE-typed (milling centers don't
   * get their own scope type), so this filters through
   * millingCenter.warehouseId rather than directly by millingCenterId. */
  async list(actor: AuthenticatedUser, filters: { millingCenterId?: string; status?: string }) {
    const where: Record<string, unknown> = {
      millingCenterId: filters.millingCenterId,
      status: filters.status as any,
    };

    const { isGlobal, ids } = scopedLocationIds(actor, 'WAREHOUSE');
    if (!isGlobal) {
      if (ids.length === 0) return [];
      where.millingCenter = { warehouseId: { in: ids } };
    }

    return this.prisma.productionRecord.findMany({
      where,
      include: { millingCenter: true, machine: true, paddyGrade: true, operator: true, submittedBy: true, approvedBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const record = await this.prisma.productionRecord.findUnique({
      where: { id },
      include: { millingCenter: { include: { warehouse: true } }, machine: true, paddyGrade: true, operator: true, submittedBy: true, approvedBy: true },
    });
    if (!record) throw new NotFoundException('Production record not found.');
    return record;
  }

  private computeMassBalance(paddyProcessedKg: number, recoveredKg: number, brokenKg: number, hullKg: number, wasteKg: number) {
    const outputSum = recoveredKg + brokenKg + hullKg + wasteKg;

    if (outputSum > paddyProcessedKg * IMPOSSIBLE_OUTPUT_TOLERANCE) {
      throw new BadRequestException({
        message: `Impossible mass balance: outputs (${outputSum.toFixed(2)} KG) exceed paddy processed (${paddyProcessedKg.toFixed(2)} KG).`,
        errorCode: 'MASS_BALANCE_IMPOSSIBLE',
      });
    }

    const variancePercent = ((paddyProcessedKg - outputSum) / paddyProcessedKg) * 100;
    const massBalanceFlag = Math.abs(variancePercent) > ABNORMAL_VARIANCE_PERCENT;

    return {
      recoveryPercent: (recoveredKg / paddyProcessedKg) * 100,
      brokenPercent: (brokenKg / paddyProcessedKg) * 100,
      hullPercent: (hullKg / paddyProcessedKg) * 100,
      wastePercent: (wasteKg / paddyProcessedKg) * 100,
      massBalanceFlag,
    };
  }

  async create(dto: CreateProductionRecordDto, actor: AuthenticatedUser) {
    const center = await this.prisma.millingCenter.findUnique({ where: { id: dto.millingCenterId } });
    if (!center || !center.isActive) throw new BadRequestException('Milling center not found or inactive.');

    const { recoveryPercent, brokenPercent, hullPercent, wastePercent, massBalanceFlag } = this.computeMassBalance(
      dto.paddyProcessedKg,
      dto.recoveredRiceKg,
      dto.brokenRiceKg,
      dto.riceHullKg,
      dto.wasteLossKg,
    );

    const record = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const prefix = `PR-${year}-`;
      const count = await tx.productionRecord.count({ where: { recordNumber: { startsWith: prefix } } });
      const recordNumber = `${prefix}${String(count + 1).padStart(6, '0')}`;

      const created = await tx.productionRecord.create({
        data: {
          recordNumber,
          millingCenterId: dto.millingCenterId,
          machineId: dto.machineId,
          date: new Date(dto.date),
          shift: dto.shift,
          operatorId: actor.id,
          paddyGradeId: dto.paddyGradeId,
          paddyProcessedKg: dto.paddyProcessedKg,
          startingKg: dto.startingKg,
          endingKg: dto.endingKg,
          processingDurationMin: dto.processingDurationMin,
          machineRuntimeMin: dto.machineRuntimeMin,
          energyConsumptionKwh: dto.energyConsumptionKwh,
          electricityMeterOpening: dto.electricityMeterOpening,
          electricityMeterClosing: dto.electricityMeterClosing,
          waterConsumption: dto.waterConsumption,
          fuelConsumption: dto.fuelConsumption,
          recoveredRiceKg: dto.recoveredRiceKg,
          brokenRiceKg: dto.brokenRiceKg,
          riceHullKg: dto.riceHullKg,
          wasteLossKg: dto.wasteLossKg,
          recoveryPercent,
          brokenPercent,
          hullPercent,
          wastePercent,
          massBalanceFlag,
          remarks: dto.remarks,
          status: 'SUBMITTED',
          submittedById: actor.id,
        },
      });

      await this.audit.record(
        { userId: actor.id, action: 'production.create', entity: 'ProductionRecord', entityId: created.id, afterValue: created },
        tx,
      );
      return created;
    });

    // Flagged silently in the database until now — the massBalanceFlag
    // existed but nothing ever told a human, matching exactly the same
    // gap the meter-reading anomaly alert closed last batch.
    if (record.massBalanceFlag) {
      const supervisors = await this.prisma.user.findMany({
        where: { deletedAt: null, status: 'ACTIVE', roles: { some: { role: { code: { in: MASS_BALANCE_ALERT_ROLE_CODES } } } } },
        select: { id: true },
      });
      if (supervisors.length > 0) {
        await this.notifications.notify({
          userIds: supervisors.map((u) => u.id),
          type: 'production.mass_balance_exception',
          title: `Mass balance exception — ${record.recordNumber}`,
          body: `Recovery ${Number(record.recoveryPercent).toFixed(1)}% deviates abnormally from what this batch's paddy input should yield. Needs review before approval.`,
          entityType: 'ProductionRecord',
          entityId: record.id,
        });
      }
    }

    return this.findById(record.id);
  }

  private async upsertByproduct(tx: any, name: string, description: string) {
    const existing = await tx.product.findFirst({ where: { name } });
    if (existing) return existing.id as string;
    const created = await tx.product.create({ data: { name, description } });
    return created.id as string;
  }

  async approve(id: string, actor: AuthenticatedUser) {
    const record = await this.findById(id);
    if (record.status !== 'SUBMITTED') {
      throw new BadRequestException(`Only SUBMITTED records can be approved (current status: ${record.status}).`);
    }
    if (record.submittedById === actor.id) {
      throw new ForbiddenException('You cannot approve your own production record.');
    }

    const warehouseId = record.millingCenter.warehouseId;
    const paddyProcessedKg = Number(record.paddyProcessedKg);
    const recoveredKg = Number(record.recoveredRiceKg);
    const brokenKg = Number(record.brokenRiceKg);
    const hullKg = Number(record.riceHullKg);
    const wasteKg = Number(record.wasteLossKg);

    const updated = await this.prisma.$transaction(async (tx) => {
      const approved = await tx.productionRecord.update({
        where: { id },
        data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() },
      });

      const riceProductId = await this.upsertByproduct(tx, 'Pectra Rice', 'Superfine Perfumed Rice');
      const brokenRiceProductId = await this.upsertByproduct(tx, 'Broken Rice', 'Milling byproduct — broken grains');
      const riceHullProductId = await this.upsertByproduct(tx, 'Rice Hull', 'Milling byproduct — husk');

      await this.ledger.recordTransaction(tx, {
        type: 'PADDY_SENT_TO_MILL',
        sourceLocationType: LocationType.WAREHOUSE,
        sourceLocationId: warehouseId,
        destLocationType: LocationType.MILLING_CENTER,
        destLocationId: record.millingCenterId,
        paddyGradeId: record.paddyGradeId,
        quantityKg: paddyProcessedKg,
        referenceDocument: record.recordNumber,
        userId: actor.id,
      });
      await this.ledger.adjustBalance(tx, { locationType: LocationType.WAREHOUSE, locationId: warehouseId, paddyGradeId: record.paddyGradeId }, -paddyProcessedKg);
      await this.ledger.adjustBalance(tx, { locationType: LocationType.MILLING_CENTER, locationId: record.millingCenterId, paddyGradeId: record.paddyGradeId }, paddyProcessedKg);

      await this.ledger.recordTransaction(tx, {
        type: 'PADDY_PROCESSED',
        sourceLocationType: LocationType.MILLING_CENTER,
        sourceLocationId: record.millingCenterId,
        paddyGradeId: record.paddyGradeId,
        quantityKg: paddyProcessedKg,
        referenceDocument: record.recordNumber,
        userId: actor.id,
      });
      await this.ledger.adjustBalance(tx, { locationType: LocationType.MILLING_CENTER, locationId: record.millingCenterId, paddyGradeId: record.paddyGradeId }, -paddyProcessedKg);

      await this.ledger.recordTransaction(tx, {
        type: 'RICE_RECOVERED',
        destLocationType: LocationType.MILLING_CENTER,
        destLocationId: record.millingCenterId,
        productId: riceProductId,
        quantityKg: recoveredKg,
        referenceDocument: record.recordNumber,
        userId: actor.id,
      });
      await this.ledger.adjustBalance(tx, { locationType: LocationType.MILLING_CENTER, locationId: record.millingCenterId, productId: riceProductId }, recoveredKg);

      if (brokenKg > 0) {
        await this.ledger.recordTransaction(tx, {
          type: 'BROKEN_RICE_GENERATED',
          destLocationType: LocationType.MILLING_CENTER,
          destLocationId: record.millingCenterId,
          productId: brokenRiceProductId,
          quantityKg: brokenKg,
          referenceDocument: record.recordNumber,
          userId: actor.id,
        });
        await this.ledger.adjustBalance(tx, { locationType: LocationType.MILLING_CENTER, locationId: record.millingCenterId, productId: brokenRiceProductId }, brokenKg);
      }

      if (hullKg > 0) {
        await this.ledger.recordTransaction(tx, {
          type: 'RICE_HULL_GENERATED',
          destLocationType: LocationType.MILLING_CENTER,
          destLocationId: record.millingCenterId,
          productId: riceHullProductId,
          quantityKg: hullKg,
          referenceDocument: record.recordNumber,
          userId: actor.id,
        });
        await this.ledger.adjustBalance(tx, { locationType: LocationType.MILLING_CENTER, locationId: record.millingCenterId, productId: riceHullProductId }, hullKg);
      }

      if (wasteKg > 0) {
        await this.ledger.recordTransaction(tx, {
          type: 'STOCK_LOSS',
          sourceLocationType: LocationType.MILLING_CENTER,
          sourceLocationId: record.millingCenterId,
          paddyGradeId: record.paddyGradeId,
          quantityKg: wasteKg,
          referenceDocument: record.recordNumber,
          userId: actor.id,
          reason: 'Processing waste/loss recorded from production record.',
        });
      }

      await this.audit.record(
        { userId: actor.id, action: 'production.approve', entity: 'ProductionRecord', entityId: id, afterValue: { status: 'APPROVED' } },
        tx,
      );

      return approved;
    });

    return this.findById(updated.id);
  }

  async reject(id: string, dto: RejectProductionRecordDto, actor: AuthenticatedUser) {
    const record = await this.findById(id);
    if (record.status !== 'SUBMITTED') {
      throw new BadRequestException(`Only SUBMITTED records can be rejected (current status: ${record.status}).`);
    }
    if (record.submittedById === actor.id) {
      throw new ForbiddenException('You cannot reject your own production record.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.productionRecord.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: dto.reason } });
      await this.audit.record(
        { userId: actor.id, action: 'production.reject', entity: 'ProductionRecord', entityId: id, afterValue: { status: 'REJECTED' }, reason: dto.reason },
        tx,
      );
      return result;
    });

    return this.findById(updated.id);
  }
}
