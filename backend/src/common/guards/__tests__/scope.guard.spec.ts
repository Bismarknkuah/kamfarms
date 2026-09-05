import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ScopeGuard } from '../scope.guard';
import { AuthenticatedUser } from '../../../auth/types/authenticated-user';
import { ScopeRequirement } from '../../decorators/require-scope.decorator';

function makeContext(user: Partial<AuthenticatedUser> | undefined, params: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('ScopeGuard', () => {
  const requirement: ScopeRequirement = { scopeType: 'FARM', paramName: 'farmId' };

  it('passes through when the route has no @RequireScope', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new ScopeGuard(reflector);
    expect(guard.canActivate(makeContext(undefined, {}))).toBe(true);
  });

  it('blocks a Farm Manager scoped to Farm A from acting on Farm B', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requirement) } as unknown as Reflector;
    const guard = new ScopeGuard(reflector);
    const user: Partial<AuthenticatedUser> = {
      roles: [{ roleId: 'r1', roleCode: 'FARM_MANAGER', permissions: [], scopes: [{ scopeType: 'FARM', scopeId: 'farm-a-id' }] }],
    };
    expect(() => guard.canActivate(makeContext(user, { farmId: 'farm-b-id' }))).toThrow(ForbiddenException);
  });

  it('allows a Farm Manager to act on their own assigned farm', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requirement) } as unknown as Reflector;
    const guard = new ScopeGuard(reflector);
    const user: Partial<AuthenticatedUser> = {
      roles: [{ roleId: 'r1', roleCode: 'FARM_MANAGER', permissions: [], scopes: [{ scopeType: 'FARM', scopeId: 'farm-a-id' }] }],
    };
    expect(guard.canActivate(makeContext(user, { farmId: 'farm-a-id' }))).toBe(true);
  });

  it('allows a GLOBAL-scoped role (e.g. Farm Director) to act on any farm', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requirement) } as unknown as Reflector;
    const guard = new ScopeGuard(reflector);
    const user: Partial<AuthenticatedUser> = {
      roles: [{ roleId: 'r2', roleCode: 'FARM_DIRECTOR', permissions: [], scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }],
    };
    expect(guard.canActivate(makeContext(user, { farmId: 'any-farm-id' }))).toBe(true);
  });
});
