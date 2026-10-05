/**
 * Canonical permission code catalog for KAM-ROMS.
 * This is the single source of truth: the seed script loads exactly this
 * list into the `permissions` table, and @RequirePermission() references
 * these codes. New modules extend this list - never invent ad-hoc strings
 * in a controller.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',

  FARM_VIEW: 'farm.view',
  FARM_CREATE: 'farm.create',
  FARM_UPDATE: 'farm.update',
  FARM_DELETE: 'farm.delete',
  FARM_INVENTORY_VIEW: 'farm.inventory.view',
  FARM_EQUIPMENT_MANAGE: 'farm.equipment.manage',
  WAREHOUSE_EQUIPMENT_MANAGE: 'warehouse.equipment.manage',

  PADDY_CREATE: 'paddy.create',
  PADDY_SUBMIT: 'paddy.submit',
  PADDY_APPROVE: 'paddy.approve',
  PADDY_REJECT: 'paddy.reject',

  DELIVERY_CREATE: 'delivery.create',
  DELIVERY_APPROVE: 'delivery.approve',
  DELIVERY_REJECT: 'delivery.reject',
  SUPPLY_VIEW: 'supply.view',
  SUPPLY_REQUEST: 'supply.request',
  SUPPLY_FORWARD: 'supply.forward',
  SUPPLY_FULFIL: 'supply.fulfil',
  DELIVERY_VIEW: 'delivery.view',

  WAREHOUSE_VIEW: 'warehouse.view',
  WAREHOUSE_CREATE: 'warehouse.create',
  WAREHOUSE_UPDATE: 'warehouse.update',
  WAREHOUSE_DELETE: 'warehouse.delete',
  WAREHOUSE_INVENTORY_VIEW: 'warehouse.inventory.view',
  WAREHOUSE_RECEIVE: 'warehouse.receive',
  WAREHOUSE_TRANSFER: 'warehouse.transfer',
  TRACE_VIEW: 'trace.view',
  DISPATCH_TRACK: 'dispatch.track',
  RECEIPT_REVIEW: 'receipt.review',
  MILL_DISPATCH_VIEW: 'milldispatch.view',
  MILL_DISPATCH_REQUEST: 'milldispatch.request',
  MILL_DISPATCH_APPROVE: 'milldispatch.approve',
  MILL_DISPATCH_RECEIVE: 'milldispatch.receive',
  MILLING_MANAGE: 'milling.manage',
  ORGANIZATION_MANAGE: 'organization.manage',
  MASTERDATA_MANAGE: 'masterdata.manage',
  QUALITY_MANAGE: 'quality.manage',
  PACKAGING_CREATE: 'packaging.create',

  MILLING_VIEW: 'milling.view',
  INVENTORY_ADJUST: 'inventory.adjust',
  PRODUCTION_CREATE: 'production.create',
  PRODUCTION_APPROVE: 'production.approve',
  MACHINE_VIEW: 'machine.view',
  MACHINE_MANAGE: 'machine.manage',
  METER_CREATE: 'meter.create',

  SALES_CREATE: 'sales.create',
  SALES_APPROVE: 'sales.approve',
  SALES_FULFILL: 'sales.fulfill',
  SALES_VIEW: 'sales.view',
  SALES_RELEASE: 'sales.release',
  SALES_ASSIGN: 'sales.assign',
  CUSTOMER_MANAGE: 'customer.manage',

  PAYMENT_CREATE: 'payment.create',
  PAYMENT_VERIFY: 'payment.verify',
  FINANCE_VIEW: 'finance.view',
  FINANCE_APPROVE: 'finance.approve',
  FINANCE_APPROVE_DIRECTOR: 'finance.approve.director',
  SITE_MANAGE: 'site.manage',
  INSIGHTS_VIEW: 'insights.view',
  INVOICE_CREATE: 'invoice.create',
  EXPENSE_CREATE: 'expense.create',
  EXPENSE_VIEW: 'expense.view',

  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',

  AI_VIEW: 'ai.view',
  AI_USE: 'ai.use',

  MESSAGES_SEND: 'messages.send',
  MESSAGES_BROADCAST: 'messages.broadcast',

  TASKS_ASSIGN: 'tasks.assign',
  TASKS_COMPLETE: 'tasks.complete',

  USERS_MANAGE: 'users.manage',
  // A deliberately narrower permission than users.manage - a line
  // manager (Warehouse Supervisor, Operations Manager) creating,
  // editing, or deactivating their own direct subordinates, not the
  // system-wide account management users.manage grants. Enforcement
  // of exactly which role a holder of only this permission may touch
  // happens in UsersService itself, reusing the same TEAM_VISIBILITY
  // mapping that already scopes the team list view.
  TEAM_MANAGE: 'team.manage',
  // Re-introduced deliberately, this time with a real, working feature
  // behind it: notification sender identity (the email address and
  // phone number outgoing password-reset emails, SMS, and WhatsApp
  // messages are sent from). Previously removed from this catalog
  // entirely after being confirmed to gate nothing anywhere - this is
  // a genuinely new capability, not a revival of the old, dead one.
  SETTINGS_MANAGE: 'settings.manage',
  ROLES_MANAGE: 'roles.manage',
  PERMISSIONS_MANAGE: 'permissions.manage',

  AUDIT_VIEW: 'audit.view',
  BACKUP_MANAGE: 'backup.manage',

  RESET_REQUEST: 'reset.request',
  RESET_APPROVE: 'reset.approve',
  RESET_EXECUTE: 'reset.execute',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOG: { code: string; module: string; description: string }[] = [
  { code: PERMISSIONS.DASHBOARD_VIEW, module: 'dashboard', description: 'View dashboards' },
  { code: PERMISSIONS.FARM_VIEW, module: 'farm', description: 'View farms' },
  { code: PERMISSIONS.FARM_CREATE, module: 'farm', description: 'Create farms' },
  { code: PERMISSIONS.FARM_UPDATE, module: 'farm', description: 'Update farms' },
  { code: PERMISSIONS.FARM_DELETE, module: 'farm', description: 'Delete/deactivate farms' },
  { code: PERMISSIONS.FARM_INVENTORY_VIEW, module: 'farm', description: 'View farm inventory' },
  { code: PERMISSIONS.FARM_EQUIPMENT_MANAGE, module: 'farm', description: 'Add and update farm equipment/machinery status' },
  { code: PERMISSIONS.WAREHOUSE_EQUIPMENT_MANAGE, module: 'warehouse', description: 'Add and update warehouse equipment/machinery status' },
  { code: PERMISSIONS.PADDY_CREATE, module: 'paddy', description: 'Create paddy entries' },
  { code: PERMISSIONS.PADDY_SUBMIT, module: 'paddy', description: 'Submit paddy entries for approval' },
  { code: PERMISSIONS.PADDY_APPROVE, module: 'paddy', description: 'Approve paddy entries' },
  { code: PERMISSIONS.PADDY_REJECT, module: 'paddy', description: 'Reject paddy entries' },
  { code: PERMISSIONS.DELIVERY_CREATE, module: 'delivery', description: 'Create delivery orders/reports' },
  { code: PERMISSIONS.DELIVERY_APPROVE, module: 'delivery', description: 'Approve deliveries' },
  { code: PERMISSIONS.DELIVERY_REJECT, module: 'delivery', description: 'Reject deliveries' },
  { code: PERMISSIONS.SUPPLY_VIEW, module: 'supply', description: 'See paddy requests' },
  { code: PERMISSIONS.SUPPLY_REQUEST, module: 'supply', description: 'Ask for paddy' },
  { code: PERMISSIONS.SUPPLY_FORWARD, module: 'supply', description: 'Send a paddy request on' },
  { code: PERMISSIONS.SUPPLY_FULFIL, module: 'supply', description: 'Decide where paddy comes from' },
  { code: PERMISSIONS.DELIVERY_VIEW, module: 'delivery', description: 'View delivery orders and reports (read-only)' },
  { code: PERMISSIONS.WAREHOUSE_VIEW, module: 'warehouse', description: 'View warehouses' },
  { code: PERMISSIONS.WAREHOUSE_CREATE, module: 'warehouse', description: 'Create warehouses' },
  { code: PERMISSIONS.WAREHOUSE_UPDATE, module: 'warehouse', description: 'Update warehouses' },
  { code: PERMISSIONS.WAREHOUSE_DELETE, module: 'warehouse', description: 'Delete/deactivate warehouses' },
  { code: PERMISSIONS.WAREHOUSE_INVENTORY_VIEW, module: 'warehouse', description: 'View warehouse inventory' },
  { code: PERMISSIONS.WAREHOUSE_RECEIVE, module: 'warehouse', description: 'Record warehouse receipts' },
  { code: PERMISSIONS.WAREHOUSE_TRANSFER, module: 'warehouse', description: 'Approve warehouse transfers' },
  { code: PERMISSIONS.TRACE_VIEW, module: 'inventory', description: 'Trace a batch through its whole history' },
  { code: PERMISSIONS.DISPATCH_TRACK, module: 'delivery', description: 'Track dispatches: where each one is, who handled it and when' },
  { code: PERMISSIONS.RECEIPT_REVIEW, module: 'delivery', description: 'Review and approve the spoiled or broken bags a warehouse manager reports when counting a delivery in' },
  { code: PERMISSIONS.MILL_DISPATCH_VIEW, module: 'milling', description: 'See paddy sent to the milling center and finished products sent to the warehouse' },
  { code: PERMISSIONS.MILL_DISPATCH_REQUEST, module: 'milling', description: 'Ask to send paddy to the mill, or to send finished products to the warehouse' },
  { code: PERMISSIONS.MILL_DISPATCH_APPROVE, module: 'milling', description: 'Approve or refuse what is sent between a warehouse and its milling center' },
  { code: PERMISSIONS.MILL_DISPATCH_RECEIVE, module: 'milling', description: 'Count in what arrives from a warehouse or from the milling center' },
  { code: PERMISSIONS.MILLING_MANAGE, module: 'milling', description: 'Create/update milling centers' },
  { code: PERMISSIONS.ORGANIZATION_MANAGE, module: 'organization', description: 'Manage company and facility settings' },
  { code: PERMISSIONS.MASTERDATA_MANAGE, module: 'masterdata', description: 'Manage products, package sizes, paddy grades/types' },
  { code: PERMISSIONS.QUALITY_MANAGE, module: 'quality', description: 'Record quality inspections and release/quarantine batches' },
  { code: PERMISSIONS.PACKAGING_CREATE, module: 'packaging', description: 'Create packaging batches (bulk rice -> retail bags)' },
  { code: PERMISSIONS.MILLING_VIEW, module: 'milling', description: 'View milling data' },
  { code: PERMISSIONS.INVENTORY_ADJUST, module: 'inventory', description: 'Approve inventory correction requests' },
  { code: PERMISSIONS.PRODUCTION_CREATE, module: 'production', description: 'Create production records' },
  { code: PERMISSIONS.PRODUCTION_APPROVE, module: 'production', description: 'Approve production records' },
  { code: PERMISSIONS.MACHINE_VIEW, module: 'machine', description: 'View machines' },
  { code: PERMISSIONS.MACHINE_MANAGE, module: 'machine', description: 'Manage machines' },
  { code: PERMISSIONS.METER_CREATE, module: 'machine', description: 'Record meter readings' },
  { code: PERMISSIONS.SALES_CREATE, module: 'sales', description: 'Create sales orders' },
  { code: PERMISSIONS.SALES_APPROVE, module: 'sales', description: 'Approve sales orders' },
  { code: PERMISSIONS.SALES_FULFILL, module: 'sales', description: 'Fulfill (dispatch) approved sales orders' },
  { code: PERMISSIONS.SALES_VIEW, module: 'sales', description: 'View sales orders and customers (read-only)' },
  { code: PERMISSIONS.SALES_RELEASE, module: 'sales', description: 'Release a Finance-approved sales order to the Warehouse Supervisor for delivery' },
  { code: PERMISSIONS.SALES_ASSIGN, module: 'sales', description: 'Assign a released sales order to a warehouse' },
  { code: PERMISSIONS.CUSTOMER_MANAGE, module: 'sales', description: 'Manage customers' },
  { code: PERMISSIONS.PAYMENT_CREATE, module: 'finance', description: 'Record payments' },
  { code: PERMISSIONS.PAYMENT_VERIFY, module: 'finance', description: 'Verify payments' },
  { code: PERMISSIONS.FINANCE_VIEW, module: 'finance', description: 'View finance records' },
  { code: PERMISSIONS.FINANCE_APPROVE, module: 'finance', description: 'Approve finance actions' },
  { code: PERMISSIONS.FINANCE_APPROVE_DIRECTOR, module: 'finance', description: 'Approve an expense the Finance Director entered personally (nobody may approve their own entry)' },
  { code: PERMISSIONS.SITE_MANAGE, module: 'site', description: 'Edit the public homepage: text, locations and the rotating pictures and videos' },
  { code: PERMISSIONS.INSIGHTS_VIEW, module: 'insights', description: 'See the watchlist: where records look unusual against each place\'s own history' },
  { code: PERMISSIONS.INVOICE_CREATE, module: 'finance', description: 'Generate invoices from sales orders' },
  { code: PERMISSIONS.EXPENSE_CREATE, module: 'finance', description: 'Record expenses' },
  { code: PERMISSIONS.EXPENSE_VIEW, module: 'finance', description: 'View expenses without full financial visibility' },
  { code: PERMISSIONS.REPORTS_VIEW, module: 'reports', description: 'View reports' },
  { code: PERMISSIONS.REPORTS_EXPORT, module: 'reports', description: 'Export reports' },
  { code: PERMISSIONS.AI_VIEW, module: 'ai', description: 'View AI insights' },
  { code: PERMISSIONS.AI_USE, module: 'ai', description: 'Use AI assistant/predictions' },
  { code: PERMISSIONS.MESSAGES_SEND, module: 'messages', description: 'Send messages' },
  { code: PERMISSIONS.MESSAGES_BROADCAST, module: 'messages', description: 'Broadcast/announce' },
  { code: PERMISSIONS.TASKS_ASSIGN, module: 'tasks', description: 'Assign tasks' },
  { code: PERMISSIONS.TASKS_COMPLETE, module: 'tasks', description: 'Complete tasks' },
  { code: PERMISSIONS.USERS_MANAGE, module: 'admin', description: 'Manage users' },
  { code: PERMISSIONS.TEAM_MANAGE, module: 'admin', description: 'Manage direct subordinates - create, edit, and deactivate' },
  { code: PERMISSIONS.SETTINGS_MANAGE, module: 'admin', description: 'Manage notification sender identity - the email and phone outgoing messages are sent from' },
  { code: PERMISSIONS.ROLES_MANAGE, module: 'admin', description: 'Manage roles' },
  { code: PERMISSIONS.PERMISSIONS_MANAGE, module: 'admin', description: 'Manage permissions' },
  { code: PERMISSIONS.AUDIT_VIEW, module: 'admin', description: 'View audit logs' },
  { code: PERMISSIONS.BACKUP_MANAGE, module: 'admin', description: 'Manage backups' },
  { code: PERMISSIONS.RESET_REQUEST, module: 'admin', description: 'Request a system reset' },
  { code: PERMISSIONS.RESET_APPROVE, module: 'admin', description: 'Approve a system reset' },
  { code: PERMISSIONS.RESET_EXECUTE, module: 'admin', description: 'Execute an approved reset' },
];
