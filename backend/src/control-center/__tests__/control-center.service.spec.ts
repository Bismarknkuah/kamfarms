import { ForbiddenException } from '@nestjs/common';
import { ControlCenterService } from '../control-center.service';
import { CONTROL_CENTER_ROLES, TILES } from '../control-center.catalog';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

const F1 = 'farm-1', F2 = 'farm-2', W1 = 'wh-1', W2 = 'wh-2', M1 = 'mc-1', M2 = 'mc-2';
type Sc = { scopeType: string; scopeId: string | null };
const GLOBAL: Sc[] = [{ scopeType: 'GLOBAL', scopeId: null }];

const PERMS: Record<string, string[]> = {
  FINANCE_DIRECTOR: ['dashboard.view', 'finance.view', 'finance.approve', 'sales.approve', 'payment.verify', 'invoice.create', 'expense.create', 'reports.view', 'tasks.assign', 'tasks.complete'],
  MD: ['supply.view', 'dashboard.view', 'finance.view', 'sales.view', 'sales.release', 'finance.approve.director', 'reports.view', 'tasks.assign'],
  FARM_DIRECTOR: ['supply.view', 'supply.fulfil', 'paddy.approve', 'paddy.reject', 'delivery.create', 'delivery.approve', 'delivery.reject', 'inventory.adjust', 'expense.view', 'tasks.assign', 'tasks.complete'],
  WAREHOUSE_MANAGER: ['supply.view', 'supply.request', 'warehouse.receive', 'sales.fulfill', 'tasks.complete'],
  WAREHOUSE_SUPERVISOR: ['supply.view', 'supply.request', 'supply.forward', 'supply.fulfil', 'warehouse.transfer', 'inventory.adjust', 'sales.assign', 'sales.fulfill', 'tasks.assign', 'tasks.complete'],
  OPERATIONS_MANAGER: ['supply.view', 'supply.request', 'supply.forward', 'production.approve', 'inventory.adjust', 'tasks.assign', 'tasks.complete'],
  SALES_OFFICER: ['sales.create', 'tasks.complete'],
  FARM_MANAGER: ['paddy.create', 'delivery.create', 'tasks.complete'],
  ADMIN: ['dashboard.view'],
  CEO: ['supply.view', 'dashboard.view', 'sales.release', 'finance.approve.director', 'reports.view'],
  OPERATIONS_OFFICER: ['supply.view', 'supply.request', 'milldispatch.view', 'milldispatch.request', 'milldispatch.receive', 'tasks.complete'],
};
const actor = (id: string, role: string, scopes: Sc[] = GLOBAL, perms: string[] = PERMS[role]) =>
  ({ id, firstName: 'T', lastName: id, permissionCodes: new Set(perms), roles: [{ roleId: 'r', roleCode: role, permissions: perms, scopes }] }) as unknown as AuthenticatedUser;

