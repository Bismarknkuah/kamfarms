/* eslint-disable no-console */
import { PrismaClient, ScopeType } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSION_CATALOG } from '../backend/src/common/constants/permissions';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'KamRoms#2026Dev'; // development only - never used in production

const ROLE_DEFINITIONS: { code: string; name: string; permissionCodes: string[] }[] = [
  {
    code: 'ADMIN',
    name: 'System Administrator',
    // The System Administrator holds EVERY permission in the catalog, not a hand-picked list, so a permission
    // added later can never leave the Administrator locked out of the screen it guards. The server also grants
    // this at sign-in (backend/src/auth/administrator-access.ts), so there is no gap between a new server
    // version starting and this sync running.
    permissionCodes: PERMISSION_CATALOG.map((p) => p.code),
  },
  {
    code: 'MD',
    name: 'Managing Director',
    // Sales and expenses are cleared by Finance, not here. The chain for a
    // sale is Sales Officer -> Finance Director (reviews and approves) ->
    // Managing Director (sales.release: releases the approved order to the
    // Warehouse Supervisor, who arranges the delivery). finance.approve.
    // director is deliberately narrow: it lets the Managing Director
    // approve an expense the Finance Director entered personally, which
    // the Finance Director cannot approve themselves (nobody may approve
    // their own entry). It cannot approve anyone else's expense - that
    // stays with the Finance Director. sales.view and expense.view keep
    // the Sales and Expenses pages reachable. organization.manage and
    // masterdata.manage let the Managing Director edit company details
    // and master data, while the CEO stays view-only for both, matching
    // the specific asymmetry requested between the two executive roles.
    permissionCodes: ['dispatch.track', 'trace.view', 'supply.view', 
      'dashboard.view', 'farm.view', 'farm.inventory.view', 'warehouse.view',
      'warehouse.inventory.view', 'milling.view', 'machine.view', 'delivery.view', 'finance.view',
      'sales.view', 'expense.view', 'reports.view', 'reports.export', 'ai.view', 'ai.use',
      'messages.send', 'messages.broadcast', 'tasks.assign', 'audit.view', 'reset.approve',
      'organization.manage', 'masterdata.manage', 'sales.release', 'finance.approve.director',
      'insights.view',
    ],
  },
  {
    code: 'CEO',
    name: 'Chief Executive Officer',
    // Same top-executive reach as the Managing Director, kept as an
    // identical permission set on purpose rather than inventing a
    // distinction the spec does not draw. Sales and expenses are cleared
    // by Finance: the CEO holds sales.release (the hand-off to the
    // Warehouse Supervisor once the Finance Director has approved an
    // order) and the narrow finance.approve.director (approving only an
    // expense the Finance Director entered personally, which they cannot
    // approve themselves). Visibility of farm and warehouse inventory and
    // finance records is fully retained.
    permissionCodes: ['dispatch.track', 'trace.view', 'supply.view', 
      'dashboard.view', 'farm.view', 'farm.inventory.view', 'warehouse.view',
      'warehouse.inventory.view', 'milling.view', 'machine.view', 'delivery.view', 'finance.view',
      'sales.view', 'expense.view', 'reports.view', 'reports.export', 'ai.view', 'ai.use',
      'messages.send', 'messages.broadcast', 'tasks.assign', 'audit.view', 'reset.approve',
      'sales.release', 'finance.approve.director', 'insights.view',
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
    permissionCodes: ['dispatch.track', 'supply.view', 'supply.fulfil', 
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
    permissionCodes: ['dispatch.track', 
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
    permissionCodes: ['dispatch.track', 'trace.view', 'supply.view', 'supply.request', 'supply.forward', 'supply.fulfil', 
      'dashboard.view', 'warehouse.view', 'warehouse.create', 'warehouse.update', 'warehouse.delete',
      'warehouse.inventory.view', 'warehouse.transfer', 'milling.manage', 'inventory.adjust',
      'sales.assign', 'sales.fulfill', 'milling.view', 'reports.view', 'reports.export', 'ai.view', 'ai.use',
      'messages.send', 'tasks.assign', 'tasks.complete', 'expense.view', 'team.manage',
      'masterdata.manage',
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
    permissionCodes: ['dispatch.track', 'supply.view', 'supply.request', 
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
    permissionCodes: ['supply.view', 'supply.request', 'supply.forward', 
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
    permissionCodes: ['supply.view', 'supply.request', 
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
    permissionCodes: ['trace.view', 
      'dashboard.view', 'sales.create', 'customer.manage', 'payment.create', 'reports.view', 'reports.export',
      'messages.send', 'tasks.complete',
    ],
  },
  {
    code: 'FINANCE_DIRECTOR',
    name: 'Finance Director',
    // The single owner of everything financial. This role now also carries
    // everything the retired Finance Officer role held (tasks.complete was
    // the only difference), so there is one accountable finance seat:
    // sales.approve (reviews and approves every order before it reaches the
    // Managing Director), finance.approve (every expense), payment.verify,
    // invoice.create and expense.create. audit.view lets the Finance
    // Director see who did what across the company's financial activity.
    // Nobody may approve their own entry, so an expense the Finance
    // Director enters is approved by the Managing Director or CEO
    // (finance.approve.director), never by the Finance Director.
    permissionCodes: ['trace.view', 
      'dashboard.view', 'finance.view', 'finance.approve', 'sales.approve', 'payment.verify',
      'invoice.create', 'expense.create', 'reports.view', 'reports.export', 'ai.view', 'messages.send',
      'tasks.assign', 'reset.approve', 'tasks.complete', 'audit.view',
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
  console.log('Seeding KAM-ROMS...');

  const company = await prisma.company.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'KAM Trading and Farms Limited',
      poBox: 'P.O. Box DT 1892, Adenta, Accra',
      currency: 'GHS',
      timezone: 'Africa/Accra',
    },
  });

  await prisma.facility.upsert({
    where: { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      companyId: company.id,
      name: 'Adenta Head Office',
      type: 'HQ',
      townOrArea: 'Adenta, Accra',
    },
  });

  await prisma.facility.upsert({
    where: { id: '00000000-0000-0000-0000-000000000012' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000012',
      companyId: company.id,
      name: 'Sefwi Kanchabio Manufacturing Facility',
      type: 'MANUFACTURING',
      region: 'Western North Region',
      townOrArea: 'Sefwi Kanchabio',
    },
  });

  await prisma.product.upsert({
    where: { id: '00000000-0000-0000-0000-000000000021' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000021',
      name: 'Pectra Rice',
      description: 'Superfine Perfumed Rice',
    },
  });

  // Seeded here too, not left to be created only the first time a
  // production record is approved (ProductionRecordsService's
  // upsertByproduct creates the same two products under the same
  // names, using findFirst-then-create since Product.name has no
  // unique constraint - matched here for the same reason) - without
  // this, an Operations Officer packaging byproduct on a fresh install
  // would see an empty product dropdown until someone happened to
  // approve a production run first.
  for (const byproduct of [
    { name: 'Broken Rice', description: 'Milling byproduct - broken grains' },
    { name: 'Rice Hull', description: 'Milling byproduct - husk' },
  ]) {
    const existing = await prisma.product.findFirst({ where: { name: byproduct.name } });
    if (!existing) await prisma.product.create({ data: byproduct });
  }

  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, description: p.description },
      create: p,
    });
  }
  console.log(`Seeded ${PERMISSION_CATALOG.length} permissions.`);

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
  console.log(`Seeded ${ROLE_DEFINITIONS.length} roles.`);

  const farmCodes = ['FARM_A', 'FARM_B', 'FARM_C', 'FARM_D', 'FARM_E', 'FARM_F'];
  const farms: Record<string, string> = {};
  for (const code of farmCodes) {
    const farm = await prisma.farm.upsert({
      where: { code },
      update: {},
      create: { code, name: code.replace('_', ' ') },
    });
    farms[code] = farm.id;
  }

  const warehouseCodes = ['WAREHOUSE_1', 'WAREHOUSE_2', 'WAREHOUSE_3'];
  const warehouses: Record<string, string> = {};
  const millingCenters: Record<string, string> = {};
  for (const code of warehouseCodes) {
    const wh = await prisma.warehouse.upsert({
      where: { code },
      update: {},
      create: { code, name: code.replace('_', ' ') },
    });
    warehouses[code] = wh.id;
    const center = await prisma.millingCenter.upsert({
      where: { code: `MILLING_${code}` },
      update: {},
      create: { code: `MILLING_${code}`, name: `Milling Center - ${wh.name}`, warehouseId: wh.id },
    });
    millingCenters[code] = center.id;
  }

  for (const code of warehouseCodes) {
    await prisma.machine.upsert({
      where: { machineCode: `${code}_M1` },
      update: {},
      create: {
        machineCode: `${code}_M1`,
        machineName: `Milling Machine 1 - ${code.replace('_', ' ')}`,
        millingCenterId: millingCenters[code],
        type: 'Rice Mill',
        ratedCapacity: 2000,
        meterType: 'Electricity',
      },
    });
  }

  const expenseCategories = [
    // Fertilizer, Seeds, Agrochemicals added - a real, confirmed gap:
    // a Farm Manager logging a genuinely common farm expense had no
    // matching category at all before this, only "Other" with a
    // free-text label as a fallback. Kept in sync with
    // sync-expense-categories.ts, which is what actually runs on every
    // deploy - this array only matters for a genuinely fresh database.
    'Farm Labour', 'Fertilizer', 'Seeds', 'Agrochemicals', 'Transportation', 'Milling Expenses', 'Electricity', 'Fuel',
    'Maintenance', 'Packaging', 'Warehouse Expenses', 'Salaries', 'Miscellaneous', 'Other',
  ];
  for (const name of expenseCategories) {
    await prisma.expenseCategory.upsert({ where: { name }, update: {}, create: { name } });
  }

  await prisma.paddyGrade.upsert({ where: { code: 'SIZE_4' }, update: {}, create: { code: 'SIZE_4', label: 'Size 4' } });
  await prisma.paddyGrade.upsert({ where: { code: 'SIZE_5' }, update: {}, create: { code: 'SIZE_5', label: 'Size 5' } });

  const sizes: [string, number][] = [['1KG', 1], ['2KG', 2], ['5KG', 5], ['10KG', 10], ['25KG', 25], ['50KG', 50]];
  for (const [label, kg] of sizes) {
    await prisma.packagingSize.upsert({ where: { label }, update: {}, create: { label, sizeKg: kg } });
  }

  const passwordHash = await argon2.hash(DEMO_PASSWORD);

  const demoUsers: { email: string; firstName: string; lastName: string; roleCode: string; scope: { scopeType: ScopeType; scopeId: string | null } }[] = [
    { email: 'admin@kam.local', firstName: 'System', lastName: 'Administrator', roleCode: 'ADMIN', scope: { scopeType: 'GLOBAL', scopeId: null } },
    { email: 'md@kam.local', firstName: 'Kwame', lastName: 'Asante (MD)', roleCode: 'MD', scope: { scopeType: 'GLOBAL', scopeId: null } },
    { email: 'ceo@kam.local', firstName: 'Abena', lastName: 'Osei (CEO)', roleCode: 'CEO', scope: { scopeType: 'GLOBAL', scopeId: null } },
    { email: 'farmdirector@kam.local', firstName: 'Ama', lastName: 'Boateng', roleCode: 'FARM_DIRECTOR', scope: { scopeType: 'GLOBAL', scopeId: null } },
    { email: 'farmmanager.a@kam.local', firstName: 'Kofi', lastName: 'Mensah', roleCode: 'FARM_MANAGER', scope: { scopeType: 'FARM', scopeId: farms.FARM_A } },
    { email: 'farmmanager.b@kam.local', firstName: 'Yaw', lastName: 'Owusu', roleCode: 'FARM_MANAGER', scope: { scopeType: 'FARM', scopeId: farms.FARM_B } },
    { email: 'warehousesupervisor@kam.local', firstName: 'Efua', lastName: 'Darko', roleCode: 'WAREHOUSE_SUPERVISOR', scope: { scopeType: 'GLOBAL', scopeId: null } },
    { email: 'warehousemanager.1@kam.local', firstName: 'Kwabena', lastName: 'Adjei', roleCode: 'WAREHOUSE_MANAGER', scope: { scopeType: 'WAREHOUSE', scopeId: warehouses.WAREHOUSE_1 } },
    { email: 'warehousemanager.2@kam.local', firstName: 'Abena', lastName: 'Gyasi', roleCode: 'WAREHOUSE_MANAGER', scope: { scopeType: 'WAREHOUSE', scopeId: warehouses.WAREHOUSE_2 } },
    { email: 'warehousemanager.3@kam.local', firstName: 'Yaa', lastName: 'Amponsah', roleCode: 'WAREHOUSE_MANAGER', scope: { scopeType: 'WAREHOUSE', scopeId: warehouses.WAREHOUSE_3 } },
    { email: 'operationsmanager.1@kam.local', firstName: 'Kojo', lastName: 'Antwi', roleCode: 'OPERATIONS_MANAGER', scope: { scopeType: 'GLOBAL', scopeId: null } },
    { email: 'operations.1@kam.local', firstName: 'Abena', lastName: 'Sarpong', roleCode: 'OPERATIONS_OFFICER', scope: { scopeType: 'WAREHOUSE', scopeId: warehouses.WAREHOUSE_1 } },
    { email: 'sales.1@kam.local', firstName: 'Nana', lastName: 'Yeboah', roleCode: 'SALES_OFFICER', scope: { scopeType: 'GLOBAL', scopeId: null } },
    { email: 'sales.2@kam.local', firstName: 'Akosua', lastName: 'Frimpong', roleCode: 'SALES_OFFICER', scope: { scopeType: 'GLOBAL', scopeId: null } },
    { email: 'financedirector@kam.local', firstName: 'Kwesi', lastName: 'Appiah', roleCode: 'FINANCE_DIRECTOR', scope: { scopeType: 'GLOBAL', scopeId: null } },
    { email: 'auditor@kam.local', firstName: 'Kwadwo', lastName: 'Osei', roleCode: 'AUDITOR', scope: { scopeType: 'GLOBAL', scopeId: null } },
  ];

  for (const u of demoUsers) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: u.roleCode } });
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        passwordHash,
        status: 'ACTIVE',
        mustChangePassword: true,
      },
    });

    const userRole = await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    const existingScope = await prisma.userScope.findFirst({ where: { userRoleId: userRole.id } });
    if (!existingScope) {
      await prisma.userScope.create({
        data: { userRoleId: userRole.id, scopeType: u.scope.scopeType, scopeId: u.scope.scopeId },
      });

      // UserScope alone only controls what data this person can access  - 
      // it was never enough on its own to make them actually *show up*
      // as a farm's or warehouse's manager. That's a separate join table
      // (FarmManager / WarehouseManager), and until this existed it was
      // never populated at all, so every farm and warehouse displayed
      // "No manager assigned" regardless of who was actually scoped to
      // it - confirmed directly from a real screenshot of the Farms page.
      if (u.scope.scopeType === 'FARM' && u.scope.scopeId) {
        await prisma.farmManager.upsert({
          where: { farmId_userId: { farmId: u.scope.scopeId, userId: user.id } },
          update: {},
          create: { farmId: u.scope.scopeId, userId: user.id },
        });
      }
      if (u.scope.scopeType === 'WAREHOUSE' && u.scope.scopeId) {
        await prisma.warehouseManager.upsert({
          where: { warehouseId_userId: { warehouseId: u.scope.scopeId, userId: user.id } },
          update: {},
          create: { warehouseId: u.scope.scopeId, userId: user.id },
        });
      }
    }
  }

  console.log(`Seeded ${demoUsers.length} demo users. Development password for all: ${DEMO_PASSWORD}`);

  // Real demo business data - until this existed, every KPI on every
  // dashboard showed zero not because of a permission bug (every role
  // already holds reports.view) but because the database had no
  // transactions in it at all: RBAC, users, and master data only.
  // Scoped deliberately to what the executive-summary report actually
  // reads (sales.this-month comes from FULFILLED SalesOrders with a
  // fulfilledAt this month; expenses.this-month from APPROVED Expenses
  // dated this month) - verified against reports.service.ts's real
  // query, not guessed.
  const salesOfficer1 = await prisma.user.findUniqueOrThrow({ where: { email: 'sales.1@kam.local' } });
  const salesOfficer2 = await prisma.user.findUniqueOrThrow({ where: { email: 'sales.2@kam.local' } });
  const financeDirector = await prisma.user.findUniqueOrThrow({ where: { email: 'financedirector@kam.local' } });
  const pectraRiceId = '00000000-0000-0000-0000-000000000021';

  // Demo list prices, so a fresh demo can create an order straight away. Real prices are set by the Administrator on the
  // Price list screen; this never overwrites one that is already there.
  const DEMO_PRICES: Record<string, number> = { '1KG': 21, '2KG': 40, '5KG': 95, '10KG': 185, '25KG': 420, '50KG': 820 };
  for (const [label, price] of Object.entries(DEMO_PRICES)) {
    const size = await prisma.packagingSize.findUnique({ where: { label } });
    if (!size) continue;
    const already = await prisma.productPrice.findFirst({ where: { productId: pectraRiceId, packagingSizeId: size.id, customerId: null } });
    if (!already) await prisma.productPrice.create({ data: { productId: pectraRiceId, packagingSizeId: size.id, pricePerBag: price, effectiveFrom: new Date('2026-01-01'), createdById: financeDirector.id } });
  }
  const now = new Date();

  const demoCustomers = [
    { number: 'CUST-0001', name: 'Lapaz Awoshie Distributors', company: 'Lapaz Awoshie Distributors Ltd', phone: '0541589964' },
    { number: 'CUST-0002', name: 'Tema Community 18 Traders', company: 'Tema Traders Union', phone: '0548254399' },
    { number: 'CUST-0003', name: 'Koforidua Wholesale', company: 'Koforidua Wholesale Foods', phone: '0557706731' },
  ];
  const customers = [];
  for (const c of demoCustomers) {
    const customer = await prisma.customer.upsert({
      where: { customerNumber: c.number },
      update: {},
      create: {
        customerNumber: c.number,
        name: c.name,
        company: c.company,
        phone: c.phone,
        creditLimit: 20000,
        isActive: true,
      },
    });
    customers.push(customer);
  }

  const farmLabourCategory = await prisma.expenseCategory.findUniqueOrThrow({ where: { name: 'Farm Labour' } });
  const transportCategory = await prisma.expenseCategory.findUniqueOrThrow({ where: { name: 'Transportation' } });
  // daysAgo is capped against how many days have actually elapsed in the
  // current month so far - a hardcoded "12 days ago" would land in the
  // *previous* month (and silently fail to count toward "this month"'s
  // total) on any seed run that happens early in a month, which this
  // one genuinely does (today is the 3rd).
  const maxSafeDaysAgo = Math.max(now.getDate() - 1, 0);
  const demoExpenses = [
    { number: 'EXP-0001', categoryId: farmLabourCategory.id, amount: 3200, daysAgo: Math.min(2, maxSafeDaysAgo) },
    { number: 'EXP-0002', categoryId: transportCategory.id, amount: 1850, daysAgo: Math.min(1, maxSafeDaysAgo) },
    { number: 'EXP-0003', categoryId: farmLabourCategory.id, amount: 2100, daysAgo: Math.min(0, maxSafeDaysAgo) },
  ];
  for (const e of demoExpenses) {
    const date = new Date(now);
    date.setDate(date.getDate() - e.daysAgo);
    await prisma.expense.upsert({
      where: { expenseNumber: e.number },
      update: {},
      create: {
        expenseNumber: e.number,
        categoryId: e.categoryId,
        amount: e.amount,
        date,
        status: 'APPROVED',
        submittedById: financeDirector.id,
        approvedById: financeDirector.id,
        approvedAt: date,
      },
    });
  }

  const size25kg = await prisma.packagingSize.findUniqueOrThrow({ where: { label: '25KG' } });
  const size5kg = await prisma.packagingSize.findUniqueOrThrow({ where: { label: '5KG' } });
  const demoOrders = [
    { number: 'SO-0001', customer: customers[0], officer: salesOfficer1, size: size25kg, bags: 40, unitPrice: 420, daysAgo: Math.min(2, maxSafeDaysAgo) },
    { number: 'SO-0002', customer: customers[1], officer: salesOfficer2, size: size5kg, bags: 100, unitPrice: 95, daysAgo: Math.min(1, maxSafeDaysAgo) },
    { number: 'SO-0003', customer: customers[2], officer: salesOfficer1, size: size25kg, bags: 25, unitPrice: 420, daysAgo: Math.min(0, maxSafeDaysAgo) },
  ];
  for (const o of demoOrders) {
    const lineTotal = o.unitPrice * o.bags;
    const totalKg = Number(o.size.sizeKg) * o.bags;
    const fulfilledAt = new Date(now);
    fulfilledAt.setDate(fulfilledAt.getDate() - o.daysAgo);
    const order = await prisma.salesOrder.upsert({
      where: { orderNumber: o.number },
      update: {},
      create: {
        orderNumber: o.number,
        customerId: o.customer.id,
        salesOfficerId: o.officer.id,
        submittedById: o.officer.id,
        totalKg,
        totalAmount: lineTotal,
        status: 'FULFILLED',
        submittedAt: fulfilledAt,
        approvedAt: fulfilledAt,
        fulfilledAt,
      },
    });
    const existingItem = await prisma.salesOrderItem.findFirst({ where: { salesOrderId: order.id } });
    if (!existingItem) {
      await prisma.salesOrderItem.create({
        data: {
          salesOrderId: order.id,
          productId: pectraRiceId,
          packagingSizeId: o.size.id,
          bagCount: o.bags,
          totalKg,
          unitPrice: o.unitPrice,
          lineTotal,
        },
      });
    }
  }

  console.log(`Seeded ${customers.length} customers, ${demoExpenses.length} expenses, ${demoOrders.length} fulfilled sales orders.`);
  // A couple of real demo conversations - otherwise the Messages page
  // is empty on first login even after the "New conversation" UI fix,
  // which makes the feature look broken again for a different reason.
  const mdUser = await prisma.user.findUniqueOrThrow({ where: { email: 'md@kam.local' } });
  const farmDirectorUser = await prisma.user.findUniqueOrThrow({ where: { email: 'farmdirector@kam.local' } });
  const existingConvo = await prisma.conversation.findFirst({
    where: { members: { every: { userId: { in: [mdUser.id, farmDirectorUser.id] } } }, type: 'DIRECT' },
  });
  if (!existingConvo) {
    const conversation = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        createdById: mdUser.id,
        members: { create: [{ userId: mdUser.id }, { userId: farmDirectorUser.id }] },
      },
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: mdUser.id,
        body: 'Morning - how are things looking across the farms this week?',
      },
    });
    await prisma.messageReceipt.create({
      data: { messageId: (await prisma.message.findFirstOrThrow({ where: { conversationId: conversation.id } })).id, userId: farmDirectorUser.id, status: 'SENT' },
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
