import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ProductionRecordsService } from '../production-records.service';
import { AuditService } from '../../audit/audit.service';
import { InventoryLedgerService } from '../../inventory-ledger/inventory-ledger.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('ProductionRecordsService', () => {
  const operationsManager = { id: 'om-1' } as AuthenticatedUser;
  const operator = { id: 'operator-1' } as AuthenticatedUser;

  function buildService(createResolvedValue: Record<string, unknown> = { id: 'pr-1' }) {
    const prisma = {
      millingCenter: { findUnique: jest.fn().mockResolvedValue({ id: 'mc-1', isActive: true }) },
      productionRecord: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pr-1', status: 'SUBMITTED' }),
        count: jest.fn().mockResolvedValue(0),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'ops-mgr-1' }, { id: 'md-1' }]) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          productionRecord: {
            create: jest.fn().mockResolvedValue(createResolvedValue),
            count: jest.fn().mockResolvedValue(0),
            update: jest.fn().mockResolvedValue({ id: 'pr-1', status: 'APPROVED' }),
          },
          product: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'prod-1' }) },
        }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const ledger = { recordTransaction: jest.fn(), adjustBalance: jest.fn() } as unknown as InventoryLedgerService;
    const notifications = { notify: jest.fn() } as unknown as NotificationsService;
    const service = new ProductionRecordsService(prisma as any, audit, ledger, notifications);
    return { service, prisma, ledger, audit, notifications };
  }

  const validDto = {
    millingCenterId: 'mc-1',
    date: '2026-09-01',
    paddyGradeId: 'grade-4',
    paddyProcessedKg: 20000,
    recoveredRiceKg: 14000,
    brokenRiceKg: 3000,
    riceHullKg: 2500,
    wasteLossKg: 500,
  };

  it('accepts a normal, physically plausible mass balance (matches spec section 51 example exactly)', async () => {
    const { service, prisma } = buildService();
    await service.create(validDto, operator);
    // 14000 + 3000 + 2500 + 500 = 20000 = paddyProcessedKg exactly.
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rejects impossible mass balance - outputs summing to more than the paddy processed', async () => {
    const { service } = buildService();
    const impossible = { ...validDto, recoveredRiceKg: 19000, brokenRiceKg: 5000 }; // 19000+5000+2500+500 = 27000 > 20000

    await expect(service.create(impossible, operator)).rejects.toThrow(BadRequestException);
  });

  it('flags (but does not block) a large unaccounted variance beyond the abnormal threshold', async () => {
    const { service, prisma } = buildService();
    // Only 12,000 KG of outputs accounted for out of 20,000 KG processed - 40% unaccounted, well past the 5% flag threshold, but still physically possible (<=100% of input).
    const highLossDto = { ...validDto, recoveredRiceKg: 10000, brokenRiceKg: 1000, riceHullKg: 1000, wasteLossKg: 0 };

    await service.create(highLossDto, operator);

    const createCall = (prisma.$transaction as jest.Mock).mock.calls[0][0];
    // Re-invoke the transaction callback against a spy tx to inspect the create() call args.
    const txSpy = { productionRecord: { create: jest.fn().mockResolvedValue({ id: 'pr-1' }), count: jest.fn().mockResolvedValue(0) } };
    await createCall(txSpy);
    expect(txSpy.productionRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ massBalanceFlag: true }) }),
    );
  });

  it('rejects a Farm-Manager-equivalent self-approval attempt on production records', async () => {
    const { service, prisma } = buildService();
    prisma.productionRecord.findUnique.mockResolvedValue({
      id: 'pr-1',
      status: 'SUBMITTED',
      submittedById: 'operator-1',
      millingCenter: { warehouseId: 'wh-1' },
      paddyGradeId: 'grade-4',
      paddyProcessedKg: 20000,
      recoveredRiceKg: 14000,
      brokenRiceKg: 3000,
      riceHullKg: 2500,
      wasteLossKg: 500,
    });

    await expect(service.approve('pr-1', operator)).rejects.toThrow(ForbiddenException);
  });

  it('on approval, moves paddy from warehouse through milling center and credits recovered rice/broken rice/hull', async () => {
    const { service, prisma, ledger } = buildService();
    prisma.productionRecord.findUnique.mockResolvedValue({
      id: 'pr-1',
      recordNumber: 'PR-2026-000001',
      status: 'SUBMITTED',
      submittedById: 'operator-1',
      millingCenterId: 'mc-1',
      millingCenter: { warehouseId: 'wh-1' },
      paddyGradeId: 'grade-4',
      paddyProcessedKg: 20000,
      recoveredRiceKg: 14000,
      brokenRiceKg: 3000,
      riceHullKg: 2500,
      wasteLossKg: 500,
    });

    await service.approve('pr-1', operationsManager);

    expect(ledger.adjustBalance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locationType: 'WAREHOUSE', locationId: 'wh-1' }),
      -20000,
    );
    expect(ledger.recordTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'RICE_RECOVERED', quantityKg: 14000 }));
    expect(ledger.recordTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'BROKEN_RICE_GENERATED', quantityKg: 3000 }));
    expect(ledger.recordTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'RICE_HULL_GENERATED', quantityKg: 2500 }));
    expect(ledger.recordTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'STOCK_LOSS', quantityKg: 500 }));
  });

  it('alerts Operations Manager and top executives when a created record is mass-balance flagged', async () => {
    const { service, prisma, notifications } = buildService({
      id: 'pr-1',
      recordNumber: 'PR-2026-000042',
      massBalanceFlag: true,
      recoveryPercent: 92.5,
    });
    const flagged = { ...validDto, recoveredRiceKg: 10000, brokenRiceKg: 1000, riceHullKg: 1000, wasteLossKg: 0 };

    await service.create(flagged, operator);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ roles: { some: { role: { code: { in: ['OPERATIONS_MANAGER', 'MD', 'CEO'] } } } } }),
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['ops-mgr-1', 'md-1'], title: expect.stringContaining('PR-2026-000042') }),
    );
  });

  it('does not alert anyone for a normal, unflagged record', async () => {
    const { service, notifications } = buildService({ id: 'pr-1', recordNumber: 'PR-2026-000001', massBalanceFlag: false, recoveryPercent: 70 });

    await service.create(validDto, operator);

    expect(notifications.notify).not.toHaveBeenCalled();
  });
});

