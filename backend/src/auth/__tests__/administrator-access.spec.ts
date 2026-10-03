import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS, PERMISSION_CATALOG } from '../../common/constants/permissions';
import { ADMINISTRATOR_ROLE_CODE, EVERY_PERMISSION_CODE, grantAdministratorAccess, isAdministrator } from '../administrator-access';
import { ResolvedRole } from '../types/authenticated-user';

const role = (roleCode: string, permissions: string[] = [], scopes: ResolvedRole['scopes'] = []): ResolvedRole => ({ roleId: `id-${roleCode}`, roleCode, permissions, scopes });

describe('grantAdministratorAccess', () => {
  it('gives the System Administrator every permission in the catalog, even from an empty stored list', () => {
    const [admin] = grantAdministratorAccess([role('ADMIN')]);
    expect(admin.permissions.sort()).toEqual([...EVERY_PERMISSION_CODE].sort());
    expect(admin.permissions.length).toBe(PERMISSION_CATALOG.length);
  });

  it('includes the permissions that were missing in production: the homepage editor and the watchlist', () => {
    const [admin] = grantAdministratorAccess([role('ADMIN', ['users.manage'])]);
    for (const code of ['site.manage', 'insights.view', 'settings.manage', 'sales.approve', 'finance.approve', 'delivery.create']) {
      expect(admin.permissions).toContain(code);
    }
  });

  it('keeps anything the stored role already had, without listing it twice', () => {
    const [admin] = grantAdministratorAccess([role('ADMIN', ['users.manage', 'a.custom.permission'])]);
    expect(admin.permissions).toContain('a.custom.permission');
    expect(admin.permissions.filter((p) => p === 'users.manage')).toHaveLength(1);
  });

  it('works everywhere: adds the GLOBAL scope when the Administrator was only given a place', () => {
    const [admin] = grantAdministratorAccess([role('ADMIN', [], [{ scopeType: 'FARM' as any, scopeId: 'farm-a' }])]);
    expect(admin.scopes).toEqual([{ scopeType: 'FARM', scopeId: 'farm-a' }, { scopeType: 'GLOBAL', scopeId: null }]);
  });

  it('does not add a second GLOBAL scope when there already is one', () => {
    const [admin] = grantAdministratorAccess([role('ADMIN', [], [{ scopeType: 'GLOBAL' as any, scopeId: null }])]);
    expect(admin.scopes).toHaveLength(1);
  });

  it('never widens any other role: a Managing Director, Finance Director or Auditor is returned untouched', () => {
    for (const code of ['MD', 'CEO', 'FINANCE_DIRECTOR', 'AUDITOR', 'FARM_MANAGER', 'SALES_OFFICER']) {
      const original = role(code, ['reports.view']);
      const [out] = grantAdministratorAccess([original]);
      expect(out).toBe(original);
      expect(out.permissions).toEqual(['reports.view']);
    }
  });

  it('widens only the Administrator role for someone who holds several roles', () => {
    const farm = role('FARM_MANAGER', ['farm.view']);
    const [admin, manager] = grantAdministratorAccess([role('ADMIN'), farm]);
    expect(admin.permissions.length).toBe(PERMISSION_CATALOG.length);
    expect(manager).toBe(farm);
  });

  it('knows who the Administrator is', () => {
    expect(isAdministrator([role('MD'), role('ADMIN')])).toBe(true);
    expect(isAdministrator([role('MD')])).toBe(false);
    expect(ADMINISTRATOR_ROLE_CODE).toBe('ADMIN');
  });
});

