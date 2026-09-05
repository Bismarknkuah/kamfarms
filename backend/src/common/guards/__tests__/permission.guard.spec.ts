import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from '../permission.guard';
import { AuthenticatedUser } from '../../../auth/types/authenticated-user';

function makeContext(user: Partial<AuthenticatedUser> | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  it('allows the request through when no @RequirePermission is set on the route', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('rejects a caller whose permission set does not include the required code', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue('paddy.approve') } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    const user: Partial<AuthenticatedUser> = { permissionCodes: new Set(['paddy.create']) };
    expect(() => guard.canActivate(makeContext(user))).toThrow(ForbiddenException);
  });

  it('allows a caller whose permission set includes the required code', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue('paddy.approve') } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    const user: Partial<AuthenticatedUser> = { permissionCodes: new Set(['paddy.create', 'paddy.approve']) };
    expect(guard.canActivate(makeContext(user))).toBe(true);
  });

  it('rejects when there is no authenticated user at all', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue('paddy.approve') } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it('allows a caller who holds only the second of several OR-matched codes — the real bug this fixed: Finance Director holds reset.approve but never reset.request', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['reset.request', 'reset.approve', 'reset.execute']),
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    const user: Partial<AuthenticatedUser> = { permissionCodes: new Set(['reset.approve']) };
    expect(guard.canActivate(makeContext(user))).toBe(true);
  });

  it('rejects a caller who holds none of several OR-matched codes', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['reset.request', 'reset.approve', 'reset.execute']),
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    const user: Partial<AuthenticatedUser> = { permissionCodes: new Set(['farm.view']) };
    expect(() => guard.canActivate(makeContext(user))).toThrow(ForbiddenException);
  });
});
