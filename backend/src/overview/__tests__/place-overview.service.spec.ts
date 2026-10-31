import { PlaceOverviewService } from '../place-overview.service';
import { OverviewAnalyticsController } from '../overview-analytics.controller';

const scoped = (code: string, scopeType: string, ids: string[], perms = ['reports.view']) =>
  ({ id: 'u1', roles: [{ roleId: 'r', roleCode: code, permissions: perms, scopes: ids.map((id) => ({ scopeType, scopeId: id })) }], permissionCodes: new Set(perms) }) as any;
const global = (code: string) => ({ id: 'g', roles: [{ roleId: 'r', roleCode: code, permissions: ['reports.view'], scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }], permissionCodes: new Set(['reports.view']) }) as any;

const farms = [{ id: 'fa', name: 'Farm A' }, { id: 'fb', name: 'Farm B' }];
const build = () => {
  const farmFind = jest.fn(async ({ where }: any) => farms.filter((f) => !where.id || where.id.in.includes(f.id)));
  const prisma: any = {
    farm: { findMany: farmFind },
    paddyEntry: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    inventoryBalance: { findMany: jest.fn(async () => []) },
    shipment: { findMany: jest.fn(async () => []) },
    warehouse: { findMany: jest.fn(async ({ where }: any) => (where.id ? where.id.in : ['wa', 'wb']).map((id: string) => ({ id, name: id }))) },
    productionRecord: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    machine: { findMany: jest.fn(async () => []) },
    millingCenter: { findMany: jest.fn(async ({ where }: any) => (where.id ? where.id.in : ['ma', 'mb']).map((id: string) => ({ id, name: id }))) },
  };
  return { prisma, svc: new PlaceOverviewService(prisma) };
};

describe('PlaceOverviewService keeps every person to their own place', () => {
  it('gives the Farm A manager Farm A only, and never Farm B', async () => {
    const { prisma, svc } = build();
    const r = await svc.farms(scoped('FARM_MANAGER', 'FARM', ['fa']), '30');
    expect(r.places.map((p) => p.name)).toEqual(['Farm A']);
    expect(prisma.farm.findMany.mock.calls[0][0].where.id).toEqual({ in: ['fa'] });
    for (const call of prisma.paddyEntry.findMany.mock.calls) expect(call[0].where.farmId).toBe('fa');
    for (const call of prisma.inventoryBalance.findMany.mock.calls) expect(call[0].where.locationId).toBe('fa');
  });

  it('gives a manager assigned to nothing nothing at all, not everything', async () => {
    const { svc } = build();
    expect((await svc.farms(scoped('FARM_MANAGER', 'FARM', []))).places).toEqual([]);
    expect((await svc.warehouses(scoped('WAREHOUSE_MANAGER', 'WAREHOUSE', []))).places).toEqual([]);
    expect((await svc.mills(scoped('OPERATIONS_OFFICER', 'MILLING_CENTER', []))).places).toEqual([]);
  });

  it('gives the warehouse manager their warehouse only', async () => {
    const { prisma, svc } = build();
    const r = await svc.warehouses(scoped('WAREHOUSE_MANAGER', 'WAREHOUSE', ['wa']), '30');
    expect(r.places.map((p) => p.id)).toEqual(['wa']);
    expect(prisma.warehouse.findMany.mock.calls[0][0].where.id).toEqual({ in: ['wa'] });
  });

  it('gives the operations officer their mill only', async () => {
    const { prisma, svc } = build();
    const r = await svc.mills(scoped('OPERATIONS_OFFICER', 'MILLING_CENTER', ['ma']), '30');
    expect(r.places.map((p) => p.id)).toEqual(['ma']);
    expect(prisma.millingCenter.findMany.mock.calls[0][0].where.id).toEqual({ in: ['ma'] });
    for (const call of prisma.productionRecord.findMany.mock.calls) expect(call[0].where.millingCenterId).toBe('ma');
  });
});

describe('place routes are kept to the right area', () => {
  const stub: any = { farms: jest.fn(async () => 'f'), warehouses: jest.fn(async () => 'w'), mills: jest.fn(async () => 'm') };
  const c = new OverviewAnalyticsController({} as any, {} as any, stub);
  it('lets each role reach its own place view only', async () => {
    expect(await c.myFarm(scoped('FARM_MANAGER', 'FARM', ['fa']))).toBe('f');
    expect(() => c.myWarehouse(scoped('FARM_MANAGER', 'FARM', ['fa']))).toThrow();
    expect(() => c.myMill(scoped('WAREHOUSE_MANAGER', 'WAREHOUSE', ['wa']))).toThrow();
    expect(() => c.myFarm(scoped('SALES_OFFICER', 'GLOBAL', []))).toThrow();
    expect(await c.myMill(scoped('OPERATIONS_OFFICER', 'MILLING_CENTER', ['ma']))).toBe('m');
  });
  it('(global oversight can still look)', async () => { expect(await c.myFarm(global('MD'))).toBe('f'); });
});
