import { UsersService } from '../users.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('UsersService.list — team-visibility scoping', () => {
  function buildService() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { $transaction: jest.fn((ops) => Promise.all(ops)), user: { findMany, count } };
    const audit = {} as unknown as AuditService;
    const service = new UsersService(prisma as any, audit);
    return { service, findMany };
  }

  function actorWithRole(roleCode: string, permissionCodes: string[] = ['tasks.assign']): AuthenticatedUser {
    return {
      id: 'actor-1',
      email: 'a@kam.local',
      firstName: 'A',
      lastName: 'B',
      status: 'ACTIVE',
      roles: [{ roleId: 'r1', roleCode, permissions: [], scopes: [] }],
      permissionCodes: new Set(permissionCodes),
    };
  }

  it('restricts a Farm Director (no users.manage) to only Farm Managers, regardless of what they searched for', async () => {
    const { service, findMany } = buildService();
    const farmDirector = actorWithRole('FARM_DIRECTOR');

    await service.list({ search: 'anything' }, farmDirector);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ roles: { some: { role: { code: { in: ['FARM_MANAGER'] } } } } }),
      }),
    );
  });

  it('restricts a Warehouse Supervisor to only Warehouse Managers', async () => {
    const { service, findMany } = buildService();
    const supervisor = actorWithRole('WAREHOUSE_SUPERVISOR');

    await service.list({}, supervisor);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ roles: { some: { role: { code: { in: ['WAREHOUSE_MANAGER'] } } } } }) }),
    );
  });

  it('restricts an Operations Manager to only Operations Officers', async () => {
    const { service, findMany } = buildService();
    const opsManager = actorWithRole('OPERATIONS_MANAGER');

    await service.list({}, opsManager);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ roles: { some: { role: { code: { in: ['OPERATIONS_OFFICER'] } } } } }) }),
    );
  });

  it('returns nothing at all — not an error, not the full list — for a role with no defined team and no users.manage', async () => {
    const { service, findMany } = buildService();
    const salesOfficer = actorWithRole('SALES_OFFICER');

    const result = await service.list({}, salesOfficer);

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('does NOT restrict a caller who holds users.manage — real Admin access is untouched by this scoping', async () => {
    const { service, findMany } = buildService();
    const admin = actorWithRole('ADMIN', ['users.manage']);

    await service.list({}, admin);

    const callArg = findMany.mock.calls[0][0];
    expect(callArg.where.roles).toBeUndefined();
  });

  it('does NOT restrict when no actor is passed at all — internal/system callers are unaffected', async () => {
    const { service, findMany } = buildService();

    await service.list({});

    const callArg = findMany.mock.calls[0][0];
    expect(callArg.where.roles).toBeUndefined();
  });
});
