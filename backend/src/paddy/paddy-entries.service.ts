import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType, PaddyEntryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { CreatePaddyEntryDto } from './dto/create-paddy-entry.dto';
import { UpdatePaddyEntryDto } from './dto/update-paddy-entry.dto';
import { RejectPaddyEntryDto } from './dto/reject-paddy-entry.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

const EDITABLE_STATUSES: PaddyEntryStatus[] = ['DRAFT', 'REJECTED'];

@Injectable()
export class PaddyEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  async list(actor: AuthenticatedUser, filters: { farmId?: string; status?: PaddyEntryStatus }) {
    if (filters.farmId) {
      assertScope(actor, 'FARM', filters.farmId, 'this farm');
    }

    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;

    if (filters.farmId) {
      where.farmId = filters.farmId;
    } else {
      const { isGlobal, ids } = scopedLocationIds(actor, 'FARM');
      if (!isGlobal) {
        if (ids.length === 0) return []; // no farm scope at all -> nothing visible
        where.farmId = { in: ids };
      }
    }

    return this.prisma.paddyEntry.findMany({
      where,
      include: { farm: true, paddyGrade: true, paddyType: true, submittedBy: true, approvedBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, actor: AuthenticatedUser) {
    const entry = await this.prisma.paddyEntry.findUnique({
      where: { id },
      include: { farm: true, paddyGrade: true, paddyType: true, submittedBy: true, approvedBy: true, batch: true },
    });
    if (!entry) throw new NotFoundException('Paddy entry not found.');
    assertScope(actor, 'FARM', entry.farmId, 'this farm');
    return entry;
  }

  /** Standard paddy bag weight used to estimate a shipment's KG when no
   * scale reading was taken — most farms don't have one on-site. This is
   * a real assumption, not a precise figure, which is exactly why every
   * entry that uses it is flagged via weightEstimated rather than
   * silently presented as measured. */
  private static readonly STANDARD_PADDY_BAG_WEIGHT_KG = 50;

  async create(dto: CreatePaddyEntryDto, actor: AuthenticatedUser) {
    assertScope(actor, 'FARM', dto.farmId, 'this farm');

    const farm = await this.prisma.farm.findUnique({ where: { id: dto.farmId } });
    if (!farm || !farm.isActive) throw new BadRequestException('Farm not found or inactive.');

    const grade = await this.prisma.paddyGrade.findUnique({ where: { id: dto.paddyGradeId } });
    if (!grade || !grade.isActive) throw new BadRequestException('Paddy grade not found or inactive.');

    const weightEstimated = dto.weightKg === undefined;
    const weightKg = dto.weightKg ?? dto.bagCount * PaddyEntriesService.STANDARD_PADDY_BAG_WEIGHT_KG;
    const avgBagWeightKg = weightKg / dto.bagCount;

    const entry = await this.prisma.$transaction(async (tx) => {
      const entryNumber = await this.ledger.generateNumber(tx, 'PE', 'paddyEntry');
      const batchNumber = await this.ledger.generateNumber(tx, 'PB', 'paddyBatch');

      const created = await tx.paddyEntry.create({
        data: {
          entryNumber,
          batchNumber,
          farmId: dto.farmId,
          entryDate: new Date(dto.entryDate),
          paddyTypeId: dto.paddyTypeId,
          paddyGradeId: dto.paddyGradeId,
          weightKg,
          weightEstimated,
          bagCount: dto.bagCount,
          avgBagWeightKg,
          moisturePercent: dto.moisturePercent,
          qualityGrade: dto.qualityGrade,
          harvestDate: dto.harvestDate ? new Date(dto.harvestDate) : null,
          supplierName: dto.supplierName,
          storageLocation: dto.storageLocation,
          notes: dto.notes,
          status: 'DRAFT',
          submittedById: actor.id,
        },
      });

      await this.audit.record(
        { userId: actor.id, action: 'paddy.create', entity: 'PaddyEntry', entityId: created.id, afterValue: created },
        tx,
      );

      return created;
    });

    return this.findById(entry.id, actor);
  }

  async update(id: string, dto: UpdatePaddyEntryDto, actor: AuthenticatedUser) {
    const before = await this.findById(id, actor);
    if (!EDITABLE_STATUSES.includes(before.status)) {
      throw new BadRequestException(`Paddy entry cannot be edited while ${before.status}.`);
    }
    if (before.submittedById !== actor.id) {
      throw new ForbiddenException('Only the original submitter can edit this entry.');
    }

    const weightKg = dto.weightKg ?? Number(before.weightKg);
    const bagCount = dto.bagCount ?? before.bagCount;
    const avgBagWeightKg = weightKg / bagCount;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.paddyEntry.update({
        where: { id },
        data: {
          entryDate: dto.entryDate ? new Date(dto.entryDate) : undefined,
          paddyTypeId: dto.paddyTypeId,
          paddyGradeId: dto.paddyGradeId,
          weightKg: dto.weightKg,
          // Only flips to a real measurement if a weight was actually
          // provided in this update — leaves the existing flag alone
          // (Prisma's update skips a field entirely on `undefined`) when
          // this edit didn't touch weight at all.
          weightEstimated: dto.weightKg !== undefined ? false : undefined,
          bagCount: dto.bagCount,
          avgBagWeightKg,
          moisturePercent: dto.moisturePercent,
          qualityGrade: dto.qualityGrade,
          harvestDate: dto.harvestDate ? new Date(dto.harvestDate) : undefined,
          supplierName: dto.supplierName,
          storageLocation: dto.storageLocation,
          notes: dto.notes,
        },
      });
      await this.audit.record(
        { userId: actor.id, action: 'paddy.update', entity: 'PaddyEntry', entityId: id, beforeValue: before, afterValue: result },
        tx,
      );
      return result;
    });

    return this.findById(updated.id, actor);
  }

