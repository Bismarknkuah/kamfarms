import { ForbiddenException } from '@nestjs/common';
import { FinanceCenterService, resolvePeriod, placeKey } from '../finance-center.service';

const NOW = new Date('2026-10-15T12:00:00Z');
const d = (s: string) => new Date(`${s}T10:00:00Z`);
const cat = (name: string) => ({ name });
const ex = (id: string, amount: number, date: string, category: string, where: Record<string, string | null> = {}, status = 'APPROVED') =>
  ({ id, expenseNumber: `EXP-${id}`, amount, date: d(date), status, category: cat(category), itemDescription: null, customCategoryLabel: null, farmId: null, warehouseId: null, millingCenterId: null, ...where });
const EXPENSES = [
  ex('e1', 1000, '2026-10-03', 'Labour', { farmId: 'F1' }), ex('e2', 500, '2026-10-10', 'Fuel', { farmId: 'F1' }), ex('e3', 700, '2026-10-05', 'Labour', { farmId: 'F2' }),
  ex('e4', 2000, '2026-10-07', 'Transport', { warehouseId: 'W1' }), ex('e5', 3000, '2026-10-08', 'Electricity', { millingCenterId: 'M1' }), ex('e6', 4000, '2026-10-01', 'Salaries'),
  ex('e7', 250, '2026-10-09', 'Transport', { farmId: 'F1', warehouseId: 'W1' }),                           // names two places: counted ONCE, at the warehouse
  ex('e8', 900, '2026-10-12', 'Maintenance', { millingCenterId: 'M2' }, 'PENDING'), ex('e9', 100, '2026-10-13', 'Fuel', { farmId: 'F2' }, 'PENDING'), ex('e10', 9999, '2026-10-02', 'Labour', { farmId: 'F1' }, 'REJECTED'),
  ex('e11', 800, '2026-09-10', 'Labour', { farmId: 'F1' }), ex('e12', 1200, '2026-09-11', 'Electricity', { millingCenterId: 'M1' }), ex('e13', 5000, '2026-04-10', 'Labour', { farmId: 'F1' }),
];
const pay = (id: string, amount: number, date: string, status = 'VERIFIED', customer = 'Adom Foods') => ({ id, paymentNumber: `PAY-${id}`, amount, method: 'MOBILE_MONEY', transactionReference: null, paymentDate: d(date), status, customer: { name: customer } });
const PAYMENTS = [pay('p1', 5000, '2026-10-02'), pay('p2', 3000, '2026-10-14', 'VERIFIED', 'Boateng Stores'), pay('p3', 2500, '2026-09-20'), pay('p4', 1500, '2026-10-14', 'PENDING_VERIFICATION'), pay('p5', 700, '2026-10-13', 'REJECTED')];
const ord = (id: string, amount: number, date: string, status: string, customer: [string, string], fulfilledAt: string | null = null) =>
  ({ id, orderNumber: `SO-${id}`, totalAmount: amount, status, createdAt: d(date), fulfilledAt: fulfilledAt ? d(fulfilledAt) : null, customer: { id: customer[0], name: customer[1] }, salesOfficer: { firstName: 'Nana', lastName: 'Yeboah' } });
const ORDERS = [ord('o1', 10000, '2026-10-04', 'APPROVED', ['C1', 'Adom Foods']), ord('o2', 6000, '2026-10-06', 'FULFILLED', ['C2', 'Boateng Stores'], '2026-10-12'), ord('o3', 99999, '2026-10-07', 'SUBMITTED', ['C1', 'Adom Foods']),
  ord('o4', 4000, '2026-09-15', 'FULFILLED', ['C1', 'Adom Foods'], '2026-09-25'), ord('o5', 77777, '2026-10-08', 'REJECTED', ['C2', 'Boateng Stores'])];
const inv = (total: number, due: string, customer: [string, string, string], allocs: [number, string][] = []) => ({ totalAmount: total, dueDate: d(due), issueDate: d('2026-08-01'), customer: { id: customer[0], name: customer[1], customerNumber: customer[2] }, allocations: allocs.map(([a, s]) => ({ amountApplied: a, payment: { status: s } })) });
const INVOICES = [inv(8000, '2026-10-01', ['C1', 'Adom Foods', 'CUS-1'], [[3000, 'VERIFIED']]), inv(2000, '2026-11-01', ['C1', 'Adom Foods', 'CUS-1']), inv(1000, '2026-09-01', ['C2', 'Boateng Stores', 'CUS-2'], [[1000, 'PENDING_VERIFICATION']])];

