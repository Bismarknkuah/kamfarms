import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { scopedLocationIds } from '../common/utils/scope.util';
import { DAY_MS, bucketKeys, bucketOf, clampDays, kwhPerTonne, num, pct, round0 } from './overview-analytics.util';

type Trend<T> = { bucket: string } & T;

/**
 * The numbers behind the Overview pages of the Farm Director, Warehouse Supervisor, Operations Manager and top management. Read-only, aggregated in the
 * database, and limited to the places the caller is scoped to (a person with a global scope sees everything). Nothing here changes any record.
 */
@Injectable()
export class OverviewAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private window(rawDays?: string | number) {
    const days = clampDays(rawDays);
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY_MS);
    const { keys, unit } = bucketKeys(days, now);
    return { days, now, since, keys, unit };
  }

  /** The ids the caller may look at, or null for "everything". */
  private allowed(actor: AuthenticatedUser, type: 'FARM' | 'WAREHOUSE' | 'MILLING_CENTER'): string[] | null {
    const s = scopedLocationIds(actor, type);
    return s.isGlobal ? null : s.ids;
  }

  async farms(actor: AuthenticatedUser, rawDays?: string) {
    const w = this.window(rawDays);
    const ids = this.allowed(actor, 'FARM');
    const farms = await this.prisma.farm.findMany({ where: { isActive: true, ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const farmIds = farms.map((f) => f.id);
    if (farmIds.length === 0) return { days: w.days, unit: w.unit, farms: [], trend: [], totals: this.zeroFarmTotals() };

    const [entries, pending, rejected, balances, shipments] = await Promise.all([
      this.prisma.paddyEntry.findMany({
        where: { farmId: { in: farmIds }, status: 'APPROVED', entryDate: { gte: w.since } },
        select: { farmId: true, entryDate: true, weightKg: true, moisturePercent: true, paddyGrade: { select: { label: true } } },
      }),
      this.prisma.paddyEntry.groupBy({ by: ['farmId'], where: { farmId: { in: farmIds }, status: 'SUBMITTED' }, _count: { _all: true } }),
      this.prisma.paddyEntry.groupBy({ by: ['farmId'], where: { farmId: { in: farmIds }, status: 'REJECTED', updatedAt: { gte: w.since } }, _count: { _all: true } }),
      this.prisma.inventoryBalance.findMany({ where: { locationType: 'FARM', locationId: { in: farmIds }, paddyGradeId: { not: null } }, select: { locationId: true, quantityKg: true } }),
      this.prisma.shipment.findMany({
        where: { farmId: { in: farmIds }, departedAt: { gte: w.since } },
        select: { farmId: true, expectedKg: true, receivedAt: true, deliveryReport: { select: { totalDeliveryCost: true } } },
      }),
    ]);

    const rows = new Map(farms.map((f) => [f.id, { id: f.id, name: f.name, stockKg: 0, intakeKg: 0, pendingEntries: 0, rejectedEntries: 0, dispatchedKg: 0, inTransitKg: 0, deliveryCost: 0, moistureSum: 0, moistureN: 0 }]));
    for (const b of balances) { const r = rows.get(b.locationId); if (r) r.stockKg += num(b.quantityKg); }
    for (const p of pending) { const r = rows.get(p.farmId); if (r) r.pendingEntries = p._count._all; }
    for (const p of rejected) { const r = rows.get(p.farmId); if (r) r.rejectedEntries = p._count._all; }
    for (const s of shipments) {
      const r = rows.get(s.farmId); if (!r) continue;
      r.dispatchedKg += num(s.expectedKg);
      if (!s.receivedAt) r.inTransitKg += num(s.expectedKg);
      r.deliveryCost += num(s.deliveryReport?.totalDeliveryCost);
    }
    const trendMap = new Map<string, Record<string, number>>(w.keys.map((k) => [k, {}]));
    const bySize = new Map<string, number>();
    for (const e of entries) {
      const r = rows.get(e.farmId); if (!r) continue;
      const kg = num(e.weightKg);
      r.intakeKg += kg;
      if (e.moisturePercent !== null) { r.moistureSum += num(e.moisturePercent); r.moistureN += 1; }
      const b = trendMap.get(bucketOf(e.entryDate, w.unit));
      if (b) b[r.name] = (b[r.name] ?? 0) + kg;
      bySize.set(e.paddyGrade.label, (bySize.get(e.paddyGrade.label) ?? 0) + kg);
    }

    const out = [...rows.values()].map((r) => ({
      id: r.id, name: r.name, stockKg: round0(r.stockKg), intakeKg: round0(r.intakeKg), pendingEntries: r.pendingEntries, rejectedEntries: r.rejectedEntries,
      dispatchedKg: round0(r.dispatchedKg), inTransitKg: round0(r.inTransitKg), deliveryCost: Math.round(r.deliveryCost * 100) / 100,
      costPerTonne: r.dispatchedKg > 0 ? Math.round((r.deliveryCost / (r.dispatchedKg / 1000)) * 100) / 100 : null,
      avgMoisture: r.moistureN > 0 ? Math.round((r.moistureSum / r.moistureN) * 10) / 10 : null,
    }));
    const sum = (f: (r: (typeof out)[number]) => number) => out.reduce((a, r) => a + f(r), 0);
    return {
      days: w.days, unit: w.unit, farms: out,
      trend: w.keys.map((k) => ({ bucket: k, total: round0(Object.values(trendMap.get(k) ?? {}).reduce((a, v) => a + v, 0)), byFarm: Object.fromEntries(Object.entries(trendMap.get(k) ?? {}).map(([n, v]) => [n, round0(v)])) })),
      bySize: [...bySize.entries()].map(([label, kg]) => ({ label, kg: round0(kg) })).sort((a, b) => b.kg - a.kg),
      totals: {
        stockKg: sum((r) => r.stockKg), intakeKg: sum((r) => r.intakeKg), pendingEntries: sum((r) => r.pendingEntries), rejectedEntries: sum((r) => r.rejectedEntries),
        dispatchedKg: sum((r) => r.dispatchedKg), inTransitKg: sum((r) => r.inTransitKg), deliveryCost: Math.round(sum((r) => r.deliveryCost) * 100) / 100,
      },
    };
  }

  private zeroFarmTotals() {
    return { stockKg: 0, intakeKg: 0, pendingEntries: 0, rejectedEntries: 0, dispatchedKg: 0, inTransitKg: 0, deliveryCost: 0 };
  }

  async warehouses(actor: AuthenticatedUser, rawDays?: string) {
    const w = this.window(rawDays);
    const ids = this.allowed(actor, 'WAREHOUSE');
    const whs = await this.prisma.warehouse.findMany({ where: { isActive: true, ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const whIds = whs.map((x) => x.id);
    if (whIds.length === 0) return { days: w.days, unit: w.unit, warehouses: [], trend: [], totals: { paddyKg: 0, packagedKg: 0, incomingKg: 0, receivedKg: 0, varianceKg: 0, awaitingReview: 0 } };

    const [balances, incoming, received] = await Promise.all([
      this.prisma.inventoryBalance.findMany({ where: { locationType: 'WAREHOUSE', locationId: { in: whIds } }, select: { locationId: true, quantityKg: true, paddyGradeId: true, productId: true } }),
      this.prisma.shipment.findMany({ where: { warehouseId: { in: whIds }, receivedAt: null }, select: { warehouseId: true, expectedKg: true } }),
      this.prisma.shipment.findMany({ where: { warehouseId: { in: whIds }, receivedAt: { gte: w.since } }, select: { warehouseId: true, receivedAt: true, receivedKg: true, varianceKg: true, varianceRequiresApproval: true } }),
    ]);
    const rows = new Map(whs.map((x) => [x.id, { id: x.id, name: x.name, paddyKg: 0, packagedKg: 0, incomingKg: 0, incomingTrucks: 0, receivedKg: 0, varianceKg: 0, awaitingReview: 0 }]));
    for (const b of balances) {
      const r = rows.get(b.locationId); if (!r) continue;
      if (b.paddyGradeId) r.paddyKg += num(b.quantityKg); else if (b.productId) r.packagedKg += num(b.quantityKg);
    }
    for (const s of incoming) { const r = rows.get(s.warehouseId); if (r) { r.incomingKg += num(s.expectedKg); r.incomingTrucks += 1; } }
    const trendMap = new Map<string, Record<string, number>>(w.keys.map((k) => [k, {}]));
    for (const s of received) {
      const r = rows.get(s.warehouseId); if (!r || !s.receivedAt) continue;
      r.receivedKg += num(s.receivedKg); r.varianceKg += num(s.varianceKg);
      if (s.varianceRequiresApproval) r.awaitingReview += 1;
      const b = trendMap.get(bucketOf(s.receivedAt, w.unit));
      if (b) b[r.name] = (b[r.name] ?? 0) + num(s.receivedKg);
    }
    const out = [...rows.values()].map((r) => ({
      ...r, paddyKg: round0(r.paddyKg), packagedKg: round0(r.packagedKg), incomingKg: round0(r.incomingKg), receivedKg: round0(r.receivedKg), varianceKg: round0(r.varianceKg),
      variancePct: pct(Math.abs(r.varianceKg), r.receivedKg),
    }));
    const sum = (f: (r: (typeof out)[number]) => number) => out.reduce((a, r) => a + f(r), 0);
    return {
      days: w.days, unit: w.unit, warehouses: out,
      trend: w.keys.map((k) => ({ bucket: k, total: round0(Object.values(trendMap.get(k) ?? {}).reduce((a, v) => a + v, 0)), byWarehouse: Object.fromEntries(Object.entries(trendMap.get(k) ?? {}).map(([n, v]) => [n, round0(v)])) })),
      totals: { paddyKg: sum((r) => r.paddyKg), packagedKg: sum((r) => r.packagedKg), incomingKg: sum((r) => r.incomingKg), receivedKg: sum((r) => r.receivedKg), varianceKg: sum((r) => r.varianceKg), awaitingReview: sum((r) => r.awaitingReview) },
    };
  }

  async operations(actor: AuthenticatedUser, rawDays?: string) {
    const w = this.window(rawDays);
    const ids = this.allowed(actor, 'MILLING_CENTER');
    const mills = await this.prisma.millingCenter.findMany({ where: { isActive: true, ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const millIds = mills.map((m) => m.id);
    const empty = { days: w.days, unit: w.unit, mills: [], trend: [], machines: { RUNNING: 0, IDLE: 0, MAINTENANCE: 0, FAULT: 0, OFFLINE: 0 }, totals: { processedKg: 0, recoveredKg: 0, brokenKg: 0, hullKg: 0, lossKg: 0, recoveryPct: null, kwhPerTonne: null, runs: 0, flagged: 0, awaitingApproval: 0 } };
    if (millIds.length === 0) return empty;

    const [records, pendingApproval, machines] = await Promise.all([
      this.prisma.productionRecord.findMany({
        where: { millingCenterId: { in: millIds }, status: 'APPROVED', date: { gte: w.since } },
        select: { millingCenterId: true, date: true, paddyProcessedKg: true, recoveredRiceKg: true, brokenRiceKg: true, riceHullKg: true, wasteLossKg: true, energyConsumptionKwh: true, machineRuntimeMin: true, massBalanceFlag: true },
      }),
      this.prisma.productionRecord.count({ where: { millingCenterId: { in: millIds }, status: 'SUBMITTED' } }),
      this.prisma.machine.groupBy({ by: ['status'], where: { millingCenterId: { in: millIds } }, _count: { _all: true } }),
    ]);

    const rows = new Map(mills.map((m) => [m.id, { id: m.id, name: m.name, processedKg: 0, recoveredKg: 0, brokenKg: 0, hullKg: 0, lossKg: 0, kwh: 0, kwhProcessed: 0, runtimeMin: 0, runs: 0, flagged: 0 }]));
    const tMap = new Map<string, { processed: number; recovered: number; kwh: number; kwhProcessed: number }>(w.keys.map((k) => [k, { processed: 0, recovered: 0, kwh: 0, kwhProcessed: 0 }]));
    for (const rec of records) {
      const r = rows.get(rec.millingCenterId); if (!r) continue;
      const p = num(rec.paddyProcessedKg);
      r.processedKg += p; r.recoveredKg += num(rec.recoveredRiceKg); r.brokenKg += num(rec.brokenRiceKg); r.hullKg += num(rec.riceHullKg); r.lossKg += num(rec.wasteLossKg);
      r.runtimeMin += num(rec.machineRuntimeMin); r.runs += 1; if (rec.massBalanceFlag) r.flagged += 1;
      const kwh = num(rec.energyConsumptionKwh);
      if (kwh > 0) { r.kwh += kwh; r.kwhProcessed += p; }
      const b = tMap.get(bucketOf(rec.date, w.unit));
      if (b) { b.processed += p; b.recovered += num(rec.recoveredRiceKg); if (kwh > 0) { b.kwh += kwh; b.kwhProcessed += p; } }
    }
    const out = [...rows.values()].map((r) => ({
      id: r.id, name: r.name, processedKg: round0(r.processedKg), recoveredKg: round0(r.recoveredKg), brokenKg: round0(r.brokenKg), hullKg: round0(r.hullKg), lossKg: round0(r.lossKg),
      recoveryPct: pct(r.recoveredKg, r.processedKg), brokenPct: pct(r.brokenKg, r.processedKg), kwhPerTonne: kwhPerTonne(r.kwh, r.kwhProcessed),
      runs: r.runs, flagged: r.flagged, runtimeHours: Math.round((r.runtimeMin / 60) * 10) / 10,
    }));
    const sum = (f: (r: (typeof out)[number]) => number) => out.reduce((a, r) => a + f(r), 0);
    const totKwh = [...rows.values()].reduce((a, r) => a + r.kwh, 0);
    const totKwhProcessed = [...rows.values()].reduce((a, r) => a + r.kwhProcessed, 0);
    const machineCounts: Record<string, number> = { RUNNING: 0, IDLE: 0, MAINTENANCE: 0, FAULT: 0, OFFLINE: 0 };
    for (const m of machines) machineCounts[m.status] = m._count._all;
    const totalProcessed = sum((r) => r.processedKg);
    return {
      days: w.days, unit: w.unit, mills: out,
      trend: w.keys.map((k): Trend<{ processedKg: number; recoveryPct: number | null; kwhPerTonne: number | null }> => {
        const b = tMap.get(k)!;
        return { bucket: k, processedKg: round0(b.processed), recoveryPct: pct(b.recovered, b.processed), kwhPerTonne: kwhPerTonne(b.kwh, b.kwhProcessed) };
      }),
      machines: machineCounts,
      totals: {
        processedKg: totalProcessed, recoveredKg: sum((r) => r.recoveredKg), brokenKg: sum((r) => r.brokenKg), hullKg: sum((r) => r.hullKg), lossKg: sum((r) => r.lossKg),
        recoveryPct: pct(sum((r) => r.recoveredKg), totalProcessed), kwhPerTonne: kwhPerTonne(totKwh, totKwhProcessed), runs: sum((r) => r.runs), flagged: sum((r) => r.flagged), awaitingApproval: pendingApproval,
      },
    };
  }

  /** Top management: all three at once, so one request paints the whole page. */
  async executive(actor: AuthenticatedUser, rawDays?: string) {
    const [farm, warehouse, operations] = await Promise.all([this.farms(actor, rawDays), this.warehouses(actor, rawDays), this.operations(actor, rawDays)]);
    return { farm, warehouse, operations };
  }
}
