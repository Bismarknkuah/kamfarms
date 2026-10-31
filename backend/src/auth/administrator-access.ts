import { ScopeType } from '@prisma/client';
import { PERMISSION_CATALOG } from '../common/constants/permissions';
import { ResolvedRole } from './types/authenticated-user';

/**
 * The System Administrator is the one role that is never limited by a list.
 *
 * Every other role holds a chosen set of permissions. The Administrator holds ALL of them, and holds them
 * everywhere (GLOBAL scope), worked out here at sign-in from the full permission catalog rather than read from a
 * stored list. That means:
 *   - a permission added in a later release is available to the Administrator the moment that server starts, with
 *     no sync step in between that could leave them standing at a "you do not have permission" screen;
 *   - nobody can quietly narrow the Administrator by editing the role (the roles screen refuses it as well).
 *
 * Segregation of duties still holds, because those rules are checked per record, not per permission: nobody,
 * the Administrator included, can approve or reject a sales order or an expense they created themselves.
 */
export const ADMINISTRATOR_ROLE_CODE = 'ADMIN';

/**
 * What the Administrator does NOT do: the hands-on moving of stock. Loading, approving and receiving a dispatch belong to the farm, warehouse and
 * mill people who are accountable for the stock. The Administrator still sees and tracks every dispatch, asks for paddy, and decides HOW dispatch
 * works (the rules on the Settings page); the rest of the system is fully theirs.
 */
export const ADMIN_NEVER_DISPATCHES: readonly string[] = [
  'delivery.create', 'delivery.approve', 'delivery.reject', 'supply.forward', 'supply.fulfil',
  'milldispatch.request', 'milldispatch.approve', 'milldispatch.receive', 'receipt.review', 'sales.fulfill', 'warehouse.receive', 'warehouse.transfer',
];

export const EVERY_PERMISSION_CODE: readonly string[] = PERMISSION_CATALOG.map((p) => p.code);
/** What the Administrator actually holds: everything except the hands-on dispatch work. */
export const ADMIN_PERMISSION_CODES: readonly string[] = EVERY_PERMISSION_CODE.filter((c) => !ADMIN_NEVER_DISPATCHES.includes(c));

export function isAdministrator(roles: Pick<ResolvedRole, 'roleCode'>[]): boolean {
  return roles.some((r) => r.roleCode === ADMINISTRATOR_ROLE_CODE);
}

/** Returns the roles with the Administrator role widened to every permission and to every place. Other roles are untouched. */
export function grantAdministratorAccess(roles: ResolvedRole[]): ResolvedRole[] {
  return roles.map((role) => {
    if (role.roleCode !== ADMINISTRATOR_ROLE_CODE) return role;
    const everywhere = role.scopes.some((s) => s.scopeType === ('GLOBAL' as ScopeType));
    return {
      ...role,
      permissions: Array.from(new Set([...role.permissions.filter((c) => !ADMIN_NEVER_DISPATCHES.includes(c)), ...ADMIN_PERMISSION_CODES])),
      scopes: everywhere ? role.scopes : [...role.scopes, { scopeType: 'GLOBAL' as ScopeType, scopeId: null }],
    };
  });
}