function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([k, v]: [string, any]) => {
    const val = row[k];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v && !v.in.includes(val)) return false; if ('not' in v && val === v.not) return false;
      for (const op of ['gte', 'lte', 'lt', 'gt']) if (op in v) { if (val == null) return false; const t = new Date(val).getTime(), b = new Date(v[op]).getTime(); if ((op === 'gte' && !(t >= b)) || (op === 'lte' && !(t <= b)) || (op === 'lt' && !(t < b)) || (op === 'gt' && !(t > b))) return false; }
      return true;
    }
    return val === v;
  });
}
const table = (rows: any[]) => ({ findMany: jest.fn(async ({ where, orderBy, take }: any = {}) => {
  let out = rows.filter((r) => matches(r, where));
  const key = orderBy && Object.keys(orderBy)[0];
  if (key && ['date', 'paymentDate', 'createdAt'].includes(key)) out = [...out].sort((a, b) => new Date(b[key]).getTime() - new Date(a[key]).getTime());
  return take ? out.slice(0, take) : out;
}) });
const places = (rows: any[]) => ({ findMany: jest.fn(async ({ where }: any) => rows.filter((r) => matches(r, where))) });
function build() {
  const prisma: any = {
    expense: table(EXPENSES), payment: table(PAYMENTS), salesOrder: table(ORDERS), invoice: table(INVOICES),
    farm: places([{ id: 'F1', name: 'Nkawkaw Farm', isActive: true }, { id: 'F2', name: 'Techiman Farm', isActive: true }, { id: 'F3', name: 'Wenchi Farm', isActive: true }]),
    warehouse: places([{ id: 'W1', name: 'Tamale Warehouse', isActive: true }, { id: 'W2', name: 'Kumasi Warehouse', isActive: true }]),
    millingCenter: places([{ id: 'M1', name: 'Tamale Mill', isActive: true }, { id: 'M2', name: 'Kumasi Mill', isActive: true }]),
  };
  return new FinanceCenterService(prisma);
}
const G = [{ scopeType: 'GLOBAL', scopeId: null }];
const actor = (perms: string[] = ['finance.view'], scopes: any[] = G) => ({ id: 'u', permissionCodes: new Set(perms), roles: [{ roleId: 'r', roleCode: 'FINANCE_DIRECTOR', permissions: perms, scopes }] }) as any;

describe('the reporting period', () => {
  it('is worked out in UTC, with the period before it for comparison', () => {
    const iso = (x: Date | null) => x?.toISOString().slice(0, 10);
    const m = resolvePeriod('month', NOW); expect([iso(m.from), iso(m.previous!.from), iso(m.previous!.to)]).toEqual(['2026-10-01', '2026-09-01', '2026-10-01']);
    const q = resolvePeriod('quarter', NOW); expect([iso(q.from), iso(q.previous!.from)]).toEqual(['2026-10-01', '2026-07-01']);
    const y = resolvePeriod('year', NOW); expect([iso(y.from), iso(y.previous!.from)]).toEqual(['2026-01-01', '2025-01-01']);
    const l = resolvePeriod('last30', NOW); expect([iso(l.from), iso(l.previous!.from)]).toEqual(['2026-09-15', '2026-08-16']);
    expect(resolvePeriod('all', NOW)).toMatchObject({ from: null, previous: null });
    expect(resolvePeriod('nonsense', NOW).key).toBe('month');
  });
});

