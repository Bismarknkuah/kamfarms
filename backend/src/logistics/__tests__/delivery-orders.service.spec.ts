import { BadRequestException } from '@nestjs/common';
import { DeliveryOrdersService } from '../delivery-orders.service';

function buildService(farmBalance: { paddyGradeId: string; bagCount: number; quantityKg: number } | null) {
  const prisma = {
    farm: { findUnique: jest.fn().mockResolvedValue({ id: 'farm-1', isActive: true }) },
    warehouse: { findUnique: jest.fn().mockResolvedValue({ id: 'wh-1', isActive: true }) },
    $transaction: jest.fn(async (fn: any) =>
      fn({
        deliveryOrder: { create: jest.fn().mockResolvedValue({ id: 'order-1' }) },
      }),
    ),
  };
  const audit = { record: jest.fn() };
  const ledger = {
    generateNumber: jest.fn().mockResolvedValue('DO-2026-000001'),
    getBalancesForLocation: jest.fn().mockResolvedValue(farmBalance ? [farmBalance] : []),
  };
  const notifications = { notify: jest.fn() };
  const service = new DeliveryOrdersService(prisma as any, audit as any, ledger as any, notifications as any);
  return service;
}

function actor() {
  return { id: 'actor-1', roles: [{ roleId: 'r1', roleCode: 'FARM_MANAGER', permissions: [], scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }], permissionCodes: new Set(['delivery.create']) } as any;
}

describe('DeliveryOrdersService.create - bag-based validation, not KG', () => {
  it('rejects a request for more bags than the farm actually has, even when the KG figure would technically allow it', async () => {
    // A farm with 5 bags but a generously-estimated 500kg on file -
    // requesting 10 bags should still be rejected on bag count, the
    // real, honest constraint, not the looser KG estimate.
    const service = buildService({ paddyGradeId: 'grade-1', bagCount: 5, quantityKg: 500 });

    await expect(
      service.create({ farmId: 'farm-1', destinationWarehouseId: 'wh-1', requestedDate: '2026-09-08', paddyGradeId: 'grade-1', bagCount: 10 } as any, actor()),
    ).rejects.toThrow(BadRequestException);
  });

  it('states the shortfall in bags in the error message, not kilos', async () => {
    const service = buildService({ paddyGradeId: 'grade-1', bagCount: 5, quantityKg: 500 });

    await expect(
      service.create({ farmId: 'farm-1', destinationWarehouseId: 'wh-1', requestedDate: '2026-09-08', paddyGradeId: 'grade-1', bagCount: 10 } as any, actor()),
    ).rejects.toThrow('Farm only has 5 bag(s) available for this grade - cannot request 10 bag(s).');
  });

  it('allows a request within the actual bag count, even when no KG figure was ever recorded for the farm', async () => {
    // A real, previously-blocking scenario: a farm balance with 0 KG on
    // file (e.g. paddy logged without a scale) but a real bag count -
    // this must succeed now, since bags is the actual constraint.
    const service = buildService({ paddyGradeId: 'grade-1', bagCount: 8, quantityKg: 0 });

    await expect(
      service.create({ farmId: 'farm-1', destinationWarehouseId: 'wh-1', requestedDate: '2026-09-08', paddyGradeId: 'grade-1', bagCount: 3 } as any, actor()),
    ).resolves.toBeDefined();
  });

  it('rejects entirely when the farm has no balance at all for this grade', async () => {
    const service = buildService(null);

    await expect(
      service.create({ farmId: 'farm-1', destinationWarehouseId: 'wh-1', requestedDate: '2026-09-08', paddyGradeId: 'grade-1', bagCount: 1 } as any, actor()),
    ).rejects.toThrow('Farm only has 0 bag(s) available for this grade - cannot request 1 bag(s).');
  });
});