const NOW = new Date('2026-10-05T08:00:00Z');
const so = (status: string, allocatedWarehouseId: string | null = null, by = 'so-1') => ({ status, allocatedWarehouseId, salesOfficerId: by, submittedById: by });
const DATA: Record<string, any[]> = {
  paddyEntry: [{ status: 'SUBMITTED', farmId: F1 }, { status: 'SUBMITTED', farmId: F1 }, { status: 'SUBMITTED', farmId: F2 }, { status: 'APPROVED', farmId: F1 }, { status: 'DRAFT', farmId: F1 }],
  deliveryReport: [{ status: 'SUPERVISOR_REVIEW', farmId: F1 }, { status: 'SUPERVISOR_REVIEW', farmId: F2 }, { status: 'SUBMITTED', farmId: F1 }, { status: 'APPROVED', farmId: F1 }],
  inventoryAdjustment: [{ status: 'PENDING', locationType: 'FARM', locationId: F1 }, { status: 'PENDING', locationType: 'WAREHOUSE', locationId: W1 }, { status: 'PENDING', locationType: 'WAREHOUSE', locationId: W2 }, { status: 'APPROVED', locationType: 'FARM', locationId: F1 }],
  shipment: [{ receivedAt: null, warehouseId: W1 }, { receivedAt: null, warehouseId: W1 }, { receivedAt: null, warehouseId: W2 }, { receivedAt: NOW, warehouseId: W1 }],
  paddyTransfer: [{ status: 'IN_TRANSIT', toWarehouseId: W1 }, { status: 'IN_TRANSIT', toWarehouseId: W2 }, { status: 'RECEIVED', toWarehouseId: W1 }],
  stockTransfer: [{ status: 'DISPATCHED', destWarehouseId: W1 }, { status: 'DISPATCHED', destWarehouseId: W2 }, { status: 'RECEIVED', destWarehouseId: W1 }],
  salesOrder: [so('SUBMITTED'), so('SUBMITTED', null, 'so-2'), so('APPROVED'), so('APPROVED'), so('APPROVED'), so('RELEASED'), so('RESERVED', W1), so('PROCESSING', W1), so('RESERVED', W2), so('FULFILLED', W1)],
  payment: [{ status: 'PENDING_VERIFICATION' }, { status: 'PENDING_VERIFICATION' }, { status: 'PENDING_VERIFICATION' }, { status: 'VERIFIED' }],
  expense: [
    { status: 'PENDING', submittedById: 'staff-1', farmId: F1, warehouseId: null }, { status: 'PENDING', submittedById: 'staff-2', farmId: null, warehouseId: W1 },
    { status: 'PENDING', submittedById: 'md-x', farmId: null, warehouseId: null }, { status: 'PENDING', submittedById: 'fd-1', farmId: null, warehouseId: null }, { status: 'APPROVED', submittedById: 'staff-1', farmId: F1, warehouseId: null },
  ],
  productionRecord: [{ status: 'SUBMITTED', millingCenterId: M1 }, { status: 'SUBMITTED', millingCenterId: M2 }, { status: 'APPROVED', millingCenterId: M1 }],
  task: [{ assignedToId: 'fd-1', status: 'TODO' }, { assignedToId: 'fd-1', status: 'IN_PROGRESS' }, { assignedToId: 'fd-1', status: 'COMPLETED' }, { assignedToId: 'someone-else', status: 'TODO' }],
};
const NAMES = { farm: { [F1]: 'Nkawkaw Farm', [F2]: 'Techiman Farm' }, warehouse: { [W1]: 'Tamale Warehouse', [W2]: 'Kumasi Warehouse' }, millingCenter: { [M1]: 'Tamale Mill', [M2]: 'Kumasi Mill' } } as Record<string, Record<string, string>>;

/** A small stand-in for the database's where-clauses: equality (null too), in, not, AND, OR. Anything else would be an unknown filter, and fails loudly. */
function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([k, v]: [string, any]) => {
    if (k === 'AND') return (v as any[]).every((c) => matches(row, c));
    if (k === 'OR') return (v as any[]).some((c) => matches(row, c));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const ops = Object.keys(v); if (!ops.every((o) => ['in', 'not', 'gt'].includes(o))) throw new Error(`unknown filter ${k}: ${JSON.stringify(v)}`);
      return ('in' in v ? v.in.includes(row[k]) : true) && ('not' in v ? row[k] !== v.not : true) && ('gt' in v ? row[k] > v.gt : true);
    }
    return row[k] === v;
  });
}
function build(supply = { waiting: 2, open: 5 }) {
  const seen: { model: string; where: any }[] = [];
  const table = (model: string) => ({ count: jest.fn(async ({ where }: any = {}) => { seen.push({ model, where }); return DATA[model].filter((r) => matches(r, where)).length; }) });
  const lookup = (kind: string) => ({ findMany: jest.fn(async ({ where }: any) => where.id.in.filter((id: string) => NAMES[kind][id]).map((id: string) => ({ id, name: NAMES[kind][id] }))) });
  const prisma: any = {
    ...Object.fromEntries(Object.keys(DATA).map((m) => [m, table(m)])),
    user: { findMany: jest.fn(async () => [{ id: 'fd-1' }]) },
    farm: lookup('farm'), warehouse: lookup('warehouse'), millingCenter: lookup('millingCenter'),
  };
  const supplyService = { counts: jest.fn(async () => supply) };
  return { service: new ControlCenterService(prisma, supplyService as any), prisma, seen, supplyService };
}
const keys = (v: { tiles: { key: string }[] }) => v.tiles.map((t) => t.key);
const countOf = (v: { tiles: { key: string; count: number }[] }, key: string) => v.tiles.find((t) => t.key === key)?.count;
const whereOf = (h: ReturnType<typeof build>, model: string) => h.seen.filter((s) => s.model === model).map((s) => s.where);

