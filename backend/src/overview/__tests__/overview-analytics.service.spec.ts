import { OverviewAnalyticsService } from '../overview-analytics.service';

const global = { roles: [{ scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }] } as any;
const onlyFarmA = { roles: [{ scopes: [{ scopeType: 'FARM', scopeId: 'fa' }] }] } as any;
const recent = () => new Date(Date.now() - 2 * 86_400_000);

function build(overrides: Record<string, any> = {}) {
  const prisma: any = {
    farm: { findMany: jest.fn(async ({ where }: any) => [{ id: 'fa', name: 'Farm A' }, { id: 'fb', name: 'Farm B' }].filter((f) => !where.id || where.id.in.includes(f.id))) },
    paddyEntry: {
      findMany: jest.fn(async () => [
        { farmId: 'fa', entryDate: recent(), weightKg: '1000', moisturePercent: '13', paddyGrade: { label: 'Size 3' } },
        { farmId: 'fa', entryDate: recent(), weightKg: '500', moisturePercent: '15', paddyGrade: { label: 'Size 4' } },
        { farmId: 'fb', entryDate: recent(), weightKg: '2000', moisturePercent: null, paddyGrade: { label: 'Size 3' } },
      ]),
      groupBy: jest.fn(async ({ where }: any) => (where.status === 'SUBMITTED' ? [{ farmId: 'fa', _count: { _all: 2 } }] : [{ farmId: 'fb', _count: { _all: 1 } }])),
    },
    inventoryBalance: { findMany: jest.fn(async () => [{ locationId: 'fa', quantityKg: '800' }, { locationId: 'fb', quantityKg: '300' }]) },
    shipment: {
      findMany: jest.fn(async () => [
        { farmId: 'fa', expectedKg: '2000', receivedAt: null, deliveryReport: { totalDeliveryCost: '400' } },
        { farmId: 'fa', expectedKg: '1000', receivedAt: new Date(), deliveryReport: { totalDeliveryCost: '100' } },
      ]),
    },
    millingCenter: { findMany: jest.fn(async () => [{ id: 'm1', name: 'Mill 1' }]) },
    productionRecord: {
      findMany: jest.fn(async () => [
        { millingCenterId: 'm1', date: recent(), paddyProcessedKg: '10000', recoveredRiceKg: '7000', brokenRiceKg: '1500', riceHullKg: '1200', wasteLossKg: '300', energyConsumptionKwh: '500', machineRuntimeMin: 120, massBalanceFlag: false },
        { millingCenterId: 'm1', date: recent(), paddyProcessedKg: '5000', recoveredRiceKg: '2600', brokenRiceKg: '800', riceHullKg: '1000', wasteLossKg: '600', energyConsumptionKwh: null, machineRuntimeMin: 60, massBalanceFlag: true },
      ]),
      count: jest.fn(async () => 4),
    },
    machine: { groupBy: jest.fn(async () => [{ status: 'RUNNING', _count: { _all: 2 } }, { status: 'FAULT', _count: { _all: 1 } }]) },
    warehouse: { findMany: jest.fn(async () => [{ id: 'w1', name: 'Warehouse 1' }]) },
    ...overrides,
  };
  return { service: new OverviewAnalyticsService(prisma), prisma };
}

describe('OverviewAnalyticsService', () => {
  it('adds up each farm: intake, stock, pending, rejected, dispatched, in transit, cost and moisture', async () => {
    const { service } = build();
    const r = await service.farms(global, '30');
    const a = r.farms.find((f) => f.name === 'Farm A')!;
    expect(a).toMatchObject({ intakeKg: 1500, stockKg: 800, pendingEntries: 2, dispatchedKg: 3000, inTransitKg: 2000, deliveryCost: 500, avgMoisture: 14 });
    expect(a.costPerTonne).toBeCloseTo(166.67, 1);
    const b = r.farms.find((f) => f.name === 'Farm B')!;
    expect(b).toMatchObject({ intakeKg: 2000, rejectedEntries: 1, avgMoisture: null, costPerTonne: null });
    expect(r.totals.intakeKg).toBe(3500);
    expect(r.bySize.find((s) => s.label === 'Size 3')!.kg).toBe(3000);
  });

  it('puts every intake into a chart bucket so the trend adds up to the total', async () => {
    const { service } = build();
    const r = await service.farms(global, '30');
    expect(r.trend.reduce((a, t) => a + t.total, 0)).toBe(r.totals.intakeKg);
  });

  it('only asks the database about the farms the person is scoped to', async () => {
    const { service, prisma } = build();
    const r = await service.farms(onlyFarmA, '30');
    expect(r.farms.map((f) => f.name)).toEqual(['Farm A']);
    expect(prisma.farm.findMany.mock.calls[0][0].where.id).toEqual({ in: ['fa'] });
  });

  it('returns an empty view, not an error, for someone scoped to no farm', async () => {
    const { service } = build();
    const r = await service.farms({ roles: [{ scopes: [] }] } as any, '30');
    expect(r.farms).toEqual([]);
    expect(r.totals.intakeKg).toBe(0);
  });

  it('works out recovery and energy per tonne from the runs that recorded energy only', async () => {
    const { service } = build();
    const r = await service.operations(global, '30');
    const m = r.mills[0];
    expect(m.processedKg).toBe(15000);
    expect(m.recoveryPct).toBe(64);
    expect(m.kwhPerTonne).toBe(50);
    expect(m.flagged).toBe(1);
    expect(m.runtimeHours).toBe(3);
    expect(r.totals.awaitingApproval).toBe(4);
    expect(r.machines).toMatchObject({ RUNNING: 2, FAULT: 1, IDLE: 0 });
  });

  it('shows a quiet bucket as no data (null), never as 0 percent', async () => {
    const { service } = build();
    const r = await service.operations(global, '30');
    expect(r.trend.some((t) => t.recoveryPct === null)).toBe(true);
    expect(r.trend.filter((t) => t.recoveryPct !== null).length).toBeGreaterThan(0);
  });

  it('splits warehouse stock into paddy and packaged rice, and counts trucks still on the way', async () => {
    const { service } = build({
      inventoryBalance: { findMany: jest.fn(async () => [{ locationId: 'w1', quantityKg: '5000', paddyGradeId: 'g', productId: null }, { locationId: 'w1', quantityKg: '1200', paddyGradeId: null, productId: 'p' }]) },
      shipment: {
        findMany: jest.fn(async ({ where }: any) => (where.receivedAt === null
          ? [{ warehouseId: 'w1', expectedKg: '3000' }, { warehouseId: 'w1', expectedKg: '1000' }]
          : [{ warehouseId: 'w1', receivedAt: new Date(), receivedKg: '2900', varianceKg: '-100', varianceRequiresApproval: true }])),
      },
    });
    const r = await service.warehouses(global, '30');
    expect(r.warehouses[0]).toMatchObject({ paddyKg: 5000, packagedKg: 1200, incomingKg: 4000, incomingTrucks: 2, receivedKg: 2900, varianceKg: -100, awaitingReview: 1 });
    expect(r.warehouses[0].variancePct).toBe(3.4);
  });

  it('the executive view carries all three', async () => {
    const { service } = build();
    const r = await service.executive(global, '7');
    expect(r.farm.days).toBe(7);
    expect(r.farm.unit).toBe('day');
    expect(r.operations.mills.length).toBe(1);
    expect(r.warehouse).toBeDefined();
  });
});
