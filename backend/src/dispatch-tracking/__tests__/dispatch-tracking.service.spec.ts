import { DispatchTrackingService, visibilityOf } from '../dispatch-tracking.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

const F1 = 'f1', F2 = 'f2', W1 = 'w1', W2 = 'w2', W3 = 'w3';
type Sc = { scopeType: string; scopeId: string | null };
const GLOBAL: Sc[] = [{ scopeType: 'GLOBAL', scopeId: null }];
const actor = (id: string, role: string, scopes: Sc[], perms: string[] = []) =>
  ({ id, firstName: 'T', lastName: id, permissionCodes: new Set(perms), roles: [{ roleId: 'r', roleCode: role, permissions: perms, scopes }] }) as unknown as AuthenticatedUser;
const T = (s: string) => new Date(`2026-${s}Z`);
const NOW = T('10-06T00:00:00');

const ORDERS = [
  { id: 'oA', orderNumber: 'DO-A', requestRef: 'RQ-A', farmId: F1, destinationWarehouseId: W1, createdById: 'u1', createdAt: T('10-01T08:00:00'), requestedDate: T('10-03T00:00:00'), paddyGradeId: 'g4', bagCount: 10, status: 'FULFILLED' },
  { id: 'oB', orderNumber: 'DO-B', requestRef: 'RQ-B', farmId: F2, destinationWarehouseId: W2, createdById: 'u1', createdAt: T('10-01T08:00:00'), requestedDate: T('10-09T00:00:00'), paddyGradeId: 'g4', bagCount: 10, status: 'FULFILLED' },
  { id: 'oC', orderNumber: 'DO-C', requestRef: 'RQ-C', farmId: F1, destinationWarehouseId: W2, createdById: 'u1', createdAt: T('10-02T08:00:00'), requestedDate: T('10-09T00:00:00'), paddyGradeId: 'g4', bagCount: 10, status: 'FULFILLED' },
  { id: 'oR', orderNumber: 'DO-R', requestRef: 'RQ-R', farmId: F2, destinationWarehouseId: W1, createdById: 'u1', createdAt: T('10-04T08:00:00'), requestedDate: T('10-09T00:00:00'), paddyGradeId: 'g4', bagCount: 10, status: 'PENDING' },
];
const rep = (id: string, order: string, farm: string, wh: string, status: string, extra: Record<string, unknown> = {}) => ({ id, reportNumber: `DR-${id}`, dispatchRef: `DS-${id}`, deliveryOrderId: order, farmId: farm, destinationWarehouseId: wh, paddyGradeId: 'g4', actualBagCount: 10, status, submittedById: 'u2', submittedAt: T('10-01T10:00:00'), approvedById: 'u1', approvedAt: T('10-01T12:00:00'), createdAt: T('10-01T09:00:00'), ...extra });
const REPORTS = [rep('A', 'oA', F1, W1, 'APPROVED'), rep('B', 'oB', F2, W2, 'RECONCILED'), rep('C', 'oC', F1, W2, 'APPROVED'), rep('D', 'oA', F1, W1, 'DRAFT'), rep('E', 'oA', F1, W1, 'CANCELLED')];
const SHIPMENTS = [
  { id: 'sA', deliveryReportId: 'A', paddyGradeId: 'g4', expectedBags: 10, receivedBags: null, departedAt: T('10-01T13:00:00'), receivedAt: null, receivedById: null, warehouseId: W1 },
  { id: 'sB', deliveryReportId: 'B', paddyGradeId: 'g4', expectedBags: 10, receivedBags: 10, departedAt: T('10-01T13:00:00'), receivedAt: T('10-02T09:00:00'), receivedById: 'u3', warehouseId: W2 },
  { id: 'sC', deliveryReportId: 'C', paddyGradeId: 'g4', expectedBags: 10, receivedBags: null, departedAt: T('10-02T13:00:00'), receivedAt: null, receivedById: null, warehouseId: W2 },
];
const PADDY = [
  { id: 'p1', transferNumber: 'PT-1', fromWarehouseId: W2, toWarehouseId: W1, status: 'IN_TRANSIT', sentById: 'u2', sentAt: T('10-05T07:00:00'), receivedAt: null, lines: [{ gradeLabel: 'Size 4', bags: 5 }], totalBags: 5, supplyRequestNumber: null },
  { id: 'p2', transferNumber: 'PT-2', fromWarehouseId: W3, toWarehouseId: W2, status: 'RECEIVED', sentById: 'u2', sentAt: T('10-04T07:00:00'), receivedAt: T('10-04T15:00:00'), receivedById: 'u3', lines: [{ gradeLabel: 'Size 4', bags: 5 }], receivedLines: [{ gradeLabel: 'Size 4', bags: 5 }], varianceBags: 0, totalBags: 5, supplyRequestNumber: null },
];
const RICE = [{ id: 'r1', transferNumber: 'TRF-1', sourceWarehouseId: W1, destWarehouseId: W3, productId: 'p', bagCount: 20, status: 'DISPATCHED', requestedById: 'u2', dispatchedAt: T('10-05T07:00:00'), receivedAt: null }];