describe('who has a control center', () => {
  it('the Managing Director, Farm Supervisor, Warehouse Manager and Supervisor, Operations Manager and Finance Director do; the Administrator may ask too', async () => {
    expect([...CONTROL_CENTER_ROLES].sort()).toEqual(['CEO', 'FARM_DIRECTOR', 'FINANCE_DIRECTOR', 'MD', 'OPERATIONS_MANAGER', 'OPERATIONS_OFFICER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_SUPERVISOR']);
    for (const role of CONTROL_CENTER_ROLES) await expect(build().service.forActor(actor('u', role))).resolves.toMatchObject({ role });
    await expect(build().service.forActor(actor('a', 'ADMIN', GLOBAL))).resolves.toMatchObject({ role: 'ADMIN' });
  });
  it('nobody else does: a Sales Officer or a Farm Manager is refused, and nothing is looked up', async () => {
    const h = build();
    await expect(h.service.forActor(actor('s', 'SALES_OFFICER'))).rejects.toThrow(ForbiddenException);
    await expect(h.service.forActor(actor('f', 'FARM_MANAGER', [{ scopeType: 'FARM', scopeId: F1 }]))).rejects.toThrow('does not have a control center');
    expect(h.seen).toEqual([]);
  });
});

describe('the Finance Director\'s control center: orders, payments and expenses', () => {
  it('shows exactly what a Finance Director decides, and nothing from the farms, warehouses or mills', async () => {
    const v = await build().service.forActor(actor('fd-1', 'FINANCE_DIRECTOR'));
    expect(keys(v)).toEqual(['orders-approve', 'payments-verify', 'expenses-decide', 'my-tasks']);
    expect(v.jurisdiction).toEqual({ everything: true, farms: [], warehouses: [], millingCenters: [] });
  });
  it('counts orders SUBMITTED, payments waiting to be verified, other people\'s PENDING expenses (never their own) and their own open tasks', async () => {
    const v = await build().service.forActor(actor('fd-1', 'FINANCE_DIRECTOR'));
    expect(countOf(v, 'orders-approve')).toBe(2); expect(countOf(v, 'payments-verify')).toBe(3);
    expect(countOf(v, 'expenses-decide')).toBe(3); // staff-1, staff-2 and md-x; the one fd-1 entered himself is not his to decide
    expect(countOf(v, 'my-tasks')).toBe(2);        // TODO and IN_PROGRESS; the completed one and someone else's are not counted
  });
  it('a figure above zero is highlighted as something to act on; zero is not', async () => {
    const v = await build().service.forActor(actor('fd-1', 'FINANCE_DIRECTOR'));
    expect(v.tiles.every((t) => t.tone === (t.count > 0 ? 'warn' : 'plain'))).toBe(true);
    DATA.payment.forEach((p) => (p.status = 'VERIFIED'));
    const calm = await build().service.forActor(actor('fd-1', 'FINANCE_DIRECTOR'));
    expect(calm.tiles.find((t) => t.key === 'payments-verify')).toMatchObject({ count: 0, tone: 'plain' });
    DATA.payment.forEach((p, i) => (p.status = i < 3 ? 'PENDING_VERIFICATION' : 'VERIFIED'));
  });
});

describe('the Managing Director\'s control center: release, and what only the MD decides', () => {
  it('shows orders to release, the Finance Director\'s own expenses, requests in progress and tasks; not the Finance Director\'s decisions', async () => {
    const v = await build().service.forActor(actor('md-1', 'MD'));
    expect(keys(v)).toEqual(['orders-release', 'expenses-director', 'supply-open', 'my-tasks']);
    expect(countOf(v, 'orders-release')).toBe(3);   // APPROVED, waiting for release
    expect(countOf(v, 'expenses-director')).toBe(1); // only the expense the Finance Director entered personally
    expect(countOf(v, 'supply-open')).toBe(5);
  });
  it('the Finance Director never sees the Managing Director\'s expense tile, and the MD never the Finance Director\'s', async () => {
    expect(keys(await build().service.forActor(actor('fd-1', 'FINANCE_DIRECTOR')))).not.toContain('expenses-director');
    expect(keys(await build().service.forActor(actor('md-1', 'MD')))).not.toContain('expenses-decide');
  });
});

