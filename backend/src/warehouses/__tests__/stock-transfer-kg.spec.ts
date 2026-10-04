import { StockTransfersService } from '../stock-transfers.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

// Packaged rice comes in packs of a known size, so the kilograms are exactly the bags times the pack size: nobody needs a scale.
const GLOBAL = [{ scopeType: 'GLOBAL', scopeId: null }];
const person = { id: 'wm-1', permissionCodes: new Set<string>(), roles: [{ scopes: GLOBAL }] } as unknown as AuthenticatedUser;

function build(transfer: Record<string, unknown> = {}) {
  const made: Record<string, any> = {};
  const received: Record<string, any> = {};
  const tx = {
    stockTransfer: {
      count: jest.fn(async () => 0),
      create: jest.fn(async ({ data }: any) => { Object.assign(made, { id: 't-1', ...data }); return made; }),
      update: jest.fn(async ({ data }: any) => { Object.assign(received, data); return { id: 't-1', ...data }; }),
    },
  };
  const stored = { id: 't-1', status: 'DISPATCHED', sourceWarehouseId: 'wh-1', destWarehouseId: 'wh-2', productId: 'p1', packagingSizeId: 's25', bagCount: 40, totalKg: 1000, ...transfer };
  const prisma = {
    warehouse: { findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, isActive: true })) },
    packagingSize: { findUnique: jest.fn(async () => ({ id: 's25', sizeKg: 25 })) },
    stockReservation: { aggregate: jest.fn(async () => ({ _sum: { bagCount: 0 } })) },
    stockTransfer: { findUnique: jest.fn(async () => stored) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const ledger = { getBalance: jest.fn(async () => ({ bagCount: 500 })), recordTransaction: jest.fn(), adjustBalance: jest.fn() };
  return { service: new StockTransfersService(prisma as any, { record: jest.fn() } as any, ledger as any), prisma, made, received, ledger };
}
const send = (over: Record<string, unknown> = {}) => ({ sourceWarehouseId: 'wh-1', destWarehouseId: 'wh-2', productId: 'p1', packagingSizeId: 's25', bagCount: 40, ...over }) as any;

describe('stock transfer: kilograms optional', () => {
  it('works the kilograms out exactly: 40 bags of 25KG is 1,000 kg', async () => {
    const { service, made, ledger } = build();
    await service.create(send(), person);
    expect(made.totalKg).toBe(1000);
    expect(ledger.recordTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ quantityKg: 1000, bagCount: 40 }));
  });

  it('uses a typed figure if one is given, without even looking up the pack size', async () => {
    const { service, made, prisma } = build();
    await service.create(send({ totalKg: 1002 }), person);
    expect(made.totalKg).toBe(1002);
    expect(prisma.packagingSize.findUnique).not.toHaveBeenCalled();
  });

  it('refuses an unknown pack size when it has to work the kilograms out', async () => {
    const { service, prisma } = build();
    prisma.packagingSize.findUnique.mockResolvedValue(null as any);
    await expect(service.create(send(), person)).rejects.toThrow(/Packaging size not found/);
  });

  it('receiving needs only the bags: the kilograms follow at the same pack size, with no variance when all arrive', async () => {
    const { service, received, ledger } = build();
    await service.receive('t-1', { receivedBagCount: 40 } as any, person);
    expect(received).toMatchObject({ receivedBagCount: 40, receivedKg: 1000, varianceKg: 0 });
    expect(ledger.recordTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ quantityKg: 1000, bagCount: 40 }));
  });

  it('a short delivery shows as its share of the weight', async () => {
    const { service, received } = build();
    await service.receive('t-1', { receivedBagCount: 38 } as any, person);
    expect(received).toMatchObject({ receivedKg: 950, varianceKg: -50 });
  });
});
