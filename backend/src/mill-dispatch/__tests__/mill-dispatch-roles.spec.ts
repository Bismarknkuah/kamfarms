import { MillDispatchService } from '../mill-dispatch.service';

type Sc = { scopeType: string; scopeId: string | null };
const wh = (id: string): Sc => ({ scopeType: 'WAREHOUSE', scopeId: id });
const mill = (id: string): Sc => ({ scopeType: 'MILLING_CENTER', scopeId: id });
const GLOBAL: Sc[] = [{ scopeType: 'GLOBAL', scopeId: null }];
const actor = (role: string, scopes: Sc[]) => ({ id: `u-${role}`, permissionCodes: new Set<string>(), roles: [{ roleId: 'r', roleCode: role, permissions: [], scopes }] }) as any;

const svc: any = Object.create(MillDispatchService.prototype);
const here = { warehouseId: 'W1', millingCenterId: 'M1' };      // the mill M1 belongs to warehouse W1
const elsewhere = { warehouseId: 'W2', millingCenterId: 'M2' };

describe('mill dispatch: who may ask, approve and count in', () => {
  it('an Operations Officer may ASK for paddy for their own mill, but not for another mill', () => {
    expect(svc.may(actor('OPERATIONS_OFFICER', [mill('M1')]), 'TO_MILL', 'request', here)).toBe(true);
    expect(svc.may(actor('OPERATIONS_OFFICER', [mill('M1')]), 'TO_MILL', 'request', elsewhere)).toBe(false);
  });
  it('a Warehouse Manager may still send paddy from their own warehouse, and only theirs', () => {
    expect(svc.may(actor('WAREHOUSE_MANAGER', [wh('W1')]), 'TO_MILL', 'request', here)).toBe(true);
    expect(svc.may(actor('WAREHOUSE_MANAGER', [wh('W1')]), 'TO_MILL', 'request', elsewhere)).toBe(false);
  });
  it('the Operations Officer does not approve their own ask: the Warehouse Supervisor approves paddy for the mill', () => {
    expect(svc.may(actor('OPERATIONS_OFFICER', [mill('M1')]), 'TO_MILL', 'approve', here)).toBe(false);
    expect(svc.may(actor('WAREHOUSE_SUPERVISOR', [wh('W1')]), 'TO_MILL', 'approve', here)).toBe(true);
    expect(svc.may(actor('WAREHOUSE_SUPERVISOR', [wh('W1')]), 'TO_MILL', 'approve', elsewhere)).toBe(false);
  });
  it('the Operations Officer counts paddy in at their mill only', () => {
    expect(svc.may(actor('OPERATIONS_OFFICER', [mill('M1')]), 'TO_MILL', 'receive', here)).toBe(true);
    expect(svc.may(actor('OPERATIONS_OFFICER', [mill('M1')]), 'TO_MILL', 'receive', elsewhere)).toBe(false);
  });
  it('the Warehouse Supervisor may count MILLED RICE in at their warehouse (as the Warehouse Manager may), but not at another', () => {
    expect(svc.may(actor('WAREHOUSE_SUPERVISOR', [wh('W1')]), 'TO_WAREHOUSE', 'receive', here)).toBe(true);
    expect(svc.may(actor('WAREHOUSE_SUPERVISOR', [wh('W1')]), 'TO_WAREHOUSE', 'receive', elsewhere)).toBe(false);
    expect(svc.may(actor('WAREHOUSE_MANAGER', [wh('W1')]), 'TO_WAREHOUSE', 'receive', here)).toBe(true);
  });
  it('the mill does not count its own products into the warehouse, and a Warehouse Supervisor does not count paddy into the mill', () => {
    expect(svc.may(actor('OPERATIONS_OFFICER', [mill('M1')]), 'TO_WAREHOUSE', 'receive', here)).toBe(false);
    expect(svc.may(actor('WAREHOUSE_SUPERVISOR', [wh('W1')]), 'TO_MILL', 'receive', here)).toBe(false);
  });
  it('the Operations Manager still approves finished products coming back', () => {
    expect(svc.may(actor('OPERATIONS_MANAGER', [mill('M1')]), 'TO_WAREHOUSE', 'approve', here)).toBe(true);
  });
  it('refusals name who does the step, in plain words', () => {
    expect(() => svc.assertMay(actor('FARM_MANAGER', GLOBAL), 'TO_MILL', 'request', here)).toThrow(/Warehouse Manager or the mill's Operations Officer/);
    expect(() => svc.assertMay(actor('OPERATIONS_OFFICER', [mill('M1')]), 'TO_WAREHOUSE', 'receive', here)).toThrow(/Warehouse Manager or Warehouse Supervisor/);
    expect(() => svc.assertMay(actor('OPERATIONS_OFFICER', [mill('M1')]), 'TO_MILL', 'request', elsewhere)).toThrow();
    expect(() => svc.assertMay(actor('OPERATIONS_OFFICER', [mill('M1')]), 'TO_MILL', 'request', here)).not.toThrow();
  });
  it('the Administrator may do any step anywhere', () => {
    for (const [dir, step] of [['TO_MILL', 'request'], ['TO_MILL', 'approve'], ['TO_WAREHOUSE', 'receive']] as const) expect(svc.may(actor('ADMIN', GLOBAL), dir, step, elsewhere)).toBe(true);
  });
});

describe('mill dispatch: the paddy form each person is offered', () => {
  const MILLS = [{ id: 'M1', name: 'Mill 1', warehouseId: 'W1' }, { id: 'M2', name: 'Mill 2', warehouseId: 'W1' }, { id: 'M3', name: 'Mill 3', warehouseId: 'W2' }];
  const WHS = [{ id: 'W1', name: 'Warehouse 1' }, { id: 'W2', name: 'Warehouse 2' }];
  const inFilter = (rows: any[], where: any) => rows.filter((r) => (!where.id?.in || where.id.in.includes(r.id)) && (!where.warehouseId?.in || where.warehouseId.in.includes(r.warehouseId)));
  const make = () => Object.assign(Object.create(MillDispatchService.prototype), {
    prisma: {
      warehouse: { findMany: jest.fn(async ({ where }: any) => inFilter(WHS, where)) },
      millingCenter: { findMany: jest.fn(async ({ where }: any) => inFilter(MILLS, where)) },
      paddyGrade: { findMany: jest.fn(async () => [{ id: 'g4', label: 'Size 4' }]) },
      product: { findMany: jest.fn(async () => []) }, packagingSize: { findMany: jest.fn(async () => []) },
    },
    ledger: { getBalancesForLocation: jest.fn(async () => [{ paddyGradeId: 'g4', bagCount: 120 }]) },
  });
  it('an Operations Officer is offered only their own mill and its warehouse, marked as asking', async () => {
    const o = await make().options(actor('OPERATIONS_OFFICER', [mill('M1')]));
    expect(o.toMill.asOfficer).toBe(true);
    expect(o.toMill.places).toHaveLength(1);
    expect(o.toMill.places[0].warehouse.id).toBe('W1');
    expect(o.toMill.places[0].mills.map((m: any) => m.id)).toEqual(['M1']);                // not Mill 2, which shares the warehouse
    expect(o.toMill.places[0].paddy[0]).toMatchObject({ label: 'Size 4', bags: 120 });     // sees what the warehouse has to give
  });
  it('a Warehouse Manager is offered every mill of their warehouse, not marked as asking', async () => {
    const o = await make().options(actor('WAREHOUSE_MANAGER', [wh('W1')]));
    expect(o.toMill.asOfficer).toBe(false);
    expect(o.toMill.places[0].mills.map((m: any) => m.id)).toEqual(['M1', 'M2']);
    expect(o.toWarehouse).toBeNull();
  });
  it('an Operations Officer with no mill assigned is offered nothing to ask for', async () => {
    const o = await make().options(actor('OPERATIONS_OFFICER', []));
    expect(o.toMill.places).toEqual([]);
  });
});