describe('the Farm Supervisor\'s control center is limited to their own farms', () => {
  const onF1 = [{ scopeType: 'FARM', scopeId: F1 }];
  it('counts only the farm they are responsible for', async () => {
    const h = build(); const v = await h.service.forActor(actor('fs-1', 'FARM_DIRECTOR', onF1));
    expect(keys(v)).toEqual(['paddy-entries', 'dispatch-approvals', 'stock-corrections', 'supply-waiting', 'supply-open', 'my-tasks']);
    expect(countOf(v, 'paddy-entries')).toBe(2);       // farm 1's two SUBMITTED entries, not farm 2's
    expect(countOf(v, 'dispatch-approvals')).toBe(1);  // farm 1's SUPERVISOR_REVIEW report only
    expect(countOf(v, 'stock-corrections')).toBe(1);   // farm 1's correction; the warehouses' are not theirs
    expect(v.jurisdiction).toEqual({ everything: false, farms: [{ id: F1, name: 'Nkawkaw Farm' }], warehouses: [], millingCenters: [] });
  });
  it('the queries themselves carry the place filter, so isolation does not depend on the screen', async () => {
    const h = build(); await h.service.forActor(actor('fs-1', 'FARM_DIRECTOR', onF1));
    expect(whereOf(h, 'paddyEntry')).toEqual([{ status: 'SUBMITTED', farmId: { in: [F1] } }]);
    expect(whereOf(h, 'deliveryReport')).toEqual([{ status: 'SUPERVISOR_REVIEW', farmId: { in: [F1] } }]);
    expect(whereOf(h, 'inventoryAdjustment')).toEqual([{ status: 'PENDING', OR: [{ locationType: 'FARM', locationId: { in: [F1] } }] }]);
  });
  it('a Farm Supervisor responsible for every farm sees them all', async () => {
    const v = await build().service.forActor(actor('fs-2', 'FARM_DIRECTOR'));
    expect([countOf(v, 'paddy-entries'), countOf(v, 'dispatch-approvals'), countOf(v, 'stock-corrections')]).toEqual([3, 2, 3]);
    expect(v.jurisdiction.everything).toBe(true);
  });
  it('a person with no farm at all sees nothing from any farm, and is not mistaken for someone responsible for everything', async () => {
    const v = await build().service.forActor(actor('fs-3', 'FARM_DIRECTOR', []));
    expect([countOf(v, 'paddy-entries'), countOf(v, 'dispatch-approvals'), countOf(v, 'stock-corrections')]).toEqual([0, 0, 0]);
    expect(v.jurisdiction).toEqual({ everything: false, farms: [], warehouses: [], millingCenters: [] });
  });
});

