import { UsersService } from '../users.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('UsersService.list - team-visibility scoping', () => {
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
      mustChangePassword: false,
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

  it('gives MD a real, company-wide directory - a confirmed gap fixed here: MD held the permission to see the Users nav item but was absent from this mapping entirely, meaning the page always came back empty', async () => {
    const { service, findMany } = buildService();
    const md = actorWithRole('MD');

    await service.list({}, md);

    const calledWith = findMany.mock.calls[0][0];
    const visibleCodes: string[] = calledWith.where.roles.some.role.code.in;
    expect(visibleCodes).toEqual(expect.arrayContaining(['FARM_MANAGER', 'WAREHOUSE_MANAGER', 'FINANCE_DIRECTOR', 'SALES_OFFICER']));
    expect(visibleCodes.length).toBeGreaterThan(5);
  });

  it('returns nothing at all - not an error, not the full list - for a role with no defined team and no users.manage', async () => {
    const { service, findMany } = buildService();
    const salesOfficer = actorWithRole('SALES_OFFICER');

    const result = await service.list({}, salesOfficer);

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('does NOT restrict a caller who holds users.manage - real Admin access is untouched by this scoping', async () => {
    const { service, findMany } = buildService();
    const admin = actorWithRole('ADMIN', ['users.manage']);

    await service.list({}, admin);

    const callArg = findMany.mock.calls[0][0];
    expect(callArg.where.roles).toBeUndefined();
  });

  it('does NOT restrict when no actor is passed at all - internal/system callers are unaffected', async () => {
    const { service, findMany } = buildService();

    await service.list({});

    const callArg = findMany.mock.calls[0][0];
    expect(callArg.where.roles).toBeUndefined();
  });
});

describe('UsersService.create - team.manage scoping', () => {
  function buildService(existingUser: unknown = null) {
    const findUnique = jest.fn().mockResolvedValue(existingUser);
    const roleFindUnique = jest.fn().mockResolvedValue({ id: 'role-1', code: 'WAREHOUSE_MANAGER' });
    const userCreate = jest.fn().mockResolvedValue({ id: 'new-user-1' });
    const userRoleCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      user: { findUnique, findFirst: jest.fn().mockResolvedValue({ id: 'new-user-1', roles: [] }) },
      role: { findUnique: roleFindUnique },
      $transaction: jest.fn((fn: any) => fn({ user: { create: userCreate }, role: { findUnique: roleFindUnique }, userRole: { create: userRoleCreate } })),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const service = new UsersService(prisma as any, audit);
    return { service, userRoleCreate };
  }

  function actor(roleCode: string, permissionCodes: string[]): AuthenticatedUser {
    return {
      id: 'actor-1',
      email: 'a@kam.local',
      firstName: 'A',
      lastName: 'B',
      status: 'ACTIVE',
      roles: [{ roleId: 'r1', roleCode, permissions: [], scopes: [] }],
      mustChangePassword: false,
      permissionCodes: new Set(permissionCodes),
    };
  }

  const baseDto = { firstName: 'New', lastName: 'Hire', email: 'new@kam.local', temporaryPassword: 'TempPass1234' };

  it('rejects a Warehouse Supervisor (team.manage only) trying to create a role-less account', async () => {
    const { service } = buildService();
    const warehouseSupervisor = actor('WAREHOUSE_SUPERVISOR', ['team.manage']);

    await expect(service.create({ ...baseDto } as any, warehouseSupervisor, {})).rejects.toThrow(
      'You can only add a new WAREHOUSE_MANAGER to your team.',
    );
  });

  it('rejects a Warehouse Supervisor trying to create an account with a different role entirely', async () => {
    const { service } = buildService();
    const warehouseSupervisor = actor('WAREHOUSE_SUPERVISOR', ['team.manage']);

    await expect(
      service.create({ ...baseDto, roleCodes: ['FINANCE_OFFICER'] } as any, warehouseSupervisor, {}),
    ).rejects.toThrow('You can only add a new WAREHOUSE_MANAGER to your team.');
  });

  it('allows a Warehouse Supervisor to create a Warehouse Manager - exactly their own team', async () => {
    const { service } = buildService();
    const warehouseSupervisor = actor('WAREHOUSE_SUPERVISOR', ['team.manage']);

    await expect(
      service.create({ ...baseDto, roleCodes: ['WAREHOUSE_MANAGER'] } as any, warehouseSupervisor, {}),
    ).resolves.toBeDefined();
  });

  it('allows a Farm Director to create a Farm Manager - the same real capability given to the other two line-manager roles', async () => {
    const { service } = buildService();
    const farmDirector = actor('FARM_DIRECTOR', ['team.manage']);

    await expect(
      service.create({ ...baseDto, roleCodes: ['FARM_MANAGER'] } as any, farmDirector, {}),
    ).resolves.toBeDefined();
  });

  it('rejects a Farm Director trying to create a Warehouse Manager - team.manage is scoped per role, not a blanket line-manager grant', async () => {
    const { service } = buildService();
    const farmDirector = actor('FARM_DIRECTOR', ['team.manage']);

    await expect(
      service.create({ ...baseDto, roleCodes: ['WAREHOUSE_MANAGER'] } as any, farmDirector, {}),
    ).rejects.toThrow('You can only add a new FARM_MANAGER to your team.');
  });

  it('rejects a role with no defined team (e.g. Sales Officer) entirely, even with no roleCodes requested', async () => {
    const { service } = buildService();
    const salesOfficer = actor('SALES_OFFICER', ['team.manage']);

    await expect(service.create({ ...baseDto } as any, salesOfficer, {})).rejects.toThrow(
      'You do not manage a team that can have new members added.',
    );
  });

  it('does not restrict a real Admin (users.manage) at all - can create any role, or none yet', async () => {
    const { service } = buildService();
    const admin = actor('ADMIN', ['users.manage']);

    await expect(service.create({ ...baseDto } as any, admin, {})).resolves.toBeDefined();
  });
});
