import { AuthenticatedUser } from '../auth/types/authenticated-user';

/**
 * Which part of the business a report belongs to. A person is offered, and may download, only the reports of the
 * areas their role covers: a Farm Supervisor gets farm reports and no warehouse report, a Warehouse Manager gets
 * warehouse reports and no finance report, and so on. This is checked on the server for every report download; the
 * Reports page only mirrors it.
 */
export type ReportArea = 'farm' | 'warehouse' | 'milling' | 'sales' | 'finance' | 'oversight' | 'admin';

export const ALL_AREAS: ReportArea[] = ['farm', 'warehouse', 'milling', 'sales', 'finance', 'oversight', 'admin'];

/** The areas each built-in role covers. 'oversight' means company-wide reading across areas (stock everywhere, the watchlist, the audit trail): top management and the Auditor only. */
export const ROLE_AREAS: Record<string, ReportArea[]> = {
  ADMIN: ['admin', 'farm', 'warehouse', 'milling'],
  MD: ALL_AREAS,
  CEO: ALL_AREAS,
  AUDITOR: ALL_AREAS,
  FARM_DIRECTOR: ['farm'],
  FARM_MANAGER: ['farm'],
  WAREHOUSE_SUPERVISOR: ['warehouse'],
  WAREHOUSE_MANAGER: ['warehouse'],
  OPERATIONS_MANAGER: ['milling'],
  OPERATIONS_OFFICER: ['milling'],
  SALES_OFFICER: ['sales'],
  FINANCE_DIRECTOR: ['finance', 'sales'],
  FINANCE_OFFICER: ['finance', 'sales'],
};

/** For a custom role (one the Administrator made), the area follows the kind of permission it holds. */
const PERMISSION_PREFIX: [string, ReportArea][] = [
  ['farm.', 'farm'], ['paddy.', 'farm'],
  ['warehouse.', 'warehouse'],
  ['milling.', 'milling'], ['production.', 'milling'], ['machine.', 'milling'], ['meter.', 'milling'],
  ['sales.', 'sales'], ['customer.', 'sales'],
  ['finance.', 'finance'], ['payment.', 'finance'], ['expense.', 'finance'],
  ['users.', 'admin'], ['audit.', 'admin'],
  ['insights.', 'oversight'],
];

export function reportAreas(actor: AuthenticatedUser): Set<ReportArea> {
  const out = new Set<ReportArea>();
  for (const role of actor.roles ?? []) {
    const known = ROLE_AREAS[role.roleCode];
    if (known) { known.forEach((a) => out.add(a)); continue; }
    for (const p of role.permissions ?? []) for (const [prefix, area] of PERMISSION_PREFIX) if (p.startsWith(prefix)) out.add(area);
  }
  return out;
}

/** True when the person covers at least one of the areas. */
export function coversArea(actor: AuthenticatedUser, areas: ReportArea[]): boolean {
  const mine = reportAreas(actor);
  return areas.some((a) => mine.has(a));
}