function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([k, v]: [string, any]) => {
    if (k === 'OR') return (v as any[]).some((c) => matches(row, c));
    if (k === 'AND') return (v as any[]).every((c) => matches(row, c));
    if (k === 'deliveryReport') return false;
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      for (const o of Object.keys(v)) if (!['in', 'notIn', 'not'].includes(o)) throw new Error(`unknown filter ${k}: ${o}`);
      return ('in' in v ? v.in.includes(row[k]) : true) && ('notIn' in v ? !v.notIn.includes(row[k]) : true) && ('not' in v ? row[k] !== v.not : true);
    }
    return row[k] === v;
  });
}
function build() {
  const seen: Record<string, any[]> = {};
  const table = (name: string, rows: any[]) => ({ findMany: jest.fn(async ({ where }: any = {}) => { (seen[name] ??= []).push(where); return rows.filter((r) => matches(r, where)); }) });
  const prisma: any = {
    receiptReview: { findMany: jest.fn(async () => []) },
    deliveryReport: table('report', REPORTS), deliveryOrder: table('order', ORDERS), shipment: table('shipment', SHIPMENTS), paddyTransfer: table('paddy', PADDY), stockTransfer: table('rice', RICE),
    user: { findMany: jest.fn(async () => [{ id: 'u1', firstName: 'Efua', lastName: 'Mensah' }, { id: 'u2', firstName: 'Yaa', lastName: 'Owusu' }, { id: 'u3', firstName: 'Kwabena', lastName: 'Adjei' }]) },
    farm: { findMany: jest.fn(async () => [{ id: F1, name: 'Nkawkaw Farm' }, { id: F2, name: 'Techiman Farm' }]) },
    warehouse: { findMany: jest.fn(async () => [{ id: W1, name: 'Tamale Warehouse' }, { id: W2, name: 'Kumasi Warehouse' }, { id: W3, name: 'Bolga Warehouse' }]) },
    paddyGrade: { findMany: jest.fn(async () => [{ id: 'g4', label: 'Size 4' }]) }, vehicle: { findMany: jest.fn(async () => []) }, driver: { findMany: jest.fn(async () => []) },
    product: { findMany: jest.fn(async () => [{ id: 'p', name: 'Premium Rice 25kg' }]) }, supplyRequest: { findMany: jest.fn(async () => []) },
  };
  return { service: new DispatchTrackingService(prisma), seen };
}
const refs = async (a: AuthenticatedUser, opts: any = {}) => (await build().service.list(a, opts, NOW)).journeys.map((j) => j.ref).sort();

describe('who may track which dispatches', () => {
  it('a Farm Manager tracks their own farm\'s dispatches, and none of another farm\'s', async () => {
    expect(await refs(actor('fm1', 'FARM_MANAGER', [{ scopeType: 'FARM', scopeId: F1 }]))).toEqual(['DS-A', 'DS-C']);
    expect(await refs(actor('fm2', 'FARM_MANAGER', [{ scopeType: 'FARM', scopeId: F2 }]))).toEqual(['DS-B', 'RQ-R']);
  });
  it('a Warehouse Manager tracks what is coming to their warehouse and what leaves it, and nothing else', async () => {
    expect(await refs(actor('wm1', 'WAREHOUSE_MANAGER', [{ scopeType: 'WAREHOUSE', scopeId: W1 }]))).toEqual(['DS-A', 'PT-1', 'RQ-R', 'TRF-1']);
    expect(await refs(actor('wm2', 'WAREHOUSE_MANAGER', [{ scopeType: 'WAREHOUSE', scopeId: W2 }]))).toEqual(['DS-B', 'DS-C', 'PT-1', 'PT-2']);
  });
  it('the Warehouse Supervisor and the Farm Director, who supervise the managers, track everything, whatever places they were given', async () => {
    const everything = ['DS-A', 'DS-B', 'DS-C', 'PT-1', 'PT-2', 'RQ-R', 'TRF-1'];
    expect(await refs(actor('ws', 'WAREHOUSE_SUPERVISOR', [{ scopeType: 'WAREHOUSE', scopeId: W1 }]))).toEqual(everything);
    expect(await refs(actor('fd', 'FARM_DIRECTOR', [{ scopeType: 'FARM', scopeId: F1 }]))).toEqual(everything);
    expect(await refs(actor('md', 'MD', GLOBAL))).toEqual(everything);
    expect(await refs(actor('ceo', 'CEO', GLOBAL))).toEqual(everything);
  });
  it('someone with no farm and no warehouse tracks nothing, and the database is not even asked', async () => {
    const h = build();
    expect(await h.service.list(actor('x', 'FARM_MANAGER', []), {}, NOW)).toEqual({ journeys: [], counts: { open: 0, delivered: 0, late: 0, review: 0 } });
    expect(h.seen).toEqual({});
  });
  it('the limits go to the database itself, so isolation does not depend on the screen', async () => {
    const h = build(); await h.service.list(actor('fm1', 'FARM_MANAGER', [{ scopeType: 'FARM', scopeId: F1 }]), {}, NOW);
    expect(h.seen.report[0].OR).toEqual([{ farmId: { in: [F1] } }]);
    const g = build(); await g.service.list(actor('wm1', 'WAREHOUSE_MANAGER', [{ scopeType: 'WAREHOUSE', scopeId: W1 }]), {}, NOW);
    expect(g.seen.report[0].OR).toEqual([{ destinationWarehouseId: { in: [W1] } }]); expect(g.seen.paddy[0].OR).toEqual([{ fromWarehouseId: { in: [W1] } }, { toWarehouseId: { in: [W1] } }]);
    const a = build(); await a.service.list(actor('ws', 'WAREHOUSE_SUPERVISOR', []), {}, NOW); expect(a.seen.report[0].OR).toBeUndefined();
  });
  it('who is supervising is decided from the role, and the drafts and cancelled dispatches are not tracked', async () => {
    expect(visibilityOf(actor('a', 'ADMIN', []))).toEqual({ all: true });
    expect(visibilityOf(actor('a', 'FARM_MANAGER', [{ scopeType: 'FARM', scopeId: F1 }]))).toEqual({ all: false, farms: [F1], warehouses: [] });
    expect(await refs(actor('md', 'MD', GLOBAL))).not.toContain('DS-D'); expect(await refs(actor('md', 'MD', GLOBAL))).not.toContain('DS-E');
  });
});

