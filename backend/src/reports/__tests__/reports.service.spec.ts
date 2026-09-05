import { ReportsService } from '../reports.service';

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

    const result = await service.farmReport({});

    expect(result).toHaveLength(2);
    expect(result[0].approvedIntakeKg).toBe(62500);
    expect(result[1].approvedIntakeKg).toBe(30000);
  });
});
