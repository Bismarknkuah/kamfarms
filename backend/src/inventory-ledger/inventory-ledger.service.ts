import { BadRequestException, Injectable } from '@nestjs/common';
import { InventoryTxnType, LocationType, Prisma } from '@prisma/client';
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
 *   business action — never called standalone from a controller.
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
   * heavy concurrent load — Phase 13 hardening should replace this with a
   * Postgres sequence or advisory lock per prefix. Documented, not hidden. */
  async generateNumber(
    tx: Prisma.TransactionClient,
    prefix: string,
    model: 'inventoryTransaction' | 'paddyEntry' | 'paddyBatch' | 'deliveryOrder' | 'deliveryReport' | 'shipment',
  ): Promise<string> {
    const year = new Date().getFullYear();
    const yearPrefix = `${prefix}-${year}-`;
    let count: number;
    switch (model) {
      case 'inventoryTransaction':
        count = await tx.inventoryTransaction.count({ where: { transactionNumber: { startsWith: yearPrefix } } });
        break;
      case 'paddyEntry':
        count = await tx.paddyEntry.count({ where: { entryNumber: { startsWith: yearPrefix } } });
        break;
      case 'paddyBatch':
        count = await tx.paddyBatch.count({ where: { batchNumber: { startsWith: yearPrefix } } });
        break;
      case 'deliveryOrder':
        count = await tx.deliveryOrder.count({ where: { orderNumber: { startsWith: yearPrefix } } });
        break;
      case 'deliveryReport':
        count = await tx.deliveryReport.count({ where: { reportNumber: { startsWith: yearPrefix } } });
        break;
      case 'shipment':
        count = await tx.shipment.count({ where: { shipmentNumber: { startsWith: yearPrefix } } });
        break;
    }
    return `${yearPrefix}${String(count + 1).padStart(6, '0')}`;
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
   * 500) if the result would go negative — RULE 1: never allow negative
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

  /** Read-only point lookup for a single balance — for services that
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
   * this — the ledger has correctly recorded every movement since this
   * whole system was built, but nothing has ever actually exposed that
   * history to a person. Confirmed directly: zero controllers queried
   * InventoryTransaction anywhere before this. Every transaction
   * already carries who, what, when, source, destination, batch, and
   * reason — this just makes it queryable rather than adding anything
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
      take: 200, // a real ceiling, not an unbounded query — this is a trace/audit tool, not a bulk export
    });
  }
}
