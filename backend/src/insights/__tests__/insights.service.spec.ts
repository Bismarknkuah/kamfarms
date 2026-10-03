import { InsightsService, clampDays } from '../insights.service';

const NOW = new Date('2026-10-03T12:00:00Z');
const DAY = 86_400_000;
const ago = (n: number) => new Date(NOW.getTime() - n * DAY);

function build(over: Record<string, unknown[]> = {}) {
  const runs = [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `h${i}`, recordNumber: `PR-${i}`, millingCenterId: 'c1', date: ago(40 + i * 5), paddyProcessedKg: '10000.000', recoveredRiceKg: '6800.000', energyConsumptionKwh: null, status: 'APPROVED' })),
    { id: 'n1', recordNumber: 'PR-900', millingCenterId: 'c1', date: ago(3), paddyProcessedKg: '10000.000', recoveredRiceKg: '6000.000', energyConsumptionKwh: '400.000', status: 'SUBMITTED' },
  ];
  const calls: Record<string, any[]> = {};
  const delegate = (name: string, rows: unknown[]) => ({ findMany: jest.fn(async (args: any) => { (calls[name] ??= []).push(args); return rows; }) });
  const prisma = {
    millingCenter: delegate('millingCenter', [{ id: 'c1', name: 'Milling Center 1' }]),
    warehouse: delegate('warehouse', [{ id: 'w1', name: 'Warehouse 1' }]),
    farm: delegate('farm', [{ id: 'f1', name: 'Farm A' }]),
    productionRecord: delegate('productionRecord', over.runs ?? runs),
    meterReading: delegate('meterReading', over.meters ?? []),
    shipment: delegate('shipment', over.shipments ?? []),
    inventoryAdjustment: delegate('inventoryAdjustment', over.adjustments ?? []),
    salesOrder: delegate('salesOrder', over.reserved ?? []),
    paddyEntry: delegate('paddyEntry', over.intake ?? []),
    expense: { findMany: jest.fn(async (args: any) => { (calls.expense ??= []).push(args); return args.where.attachmentUrl ? over.receipted ?? [] : over.expenses ?? []; }) },
  };
  return { service: new InsightsService(prisma as any), prisma, calls };
}

describe('clampDays', () => {
  it.each([[undefined, 30], ['14', 14], ['3', 7], ['500', 90], ['abc', 30], [45.9, 45], [null, 30]])('%p -> %p', (input, expected) => {
    expect(clampDays(input)).toBe(expected);
  });
});

describe('InsightsService.watchlist', () => {
  it('turns database rows (Decimals arrive as strings) into the engine\'s plain records and returns its findings', async () => {
    const { service } = build();
    const w = await service.watchlist('30', NOW);
    expect(w.windowDays).toBe(30);
    const low = w.signals.find((s) => s.code === 'LOW_RECOVERY');
    expect(low?.evidence).toEqual(['PR-900: 60.0%']); // an unapproved run in the period is judged, but never builds the baseline
    expect(low?.expected).toContain('68.0%');
  });

  it('asks only for approved history to judge against, and keeps the period within 7 to 90 days', async () => {
    const { service, calls } = build();
    expect((await service.watchlist('1', NOW)).windowDays).toBe(7);
    expect((await service.watchlist('9999', NOW)).windowDays).toBe(90);
    expect(calls.productionRecord[0].where.status).toEqual({ in: ['SUBMITTED', 'APPROVED'] });
    expect(calls.inventoryAdjustment[0].where.status).toBe('APPROVED');
    expect(calls.expense[0].where.status).toBe('APPROVED');
  });

  it('never loads receipt photos: receipts are found by id only', async () => {
    const { calls, service } = build();
    await service.watchlist(undefined, NOW);
    const idOnly = calls.expense.find((c) => c.where.attachmentUrl);
    expect(idOnly.select).toEqual({ id: true });
    expect(calls.expense.every((c) => !('attachmentUrl' in (c.select ?? {})))).toBe(true);
  });

  it('skips rows that cannot be judged: unreceived shipments, unknown location types, meters with no machine', async () => {
    const { service } = build({
      shipments: [{ id: 's1', shipmentNumber: 'SH-1', warehouseId: 'w1', farmId: 'f1', expectedBags: 100, receivedBags: null, receivedAt: null }],
      adjustments: [{ id: 'a1', adjustmentNumber: 'A-1', locationType: 'VEHICLE', locationId: 'x', adjustmentBags: -90, approvedAt: ago(2) }],
      meters: [{ date: ago(2), consumption: '500', machine: null }],
    });
    const w = await service.watchlist(30, NOW);
    expect(w.signals.filter((s) => ['RECEIVING_SHORTFALL', 'STOCK_WRITE_DOWNS', 'POWER_WITHOUT_PRODUCTION'].includes(s.code))).toEqual([]);
  });

  it('dates a reserved order from its delivery task, falling back to when it was approved', async () => {
    const { service } = build({
      reserved: [
        { id: 'o1', orderNumber: 'SO-1', allocatedWarehouseId: 'w1', approvedAt: ago(1), tasks: [{ createdAt: ago(9) }, { createdAt: ago(8) }] },
        { id: 'o2', orderNumber: 'SO-2', allocatedWarehouseId: 'w1', approvedAt: ago(5), tasks: [] },
        { id: 'o3', orderNumber: 'SO-3', allocatedWarehouseId: 'w1', approvedAt: null, tasks: [] },
      ],
    });
    const s = (await service.watchlist(30, NOW)).signals.find((x) => x.code === 'RESERVED_NOT_DELIVERED');
    expect(s?.evidence).toEqual(['SO-1: 9 days', 'SO-2: 5 days']);
  });

  it('marks an expense as receipted from the id list', async () => {
    const mk = (i: number) => ({ id: `e${i}`, expenseNumber: `EXP-${i}`, farmId: 'f1', warehouseId: null, amount: '500.00', date: ago(2 + i) });
    const { service } = build({ expenses: [1, 2, 3, 4, 5, 6].map(mk), receipted: [{ id: 'e1' }] });
    const s = (await service.watchlist(30, NOW)).signals.find((x) => x.code === 'MISSING_RECEIPTS');
    expect(s?.detail).toContain('5 of 6');
  });
});