  async submit(id: string, actor: AuthenticatedUser) {
    const entry = await this.findById(id, actor);
    if (!EDITABLE_STATUSES.includes(entry.status)) {
      throw new BadRequestException(`Paddy entry cannot be submitted while ${entry.status}.`);
    }
    if (entry.submittedById !== actor.id) {
      throw new ForbiddenException('Only the original submitter can submit this entry.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.paddyEntry.update({
        where: { id },
        data: { status: 'SUBMITTED', submittedAt: new Date(), rejectionReason: null },
      });
      await this.audit.record(
        { userId: actor.id, action: 'paddy.submit', entity: 'PaddyEntry', entityId: id, afterValue: result },
        tx,
      );
      return result;
    });

    return this.findById(updated.id, actor);
  }

  /** The one method in this service that actually moves inventory — the
   * whole approval, batch creation, ledger transaction, balance update,
   * and audit record happen in a single DB transaction (spec section 90).
   * Self-approval is blocked unconditionally (spec rule 54; no override in
   * this phase). */
  async approve(id: string, actor: AuthenticatedUser) {
    const entry = await this.findById(id, actor);
    if (entry.status !== 'SUBMITTED') {
      throw new BadRequestException(`Only SUBMITTED entries can be approved (current status: ${entry.status}).`);
    }
    if (entry.submittedById === actor.id) {
      throw new ForbiddenException('You cannot approve your own submission.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const approvedEntry = await tx.paddyEntry.update({
        where: { id },
        data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() },
      });

      const batch = await tx.paddyBatch.create({
        data: {
          batchNumber: entry.batchNumber,
          paddyEntryId: entry.id,
          farmId: entry.farmId,
          paddyGradeId: entry.paddyGradeId,
          totalKg: entry.weightKg,
          bagCount: entry.bagCount,
        },
      });

      await this.ledger.recordTransaction(tx, {
        type: 'PADDY_APPROVED',
        destLocationType: LocationType.FARM,
        destLocationId: entry.farmId,
        paddyGradeId: entry.paddyGradeId,
        quantityKg: Number(entry.weightKg),
        bagCount: entry.bagCount,
        batchNumber: entry.batchNumber,
        referenceDocument: entry.entryNumber,
        userId: actor.id,
      });

      await this.ledger.adjustBalance(
        tx,
        { locationType: LocationType.FARM, locationId: entry.farmId, paddyGradeId: entry.paddyGradeId },
        Number(entry.weightKg),
        entry.bagCount,
      );

      await this.audit.record(
        {
          userId: actor.id,
          action: 'paddy.approve',
          entity: 'PaddyEntry',
          entityId: id,
          beforeValue: { status: entry.status },
          afterValue: { status: 'APPROVED', batchNumber: batch.batchNumber },
        },
        tx,
      );

      return approvedEntry;
    });

    return this.findById(updated.id, actor);
  }

  async reject(id: string, dto: RejectPaddyEntryDto, actor: AuthenticatedUser) {
    const entry = await this.findById(id, actor);
    if (entry.status !== 'SUBMITTED') {
      throw new BadRequestException(`Only SUBMITTED entries can be rejected (current status: ${entry.status}).`);
    }
    if (entry.submittedById === actor.id) {
      throw new ForbiddenException('You cannot reject your own submission.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.paddyEntry.update({
        where: { id },
        data: { status: 'REJECTED', rejectionReason: dto.reason },
      });
      await this.audit.record(
        {
          userId: actor.id,
          action: 'paddy.reject',
          entity: 'PaddyEntry',
          entityId: id,
          afterValue: { status: 'REJECTED', reason: dto.reason },
          reason: dto.reason,
        },
        tx,
      );
      return result;
    });

    return this.findById(updated.id, actor);
  }
}
