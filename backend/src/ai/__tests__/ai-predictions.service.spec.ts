import 'reflect-metadata';
import { AiPredictionsService } from '../ai-predictions.service';
import { InventoryLedgerService } from '../../inventory-ledger/inventory-ledger.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('AiPredictionsService', () => {
  const actor = { id: 'user-1' } as AuthenticatedUser;

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

  describe('predictProduction — cold start vs rolling average', () => {
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
});
