import { Reflector } from '@nestjs/core';
import { OPEN_RESET_STATUSES, SystemOverviewService } from '../system-overview.service';
import { SystemOverviewController } from '../system-overview.controller';
import { API_FEATURES, API_VERSION } from '../../common/build-info';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

const NOW = new Date('2026-10-04T12:00:00Z');

function build(over: Record<string, unknown> = {}) {
  const calls: Record<string, any[]> = {};
  const rec = (name: string, fn: (a: any) => unknown) => jest.fn(async (a: any) => { (calls[name] ??= []).push(a); return fn(a); });
  const prisma: any = {
    $queryRaw: jest.fn(async () => [1]),
    user: { count: rec('user', ({ where }: any) => (where.status === 'ACTIVE' && where.lastLoginAt === null ? 2 : where.status === 'ACTIVE' ? 9 : where.status === 'DISABLED' ? 1 : where.lockedUntil ? 1 : where.mustChangePassword ? 3 : 11)) },
    role: { findMany: jest.fn(async () => [{ code: 'ADMIN', name: 'System Administrator', isSystemRole: true, _count: { userRoles: 1 } }, { code: 'MD', name: 'Managing Director', isSystemRole: true, _count: { userRoles: 2 } }]) },
    farm: { count: jest.fn(async () => 6) }, warehouse: { count: jest.fn(async () => 3) }, millingCenter: { count: jest.fn(async () => 3) }, machine: { count: jest.fn(async () => 9) }, customer: { count: jest.fn(async () => 14) },
    permission: { count: jest.fn(async () => 92) },
    resetRequest: { count: rec('reset', () => 2) },
    auditLog: {
      count: jest.fn(async ({ where }: any) => (NOW.getTime() - where.createdAt.gte.getTime() <= 24 * 3_600_000 ? 5 : 40)),
      findMany: jest.fn(async () => [{ createdAt: new Date('2026-10-04T10:00:00Z'), action: 'user.create', entity: 'User', user: { firstName: 'Sam', lastName: 'Admin' } }, { createdAt: new Date('2026-10-04T09:00:00Z'), action: 'system.start', entity: 'System', user: null }]),
    },
    siteContent: { findUnique: jest.fn(async () => ({ version: 2, updatedAt: new Date('2026-10-03T09:00:00Z') })) },
    siteMedia: { count: jest.fn(async () => 4) },
    ...over,
  };
  const settings = { effective: jest.fn(async () => [{ isDefault: true }, { isDefault: false }, { isDefault: false }]) };
  return { service: new SystemOverviewService(prisma, settings as any), calls };
}

describe('SystemOverviewService', () => {
  it('reports people, organization and access in one go', async () => {
    const o = await build().service.overview(NOW);
    expect(o.people).toMatchObject({ total: 11, active: 9, disabled: 1, lockedNow: 1, mustChangePassword: 3, neverSignedIn: 2 });
    expect(o.organization).toEqual({ farms: 6, warehouses: 3, millingCenters: 3, machines: 9, customers: 14 });
    expect(o.access).toEqual({ roles: 2, permissions: 92 });
  });
  it('lists each role with how many people hold it', async () => {
    expect((await build().service.overview(NOW)).people.roles).toEqual([
      { code: 'ADMIN', name: 'System Administrator', isSystemRole: true, members: 1 }, { code: 'MD', name: 'Managing Director', isSystemRole: true, members: 2 },
    ]);
  });
  it('counts a lock as a lock only until it expires', async () => {
    const { service, calls } = build();
    await service.overview(NOW);
    expect(calls.user.find((c) => c.where.lockedUntil).where.lockedUntil).toEqual({ gt: NOW });
  });
  it('counts reset requests still moving or waiting to be carried out, never the finished ones', async () => {
    const { service, calls } = build();
    expect((await service.overview(NOW)).pending.resetRequests).toBe(2);
    expect(calls.reset[0].where.status.in).toEqual(OPEN_RESET_STATUSES);
    for (const done of ['EXECUTED', 'REJECTED', 'CANCELLED']) expect(OPEN_RESET_STATUSES).not.toContain(done);
  });
  it('shows recent activity with who did it, or "The system"', async () => {
    const o = await build().service.overview(NOW);
    expect(o.activity).toMatchObject({ last24h: 5, last7d: 40 });
    expect(o.activity.recent?.map((r) => r.who)).toEqual(['Sam Admin', 'The system']);
  });
  it('says whether the homepage has been changed, and how many files are stored', async () => {
    expect((await build().service.overview(NOW)).homepage).toEqual({ saved: true, version: 2, updatedAt: '2026-10-03T09:00:00.000Z', files: 4 });
    const none = await build({ siteContent: { findUnique: jest.fn(async () => null) } }).service.overview(NOW);
    expect(none.homepage).toEqual({ saved: false, version: 0, updatedAt: null, files: 4 });
  });
  it('counts how many settings have been changed from their defaults', async () => {
    expect((await build().service.overview(NOW)).settings).toEqual({ total: 3, changedFromDefault: 2 });
  });
  it('says which version the server is and which features it has, so the website can tell if it is behind', async () => {
    const { api } = await build().service.overview(NOW);
    expect(api).toMatchObject({ version: API_VERSION, databaseOk: true, features: [...API_FEATURES] });
    expect(api.features).toEqual(expect.arrayContaining(['site-content', 'insights', 'settings-registry', 'system-overview', 'reports-catalog']));
  });
  it('says so plainly when the database cannot be reached', async () => {
    expect((await build({ $queryRaw: jest.fn(async () => { throw new Error('down'); }) }).service.overview(NOW)).api.databaseOk).toBe(false);
  });
  it('lets one failing figure be blank without blanking the page', async () => {
    const o = await build({ farm: { count: jest.fn(async () => { throw new Error('boom'); }) } }).service.overview(NOW);
    expect(o.organization.farms).toBeNull();
    expect(o.organization.warehouses).toBe(3);
    expect(o.people.total).toBe(11);
  });
});

describe('SystemOverviewController', () => {
  it('is for the System Administrator only (settings.manage)', () => {
    expect(new Reflector().get(PERMISSION_KEY, SystemOverviewController.prototype.get)).toBe('settings.manage');
  });
});

describe('SystemOverviewService: the database check on the Control center', () => {
  it('reports which tables are missing, so the Administrator can see the cause of a failing screen', async () => {
    const schemaCheck = { check: jest.fn().mockResolvedValue({ state: 'missing', expected: 80, missing: ['site_content', 'site_media'] }) };
    const out = await new SystemOverviewService({} as any, undefined, schemaCheck as any).overview();
    expect(out.api.schema).toEqual({ state: 'missing', missing: ['site_content', 'site_media'] });
  });
  it('says unknown, not ok, when no check is available', async () => {
    expect((await new SystemOverviewService({} as any).overview()).api.schema).toEqual({ state: 'unknown', missing: [] });
  });
});
