/**
 * Who may do what, as the screens decide it.
 *
 * The System Administrator may do everything. The server grants the Administrator every permission at sign-in
 * (backend/src/auth/administrator-access.ts); this mirrors that so the menus and pages agree with the server, even
 * for the moment after a new website is live and before the new server is. Everyone else is limited to the
 * permissions the server listed for them, exactly as before.
 */
export const ADMIN_ROLE_CODE = 'ADMIN';

type WithRoles = { roles: { code: string }[] };

export function isAdministrator(me: WithRoles | null | undefined): boolean {
  return !!me?.roles.some((r) => r.code === ADMIN_ROLE_CODE);
}

/** True when the person may use something that needs `permission` (any one of them, for a list). No permission needed means yes. */
export function canDo(me: (WithRoles & { permissions: string[] }) | null | undefined, permission?: string | string[]): boolean {
  if (!me) return false;
  if (!permission) return true;
  if (isAdministrator(me)) return true;
  const codes = Array.isArray(permission) ? permission : [permission];
  return codes.some((c) => me.permissions.includes(c));
}
