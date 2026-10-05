import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { LocationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { scopedLocationIds, assertScope } from '../common/utils/scope.util';

export interface ReviewLine { shipmentId: string; paddyGradeId: string; gradeLabel: string; sentBags: number; receivedBags: number; damagedBags: number; damagedKg: number }
const holdId = (shipmentId: string) => `hold:${shipmentId}`;
const isAdmin = (a: AuthenticatedUser) => a.roles.some((r: any) => r.roleCode === 'ADMIN');
const hasRole = (a: AuthenticatedUser, code: string) => a.roles.some((r: any) => r.roleCode === code);

/**
 * Spoiled or broken bags found when a truck is counted in. The Warehouse Manager reports how many, per size, with a comment. Until the Warehouse
 * Supervisor decides those bags are HELD OUT of the warehouse stock (so nobody can sell them). Approving writes them off as a loss; refusing puts them
 * back into the stock, with the supervisor's reason. Every step, and who took it, shows on the Track dispatch page.
 */
@Injectable()
export class ReceiptReviewsService {
  private readonly log = new Logger(ReceiptReviewsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}
  static holdId = holdId;

  /** Inside the receive transaction. One open review per truck: the next size counted in from the same truck joins it. */
  async record(tx: any, input: { truckRef: string; warehouseId: string; farmId: string | null; line: ReviewLine; note: string; actor: AuthenticatedUser }) {
    const open = await tx.receiptReview.findFirst({ where: { truckRef: input.truckRef, status: 'PENDING' } });
    if (open) {
      const lines = [...(open.lines as ReviewLine[]), input.line];
      const note = String(open.note).includes(input.note) ? open.note : `${open.note} ${input.note}`.slice(0, 1000);
      const row = await tx.receiptReview.update({ where: { id: open.id }, data: { lines, damagedBags: lines.reduce((n, l) => n + l.damagedBags, 0), note } });
      return { row, created: false };
    }
    const count = await tx.receiptReview.count();
    const row = await tx.receiptReview.create({ data: {
      reviewNumber: `RV-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`, truckRef: input.truckRef, warehouseId: input.warehouseId, farmId: input.farmId,
      lines: [input.line], damagedBags: input.line.damagedBags, note: input.note, submittedById: input.actor.id,
    } });
    return { row, created: true };
  }

  /** After the receive has been saved: tell the supervisors of that warehouse. */
  async announce(row: any, actor: AuthenticatedUser) {
    const who = await this.peopleAt(['WAREHOUSE_SUPERVISOR'], 'WAREHOUSE', row.warehouseId);
    await this.tell(who, row, `Damaged bags to review: ${row.truckRef}`, `${row.damagedBags} spoiled or broken bag(s) were reported when truck ${row.truckRef} was counted in. Approve it (the bags are written off) or refuse it (they go back into stock).`, actor);
  }

  approve(id: string, note: string | undefined, actor: AuthenticatedUser) { return this.decide(id, 'APPROVED', note, actor); }
  reject(id: string, note: string | undefined, actor: AuthenticatedUser) { return this.decide(id, 'REJECTED', note, actor); }

  private async decide(id: string, outcome: 'APPROVED' | 'REJECTED', note: string | undefined, actor: AuthenticatedUser) {
    const review = await this.prisma.receiptReview.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('That review was not found.');
    if (!isAdmin(actor) && !hasRole(actor, 'WAREHOUSE_SUPERVISOR')) throw new ForbiddenException('Only the Warehouse Supervisor decides on damaged bags.');
    assertScope(actor, 'WAREHOUSE', review.warehouseId, 'this warehouse');
    if (review.status !== 'PENDING') throw new BadRequestException(`This was already ${review.status === 'APPROVED' ? 'approved' : 'refused'}.`);
    if (review.submittedById === actor.id) throw new ForbiddenException('You cannot decide on a report you made yourself. Someone else must.');
    const comment = (note ?? '').trim();
    if (outcome === 'REJECTED' && comment.length < 3) throw new BadRequestException('Say why you refuse it, so the Warehouse Manager knows.');
    const lines = review.lines as unknown as ReviewLine[];
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const l of lines) {
        const hold = { locationType: LocationType.EXTERNAL, locationId: holdId(l.shipmentId), paddyGradeId: l.paddyGradeId };
        await this.ledger.adjustBalance(tx, hold, -l.damagedKg, -l.damagedBags);
        if (outcome === 'APPROVED') {
          await this.ledger.recordTransaction(tx, {
            type: 'STOCK_LOSS', sourceLocationType: LocationType.EXTERNAL, sourceLocationId: holdId(l.shipmentId), paddyGradeId: l.paddyGradeId, quantityKg: l.damagedKg, bagCount: l.damagedBags,
            batchNumber: review.truckRef, referenceDocument: review.reviewNumber, userId: actor.id, approvalStatus: 'APPROVED',
            reason: `Spoiled or broken on arrival, approved by the Warehouse Supervisor. ${review.note}${comment ? ` Supervisor: ${comment}` : ''}`,
          });
        } else {
          await this.ledger.adjustBalance(tx, { locationType: LocationType.WAREHOUSE, locationId: review.warehouseId, paddyGradeId: l.paddyGradeId }, l.damagedKg, l.damagedBags);
          await this.ledger.recordTransaction(tx, {
            type: 'STOCK_ADJUSTMENT', sourceLocationType: LocationType.EXTERNAL, sourceLocationId: holdId(l.shipmentId), destLocationType: LocationType.WAREHOUSE, destLocationId: review.warehouseId,
            paddyGradeId: l.paddyGradeId, quantityKg: l.damagedKg, bagCount: l.damagedBags, batchNumber: review.truckRef, referenceDocument: review.reviewNumber, userId: actor.id, approvalStatus: 'APPROVED',
            reason: `Damage not accepted by the Warehouse Supervisor: the bags are back in stock. ${comment}`,
          });
        }
      }
      const row = await tx.receiptReview.update({ where: { id }, data: { status: outcome, decidedById: actor.id, decidedAt: new Date(), decisionNote: comment || null } });
      await this.audit.record({ userId: actor.id, action: outcome === 'APPROVED' ? 'receipt.review.approve' : 'receipt.review.reject', entity: 'ReceiptReview', entityId: id, afterValue: { truckRef: review.truckRef, damagedBags: review.damagedBags, note: comment } }, tx);
      return row;
    });
    const people = await this.peopleAt(['FARM_DIRECTOR', 'FARM_MANAGER'], 'FARM', review.farmId ?? '');
    await this.tell([review.submittedById, ...people], updated, `Damaged bags on ${review.truckRef}: ${outcome === 'APPROVED' ? 'approved' : 'refused'}`,
      outcome === 'APPROVED' ? `The Warehouse Supervisor approved it: ${review.damagedBags} bag(s) are written off.${comment ? ` ${comment}` : ''}` : `The Warehouse Supervisor refused it: the ${review.damagedBags} bag(s) are back in stock. ${comment}`, actor);
    return { id: updated.id, status: updated.status };
  }

  private async peopleAt(roleCodes: string[], scopeType: string, scopeId: string): Promise<string[]> {
    const people = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { code: { in: roleCodes as any } }, OR: [{ scopes: { none: {} } }, { scopes: { some: { scopeType: 'GLOBAL' } } }, { scopes: { some: { scopeType: scopeType as any, scopeId } } }] } } },
      select: { id: true },
    });
    return people.map((p) => p.id);
  }
  /** `entityId` is the truck reference: the website opens Track dispatch on that truck. */
  private async tell(userIds: (string | null | undefined)[], row: any, title: string, body: string, actor: AuthenticatedUser) {
    const ids = [...new Set(userIds.filter((u): u is string => !!u && u !== actor.id))];
    if (ids.length > 0) await this.notifications?.notify({ userIds: ids, type: 'receipt.review', title, body, entityType: 'DispatchReceipt', entityId: row.truckRef });
  }
}
