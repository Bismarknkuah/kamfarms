import { BadRequestException } from '@nestjs/common';
import { UserSupportService } from '../user-support.service';

const actor = { id: 'admin-1', roles: [], permissionCodes: new Set(['users.manage']) } as any;
const user = (over: any = {}) => ({ id: 'u1', firstName: 'Kofi', lastName: 'Mensah', email: 'k@kam.local', status: 'ACTIVE', mustChangePassword: false, lockedUntil: null, failedLoginCount: 0, lastLoginAt: null, roles: [{ role: { code: 'FARM_MANAGER', name: 'Farm Manager', permissions: [{ permission: { code: 'farm.inventory.view' } }, { permission: { code: 'reports.view' } }] }, scopes: [] }], ...over });
const build = (u: any) => {
  const prisma: any = {
    user: { findFirst: jest.fn(async () => u), update: jest.fn(async () => ({})) },
    loginAttempt: { findMany: jest.fn(async () => [{ createdAt: new Date(), reason: 'Wrong password' }]) },
    refreshToken: { updateMany: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const audit: any = { record: jest.fn(async () => ({})) };
  const access: any = { restrict: jest.fn(async (r: any[]) => r.map((x) => ({ ...x, permissions: x.permissions.filter((p: string) => p !== 'reports.view') }))) };
  return { prisma, audit, svc: new UserSupportService(prisma, audit, access) };
};

describe('UserSupportService.accessCheck says why a person is stuck', () => {
  it('finds a Farm Manager with no farm assigned, and the feature switched off for the role', async () => {
    const r = await build(user()).svc.accessCheck('u1');
    const codes = r.problems.map((p) => p.code);
    expect(codes).toContain('NO_PLACE');
    expect(codes).toContain('FEATURE_OFF');
    expect(r.problems.find((p) => p.code === 'FEATURE_OFF')!.text).toContain('Reports and analytics');
  });
  it('is quiet when the person is fine: a farm assigned and nothing switched off', async () => {
    const { svc } = build(user({ roles: [{ role: { code: 'FARM_MANAGER', name: 'Farm Manager', permissions: [{ permission: { code: 'farm.inventory.view' } }] }, scopes: [{ scopeType: 'FARM', scopeId: 'f1' }] }] }));
    expect((await svc.accessCheck('u1')).problems).toEqual([]);
  });
  it('reports a locked, disabled or role-less account', async () => {
    const r = await build(user({ status: 'DISABLED', roles: [], lockedUntil: new Date(Date.now() + 600000) })).svc.accessCheck('u1');
    expect(r.problems.map((p) => p.code)).toEqual(expect.arrayContaining(['NOT_ACTIVE', 'LOCKED', 'NO_ROLE']));
  });
});

describe('UserSupportService actions are audited', () => {
  it('unlocks an account and records it', async () => {
    const { svc, prisma, audit } = build(user({ failedLoginCount: 4 }));
    await svc.unlock('u1', actor, {});
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { failedLoginCount: 0, lockedUntil: null } });
    expect(audit.record.mock.calls[0][0].action).toBe('user.unlock');
  });
  it('resets a password: hashed, must change, signed out everywhere, audited without the password', async () => {
    const { svc, prisma, audit } = build(user());
    await svc.resetPassword('u1', 'Temp-Pass-123', actor, {});
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.passwordHash).toMatch(/^\$argon2/);
    expect(data.mustChangePassword).toBe(true);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    expect(JSON.stringify(audit.record.mock.calls[0][0])).not.toContain('Temp-Pass-123');
  });
  it('refuses a short password, and your own account', async () => {
    const { svc } = build(user());
    await expect(svc.resetPassword('u1', 'short', actor, {})).rejects.toThrow(BadRequestException);
    await expect(svc.resetPassword('admin-1', 'Long-Enough-1', actor, {})).rejects.toThrow('Change Password');
  });
});
