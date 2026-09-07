import { ReportsService } from '../reports.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('ReportsService', () => {
  function buildService(overrides: Record<string, unknown> = {}) {
    const prisma = {
      inventoryBalance: { findMany: jest.fn().mockResolvedValue([]) },
      salesOrder: { aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: 0 } }), findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: 0 } }) },
      expense: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      expenseCategory: { findMany: jest.fn().mockResolvedValue([]) },
      farm: { findMany: jest.fn().mockResolvedValue([]) },
      paddyEntry: { aggregate: jest.fn().mockResolvedValue({ _sum: { weightKg: 0 }, _count: 0 }), count: jest.fn().mockResolvedValue(0) },
      deliveryReport: { aggregate: jest.fn().mockResolvedValue({ _sum: { totalDeliveryCost: 0, labourCost: 0, transportationFee: 0 } }) },
      warehouse: { findMany: jest.fn().mockResolvedValue([]) },
      shipment: { count: jest.fn().mockResolvedValue(0) },
      payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
      ...overrides,
    };
    return { service: new ReportsService(prisma as any), prisma };
  }

  it('sums farm balances into totalPaddyAvailableKg, ignoring warehouse/milling balances', async () => {
    const { service } = buildService({
      inventoryBalance: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ quantityKg: 62500 }, { quantityKg: 42500 }]) // FARM
          .mockResolvedValueOnce([]) // EXTERNAL (in transit)
          .mockResolvedValueOnce([]) // WAREHOUSE
          .mockResolvedValueOnce([]), // MILLING_CENTER
      },
    });

    const result = await service.executiveSummary();

    // Matches spec section 9's own worked example total exactly.
    expect(result.totalPaddyAvailableKg).toBe(105000);
  });

  it('computes outstanding receivables only from VERIFIED payment allocations', async () => {
    const { service } = buildService({
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            totalAmount: 10000,
            allocations: [
              { amountApplied: 3000, payment: { status: 'VERIFIED' } },
              { amountApplied: 2000, payment: { status: 'PENDING_VERIFICATION' } }, // must not count
            ],
          },
        ]),
        aggregate: jest.fn(),
      },
    });

    const result = await service.executiveSummary();

    expect(result.outstandingReceivables).toBe(7000); // 10000 - 3000, the pending 2000 ignored
  });

  it('computes estimated profit as invoiced revenue minus approved expenses', async () => {
    const { service } = buildService({
      invoice: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: 500000 } }) },
      expense: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 120000 } }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    });

    const result = await service.financeReport({});

    expect(result.totalInvoiced).toBe(500000);
    expect(result.totalExpenses).toBe(120000);
    expect(result.estimatedProfit).toBe(380000);
  });

  it('aggregates farm intake per farm, keeping each farm isolated', async () => {
    const { service, prisma } = buildService({
      farm: { findMany: jest.fn().mockResolvedValue([{ id: 'farm-a', code: 'FARM_A', name: 'Farm A' }, { id: 'farm-b', code: 'FARM_B', name: 'Farm B' }]) },
      paddyEntry: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { weightKg: 62500 }, _count: 12 }) // Farm A approved
          .mockResolvedValueOnce({ _sum: { weightKg: 30000 }, _count: 5 }), // Farm B approved
        count: jest.fn().mockResolvedValue(1),
      },
    });

    const globalActor = { id: 'md-1', roles: [{ scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }] } as unknown as AuthenticatedUser;
    const result = await service.farmReport({}, globalActor);

    expect(result).toHaveLength(2);
    expect(result[0].approvedIntakeKg).toBe(62500);
    expect(result[1].approvedIntakeKg).toBe(30000);
  });
});

