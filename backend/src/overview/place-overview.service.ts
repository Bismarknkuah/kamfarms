import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { scopedLocationIds } from '../common/utils/scope.util';
import { DAY_MS, bucketKeys, bucketOf, clampDays, kwhPerTonne, num, pct, round0 } from './overview-analytics.util';

/**
 * The Overview of one farm, one warehouse or one milling center, for the people who work there (Farm Manager, Warehouse
 * Manager, Operations Officer). It contains only the places the caller is assigned to: someone assigned to Farm A gets Farm A and
 * can never get Farm B, whatever they ask for. Read-only.
 */
@Injectable()
export class PlaceOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  private window(rawDays?: string | number) {
    const days = clampDays(rawDays);
    const now = new Date();
    const { keys, unit } = bucketKeys(days, now);
    return { days, now, since: new Date(now.getTime() - days * DAY_MS), keys, unit };
  }

  /** Only the caller's own places. A person with no place gets nothing, never "everything". */
  private mine(actor: AuthenticatedUser, type: 'FARM' | 'WAREHOUSE' | 'MILLING_CENTER'): string[] | null {
    const s = scopedLocationIds(actor, type);
    return s.isGlobal ? null : s.ids;
  }

  async farms(actor: AuthenticatedUser, rawDays?: string) {
    const w = this.window(rawDays);
    const ids = this.mine(actor, 'FARM');
    const farms = await this.prisma.farm.findMany({ where: { isActive: true, ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const places = await Promise.all(farms.map(async (f) => {
      const [entries, stock, pending, rejected, shipments, recent] = await Promise.all([
        this.prisma.paddyEntry.findMany({ where: { farmId: f.id, status: 'APPROVED', entryDate: { gte: w.since } }, select: { entryDate: true, weightKg: true, bagCount: true, moisturePercent: true, paddyGrade: { select: { label: true } } } }),
        this.prisma.inventoryBalance.findMany({ where: { locationType: 'FARM', locationId: f.id, paddyGradeId: { not: null } }, select: { quantityKg: true, bagCount: true, paddyGrade: { select: { label: true } } } }),
        this.prisma.paddyEntry.count({ where: { farmId: f.id, status: 'SUBMITTED' } }),
        this.prisma.paddyEntry.count({ where: { farmId: f.id, status: 'REJECTED', updatedAt: { gte: w.since } } }),
        this.prisma.shipment.findMany({ where: { farmId: f.id, departedAt: { gte: w.since } }, select: { expectedKg: true, receivedAt: true, deliveryReport: { select: { totalDeliveryCost: true } } } }),
        this.prisma.paddyEntry.findMany({ where: { farmId: f.id }, orderBy: { entryDate: 'desc' }, take: 6, select: { entryNumber: true, entryDate: true, bagCount: true, status: true, paddyGrade: { select: { label: true } } } }),
      ]);
      const trend = new Map(w.keys.map((k) => [k, 0]));
      let intakeKg = 0; let intakeBags = 0; let moistureSum = 0; let moistureN = 0;
      for (const e of entries) {
        const kg = num(e.weightKg); intakeKg += kg; intakeBags += e.bagCount;
        const k = bucketOf(e.entryDate, w.unit); trend.set(k, (trend.get(k) ?? 0) + kg);
        if (e.moisturePercent !== null) { moistureSum += num(e.moisturePercent); moistureN += 1; }
      }
      let sentKg = 0; let onRoadKg = 0; let cost = 0;
      for (const s of shipments) { sentKg += num(s.expectedKg); if (!s.receivedAt) onRoadKg += num(s.expectedKg); cost += num(s.deliveryReport?.totalDeliveryCost); }
      return {
        id: f.id, name: f.name,
        totals: { intakeKg: round0(intakeKg), intakeBags, stockKg: round0(stock.reduce((a, b) => a + num(b.quantityKg), 0)), stockBags: stock.reduce((a, b) => a + (b.bagCount ?? 0), 0), pending, rejected, sentKg: round0(sentKg), onRoadKg: round0(onRoadKg), deliveryCost: Math.round(cost * 100) / 100, avgMoisture: moistureN ? Math.round((moistureSum / moistureN) * 10) / 10 : null },
        trend: w.keys.map((k) => ({ bucket: k, kg: round0(trend.get(k) ?? 0) })),
        stockBySize: stock.map((b) => ({ label: b.paddyGrade?.label ?? 'Paddy', kg: round0(num(b.quantityKg)), bags: b.bagCount ?? 0 })),
        recent: recent.map((r) => ({ ref: r.entryNumber, date: r.entryDate.toISOString().slice(0, 10), label: r.paddyGrade?.label ?? '', amount: `${r.bagCount} bags`, status: r.status })),
      };
    }));
    return { days: w.days, unit: w.unit, places };
  }

  async warehouses(actor: AuthenticatedUser, rawDays?: string) {
    const w = this.window(rawDays);
    const ids = this.mine(actor, 'WAREHOUSE');
    const whs = await this.prisma.warehouse.findMany({ where: { isActive: true, ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const places = await Promise.all(whs.map(async (x) => {
      const [balances, incoming, received, recent] = await Promise.all([
        this.prisma.inventoryBalance.findMany({ where: { locationType: 'WAREHOUSE', locationId: x.id }, select: { quantityKg: true, bagCount: true, paddyGradeId: true, productId: true, paddyGrade: { select: { label: true } }, packagingSize: { select: { label: true } } } }),
        this.prisma.shipment.findMany({ where: { warehouseId: x.id, receivedAt: null }, orderBy: { departedAt: 'asc' }, select: { shipmentNumber: true, expectedKg: true, departedAt: true, farm: { select: { name: true } } } }),
        this.prisma.shipment.findMany({ where: { warehouseId: x.id, receivedAt: { gte: w.since } }, select: { receivedAt: true, receivedKg: true, varianceKg: true, varianceRequiresApproval: true } }),
        this.prisma.shipment.findMany({ where: { warehouseId: x.id }, orderBy: { departedAt: 'desc' }, take: 6, select: { shipmentNumber: true, departedAt: true, expectedKg: true, receivedAt: true, farm: { select: { name: true } } } }),
      ]);
      const trend = new Map(w.keys.map((k) => [k, 0]));
      let receivedKg = 0; let varianceKg = 0; let review = 0;
      for (const s of received) { receivedKg += num(s.receivedKg); varianceKg += num(s.varianceKg); if (s.varianceRequiresApproval) review += 1; if (s.receivedAt) { const k = bucketOf(s.receivedAt, w.unit); trend.set(k, (trend.get(k) ?? 0) + num(s.receivedKg)); } }
      const paddy = balances.filter((b) => b.paddyGradeId); const rice = balances.filter((b) => b.productId);
      return {
        id: x.id, name: x.name,
        totals: { paddyKg: round0(paddy.reduce((a, b) => a + num(b.quantityKg), 0)), packagedKg: round0(rice.reduce((a, b) => a + num(b.quantityKg), 0)), incomingKg: round0(incoming.reduce((a, s) => a + num(s.expectedKg), 0)), incomingTrucks: incoming.length, receivedKg: round0(receivedKg), varianceKg: round0(varianceKg), variancePct: pct(Math.abs(varianceKg), receivedKg), awaitingReview: review },
        trend: w.keys.map((k) => ({ bucket: k, kg: round0(trend.get(k) ?? 0) })),
        paddyBySize: paddy.map((b) => ({ label: b.paddyGrade?.label ?? 'Paddy', kg: round0(num(b.quantityKg)), bags: b.bagCount ?? 0 })),
        riceBySize: rice.map((b) => ({ label: b.packagingSize?.label ?? 'Rice', kg: round0(num(b.quantityKg)), bags: b.bagCount ?? 0 })),
        onTheWay: incoming.slice(0, 6).map((s) => ({ ref: s.shipmentNumber, from: s.farm?.name ?? '', kg: round0(num(s.expectedKg)), departed: s.departedAt.toISOString().slice(0, 10) })),
        recent: recent.map((r) => ({ ref: r.shipmentNumber, date: r.departedAt.toISOString().slice(0, 10), label: r.farm?.name ?? '', amount: `${round0(num(r.expectedKg)).toLocaleString('en-US')} KG`, status: r.receivedAt ? 'RECEIVED' : 'ON_THE_WAY' })),
      };
    }));
    return { days: w.days, unit: w.unit, places };
  }

  async mills(actor: AuthenticatedUser, rawDays?: string) {
    const w = this.window(rawDays);
    const ids = this.mine(actor, 'MILLING_CENTER');
    const mills = await this.prisma.millingCenter.findMany({ where: { isActive: true, ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const places = await Promise.all(mills.map(async (m) => {
      const [runs, machines, recent, waiting] = await Promise.all([
        this.prisma.productionRecord.findMany({ where: { millingCenterId: m.id, status: 'APPROVED', date: { gte: w.since } }, select: { date: true, paddyProcessedKg: true, recoveredRiceKg: true, brokenRiceKg: true, riceHullKg: true, energyConsumptionKwh: true, machineRuntimeMin: true, massBalanceFlag: true } }),
        this.prisma.machine.findMany({ where: { millingCenterId: m.id }, orderBy: { machineName: 'asc' }, select: { machineName: true, status: true } }),
        this.prisma.productionRecord.findMany({ where: { millingCenterId: m.id }, orderBy: { date: 'desc' }, take: 6, select: { recordNumber: true, date: true, paddyProcessedKg: true, recoveredRiceKg: true, status: true } }),
        this.prisma.productionRecord.count({ where: { millingCenterId: m.id, status: 'SUBMITTED' } }),
      ]);
      const t = new Map(w.keys.map((k) => [k, { p: 0, r: 0 }]));
      let processed = 0; let rice = 0; let broken = 0; let hull = 0; let kwh = 0; let kwhP = 0; let runtime = 0; let flagged = 0;
      for (const r of runs) {
        const p = num(r.paddyProcessedKg); processed += p; rice += num(r.recoveredRiceKg); broken += num(r.brokenRiceKg); hull += num(r.riceHullKg); runtime += num(r.machineRuntimeMin); if (r.massBalanceFlag) flagged += 1;
        const e = num(r.energyConsumptionKwh); if (e > 0) { kwh += e; kwhP += p; }
        const b = t.get(bucketOf(r.date, w.unit)); if (b) { b.p += p; b.r += num(r.recoveredRiceKg); }
      }
      return {
        id: m.id, name: m.name,
        totals: { processedKg: round0(processed), recoveredKg: round0(rice), brokenKg: round0(broken), hullKg: round0(hull), recoveryPct: pct(rice, processed), kwhPerTonne: kwhPerTonne(kwh, kwhP), runs: runs.length, flagged, runtimeHours: Math.round((runtime / 60) * 10) / 10, awaitingApproval: waiting },
        trend: w.keys.map((k) => ({ bucket: k, processedKg: round0(t.get(k)!.p), recoveryPct: pct(t.get(k)!.r, t.get(k)!.p) })),
        machines: machines.map((x) => ({ name: x.machineName, status: x.status })),
        recent: recent.map((r) => ({ ref: r.recordNumber, date: r.date.toISOString().slice(0, 10), label: `${pct(num(r.recoveredRiceKg), num(r.paddyProcessedKg)) ?? 0}% recovered`, amount: `${round0(num(r.paddyProcessedKg)).toLocaleString('en-US')} KG milled`, status: r.status })),
      };
    }));
    return { days: w.days, unit: w.unit, places };
  }
}
