import { BadRequestException } from '@nestjs/common';
import { SettingsService, settingNumber, settingRoles } from '../settings.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

const admin = { id: 'admin-1' } as AuthenticatedUser;

function build(initial: Record<string, string> = {}, roles = ['MD', 'CEO', 'OPERATIONS_MANAGER', 'FINANCE_DIRECTOR']) {
  const rows = new Map(Object.entries(initial));
  const prisma = {
    systemSetting: {
      findMany: jest.fn(async () => [...rows].map(([key, value]) => ({ key, value }))),
      upsert: jest.fn(async ({ where, update, create }: any) => { rows.set(where.key, rows.has(where.key) ? update.value : create.value); }),
      deleteMany: jest.fn(async ({ where }: any) => { rows.delete(where.key); }),
      findUnique: jest.fn(async ({ where }: any) => (rows.has(where.key) ? { value: rows.get(where.key) } : null)),
    },
    role: { findMany: jest.fn(async ({ where }: any) => where.code.in.filter((c: string) => roles.includes(c)).map((code: string) => ({ code }))) },
  };
  const audit = { record: jest.fn() };
  return { service: new SettingsService(prisma as any, audit as any), prisma, audit, rows };
}
const value = async (s: SettingsService, key: string) => (await s.effective()).find((e) => e.key === key)!;

describe('SettingsService: reading', () => {
  it('gives the built-in default until an administrator changes something', async () => {
    const { service } = build();
    expect(await service.getNumber('auth.max_failed_attempts')).toBe(5);
    expect(await service.getRoles('alerts.mass_balance_roles')).toEqual(['OPERATIONS_MANAGER', 'MD', 'CEO']);
    expect((await service.effective()).every((e) => e.isDefault)).toBe(true);
  });
  it('reads a saved value, and ignores a damaged one', async () => {
    const { service } = build({ 'auth.lockout_minutes': '30', 'logistics.variance_tolerance_kg': 'banana', 'alerts.machine_anomaly_roles': '{not json' });
    expect(await service.getNumber('auth.lockout_minutes')).toBe(30);
    expect(await service.getNumber('logistics.variance_tolerance_kg')).toBe(5);
    expect(await service.getRoles('alerts.machine_anomaly_roles')).toEqual(['OPERATIONS_MANAGER', 'MD', 'CEO']);
  });
  it('can never be taken outside its safe range, even by a hand-edited database value', async () => {
    const { service } = build({ 'auth.max_failed_attempts': '9999', 'auth.lockout_minutes': '-4' });
    expect(await service.getNumber('auth.max_failed_attempts')).toBe(20);
    expect(await service.getNumber('auth.lockout_minutes')).toBe(1);
  });
  it('reads the database once, not once per question', async () => {
    const { service, prisma } = build();
    await service.getNumber('auth.lockout_minutes'); await service.getNumber('auth.max_failed_attempts'); await service.getRoles('alerts.mass_balance_roles');
    expect(prisma.systemSetting.findMany).toHaveBeenCalledTimes(1);
  });
  it('refuses to be asked about a setting that does not exist', async () => {
    await expect(build().service.getNumber('not.a.setting')).rejects.toThrow(/Unknown setting/);
  });
});

