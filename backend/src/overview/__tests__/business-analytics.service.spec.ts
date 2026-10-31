import { BusinessAnalyticsService } from '../business-analytics.service';
import { OverviewAnalyticsController } from '../overview-analytics.controller';

const recent = (d = 2) => new Date(Date.now() - d * 86_400_000);
const actor = (id: string, perms: string[], roleCode = 'SALES_OFFICER') => ({ id, roles: [{ roleId: 'r', roleCode, permissions: perms, scopes: [] }], permissionCodes: new Set(perms) }) as any;

describe('BusinessAnalyticsService.sales', () => {
  const orders = [
    { createdAt: recent(1), status: 'FULFILLED', totalAmount: '1000.50', totalKg: '500', customer: { name: 'Ama' }, salesOfficer: { firstName: 'Kojo', lastName: 'A' } },
    { createdAt: recent(2), status: 'SUBMITTED', totalAmount: '400', totalKg: '200', customer: { name: 'Ama' }, salesOfficer: { firstName: 'Kojo', lastName: 'A' } },
    { createdAt: recent(3), status: 'REJECTED', totalAmount: '100', totalKg: '50', customer: { name: 'Kwesi' }, salesOfficer: { firstName: 'Esi', lastName: 'B' } },
    { createdAt: recent(3), status: 'RESERVED', totalAmount: '600', totalKg: '300', customer: { name: 'Kwesi' }, salesOfficer: { firstName: 'Esi', lastName: 'B' } },
  ];
  const build = () => { const prisma: any = { invoice: { findMany: jest.fn(async () => []) }, salesOrder: { findMany: jest.fn(async () => orders) } }; return { prisma, svc: new BusinessAnalyticsService(prisma) }; };

  it('limits a Sales Officer to their own orders in the database query', async () => {
    const { prisma, svc } = build();
    const r = await svc.sales(actor('officer-1', ['sales.create']), '30');
    expect(prisma.salesOrder.findMany.mock.calls[0][0].where.salesOfficerId).toBe('officer-1');
    expect(r.company).toBe(false);
    expect(r.bySalesperson).toEqual([]);
  });

  it('shows Finance the whole company, with sales by salesperson', async () => {
    const { prisma, svc } = build();
    const r = await svc.sales(actor('fd', ['finance.view'], 'FINANCE_DIRECTOR'), '30');
    expect(prisma.salesOrder.findMany.mock.calls[0][0].where.salesOfficerId).toBeUndefined();
    expect(r.company).toBe(true);
    expect(r.bySalesperson.map((s) => s.name)).toEqual(['Kojo A', 'Esi B']);
  });

  it('adds up orders, value, and what is fulfilled, waiting, in progress and lost', async () => {
    const r = await build().svc.sales(actor('fd', ['finance.view']), '30');
    expect(r.totals).toMatchObject({ orders: 4, value: 2100.5, kg: 1050, fulfilled: 1, waitingForApproval: 1, inProgress: 1, lost: 1, averageOrder: 525.13 });
    expect(r.topCustomers[0]).toMatchObject({ name: 'Ama', value: 1400.5, orders: 2 });
    expect(r.trend.reduce((s, t) => s + t.orders, 0)).toBe(4);
  });
});

