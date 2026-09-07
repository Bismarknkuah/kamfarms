import { MeResponse } from './api-client';

export interface NavItem {
  label: string;
  href: string;
  /** Lucide icon name (kebab-case), verified to exist in this project's
   * installed lucide-react version before use - not assumed from memory
   * of the library's naming, since icon names do change between
   * versions (e.g. check-square became square-check here). */
  icon: string;
  /** Plain-language description of what this page lets THIS person do  - 
   * shown on the Overview page as a real clickable action card, not a
   * raw permission code. Written from the perspective of "what would I
   * click this for", not "what module is this." */
  description: string;
  permission?: string | string[]; // undefined = every authenticated user; array = OR-matched
  /** Hides this item for specific role codes even if they'd otherwise
   * match on permission - for a role that holds the underlying
   * permission but should see a more direct, single-purpose nav entry
   * instead (e.g. Farm Manager gets dedicated "Log paddy intake" /
   * "Dispatch" / "Request a stock correction" entries rather than the
   * combined My Office page other roles still use). */
  hideForRoles?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: 'layout-dashboard', description: 'Your dashboard home.' },
  {
    label: 'My Office',
    href: '/office',
    icon: 'briefcase-business',
    description: 'Your primary task, ready to go - logging, submitting, or approving, without navigating around to find it.',
    permission: ['paddy.create', 'sales.create', 'payment.create', 'warehouse.receive', 'paddy.approve', 'sales.approve', 'payment.verify', 'production.approve', 'delivery.create', 'reset.approve', 'warehouse.transfer', 'inventory.adjust', 'farm.inventory.view', 'warehouse.inventory.view'],
    // warehouse.receive stays listed even though Warehouse Manager
    // (its only holder) is now hidden below - Auditor also holds
    // warehouse.inventory.view and still needs this page for other
    // sections it contains.
    // MD/CEO added to hideForRoles - confirmed directly what this page
    // actually renders for them given their current permissions (no
    // sales.approve/finance.approve anymore): only a reset-approval
    // queue and a stock-correction-request action, neither of which is
    // this page's intended "your primary task" purpose for top
    // management. Reset approval now lives on their own dashboard
    // instead, where it's actually visible without hunting for it.
    // Auditor added for the same underlying reason, found during a
    // full role-by-role audit: Auditor holds farm.inventory.view and
    // warehouse.inventory.view purely for its read-everything mandate,
    // not to actually request stock corrections - a read-only role
    // reaching an action page it should never use.
    hideForRoles: ['FARM_MANAGER', 'FARM_DIRECTOR', 'WAREHOUSE_MANAGER', 'MD', 'CEO', 'AUDITOR'],
  },
  {
    label: 'Warehouse requests',
    href: '/warehouse-requests',
    icon: 'inbox',
    description: 'Decide which farm(s) can meet a warehouse’s request, then assign the dispatch task - the farm manager reviews it and creates the actual order.',
    permission: 'delivery.approve',
  },
  {
    label: 'Log paddy intake',
    href: '/log-paddy-intake',
    icon: 'wheat',
    description: 'Your primary task - logged here goes straight to your Farm Supervisor for approval.',
    permission: 'paddy.create',
  },
  {
    label: 'Dispatch',
    href: '/dispatch-quick',
    icon: 'truck',
    description: 'Order a farm to dispatch paddy to a warehouse, then submit the delivery report once it’s on its way.',
    permission: 'delivery.create',
    hideForRoles: ['FARM_DIRECTOR'],
  },
  {
    label: 'Request a stock correction',
    href: '/stock-correction',
    icon: 'clipboard-edit',
    description: 'Physical count doesn’t match the system? Request a correction - it only takes effect once your supervisor approves it.',
    permission: 'farm.inventory.view',
    // MD/CEO hold farm.inventory.view for broad visibility reasons,
    // not to personally request corrections - a confirmed, unintended
    // side effect of that grant found during a dashboard audit.
    // Auditor holds both farm.inventory.view and warehouse.inventory.view
    // for the same read-only reason - same fix applies.
    hideForRoles: ['MD', 'CEO', 'AUDITOR'],
  },
  {
    label: 'Trace',
    href: '/trace',
    icon: 'search',
    description: 'Enter a batch number and see its complete history - every transaction, forward and backward.',
    permission: ['audit.view', 'farm.inventory.view', 'warehouse.inventory.view', 'milling.view', 'sales.create'],
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: 'file-down',
    description: 'Download exactly the data your role covers - farm, warehouse, sales, finance, or inventory - as CSV, Excel, or PDF.',
    permission: 'reports.export',
  },
  {
    label: 'Inventory',
    href: '/inventory',
    icon: 'boxes',
    description: 'Every real stock balance across the pipeline - farms, warehouses, and milling, by grade and product.',
    permission: 'reports.view',
    // Sales Officer's own "available to sell" figure lives on their
    // dashboard instead, scoped to just packaged rice - the whole
    // system's farm/warehouse/milling pipeline isn't their jurisdiction,
    // even though reports.view (broadly held) would otherwise let them
    // reach this full page.
    hideForRoles: ['SALES_OFFICER'],
  },
  {
    label: 'Analytics',
    href: '/analytics',
    icon: 'bar-chart-3',
    description: 'Six-month trends and comparisons - sales vs. expenses, product performance, farm-by-farm intake.',
    permission: 'finance.view',
  },
  { label: 'Farms', href: '/farms', icon: 'sprout', description: 'See every farm, its location, and who manages it.', permission: 'farm.view' },
  {
    label: 'Expenses',
    href: '/expenses',
    icon: 'receipt',
    description: 'Log an expense against your farm or warehouse, or approve one awaiting your sign-off.',
    permission: ['expense.create', 'finance.approve', 'expense.view'],
  },
  {
    label: 'Paddy Entries',
    href: '/paddy-entries',
    icon: 'wheat',
    description: 'Review and approve or reject paddy intake submitted by Farm Managers.',
    permission: ['paddy.approve', 'paddy.reject'],
  },
  {
    label: 'Dispatch',
    href: '/deliveries',
    icon: 'truck',
    description: 'Review dispatch reports awaiting your approval - driver, vehicle, and cost details included.',
    permission: ['delivery.approve', 'delivery.reject', 'delivery.view'],
  },
  { label: 'Warehouses', href: '/warehouses', icon: 'warehouse', description: 'See every warehouse and its milling centers.', permission: 'warehouse.view', hideForRoles: ['WAREHOUSE_MANAGER'] },
  {
    label: 'Shipments',
    href: '/shipments',
    icon: 'ship',
    description: 'Track paddy on its way in, and confirm what actually arrives.',
    permission: ['warehouse.inventory.view', 'warehouse.receive', 'delivery.create', 'delivery.approve'],
  },
  {
    label: 'Sales',
    href: '/sales',
    icon: 'dollar-sign',
    description: 'Create an order, approve one waiting on you, or mark an approved order fulfilled.',
    permission: ['sales.create', 'sales.approve', 'sales.fulfill', 'sales.view'],
    // Warehouse Manager holds sales.fulfill (marking an approved order
    // fulfilled once the goods physically go out) - a real, confirmed
    // bug found during a full audit: this nav item was hidden for them
    // entirely, meaning that permission had no reachable UI at all.
    // The page itself already gates create/approve/fulfill separately
    // by exact permission, so unhiding this is the correct, minimal
    // fix - a Warehouse Manager visiting sees only the fulfill action
    // on orders that are ready for it, nothing they can't do.
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
    description: 'Inspect a batch - moisture, grain quality, impurities - and release quarantined batches once cleared.',
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
    label: 'Master Data',
    href: '/master-data',
    icon: 'database',
    description: 'Products, packaging sizes, and paddy grades/types - the real reference data every dropdown across the system pulls from.',
    // audit.view added deliberately - the same pattern used for
    // Organization: the backend's own read access here is already
    // broader than masterdata.manage (confirmed against
    // master-data.controller.ts, GET is dashboard.view), so MD/CEO
    // reusing a permission they already hold for unrelated reasons
    // grants read-only visibility without touching edit access at
    // all - the page's own canManage check still gates every write
    // action strictly to masterdata.manage.
    permission: ['masterdata.manage', 'audit.view'],
  },
  {
    label: 'Roles',
    href: '/roles',
    icon: 'shield',
    description: 'Every role and exactly what it can do - real access control, editable immediately.',
    permission: 'roles.manage',
  },
  {
    label: 'Organization',
    href: '/organization',
    icon: 'building-2',
    description: 'Company details and facilities - HQ, manufacturing sites, and contact information.',
    // audit.view added deliberately - confirmed directly that the
    // backend's own GET endpoints here are already gated by
    // dashboard.view (everyone), with edit access separately checked
    // per-action against organization.manage. MD/CEO could not
    // previously even view this page at all, despite the backend
    // already supporting exactly that. audit.view is a permission
    // they already hold for unrelated reasons, reused here only to
    // grant read access - they still cannot edit anything, since the
    // page's own canEdit check is untouched.
    permission: ['organization.manage', 'audit.view'],
  },
  {
    label: 'Audit Log',
    href: '/audit-log',
    icon: 'shield',
    description: 'Every recorded action across the system - who did what, and when.',
    permission: 'audit.view',
  },
  {
    label: 'Admin',
    href: '/admin',
    icon: 'shield-alert',
    description: 'Backup status and system-reset requests - genuinely administrative operations, not general oversight.',
    permission: ['reset.request', 'reset.execute', 'backup.manage'],
  },
];

