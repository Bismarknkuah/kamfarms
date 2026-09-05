import { MeResponse } from './api-client';

export interface NavItem {
  label: string;
  href: string;
  /** Lucide icon name (kebab-case), verified to exist in this project's
   * installed lucide-react version before use — not assumed from memory
   * of the library's naming, since icon names do change between
   * versions (e.g. check-square became square-check here). */
  icon: string;
  /** Plain-language description of what this page lets THIS person do —
   * shown on the Overview page as a real clickable action card, not a
   * raw permission code. Written from the perspective of "what would I
   * click this for", not "what module is this." */
  description: string;
  permission?: string | string[]; // undefined = every authenticated user; array = OR-matched
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: 'layout-dashboard', description: 'Your dashboard home.' },
  {
    label: 'My Office',
    href: '/office',
    icon: 'briefcase-business',
    description: 'Your primary task, ready to go — logging, submitting, or approving, without navigating around to find it.',
    permission: ['paddy.create', 'sales.create', 'payment.create', 'warehouse.receive', 'paddy.approve', 'sales.approve', 'payment.verify', 'production.approve', 'delivery.create', 'reset.approve', 'warehouse.transfer', 'inventory.adjust', 'farm.inventory.view', 'warehouse.inventory.view'],
  },
  {
    label: 'Trace',
    href: '/trace',
    icon: 'search',
    description: 'Enter a batch number and see its complete history — every transaction, forward and backward.',
    permission: ['audit.view', 'farm.inventory.view', 'warehouse.inventory.view', 'milling.view'],
  },
  {
    label: 'Inventory',
    href: '/inventory',
    icon: 'boxes',
    description: 'Every real stock balance across the pipeline — farms, warehouses, and milling, by grade and product.',
    permission: 'reports.view',
  },
  {
    label: 'Analytics',
    href: '/analytics',
    icon: 'bar-chart-3',
    description: 'Six-month trends and comparisons — sales vs. expenses, product performance, farm-by-farm intake.',
    permission: 'finance.view',
  },
  { label: 'Farms', href: '/farms', icon: 'sprout', description: 'See every farm, its location, and who manages it.', permission: 'farm.view' },
  {
    label: 'Expenses',
    href: '/expenses',
    icon: 'receipt',
    description: 'Log an expense against your farm or warehouse, or approve one awaiting your sign-off.',
    permission: ['expense.create', 'finance.approve'],
  },
  {
    label: 'Paddy Entries',
    href: '/paddy-entries',
    icon: 'wheat',
    description: 'Review and approve or reject paddy intake submitted by Farm Managers.',
    permission: ['paddy.approve', 'paddy.reject'],
  },
  {
    label: 'Deliveries',
    href: '/deliveries',
    icon: 'truck',
    description: 'Review delivery reports awaiting your approval — driver, vehicle, and cost details included.',
    permission: ['delivery.approve', 'delivery.reject', 'delivery.view'],
  },
  { label: 'Warehouses', href: '/warehouses', icon: 'warehouse', description: 'See every warehouse and its milling centers.', permission: 'warehouse.view' },
  {
    label: 'Shipments',
    href: '/shipments',
    icon: 'ship',
    description: 'Track paddy on its way in, and confirm what actually arrives.',
    permission: ['warehouse.inventory.view', 'warehouse.receive'],
  },
  {
    label: 'Sales',
    href: '/sales',
    icon: 'dollar-sign',
    description: 'Create an order, approve one waiting on you, or mark an approved order fulfilled.',
    permission: ['sales.create', 'sales.approve', 'sales.fulfill', 'sales.view'],
  },
  {
    label: 'Finance',
    href: '/finance',
    icon: 'landmark',
    description: 'Invoices, payments to verify, and who owes the company money.',
    permission: 'finance.view',
  },
  {
    label: 'Production',
    href: '/production',
    icon: 'factory',
    description: 'Milling records, recovery rates, and machine status.',
    permission: 'milling.view',
  },
  {
    label: 'Packaging',
    href: '/packaging',
    icon: 'package',
    description: 'Every batch of bulk rice packed into retail bags.',
    permission: ['warehouse.inventory.view', 'packaging.create'],
  },
  {
    label: 'Quality',
    href: '/quality',
    icon: 'flask-conical',
    description: 'Inspect a batch — moisture, grain quality, impurities — and release quarantined batches once cleared.',
    permission: ['quality.manage', 'milling.view'],
  },
  { label: 'Messages', href: '/messages', icon: 'message-square', description: 'Direct conversations with anyone in the company.' },
  {
    label: 'AI Assistant',
    href: '/assistant',
    icon: 'bot',
    description: 'Ask about stock, sales, or performance and get a real, sourced answer.',
    permission: 'ai.use',
  },
  { label: 'Tasks', href: '/tasks', icon: 'square-check', description: 'Things assigned to you, and marking them done.' },
  { label: 'Notifications', href: '/notifications', icon: 'bell', description: 'Alerts that need your attention.' },
  { label: 'Users', href: '/users', icon: 'users', description: 'Admin: every account. Supervisors: your team, and tasks to assign them.', permission: ['users.manage', 'tasks.assign'] },
  {
    label: 'Roles',
    href: '/roles',
    icon: 'shield',
    description: 'Every role and exactly what it can do — real access control, editable immediately.',
    permission: 'roles.manage',
  },
  {
    label: 'Organization',
    href: '/organization',
    icon: 'building-2',
    description: 'Company details and facilities — HQ, manufacturing sites, and contact information.',
    permission: 'organization.manage',
  },
  {
    label: 'Audit Log',
    href: '/audit-log',
    icon: 'shield',
    description: 'Every recorded action across the system — who did what, and when.',
    permission: 'audit.view',
  },
  {
    label: 'Admin',
    href: '/admin',
    icon: 'shield-alert',
    description: 'Backup status and system-reset requests — genuinely administrative operations, not general oversight.',
    permission: ['reset.request', 'reset.execute', 'backup.manage'],
  },
];

