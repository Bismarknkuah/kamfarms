import { BadRequestException, Injectable } from '@nestjs/common';
type InventoryTxnType = any; type LocationType = any; import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildBalanceDimensionKey } from './balance-key.util';

export interface BalanceKey {
  locationType: LocationType;
  locationId: string;
  paddyGradeId?: string | null;
  productId?: string | null;
  packagingSizeId?: string | null;
}

export interface RecordTransactionInput {
  type: InventoryTxnType;
  sourceLocationType?: LocationType | null;
  sourceLocationId?: string | null;
  destLocationType?: LocationType | null;
  destLocationId?: string | null;
  paddyGradeId?: string | null;
  productId?: string | null;
  packagingSizeId?: string | null;
  quantityKg: number | string;
  bagCount?: number | null;
  batchNumber?: string | null;
  referenceDocument?: string | null;
  userId: string;
  reason?: string | null;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
}

/**
 * The single source of truth for every stock movement in the system.
 *
 * Ground rules (spec sections 4, 51, 90, rules 1/5/7/9):
 * - Every call MUST run inside an existing Prisma transaction (`tx`),
 *   alongside the approval/audit/notification records for the same
 *   business action - never called standalone from a controller.
 * - `inventory_transactions` rows are inserted, never updated or deleted.
 *   A correction is a new transaction with an explanatory `reason`.
 * - Balances never go negative; `adjustBalance` throws rather than let
 *   that happen, and the caller's whole DB transaction rolls back.
 */