describe('what the tracking shows', () => {
  it('each dispatch says where it is: in transit until the warehouse has counted it in, then delivered', async () => {
    const { journeys, counts } = await build().service.list(actor('md', 'MD', GLOBAL), {}, NOW);
    const by = Object.fromEntries(journeys.map((j) => [j.ref, j.status]));
    expect(by).toMatchObject({ 'DS-A': 'IN_TRANSIT', 'DS-B': 'DELIVERED', 'DS-C': 'IN_TRANSIT', 'RQ-R': 'REQUESTED', 'PT-1': 'IN_TRANSIT', 'PT-2': 'DELIVERED', 'TRF-1': 'IN_TRANSIT' });
    expect(counts).toEqual({ open: 5, delivered: 2, late: 1, review: 0 }); // only DS-A is past its needed-by day (3 Oct) and still on the road
  });
  it('the Managing Director sees the times: when it was supposed to be there and how long each step took', async () => {
    const j = (await build().service.list(actor('md', 'MD', GLOBAL), {}, NOW)).journeys.find((x) => x.ref === 'DS-A')!;
    expect(j.neededBy).toBe('2026-10-03T00:00:00.000Z'); expect(j.late).toEqual({ hours: 48, delivered: false });
    expect(j.steps.map((s) => s.key)).toEqual(['requested', 'loaded', 'approved', 'departed', 'delivered']);
    expect(j.slowest).toMatchObject({ label: 'Delivered and counted in', role: 'Warehouse Manager', running: true });
  });
  it('can be narrowed to what is still open or already delivered, and searched by reference, farm or warehouse', async () => {
    expect(await refs(actor('md', 'MD', GLOBAL), { status: 'delivered' })).toEqual(['DS-B', 'PT-2']);
    expect(await refs(actor('md', 'MD', GLOBAL), { status: 'open' })).toEqual(['DS-A', 'DS-C', 'PT-1', 'RQ-R', 'TRF-1']);
    expect(await refs(actor('md', 'MD', GLOBAL), { q: 'techiman' })).toEqual(['DS-B', 'RQ-R']);
    expect(await refs(actor('md', 'MD', GLOBAL), { q: 'ds-c' })).toEqual(['DS-C']);
  });
  it('the warehouse a truck is going to is offered the count-in, and nobody else is', async () => {
    const act = async (a: AuthenticatedUser, ref: string) => (await build().service.list(a, {}, NOW)).journeys.find((j) => j.ref === ref)?.action ?? null;
    const wm1 = actor('wm1', 'WAREHOUSE_MANAGER', [{ scopeType: 'WAREHOUSE', scopeId: W1 }], ['warehouse.receive']);
    expect(await act(wm1, 'DS-A')).toEqual({ type: 'CONFIRM_TRUCK', key: 'DS-A' });
    expect(await act(wm1, 'PT-1')).toEqual({ type: 'OPEN', href: '/site-deliveries?transfer=p1', label: 'Open the delivery' });
    expect(await act(actor('wm2', 'WAREHOUSE_MANAGER', [{ scopeType: 'WAREHOUSE', scopeId: W2 }], ['warehouse.receive']), 'DS-A')).toBeNull(); // another warehouse's truck
    expect(await act(actor('fm1', 'FARM_MANAGER', [{ scopeType: 'FARM', scopeId: F1 }], ['delivery.create']), 'DS-A')).toBeNull();
    expect(await act(actor('md', 'MD', GLOBAL, ['dispatch.track']), 'DS-A')).toBeNull(); // tracking is read-only for management
    expect(await act(wm1, 'DS-B')).toBeNull(); // already delivered
  });
});