describe('the Warehouse Manager\'s control center is limited to their own warehouse', () => {
  const onW1 = [{ scopeType: 'WAREHOUSE', scopeId: W1 }];
  it('shows trucks and paddy coming to THEIR warehouse and the orders assigned to it, and none of the supervisor\'s or finance\'s work', async () => {
    const h = build(); const v = await h.service.forActor(actor('wm-1', 'WAREHOUSE_MANAGER', onW1));
    expect(keys(v)).toEqual(['orders-prepare', 'trucks-coming', 'transfers-coming', 'supply-open', 'my-tasks']);
    expect(countOf(v, 'trucks-coming')).toBe(2);     // two trucks on the road to warehouse 1; warehouse 2's and the one already received are not counted
    expect(countOf(v, 'transfers-coming')).toBe(1);
    expect(countOf(v, 'orders-prepare')).toBe(2);    // RESERVED and PROCESSING at warehouse 1 (warehouse 2's RESERVED order is not theirs)
    expect(v.jurisdiction).toEqual({ everything: false, farms: [], warehouses: [{ id: W1, name: 'Tamale Warehouse' }], millingCenters: [] });
    expect(whereOf(h, 'shipment')).toEqual([{ receivedAt: null, warehouseId: { in: [W1] } }]);
    expect(whereOf(h, 'paddyTransfer')).toEqual([{ status: 'IN_TRANSIT', toWarehouseId: { in: [W1] } }]);
  });
  it('the other warehouse\'s manager sees the other warehouse\'s figures', async () => {
    const v = await build().service.forActor(actor('wm-2', 'WAREHOUSE_MANAGER', [{ scopeType: 'WAREHOUSE', scopeId: W2 }]));
    expect([countOf(v, 'trucks-coming'), countOf(v, 'transfers-coming'), countOf(v, 'orders-prepare')]).toEqual([1, 1, 1]);
  });
  it('a manager responsible for two warehouses gets both, and no third', async () => {
    const v = await build().service.forActor(actor('wm-3', 'WAREHOUSE_MANAGER', [...onW1, { scopeType: 'WAREHOUSE', scopeId: W2 }]));
    expect(countOf(v, 'trucks-coming')).toBe(3); expect(v.jurisdiction.warehouses.map((w) => w.name)).toEqual(['Tamale Warehouse', 'Kumasi Warehouse']);
  });
});

describe('the Warehouse Supervisor\'s control center', () => {
  const onW1 = [{ scopeType: 'WAREHOUSE', scopeId: W1 }];
  it('shows requests waiting for them, orders to assign, their own warehouse\'s orders and deliveries, and corrections', async () => {
    const h = build(); const v = await h.service.forActor(actor('ws-1', 'WAREHOUSE_SUPERVISOR', onW1));
    expect(keys(v)).toEqual(['orders-assign', 'orders-prepare', 'stock-corrections', 'supply-waiting', 'transfers-coming', 'rice-coming', 'supply-open', 'my-tasks']);
    expect(countOf(v, 'supply-waiting')).toBe(2); expect(countOf(v, 'supply-open')).toBe(5);
    expect(countOf(v, 'orders-assign')).toBe(1);   // a released order: the pipeline is theirs to assign
    expect(countOf(v, 'orders-prepare')).toBe(2);  // ...but only their own warehouse's orders to prepare
    expect(countOf(v, 'transfers-coming')).toBe(1); expect(countOf(v, 'rice-coming')).toBe(1);
    expect(countOf(v, 'stock-corrections')).toBe(1); // warehouse 1's correction, not warehouse 2's
    expect(h.supplyService.counts).toHaveBeenCalledTimes(1); // asked once, though two tiles use it
  });
  it('has no truck tile (counting trucks in is the Warehouse Manager\'s permission)', async () => {
    expect(keys(await build().service.forActor(actor('ws-1', 'WAREHOUSE_SUPERVISOR', onW1)))).not.toContain('trucks-coming');
  });
});

describe('the Operations Manager\'s control center', () => {
  it('shows production to approve, mill requests waiting for them, corrections and tasks', async () => {
    const v = await build().service.forActor(actor('om-1', 'OPERATIONS_MANAGER'));
    expect(keys(v)).toEqual(['stock-corrections', 'production-approve', 'supply-waiting', 'supply-open', 'my-tasks']);
    expect(countOf(v, 'production-approve')).toBe(2);
  });
  it('limited to one mill, only that mill\'s production counts', async () => {
    const h = build(); const v = await h.service.forActor(actor('om-2', 'OPERATIONS_MANAGER', [{ scopeType: 'MILLING_CENTER', scopeId: M1 }]));
    expect(countOf(v, 'production-approve')).toBe(1);
    expect(whereOf(h, 'productionRecord')).toEqual([{ status: 'SUBMITTED', millingCenterId: { in: [M1] } }]);
    expect(v.jurisdiction.millingCenters).toEqual([{ id: M1, name: 'Tamale Mill' }]);
  });
});

