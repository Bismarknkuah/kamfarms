import { ForbiddenException } from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

/**
 * Manual scope check for cases ScopeGuard can't cover — e.g. a POST body
 * carrying `farmId` rather than a route param. GLOBAL scope on any role
 * always passes, mirroring ScopeGuard's own rule.
 */
export function assertScope(actor: AuthenticatedUser, scopeType: ScopeType, targetId: string, subject = 'this resource') {
  const allScopes = actor.roles.flatMap((r) => r.scopes);
  const hasGlobal = allScopes.some((s) => s.scopeType === 'GLOBAL');
  if (hasGlobal) return;

  const hasMatch = allScopes.some((s) => s.scopeType === scopeType && s.scopeId === targetId);
  if (!hasMatch) {
    throw new ForbiddenException({
      message: `You are not authorized for ${subject}.`,
      errorCode: 'SCOPE_DENIED',
    });
  }
}

/** Returns the set of location ids the actor holds a direct (non-GLOBAL)
 * scope grant for, of the given type. Used to auto-restrict list queries
 * for users without a GLOBAL scope, instead of requiring every caller to
 * pass an explicit filter. */
export function scopedLocationIds(actor: AuthenticatedUser, scopeType: ScopeType): { isGlobal: boolean; ids: string[] } {
  const allScopes = actor.roles.flatMap((r) => r.scopes);
  const isGlobal = allScopes.some((s) => s.scopeType === 'GLOBAL');
  const ids = allScopes.filter((s) => s.scopeType === scopeType && s.scopeId).map((s) => s.scopeId as string);
  return { isGlobal, ids };
}