describe('ProductionRecordsService.predictYield', () => {
  function buildPredictService(records: Record<string, unknown>[]) {
    const prisma = {
      productionRecord: { findMany: jest.fn().mockResolvedValue(records) },
    };
    const audit = {} as AuditService;
    const ledger = {} as InventoryLedgerService;
    const notifications = {} as NotificationsService;
    const service = new ProductionRecordsService(prisma as any, audit, ledger, notifications);
    return { service, prisma };
  }

  it('returns hasHistory false with no fabricated numbers when this grade has no approved history yet', async () => {
    const { service } = buildPredictService([]);
    const result = await service.predictYield('grade-4', 40);
    expect(result).toEqual({ hasHistory: false, sampleSize: 0 });
  });

  it('projects expected recovered, broken, and hull KG from the real historical average, at the standard 50 KG/bag', async () => {
    const { service } = buildPredictService([
      { paddyProcessedKg: 1000, recoveryPercent: 65, brokenPercent: 5, hullPercent: 20, wastePercent: 10, energyConsumptionKwh: null },
      { paddyProcessedKg: 1000, recoveryPercent: 63, brokenPercent: 7, hullPercent: 20, wastePercent: 10, energyConsumptionKwh: null },
    ]);
    const result = await service.predictYield('grade-4', 40);
    expect(result.hasHistory).toBe(true);
    expect(result.inputKg).toBe(2000);
    expect(result.basedOnRecoveryPercent).toBe(64);
    expect(result.expectedRecoveredKg).toBeCloseTo(1280, 5);
    expect(result.expectedBrokenKg).toBeCloseTo(120, 5);
    expect(result.expectedHullKg).toBeCloseTo(400, 5);
  });

  it('predicts energy consumption only from records that actually logged a meter reading, not averaging in missing ones as zero', async () => {
    const { service } = buildPredictService([
      { paddyProcessedKg: 1000, recoveryPercent: 65, brokenPercent: 5, hullPercent: 20, wastePercent: 10, energyConsumptionKwh: 100 },
      { paddyProcessedKg: 1000, recoveryPercent: 65, brokenPercent: 5, hullPercent: 20, wastePercent: 10, energyConsumptionKwh: null },
    ]);
    const result = await service.predictYield('grade-4', 20);
    // Only the first record (0.1 kWh/KG) should count - if the null
    // record were averaged in as 0, this would come out much lower.
    expect(result.expectedEnergyKwh).toBeCloseTo(100, 5);
  });

  it('returns null energy prediction, not zero, when no historical record ever logged a meter reading', async () => {
    const { service } = buildPredictService([
      { paddyProcessedKg: 1000, recoveryPercent: 65, brokenPercent: 5, hullPercent: 20, wastePercent: 10, energyConsumptionKwh: null },
    ]);
    const result = await service.predictYield('grade-4', 20);
    expect(result.expectedEnergyKwh).toBeNull();
  });
});