describe('what a person sees follows what their role is allowed to do', () => {
  it('take a permission away and its tile goes; give it and it appears (the Roles page changes the control center by itself)', async () => {
    const without = PERMS.FINANCE_DIRECTOR.filter((p) => p !== 'payment.verify');
    expect(keys(await build().service.forActor(actor('fd-1', 'FINANCE_DIRECTOR', GLOBAL, without)))).toEqual(['orders-approve', 'expenses-decide', 'my-tasks']);
    expect(keys(await build().service.forActor(actor('fd-1', 'FINANCE_DIRECTOR', GLOBAL, [...PERMS.FINANCE_DIRECTOR, 'production.approve'])))).toContain('production-approve');
  });
  it('every tile in the catalogue names a page and a permission, and no tile is shown twice', () => {
    expect(new Set(TILES.map((t) => t.key)).size).toBe(TILES.length);
    for (const t of TILES) { expect(t.href.startsWith('/')).toBe(true); expect(t.label.length).toBeGreaterThan(8); }
  });
  it('the sales figures use the same visibility rule as the Sales page: a Sales Officer holding an approving permission would see the whole pipeline, one without would see nothing here', async () => {
    const h = build(); const v = await h.service.forActor(actor('fd-1', 'FINANCE_DIRECTOR', GLOBAL, ['sales.approve', 'finance.approve']));
    expect(countOf(v, 'orders-approve')).toBe(2);
    expect(whereOf(h, 'salesOrder')[0]).toEqual({ AND: [{}, { status: 'SUBMITTED' }] });
  });
});

// ------------------------------------------------------------------ the CEO, the mill, and damaged-bag reviews
const MT = (direction: string, status: string, millingCenterId: string, warehouseId: string) => ({ direction, status, millingCenterId, warehouseId });
Object.assign(DATA, {
  millTransfer: [
    MT('TO_MILL', 'IN_TRANSIT', M1, W1), MT('TO_MILL', 'IN_TRANSIT', M1, W1), MT('TO_MILL', 'IN_TRANSIT', M2, W2),
    MT('TO_MILL', 'PENDING_APPROVAL', M1, W1), MT('TO_MILL', 'PENDING_APPROVAL', M2, W2),
    MT('TO_WAREHOUSE', 'PENDING_APPROVAL', M1, W1), MT('TO_WAREHOUSE', 'IN_TRANSIT', M1, W1), MT('TO_WAREHOUSE', 'IN_TRANSIT', M2, W2), MT('TO_WAREHOUSE', 'RECEIVED', M1, W1),
  ],
  inventoryBalance: [
    { locationType: 'MILLING_CENTER', locationId: M1, productId: 'rice', bagCount: 20, quantityKg: 500 },
    { locationType: 'MILLING_CENTER', locationId: M1, productId: 'broken', bagCount: 0, quantityKg: 80 },
    { locationType: 'MILLING_CENTER', locationId: M1, productId: 'hull', bagCount: 0, quantityKg: 0 },        // nothing there: not "waiting"
    { locationType: 'MILLING_CENTER', locationId: M1, productId: null, bagCount: 50, quantityKg: 2500 },      // paddy, not a finished product
    { locationType: 'MILLING_CENTER', locationId: M2, productId: 'rice', bagCount: 5, quantityKg: 125 },
    { locationType: 'WAREHOUSE', locationId: W1, productId: 'rice', bagCount: 9, quantityKg: 225 },
  ],
  receiptReview: [{ status: 'PENDING', warehouseId: W1 }, { status: 'PENDING', warehouseId: W2 }, { status: 'APPROVED', warehouseId: W1 }],
});
const WS_PERMS = ['supply.view', 'supply.forward', 'supply.fulfil', 'milldispatch.view', 'milldispatch.approve', 'milldispatch.receive', 'receipt.review', 'inventory.adjust', 'tasks.complete'];
const at = (type: string, id: string): Sc[] => [{ scopeType: type, scopeId: id }];

