import { AuthenticatedUser } from '../auth/types/authenticated-user';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'System Administrator',
  MD: 'Managing Director',
  CEO: 'CEO',
  FINANCE_DIRECTOR: 'Finance Director',
  SALES_OFFICER: 'Sales Officer',
  WAREHOUSE_SUPERVISOR: 'Warehouse Supervisor',
  WAREHOUSE_MANAGER: 'Warehouse Manager',
};

export function roleLabel(code?: string | null): string | null {
  if (!code) return null;
  return ROLE_LABELS[code] ?? code.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

/** Who did a step, as it should read in the activity trail: name and role, kept as written. */
export function actorSnapshot(actor: AuthenticatedUser) {
  const name = `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim();
  const codes = (actor.roles ?? []).map((r) => r.roleCode);
  const primary = codes.includes('ADMIN') ? 'ADMIN' : codes[0];
  return { actorId: actor.id, actorName: name || actor.email || 'Unknown', actorRole: roleLabel(primary) };
}
