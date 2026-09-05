import { BadRequestException } from '@nestjs/common';
import { PackagingBatchesService } from '../packaging-batches.service';
import { AuditService } from '../../audit/audit.service';
import { InventoryLedgerService } from '../../inventory-ledger/inventory-ledger.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('PackagingBatchesService.create', () => {
  const operator = { id: 'operator-1' } as AuthenticatedUser;

  function buildService() {
    const prisma = {
      millingCenter: { findUnique: jest.fn().mockResolvedValue({ id: 'mc-1', isActive: true, warehouseId: 'wh-1' }) },
      packagingSize: { findUnique: jest.fn().mockResolvedValue({ id: 'size-25', isActive: true, sizeKg: 25 }) },
      product: { findUnique: jest.fn().mockResolvedValue({ id: 'prod-1', isActive: true }) },
      packagingBatch: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pkg-1' }),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          packagingBatch: {
            create: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 'pkg-1', ...(data as object) })),
            count: jest.fn().mockResolvedValue(0),
          },
        }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const ledger = { recordTransaction: jest.fn(), adjustBalance: jest.fn() } as unknown as InventoryLedgerService;
    const service = new PackagingBatchesService(prisma as any, audit, ledger);
    return { service, prisma, ledger };
  }

  const baseDto = {
    productId: 'prod-1',
    packagingSizeId: 'size-25',
    bagCount: 100,
    millingCenterId: 'mc-1',
    packagingDate: '2026-09-01',
  };

  it('computes total KG as size × bag count, never trusting a client-supplied total (spec section 17 example: 25KG × 100 bags = 2,500 KG)', async () => {
    const { service, ledger } = buildService();

    await service.create(baseDto, operator);

    expect(ledger.recordTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'PACKAGED_RICE_CREATED', quantityKg: 2500, bagCount: 100 }),
    );
    expect(ledger.adjustBalance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locationType: 'WAREHOUSE', locationId: 'wh-1', packagingSizeId: 'size-25' }),
      2500,
      100,
    );
  });

  it('with no packaging loss specified, consumes exactly the packaged total from bulk stock', async () => {
    const { service, ledger } = buildService();

    await service.create(baseDto, operator);

    expect(ledger.adjustBalance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locationType: 'MILLING_CENTER', locationId: 'mc-1', productId: 'prod-1', packagingSizeId: null }),
      -2500,
    );
  });

  it('rejects a sourceBulkKg smaller than the packaged total (would create mass from nothing)', async () => {
    const { service } = buildService();

    await expect(service.create({ ...baseDto, sourceBulkKg: 2000 }, operator)).rejects.toThrow(BadRequestException);
  });

  it('when sourceBulkKg exceeds the packaged total, records the difference as a packaging-loss STOCK_LOSS transaction', async () => {
    const { service, ledger } = buildService();

    // 2,550 KG of bulk consumed to produce 2,500 KG of packaged output — 50 KG loss.
    await service.create({ ...baseDto, sourceBulkKg: 2550 }, operator);

    expect(ledger.adjustBalance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locationType: 'MILLING_CENTER', locationId: 'mc-1' }),
      -2550,
    );
    const lossCalls = (ledger.recordTransaction as jest.Mock).mock.calls.filter(([, input]) => input.type === 'STOCK_LOSS');
    expect(lossCalls).toHaveLength(1);
    expect(lossCalls[0][1].quantityKg).toBe(50);
  });
});