describe('the CEO and the mill: control centers and tiles', () => {
  it('the CEO has a control center, with the tiles their permissions earn', async () => {
    expect(keys(await build().service.forActor(actor('ceo-1', 'CEO')))).toEqual(['orders-release', 'expenses-director', 'supply-open', 'my-tasks']);
  });
  it('an Operations Officer sees paddy on its way to THEIR mill and the finished products waiting THERE, nothing of the other mill', async () => {
    const v = await build().service.forActor(actor('oo-1', 'OPERATIONS_OFFICER', at('MILLING_CENTER', M1)));
    expect(keys(v)).toEqual(['mill-paddy-coming', 'mill-products-ready', 'supply-open', 'my-tasks']);
    expect(countOf(v, 'mill-paddy-coming')).toBe(2);       // the third is going to the other mill
    expect(countOf(v, 'mill-products-ready')).toBe(2);     // rice and broken rice; not the empty hull, not the paddy, not the other mill's rice
    expect(countOf(await build().service.forActor(actor('oo-2', 'OPERATIONS_OFFICER', at('MILLING_CENTER', M2))), 'mill-products-ready')).toBe(1);
  });
  it('an Operations Officer with no mill assigned sees zero, not the whole company', async () => {
    const v = await build().service.forActor(actor('oo-3', 'OPERATIONS_OFFICER', []));
    expect(countOf(v, 'mill-paddy-coming')).toBe(0); expect(countOf(v, 'mill-products-ready')).toBe(0);
  });
  it('a Warehouse Supervisor sees what is waiting for THEIR warehouse: paddy for the mill to approve, milled rice coming, damaged bags to review', async () => {
    const h = build(); const v = await h.service.forActor(actor('ws-1', 'WAREHOUSE_SUPERVISOR', at('WAREHOUSE', W1), WS_PERMS));
    expect(keys(v)).toEqual(['receipts-review', 'stock-corrections', 'supply-waiting', 'mill-approvals', 'milled-rice-coming', 'supply-open', 'my-tasks']);
    expect(countOf(v, 'receipts-review')).toBe(1);          // the approved one and the other warehouse's are not theirs
    expect(countOf(v, 'mill-approvals')).toBe(1);           // paddy for the mill: THEIR approval; finished products coming back are the Operations Manager's
    expect(countOf(v, 'milled-rice-coming')).toBe(1);
    expect(whereOf(h, 'receiptReview')[0]).toEqual({ status: 'PENDING', warehouseId: { in: [W1] } });
    expect(whereOf(h, 'millTransfer').some((w) => JSON.stringify(w) === JSON.stringify({ status: 'PENDING_APPROVAL', OR: [{ direction: 'TO_MILL', warehouseId: { in: [W1] } }] }))).toBe(true);
    const other = await build().service.forActor(actor('ws-2', 'WAREHOUSE_SUPERVISOR', at('WAREHOUSE', W2), WS_PERMS));
    expect(countOf(other, 'receipts-review')).toBe(1); expect(countOf(other, 'milled-rice-coming')).toBe(1);
  });
  it('the Operations Manager approves finished products coming back, not paddy going out', async () => {
    const v = await build().service.forActor(actor('om-1', 'OPERATIONS_MANAGER', GLOBAL, ['supply.view', 'milldispatch.view', 'milldispatch.approve', 'production.approve', 'tasks.complete']));
    expect(keys(v)).toContain('mill-approvals'); expect(keys(v)).not.toContain('milled-rice-coming');
    expect(countOf(v, 'mill-approvals')).toBe(1);           // only the one TO_WAREHOUSE request waiting
  });
  it('a Warehouse Manager sees milled rice coming, and no approvals', async () => {
    const v = await build().service.forActor(actor('wm-1', 'WAREHOUSE_MANAGER', at('WAREHOUSE', W1), ['milldispatch.view', 'milldispatch.receive', 'warehouse.receive', 'supply.view', 'tasks.complete']));
    expect(keys(v)).toContain('milled-rice-coming'); expect(keys(v)).not.toContain('mill-approvals'); expect(countOf(v, 'milled-rice-coming')).toBe(1);
  });
  it('the roles-only tiles are never shown to a role that merely holds the same permission', async () => {
    const v = await build().service.forActor(actor('fd-9', 'FINANCE_DIRECTOR', GLOBAL, ['milldispatch.view', 'milldispatch.receive', 'milldispatch.request', 'tasks.complete']));
    for (const k of ['mill-paddy-coming', 'mill-products-ready', 'milled-rice-coming']) expect(keys(v)).not.toContain(k);
  });
});