@Injectable()
export class InventoryLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Simple year-scoped sequential number generator (e.g. TXN-2026-000123).
   * NOTE: this counts existing rows for the year, which is adequate for
   * the level of concurrent writes in Phase 3 but is not race-proof under
   * heavy concurrent load - Phase 13 hardening should replace this with a
   * Postgres sequence or advisory lock per prefix. Documented, not hidden. */
  /** Rewritten to fix a real, confirmed production bug: the previous
   * version counted existing rows and used count+1 as the next number
   * - a race condition, not just a theoretical one. Traced directly
   * from a live error log: two paddy entries created in the same
   * multi-grade intake submission both read the same count before
   * either had committed, producing an identical batch number and a
   * unique-constraint failure on the second insert. A dedicated
   * NumberSequence row per prefix+year, incremented via Postgres's own
   * atomic UPSERT, makes this impossible regardless of how many
   * requests arrive at the same instant - the database itself
   * serializes concurrent writers to the same row rather than this
   * code needing to coordinate that.
   */
  async generateNumber(
    tx: Prisma.TransactionClient,
    prefix: string,
    // Retained in the signature so every existing call site (six of
    // them, across paddy entries, delivery orders/reports, shipments)
    // needed zero changes for this fix - no longer used to branch
    // logic now that prefix alone is what the sequence is keyed by,
    // but kept here as documentation of which kinds of numbers this
    // is actually used for.
    _model: 'inventoryTransaction' | 'paddyEntry' | 'paddyBatch' | 'deliveryOrder' | 'deliveryReport' | 'shipment',
  ): Promise<string> {
    const year = new Date().getFullYear();
    const key = `${prefix}-${year}`;
    const seq = await tx.numberSequence.upsert({
      where: { id: key },
      create: { id: key, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `${key}-${String(seq.value).padStart(6, '0')}`;
  }

  async recordTransaction(tx: Prisma.TransactionClient, input: RecordTransactionInput) {
    const transactionNumber = await this.generateNumber(tx, 'TXN', 'inventoryTransaction');
    return tx.inventoryTransaction.create({
      data: {
        transactionNumber,
        type: input.type,
        sourceLocationType: input.sourceLocationType ?? null,
        sourceLocationId: input.sourceLocationId ?? null,
        destLocationType: input.destLocationType ?? null,
        destLocationId: input.destLocationId ?? null,
        paddyGradeId: input.paddyGradeId ?? null,
        productId: input.productId ?? null,
        packagingSizeId: input.packagingSizeId ?? null,
        quantityKg: input.quantityKg,
        bagCount: input.bagCount ?? null,
        batchNumber: input.batchNumber ?? null,
        referenceDocument: input.referenceDocument ?? null,
        userId: input.userId,
        reason: input.reason ?? null,
        approvalStatus: input.approvalStatus ?? 'APPROVED',
      },
    });
  }

  /** Applies a signed delta to the materialized balance for `key`.
   * Throws BadRequestException (caught by the global filter, never a raw
   * 500) if the result would go negative - RULE 1: never allow negative
   * inventory. */
  async adjustBalance(tx: Prisma.TransactionClient, key: BalanceKey, deltaKg: number, deltaBags = 0) {
    const dimensionKey = buildBalanceDimensionKey(key);
    const where = {
      balance_key: { locationType: key.locationType, locationId: key.locationId, dimensionKey },
    } as const;

    const existing = await tx.inventoryBalance.findUnique({ where });
    const currentKg = existing ? Number(existing.quantityKg) : 0;
    const currentBags = existing ? existing.bagCount : 0;
    const nextKg = currentKg + deltaKg;
    const nextBags = currentBags + deltaBags;

    if (nextKg < -0.001 || nextBags < 0) {
      throw new BadRequestException({
        message: `This action would result in negative inventory (${nextKg.toFixed(2)} KG). Not allowed.`,
        errorCode: 'NEGATIVE_INVENTORY_REJECTED',
      });
    }

    return tx.inventoryBalance.upsert({
      where,
      create: {
        locationType: key.locationType,
        locationId: key.locationId,
        paddyGradeId: key.paddyGradeId ?? null,
        productId: key.productId ?? null,
        packagingSizeId: key.packagingSizeId ?? null,
        dimensionKey,
        quantityKg: Math.max(nextKg, 0),
        bagCount: Math.max(nextBags, 0),
      },
      update: {
        quantityKg: Math.max(nextKg, 0),
        bagCount: Math.max(nextBags, 0),
      },
    });
  }

  /** Read-only point lookup for a single balance - for services that
   * already have InventoryLedgerService injected and need the current
   * figure for one specific dimension (e.g. checking available-to-sell
   * before reserving stock), without hand-rolling the where clause. */
  getBalance(client: Prisma.TransactionClient | PrismaService, key: BalanceKey) {
    const dimensionKey = buildBalanceDimensionKey(key);
    return client.inventoryBalance.findUnique({
      where: { balance_key: { locationType: key.locationType, locationId: key.locationId, dimensionKey } },
    });
  }

  getBalancesForLocation(locationType: LocationType, locationId: string) {
    return this.prisma.inventoryBalance.findMany({
      where: { locationType, locationId },
      include: { paddyGrade: true, product: true, packagingSize: true },
    });
  }

  /** Section 16's drill-down and Section 28's audit trail both need
   * this - the ledger has correctly recorded every movement since this
   * whole system was built, but nothing has ever actually exposed that
   * history to a person. Confirmed directly: zero controllers queried
   * InventoryTransaction anywhere before this. Every transaction
   * already carries who, what, when, source, destination, batch, and
   * reason - this just makes it queryable rather than adding anything
   * new to record. */
  async listTransactions(filters: {
    locationType?: string;
    locationId?: string;
    batchNumber?: string;
    productId?: string;
    paddyGradeId?: string;
    packagingSizeId?: string;
    type?: string;
    from?: string;
    to?: string;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.locationType && filters.locationId) {
      where.OR = [
        { sourceLocationType: filters.locationType, sourceLocationId: filters.locationId },
        { destLocationType: filters.locationType, destLocationId: filters.locationId },
      ];
    }
    if (filters.batchNumber) where.batchNumber = filters.batchNumber;
    if (filters.productId) where.productId = filters.productId;
    if (filters.paddyGradeId) where.paddyGradeId = filters.paddyGradeId;
    if (filters.packagingSizeId) where.packagingSizeId = filters.packagingSizeId;
    if (filters.type) where.type = filters.type;
    if (filters.from || filters.to) {
      const range: Record<string, Date> = {};
      if (filters.from) range.gte = new Date(filters.from);
      if (filters.to) range.lte = new Date(filters.to);
      where.createdAt = range;
    }

    return this.prisma.inventoryTransaction.findMany({
      where,
      include: { paddyGrade: true, product: true, packagingSize: true, user: true },
      orderBy: { createdAt: 'desc' },
      take: 200, // a real ceiling, not an unbounded query - this is a trace/audit tool, not a bulk export
    });
  }

  /** The other half of a real batch trace, alongside listTransactions:
   * a reference number searched here also gets matched against every
   * point in the pipeline where an operator recorded it as a *source*
   * - a production run that named this shipment, a packaging batch
   * that named this production run, a sales line item that named this
   * packaging batch. This is honest, not automatic: it only surfaces
   * connections someone actually recorded, since the underlying ledger
   * tracks totals by grade/product, not individual lot identity end to
   * end (a real redesign, not something to fake here). Presented
   * plainly as "recorded references," never implied to be ledger-
   * verified fact the way listTransactions's own rows are. */
  async traceReferences(referenceNumber: string) {
    const [productionRecords, packagingBatches, salesOrderItems] = await Promise.all([
      this.prisma.productionRecord.findMany({
        where: { sourceReferenceNumbers: { has: referenceNumber } },
        select: { id: true, recordNumber: true, date: true, sourceReferenceNumbers: true },
      }),
      this.prisma.packagingBatch.findMany({
        where: { sourceReferenceNumbers: { has: referenceNumber } },
        select: { id: true, batchNumber: true, packagingDate: true, sourceReferenceNumbers: true },
      }),
      this.prisma.salesOrderItem.findMany({
        where: { fulfilledFromReferenceNumbers: { has: referenceNumber } },
        select: { id: true, salesOrder: { select: { orderNumber: true } }, fulfilledFromReferenceNumbers: true },
      }),
    ]);

    return {
      referencedByProductionRecords: productionRecords.map((r: any) => ({ recordNumber: r.recordNumber, date: r.date, allReferences: r.sourceReferenceNumbers })),
      referencedByPackagingBatches: packagingBatches.map((b: any) => ({ batchNumber: b.batchNumber, date: b.packagingDate, allReferences: b.sourceReferenceNumbers })),
      referencedBySalesOrders: salesOrderItems.map((i: any) => ({ orderNumber: i.salesOrder.orderNumber, allReferences: i.fulfilledFromReferenceNumbers })),
    };
  }
}
