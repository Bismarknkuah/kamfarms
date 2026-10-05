import { JwtStrategy } from '../strategies/jwt.strategy';
import { RoleAccessService } from '../../access/role-access.service';

const userWith = (roles: { code: string; perms: string[] }[]) => ({
  id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', status: 'ACTIVE', deletedAt: null, mustChangePassword: false,
  roles: roles.map((r, i) => ({ roleId: `r${i}`, role: { code: r.code, permissions: r.perms.map((code) => ({ permission: { code } })) }, scopes: [] })),
});
function build(user: any, denied: { roleCode: string; featureKey: string }[]) {
  const prisma: any = { user: { findUnique: jest.fn(async () => user) }, roleFeatureDenial: { findMany: jest.fn(async () => denied) } };
  return new JwtStrategy({ get: () => 'secret' } as any, prisma, new RoleAccessService(prisma));
}

describe('sign-in applies what the Administrator switched off', () => {
  it('the person no longer holds those permissions: not in their roles, not in their permission set', async () => {
    const s = build(userWith([{ code: 'FARM_MANAGER', perms: ['dispatch.track', 'paddy.create'] }]), [{ roleCode: 'FARM_MANAGER', featureKey: 'track-dispatch' }]);
    const a = await s.validate({ sub: 'u1' } as any);
    expect(a.permissionCodes.has('dispatch.track')).toBe(false); expect(a.permissionCodes.has('paddy.create')).toBe(true);
    expect(a.roles[0].permissions).toEqual(['paddy.create']);
  });
  it('is not applied to people whose role was not restricted', async () => {
    const a = await build(userWith([{ code: 'WAREHOUSE_MANAGER', perms: ['dispatch.track'] }]), [{ roleCode: 'FARM_MANAGER', featureKey: 'track-dispatch' }]).validate({ sub: 'u1' } as any);
    expect(a.permissionCodes.has('dispatch.track')).toBe(true);
  });
  it('the System Administrator always keeps everything', async () => {
    const a = await build(userWith([{ code: 'ADMIN', perms: [] }]), [{ roleCode: 'ADMIN', featureKey: 'track-dispatch' }]).validate({ sub: 'u1' } as any);
    expect(a.permissionCodes.has('dispatch.track')).toBe(true); expect(a.permissionCodes.has('settings.manage')).toBe(true);
  });
});
