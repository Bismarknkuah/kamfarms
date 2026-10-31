import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PERMISSIONS } from '../common/constants/permissions';
import { DAY_MS, bucketKeys, bucketOf, clampDays, num, round0 } from './overview-analytics.util';

const money = (v: number) => Math.round(v * 100) / 100;

/**
 * The numbers behind the Overview pages of the Sales Officer, the Finance team and the System Administrator.
 * Read-only. A Sales Officer sees their own orders only; Finance and top management see the company's.
 */
@Injectable()
export class BusinessAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private window(rawDays?: string | number) {
    const days = clampDays(rawDays);
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY_MS);
    const { keys, unit } = bucketKeys(days, now);
    return { days, now, since, keys, unit };
  }

  async sales(actor: AuthenticatedUser, rawDays?: string) {
    const w = this.window(rawDays);
    const company = actor.permissionCodes.has(PERMISSIONS.FINANCE_VIEW);
    const mine = company ? {} : { salesOfficerId: actor.id };
    const [owedRows, orders] = await Promise.all([
      this.prisma.invoice.findMany({ where: { status: { in: ['OPEN', 'PARTIALLY_PAID'] }, ...(company ? {} : { salesOrder: { salesOfficerId: actor.id } }) }, select: { totalAmount: true, dueDate: true, allocations: { select: { amountApplied: true } } } }),
      this.prisma.salesOrder.findMany({
      where: { ...mine, createdAt: { gte: w.since }, status: { not: 'DRAFT' } },
      select: { createdAt: true, status: true, totalAmount: true, totalKg: true, customer: { select: { name: true } }, salesOfficer: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    let owed = 0; let owedLate = 0;
    for (const inv of owedRows) {
      const left = Math.max(0, num(inv.totalAmount) - inv.allocations.reduce((a, x) => a + num(x.amountApplied), 0));
      owed += left; if (inv.dueDate && inv.dueDate.getTime() < w.now.getTime()) owedLate += left;
    }
    const trend = new Map(w.keys.map((k) => [k, { bucket: k, orders: 0, value: 0 }]));
    const status: Record<string, number> = {};
    const customers = new Map<string, { name: string; value: number; orders: number }>();
    const officers = new Map<string, { name: string; value: number; orders: number }>();
    let value = 0; let kg = 0; let fulfilled = 0; let inProgress = 0; let lost = 0; let waiting = 0;
    for (const o of orders) {
      const amount = num(o.totalAmount);
      const t = trend.get(bucketOf(o.createdAt, w.unit)); if (t) { t.orders += 1; t.value += amount; }
      status[o.status] = (status[o.status] ?? 0) + 1;
      value += amount; kg += num(o.totalKg);
      if (o.status === 'FULFILLED') fulfilled += 1;
      else if (o.status === 'REJECTED' || o.status === 'CANCELLED') lost += 1;
      else if (o.status === 'SUBMITTED') waiting += 1;
      else inProgress += 1;
      const cName = o.customer?.name ?? 'Unknown customer';
      const c = customers.get(cName) ?? { name: cName, value: 0, orders: 0 }; c.value += amount; c.orders += 1; customers.set(cName, c);
      if (company) { const n = o.salesOfficer ? `${o.salesOfficer.firstName} ${o.salesOfficer.lastName}` : 'Unknown'; const s = officers.get(n) ?? { name: n, value: 0, orders: 0 }; s.value += amount; s.orders += 1; officers.set(n, s); }
    }
    const rank = (m: Map<string, { name: string; value: number; orders: number }>) => [...m.values()].sort((a, b) => b.value - a.value).slice(0, 6).map((r) => ({ ...r, value: money(r.value) }));
    return {
      days: w.days, unit: w.unit, company,
      totals: { owed: money(owed), owedLate: money(owedLate), orders: orders.length, value: money(value), kg: round0(kg), fulfilled, inProgress, waitingForApproval: waiting, lost, averageOrder: orders.length ? money(value / orders.length) : 0 },
      trend: [...trend.values()].map((t) => ({ ...t, value: money(t.value) })),
      status: Object.entries(status).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      topCustomers: rank(customers),
      bySalesperson: company ? rank(officers) : [],
    };
  }

  async finance(actor: AuthenticatedUser, rawDays?: string) {
    const w = this.window(rawDays);
    const [toVerify, toApprove] = await Promise.all([
      this.prisma.payment.count({ where: { status: 'PENDING_VERIFICATION' } }),
      this.prisma.expense.count({ where: { status: 'PENDING' } }),
    ]);
    const [invoicedRows, payments, expenses, openInvoices] = await Promise.all([
      this.prisma.invoice.findMany({ where: { issueDate: { gte: w.since }, status: { not: 'CANCELLED' } }, select: { issueDate: true, totalAmount: true } }),
      this.prisma.payment.findMany({ where: { paymentDate: { gte: w.since }, status: { in: ['VERIFIED', 'PARTIALLY_APPLIED'] } }, select: { paymentDate: true, amount: true, method: true } }),
      this.prisma.expense.findMany({ where: { date: { gte: w.since }, status: { not: 'REJECTED' } }, select: { date: true, amount: true, category: { select: { name: true } } } }),
      this.prisma.invoice.findMany({ where: { status: { in: ['OPEN', 'PARTIALLY_PAID'] } }, select: { totalAmount: true, dueDate: true, customer: { select: { name: true } }, allocations: { select: { amountApplied: true } } } }),
    ]);
    const trend = new Map(w.keys.map((k) => [k, { bucket: k, invoiced: 0, collected: 0, spent: 0 }]));
    let invoiced = 0; let collected = 0; let spent = 0;
    for (const i of invoicedRows) { const a = num(i.totalAmount); invoiced += a; const t = trend.get(bucketOf(i.issueDate, w.unit)); if (t) t.invoiced += a; }
    const methods: Record<string, number> = {};
    for (const p of payments) { const a = num(p.amount); collected += a; methods[p.method] = (methods[p.method] ?? 0) + a; const t = trend.get(bucketOf(p.paymentDate, w.unit)); if (t) t.collected += a; }
    const cats = new Map<string, number>();
    for (const e of expenses) { const a = num(e.amount); spent += a; cats.set(e.category?.name ?? 'Other', (cats.get(e.category?.name ?? 'Other') ?? 0) + a); const t = trend.get(bucketOf(e.date, w.unit)); if (t) t.spent += a; }
    const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    const debtors = new Map<string, number>();
    let outstanding = 0; let overdue = 0;
    for (const inv of openInvoices) {
      const owed = Math.max(0, num(inv.totalAmount) - inv.allocations.reduce((s, a) => s + num(a.amountApplied), 0));
      if (owed <= 0) continue;
      outstanding += owed; debtors.set(inv.customer?.name ?? 'Unknown', (debtors.get(inv.customer?.name ?? 'Unknown') ?? 0) + owed);
      const late = inv.dueDate ? Math.floor((w.now.getTime() - inv.dueDate.getTime()) / DAY_MS) : 0;
      if (late <= 0) aging.current += owed; else { overdue += owed; if (late <= 30) aging.d1_30 += owed; else if (late <= 60) aging.d31_60 += owed; else if (late <= 90) aging.d61_90 += owed; else aging.d90plus += owed; }
    }
    return {
      days: w.days, unit: w.unit,
      totals: { paymentsToVerify: toVerify, expensesToApprove: toApprove, invoiced: money(invoiced), collected: money(collected), spent: money(spent), outstanding: money(outstanding), overdue: money(overdue), estimatedProfit: money(invoiced - spent) },
      trend: [...trend.values()].map((t) => ({ bucket: t.bucket, invoiced: money(t.invoiced), collected: money(t.collected), spent: money(t.spent) })),
      expensesByCategory: [...cats.entries()].map(([name, amount]) => ({ name, amount: money(amount) })).sort((a, b) => b.amount - a.amount).slice(0, 8),
      paymentsByMethod: Object.entries(methods).map(([name, amount]) => ({ name, amount: money(amount) })),
      aging: Object.entries(aging).map(([name, amount]) => ({ name, amount: money(amount) })),
      topDebtors: [...debtors.entries()].map(([name, amount]) => ({ name, amount: money(amount) })).sort((a, b) => b.amount - a.amount).slice(0, 6),
    };
  }

  async system(_actor: AuthenticatedUser, rawDays?: string) {
    const w = this.window(rawDays);
    const [byStatus, attempts, audits] = await Promise.all([
      this.prisma.user.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      this.prisma.loginAttempt.findMany({ where: { createdAt: { gte: w.since } }, select: { createdAt: true, success: true, reason: true } }),
      this.prisma.auditLog.findMany({ where: { createdAt: { gte: w.since } }, select: { createdAt: true, action: true } }),
    ]);
    const users = { total: 0, active: 0, disabled: 0, locked: 0, pending: 0 };
    for (const g of byStatus) {
      const n = g._count._all; users.total += n;
      if (g.status === 'ACTIVE') users.active = n; else if (g.status === 'DISABLED') users.disabled = n; else if (g.status === 'LOCKED') users.locked = n; else users.pending += n;
    }
    const trend = new Map(w.keys.map((k) => [k, { bucket: k, signedIn: 0, failed: 0, changes: 0 }]));
    const reasons = new Map<string, number>();
    let signedIn = 0; let failed = 0;
    for (const a of attempts) {
      const t = trend.get(bucketOf(a.createdAt, w.unit));
      if (a.success) { signedIn += 1; if (t) t.signedIn += 1; } else { failed += 1; if (t) t.failed += 1; reasons.set(a.reason ?? 'Wrong details', (reasons.get(a.reason ?? 'Wrong details') ?? 0) + 1); }
    }
    const actions = new Map<string, number>();
    for (const l of audits) { const t = trend.get(bucketOf(l.createdAt, w.unit)); if (t) t.changes += 1; const area = l.action.split('.')[0] || 'other'; actions.set(area, (actions.get(area) ?? 0) + 1); }
    return {
      days: w.days, unit: w.unit, users,
      totals: { signedIn, failed, recorded: audits.length },
      trend: [...trend.values()],
      failedReasons: [...reasons.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
      activityByArea: [...actions.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    };
  }

  /** The company in one glance for top management: stock along the chain, money, and what is waiting. */
  async pulse(actor: AuthenticatedUser, rawDays?: string) {
    const w = this.window(rawDays);
    const [balances, onRoad, runs, waitingPaddy, waitingRuns, waitingOrders, waitingPayments, varianceHold, faults, sales, fin] = await Promise.all([
      this.prisma.inventoryBalance.findMany({ where: { locationType: { in: ['FARM', 'WAREHOUSE'] } }, select: { locationType: true, quantityKg: true, paddyGradeId: true, productId: true } }),
      this.prisma.shipment.findMany({ where: { receivedAt: null }, select: { expectedKg: true } }),
      this.prisma.productionRecord.findMany({ where: { status: 'APPROVED', date: { gte: w.since } }, select: { paddyProcessedKg: true, recoveredRiceKg: true, massBalanceFlag: true } }),
      this.prisma.paddyEntry.count({ where: { status: 'SUBMITTED' } }),
      this.prisma.productionRecord.count({ where: { status: 'SUBMITTED' } }),
      this.prisma.salesOrder.count({ where: { status: 'SUBMITTED' } }),
      this.prisma.payment.count({ where: { status: 'PENDING_VERIFICATION' } }),
      this.prisma.shipment.count({ where: { varianceRequiresApproval: true, receivedAt: { gte: w.since } } }),
      this.prisma.machine.count({ where: { status: 'FAULT' } }),
      this.sales(actor, rawDays),
      this.finance(actor, rawDays),
    ]);
    let farmPaddy = 0; let warehousePaddy = 0; let packaged = 0;
    for (const b of balances) {
      const q = num(b.quantityKg);
      if (b.locationType === 'FARM' && b.paddyGradeId) farmPaddy += q;
      else if (b.locationType === 'WAREHOUSE' && b.paddyGradeId) warehousePaddy += q;
      else if (b.locationType === 'WAREHOUSE' && b.productId) packaged += q;
    }
    const processed = runs.reduce((a, r) => a + num(r.paddyProcessedKg), 0); const rice = runs.reduce((a, r) => a + num(r.recoveredRiceKg), 0);
    return {
      days: w.days,
      stock: { farmPaddyKg: round0(farmPaddy), onRoadKg: round0(onRoad.reduce((a, s) => a + num(s.expectedKg), 0)), warehousePaddyKg: round0(warehousePaddy), packagedKg: round0(packaged) },
      production: { processedKg: round0(processed), recoveredKg: round0(rice), recoveryPct: processed > 0 ? Math.round((rice / processed) * 1000) / 10 : null },
      money: { sales: sales.totals.value, orders: sales.totals.orders, collected: fin.totals.collected, spent: fin.totals.spent, estimatedProfit: fin.totals.estimatedProfit, owed: fin.totals.outstanding, late: fin.totals.overdue },
      waiting: { paddyEntries: waitingPaddy, productionRuns: waitingRuns, salesOrders: waitingOrders, payments: waitingPayments, countGaps: varianceHold, flaggedRuns: runs.filter((r) => r.massBalanceFlag).length, machineFaults: faults },
    };
  }

  /** For the Auditor (and management): how well the controls are working. Corrections, rejections, flags and sign-in trouble, counted. */
  async audit(_actor: AuthenticatedUser, rawDays?: string) {
    const w = this.window(rawDays);
    const [adjustments, rejectedPaddy, rejectedRuns, flagged, gaps, attempts, logs] = await Promise.all([
      this.prisma.inventoryAdjustment.groupBy({ by: ['status'], where: { requestedAt: { gte: w.since } }, _count: { _all: true } }),
      this.prisma.paddyEntry.count({ where: { status: 'REJECTED', updatedAt: { gte: w.since } } }),
      this.prisma.productionRecord.count({ where: { status: 'REJECTED', updatedAt: { gte: w.since } } }),
      this.prisma.productionRecord.count({ where: { massBalanceFlag: true, date: { gte: w.since } } }),
      this.prisma.shipment.count({ where: { varianceRequiresApproval: true, receivedAt: { gte: w.since } } }),
      this.prisma.loginAttempt.findMany({ where: { createdAt: { gte: w.since } }, select: { createdAt: true, success: true } }),
      this.prisma.auditLog.findMany({ where: { createdAt: { gte: w.since } }, select: { createdAt: true, action: true } }),
    ]);
    const adj: Record<string, number> = {};
    for (const g of adjustments) adj[g.status] = g._count._all;
    const trend = new Map(w.keys.map((k) => [k, { bucket: k, recorded: 0, failedSignIns: 0 }]));
    let failed = 0;
    for (const a of attempts) if (!a.success) { failed += 1; const t = trend.get(bucketOf(a.createdAt, w.unit)); if (t) t.failedSignIns += 1; }
    const areas = new Map<string, number>();
    for (const l of logs) { const t = trend.get(bucketOf(l.createdAt, w.unit)); if (t) t.recorded += 1; const a = l.action.split('.')[0] || 'other'; areas.set(a, (areas.get(a) ?? 0) + 1); }
    return {
      days: w.days, unit: w.unit,
      totals: { corrections: Object.values(adj).reduce((a, b) => a + b, 0), correctionsApproved: adj['APPROVED'] ?? 0, correctionsRejected: adj['REJECTED'] ?? 0, correctionsWaiting: adj['PENDING'] ?? 0, rejectedPaddy, rejectedRuns, flaggedRuns: flagged, countGaps: gaps, failedSignIns: failed, recorded: logs.length },
      trend: [...trend.values()],
      activityByArea: [...areas.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    };
  }
}
