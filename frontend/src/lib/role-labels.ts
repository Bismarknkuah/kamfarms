/** Human names for role codes. The signed-in user only carries the code
 * (e.g. SALES_OFFICER), which is not something to show a person. */
const ROLE_NAMES: Record<string, string> = {
  ADMIN: 'System Administrator',
  MD: 'Managing Director',
  CEO: 'CEO',
  FARM_DIRECTOR: 'Farm Supervisor',
  FARM_MANAGER: 'Farm Manager',
  WAREHOUSE_SUPERVISOR: 'Warehouse Supervisor',
  WAREHOUSE_MANAGER: 'Warehouse Manager',
  OPERATIONS_MANAGER: 'Operations Manager',
  OPERATIONS_OFFICER: 'Operations Officer',
  SALES_OFFICER: 'Sales Officer',
  FINANCE_DIRECTOR: 'Finance Director',
  AUDITOR: 'Auditor',
};

export function roleLabel(code: string): string {
  return ROLE_NAMES[code] ?? code.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}
