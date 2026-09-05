import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaddyEntriesService } from '../paddy-entries.service';
import { AuditService } from '../../audit/audit.service';
import { InventoryLedgerService } from '../../inventory-ledger/inventory-ledger.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('PaddyEntriesService', () => {
  const farmScopedUser = (userId: string, farmId: string): AuthenticatedUser =>
    ({
      id: userId,
      email: `${userId}@kam.local`,
      firstName: 'Test',
      lastName: 'User',
      status: 'ACTIVE',
      roles: [{ roleId: 'r1', roleCode: 'FARM_MANAGER', permissions: [], scopes: [{ scopeType: 'FARM', scopeId: farmId }] }],
      permissionCodes: new Set(['paddy.create', 'paddy.submit', 'paddy.approve', 'paddy.reject', 'farm.inventory.view']),
    }) as AuthenticatedUser;

  const globalUser = (userId: string): AuthenticatedUser =>
    ({
      id: userId,
      email: `${userId}@kam.local`,
      firstName: 'Director',
      lastName: 'User',
      status: 'ACTIVE',
      roles: [{ roleId: 'r2', roleCode: 'FARM_DIRECTOR', permissions: [], scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }],
      permissionCodes: new Set(['paddy.approve', 'paddy.reject', 'farm.inventory.view']),
    }) as AuthenticatedUser;

  const submittedEntry = {
    id: 'pe-1',
    entryNumber: 'PE-2026-000001',
    batchNumber: 'PB-2026-000001',
    farmId: 'farm-a',
    farm: { id: 'farm-a' },
    paddyGradeId: 'grade-4',
    paddyGrade: { id: 'grade-4', code: 'SIZE_4' },
    paddyType: null,
    weightKg: 50000,
    bagCount: 1000,
    status: 'SUBMITTED',
    submittedById: 'manager-1',
    submittedBy: { id: 'manager-1' },
    approvedBy: null,
    batch: null,
  };

  function buildService() {
    const prisma = {
      paddyEntry: { findUnique: jest.fn(), update: jest.fn() },
      farm: { findUnique: jest.fn() },
      paddyGrade: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          paddyEntry: { create: jest.fn().mockResolvedValue(submittedEntry), update: jest.fn().mockResolvedValue({ ...submittedEntry, status: 'APPROVED' }) },
          paddyBatch: { create: jest.fn().mockResolvedValue({ batchNumber: submittedEntry.batchNumber }) },
        }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const ledger = {
      generateNumber: jest.fn().mockResolvedValue('PE-2026-000001'),
      recordTransaction: jest.fn(),
      adjustBalance: jest.fn(),
    } as unknown as InventoryLedgerService;

    const service = new PaddyEntriesService(prisma as any, audit, ledger);
    return { service, prisma, audit, ledger };
  }

  it('rejects a Farm Manager approving their own submission (rule 54)', async () => {
    const { service, prisma } = buildService();
    prisma.paddyEntry.findUnique.mockResolvedValue(submittedEntry);

    const actor = farmScopedUser('manager-1', 'farm-a'); // same id as submittedById

    await expect(service.approve('pe-1', actor)).rejects.toThrow(ForbiddenException);
  });

  it('allows a different, properly scoped user to approve, and records a ledger transaction + balance adjustment', async () => {
    const { service, prisma, ledger } = buildService();
    prisma.paddyEntry.findUnique.mockResolvedValue(submittedEntry);

    const actor = globalUser('director-1');
    await service.approve('pe-1', actor);

    expect(ledger.recordTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'PADDY_APPROVED', destLocationId: 'farm-a', quantityKg: 50000 }),
    );
    expect(ledger.adjustBalance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locationId: 'farm-a', paddyGradeId: 'grade-4' }),
      50000,
      1000,
    );
  });

  it('refuses to approve an entry that is not SUBMITTED', async () => {
    const { service, prisma } = buildService();
    prisma.paddyEntry.findUnique.mockResolvedValue({ ...submittedEntry, status: 'DRAFT' });

    const actor = globalUser('director-1');
    await expect(service.approve('pe-1', actor)).rejects.toThrow(BadRequestException);
  });

  it('blocks a user with no scope over the farm from even reading the entry', async () => {
    const { service, prisma } = buildService();
    prisma.paddyEntry.findUnique.mockResolvedValue(submittedEntry);

    const outsider = farmScopedUser('manager-2', 'farm-b'); // wrong farm
    await expect(service.findById('pe-1', outsider)).rejects.toThrow(ForbiddenException);
  });

  it('computes average bag weight from actual KG, never assumes a fixed size-to-KG mapping', async () => {
    const createSpy = jest.fn().mockResolvedValue(submittedEntry);
    const prisma = {
      paddyEntry: { findUnique: jest.fn().mockResolvedValue(submittedEntry), update: jest.fn() },
      farm: { findUnique: jest.fn().mockResolvedValue({ id: 'farm-a', isActive: true }) },
      paddyGrade: { findUnique: jest.fn().mockResolvedValue({ id: 'grade-4', isActive: true }) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb({ paddyEntry: { create: createSpy } })),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const ledger = { generateNumber: jest.fn().mockResolvedValue('PE-2026-000001') } as unknown as InventoryLedgerService;
    const service = new PaddyEntriesService(prisma as any, audit, ledger);

    const actor = farmScopedUser('manager-1', 'farm-a');
    await service.create(
      { farmId: 'farm-a', entryDate: '2026-09-01', paddyGradeId: 'grade-4', weightKg: 62500, bagCount: 1250 },
      actor,
    );

    // 62,500 KG across 1,250 bags = 50 KG/bag average, computed, not assumed
    // from the grade label alone.
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ avgBagWeightKg: 50 }) }));
  });
});