export function hasNavPermission(me: MeResponse, permission?: string | string[]): boolean {
  if (!permission) return true;
  const codes = Array.isArray(permission) ? permission : [permission];
  return codes.some((code) => me.permissions.includes(code));
}

/** Finds the single location a person is individually scoped to (a Farm
 * Manager's own farm, a Warehouse Manager's own warehouse) - as opposed
 * to a GLOBAL scope (Farm Supervisor, MD, etc.) which isn't tied to one
 * specific location at all. Used to auto-select "their" farm/warehouse
 * in forms instead of asking them to pick from a list of one, and to
 * scope an Overview page's inventory to just their own location. Returns
 * null for anyone without exactly this scope shape - a GLOBAL-scoped
 * person, or someone scoped to more than one location of that type. */
export function findSingleLocationScope(me: MeResponse, scopeType: 'FARM' | 'WAREHOUSE'): string | null {
  const matches = me.roles.flatMap((r) => r.scopes.filter((s) => s.scopeType === scopeType && s.scopeId));
  if (matches.length !== 1) return null;
  return matches[0].scopeId;
}

/** Roles allowed to see company-wide financial figures (sales,
 * receivables, expenses) on the Overview page. Deliberately an explicit
 * allowlist by role code, not the reports.view permission - every role
 * in the system holds reports.view (confirmed directly against the
 * seed), so gating on it never actually restricted anything. This is
 * the real gate: a Farm Manager, Warehouse Manager, or Operations
 * Officer has no legitimate reason to see the company's sales figures
 * on their dashboard, however broad their reports.view grant is for
 * other purposes (their own report exports, etc). Auditor is included
 * here (added after a full role audit) because they hold finance.view
 * directly as part of their explicit read-everything mandate - the
 * earlier omission meant an Auditor could reach the Finance and
 * Analytics pages directly by URL but never saw the same figures
 * summarized on their own dashboard, an inconsistency with no
 * legitimate reason behind it. */
export const FINANCIAL_VISIBILITY_ROLES = new Set(['SALES_OFFICER', 'FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'MD', 'CEO', 'AUDITOR']);

export function hasFinancialVisibility(me: MeResponse): boolean {
  return me.roles.some((r) => FINANCIAL_VISIBILITY_ROLES.has(r.code));
}
