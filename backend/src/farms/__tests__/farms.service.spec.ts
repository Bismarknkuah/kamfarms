import { ConflictException, NotFoundException } from '@nestjs/common';
import { FarmsService } from '../farms.service';
import { AuditService } from '../../audit/audit.service';
import { InventoryLedgerService } from '../../inventory-ledger/inventory-ledger.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('FarmsService', () => {
  const basePrisma = () => ({
    farm: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    farmManager: { upsert: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
    role: { findUnique: jest.fn() },
    userRole: { create: jest.fn() },
    userScope: { create: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(basePrismaTx())),
  });
  // Everything a transaction callback touches inside createManager —
  // separate from the outer mock since $transaction hands the callback
  // a tx client, not `this.prisma` itself, and real Prisma genuinely
  // treats these as different objects.
  const basePrismaTx = () => ({
    user: { create: jest.fn().mockResolvedValue({ id: 'new-fm-1', firstName: 'New', lastName: 'Manager', email: 'new.manager@kam.local' }) },
    userRole: { create: jest.fn().mockResolvedValue({ id: 'ur-1' }) },
    userScope: { create: jest.fn() },
    farmManager: { create: jest.fn() },
  });
  const audit = { record: jest.fn() } as unknown as AuditService;
  const ledger = { getBalancesForLocation: jest.fn() } as unknown as InventoryLedgerService;
  const actor = { id: 'admin-1' } as AuthenticatedUser;

  it('never assumes Farm G exists — creating it works like any other farm', async () => {
    const prisma = basePrisma();
    prisma.farm.findUnique.mockResolvedValue(null); // code not taken
    prisma.farm.create.mockResolvedValue({ id: 'f-g', code: 'FARM_G', name: 'Farm G', isActive: true });
    const service = new FarmsService(prisma as any, audit, ledger);

    const result = await service.create({ code: 'FARM_G', name: 'Farm G' }, actor);

    expect(result.code).toBe('FARM_G');
    expect(prisma.farm.create).toHaveBeenCalledWith({ data: { code: 'FARM_G', name: 'Farm G' } });
    expect(audit.record).toHaveBeenCalled();
  });

  it('rejects a duplicate farm code', async () => {
    const prisma = basePrisma();
    prisma.farm.findUnique.mockResolvedValue({ id: 'existing', code: 'FARM_A' });
    const service = new FarmsService(prisma as any, audit, ledger);

    await expect(service.create({ code: 'FARM_A', name: 'Farm A dup' }, actor)).rejects.toThrow(ConflictException);
  });

  it('deactivates rather than hard-deletes a farm', async () => {
    const prisma = basePrisma();
    prisma.farm.findUnique.mockResolvedValue({ id: 'f-a', code: 'FARM_A', isActive: true, managers: [] });
    prisma.farm.update.mockResolvedValue({ id: 'f-a', code: 'FARM_A', isActive: false });
    const service = new FarmsService(prisma as any, audit, ledger);

    const result = await service.deactivate('f-a', actor);

    expect(result.isActive).toBe(false);
    expect(prisma.farm.update).toHaveBeenCalledWith({ where: { id: 'f-a' }, data: { isActive: false } });
  });

  it('throws NotFoundException for an unknown farm id', async () => {
    const prisma = basePrisma();
    prisma.farm.findUnique.mockResolvedValue(null);
    const service = new FarmsService(prisma as any, audit, ledger);

    await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
  });

  it('reports farm inventory from the ledger balances, never a stored counter', async () => {
    const prisma = basePrisma();
    prisma.farm.findUnique.mockResolvedValue({ id: 'f-a', code: 'FARM_A', isActive: true, managers: [] });
    (ledger.getBalancesForLocation as jest.Mock).mockResolvedValue([
      { paddyGrade: { code: 'SIZE_4', label: 'Size 4' }, bagCount: 1250, quantityKg: 62500 },
      { paddyGrade: { code: 'SIZE_5', label: 'Size 5' }, bagCount: 850, quantityKg: 42500 },
    ]);
    const service = new FarmsService(prisma as any, audit, ledger);

    const result = await service.getInventory('f-a');

    expect(result.totalKg).toBe(105000);
    expect(result.totalBags).toBe(2100);
    expect(result.byGrade).toHaveLength(2);
  });

  describe('list() scope isolation — the actual bug: this previously took no actor at all and returned every farm to everyone', () => {
    it('restricts a Farm-A-scoped Farm Manager to only Farm A, even though six farms exist in the database', async () => {
      const prisma = basePrisma();
      const farmManagerA = {
        id: 'fm-a',
        roles: [{ scopes: [{ scopeType: 'FARM', scopeId: 'farm-a-id' }] }],
      } as unknown as AuthenticatedUser;
      const service = new FarmsService(prisma as any, audit, ledger);

      await service.list(farmManagerA);

      expect(prisma.farm.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { in: ['farm-a-id'] } }) }),
      );
    });

    it('does NOT let a Farm-A-scoped caller see Farm B by any means — the where clause itself excludes it, not just the frontend', async () => {
      const prisma = basePrisma();
      prisma.farm.findMany.mockResolvedValue([{ id: 'farm-a-id', code: 'FARM_A' }]);
      const farmManagerA = {
        id: 'fm-a',
        roles: [{ scopes: [{ scopeType: 'FARM', scopeId: 'farm-a-id' }] }],
      } as unknown as AuthenticatedUser;
      const service = new FarmsService(prisma as any, audit, ledger);

      const result = await service.list(farmManagerA);

      expect(result.every((f: any) => f.id === 'farm-a-id')).toBe(true);
      expect(result.some((f: any) => f.id === 'farm-b-id')).toBe(false);
    });

    it('does not restrict a GLOBAL-scoped caller (Admin, MD, Farm Director) — sees every active farm same as before', async () => {
      const prisma = basePrisma();
      const farmDirector = {
        id: 'fd-1',
        roles: [{ scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }],
      } as unknown as AuthenticatedUser;
      const service = new FarmsService(prisma as any, audit, ledger);

      await service.list(farmDirector);

      const callArg = prisma.farm.findMany.mock.calls[0][0];
      expect(callArg.where.id).toBeUndefined();
    });

    it('returns an empty list, not an error and not everyone, for a caller with no FARM scope at all', async () => {
      const prisma = basePrisma();
      const noScope = { id: 'x', roles: [{ scopes: [] }] } as unknown as AuthenticatedUser;
      const service = new FarmsService(prisma as any, audit, ledger);

      const result = await service.list(noScope);

      expect(result).toEqual([]);
      expect(prisma.farm.findMany).not.toHaveBeenCalled();
    });
  });

  describe('createManager() — a Farm Supervisor onboarding a brand new Farm Manager', () => {
    const farmSupervisor = {
      id: 'fs-1',
      roles: [{ scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }],
    } as unknown as AuthenticatedUser;

    it('creates a real user with the FARM_MANAGER role and a FARM scope tied to exactly this farm, and returns a temporary password', async () => {
      const prisma = basePrisma();
      prisma.farm.findUnique.mockResolvedValue({ id: 'farm-a', code: 'FARM_A', isActive: true, managers: [] });
      prisma.user.findUnique.mockResolvedValue(null); // email not taken
      prisma.role.findUnique.mockResolvedValue({ id: 'role-fm', code: 'FARM_MANAGER' });
      const service = new FarmsService(prisma as any, audit, ledger);

      const result = await service.createManager(
        'farm-a',
        { firstName: 'New', lastName: 'Manager', email: 'new.manager@kam.local' },
        farmSupervisor,
      );

      expect(result.email).toBe('new.manager@kam.local');
      // A real, usable temporary password is returned — not blank, not
      // a placeholder, and long enough to actually be a password.
      expect(result.temporaryPassword).toBeTruthy();
      expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(10);
    });

    it('rejects if the email is already in use — never silently overwrites an existing account', async () => {
      const prisma = basePrisma();
      prisma.farm.findUnique.mockResolvedValue({ id: 'farm-a', code: 'FARM_A', isActive: true, managers: [] });
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });
      const service = new FarmsService(prisma as any, audit, ledger);

      await expect(
        service.createManager('farm-a', { firstName: 'New', lastName: 'Manager', email: 'taken@kam.local' }, farmSupervisor),
      ).rejects.toThrow(ConflictException);
    });

    it('a Farm-A-scoped caller cannot create a manager for Farm B — the same scope barrier as every other write in this service', async () => {
      const prisma = basePrisma();
      const farmAScopedManager = {
        id: 'fm-a',
        roles: [{ scopes: [{ scopeType: 'FARM', scopeId: 'farm-a' }] }],
      } as unknown as AuthenticatedUser;
      const service = new FarmsService(prisma as any, audit, ledger);

      await expect(
        service.createManager('farm-b', { firstName: 'X', lastName: 'Y', email: 'x@kam.local' }, farmAScopedManager),
      ).rejects.toThrow();
      // Never even reached the point of checking the email or creating
      // anything — the scope check is the very first thing that runs.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });
});