describe('the money overview', () => {
  it('adds up what was sold, what came in, what was spent, and the difference, against the period before', async () => {
    const o = await build().overview(actor(), 'month', NOW);
    expect(o.money.salesBooked).toEqual({ amount: 16000, orders: 2, previous: 4000 });            // approved orders only: not the submitted, not the rejected
    expect(o.money.salesFulfilled).toEqual({ amount: 6000, orders: 1 });
    expect(o.money.collected).toEqual({ amount: 8000, payments: 2, previous: 2500 });             // verified payments only
    expect(o.money.spent).toEqual({ amount: 11450, items: 7, previous: 2000 });                   // approved expenses only: not pending, not rejected
    expect(o.money.net).toEqual({ amount: -3450, previous: 500 });
    expect(o.money.pendingPayments).toEqual({ amount: 1500, count: 1 });
    expect(o.money.pendingExpenses).toEqual({ amount: 1000, count: 2 });
  });
  it('shows what was spent at EVERY farm, warehouse and milling center, including the ones that spent nothing, and the head office', async () => {
    const { spendByPlace: s } = await build().overview(actor(), 'month', NOW);
    expect(s.farms.map((f) => [f.name, f.amount])).toEqual([['Nkawkaw Farm', 1500], ['Techiman Farm', 700], ['Wenchi Farm', 0]]);
    expect(s.warehouses.map((f) => [f.name, f.amount])).toEqual([['Tamale Warehouse', 2250], ['Kumasi Warehouse', 0]]);   // the expense naming a farm AND a warehouse is counted once, at the warehouse
    expect(s.millingCenters.map((f) => [f.name, f.amount, f.pending])).toEqual([['Tamale Mill', 3000, 0], ['Kumasi Mill', 0, 900]]);
    expect(s.headOffice).toMatchObject({ amount: 4000, items: 1 });
    expect(s.totals).toEqual({ farms: 2200, warehouses: 2250, millingCenters: 3000, headOffice: 4000 });
    expect(s.totals.farms + s.totals.warehouses + s.totals.millingCenters + s.totals.headOffice).toBe(11450);   // nothing counted twice, nothing lost
    expect(s.farms[1].pending).toBe(100); expect(s.farms[0].share).toBeCloseTo(1500 / 11450, 5);
  });
  it('splits the spending by kind of cost, biggest first', async () => {
    const { spendByCategory: c } = await build().overview(actor(), 'month', NOW);
    expect(c.map((x) => [x.name, x.amount])).toEqual([['Salaries', 4000], ['Electricity', 3000], ['Transport', 2250], ['Labour', 1700], ['Fuel', 500]]);
  });
  it('shows the last six months whatever period is chosen', async () => {
    const { trend } = await build().overview(actor(), 'month', NOW);
    expect(trend.map((t) => t.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(trend[5]).toMatchObject({ label: 'Oct', sales: 16000, collected: 8000, spent: 11450 }); expect(trend[4]).toMatchObject({ sales: 4000, collected: 2500, spent: 2000 }); expect(trend[0]).toMatchObject({ sales: 0, spent: 0 });
  });
  it('works out who owes the company the way the receivables screen does: invoices less VERIFIED payments only', async () => {
    const { money, debtors } = await build().overview(actor(), 'month', NOW);
    expect(money.receivables).toEqual({ outstanding: 8000, overdue: 6000, customers: 2 });
    expect(debtors).toEqual([{ name: 'Adom Foods', number: 'CUS-1', outstanding: 7000, overdue: 5000 }, { name: 'Boateng Stores', number: 'CUS-2', outstanding: 1000, overdue: 1000 }]);
  });
  it('lists the sales record and the biggest customers of the period', async () => {
    const o = await build().overview(actor(), 'month', NOW);
    expect(o.recentSales.map((s) => [s.orderNumber, s.customer, s.amount])).toEqual([['SO-o2', 'Boateng Stores', 6000], ['SO-o1', 'Adom Foods', 10000]]);   // newest first
    expect(o.topCustomers.map((c) => [c.name, c.amount, c.orders])).toEqual([['Adom Foods', 10000, 1], ['Boateng Stores', 6000, 1]]);
  });
  it('mixes the latest money in and out, newest first, with pending ones marked', async () => {
    const { recentTransactions: t } = await build().overview(actor(), 'month', NOW);
    expect(t[0].date >= t[1].date).toBe(true);
    expect(t.find((r) => r.number === 'PAY-p4')).toMatchObject({ kind: 'IN', state: 'waiting', amount: 1500 });
    expect(t.find((r) => r.number === 'EXP-e8')).toMatchObject({ kind: 'OUT', state: 'waiting', place: { type: 'MILLING_CENTER', name: 'Kumasi Mill' } });
    expect(t.find((r) => r.number === 'PAY-p5')).toBeUndefined();   // refused payments are not part of the money story here
  });
  it('compares quarter and all-time too, and all-time has nothing to compare with', async () => {
    const q = await build().overview(actor(), 'quarter', NOW); expect(q.money.spent).toMatchObject({ amount: 11450, previous: 2000 });
    const all = await build().overview(actor(), 'all', NOW); expect(all.money.spent).toMatchObject({ amount: 18450, previous: null }); expect(all.money.net.previous).toBeNull();
  });
});

describe('the money ledger', () => {
  it('lists every payment and expense, newest first, with the totals of what is confirmed and what is waiting', async () => {
    const l = await build().ledger(actor());
    expect(l.count).toBe(18); expect(l.rows[0].date >= l.rows[1].date).toBe(true);
    expect(l.totals).toMatchObject({ in: 10500, waitingIn: 1500, waitingOut: 1000 });
    expect(l.totals.out).toBe(11450 + 2000 + 5000);
    expect(l.places.millingCenters.map((m) => m.name)).toEqual(['Tamale Mill', 'Kumasi Mill']);
  });
  it('filters by money in, money out, place, state and search; a place filter shows spending only', async () => {
    const s = build();
    expect((await s.ledger(actor(), { kind: 'in' })).rows.every((r) => r.kind === 'IN')).toBe(true);
    const mill = await s.ledger(actor(), { place: 'mill:M1' }); expect(mill.rows.map((r) => r.number).sort()).toEqual(['EXP-e12', 'EXP-e5']);
    const farm = await s.ledger(actor(), { place: 'farm:F1' }); expect(farm.count).toBe(5); expect(farm.rows.some((r) => r.kind === 'IN')).toBe(false);
    expect((await s.ledger(actor(), { place: 'farm:F1', status: 'confirmed' })).totals.out).toBe(1000 + 500 + 800 + 5000);
    expect((await s.ledger(actor(), { place: 'office' })).rows.map((r) => r.number)).toEqual(['EXP-e6']);
    expect((await s.ledger(actor(), { status: 'waiting' })).rows.map((r) => r.number).sort()).toEqual(['EXP-e8', 'EXP-e9', 'PAY-p4']);
    expect((await s.ledger(actor(), { q: 'boateng' })).rows.map((r) => r.number)).toEqual(['PAY-p2']);
    expect((await s.ledger(actor(), { q: 'kumasi mill' })).rows.map((r) => r.number)).toEqual(['EXP-e8']);
  });
  it('filters by dates (the last day included) and says when a long list was cut', async () => {
    const s = build();
    expect((await s.ledger(actor(), { from: '2026-10-14', to: '2026-10-14' })).rows.map((r) => r.number).sort()).toEqual(['PAY-p2', 'PAY-p4']);
    const cut = await s.ledger(actor(), { limit: 5 }); expect(cut.rows).toHaveLength(5); expect(cut.truncated).toBe(true); expect(cut.count).toBe(18);
    expect(cut.totals.out).toBe(18450);   // the totals cover the whole filtered list, not just the rows shown
  });
});

describe('who may see the company-wide money', () => {
  it('only people with finance.view who see the whole company', async () => {
    await expect(build().overview(actor(['sales.view']), 'month', NOW)).rejects.toThrow(ForbiddenException);
    await expect(build().ledger(actor(['reports.view']))).rejects.toThrow(ForbiddenException);
    await expect(build().overview(actor(['finance.view'], [{ scopeType: 'FARM', scopeId: 'F1' }]), 'month', NOW)).rejects.toThrow(/whole company/);
    await expect(build().overview(actor(['finance.view'], []), 'month', NOW)).rejects.toThrow(ForbiddenException);
    await expect(build().overview(actor(), 'month', NOW)).resolves.toBeTruthy();
  });
  it('names a place by its kind: mill, warehouse, farm or the head office', () => {
    expect([placeKey({ type: 'MILLING_CENTER', id: 'M1' }), placeKey({ type: 'WAREHOUSE', id: 'W1' }), placeKey({ type: 'FARM', id: 'F1' }), placeKey({ type: 'HEAD_OFFICE', id: null })]).toEqual(['mill:M1', 'warehouse:W1', 'farm:F1', 'office']);
  });
});
