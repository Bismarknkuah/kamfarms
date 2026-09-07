/* eslint-disable no-console */
// Split out of seed.ts deliberately: this file contains only the
// role/permission sync, which is fully idempotent (upsert, or
// delete-then-recreate for the role-permission join table) - safe to
// run on every single deploy without risk of duplicating data. The
// rest of seed.ts (demo users, farms, sales orders, messages) uses
// plain .create() calls in several places and would duplicate that
// data on every restart, so it stays a manual, one-time step.
//
// ROLE_DEFINITIONS below is copied verbatim from seed.ts (via a
// programmatic extraction, not manual retyping) every time either
// file changes - an earlier version of this file reconstructed the
// role list from memory and produced a dangerously incomplete result,
// caught only by actually counting entries in the source file.
import { PrismaClient } from '@prisma/client';
import { PERMISSION_CATALOG } from '../backend/dist/common/constants/permissions';

const prisma = new PrismaClient();

const ROLE_DEFINITIONS: { code: string; name: string; permissionCodes: string[] }[] = [
  {
    code: 'ADMIN',
    name: 'System Administrator',
    // settings.manage removed, then reintroduced here with a real
    // capability behind it this time: configuring the notification
    // sender identity (email/phone outgoing messages come from) - the
    // original grant gated nothing anywhere in the backend at all.
    // masterdata.manage now has a real, working page behind it too
    // (Master Data) - previously granted with no UI to actually use
    // it at all. messages.send added - a real, confirmed gap found
    // during a full cross-role audit: Admin could see the Messages
    // nav item (it has no permission gate at all) but could never
    // actually send anything, only ever receive - every other role
    // except Auditor already held this.
    permissionCodes: [
      'dashboard.view', 'users.manage', 'roles.manage', 'permissions.manage', 'messages.send', 'settings.manage',
      'audit.view', 'backup.manage', 'reset.request', 'reset.execute', 'reports.view', 'reports.export',
      'farm.view', 'farm.create', 'farm.update', 'farm.delete',
      'warehouse.view', 'warehouse.create', 'warehouse.update', 'warehouse.delete',
      'milling.view', 'milling.manage', 'organization.manage', 'masterdata.manage',
      'machine.view', 'machine.manage',
    ],
  },
  {
    code: 'MD',
    name: 'Managing Director',
    // sales.approve and finance.approve deliberately removed - a real,
    // explicit workflow change: an order or expense reaching the
    // Managing Director is now submitted to the Finance Director for
    // actual clearance, not approved by the Managing Director
    // directly. sales.view and expense.view added specifically so
    // this removal doesn't also silently cut off the Managing
    // Director's own access to the Sales and Expenses pages
    // themselves - confirmed directly that finance.approve and
    // sales.approve were the only permissions gating those nav items
    // that the Managing Director held, which would have left them
    // unable to even browse orders or expenses to forward for
    // clearance. The Managing Director still sees every order and
    // expense in full (farm.inventory.view, warehouse.inventory.view,
    // finance.view all remain), and can forward anything to Finance
    // through the existing messaging feature - the change is
    // specifically about who holds the final approval action, not
    // about visibility. organization.manage and masterdata.manage
    // added - the Managing Director can now actually edit company
    // details and manage master data (not just view), while CEO stays
    // view-only for both, matching the specific asymmetry requested
    // between the two otherwise-identical top-executive roles.
    permissionCodes: [
      'dashboard.view', 'farm.view', 'farm.inventory.view', 'warehouse.view', 'warehouse.inventory.view',
      'milling.view', 'machine.view', 'delivery.view', 'finance.view', 'sales.view', 'expense.view',
      'reports.view', 'reports.export', 'ai.view', 'ai.use', 'messages.send', 'messages.broadcast',
      'tasks.assign', 'audit.view', 'reset.approve', 'organization.manage', 'masterdata.manage',
    ],
  },
  {
    code: 'CEO',
    name: 'Chief Executive Officer',
    // Spec: "the CEO should have more analytical views... access to the
    // inbuilt AI to make decisions and make some predictions... able to
    // give remarks/recommendations to all user role types." Same
    // top-executive reach as MD (both are ultimate decision-makers with
    // full analytical access) - kept as an identical permission set
    // deliberately, rather than inventing a functional distinction the
    // spec itself doesn't actually draw between the two roles beyond
    // both being top-level executive views. sales.approve and
    // finance.approve removed here too, matching MD exactly - same
    // real workflow change: submitted to Finance Director for actual
    // clearance, not approved directly. sales.view and expense.view
    // added, same reason as MD: without them, this removal would have
    // silently cut off the CEO's own access to the Sales and Expenses
    // pages' nav items entirely, not just the approve action.
    // Visibility (farm/warehouse inventory, finance.view) is fully
    // retained.
    permissionCodes: [
      'dashboard.view', 'farm.view', 'farm.inventory.view', 'warehouse.view', 'warehouse.inventory.view',
      'milling.view', 'machine.view', 'delivery.view', 'finance.view', 'sales.view', 'expense.view',
      'reports.view', 'reports.export', 'ai.view', 'ai.use', 'messages.send', 'messages.broadcast',
      'tasks.assign', 'audit.view', 'reset.approve',
    ],
  },
  {
    code: 'FARM_DIRECTOR',
    name: 'Farm Supervisor',
    // team.manage added - the same real capability upgrade given to
    // Warehouse Supervisor and Operations Manager: can now add, edit,
    // and deactivate their own Farm Managers directly, not just assign
    // them tasks. Enforcement lives entirely in UsersService, scoped
    // to exactly FARM_MANAGER via the same TEAM_VISIBILITY mapping.
    // masterdata.manage removed - this role manages farms and paddy
    // intake, not the company's product/packaging/paddy-grade
    // reference data. Master data now flows to the roles that
    // actually touch it in the real business process instead:
    // Warehouse Manager (packaging), Warehouse Supervisor (broader
    // oversight of what's produced and packaged), and MD (read-only
    // company-wide visibility).
    permissionCodes: [
      // delivery.create restored - the assign-a-task-to-a-farm-manager
      // workflow (still available via Warehouse requests) covers the
      // "react to a specific warehouse's request" case, but a Farm
      // Supervisor also needs to proactively dispatch stock to a
      // warehouse directly, without waiting on an incoming request
      // first - both capabilities coexist now, not one replacing the
      // other.
      'dashboard.view', 'farm.view', 'farm.create', 'farm.update', 'farm.delete', 'farm.inventory.view',
      'paddy.approve', 'paddy.reject', 'delivery.create', 'delivery.approve', 'delivery.reject',
      'reports.view', 'reports.export', 'ai.view', 'messages.send', 'tasks.assign', 'tasks.complete',
      'inventory.adjust', 'expense.view', 'team.manage',
    ],
  },
  {
    code: 'FARM_MANAGER',
    name: 'Farm Manager',
    permissionCodes: [
      // farm.view removed - a Farm Manager doesn't browse the company's
      // farm list, they operate their own one via My Office and this
      // Expenses capability. expense.create added so they can log real
      // farm expenses (labour, transport, etc.) against their own farm.
      'dashboard.view', 'farm.inventory.view', 'paddy.create', 'paddy.submit',
      'delivery.create', 'expense.create', 'reports.view', 'reports.export', 'messages.send', 'tasks.complete',
      'farm.equipment.manage',
    ],
  },
  {
    code: 'WAREHOUSE_SUPERVISOR',
    name: 'Warehouse Supervisor',
    // team.manage added - a real capability upgrade: previously this
    // role could only see and assign tasks to its team (Warehouse
    // Managers), never actually add a new one, edit their details, or
    // deactivate them. Deliberately not users.manage - enforcement in
    // UsersService itself restricts this to exactly Warehouse Manager
    // accounts, the same TEAM_VISIBILITY mapping the team list already
    // uses, not system-wide account access.
    // masterdata.manage added - the second of three roles master data
    // was redistributed to, moved off Farm Director entirely. This
    // role's own Master Data page shows Products and Packaging Sizes
    // (see frontend) - broader than Warehouse Manager's, matching
    // their oversight of everything produced and packaged across
    // every warehouse, not just their own.
    permissionCodes: [
      'dashboard.view', 'warehouse.view', 'warehouse.create', 'warehouse.update', 'warehouse.delete',
      'warehouse.inventory.view', 'warehouse.transfer', 'milling.manage', 'inventory.adjust',
      'sales.approve', 'sales.fulfill', 'milling.view', 'reports.view', 'reports.export', 'ai.view', 'ai.use',
      'messages.send', 'tasks.assign', 'tasks.complete', 'expense.view', 'team.manage', 'masterdata.manage',
    ],
  },
  {
    code: 'WAREHOUSE_MANAGER',
    name: 'Warehouse Manager',
    // reports.export added - a real, confirmed gap found during a
    // Reports-page redesign: this role held reports.view but not
    // reports.export, and the Reports nav item itself is gated by
    // reports.export specifically - meaning Warehouse Manager could
    // never even reach the page to download their own warehouse's
    // inventory report, despite legitimately needing exactly that.
    // masterdata.manage added - the first of three roles master data
    // was redistributed to, moved off Farm Director entirely. This
    // role's own Master Data page shows Packaging Sizes only (see
    // frontend) - they physically package rice into specific bag
    // sizes, the one master data type directly tied to their actual
    // day-to-day work.
    permissionCodes: [
      'dashboard.view', 'warehouse.view', 'warehouse.inventory.view', 'warehouse.receive',
      'milling.view', 'packaging.create', 'sales.fulfill', 'reports.view', 'reports.export', 'messages.send', 'tasks.complete',
      'expense.create', 'warehouse.equipment.manage', 'masterdata.manage',
    ],
  },
  {
    code: 'OPERATIONS_MANAGER',
    name: 'Operations Manager',
    // team.manage added - same real capability upgrade as Warehouse
    // Supervisor: can now add, edit, and deactivate their own
    // Operations Officers, not just assign them tasks.
    permissionCodes: [
      'dashboard.view', 'milling.view', 'production.approve', 'machine.view', 'machine.manage',
      'meter.create', 'quality.manage', 'inventory.adjust', 'reports.view', 'reports.export', 'ai.view', 'ai.use', 'messages.send',
      'tasks.assign', 'tasks.complete', 'expense.view', 'team.manage',
    ],
  },
  {
    code: 'OPERATIONS_OFFICER',
    name: 'Operations Officer',
    // reports.export added - same reason as Warehouse Manager: held
    // reports.view but couldn't reach the Reports page at all, since
    // its nav item requires reports.export specifically.
    permissionCodes: [
      'dashboard.view', 'milling.view', 'production.create', 'machine.view', 'machine.manage', 'meter.create',
      'quality.manage', 'packaging.create', 'reports.view', 'reports.export', 'messages.send', 'tasks.complete', 'expense.create',
    ],
  },
  {
    code: 'SALES_OFFICER',
    name: 'Sales Officer',
    // warehouse.inventory.view deliberately removed - a real, reported
    // problem traced to its exact root cause: this one broad
    // permission was what silently let a Sales Officer reach Trace,
    // Shipments, and Packaging, and see paddy/warehouse figures on
    // their dashboard that have nothing to do with selling rice.
    // Their own order-status overview and "packaged rice available to
    // sell" figure (built into their dashboard) already work off
    // reports.view, which they keep - nothing they actually need to
    // do their job depended on this permission.
    // reports.export added - same reason as Warehouse Manager: without
    // it, a Sales Officer could never actually download their own
    // sales report, and the backend's own sales-report scoping (fixed
    // in the same session) already restricts them to their own data
    // regardless of what this permission alone would allow.
    permissionCodes: [
      'dashboard.view', 'sales.create', 'customer.manage', 'payment.create', 'reports.view', 'reports.export',
      'messages.send', 'tasks.complete',
    ],
  },
  {
    code: 'FINANCE_DIRECTOR',
    name: 'Finance Director',
    // sales.approve added - the real other half of the same workflow
    // change: an order the Managing Director forwards for clearance
    // needs someone who can actually approve it (reserving stock),
    // not just review it. finance.approve stays here too - expense
    // approval was already correctly centralized to this role, MD/CEO
    // simply no longer duplicate it.
    permissionCodes: [
      'dashboard.view', 'finance.view', 'finance.approve', 'sales.approve', 'payment.verify', 'invoice.create',
      'expense.create', 'reports.view', 'reports.export', 'ai.view', 'messages.send',
      'tasks.assign', 'reset.approve',
    ],
  },
  {
    code: 'FINANCE_OFFICER',
    name: 'Finance Officer',
    // reports.export added - same reason as Warehouse Manager: without
    // it, a Finance Officer could never reach the Reports page or
    // download the finance report their own dashboard already
    // summarizes.
    permissionCodes: [
      'dashboard.view', 'finance.view', 'payment.verify', 'invoice.create', 'expense.create',
      'reports.view', 'reports.export', 'messages.send', 'tasks.complete',
    ],
  },
  {
    code: 'AUDITOR',
    name: 'Auditor / Read-Only Auditor',
    // messages.send added - a real, confirmed gap found during a full
    // cross-role audit: Auditor could see the Messages nav item (it
    // has no permission gate) but could never send anything, only
    // ever receive - a read-only mandate over company data shouldn't
    // also mean an inability to actually flag a finding to anyone.
    // Every other write-capable action Auditor holds stays exactly
    // view-only - this is communication, not a data-mutation
    // permission, and doesn't compromise the role's read-only mandate.
    // reports.export added for the same underlying reason as above:
    // an oversight role that can see every figure across the company
    // but could never actually export any of it for a real audit
    // record was a genuine, confirmed gap in its own mandate.
    permissionCodes: [
      'dashboard.view', 'audit.view', 'reports.view', 'reports.export', 'farm.view', 'farm.inventory.view',
      'warehouse.view', 'warehouse.inventory.view', 'milling.view', 'finance.view',
      'sales.view', 'delivery.view', 'expense.view', 'messages.send',
    ],
  },
];

async function main() {
  console.log('Syncing permissions and roles...');

  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, description: p.description },
      create: p,
    });
  }
  console.log(`Synced ${PERMISSION_CATALOG.length} permissions.`);

  for (const def of ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { code: def.code },
      update: { name: def.name, isSystemRole: true },
      create: { code: def.code, name: def.name, isSystemRole: true },
    });

    const permissions = await prisma.permission.findMany({ where: { code: { in: def.permissionCodes } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
  console.log(`Synced ${ROLE_DEFINITIONS.length} roles - any other existing role in the database is left untouched.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