describe('JwtStrategy: the Administrator is never limited by a stored list', () => {
  const user = (roleCode: string, stored: string[], scopes: { scopeType: string; scopeId: string | null }[] = []) => ({
    id: 'u1', email: 'x@kam.local', firstName: 'X', lastName: 'Y', status: 'ACTIVE', deletedAt: null, mustChangePassword: false,
    roles: [{ roleId: `r-${roleCode}`, role: { code: roleCode, permissions: stored.map((code) => ({ permission: { code } })) }, scopes }],
  });
  const strategy = (u: unknown) => new JwtStrategy({ get: (_k: string, f?: string) => f } as unknown as ConfigService, { user: { findUnique: jest.fn().mockResolvedValue(u) } } as any);

  it('an Administrator whose database role is missing site.manage still holds it (the bug in the screenshot)', async () => {
    const out = await strategy(user('ADMIN', ['users.manage', 'settings.manage'], [{ scopeType: 'GLOBAL', scopeId: null }])).validate({ sub: 'u1' } as any);
    expect(out.permissionCodes.has('site.manage')).toBe(true);
    expect(out.permissionCodes.size).toBe(PERMISSION_CATALOG.length);
  });

  it('a Managing Director whose database role lacks site.manage does not get it', async () => {
    const out = await strategy(user('MD', ['reports.view'])).validate({ sub: 'u1' } as any);
    expect(out.permissionCodes.has('site.manage')).toBe(false);
    expect(Array.from(out.permissionCodes)).toEqual(['reports.view']);
  });

  it('the permission guard lets the Administrator through every route and still refuses everyone else', async () => {
    const adminUser = await strategy(user('ADMIN', [])).validate({ sub: 'u1' } as any);
    const mdUser = await strategy(user('MD', ['reports.view'])).validate({ sub: 'u1' } as any);
    const guard = (u: unknown, required: string | string[]) => {
      const reflector = { getAllAndOverride: (key: string) => (key === PERMISSION_KEY ? required : undefined) } as unknown as Reflector;
      const ctx = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => ({ user: u }) }) } as unknown as ExecutionContext;
      return () => new PermissionGuard(reflector).canActivate(ctx);
    };
    for (const code of EVERY_PERMISSION_CODE) expect(guard(adminUser, code)()).toBe(true);
    expect(guard(mdUser, 'site.manage')).toThrow(ForbiddenException);
  });
});

// If a route or a service asks for a permission that is not in the catalog, nobody can ever hold it, the
// Administrator included. This is the check that keeps "full access" true when someone adds a permission later.
describe('every permission the code asks for exists in the catalog', () => {
  const root = path.resolve(__dirname, '../..');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : walk(p);
      return e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') && !e.name.endsWith('.d.ts') ? [p] : [];
    });
  const catalog = new Set(EVERY_PERMISSION_CODE);

  it('every value in PERMISSIONS is in the catalog, so the database gets a row for it', () => {
    const missing = Object.entries(PERMISSIONS).filter(([, code]) => !catalog.has(code as string));
    expect(missing).toEqual([]);
  });

  it('every permission named by a route decorator or a permission check is in the catalog', () => {
    const asked = new Map<string, string>();
    for (const file of walk(root)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/(?:RequirePermission|permissionCodes\.has|hasPermission)\(([^)]*)\)/g)) {
        for (const lit of m[1].matchAll(/['"]([a-z]+(?:\.[a-z_]+)+)['"]/g)) asked.set(lit[1], path.relative(root, file));
        for (const ref of m[1].matchAll(/PERMISSIONS\.([A-Z0-9_]+)/g)) {
          const code = (PERMISSIONS as Record<string, string>)[ref[1]];
          asked.set(code ?? `PERMISSIONS.${ref[1]}`, path.relative(root, file));
        }
      }
    }
    expect(asked.size).toBeGreaterThan(30); // the scan is really finding them
    const unknown = [...asked].filter(([code]) => !catalog.has(code)).map(([code, file]) => `${code} (${file})`);
    expect(unknown).toEqual([]);
  });

  it('the seed and the start-up sync both define the Administrator as the whole catalog', () => {
    for (const f of ['prisma/seed.ts', 'prisma/sync-permissions.ts']) {
      const text = fs.readFileSync(path.resolve(__dirname, '../../../..', f), 'utf8');
      const block = text.slice(text.indexOf("code: 'ADMIN'"), text.indexOf("code: 'MD'"));
      expect(block).toContain('permissionCodes: PERMISSION_CATALOG.map((p) => p.code)');
    }
  });
});
