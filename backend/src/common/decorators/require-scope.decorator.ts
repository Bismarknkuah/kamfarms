import { SetMetadata } from '@nestjs/common';
import { ScopeType } from '@prisma/client';

export const SCOPE_KEY = 'requiredScope';

export interface ScopeRequirement {
  /** Which scope type this endpoint operates under. */
  scopeType: ScopeType;
  /** Name of the route param carrying the target entity id, e.g. 'farmId'. */
  paramName: string;
}

/**
 * Marks an endpoint as requiring the caller to hold a matching scope grant
 * (or GLOBAL) for the target entity identified by `paramName`. Enforced by
 * ScopeGuard, always evaluated after PermissionGuard.
 */
export const RequireScope = (scopeType: ScopeType, paramName: string) =>
  SetMetadata(SCOPE_KEY, { scopeType, paramName } as ScopeRequirement);