export function hasNavPermission(me: MeResponse, permission?: string | string[]): boolean {
  if (!permission) return true;
  const codes = Array.isArray(permission) ? permission : [permission];
  return codes.some((code) => me.permissions.includes(code));
}

/** Finds the single location a person is individually scoped to (a Farm
 * Manager's own farm, a Warehouse Manager's own warehouse) — as opposed
 * to a GLOBAL scope (Farm Supervisor, MD, etc.) which isn't tied to one
 * specific location at all. Used to auto-select "their" farm/warehouse
 * in forms instead of asking them to pick from a list of one, and to
 * scope an Overview page's inventory to just their own location. Returns
 * null for anyone without exactly this scope shape — a GLOBAL-scoped
 * person, or someone scoped to more than one location of that type. */
export function findSingleLocationScope(me: MeResponse, scopeType: 'FARM' | 'WAREHOUSE'): string | null {
  const matches = me.roles.flatMap((r) => r.scopes.filter((s) => s.scopeType === scopeType && s.scopeId));
  if (matches.length !== 1) return null;
  return matches[0].scopeId;
}

/** Roles allowed to see company-wide financial figures (sales,
 * receivables, expenses) on the Overview page. Deliberately an explicit
 * allowlist by role code, not the reports.view permission — every role
 * in the system holds reports.view (confirmed directly against the
 * seed), so gating on it never actually restricted anything. This is
 * the real gate: a Farm Manager, Warehouse Manager, or Operations
 * Officer has no legitimate reason to see the company's sales figures
 * on their dashboard, however broad their reports.view grant is for
 * other purposes (their own report exports, etc). */
export const FINANCIAL_VISIBILITY_ROLES = new Set(['SALES_OFFICER', 'FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'MD', 'CEO']);

export function hasFinancialVisibility(me: MeResponse): boolean {
  return me.roles.some((r) => FINANCIAL_VISIBILITY_ROLES.has(r.code));
}