describe('BusinessAnalyticsService.finance', () => {
  const prisma: any = {
    invoice: { findMany: jest.fn(async ({ where }: any) => (where.status.in
      ? [
          { totalAmount: '1000', dueDate: recent(-5), customer: { name: 'A' }, allocations: [{ amountApplied: '200' }] },
          { totalAmount: '500', dueDate: recent(40), customer: { name: 'B' }, allocations: [] },
          { totalAmount: '300', dueDate: recent(100), customer: { name: 'B' }, allocations: [{ amountApplied: '300' }] },
        ]
      : [{ issueDate: recent(1), totalAmount: '1800' }, { issueDate: recent(4), totalAmount: '200' }])) },
    payment: { count: jest.fn(async () => 2), findMany: jest.fn(async () => [{ paymentDate: recent(1), amount: '900', method: 'BANK_TRANSFER' }, { paymentDate: recent(2), amount: '100', method: 'CASH' }]) },
    expense: { count: jest.fn(async () => 1), findMany: jest.fn(async () => [{ date: recent(1), amount: '250', category: { name: 'Fuel' } }, { date: recent(3), amount: '150', category: { name: 'Labour' } }]) },
  };

  it('works out invoiced, collected, spent and an estimated profit from decimals', async () => {
    const r = await new BusinessAnalyticsService(prisma).finance(actor('f', ['finance.view'], 'FINANCE_OFFICER'), '30');
    expect(r.totals).toMatchObject({ invoiced: 2000, collected: 1000, spent: 400, estimatedProfit: 1600 });
    expect(r.paymentsByMethod).toEqual([{ name: 'BANK_TRANSFER', amount: 900 }, { name: 'CASH', amount: 100 }]);
    expect(r.expensesByCategory[0]).toEqual({ name: 'Fuel', amount: 250 });
  });

  it('ages what is still owed, ignoring invoices already paid in full', async () => {
    const r = await new BusinessAnalyticsService(prisma).finance(actor('f', ['finance.view']), '30');
    expect(r.totals.outstanding).toBe(1300);
    expect(r.totals.overdue).toBe(500);
    const by = Object.fromEntries(r.aging.map((a) => [a.name, a.amount]));
    expect(by).toMatchObject({ current: 800, d31_60: 500, d90plus: 0 });
    expect(r.topDebtors[0]).toEqual({ name: 'A', amount: 800 });
  });
});

describe('BusinessAnalyticsService.system', () => {
  it('counts people by status and splits sign-ins from failures', async () => {
    const prisma: any = {
      user: { groupBy: jest.fn(async () => [{ status: 'ACTIVE', _count: { _all: 12 } }, { status: 'DISABLED', _count: { _all: 2 } }, { status: 'LOCKED', _count: { _all: 1 } }]) },
      loginAttempt: { findMany: jest.fn(async () => [{ createdAt: recent(1), success: true, reason: null }, { createdAt: recent(1), success: false, reason: 'Wrong password' }, { createdAt: recent(2), success: false, reason: 'Wrong password' }]) },
      auditLog: { findMany: jest.fn(async () => [{ createdAt: recent(1), action: 'user.create' }, { createdAt: recent(1), action: 'paddy.approve' }, { createdAt: recent(2), action: 'user.update' }]) },
    };
    const r = await new BusinessAnalyticsService(prisma).system(actor('a', ['users.manage'], 'ADMIN'), '30');
    expect(r.users).toEqual({ total: 15, active: 12, disabled: 2, locked: 1, pending: 0 });
    expect(r.totals).toEqual({ signedIn: 1, failed: 2, recorded: 3 });
    expect(r.failedReasons).toEqual([{ name: 'Wrong password', count: 2 }]);
    expect(r.activityByArea[0]).toEqual({ name: 'user', count: 2 });
  });
});

describe('analytics views are kept to each role\'s own area', () => {
  const stub: any = { farms: jest.fn(async () => 'f'), warehouses: jest.fn(async () => 'w'), operations: jest.fn(async () => 'o'), executive: jest.fn(async () => 'e'), sales: jest.fn(async () => 's'), finance: jest.fn(async () => 'x'), system: jest.fn(async () => 'y') };
  const c = new OverviewAnalyticsController(stub, stub, stub);
  const as = (code: string) => actor('u', [], code);

  it('keeps the warehouse view from the Farm Supervisor and the farm view from the Warehouse Supervisor', () => {
    expect(() => c.warehouses(as('FARM_DIRECTOR'))).toThrow(/outside your area/);
    expect(() => c.farms(as('WAREHOUSE_SUPERVISOR'))).toThrow(/outside your area/);
    expect(c.farms(as('FARM_DIRECTOR'))).resolves.toBe('f');
  });
  it('keeps the company view to top management, and the system view to the Administrator', () => {
    expect(() => c.executive(as('OPERATIONS_MANAGER'))).toThrow();
    expect(() => c.system(as('FINANCE_OFFICER'))).toThrow();
    expect(c.system(as('ADMIN'))).resolves.toBe('y');
    expect(c.executive(as('MD'))).resolves.toBe('e');
  });
  it('gives the Sales Officer sales, and Finance finance, but not the other way round', () => {
    expect(() => c.finance(as('SALES_OFFICER'))).toThrow();
    expect(() => c.sales(as('FARM_MANAGER'))).toThrow();
    expect(c.sales(as('SALES_OFFICER'))).resolves.toBe('s');
    expect(c.finance(as('FINANCE_OFFICER'))).resolves.toBe('x');
  });
});