describe('ReportsService.warehouseOverview', () => {
  const warehouseManager = { id: 'wm-1', roles: [{ scopes: [{ scopeType: 'WAREHOUSE', scopeId: 'wh-a' }] }] } as unknown as AuthenticatedUser;
  const warehouseSupervisor = { id: 'ws-1', roles: [{ scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }] } as unknown as AuthenticatedUser;

  function buildWarehouseService(overrides: Record<string, unknown> = {}) {
    const prisma = {
      warehouse: { findMany: jest.fn().mockResolvedValue([{ id: 'wh-a' }, { id: 'wh-b' }]) },
      inventoryTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      inventoryBalance: { findMany: jest.fn().mockResolvedValue([]) },
      shipment: { findMany: jest.fn().mockResolvedValue([]) },
      millingCenter: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };
    return { service: new ReportsService(prisma as any), prisma };
  }

  it('scopes a Warehouse Manager to just their own warehouse, not every warehouse', async () => {
    const { service, prisma } = buildWarehouseService();
    await service.warehouseOverview(warehouseManager);
    expect(prisma.inventoryTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ destLocationId: { in: ['wh-a'] } }) }),
    );
  });

  it('aggregates across every active warehouse for a GLOBAL-scoped Warehouse Supervisor with no warehouseId given', async () => {
    const { service, prisma } = buildWarehouseService();
    await service.warehouseOverview(warehouseSupervisor);
    expect(prisma.warehouse.findMany).toHaveBeenCalled();
    expect(prisma.inventoryTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ destLocationId: { in: ['wh-a', 'wh-b'] } }) }),
    );
  });

  it('drills into just one warehouse when a Warehouse Supervisor supplies a warehouseId, even though they are GLOBAL', async () => {
    const { service, prisma } = buildWarehouseService();
    await service.warehouseOverview(warehouseSupervisor, 'wh-b');
    expect(prisma.inventoryTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ destLocationId: { in: ['wh-b'] } }) }),
    );
  });

  it('refuses a Warehouse Manager access to a warehouseId outside their own scope', async () => {
    const { service } = buildWarehouseService();
    await expect(service.warehouseOverview(warehouseManager, 'wh-other')).rejects.toThrow();
  });

  it('aggregates paddy received by grade into real bag and KG totals', async () => {
    const { service } = buildWarehouseService({
      inventoryTransaction: {
        findMany: jest.fn().mockResolvedValue([
          { paddyGrade: { label: 'Size 4' }, bagCount: 10, quantityKg: 500 },
          { paddyGrade: { label: 'Size 4' }, bagCount: 5, quantityKg: 250 },
          { paddyGrade: { label: 'Size 5' }, bagCount: 8, quantityKg: 400 },
        ]),
      },
    });
    const result = await service.warehouseOverview(warehouseManager);
    const size4 = result.paddy.received.find((r) => r.gradeLabel === 'Size 4');
    const size5 = result.paddy.received.find((r) => r.gradeLabel === 'Size 5');
    expect(size4).toEqual({ gradeLabel: 'Size 4', bags: 15, kg: 750 });
    expect(size5).toEqual({ gradeLabel: 'Size 5', bags: 8, kg: 400 });
  });

  it('resolves in-transit paddy through unreceived shipments, not a direct warehouseId filter on the balance itself', async () => {
    const shipmentFindMany = jest.fn().mockResolvedValue([{ id: 'sh-1' }, { id: 'sh-2' }]);
    const { service, prisma } = buildWarehouseService({ shipment: { findMany: shipmentFindMany } });
    await service.warehouseOverview(warehouseManager);
    expect(shipmentFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ warehouseId: { in: ['wh-a'] }, receivedAt: null }) }));
    expect(prisma.inventoryBalance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ locationType: 'EXTERNAL', locationId: { in: ['sh-1', 'sh-2'] } }) }),
    );
  });

  it('resolves milling oversight through this warehouse’s own milling centers, not a direct warehouseId filter', async () => {
    const millingCenterFindMany = jest.fn().mockResolvedValue([{ id: 'mc-1' }]);
    const { service, prisma } = buildWarehouseService({ millingCenter: { findMany: millingCenterFindMany } });
    await service.warehouseOverview(warehouseManager);
    expect(millingCenterFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { warehouseId: { in: ['wh-a'] } } }));
    expect(prisma.inventoryBalance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ locationType: 'MILLING_CENTER', locationId: { in: ['mc-1'] } }) }),
    );
  });

  it('aggregates packaged rice by real pack size in KG, separately from raw paddy bag counts', async () => {
    const { service } = buildWarehouseService({
      inventoryBalance: {
        findMany: jest.fn().mockResolvedValue([
          { packagingSize: { label: '25KG' }, quantityKg: 250, bagCount: 10 },
          { packagingSize: { label: '25KG' }, quantityKg: 125, bagCount: 5 },
          { packagingSize: { label: '5KG' }, quantityKg: 50, bagCount: 10 },
        ]),
      },
    });
    const result = await service.warehouseOverview(warehouseManager);
    const kg25 = result.packagedRice.find((r) => r.label === '25KG');
    const kg5 = result.packagedRice.find((r) => r.label === '5KG');
    expect(kg25).toEqual({ label: '25KG', kg: 375, bags: 15 });
    expect(kg5).toEqual({ label: '5KG', kg: 50, bags: 10 });
  });
});
