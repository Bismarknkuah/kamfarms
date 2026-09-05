/* eslint-disable no-console */
import { PrismaClient, ScopeType } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSION_CATALOG } from '../backend/src/common/constants/permissions';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'KamRoms#2026Dev'; // development only — never used in production

const ROLE_DEFINITIONS: { code: string; name: string; permissionCodes: string[] }[] = [
  {
    code: 'ADMIN',
    name: 'System Administrator',
    permissionCodes: [
      'dashboard.view', 'users.manage', 'roles.manage', 'permissions.manage', 'settings.manage',
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
    permissionCodes: [
      'dashboard.view', 'farm.view', 'farm.inventory.view', 'warehouse.view', 'warehouse.inventory.view',
      'milling.view', 'machine.view', 'sales.approve', 'delivery.view', 'finance.view', 'finance.approve',
      'reports.view', 'reports.export', 'ai.view', 'ai.use', 'messages.send', 'messages.broadcast',
      'tasks.assign', 'audit.view', 'reset.approve',
    ],
  },
  {
    code: 'CEO',
    name: 'Chief Executive Officer',
    // Spec: "the CEO should have more analytical views... access to the
    // inbuilt AI to make decisions and make some predictions... able to
    // give remarks/recommendations to all user role types." Same
    // top-executive reach as MD (both are ultimate decision-makers with
    // full analytical + approval access) — kept as an identical
    // permission set deliberately, rather than inventing a functional
    // distinction the spec itself doesn't actually draw between the two
    // roles beyond both being top-level executive views.
    permissionCodes: [
      'dashboard.view', 'farm.view', 'farm.inventory.view', 'warehouse.view', 'warehouse.inventory.view',
      'milling.view', 'machine.view', 'sales.approve', 'delivery.view', 'finance.view', 'finance.approve',
      'reports.view', 'reports.export', 'ai.view', 'ai.use', 'messages.send', 'messages.broadcast',
      'tasks.assign', 'audit.view', 'reset.approve',
    ],
  },
  {
    code: 'FARM_DIRECTOR',
    name: 'Farm Supervisor',
    permissionCodes: [
      'dashboard.view', 'farm.view', 'farm.create', 'farm.update', 'farm.delete', 'farm.inventory.view',
      'paddy.approve', 'paddy.reject', 'delivery.create', 'delivery.approve', 'delivery.reject',
      'reports.view', 'reports.export', 'ai.view', 'messages.send', 'tasks.assign', 'tasks.complete',
      'masterdata.manage', 'inventory.adjust',
    ],
  },
  {
    code: 'FARM_MANAGER',
    name: 'Farm Manager',
    permissionCodes: [
      // farm.view removed — a Farm Manager doesn't browse the company's
      // farm list, they operate their own one via My Office and this
      // Expenses capability. expense.create added so they can log real
      // farm expenses (labour, transport, etc.) against their own farm.
      'dashboard.view', 'farm.inventory.view', 'paddy.create', 'paddy.submit',
      'delivery.create', 'expense.create', 'reports.view', 'messages.send', 'tasks.complete',
    ],
  },
  {
    code: 'WAREHOUSE_SUPERVISOR',
    name: 'Warehouse Supervisor',
    permissionCodes: [
      'dashboard.view', 'warehouse.view', 'warehouse.create', 'warehouse.update', 'warehouse.delete',
      'warehouse.inventory.view', 'warehouse.transfer', 'milling.manage', 'inventory.adjust',
      'sales.approve', 'sales.fulfill', 'milling.view', 'reports.view', 'reports.export', 'ai.view', 'ai.use',
      'messages.send', 'tasks.assign', 'tasks.complete',
    ],
  },
  {
    code: 'WAREHOUSE_MANAGER',
    name: 'Warehouse Manager',
    permissionCodes: [
      'dashboard.view', 'warehouse.view', 'warehouse.inventory.view', 'warehouse.receive',
      'milling.view', 'packaging.create', 'sales.fulfill', 'reports.view', 'messages.send', 'tasks.complete',
    ],
  },
  {
    code: 'OPERATIONS_MANAGER',
    name: 'Operations Manager',
    permissionCodes: [
      'dashboard.view', 'milling.view', 'production.approve', 'machine.view', 'machine.manage',
      'meter.create', 'quality.manage', 'inventory.adjust', 'reports.view', 'reports.export', 'ai.view', 'ai.use', 'messages.send',
      'tasks.assign', 'tasks.complete',
    ],
  },
  {
    code: 'OPERATIONS_OFFICER',
    name: 'Operations Officer',
    permissionCodes: [
      'dashboard.view', 'milling.view', 'production.create', 'machine.view', 'meter.create',
      'quality.manage', 'packaging.create', 'reports.view', 'messages.send', 'tasks.complete',
    ],
  },
  {
    code: 'SALES_OFFICER',
    name: 'Sales Officer',
    permissionCodes: [
      'dashboard.view', 'sales.create', 'customer.manage', 'payment.create', 'reports.view',
      'messages.send', 'tasks.complete', 'warehouse.inventory.view',
    ],
  },
  {
    code: 'FINANCE_DIRECTOR',
    name: 'Finance Director',
    permissionCodes: [
      'dashboard.view', 'finance.view', 'finance.approve', 'payment.verify', 'invoice.create',
      'expense.create', 'reports.view', 'reports.export', 'ai.view', 'messages.send',
      'tasks.assign', 'reset.approve',
    ],
  },
  {
    code: 'FINANCE_OFFICER',
    name: 'Finance Officer',
    permissionCodes: [
      'dashboard.view', 'finance.view', 'payment.verify', 'invoice.create', 'expense.create',
      'reports.view', 'messages.send', 'tasks.complete',
    ],
  },
  {
    code: 'AUDITOR',
    name: 'Auditor / Read-Only Auditor',
    permissionCodes: [
      'dashboard.view', 'audit.view', 'reports.view', 'farm.view', 'farm.inventory.view',
      'warehouse.view', 'warehouse.inventory.view', 'milling.view', 'finance.view',
      'sales.view', 'delivery.view',
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
      create: { code: `MILLING_${code}`, name: `Milling Center — ${wh.name}`, warehouseId: wh.id },
    });
    millingCenters[code] = center.id;
  }

  for (const code of warehouseCodes) {
    await prisma.machine.upsert({
      where: { machineCode: `${code}_M1` },
      update: {},
      create: {
        machineCode: `${code}_M1`,
        machineName: `Milling Machine 1 — ${code.replace('_', ' ')}`,
        millingCenterId: millingCenters[code],
        type: 'Rice Mill',
        ratedCapacity: 2000,
        meterType: 'Electricity',
      },
    });
  }

  const expenseCategories = [
    'Farm Labour', 'Transportation', 'Milling Expenses', 'Electricity', 'Fuel',
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
    { email: 'finance.1@kam.local', firstName: 'Adwoa', lastName: 'Nyarko', roleCode: 'FINANCE_OFFICER', scope: { scopeType: 'GLOBAL', scopeId: null } },
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

      // UserScope alone only controls what data this person can access —
      // it was never enough on its own to make them actually *show up*
      // as a farm's or warehouse's manager. That's a separate join table
      // (FarmManager / WarehouseManager), and until this existed it was
      // never populated at all, so every farm and warehouse displayed
      // "No manager assigned" regardless of who was actually scoped to
      // it — confirmed directly from a real screenshot of the Farms page.
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

  // Real demo business data — until this existed, every KPI on every
  // dashboard showed zero not because of a permission bug (every role
  // already holds reports.view) but because the database had no
  // transactions in it at all: RBAC, users, and master data only.
  // Scoped deliberately to what the executive-summary report actually
  // reads (sales.this-month comes from FULFILLED SalesOrders with a
  // fulfilledAt this month; expenses.this-month from APPROVED Expenses
  // dated this month) — verified against reports.service.ts's real
  // query, not guessed.
  const salesOfficer1 = await prisma.user.findUniqueOrThrow({ where: { email: 'sales.1@kam.local' } });
  const salesOfficer2 = await prisma.user.findUniqueOrThrow({ where: { email: 'sales.2@kam.local' } });
  const financeOfficer = await prisma.user.findUniqueOrThrow({ where: { email: 'finance.1@kam.local' } });
  const pectraRiceId = '00000000-0000-0000-0000-000000000021';
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
  // current month so far — a hardcoded "12 days ago" would land in the
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
        submittedById: financeOfficer.id,
        approvedById: financeOfficer.id,
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
  // A couple of real demo conversations — otherwise the Messages page
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
        body: 'Morning — how are things looking across the farms this week?',
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
