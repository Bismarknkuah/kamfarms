import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType, PaddyEntryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { CreatePaddyEntryDto } from './dto/create-paddy-entry.dto';
import { UpdatePaddyEntryDto } from './dto/update-paddy-entry.dto';
import { RejectPaddyEntryDto } from './dto/reject-paddy-entry.dto';
import { CreatePaddyEntryCommentDto } from './dto/create-paddy-entry-comment.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PERMISSIONS } from '../common/constants/permissions';
import { estimateKg } from '../common/constants/bag-weight';
import { CreatePaddyIntakeDto } from './dto/create-paddy-intake.dto';

// Only APPROVED is locked - matches the explicit requirement that a
// Farm Manager can edit a submitted entry right up until their Farm
// Supervisor actually approves it, not just while it's still a draft.
const EDITABLE_STATUSES: PaddyEntryStatus[] = ['DRAFT', 'SUBMITTED', 'REJECTED'];

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


  async create(dto: CreatePaddyEntryDto, actor: AuthenticatedUser) {
    assertScope(actor, 'FARM', dto.farmId, 'this farm');

    const farm = await this.prisma.farm.findUnique({ where: { id: dto.farmId } });
    if (!farm || !farm.isActive) throw new BadRequestException('Farm not found or inactive.');

    const grade = await this.prisma.paddyGrade.findUnique({ where: { id: dto.paddyGradeId } });
    if (!grade || !grade.isActive) throw new BadRequestException('Paddy grade not found or inactive.');

    const weightEstimated = dto.weightKg === undefined;
    const weightKg = dto.weightKg ?? estimateKg(dto.bagCount);
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

  /**
   * ONE intake with several sizes ("17 bags of Size 4 and 3 bags of Size 5"), saved together: either every size is saved or none is, so a
   * failure halfway can never leave half an intake behind (and a retry can never double one up). Each size becomes its own entry, so each
   * keeps its own approval, and they share one intake reference. By default it is also submitted for approval in the same step.
   */
  async createIntake(dto: CreatePaddyIntakeDto, actor: AuthenticatedUser) {
    assertScope(actor, 'FARM', dto.farmId, 'this farm');
    const submit = dto.submit !== false;
    if (submit && !actor.permissionCodes?.has(PERMISSIONS.PADDY_SUBMIT)) {
      throw new ForbiddenException('You can save an intake as a draft, but you do not have permission to submit it for approval.');
    }

    const farmRow = await this.prisma.farm.findUnique({ where: { id: dto.farmId } });
    if (!farmRow || !farmRow.isActive) throw new BadRequestException('Farm not found or inactive.');

    const gradeIds = dto.lines.map((l) => l.paddyGradeId);
    const grades = await this.prisma.paddyGrade.findMany({ where: { id: { in: gradeIds } } });
    const labelOf = (id: string) => grades.find((g) => g.id === id)?.label ?? 'A size';
    const twice = gradeIds.find((id, i) => gradeIds.indexOf(id) !== i);
    if (twice) throw new BadRequestException(`${labelOf(twice)} is on the list twice. Put all of its bags on one line.`);
    const unusable = gradeIds.find((id) => !grades.some((g) => g.id === id && g.isActive));
    if (unusable) throw new BadRequestException('One of the sizes was not found or is no longer in use. Choose the size again.');

    const result = await this.prisma.$transaction(async (tx) => {
      const intakeRef = await this.ledger.generateNumber(tx, 'IN', 'paddyIntake');
      const rows: Awaited<ReturnType<typeof tx.paddyEntry.create>>[] = [];
      for (const line of dto.lines) {
        const weightEstimated = line.weightKg === undefined;
        const weightKg = line.weightKg ?? estimateKg(line.bagCount);
        const entryNumber = await this.ledger.generateNumber(tx, 'PE', 'paddyEntry');
        const batchNumber = await this.ledger.generateNumber(tx, 'PB', 'paddyBatch');
        const created = await tx.paddyEntry.create({
          data: {
            entryNumber,
            batchNumber,
            intakeRef,
            farmId: dto.farmId,
            entryDate: new Date(dto.entryDate),
            paddyTypeId: dto.paddyTypeId,
            paddyGradeId: line.paddyGradeId,
            weightKg,
            weightEstimated,
            bagCount: line.bagCount,
            avgBagWeightKg: weightKg / line.bagCount,
            moisturePercent: dto.moisturePercent,
            qualityGrade: dto.qualityGrade,
            harvestDate: dto.harvestDate ? new Date(dto.harvestDate) : null,
            supplierName: dto.supplierName,
            storageLocation: dto.storageLocation,
            notes: dto.notes,
            status: submit ? 'SUBMITTED' : 'DRAFT',
            submittedAt: submit ? new Date() : null,
            submittedById: actor.id,
          },
        });
        await this.audit.record(
          { userId: actor.id, action: submit ? 'paddy.create_and_submit' : 'paddy.create', entity: 'PaddyEntry', entityId: created.id, afterValue: { ...created, intakeRef } },
          tx,
        );
        rows.push(created);
      }
      return { intakeRef, rows };
    });

    const entries = result.rows.map((r) => ({
      id: r.id,
      entryNumber: r.entryNumber,
      paddyGradeId: r.paddyGradeId,
      gradeLabel: labelOf(r.paddyGradeId),
      bagCount: r.bagCount,
      weightKg: Number(r.weightKg),
      weightEstimated: r.weightEstimated,
      status: r.status as string,
    }));
    return {
      intakeRef: result.intakeRef,
      status: submit ? 'SUBMITTED' : 'DRAFT',
      submitted: submit,
      farmName: farmRow.name as string,
      totalBags: entries.reduce((t, e) => t + e.bagCount, 0),
      totalKg: entries.reduce((t, e) => t + e.weightKg, 0),
      anyWeightEstimated: entries.some((e) => e.weightEstimated),
      entries,
    };
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
          // provided in this update - leaves the existing flag alone
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

  /** The one method in this service that actually moves inventory - the
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

  /** A genuine question-and-answer thread, deliberately separate from
   * approve/reject - a Farm Supervisor asking "what's the moisture
   * reading here?" shouldn't force a reject-and-resubmit cycle just to
   * get an answer. Reuses findById's own scope check, so a Farm Manager
   * can only see/add comments on their own farm's entries, exactly the
   * same boundary as everything else on this entity. */
  async listComments(paddyEntryId: string, actor: AuthenticatedUser) {
    await this.findById(paddyEntryId, actor); // throws if not found or out of scope
    return this.prisma.paddyEntryComment.findMany({
      where: { paddyEntryId },
      include: { author: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addComment(paddyEntryId: string, dto: CreatePaddyEntryCommentDto, actor: AuthenticatedUser) {
    await this.findById(paddyEntryId, actor);
    const comment = await this.prisma.paddyEntryComment.create({
      data: { paddyEntryId, authorId: actor.id, message: dto.message },
      include: { author: true },
    });
    await this.audit.record({ userId: actor.id, action: 'paddy_entry.comment', entity: 'PaddyEntry', entityId: paddyEntryId, afterValue: { message: dto.message } });
    return comment;
  }
}