describe('SettingsService: changing', () => {
  it('saves a change, shows it straight away, and records who changed what from what', async () => {
    const { service, audit } = build();
    const items = await service.updateMany({ 'auth.max_failed_attempts': 8 }, admin);
    expect(items.find((i) => i.key === 'auth.max_failed_attempts')).toMatchObject({ value: 8, isDefault: false });
    expect(await service.getNumber('auth.max_failed_attempts')).toBe(8); // the cache did not hide it
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ userId: 'admin-1', action: 'settings.update', beforeValue: { 'auth.max_failed_attempts': 5 }, afterValue: { 'auth.max_failed_attempts': 8 } }));
  });
  it('accepts a number typed as text, as a form sends it', async () => {
    const { service } = build();
    expect((await value(service, 'auth.lockout_minutes')).value).toBe(15);
    await service.updateMany({ 'auth.lockout_minutes': '45' }, admin);
    expect((await value(service, 'auth.lockout_minutes')).value).toBe(45);
  });
  it('stores nothing when a value is put back to the default', async () => {
    const { service, rows } = build({ 'auth.lockout_minutes': '45' });
    await service.updateMany({ 'auth.lockout_minutes': 15 }, admin);
    expect(rows.has('auth.lockout_minutes')).toBe(false);
  });
  it('records nothing and writes nothing when nothing actually changed', async () => {
    const { service, audit, prisma } = build();
    await service.updateMany({ 'auth.lockout_minutes': 15 }, admin);
    expect(audit.record).not.toHaveBeenCalled();
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });
  it.each([
    [{ 'auth.max_failed_attempts': 1 }, /Wrong passwords before an account is locked: must be between 3 and 20 attempts/],
    [{ 'auth.max_failed_attempts': 'lots' }, /enter a number/],
    [{ 'auth.lockout_minutes': NaN }, /enter a number/],
    [{ 'paddy.standard_bag_kg': 500 }, /Standard paddy bag weight: must be between 10 and 100 kg/],
    [{ 'no.such.setting': 1 }, /is not a setting this system has/],
    [{}, /nothing to change/],
  ])('refuses %j with a clear reason', async (values, message) => {
    const { service, prisma } = build();
    await expect(service.updateMany(values as any, admin)).rejects.toThrow(message);
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });
  it('refuses a whole batch if any one value in it is wrong, saving none of it', async () => {
    const { service, prisma } = build();
    await expect(service.updateMany({ 'auth.lockout_minutes': 30, 'auth.max_failed_attempts': 99 }, admin)).rejects.toThrow(BadRequestException);
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });
  it('will not let a "serious" limit sit below the limit at which something is first flagged', async () => {
    const { service } = build();
    await expect(service.updateMany({ 'watchlist.power_over_percent': 80 }, admin)).rejects.toThrow(/serious limit for extra power per kg must be at least as high/);
    await expect(service.updateMany({ 'watchlist.power_over_percent': 80, 'watchlist.power_high_percent': 120 }, admin)).resolves.toBeDefined();
  });
});

describe('SettingsService: who is alerted', () => {
  it('saves a list of real roles, once each', async () => {
    const { service } = build();
    await service.updateMany({ 'alerts.mass_balance_roles': ['FINANCE_DIRECTOR', 'MD', 'MD'] }, admin);
    expect((await value(service, 'alerts.mass_balance_roles')).value).toEqual(['FINANCE_DIRECTOR', 'MD']);
  });
  it('refuses an empty list (nobody would be told), a role that does not exist, and a wrong shape', async () => {
    const { service } = build();
    await expect(service.updateMany({ 'alerts.mass_balance_roles': [] }, admin)).rejects.toThrow(/choose at least one role/);
    await expect(service.updateMany({ 'alerts.mass_balance_roles': ['MD', 'WIZARD'] }, admin)).rejects.toThrow(/WIZARD is not a role in this system/);
    await expect(service.updateMany({ 'alerts.mass_balance_roles': 'MD' }, admin)).rejects.toThrow(/choose roles from the list/);
  });
  it('a list set back to the default stores nothing, whatever order it is in', async () => {
    const { service, rows } = build({ 'alerts.machine_anomaly_roles': JSON.stringify(['MD']) });
    await service.updateMany({ 'alerts.machine_anomaly_roles': ['CEO', 'MD', 'OPERATIONS_MANAGER'] }, admin);
    expect(rows.has('alerts.machine_anomaly_roles')).toBe(false);
  });
});

describe('SettingsService: resetting', () => {
  it('puts one setting back to its default and records it', async () => {
    const { service, audit } = build({ 'auth.lockout_minutes': '45' });
    const items = await service.resetOne('auth.lockout_minutes', admin);
    expect(items.find((i) => i.key === 'auth.lockout_minutes')).toMatchObject({ value: 15, isDefault: true });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'settings.reset', beforeValue: { 'auth.lockout_minutes': 45 } }));
  });
  it('says so for a setting that does not exist', async () => {
    await expect(build().service.resetOne('nope', admin)).rejects.toThrow(/is not a setting this system has/);
  });
});

describe('services that take the settings as an optional extra', () => {
  it('fall back to the built-in default when there is none', async () => {
    expect(await settingNumber(undefined, 'auth.lockout_minutes')).toBe(15);
    expect(await settingRoles(undefined, 'alerts.machine_anomaly_roles')).toEqual(['OPERATIONS_MANAGER', 'MD', 'CEO']);
  });
  it('use the administrator\'s value when there is one', async () => {
    const { service } = build({ 'auth.lockout_minutes': '60' });
    expect(await settingNumber(service, 'auth.lockout_minutes')).toBe(60);
  });
});
