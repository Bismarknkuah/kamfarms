import { ForbiddenException, Injectable } from '@nestjs/common';
import { SalesOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { scopedLocationIds } from '../common/utils/scope.util';

export type PeriodKey = 'month' | 'last30' | 'quarter' | 'year' | 'all';
export const PERIOD_LABELS: Record<PeriodKey, string> = { month: 'This month', last30: 'Last 30 days', quarter: 'This quarter', year: 'This year', all: 'All time' };
const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** An order counts as a SALE once the Finance Director has approved it, and until it is rejected or cancelled. */
const BOOKED: SalesOrderStatus[] = ['APPROVED', 'PARTIALLY_APPROVED', 'RELEASED', 'RESERVED', 'PROCESSING', 'ON_TRACK', 'FULFILLED'];
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const iso = (d: Date | string) => new Date(d).toISOString();

export interface Period { key: PeriodKey; label: string; from: Date | null; to: Date; previous: { from: Date; to: Date } | null }

/** The reporting period, in UTC (Ghana keeps GMT, so this is also local time), and the period before it of the same kind for comparison. */
export function resolvePeriod(raw: string | undefined, now: Date = new Date()): Period {
  const key: PeriodKey = (['month', 'last30', 'quarter', 'year', 'all'] as const).includes(raw as PeriodKey) ? (raw as PeriodKey) : 'month';
  const y = now.getUTCFullYear(); const m = now.getUTCMonth();
  const end = new Date(now.getTime() + 1);
  const label = PERIOD_LABELS[key];
  if (key === 'all') return { key, label, from: null, to: end, previous: null };
  if (key === 'last30') { const from = new Date(now.getTime() - 30 * DAY); return { key, label, from, to: end, previous: { from: new Date(from.getTime() - 30 * DAY), to: from } }; }
  if (key === 'quarter') { const q = Math.floor(m / 3) * 3; const from = new Date(Date.UTC(y, q, 1)); return { key, label, from, to: end, previous: { from: new Date(Date.UTC(y, q - 3, 1)), to: from } }; }
  if (key === 'year') { const from = new Date(Date.UTC(y, 0, 1)); return { key, label, from, to: end, previous: { from: new Date(Date.UTC(y - 1, 0, 1)), to: from } }; }
  const from = new Date(Date.UTC(y, m, 1)); return { key, label, from, to: end, previous: { from: new Date(Date.UTC(y, m - 1, 1)), to: from } };
}

type PlaceType = 'FARM' | 'WAREHOUSE' | 'MILLING_CENTER' | 'HEAD_OFFICE';
type PlaceRef = { farmId?: string | null; warehouseId?: string | null; millingCenterId?: string | null };
/** Every expense is counted ONCE, at the most specific place it names: the mill, else the warehouse, else the farm, else the head office. */
const placeOf = (e: PlaceRef): { type: PlaceType; id: string | null } =>
  e.millingCenterId ? { type: 'MILLING_CENTER', id: e.millingCenterId } : e.warehouseId ? { type: 'WAREHOUSE', id: e.warehouseId } : e.farmId ? { type: 'FARM', id: e.farmId } : { type: 'HEAD_OFFICE', id: null };
export const placeKey = (p: { type: PlaceType; id: string | null }) => (p.type === 'HEAD_OFFICE' ? 'office' : `${p.type === 'MILLING_CENTER' ? 'mill' : p.type.toLowerCase()}:${p.id}`);

export interface LedgerRow {
  id: string; kind: 'IN' | 'OUT'; date: string; number: string; title: string; detail: string;
  place: { type: PlaceType; id: string | null; name: string } | null; amount: number; state: 'confirmed' | 'waiting' | 'refused'; link: string;
}
type Names = { farm: Map<string, string>; warehouse: Map<string, string>; mill: Map<string, string> };

const paymentState = (s: string): LedgerRow['state'] => (s === 'VERIFIED' || s === 'PARTIALLY_APPLIED' ? 'confirmed' : s === 'PENDING_VERIFICATION' ? 'waiting' : 'refused');
const expenseState = (s: string): LedgerRow['state'] => (s === 'APPROVED' ? 'confirmed' : s === 'PENDING' ? 'waiting' : 'refused');

/**
 * Everything the top of the company needs to see about money, in one place: what was sold, what came in, what was spent (at every farm, warehouse and milling center),
 * what is owed to us, and what is waiting for a decision. It is read-only and company-wide, so it is only for people who oversee the whole company (finance.view with no place limit).
 */
@Injectable()
export class FinanceCenterService {
  constructor(private readonly prisma: PrismaService) {}

  private assertViewer(actor: AuthenticatedUser) {
    const wide = (['FARM', 'WAREHOUSE', 'MILLING_CENTER'] as const).every((t) => scopedLocationIds(actor, t).isGlobal);
    if (!actor.permissionCodes?.has('finance.view') || !wide) throw new ForbiddenException('The company-wide money view is for the people who oversee the whole company.');
  }

  private async names(): Promise<{ names: Names; farms: { id: string; name: string }[]; warehouses: { id: string; name: string }[]; mills: { id: string; name: string }[] }> {
    const q = { where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } } as const;
    const [farms, warehouses, mills] = await Promise.all([this.prisma.farm.findMany(q as any), this.prisma.warehouse.findMany(q as any), this.prisma.millingCenter.findMany(q as any)]);
    const map = (xs: { id: string; name: string }[]) => new Map(xs.map((x) => [x.id, x.name]));
    return { names: { farm: map(farms as any), warehouse: map(warehouses as any), mill: map(mills as any) }, farms: farms as any, warehouses: warehouses as any, mills: mills as any };
  }

  private placeInfo(e: PlaceRef, names: Names): LedgerRow['place'] {
    const p = placeOf(e);
    const name = p.type === 'MILLING_CENTER' ? names.mill.get(p.id!) : p.type === 'WAREHOUSE' ? names.warehouse.get(p.id!) : p.type === 'FARM' ? names.farm.get(p.id!) : 'Head office';
    return { type: p.type, id: p.id, name: name ?? (p.type === 'HEAD_OFFICE' ? 'Head office' : 'A place that was removed') };
  }
  private payRow(p: any): LedgerRow {
    return { id: `pay:${p.id}`, kind: 'IN', date: iso(p.paymentDate), number: p.paymentNumber, title: p.customer?.name ?? 'Customer', detail: [p.method, p.transactionReference].filter(Boolean).join(' · '), place: null, amount: r2(num(p.amount)), state: paymentState(p.status), link: '/finance' };
  }
  private expRow(e: any, names: Names): LedgerRow {
    return { id: `exp:${e.id}`, kind: 'OUT', date: iso(e.date), number: e.expenseNumber, title: e.category?.name ?? 'Expense', detail: e.itemDescription ?? e.customCategoryLabel ?? '', place: this.placeInfo(e, names), amount: r2(num(e.amount)), state: expenseState(e.status), link: '/expenses' };
  }

  async overview(actor: AuthenticatedUser, periodKey?: string, now: Date = new Date()) {
    this.assertViewer(actor);
    const period = resolvePeriod(periodKey, now);
    const sixAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const earliest = period.key === 'all' ? null : new Date(Math.min(...[sixAgo, period.from, period.previous?.from].filter((d): d is Date => !!d).map((d) => d.getTime())));
    const range = earliest ? { gte: earliest, lte: now } : { lte: now };
    const [expenses, payments, orders, fulfilled, pendingExpenses, pendingPayments, invoices, places, lastPayments, lastExpenses] = await Promise.all([
      this.prisma.expense.findMany({ where: { status: 'APPROVED', date: range }, select: { amount: true, date: true, farmId: true, warehouseId: true, millingCenterId: true, category: { select: { name: true } } } }),
      this.prisma.payment.findMany({ where: { status: 'VERIFIED', paymentDate: range }, select: { amount: true, paymentDate: true } }),
      this.prisma.salesOrder.findMany({ where: { status: { in: BOOKED }, createdAt: range }, orderBy: { createdAt: 'desc' }, select: { id: true, orderNumber: true, totalAmount: true, status: true, createdAt: true, customer: { select: { id: true, name: true } }, salesOfficer: { select: { firstName: true, lastName: true } } } }),
      this.prisma.salesOrder.findMany({ where: { status: 'FULFILLED', fulfilledAt: range }, select: { totalAmount: true, fulfilledAt: true } }),
      this.prisma.expense.findMany({ where: { status: 'PENDING' }, select: { amount: true, farmId: true, warehouseId: true, millingCenterId: true } }),
      this.prisma.payment.findMany({ where: { status: 'PENDING_VERIFICATION' }, select: { amount: true } }),
      this.prisma.invoice.findMany({ select: { totalAmount: true, dueDate: true, issueDate: true, customer: { select: { id: true, name: true, customerNumber: true } }, allocations: { select: { amountApplied: true, payment: { select: { status: true } } } } } }),
      this.names(),
      this.prisma.payment.findMany({ where: { status: { in: ['VERIFIED', 'PENDING_VERIFICATION'] } }, orderBy: { paymentDate: 'desc' }, take: 12, select: { id: true, paymentNumber: true, amount: true, method: true, transactionReference: true, paymentDate: true, status: true, customer: { select: { name: true } } } }),
      this.prisma.expense.findMany({ where: { status: { in: ['APPROVED', 'PENDING'] } }, orderBy: { date: 'desc' }, take: 12, select: { id: true, expenseNumber: true, amount: true, date: true, status: true, itemDescription: true, customCategoryLabel: true, farmId: true, warehouseId: true, millingCenterId: true, category: { select: { name: true } } } }),
    ]);

    const within = (d: Date | string, from: Date | null, to: Date) => { const t = new Date(d).getTime(); return (!from || t >= from.getTime()) && t < to.getTime(); };
    const cur = (d: Date | string) => within(d, period.from, period.to);
    const prev = (d: Date | string) => (period.previous ? within(d, period.previous.from, period.previous.to) : false);
    const E: any[] = expenses as any[]; const P: any[] = payments as any[]; const O: any[] = orders as any[];

    const spentRows = E.filter((e) => cur(e.date));
    const spent = r2(sum(spentRows.map((e) => num(e.amount))));
    const collectedRows = P.filter((p) => cur(p.paymentDate));
    const collected = r2(sum(collectedRows.map((p) => num(p.amount))));
    const periodOrders = O.filter((o) => cur(o.createdAt));
    const booked = r2(sum(periodOrders.map((o) => num(o.totalAmount))));
    const fulfilledRows = (fulfilled as any[]).filter((o) => cur(o.fulfilledAt));
    const prevSpent = period.previous ? r2(sum(E.filter((e) => prev(e.date)).map((e) => num(e.amount)))) : null;
    const prevCollected = period.previous ? r2(sum(P.filter((p) => prev(p.paymentDate)).map((p) => num(p.amount)))) : null;
    const prevBooked = period.previous ? r2(sum(O.filter((o) => prev(o.createdAt)).map((o) => num(o.totalAmount)))) : null;

    // ---- who owes the company (invoices less VERIFIED payments, exactly as the receivables screen works it out)
    const owed = new Map<string, { name: string; number: string; outstanding: number; overdue: number }>();
    for (const inv of invoices as any[]) {
      const paid = sum((inv.allocations ?? []).filter((a: any) => a.payment?.status === 'VERIFIED').map((a: any) => num(a.amountApplied)));
      const left = num(inv.totalAmount) - paid;
      if (left <= 0.001) continue;
      const late = new Date(inv.dueDate ?? inv.issueDate).getTime() < now.getTime();
      const row = owed.get(inv.customer.id) ?? { name: inv.customer.name, number: inv.customer.customerNumber, outstanding: 0, overdue: 0 };
      row.outstanding += left; if (late) row.overdue += left; owed.set(inv.customer.id, row);
    }
    const debtors = [...owed.values()].sort((a, b) => b.outstanding - a.outstanding);

    // ---- where the money is spent
    const bucket = new Map<string, { amount: number; items: number; pending: number }>();
    const slot = (k: string) => { if (!bucket.has(k)) bucket.set(k, { amount: 0, items: 0, pending: 0 }); return bucket.get(k)!; };
    for (const e of spentRows) { const s = slot(placeKey(placeOf(e))); s.amount += num(e.amount); s.items += 1; }
    for (const e of pendingExpenses as any[]) slot(placeKey(placeOf(e))).pending += num(e.amount);
    const rows = (type: PlaceType, list: { id: string; name: string }[]) => list.map((p) => {
      const s = bucket.get(placeKey({ type, id: p.id })) ?? { amount: 0, items: 0, pending: 0 };
      return { id: p.id, name: p.name, amount: r2(s.amount), items: s.items, pending: r2(s.pending), share: spent > 0 ? s.amount / spent : 0 };
    }).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    const office = bucket.get('office') ?? { amount: 0, items: 0, pending: 0 };
    const farmsRows = rows('FARM', places.farms); const whRows = rows('WAREHOUSE', places.warehouses); const millRows = rows('MILLING_CENTER', places.mills);
    const total = (xs: { amount: number }[]) => r2(sum(xs.map((x) => x.amount)));

    // ---- by kind of cost
    const cat = new Map<string, { amount: number; items: number }>();
    for (const e of spentRows) { const n = e.category?.name ?? 'Other'; const c = cat.get(n) ?? { amount: 0, items: 0 }; c.amount += num(e.amount); c.items += 1; cat.set(n, c); }
    const spendByCategory = [...cat.entries()].map(([name, c]) => ({ name, amount: r2(c.amount), items: c.items, share: spent > 0 ? c.amount / spent : 0 })).sort((a, b) => b.amount - a.amount);

    // ---- the last six months, whatever period is chosen
    const trend = Array.from({ length: 6 }, (_, i) => {
      const k = 5 - i; const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)); const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k + 1, 1));
      const inM = (d: Date | string) => within(d, from, to);
      return {
        month: `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}`, label: MONTHS[from.getUTCMonth()],
        sales: r2(sum(O.filter((o) => inM(o.createdAt)).map((o) => num(o.totalAmount)))), collected: r2(sum(P.filter((p) => inM(p.paymentDate)).map((p) => num(p.amount)))), spent: r2(sum(E.filter((e) => inM(e.date)).map((e) => num(e.amount)))),
      };
    });

    const byCustomer = new Map<string, { name: string; amount: number; orders: number }>();
    for (const o of periodOrders) { const c = byCustomer.get(o.customer.id) ?? { name: o.customer.name, amount: 0, orders: 0 }; c.amount += num(o.totalAmount); c.orders += 1; byCustomer.set(o.customer.id, c); }
    const topCustomers = [...byCustomer.values()].map((c) => ({ ...c, amount: r2(c.amount) })).sort((a, b) => b.amount - a.amount).slice(0, 5);

    return {
      period: { key: period.key, label: period.label, from: period.from ? iso(period.from) : null, to: iso(now), previous: period.previous ? { from: iso(period.previous.from), to: iso(period.previous.to) } : null },
      generatedAt: iso(now),
      money: {
        salesBooked: { amount: booked, orders: periodOrders.length, previous: prevBooked },
        salesFulfilled: { amount: r2(sum(fulfilledRows.map((o: any) => num(o.totalAmount)))), orders: fulfilledRows.length },
        collected: { amount: collected, payments: collectedRows.length, previous: prevCollected },
        spent: { amount: spent, items: spentRows.length, previous: prevSpent },
        net: { amount: r2(collected - spent), previous: prevCollected !== null && prevSpent !== null ? r2(prevCollected - prevSpent) : null },
        receivables: { outstanding: r2(sum(debtors.map((d) => d.outstanding))), overdue: r2(sum(debtors.map((d) => d.overdue))), customers: debtors.length },
        pendingPayments: { amount: r2(sum((pendingPayments as any[]).map((p) => num(p.amount)))), count: (pendingPayments as any[]).length },
        pendingExpenses: { amount: r2(sum((pendingExpenses as any[]).map((e) => num(e.amount)))), count: (pendingExpenses as any[]).length },
      },
      spendByPlace: {
        farms: farmsRows, warehouses: whRows, millingCenters: millRows,
        headOffice: { amount: r2(office.amount), items: office.items, pending: r2(office.pending), share: spent > 0 ? office.amount / spent : 0 },
        totals: { farms: total(farmsRows), warehouses: total(whRows), millingCenters: total(millRows), headOffice: r2(office.amount) },
      },
      spendByCategory, trend, topCustomers,
      recentSales: periodOrders.slice(0, 10).map((o: any) => ({ id: o.id, orderNumber: o.orderNumber, customer: o.customer.name, officer: `${o.salesOfficer?.firstName ?? ''} ${o.salesOfficer?.lastName ?? ''}`.trim(), date: iso(o.createdAt), amount: r2(num(o.totalAmount)), status: o.status })),
      debtors: debtors.slice(0, 6).map((d) => ({ name: d.name, number: d.number, outstanding: r2(d.outstanding), overdue: r2(d.overdue) })),
      recentTransactions: [...(lastPayments as any[]).map((p) => this.payRow(p)), ...(lastExpenses as any[]).map((e) => this.expRow(e, places.names))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12),
    };
  }

  /** Every payment received and every expense, with filters. Spending is tied to a place; payments from customers are not, so a place filter shows spending only. */
  async ledger(actor: AuthenticatedUser, f: { kind?: string; place?: string; status?: string; from?: string; to?: string; q?: string; limit?: string | number } = {}) {
    this.assertViewer(actor);
    const kind = ['in', 'out'].includes(String(f.kind)) ? String(f.kind) : 'all';
    const place = f.place && f.place !== 'all' ? String(f.place) : null;
    const state = ['confirmed', 'waiting', 'refused'].includes(String(f.status)) ? (f.status as LedgerRow['state']) : null;
    const from = f.from && !Number.isNaN(Date.parse(f.from)) ? new Date(f.from) : null;
    const to = f.to && !Number.isNaN(Date.parse(f.to)) ? new Date(new Date(f.to).getTime() + DAY) : null;   // the "to" day is included
    const limit = Math.min(Math.max(parseInt(String(f.limit ?? 100), 10) || 100, 1), 500);
    const needle = (f.q ?? '').trim().toLowerCase();
    const dateWhere = (from || to) ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } : undefined;
    const [places, payments, expenses] = await Promise.all([
      this.names(),
      kind !== 'out' && !place ? this.prisma.payment.findMany({ where: { ...(dateWhere ? { paymentDate: dateWhere } : {}) }, orderBy: { paymentDate: 'desc' }, take: 3000, select: { id: true, paymentNumber: true, amount: true, method: true, transactionReference: true, paymentDate: true, status: true, customer: { select: { name: true } } } }) : Promise.resolve([]),
      kind !== 'in' ? this.prisma.expense.findMany({ where: { ...(dateWhere ? { date: dateWhere } : {}) }, orderBy: { date: 'desc' }, take: 3000, select: { id: true, expenseNumber: true, amount: true, date: true, status: true, itemDescription: true, customCategoryLabel: true, farmId: true, warehouseId: true, millingCenterId: true, category: { select: { name: true } } } }) : Promise.resolve([]),
    ]);
    let rows = [...(payments as any[]).map((p) => this.payRow(p)), ...(expenses as any[]).filter((e) => !place || placeKey(placeOf(e)) === place).map((e) => this.expRow(e, places.names))];
    if (state) rows = rows.filter((r) => r.state === state);
    if (needle) rows = rows.filter((r) => [r.number, r.title, r.detail, r.place?.name].some((v) => v && v.toLowerCase().includes(needle)));
    rows.sort((a, b) => b.date.localeCompare(a.date));
    const confirmed = (k: 'IN' | 'OUT') => rows.filter((r) => r.kind === k && r.state === 'confirmed');
    const waiting = (k: 'IN' | 'OUT') => rows.filter((r) => r.kind === k && r.state === 'waiting');
    return {
      rows: rows.slice(0, limit), count: rows.length, truncated: rows.length > limit,
      totals: { in: r2(sum(confirmed('IN').map((r) => r.amount))), out: r2(sum(confirmed('OUT').map((r) => r.amount))), net: r2(sum(confirmed('IN').map((r) => r.amount)) - sum(confirmed('OUT').map((r) => r.amount))), waitingIn: r2(sum(waiting('IN').map((r) => r.amount))), waitingOut: r2(sum(waiting('OUT').map((r) => r.amount))) },
      places: { farms: places.farms, warehouses: places.warehouses, millingCenters: places.mills },
    };
  }
}
