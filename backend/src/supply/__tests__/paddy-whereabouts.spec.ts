import { PaddyWhereaboutsService } from '../paddy-whereabouts.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

const person = (scopes: { scopeType: string; scopeId: string | null }[]) => ({ id: 'u', permissionCodes: new Set<string>(), roles: [{ scopes }] }) as unknown as AuthenticatedUser;
const GLOBAL = person([{ scopeType: 'GLOBAL', scopeId: null }]);
const bal = (locationType: string, locationId: string, paddyGradeId: string, bagCount: number) => ({ locationType, locationId, paddyGradeId, bagCount });

function build() {
  const prisma = {
    paddyGrade: { findMany: jest.fn(async () => [{ id: 'g4', label: 'Size 4' }, { id: 'g5', label: 'Size 5' }]) },
    inventoryBalance: { findMany: jest.fn(async () => [bal('FARM', 'fa', 'g4', 50), bal('FARM', 'fa', 'g5', 10), bal('FARM', 'fb', 'g4', 5), bal('WAREHOUSE', 'w1', 'g4', 12), bal('WAREHOUSE', 'w1', 'g5', 3), bal('WAREHOUSE', 'w2', 'g4', 8), bal('MILLING_CENTER', 'm1', 'g4', 4)]) },
    shipment: { findMany: jest.fn(async () => [
      { id: 's1', farmId: 'fa', warehouseId: 'w1', paddyGradeId: 'g4', expectedBags: 17, farm: { name: 'Nkawkaw Farm' }, warehouse: { name: 'Tamale Warehouse' }, deliveryReport: { dispatchRef: 'DS-1', driver: { name: 'Yaw Boateng' }, vehicle: { plateNumber: 'GT-5521-21' } } },
      { id: 's2', farmId: 'fa', warehouseId: 'w1', paddyGradeId: 'g5', expectedBags: 3, farm: { name: 'Nkawkaw Farm' }, warehouse: { name: 'Tamale Warehouse' }, deliveryReport: { dispatchRef: 'DS-1', driver: { name: 'Yaw Boateng' }, vehicle: { plateNumber: 'GT-5521-21' } } },
      { id: 's3', farmId: 'fb', warehouseId: 'w2', paddyGradeId: 'g4', expectedBags: 9, farm: { name: 'Techiman Farm' }, warehouse: { name: 'Kumasi Warehouse' }, deliveryReport: null },
    ]) },
    farm: { findMany: jest.fn(async () => [{ id: 'fa', name: 'Nkawkaw Farm' }, { id: 'fb', name: 'Techiman Farm' }]) },
    warehouse: { findMany: jest.fn(async () => [{ id: 'w1', name: 'Tamale Warehouse', location: 'Tamale' }, { id: 'w2', name: 'Kumasi Warehouse', location: 'Kumasi' }]) },
    millingCenter: { findMany: jest.fn(async () => [{ id: 'm1', name: 'Tamale Mill' }]) },
  };
  return new PaddyWhereaboutsService(prisma as any);
}

describe('where is the paddy?', () => {
  it('shows every place the paddy is, in the order it travels: farms, the road, warehouses, mills, size by size', async () => {
    const r = await build().whereabouts(GLOBAL);
    expect(r.sizes).toEqual([{ id: 'g4', label: 'Size 4' }, { id: 'g5', label: 'Size 5' }]);
    expect(r.places.map((p) => [p.type, p.name])).toEqual([['FARM', 'Nkawkaw Farm'], ['FARM', 'Techiman Farm'], ['ROAD', 'Nkawkaw Farm to Tamale Warehouse'], ['ROAD', 'Techiman Farm to Kumasi Warehouse'], ['WAREHOUSE', 'Kumasi Warehouse'], ['WAREHOUSE', 'Tamale Warehouse'], ['MILL', 'Tamale Mill']]);
    expect(r.places[0]).toMatchObject({ bags: { g4: 50, g5: 10 }, total: 60 });
    expect(r.places.find((p) => p.name === 'Tamale Warehouse')).toMatchObject({ location: 'Tamale', bags: { g4: 12, g5: 3 } });
  });

  it('puts one truck on the road ONCE, with every size on it, and who is driving', async () => {
    const r = await build().whereabouts(GLOBAL);
    const truck = r.places.find((p) => p.type === 'ROAD' && p.id === 'DS-1')!;
    expect(truck).toMatchObject({ bags: { g4: 17, g5: 3 }, total: 20, detail: 'Driver Yaw Boateng, vehicle GT-5521-21' });
    expect(r.places.filter((p) => p.type === 'ROAD')).toHaveLength(2);
  });

  it('adds up the paddy everywhere, by size', async () => {
    const r = await build().whereabouts(GLOBAL);
    expect(r.totals).toEqual({ g4: 50 + 5 + 17 + 9 + 12 + 8 + 4, g5: 10 + 3 + 3 });
  });

  it('a farm manager sees only their own farm and what is on the road from it', async () => {
    const r = await build().whereabouts(person([{ scopeType: 'FARM', scopeId: 'fa' }]));
    expect(r.places.map((p) => p.name)).toEqual(['Nkawkaw Farm', 'Nkawkaw Farm to Tamale Warehouse']);
  });

  it('a warehouse manager sees only their warehouse and what is on the road to it', async () => {
    const r = await build().whereabouts(person([{ scopeType: 'WAREHOUSE', scopeId: 'w1' }]));
    expect(r.places.map((p) => p.name)).toEqual(['Nkawkaw Farm to Tamale Warehouse', 'Tamale Warehouse']);
  });

  it('someone with no place sees nothing', async () => {
    const r = await build().whereabouts(person([]));
    expect(r.places).toEqual([]);
    expect(r.totals).toEqual({});
  });
});
