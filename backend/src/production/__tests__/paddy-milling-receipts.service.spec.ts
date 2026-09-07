import { BadRequestException } from '@nestjs/common';
import { PaddyMillingReceiptsService } from '../paddy-milling-receipts.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('PaddyMillingReceiptsService.create', () => {
  const operator = { id: 'operator-1' } as AuthenticatedUser;

  function buildService(millingCenter: Record<string, unknown> | null = { id: 'mc-1', isActive: true }) {
    const created = { id: 'pmr-1', receiptNumber: 'PMR-2026-000001' };
    const prisma = {
      millingCenter: { findUnique: jest.fn().mockResolvedValue(millingCenter) },
      paddyMillingReceipt: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          paddyMillingReceipt: {
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockResolvedValue(created),
          },
        }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const service = new PaddyMillingReceiptsService(prisma as any, audit);
    return { service, prisma };
  }

  it('refuses to record a receipt against a milling center that does not exist', async () => {
    const { service } = buildService(null);
    await expect(
      service.create({ millingCenterId: 'mc-1', date: '2026-01-01', lines: [{ paddyGradeId: 'g4', bagCount: 10 }] }, operator),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to record a receipt against an inactive milling center', async () => {
    const { service } = buildService({ id: 'mc-1', isActive: false });
    await expect(
      service.create({ millingCenterId: 'mc-1', date: '2026-01-01', lines: [{ paddyGradeId: 'g4', bagCount: 10 }] }, operator),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts multiple grades in one submission - Size 4 and Size 5 confirmed together', async () => {
    const { service } = buildService();
    await expect(
      service.create(
        {
          millingCenterId: 'mc-1',
          date: '2026-01-01',
          lines: [
            { paddyGradeId: 'g4', bagCount: 20 },
            { paddyGradeId: 'g5', bagCount: 15 },
          ],
        },
        operator,
      ),
    ).resolves.toBeDefined();
  });

  it('estimates KG from bag count at the standard 50 KG/bag when not given', async () => {
    const createFn = jest.fn().mockResolvedValue({ id: 'pmr-1' });
    const prisma = {
      millingCenter: { findUnique: jest.fn().mockResolvedValue({ id: 'mc-1', isActive: true }) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({ paddyMillingReceipt: { count: jest.fn().mockResolvedValue(0), create: createFn } }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const service = new PaddyMillingReceiptsService(prisma as any, audit);

    await service.create({ millingCenterId: 'mc-1', date: '2026-01-01', lines: [{ paddyGradeId: 'g4', bagCount: 30 }] }, operator);

    const dataArg = createFn.mock.calls[0][0].data;
    expect(dataArg.lines.create[0].kg).toBe(1500);
  });

  it('uses the explicitly given KG instead of estimating, when provided', async () => {
    const createFn = jest.fn().mockResolvedValue({ id: 'pmr-1' });
    const prisma = {
      millingCenter: { findUnique: jest.fn().mockResolvedValue({ id: 'mc-1', isActive: true }) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({ paddyMillingReceipt: { count: jest.fn().mockResolvedValue(0), create: createFn } }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const service = new PaddyMillingReceiptsService(prisma as any, audit);

    await service.create({ millingCenterId: 'mc-1', date: '2026-01-01', lines: [{ paddyGradeId: 'g4', bagCount: 30, kg: 1490 }] }, operator);

    const dataArg = createFn.mock.calls[0][0].data;
    expect(dataArg.lines.create[0].kg).toBe(1490);
  });
});
