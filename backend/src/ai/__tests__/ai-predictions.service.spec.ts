import 'reflect-metadata';
import { AiPredictionsService } from '../ai-predictions.service';
import { InventoryLedgerService } from '../../inventory-ledger/inventory-ledger.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('AiPredictionsService', () => {
  // The MD: company-wide, so the production history is not narrowed by place.
  const actor = { id: 'user-1', roles: [{ roleId: 'r', roleCode: 'MD', permissions: [], scopes: [] }], permissionCodes: new Set<string>() } as unknown as AuthenticatedUser;

  function buildService(productionRecords: { recoveryPercent: number; brokenPercent: number; hullPercent: number }[]) {
    const prisma = {
      productionRecord: {
        findMany: jest.fn().mockResolvedValue(productionRecords),
        aggregate: jest.fn(),
      },
      aiModel: { upsert: jest.fn().mockResolvedValue({ id: 'model-1' }) },
      aiPrediction: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'pred-1', ...data })) },
      inventoryBalance: { findUnique: jest.fn() },
      salesOrderItem: { findMany: jest.fn() },
      meterReading: { findMany: jest.fn() },
    };
    return { service: new AiPredictionsService(prisma as any), prisma };
  }

  describe('predictProduction - cold start vs rolling average', () => {
    it('falls back to the documented benchmark when fewer than 5 historical records exist', async () => {
      const { service } = buildService([
        { recoveryPercent: 70, brokenPercent: 10, hullPercent: 18 },
        { recoveryPercent: 71, brokenPercent: 11, hullPercent: 17 },
      ]);

      const result = await service.predictProduction({ paddyKg: 20000, paddyGradeId: 'grade-4' }, actor);

      // Benchmark recovery is 68% -> 20000 * 0.68 = 13600
      expect(result.predictedRecoveredKg).toBe(13600);
      expect(result.confidencePercent).toBe(25); // deliberately low for cold start
      expect(result.assumptions).toContain('industry-typical benchmark');
      expect(result.sampleSize).toBe(2);
    });

    it('uses the rolling average of actual history once 5+ records exist, not the benchmark', async () => {
      const { service } = buildService([
        { recoveryPercent: 70, brokenPercent: 15, hullPercent: 12 },
        { recoveryPercent: 72, brokenPercent: 14, hullPercent: 11 },
        { recoveryPercent: 71, brokenPercent: 15, hullPercent: 12 },
        { recoveryPercent: 73, brokenPercent: 13, hullPercent: 11 },
        { recoveryPercent: 69, brokenPercent: 16, hullPercent: 13 },
      ]);

      const result = await service.predictProduction({ paddyKg: 20000, paddyGradeId: 'grade-4' }, actor);

      // Mean recovery = (70+72+71+73+69)/5 = 71 -> 20000 * 0.71 = 14200, NOT the 68% benchmark.
      expect(result.predictedRecoveredKg).toBe(14200);
      expect(result.assumptions).toContain('rolling average');
      expect(result.confidencePercent).toBeGreaterThan(25);
      expect(result.sampleSize).toBe(5);
    });
  });

  describe('forecastStockDepletion', () => {
    it('reports no forecast (0 confidence) rather than a fabricated number when there is no recent sales history', async () => {
      const { service, prisma } = buildService([]);
      prisma.inventoryBalance.findUnique.mockResolvedValue({ bagCount: 500 });
      prisma.salesOrderItem.findMany.mockResolvedValue([]);

      const result = await service.forecastStockDepletion({ warehouseId: 'wh-1', productId: 'prod-1' }, actor);

      expect(result.daysUntilStockout).toBeNull();
      expect(result.confidencePercent).toBe(0);
      expect(result.assumptions).toContain('No fulfilled sales');
    });

    it('computes days-until-stockout from real sales velocity against the current balance', async () => {
      const { service, prisma } = buildService([]);
      prisma.inventoryBalance.findUnique.mockResolvedValue({ bagCount: 300 });
      // 150 bags sold over the 30-day window -> 5 bags/day -> 300/5 = 60 days.
      prisma.salesOrderItem.findMany.mockResolvedValue([{ bagCount: 100 }, { bagCount: 50 }]);

      const result = await service.forecastStockDepletion({ warehouseId: 'wh-1', productId: 'prod-1' }, actor);

      expect(result.dailyVelocity).toBeCloseTo(5, 5);
      expect(result.daysUntilStockout).toBeCloseTo(60, 5);
    });
  });

  it('is structurally unable to modify inventory: InventoryLedgerService is never injected into its constructor', () => {
    const paramTypes: unknown[] = Reflect.getMetadata('design:paramtypes', AiPredictionsService) ?? [];
    expect(paramTypes).not.toContain(InventoryLedgerService);
  });

  describe('jurisdiction: a person only gets predictions from their own places', () => {
    const scoped = (ids: string[], perms: string[] = []) =>
      ({ id: 'u2', roles: [{ roleId: 'r', roleCode: 'OPERATIONS_MANAGER', permissions: [], scopes: ids.map((scopeId) => ({ scopeType: 'WAREHOUSE', scopeId })) }], permissionCodes: new Set(perms) }) as unknown as AuthenticatedUser;
    const history = Array.from({ length: 6 }, () => ({ recoveryPercent: 70, brokenPercent: 10, hullPercent: 18 }));

    it('narrows the production history to the milling centers at their own warehouses', async () => {
      const { service, prisma } = buildService(history);
      await service.predictProduction({ paddyKg: 1000, paddyGradeId: 'grade-4' }, scoped(['wh-1']));
      expect(prisma.productionRecord.findMany.mock.calls[0][0].where.millingCenter).toEqual({ warehouseId: { in: ['wh-1'] } });
    });

    it('does not narrow it for the MD', async () => {
      const { service, prisma } = buildService(history);
      await service.predictProduction({ paddyKg: 1000, paddyGradeId: 'grade-4' }, actor);
      expect(prisma.productionRecord.findMany.mock.calls[0][0].where.millingCenter).toBeUndefined();
    });

    it('reads no history, and uses the labelled benchmark, for a person with no warehouse', async () => {
      const { service, prisma } = buildService(history);
      const r = await service.predictProduction({ paddyKg: 20000, paddyGradeId: 'grade-4' }, scoped([]));
      expect(prisma.productionRecord.findMany).not.toHaveBeenCalled();
      expect(r.predictedRecoveredKg).toBe(13600);
      expect(r.sampleSize).toBe(0);
    });

    it('refuses a milling center at someone else\'s warehouse', async () => {
      const { service, prisma } = buildService(history);
      (prisma as any).millingCenter = { findUnique: jest.fn().mockResolvedValue({ warehouseId: 'wh-OTHER' }) };
      await expect(service.predictProduction({ paddyKg: 1000, paddyGradeId: 'g', millingCenterId: 'c-other' }, scoped(['wh-1']))).rejects.toThrow(/outside your jurisdiction/);
      expect(prisma.productionRecord.findMany).not.toHaveBeenCalled();
    });

    it('refuses a machine at someone else\'s warehouse, and a stock forecast for someone else\'s warehouse', async () => {
      const { service, prisma } = buildService(history);
      (prisma as any).machine = { findUnique: jest.fn().mockResolvedValue({ millingCenter: { warehouseId: 'wh-OTHER' } }) };
      await expect(service.predictEnergyConsumption({ paddyKg: 1000, machineId: 'm-other' }, scoped(['wh-1']))).rejects.toThrow(/This machine is outside your jurisdiction/);
      await expect(service.forecastStockDepletion({ warehouseId: 'wh-OTHER', productId: 'p' }, scoped(['wh-1']))).rejects.toThrow(/This warehouse is outside your jurisdiction/);
    });

    it('lets the MD forecast any warehouse', async () => {
      const { service, prisma } = buildService([]);
      prisma.inventoryBalance.findUnique.mockResolvedValue({ bagCount: 10 });
      prisma.salesOrderItem.findMany.mockResolvedValue([]);
      await expect(service.forecastStockDepletion({ warehouseId: 'wh-ANY', productId: 'p' }, actor)).resolves.toBeDefined();
    });
  });

  describe('recentAnomalies', () => {
    const scoped = (ids: string[], perms: string[]) =>
      ({ id: 'u2', roles: [{ roleId: 'r', roleCode: 'OPERATIONS_MANAGER', permissions: [], scopes: ids.map((scopeId) => ({ scopeType: 'WAREHOUSE', scopeId })) }], permissionCodes: new Set(perms) }) as unknown as AuthenticatedUser;
    const mdWith = (perms: string[]) => ({ ...actor, permissionCodes: new Set(perms) }) as AuthenticatedUser;

    it('shows a scoped person only the anomalies at their own milling centers and machines', async () => {
      const { service, prisma } = buildService([]);
      prisma.meterReading.findMany.mockResolvedValue([]);
      prisma.productionRecord.findMany.mockResolvedValue([]);
      await service.recentAnomalies(scoped(['wh-1'], ['milling.view']));
      expect(prisma.meterReading.findMany.mock.calls[0][0].where.machine).toEqual({ millingCenter: { warehouseId: { in: ['wh-1'] } } });
      expect(prisma.productionRecord.findMany.mock.calls[0][0].where.millingCenter).toEqual({ warehouseId: { in: ['wh-1'] } });
    });

    it('shows the MD everything', async () => {
      const { service, prisma } = buildService([]);
      prisma.meterReading.findMany.mockResolvedValue([]);
      prisma.productionRecord.findMany.mockResolvedValue([]);
      await service.recentAnomalies(mdWith(['milling.view']));
      expect(prisma.meterReading.findMany.mock.calls[0][0].where.machine).toBeUndefined();
      expect(prisma.productionRecord.findMany.mock.calls[0][0].where.millingCenter).toBeUndefined();
    });

    it('shows nothing, without querying, to a role that cannot see production or machines, or to someone with no warehouse', async () => {
      const { service, prisma } = buildService([]);
      expect(await service.recentAnomalies(mdWith(['ai.view']))).toEqual({ meterAnomalies: [], productionAnomalies: [] });
      expect(await service.recentAnomalies(scoped([], ['milling.view']))).toEqual({ meterAnomalies: [], productionAnomalies: [] });
      expect(prisma.meterReading.findMany).not.toHaveBeenCalled();
    });
  });
});
