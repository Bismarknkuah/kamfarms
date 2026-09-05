import { ScopeType } from '@prisma/client';

export interface ResolvedScope {
  scopeType: ScopeType;
  scopeId: string | null;
}

export interface ResolvedRole {
  roleId: string;
  roleCode: string;
  permissions: string[];
  scopes: ResolvedScope[];
}

/** Attached to req.user after JWT validation. Carries the full RBAC picture
 * so guards never need an extra DB round trip per request beyond the one
 * lookup done in the strategy. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  roles: ResolvedRole[];
  /** Flattened for fast permission checks. */
  permissionCodes: Set<string>;
}
