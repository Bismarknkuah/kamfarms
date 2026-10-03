import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustmentRow, ExpenseRow, IntakeRow, LocationKind, MeterDay, Place, ReservedRow, Run, ShipmentRow, Watchlist, buildWatchlist } from './watchlist.engine';

export const DEFAULT_WATCH_DAYS = 30;
const DAY = 86_400_000;

/** Whole days from 7 to 90; a missing, empty or non-numeric value becomes the default of 30. */
export function clampDays(value: unknown): number {
  if (value === null || value === undefined || value === '') return DEFAULT_WATCH_DAYS;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(90, Math.max(7, n)) : DEFAULT_WATCH_DAYS;
}

const LOCATION_KINDS: Record<string, LocationKind> = { FARM: 'FARM', WAREHOUSE: 'WAREHOUSE', MILLING_CENTER: 'MILLING_CENTER' };

/**
 * Loads just the columns the watchlist needs and hands them to the engine.
 * The table and column names were checked against the Prisma schema; the
 * client is used untyped here so that this read-only report can never be
 * the reason the rest of the system fails to build.
 */
@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async watchlist(days?: unknown, now: Date = new Date()): Promise<Watchlist> {
    const windowDays = clampDays(days);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = this.prisma as any;
    const since = (n: number) => new Date(now.getTime() - n * DAY);
    const reach = since(windowDays * 4); // the current period and the three before it

    const [centers, warehouses, farms, runs, meters, shipments, adjustments, reserved, intake, expenses, receipted] = await Promise.all([
      db.millingCenter.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      db.warehouse.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      db.farm.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      db.productionRecord.findMany({
        where: { date: { gte: since(365) }, status: { in: ['SUBMITTED', 'APPROVED'] } },
        select: { id: true, recordNumber: true, millingCenterId: true, date: true, paddyProcessedKg: true, recoveredRiceKg: true, energyConsumptionKwh: true, status: true },
      }),
      db.meterReading.findMany({
        where: { date: { gte: since(Math.max(windowDays * 4, 90)) } },
        select: { date: true, consumption: true, machine: { select: { millingCenterId: true } } },
      }),
      db.shipment.findMany({
        where: { receivedAt: { gte: since(windowDays) } },
        select: { id: true, shipmentNumber: true, warehouseId: true, farmId: true, expectedBags: true, receivedBags: true, receivedAt: true },
      }),
      db.inventoryAdjustment.findMany({
        where: { status: 'APPROVED', approvedAt: { gte: since(windowDays) } },
        select: { id: true, adjustmentNumber: true, locationType: true, locationId: true, adjustmentBags: true, approvedAt: true },
      }),
      db.salesOrder.findMany({
        where: { status: 'RESERVED', allocatedWarehouseId: { not: null } },
        select: { id: true, orderNumber: true, allocatedWarehouseId: true, approvedAt: true, tasks: { select: { createdAt: true } } },
      }),
      db.paddyEntry.findMany({
        where: { entryDate: { gte: reach }, status: { in: ['APPROVED', 'REJECTED'] } },
        select: { farmId: true, entryDate: true, bagCount: true, status: true },
      }),
      db.expense.findMany({
        where: { status: 'APPROVED', date: { gte: reach } },
        select: { id: true, expenseNumber: true, farmId: true, warehouseId: true, amount: true, date: true },
      }),
      // Ids only: the receipt photos themselves are large and are never read here.
      db.expense.findMany({ where: { status: 'APPROVED', date: { gte: reach }, attachmentUrl: { not: null } }, select: { id: true } }),
    ]);

    const places = (rows: { id: string; name: string }[]): Place[] => rows.map((r) => ({ id: r.id, name: r.name }));
    const receiptIds = new Set<string>((receipted as { id: string }[]).map((r) => r.id));

    return buildWatchlist({
      now,
      windowDays,
      centers: places(centers),
      warehouses: places(warehouses),
      farms: places(farms),
      runs: (runs as any[]).map((r): Run => ({
        id: r.id, number: r.recordNumber, centerId: r.millingCenterId, date: new Date(r.date),
        paddyKg: Number(r.paddyProcessedKg), riceKg: Number(r.recoveredRiceKg),
        kwh: r.energyConsumptionKwh === null || r.energyConsumptionKwh === undefined ? null : Number(r.energyConsumptionKwh),
        status: r.status === 'APPROVED' ? 'APPROVED' : 'SUBMITTED',
      })),
      meterDays: (meters as any[]).filter((m) => m.machine?.millingCenterId).map((m): MeterDay => ({ centerId: m.machine.millingCenterId, date: new Date(m.date), kwh: Number(m.consumption) })),
      shipments: (shipments as any[]).filter((s) => s.receivedAt && s.receivedBags !== null && s.receivedBags !== undefined).map((s): ShipmentRow => ({
        id: s.id, number: s.shipmentNumber, warehouseId: s.warehouseId, farmId: s.farmId, expectedBags: Number(s.expectedBags), receivedBags: Number(s.receivedBags), receivedAt: new Date(s.receivedAt),
      })),
      adjustments: (adjustments as any[]).filter((a) => LOCATION_KINDS[a.locationType] && a.approvedAt).map((a): AdjustmentRow => ({
        id: a.id, number: a.adjustmentNumber, locationKind: LOCATION_KINDS[a.locationType], locationId: a.locationId, bags: Number(a.adjustmentBags), at: new Date(a.approvedAt),
      })),
      reserved: (reserved as any[]).map((o): ReservedRow | null => {
        const taskDates = (o.tasks ?? []).map((t: { createdAt: Date }) => new Date(t.createdAt).getTime());
        const since0 = taskDates.length > 0 ? Math.min(...taskDates) : o.approvedAt ? new Date(o.approvedAt).getTime() : null;
        return since0 === null ? null : { id: o.id, number: o.orderNumber, warehouseId: o.allocatedWarehouseId, since: new Date(since0) };
      }).filter((x): x is ReservedRow => x !== null),
      intake: (intake as any[]).map((e): IntakeRow => ({ farmId: e.farmId, date: new Date(e.entryDate), bags: Number(e.bagCount), status: e.status === 'APPROVED' ? 'APPROVED' : 'REJECTED' })),
      expenses: (expenses as any[]).map((e): ExpenseRow => ({
        id: e.id, number: e.expenseNumber, farmId: e.farmId ?? null, warehouseId: e.warehouseId ?? null, amount: Number(e.amount), date: new Date(e.date), hasReceipt: receiptIds.has(e.id),
      })),
    });
  }
}
