import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { SettingsRegistryController } from '../settings-registry.controller';
import { SettingsService } from '../settings.service';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

describe('SettingsRegistryController', () => {
  let app: INestApplication;
  let api: string;
  const items = [{ key: 'auth.lockout_minutes', value: 15, isDefault: true }];
  const fake = { effective: jest.fn(async () => items), updateMany: jest.fn(async () => items), resetOne: jest.fn(async () => items) };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ controllers: [SettingsRegistryController], providers: [{ provide: SettingsService, useValue: fake }] }).compile();
    app = mod.createNestApplication();
    app.useGlobalInterceptors(new TransformInterceptor());
    app.setGlobalPrefix('api');
    await app.listen(0);
    api = (await app.getUrl()) + '/api';
  });
  afterAll(async () => { await app.close(); });

  it('lists the settings, grouped, in the normal envelope', async () => {
    const body = await (await fetch(`${api}/settings/registry`)).json();
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual(items);
    expect(body.data.groups.map((g: { id: string }) => g.id)).toEqual(expect.arrayContaining(['security', 'logistics', 'watchlist']));
  });
  it('passes the values to change straight through, and an empty request through as nothing to change', async () => {
    await fetch(`${api}/settings/registry`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ values: { 'auth.lockout_minutes': 30 } }) });
    expect(fake.updateMany).toHaveBeenLastCalledWith({ 'auth.lockout_minutes': 30 }, undefined);
    await fetch(`${api}/settings/registry`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
    expect(fake.updateMany).toHaveBeenLastCalledWith({}, undefined);
  });
  it('resets one setting by its key', async () => {
    await fetch(`${api}/settings/registry/auth.lockout_minutes`, { method: 'DELETE' });
    expect(fake.resetOne).toHaveBeenCalledWith('auth.lockout_minutes', undefined);
  });
  it('is for the System Administrator only, on every route', () => {
    const reflector = new Reflector();
    for (const m of ['list', 'update', 'reset'] as const) {
      expect(reflector.get(PERMISSION_KEY, SettingsRegistryController.prototype[m])).toBe('settings.manage');
      expect(reflector.get(IS_PUBLIC_KEY, SettingsRegistryController.prototype[m])).toBeUndefined();
    }
  });
});
