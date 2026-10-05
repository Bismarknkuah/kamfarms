import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RoleAccessService } from '../role-access.service';
import { ACCESS_FEATURES } from '../access-features';
import { PERMISSION_CATALOG } from '../../common/constants/permissions';

const role = (roleCode: string, permissions: string[]) => ({ roleCode, permissions });
function build(rows: { roleCode: string; featureKey: string }[] = [], roleRows: any[] = []) {
  const store = [...rows];
  const prisma: any = {
    roleFeatureDenial: {
      findMany: jest.fn(async () => store.map((r) => ({ ...r }))),
      deleteMany: jest.fn(async ({ where }: any) => { for (let i = store.length - 1; i >= 0; i--) if (store[i].roleCode === where.roleCode) store.splice(i, 1); }),
      createMany: jest.fn(async ({ data }: any) => { store.push(...data); }),
    },
    role: { findMany: jest.fn(async () => roleRows), findFirst: jest.fn(async ({ where }: any) => (roleRows.concat([{ code: 'FARM_MANAGER' }, { code: 'ADMIN' }]).find((r) => r.code === where.code) ?? null)) },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const audit = { record: jest.fn() };
  return { service: new RoleAccessService(prisma, audit as any), prisma, audit, store };
}
const actor = { id: 'admin-1' } as any;

describe('the catalogue of features that can be switched off', () => {
  it('only names permissions that exist, each feature once, and keeps core work out', () => {
    const codes = new Set(PERMISSION_CATALOG.map((p) => p.code));
    for (const f of ACCESS_FEATURES) for (const p of f.permissions) expect({ feature: f.key, permission: p, exists: codes.has(p) }).toEqual({ feature: f.key, permission: p, exists: true });
    expect(new Set(ACCESS_FEATURES.map((f) => f.key)).size).toBe(ACCESS_FEATURES.length);
    for (const f of ACCESS_FEATURES.filter((x) => x.ui)) expect(f.permissions).toEqual([]);
    const all = ACCESS_FEATURES.flatMap((f) => f.permissions);
    for (const core of ['sales.create', 'sales.approve', 'payment.verify', 'warehouse.receive', 'paddy.create', 'delivery.create', 'settings.manage', 'roles.manage']) expect(all).not.toContain(core);
  });
});

describe('restricting a role', () => {
  it('takes away exactly the permissions of the features switched off for THAT role, and nothing from other roles', async () => {
    const h = build([{ roleCode: 'FARM_MANAGER', featureKey: 'track-dispatch' }]);
    const out = await h.service.restrict([role('FARM_MANAGER', ['dispatch.track', 'paddy.create', 'trace.view']), role('WAREHOUSE_MANAGER', ['dispatch.track', 'warehouse.receive'])]);
    expect(out[0].permissions).toEqual(['paddy.create', 'trace.view']);
    expect(out[1].permissions).toEqual(['dispatch.track', 'warehouse.receive']);
  });
  it('a feature with several permissions loses all of them', async () => {
    const out = await build([{ roleCode: 'FINANCE_DIRECTOR', featureKey: 'paddy-requests' }]).service.restrict([role('FINANCE_DIRECTOR', ['supply.view', 'supply.request', 'supply.forward', 'supply.fulfil', 'finance.view'])]);
    expect(out[0].permissions).toEqual(['finance.view']);
  });
  it('never touches the System Administrator, even if a row were somehow there', async () => {
    const admin = role('ADMIN', ['dispatch.track', 'settings.manage']);
    const out = await build([{ roleCode: 'ADMIN', featureKey: 'track-dispatch' }]).service.restrict([admin]);
    expect(out[0]).toBe(admin);
  });
  it('a person with two roles keeps a permission if ANY of their roles still has it', async () => {
    const out = await build([{ roleCode: 'FARM_MANAGER', featureKey: 'track-dispatch' }]).service.restrict([role('FARM_MANAGER', ['dispatch.track']), role('WAREHOUSE_MANAGER', ['dispatch.track'])]);
    expect(new Set(out.flatMap((r) => r.permissions))).toEqual(new Set(['dispatch.track']));
  });
  it('with nothing switched off nothing changes (and the same objects come back)', async () => {
    const roles = [role('FARM_MANAGER', ['dispatch.track'])]; expect(await build().service.restrict(roles)).toBe(roles);
  });
  it('asks the database once for a few seconds, then again after a change is saved', async () => {
    const h = build([{ roleCode: 'FARM_MANAGER', featureKey: 'trace' }]);
    await h.service.restrict([role('FARM_MANAGER', ['trace.view'])]); await h.service.restrict([role('FARM_MANAGER', ['trace.view'])]);
    expect(h.prisma.roleFeatureDenial.findMany).toHaveBeenCalledTimes(1);
    await h.service.setForRole('FARM_MANAGER', [], actor);
    expect((await h.service.restrict([role('FARM_MANAGER', ['trace.view'])]))[0].permissions).toEqual(['trace.view']);   // the change shows at once, not after the cache runs out
  });
  it('if the restrictions cannot be read, nobody is locked out', async () => {
    const h = build(); h.prisma.roleFeatureDenial.findMany.mockRejectedValue(new Error('relation does not exist'));
    const roles = [role('FARM_MANAGER', ['dispatch.track'])]; expect(await h.service.restrict(roles)).toBe(roles); expect(await h.service.hiddenFor(['FARM_MANAGER'])).toEqual([]);
  });
});

describe('features hidden from the menu and screens', () => {
  it('a screen feature is hidden only when it is switched off for EVERY role the person holds', async () => {
    const h = build([{ roleCode: 'FARM_MANAGER', featureKey: 'quick-search' }, { roleCode: 'FARM_MANAGER', featureKey: 'control-center' }, { roleCode: 'WAREHOUSE_MANAGER', featureKey: 'quick-search' }]);
    expect(await h.service.hiddenFor(['FARM_MANAGER'])).toEqual(['control-center', 'quick-search']);
    expect(await h.service.hiddenFor(['FARM_MANAGER', 'WAREHOUSE_MANAGER'])).toEqual(['quick-search']);
    expect(await h.service.hiddenFor(['FARM_MANAGER', 'MD'])).toEqual([]);
  });
  it('never for the Administrator', async () => { expect(await build([{ roleCode: 'ADMIN', featureKey: 'quick-search' }]).service.hiddenFor(['ADMIN'])).toEqual([]); });
  it('permission features are not listed here: their pages vanish because the permissions do', async () => {
    expect(await build([{ roleCode: 'FARM_MANAGER', featureKey: 'track-dispatch' }]).service.hiddenFor(['FARM_MANAGER'])).toEqual([]);
  });
});

describe('the Administrator changing a role', () => {
  it('replaces the list, records who did it and what changed, and refuses the Administrator role, unknown roles and unknown features', async () => {
    const h = build([{ roleCode: 'FARM_MANAGER', featureKey: 'trace' }]);
    expect(await h.service.setForRole('FARM_MANAGER', ['messages', 'track-dispatch', 'messages'], actor)).toEqual({ code: 'FARM_MANAGER', denied: ['messages', 'track-dispatch'] });
    expect(h.store.map((r: any) => r.featureKey).sort()).toEqual(['messages', 'track-dispatch']);
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'access.features.update', entityId: 'FARM_MANAGER', userId: 'admin-1', afterValue: { switchedOff: ['messages', 'track-dispatch'], wasSwitchedOff: ['trace'] } }));
    await expect(h.service.setForRole('ADMIN', ['trace'], actor)).rejects.toThrow(BadRequestException);
    await expect(h.service.setForRole('NOBODY', [], actor)).rejects.toThrow(NotFoundException);
    await expect(h.service.setForRole('FARM_MANAGER', ['sales-approval'], actor)).rejects.toThrow(/Not a feature/);
    expect(h.store).toHaveLength(2);   // the refused attempts changed nothing
  });
  it('the settings screen is told which features each role has by default, and which are switched off', async () => {
    const roleRows = [
      { code: 'FARM_MANAGER', name: 'Farm Manager', permissions: [{ permission: { code: 'paddy.create' } }] },
      { code: 'FARM_DIRECTOR', name: 'Farm Supervisor', permissions: [{ permission: { code: 'dispatch.track' } }, { permission: { code: 'supply.view' } }] },
    ];
    const m = await build([{ roleCode: 'FARM_DIRECTOR', featureKey: 'trace' }], roleRows).service.matrix();
    const fm = m.roles.find((r) => r.code === 'FARM_MANAGER')!; const fd = m.roles.find((r) => r.code === 'FARM_DIRECTOR')!;
    expect(fm.held).not.toContain('track-dispatch'); expect(fm.held).toEqual(expect.arrayContaining(['quick-search']));
    expect(fd.held).toEqual(expect.arrayContaining(['track-dispatch', 'paddy-requests', 'control-center'])); expect(fd.denied).toEqual(['trace']);
    expect(m.features.map((f) => f.key)).toContain('track-dispatch');
  });
});
