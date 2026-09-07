'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { hasFinancialVisibility } from '@/lib/nav-items';
import {
  reportsApi,
  ExecutiveSummary,
  ApiError,
  tasksApi,
  notificationsApi,
  paddyEntriesApi,
  deliveryReportsApi,
  salesOrdersApi,
  SalesOrder,
  paymentsApi,
  Payment,
  invoicesApi,
  systemResetApi,
  ResetRequest,
  backupApi,
  masterDataApi,
  Product,
  PackagingSize,
  callsApi,
  CallRequest,
  Invoice,
  receivablesApi,
  TopDebtor,
  shipmentsApi,
  productionApi,
  usersApi,
  AppUser,
  auditApi,
  AuditLogEntry,
  farmsApi,
  farmEquipmentApi,
  warehouseEquipmentApi,
  machinesApi,
  Machine,
  Farm,
  FarmEquipment,
  WarehouseEquipment,
  expensesApi,
  Expense,
  WarehouseOverview,
  FarmOverview,
  ProductionOverview,
  Warehouse,
  warehousesApi,
} from '@/lib/api-client';

type StatTone = 'default' | 'paddy' | 'husk' | 'soil';

const STAT_TONE_STYLES: Record<StatTone, string> = {
  default: 'border border-paddy-100 bg-white text-paddy-900 [&_.stat-label]:text-ink-500 [&_.stat-unit]:text-ink-500',
  paddy: 'bg-paddy-900 text-rice-50 [&_.stat-label]:text-paddy-300 [&_.stat-unit]:text-paddy-300',
  husk: 'bg-husk-500 text-white [&_.stat-label]:text-husk-100 [&_.stat-unit]:text-husk-100',
  soil: 'bg-soil-700 text-rice-50 [&_.stat-label]:text-husk-100 [&_.stat-unit]:text-husk-100',
};

const MACHINE_STATUS_STYLES: Record<string, string> = {
  RUNNING: 'bg-paddy-700 text-rice-50',
  IDLE: 'bg-ink-500/10 text-ink-700',
  MAINTENANCE: 'bg-husk-300 text-soil-700',
  FAULT: 'bg-red-100 text-red-700',
  OFFLINE: 'bg-ink-500/10 text-ink-500',
};

function StatCard({ label, value, unit, tone = 'default' }: { label: string; value: string; unit?: string; tone?: StatTone }) {
  return (
    <div className={`rounded-2xl p-5 ${STAT_TONE_STYLES[tone]}`}>
      <p className="stat-label text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="mt-2 font-display text-2xl">
        {value}
        {unit && <span className="stat-unit ml-1 text-sm font-sans">{unit}</span>}
      </p>
    </div>
  );
}

function fmtKg(kg: number) {
  return kg.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function fmtGHS(amount: number) {
  return `GHS ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

interface AttentionItem {
  label: string;
  count: number;
  href: string;
}

interface PersonalStat {
  label: string;
  value: string;
  unit?: string;
}

/** True for the first day of the caller's current calendar month, in
 * their local time zone - used to filter already-fetched lists down to
 * "this month" client-side, since these list endpoints don't take a
 * date-range parameter and there's no dedicated backend aggregate for
 * a single person's personal month-to-date figures. */
function isThisMonth(isoDate: string): boolean {
  const d = new Date(isoDate);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default function DashboardPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [personalStats, setPersonalStats] = useState<PersonalStat[]>([]);
  const [myFarmInventory, setMyFarmInventory] = useState<{
    totalKg: number;
    totalBags: number;
    byGrade: { gradeCode: string; gradeLabel: string; bagCount: number; totalKg: number }[];
    dispatchedByGrade: { gradeCode: string; gradeLabel: string; bagCount: number; totalKg: number }[];
    dispatchedTotalKg: number;
    dispatchedTotalBags: number;
  } | null>(null);
  const [myFarmIdRobust, setMyFarmIdRobust] = useState<string | null>(null);
  const [myFarmInventoryError, setMyFarmInventoryError] = useState<string | null>(null);
  const [myFarmEquipment, setMyFarmEquipment] = useState<FarmEquipment[]>([]);
  const [supervisorFarms, setSupervisorFarms] = useState<Farm[] | null>(null);
  const [supervisorEquipment, setSupervisorEquipment] = useState<FarmEquipment[]>([]);
  const [selectedEquipmentStatus, setSelectedEquipmentStatus] = useState<string | null>(null);
  const [supervisorWhEquipment, setSupervisorWhEquipment] = useState<WarehouseEquipment[]>([]);
  // MD/CEO's company-wide rollup - the same real data Farm Supervisor
  // and Warehouse Supervisor each already see for their own domain,
  // aggregated here into one place so the top of the company doesn't
  // have to visit three different dashboards to know what's happening.
  const [mdFarmEquipment, setMdFarmEquipment] = useState<FarmEquipment[]>([]);
  const [mdWarehouseEquipment, setMdWarehouseEquipment] = useState<WarehouseEquipment[]>([]);
  const [mdExpenses, setMdExpenses] = useState<Expense[]>([]);
  const [mdMachines, setMdMachines] = useState<Machine[]>([]);
  const [mdSalesOrders, setMdSalesOrders] = useState<SalesOrder[]>([]);
  // Reset requests awaiting MD/CEO's approval - moved here from My
  // Office (now hidden for them), so this genuinely important
  // top-management responsibility is actually visible on their own
  // dashboard rather than buried in a page that otherwise has nothing
  // left for them to do.
  const [mdResetRequests, setMdResetRequests] = useState<ResetRequest[]>([]);
  // Pending call requests from "least users" - ties the calling
  // feature directly into the dashboard rather than leaving it only
  // discoverable by visiting Messages, since MD/CEO are specifically
  // who these requests are addressed to.
  const [mdCallRequests, setMdCallRequests] = useState<CallRequest[]>([]);
  // Finance Director's own approval-queue panel - a real, confirmed
  // gap found during a full role audit: their nav access was already
  // complete, but their Overview page showed nothing tailored to their
  // actual job (verifying payments, approving expenses), unlike every
  // other supervisor-tier role which already has one.
  const [fdPayments, setFdPayments] = useState<Payment[]>([]);
  const [fdInvoices, setFdInvoices] = useState<Invoice[]>([]);
  const [fdExpenses, setFdExpenses] = useState<Expense[]>([]);
  // Shared Finance dashboard - Finance Officer and Finance Director
  // both see this: packaged rice actually available to sell, the
  // sales pipeline (pending vs already sold), who owes the company
  // (real receivables, not just a raw balance), and what the company
  // itself owes (approved-but-outstanding expenses - the honest
  // mapping given this project has no separate supplier-invoice/
  // accounts-payable system to draw a more formal "payable" figure
  // from). Deliberately no paddy or warehouse-inventory figures here -
  // that's not Finance's jurisdiction.
  const [financeOrders, setFinanceOrders] = useState<SalesOrder[]>([]);
  const [financeExpenses, setFinanceExpenses] = useState<Expense[]>([]);
  const [financeDebtors, setFinanceDebtors] = useState<TopDebtor[]>([]);
  // Admin's own dashboard - a real, confirmed gap found during the
  // full role audit: Admin fell into the generic company-wide
  // operations summary (paddy, milling, packaged rice) despite that
  // data having nothing to do with their actual job. System
  // administration is about the system itself - who has access, and
  // what's recently changed - not rice inventory.
  const [adminUsers, setAdminUsers] = useState<AppUser[]>([]);
  const [adminAuditLog, setAdminAuditLog] = useState<AuditLogEntry[]>([]);
  // Surfacing what Admin can now actually do with their expanded
  // capability - reset requests genuinely awaiting action (create the
  // request UI now exists, so this stat is finally meaningful), backup
  // health, and master-data counts, all linking straight to the real
  // pages rather than just restating "you have access" with no numbers
  // behind it.
  const [adminResetRequests, setAdminResetRequests] = useState<ResetRequest[]>([]);
  const [adminBackupStatus, setAdminBackupStatus] = useState<{ lastSuccess: { completedAt: string | null } | null; lastFailure: { completedAt: string | null } | null } | null>(null);
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);
  const [adminPackagingSizes, setAdminPackagingSizes] = useState<PackagingSize[]>([]);
  // Sales Officer's own order-status overview - a real, confirmed fix:
  // they should see their own orders' progress (delivered, pending,
  // rejected/cancelled) and what's actually available to sell, not
  // paddy/warehouse figures that have nothing to do with their job.
  const [salesOfficerOrders, setSalesOfficerOrders] = useState<SalesOrder[]>([]);
  const [opsManagerExpenses, setOpsManagerExpenses] = useState<Expense[]>([]);
  const [selectedWhEquipmentStatus, setSelectedWhEquipmentStatus] = useState<string | null>(null);
  // Operations Manager's own machinery-at-a-glance panel, the same
  // real pattern already proven correct for Farm Supervisor's
  // equipment and Warehouse Supervisor's equipment - grouped here as
  // "running" (RUNNING, IDLE) vs "needs attention" (MAINTENANCE,
  // FAULT, OFFLINE) since Machine already tracks five granular states,
  // not the three-state WORKING/NOT_WORKING/NEEDS_REPLACEMENT the
  // other two equipment types use.
  const [opsManagerMachines, setOpsManagerMachines] = useState<Machine[]>([]);
  const [selectedMachineStatusGroup, setSelectedMachineStatusGroup] = useState<'running' | 'attention' | null>(null);
  // Operations Manager's own centralized overview - the actual milling
  // process itself this month (paddy processed, rice/hull/broken-rice
  // recovered, recovery rate, energy used), deliberately distinct from
  // Warehouse Supervisor's inventory-balance figures (at-milling,
  // packaged rice).
  const [productionOverview, setProductionOverview] = useState<ProductionOverview | null>(null);
  const [productionOverviewError, setProductionOverviewError] = useState<string | null>(null);
  const [selectedMillingCenterId, setSelectedMillingCenterId] = useState<string | null>(null);
  const [downloadingProductionOverview, setDownloadingProductionOverview] = useState<string | null>(null);
  // Warehouse Manager's own three-section overview, and Warehouse
  // Supervisor's centralized version (aggregated across every
  // warehouse, with the same "tap to drill into one" pattern already
  // proven correct for Farm Supervisor's farm-by-farm view).
  const [warehouseOverview, setWarehouseOverview] = useState<WarehouseOverview | null>(null);
  const [warehouseOverviewError, setWarehouseOverviewError] = useState<string | null>(null);
  const [warehouseSection, setWarehouseSection] = useState<'received' | 'available' | 'inTransit' | 'milling' | 'packaged' | null>(null);
  const [supervisorWarehouses, setSupervisorWarehouses] = useState<Warehouse[] | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [downloadingWarehouse, setDownloadingWarehouse] = useState<string | null>(null);
  // Farm Director's own centralized overview - the same layout style
  // as the Warehouse Supervisor's (tabs across every location, then
  // paddy stat cards), built on real farm-scoped data (farmOverview),
  // not a reuse of warehouse figures. A farm's own jurisdiction ends
  // at dispatch, so this deliberately has no "at milling" or
  // "packaged rice" cards - those belong to Warehouse Supervisor and
  // Operations Manager respectively, not Farm Director.
  const [farmOverview, setFarmOverview] = useState<FarmOverview | null>(null);
  const [farmOverviewError, setFarmOverviewError] = useState<string | null>(null);
  const [farmOverviewSection, setFarmOverviewSection] = useState<'received' | 'available' | 'dispatched' | null>(null);
  const [selectedFarmIdForOverview, setSelectedFarmIdForOverview] = useState<string | null>(null);
  const [downloadingFarmOverview, setDownloadingFarmOverview] = useState<string | null>(null);
  // Expenses, clickable to see the actual list, not just a total - a
  // real gap this closes: Farm Director previously had no expenses
  // section at all after the overview redesign.
  const [farmDirectorExpenses, setFarmDirectorExpenses] = useState<Expense[]>([]);
  const [showFarmExpensesList, setShowFarmExpensesList] = useState(false);

  useEffect(() => {
    if (!accessToken || !me) return;
    // Fetched unconditionally now - reports.view is held by every
    // role (confirmed directly), so this is always safe to call. The
    // previous version tried to skip this as an optimization for a
    // Farm Manager who'd see their own farm view instead, gated on
    // findSingleLocationScope - but that helper's null-for-anything-
    // but-exactly-one-match behavior meant getting that guess wrong
    // could blank the whole page with neither view rendering. A
    // slightly wasted fetch is a far smaller cost than that.
    reportsApi
      .executiveSummary(accessToken)
      .then(setSummary)
      .catch((err: unknown) => setSummaryError(err instanceof ApiError ? err.message : 'Failed to load KPIs.'));

    // "Needs your attention" - real counts, not decoration. Every fetch
    // here is gated by the exact permission that page's action requires,
    // so a person never sees a count for something they can't act on.
    const items: Promise<AttentionItem | null>[] = [
      tasksApi
        .listMine(accessToken)
        .then((tasks) => {
          const open = tasks.filter((t) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(t.status));
          return open.length > 0 ? { label: 'Tasks assigned to you', count: open.length, href: '/tasks' } : null;
        })
        .catch(() => null),
      notificationsApi
        .unreadCount(accessToken)
        .then((count) => (count > 0 ? { label: 'Unread notifications', count, href: '/notifications' } : null))
        .catch(() => null),
    ];

    if (hasPermission('paddy.approve')) {
      items.push(
        paddyEntriesApi
          .list(accessToken, undefined, 'SUBMITTED')
          .then((entries) => (entries.length > 0 ? { label: 'Paddy entries awaiting your approval', count: entries.length, href: '/paddy-entries' } : null))
          .catch(() => null),
      );
    }
    if (hasPermission('delivery.approve')) {
      items.push(
        deliveryReportsApi
          .list(accessToken, undefined, 'SUPERVISOR_REVIEW')
          .then((reports) => (reports.length > 0 ? { label: 'Delivery reports awaiting your approval', count: reports.length, href: '/deliveries' } : null))
          .catch(() => null),
      );
    }
    if (hasPermission('warehouse.receive')) {
      // Section 25's "long-running shipment / unreceived shipment"
      // alert - computed live on each visit rather than a background
      // job, since this sandbox has no way to verify a scheduled job
      // actually runs reliably in the real deployment. Anything still
      // in transit more than 3 days after departure is worth a flag  - 
      // it likely either arrived without being logged, or is stuck.
      items.push(
        shipmentsApi
          .list(accessToken)
          .then((shipments) => {
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            const overdue = shipments.filter((s) => !s.receivedAt && new Date(s.departedAt) < threeDaysAgo);
            return overdue.length > 0 ? { label: 'Shipments overdue - departed 3+ days ago, still unreceived', count: overdue.length, href: '/shipments' } : null;
          })
          .catch(() => null),
      );
    }
    if (hasPermission('sales.approve')) {
      items.push(
        salesOrdersApi
          .list(accessToken, 'SUBMITTED')
          .then((orders) => (orders.length > 0 ? { label: 'Sales orders awaiting your approval', count: orders.length, href: '/sales' } : null))
          .catch(() => null),
      );
    }

    if (hasPermission('payment.verify')) {
      items.push(
        paymentsApi
          .list(accessToken, 'PENDING_VERIFICATION')
          .then((payments) => (payments.length > 0 ? { label: 'Payments awaiting verification', count: payments.length, href: '/finance' } : null))
          .catch(() => null),
      );
    }

    Promise.all(items).then((results) => setAttention(results.filter((r): r is AttentionItem => r !== null)));

    // Personal, role-specific "your activity this month" - for roles
    // whose whole job IS sales or paddy intake but who don't hold
    // reports.view (the company-wide grid above is invisible to them),
    // this is the actual replacement, not a decoration next to it.
    // Computed from data the role can already legitimately see  - 
    // SalesOrdersService.list() returns every order visible to anyone
    // holding sales.create/approve/fulfill/view, not just "my orders",
    // so a Sales Officer's own figures are filtered out client-side by
    // matching salesOfficer.id, not assumed from a scoped endpoint.
    const roleCodes = me.roles.map((r) => r.code);

    if (roleCodes.includes('SALES_OFFICER')) {
      salesOrdersApi
        .list(accessToken)
        .then((orders) => {
          setSalesOfficerOrders(orders.filter((o) => o.salesOfficer.id === me.id));
          const mine = orders.filter((o) => o.salesOfficer.id === me.id && isThisMonth(o.createdAt));
          const total = mine.reduce((sum, o) => sum + o.totalAmount, 0);
          setPersonalStats((prev) => [...prev, 
            { label: 'Your sales this month', value: `GHS ${total.toLocaleString('en-US', { maximumFractionDigits: 2 })}` },
            { label: 'Orders you created this month', value: String(mine.length) },
          ]);
        })
        .catch(() => {});
      // Only the packaged-rice figures - reportsApi.getWarehouseOverview
      // already returns everything (paddy, milling, packaged rice), but
      // a Sales Officer only ever reads warehouseOverview.packagedRice
      // from it below, matching "the inventory for sales is packaged
      // rice available to sell, not the whole system."
      reportsApi.getWarehouseOverview(accessToken).then(setWarehouseOverview).catch(() => {});
    }

    // A Farm Manager's own farm - resolved via farmsApi.list() rather
    // than findSingleLocationScope, the same real fix already applied
    // to the Expenses page's equipment section: that helper returns
    // null for anything other than exactly one matching scope, which
    // would silently blank this entire section with no explanation.
    // farmsApi.list() is already correctly scoped server-side and
    // handles any count gracefully.
    farmsApi.list(accessToken).then((list) => {
      if (list.length === 1) {
        const farmId = list[0].id;
        setMyFarmIdRobust(farmId);
        farmsApi.getInventory(accessToken, farmId)
          .then(setMyFarmInventory)
          .catch((err: unknown) => setMyFarmInventoryError(err instanceof ApiError ? err.message : 'Failed to load your farm’s inventory.'));
        farmEquipmentApi.list(accessToken, farmId).then(setMyFarmEquipment).catch(() => {});
      }
    }).catch(() => {});

    if (roleCodes.includes('FARM_MANAGER')) {
      paddyEntriesApi
        .list(accessToken)
        .then((entries) => {
          const pending = entries.filter((e) => e.status === 'SUBMITTED').length;
          setPersonalStats((prev) => [...prev,
            { label: 'Entries awaiting your Farm Supervisor’s approval', value: String(pending) },
          ]);
        })
        .catch(() => {});
    }

    if (roleCodes.includes('FINANCE_OFFICER')) {
      paymentsApi
        .list(accessToken)
        .then((payments) => {
          const mine = payments.filter((p) => p.recordedBy.id === me.id && isThisMonth(p.paymentDate));
          const total = mine.reduce((sum, p) => sum + p.amount, 0);
          setPersonalStats((prev) => [...prev,
            { label: 'Payments you recorded this month', value: `GHS ${total.toLocaleString('en-US', { maximumFractionDigits: 2 })}` },
          ]);
        })
        .catch(() => {});
    }

    if (roleCodes.includes('FINANCE_DIRECTOR')) {
      paymentsApi.list(accessToken).then(setFdPayments).catch(() => {});
      invoicesApi.list(accessToken).then(setFdInvoices).catch(() => {});
      expensesApi.list(accessToken).then(setFdExpenses).catch(() => {});
    }

    if (roleCodes.includes('FINANCE_DIRECTOR') || roleCodes.includes('FINANCE_OFFICER')) {
      salesOrdersApi.list(accessToken).then(setFinanceOrders).catch(() => {});
      expensesApi.list(accessToken).then(setFinanceExpenses).catch(() => {});
      receivablesApi.topDebtors(accessToken).then(setFinanceDebtors).catch(() => {});
      reportsApi.getWarehouseOverview(accessToken).then(setWarehouseOverview).catch(() => {});
    }

    if (roleCodes.includes('ADMIN')) {
      usersApi.list(accessToken).then((res) => setAdminUsers(res.items)).catch(() => {});
      auditApi.list(accessToken).then((res) => setAdminAuditLog(res.items)).catch(() => {});
      systemResetApi.list(accessToken).then(setAdminResetRequests).catch(() => {});
      backupApi.status(accessToken).then(setAdminBackupStatus).catch(() => {});
      masterDataApi.products(accessToken).then(setAdminProducts).catch(() => {});
      masterDataApi.packagingSizes(accessToken).then(setAdminPackagingSizes).catch(() => {});
    }

    if (roleCodes.includes('WAREHOUSE_MANAGER')) {
      shipmentsApi
        .list(accessToken)
        .then((shipments) => {
          const mine = shipments.filter((s) => s.receivedBy?.id === me.id && s.receivedAt && isThisMonth(s.receivedAt));
          const totalKg = mine.reduce((sum, s) => sum + (s.receivedKg ?? 0), 0);
          const inTransit = shipments.filter((s) => !s.receivedAt).length;
          setPersonalStats((prev) => [...prev, 
            { label: 'Shipments you received this month', value: String(mine.length) },
            { label: 'KG received this month', value: totalKg.toLocaleString('en-US', { maximumFractionDigits: 0 }), unit: 'KG' },
            { label: 'Shipments currently in transit', value: String(inTransit) },
          ]);
        })
        .catch(() => {});

      reportsApi.getWarehouseOverview(accessToken).then(setWarehouseOverview).catch((err: unknown) =>
        setWarehouseOverviewError(err instanceof ApiError ? err.message : 'Failed to load your warehouse’s overview.'),
      );
    }

    // Warehouse Supervisor's centralized version - every warehouse
    // aggregated by default, with the same tap-a-warehouse-to-drill-in
    // pattern already proven correct for Farm Supervisor's farms list.
    if (roleCodes.includes('WAREHOUSE_SUPERVISOR')) {
      reportsApi.getWarehouseOverview(accessToken).then(setWarehouseOverview).catch((err: unknown) =>
        setWarehouseOverviewError(err instanceof ApiError ? err.message : 'Failed to load the centralized warehouse overview.'),
      );
      warehousesApi.list(accessToken).then(setSupervisorWarehouses).catch(() => {});
      warehouseEquipmentApi.list(accessToken).then(setSupervisorWhEquipment).catch(() => {});
    }

    if (roleCodes.includes('MD') || roleCodes.includes('CEO')) {
      farmEquipmentApi.list(accessToken).then(setMdFarmEquipment).catch(() => {});
      warehouseEquipmentApi.list(accessToken).then(setMdWarehouseEquipment).catch(() => {});
      expensesApi.list(accessToken).then(setMdExpenses).catch(() => {});
      machinesApi.list(accessToken).then(setMdMachines).catch(() => {});
      salesOrdersApi.list(accessToken).then(setMdSalesOrders).catch(() => {});
      systemResetApi.list(accessToken).then((reqs) => setMdResetRequests(reqs.filter((r) => !r.mdApprovedBy && r.status !== 'REJECTED' && r.status !== 'CANCELLED'))).catch(() => {});
      callsApi.listMyCallRequests(accessToken).then((reqs) => setMdCallRequests(reqs.filter((r) => r.status === 'PENDING'))).catch(() => {});
    }

    if (roleCodes.includes('OPERATIONS_OFFICER')) {
      reportsApi.getWarehouseOverview(accessToken).then(setWarehouseOverview).catch((err: unknown) =>
        setWarehouseOverviewError(err instanceof ApiError ? err.message : 'Failed to load milling overview.'),
      );
      productionApi
        .list(accessToken)
        .then((records) => {
          const mine = records.filter((r) => r.operator.id === me.id && isThisMonth(r.date));
          const totalRecoveredKg = mine.reduce((sum, r) => sum + r.recoveredRiceKg, 0);
          setPersonalStats((prev) => [...prev, 
            { label: 'Production records logged this month', value: String(mine.length) },
            { label: 'Rice recovered this month', value: totalRecoveredKg.toLocaleString('en-US', { maximumFractionDigits: 0 }), unit: 'KG' },
          ]);
        })
        .catch(() => {});
    }

    // The three "line manager" roles - real team-management capability
    // was added to Farms/Warehouses/Users earlier; this surfaces it
    // here too, so it's not only discoverable by clicking into Users.
    // usersApi.list() is already correctly scoped server-side to each
    // of these roles' actual subordinate role (Farm Manager, Warehouse
    // Manager, Operations Officer respectively) - no client-side
    // filtering needed here, unlike the personal-activity stats above.
    if (roleCodes.some((r) => ['FARM_DIRECTOR', 'WAREHOUSE_SUPERVISOR', 'OPERATIONS_MANAGER'].includes(r))) {
      usersApi
        .list(accessToken)
        .then((res) => {
          setPersonalStats((prev) => [...prev, { label: 'People on your team', value: String(res.items.length) }]);
        })
        .catch(() => {});
    }

    if (roleCodes.includes('OPERATIONS_MANAGER')) {
      machinesApi.list(accessToken).then(setOpsManagerMachines).catch(() => {});
      expensesApi.list(accessToken).then(setOpsManagerExpenses).catch(() => {});
      reportsApi.getProductionOverview(accessToken).then(setProductionOverview).catch((err: unknown) =>
        setProductionOverviewError(err instanceof ApiError ? err.message : 'Failed to load the centralized production overview.'),
      );
    }
    // Farm Supervisor's operations panel - equipment across every farm
    // (so problems are visible before they become a crisis) and a
    // scrollable per-farm list, each showing its own inventory inline
    // once selected, rather than forcing a navigation away from this
    // page just to check on one farm.
    if (roleCodes.includes('FARM_DIRECTOR')) {
      farmsApi.list(accessToken).then(setSupervisorFarms).catch(() => {});
      farmEquipmentApi.list(accessToken).then(setSupervisorEquipment).catch(() => {});
      reportsApi.getFarmOverview(accessToken).then(setFarmOverview).catch((err: unknown) =>
        setFarmOverviewError(err instanceof ApiError ? err.message : 'Failed to load the centralized farm overview.'),
      );
      expensesApi.list(accessToken).then(setFarmDirectorExpenses).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, me]);

  const runResetApproval = async (id: string) => {
    if (!accessToken) return;
    try {
      await systemResetApi.approve(accessToken, id);
      setMdResetRequests((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // A page-level toast/error isn't wired up here yet - the request
      // simply stays in the list, visibly unresolved, rather than
      // silently disappearing on a failed approval.
    }
  };

  const onSelectWarehouse = (warehouseId: string | null) => {
    if (!accessToken) return;
    setSelectedWarehouseId(warehouseId);
    setWarehouseOverviewError(null);
    reportsApi.getWarehouseOverview(accessToken, warehouseId ?? undefined).then(setWarehouseOverview).catch((err: unknown) =>
      setWarehouseOverviewError(err instanceof ApiError ? err.message : 'Failed to load overview.'),
    );
  };

  const onDownloadWarehouseOverview = async (format: 'csv' | 'xlsx' | 'pdf') => {
    if (!accessToken) return;
    setDownloadingWarehouse(format);
    try {
      await reportsApi.downloadWarehouseOverview(accessToken, format, selectedWarehouseId ?? undefined);
    } catch (err) {
      setWarehouseOverviewError(err instanceof ApiError ? err.message : 'Failed to download.');
    } finally {
      setDownloadingWarehouse(null);
    }
  };

  const onSelectFarmForOverview = (farmId: string | null) => {
    if (!accessToken) return;
    setSelectedFarmIdForOverview(farmId);
    setFarmOverviewError(null);
    reportsApi.getFarmOverview(accessToken, farmId ?? undefined).then(setFarmOverview).catch((err: unknown) =>
      setFarmOverviewError(err instanceof ApiError ? err.message : 'Failed to load overview.'),
    );
  };

  const onDownloadFarmOverview = async (format: 'csv' | 'xlsx' | 'pdf') => {
    if (!accessToken) return;
    setDownloadingFarmOverview(format);
    try {
      await reportsApi.downloadFarmOverview(accessToken, format, selectedFarmIdForOverview ?? undefined);
    } catch (err) {
      setFarmOverviewError(err instanceof ApiError ? err.message : 'Failed to download.');
    } finally {
      setDownloadingFarmOverview(null);
    }
  };

  const onSelectMillingCenter = (millingCenterId: string | null) => {
    if (!accessToken) return;
    setSelectedMillingCenterId(millingCenterId);
    setProductionOverviewError(null);
    reportsApi.getProductionOverview(accessToken, millingCenterId ?? undefined).then(setProductionOverview).catch((err: unknown) =>
      setProductionOverviewError(err instanceof ApiError ? err.message : 'Failed to load overview.'),
    );
  };

  const onDownloadProductionOverview = async (format: 'csv' | 'xlsx' | 'pdf') => {
    if (!accessToken) return;
    setDownloadingProductionOverview(format);
    try {
      await reportsApi.downloadProductionOverview(accessToken, format, selectedMillingCenterId ?? undefined);
    } catch (err) {
      setProductionOverviewError(err instanceof ApiError ? err.message : 'Failed to download.');
    } finally {
      setDownloadingProductionOverview(null);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-rice-50">
        <p className="text-sm text-ink-500">Loading your dashboard…</p>
      </main>
    );
  }

  if (error || !me) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-rice-50">
        <p className="text-sm text-red-600">{error ?? 'Unable to load your session.'}</p>
      </main>
    );
  }

  // The nav sidebar handles primary navigation now - this page no
  // longer duplicates it as a grid of the same links.
  const myFarmId = myFarmIdRobust;
  const isFarmDirector = me.roles.some((r) => r.code === 'FARM_DIRECTOR');
  const isWarehouseManager = me.roles.some((r) => r.code === 'WAREHOUSE_MANAGER');
  const isWarehouseSupervisor = me.roles.some((r) => r.code === 'WAREHOUSE_SUPERVISOR');
  const isMdOrCeo = me.roles.some((r) => r.code === 'MD' || r.code === 'CEO');
  const isOperationsOfficer = me.roles.some((r) => r.code === 'OPERATIONS_OFFICER');
  const isOperationsManager = me.roles.some((r) => r.code === 'OPERATIONS_MANAGER');
  const isFinanceDirector = me.roles.some((r) => r.code === 'FINANCE_DIRECTOR');
  const isFinanceOfficer = me.roles.some((r) => r.code === 'FINANCE_OFFICER');
  const isAdmin = me.roles.some((r) => r.code === 'ADMIN');
  const isSalesOfficer = me.roles.some((r) => r.code === 'SALES_OFFICER');

  return (
    <DashboardShell me={me}>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-medium text-paddy-900">
          Welcome, {me.firstName} {me.lastName}
        </h1>
        <p className="text-sm text-ink-500">{me.roles.map((r) => r.code).join(', ')}</p>
      </div>

      {attention.length > 0 && (
        <div className="mb-8 overflow-hidden rounded-2xl bg-paddy-900">
          {attention.map((item, i) => (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center justify-between px-6 py-4 transition hover:bg-paddy-700 ${i > 0 ? 'border-t border-paddy-700' : ''}`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-husk-500 text-sm font-medium text-white">
                  {item.count}
                </span>
                <span className="text-sm font-medium text-rice-50">{item.label}</span>
              </div>
              <span className="text-xs font-medium text-husk-300">Review &rarr;</span>
            </Link>
          ))}
        </div>
      )}

      {personalStats.length > 0 && (
        <div className="mb-8">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Your activity this month</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {personalStats.map((stat) => (
              <StatCard key={stat.label} label={stat.label} value={stat.value} unit={stat.unit} tone="husk" />
            ))}
          </div>
        </div>
      )}

      {isFarmDirector && (
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-soil-500">Farm overview - every farm, centralized</p>
            {farmOverview && (
              <div className="flex gap-2">
                <button type="button" onClick={() => onDownloadFarmOverview('csv')} disabled={downloadingFarmOverview !== null} className="rounded-full border border-paddy-100 px-3 py-1.5 text-xs font-medium text-ink-700 disabled:opacity-50">
                  {downloadingFarmOverview === 'csv' ? 'Downloading…' : 'CSV'}
                </button>
                <button type="button" onClick={() => onDownloadFarmOverview('xlsx')} disabled={downloadingFarmOverview !== null} className="rounded-full border border-paddy-100 px-3 py-1.5 text-xs font-medium text-ink-700 disabled:opacity-50">
                  {downloadingFarmOverview === 'xlsx' ? 'Downloading…' : 'Excel'}
                </button>
                <button type="button" onClick={() => onDownloadFarmOverview('pdf')} disabled={downloadingFarmOverview !== null} className="rounded-full bg-paddy-900 px-3 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
                  {downloadingFarmOverview === 'pdf' ? 'Downloading…' : 'PDF'}
                </button>
              </div>
            )}
          </div>

          {supervisorFarms && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSelectFarmForOverview(null)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${!selectedFarmIdForOverview ? 'bg-paddy-900 text-rice-50' : 'bg-white text-ink-700 border border-paddy-100'}`}
              >
                All farms
              </button>
              {supervisorFarms.map((farm) => (
                <button
                  key={farm.id}
                  type="button"
                  onClick={() => onSelectFarmForOverview(farm.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${selectedFarmIdForOverview === farm.id ? 'bg-paddy-900 text-rice-50' : 'bg-white text-ink-700 border border-paddy-100'}`}
                >
                  {farm.name}
                </button>
              ))}
            </div>
          )}

          {farmOverviewError && <p className="mt-3 text-sm text-red-600">{farmOverviewError}</p>}

          {farmOverview && (
            <div className="mt-4 rounded-2xl border border-paddy-100 bg-white p-5">
              <h2 className="font-display text-lg text-paddy-900">🌾 Paddy rice</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {([
                  { key: 'received' as const, label: 'Received', data: farmOverview.paddy.received },
                  { key: 'available' as const, label: 'Available now', data: farmOverview.paddy.available },
                  { key: 'dispatched' as const, label: 'Dispatched', data: farmOverview.paddy.dispatched },
                ]).map((section) => {
                  const totalBags = section.data.reduce((s, g) => s + g.bags, 0);
                  const isOpen = farmOverviewSection === section.key;
                  return (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => setFarmOverviewSection(isOpen ? null : section.key)}
                      className={`rounded-xl bg-rice-50 p-4 text-left transition ${isOpen ? 'ring-2 ring-paddy-900' : ''}`}
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{section.label}</p>
                      <p className="mt-1 font-display text-2xl text-paddy-900">{totalBags.toLocaleString()} <span className="text-sm font-sans font-normal">bags</span></p>
                    </button>
                  );
                })}
              </div>
              {farmOverviewSection && (
                <div className="mt-3 border-t border-paddy-100 pt-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">By grade</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {farmOverview.paddy[farmOverviewSection].map((g) => (
                      <StatCard key={g.gradeLabel} label={g.gradeLabel} value={`${g.bags.toLocaleString()} bags`} unit={`(${fmtKg(g.kg)} KG)`} />
                    ))}
                    {farmOverview.paddy[farmOverviewSection].length === 0 && (
                      <p className="col-span-full text-sm text-ink-500">Nothing recorded yet.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowFarmExpensesList((v) => !v)}
            className={`mt-6 w-full rounded-2xl text-left transition ${showFarmExpensesList ? 'ring-2 ring-paddy-900' : ''}`}
          >
            <StatCard
              label="Expenses this month - tap to see details"
              value={`GHS ${farmDirectorExpenses.filter((e) => isThisMonth(e.date)).reduce((s, e) => s + e.amount, 0).toLocaleString()}`}
              unit={`${farmDirectorExpenses.filter((e) => isThisMonth(e.date)).length} expense${farmDirectorExpenses.filter((e) => isThisMonth(e.date)).length === 1 ? '' : 's'}`}
              tone="husk"
            />
          </button>

          {showFarmExpensesList && (
            <div className="mt-3 rounded-2xl border border-paddy-100 bg-white p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">This month&rsquo;s expenses</p>
              <div className="space-y-1.5">
                {farmDirectorExpenses.filter((e) => isThisMonth(e.date)).map((e) => (
                  <div key={e.id} className="flex items-center justify-between rounded-lg bg-rice-50 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-ink-900">{e.customCategoryLabel ?? e.category.name}</span>
                      <span className="ml-2 text-xs text-ink-500">{e.farm?.name ?? e.warehouse?.name ?? 'Unassigned'}</span>
                      {e.itemDescription && <span className="ml-2 text-xs text-ink-500">- {e.itemDescription}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink-900">GHS {e.amount.toLocaleString()}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.status === 'APPROVED' ? 'bg-paddy-700 text-rice-50' : e.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-husk-300 text-soil-700'}`}>
                        {e.status}
                      </span>
                    </div>
                  </div>
                ))}
                {farmDirectorExpenses.filter((e) => isThisMonth(e.date)).length === 0 && (
                  <p className="text-sm text-ink-500">No expenses recorded this month.</p>
                )}
              </div>
            </div>
          )}

          <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-soil-500">Farm equipment at a glance - tap a status to see which equipment</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setSelectedEquipmentStatus(selectedEquipmentStatus === 'WORKING' ? null : 'WORKING')}
              className={`w-full rounded-2xl text-left transition ${selectedEquipmentStatus === 'WORKING' ? 'ring-2 ring-paddy-900' : ''}`}
            >
              <StatCard
                label="Equipment working"
                value={String(supervisorEquipment.filter((e) => e.status === 'WORKING').length)}
                tone="paddy"
              />
            </button>
            <button
              type="button"
              onClick={() => setSelectedEquipmentStatus(selectedEquipmentStatus === 'NOT_WORKING' ? null : 'NOT_WORKING')}
              className={`w-full rounded-2xl text-left transition ${selectedEquipmentStatus === 'NOT_WORKING' ? 'ring-2 ring-paddy-900' : ''}`}
            >
              <StatCard
                label="Not working"
                value={String(supervisorEquipment.filter((e) => e.status === 'NOT_WORKING').length)}
              />
            </button>
            <button
              type="button"
              onClick={() => setSelectedEquipmentStatus(selectedEquipmentStatus === 'NEEDS_REPLACEMENT' ? null : 'NEEDS_REPLACEMENT')}
              className={`w-full rounded-2xl text-left transition ${selectedEquipmentStatus === 'NEEDS_REPLACEMENT' ? 'ring-2 ring-paddy-900' : ''}`}
            >
              <StatCard
                label="Needs replacement"
                value={String(supervisorEquipment.filter((e) => e.status === 'NEEDS_REPLACEMENT').length)}
              />
            </button>
          </div>

          {selectedEquipmentStatus && (
            <div className="mt-3 rounded-2xl border border-paddy-100 bg-white p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">
                {selectedEquipmentStatus === 'WORKING' ? 'Working' : selectedEquipmentStatus === 'NOT_WORKING' ? 'Not working' : 'Needs replacement'}
              </p>
              <div className="space-y-1.5">
                {supervisorEquipment.filter((e) => e.status === selectedEquipmentStatus).map((e) => (
                  <div key={e.id} className="flex items-center justify-between rounded-lg bg-rice-50 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-ink-900">{e.name}</span>
                      <span className="ml-2 text-xs text-ink-500">{e.farm.name}</span>
                    </div>
                    {e.notes && <span className="text-xs text-ink-500">{e.notes}</span>}
                  </div>
                ))}
                {supervisorEquipment.filter((e) => e.status === selectedEquipmentStatus).length === 0 && (
                  <p className="text-sm text-ink-500">Nothing in this category right now.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {(isWarehouseManager || isWarehouseSupervisor) && (
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-soil-500">
              {isWarehouseSupervisor ? 'Warehouse overview - every warehouse, centralized' : 'Your warehouse’s overview'}
            </p>
            {warehouseOverview && (
              <div className="flex gap-2">
                <button type="button" onClick={() => onDownloadWarehouseOverview('csv')} disabled={downloadingWarehouse !== null} className="rounded-full border border-paddy-100 px-3 py-1.5 text-xs font-medium text-ink-700 disabled:opacity-50">
                  {downloadingWarehouse === 'csv' ? 'Downloading…' : 'CSV'}
                </button>
                <button type="button" onClick={() => onDownloadWarehouseOverview('xlsx')} disabled={downloadingWarehouse !== null} className="rounded-full border border-paddy-100 px-3 py-1.5 text-xs font-medium text-ink-700 disabled:opacity-50">
                  {downloadingWarehouse === 'xlsx' ? 'Downloading…' : 'Excel'}
                </button>
                <button type="button" onClick={() => onDownloadWarehouseOverview('pdf')} disabled={downloadingWarehouse !== null} className="rounded-full bg-paddy-900 px-3 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
                  {downloadingWarehouse === 'pdf' ? 'Downloading…' : 'PDF'}
                </button>
              </div>
            )}
          </div>

          {isWarehouseSupervisor && supervisorWarehouses && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSelectWarehouse(null)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${!selectedWarehouseId ? 'bg-paddy-900 text-rice-50' : 'bg-white text-ink-700 border border-paddy-100'}`}
              >
                All warehouses
              </button>
              {supervisorWarehouses.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onSelectWarehouse(w.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${selectedWarehouseId === w.id ? 'bg-paddy-900 text-rice-50' : 'bg-white text-ink-700 border border-paddy-100'}`}
                >
                  {w.name}
                </button>
              ))}
            </div>
          )}

          {warehouseOverviewError && <p className="mt-3 text-sm text-red-600">{warehouseOverviewError}</p>}

          {warehouseOverview && (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-paddy-100 bg-white p-5">
                <h2 className="font-display text-lg text-paddy-900">🌾 Paddy rice</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {([
                    { key: 'received' as const, label: 'Received', data: warehouseOverview.paddy.received },
                    { key: 'available' as const, label: 'Available now', data: warehouseOverview.paddy.available },
                    { key: 'inTransit' as const, label: 'On shipment / in transit', data: warehouseOverview.paddy.inTransit },
                  ]).map((section) => {
                    const totalBags = section.data.reduce((s, g) => s + g.bags, 0);
                    const isOpen = warehouseSection === section.key;
                    return (
                      <button
                        key={section.key}
                        type="button"
                        onClick={() => setWarehouseSection(isOpen ? null : section.key)}
                        className={`rounded-xl bg-rice-50 p-4 text-left transition ${isOpen ? 'ring-2 ring-paddy-900' : ''}`}
                      >
                        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{section.label}</p>
                        <p className="mt-1 font-display text-2xl text-paddy-900">{totalBags.toLocaleString()} <span className="text-sm font-sans font-normal">bags</span></p>
                      </button>
                    );
                  })}
                </div>
                {warehouseSection && ['received', 'available', 'inTransit'].includes(warehouseSection) && (
                  <div className="mt-3 border-t border-paddy-100 pt-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">By size</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {(warehouseOverview.paddy[warehouseSection as 'received' | 'available' | 'inTransit']).map((g) => (
                        <StatCard key={g.gradeLabel} label={g.gradeLabel} value={`${g.bags.toLocaleString()} bags`} unit={`(${fmtKg(g.kg)} KG)`} />
                      ))}
                      {warehouseOverview.paddy[warehouseSection as 'received' | 'available' | 'inTransit'].length === 0 && (
                        <p className="col-span-full text-sm text-ink-500">Nothing recorded yet.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-paddy-100 bg-white p-5">
                <button type="button" onClick={() => setWarehouseSection(warehouseSection === 'milling' ? null : 'milling')} className="flex w-full items-center justify-between text-left">
                  <div>
                    <h2 className="font-display text-lg text-paddy-900">⚙️ At milling</h2>
                    <p className="text-xs text-ink-500">Paddy sent to the milling center, not yet processed.</p>
                  </div>
                  <p className="font-display text-2xl text-paddy-900">
                    {warehouseOverview.atMilling.reduce((s, g) => s + g.bags, 0).toLocaleString()} <span className="text-sm font-sans font-normal">bags</span>
                  </p>
                </button>
                {warehouseSection === 'milling' && (
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-paddy-100 pt-3 sm:grid-cols-4">
                    {warehouseOverview.atMilling.map((g) => (
                      <StatCard key={g.gradeLabel} label={g.gradeLabel} value={`${g.bags.toLocaleString()} bags`} unit={`(${fmtKg(g.kg)} KG)`} />
                    ))}
                    {warehouseOverview.atMilling.length === 0 && <p className="col-span-full text-sm text-ink-500">Nothing at milling right now.</p>}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-paddy-100 bg-white p-5">
                <button type="button" onClick={() => setWarehouseSection(warehouseSection === 'packaged' ? null : 'packaged')} className="flex w-full items-center justify-between text-left">
                  <div>
                    <h2 className="font-display text-lg text-paddy-900">📦 Packaged rice</h2>
                    <p className="text-xs text-ink-500">Finished product, by pack size.</p>
                  </div>
                  <p className="font-display text-2xl text-paddy-900">
                    {fmtKg(warehouseOverview.packagedRice.reduce((s, g) => s + g.kg, 0))}
                  </p>
                </button>
                {warehouseSection === 'packaged' && (
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-paddy-100 pt-3 sm:grid-cols-4">
                    {warehouseOverview.packagedRice.map((g) => (
                      <StatCard key={g.label} label={g.label} value={fmtKg(g.kg)} unit={`(${g.bags.toLocaleString()} bags)`} tone="husk" />
                    ))}
                    {warehouseOverview.packagedRice.length === 0 && <p className="col-span-full text-sm text-ink-500">No packaged rice recorded yet.</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {isWarehouseSupervisor && (
        <div className="mb-8">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Warehouse equipment at a glance - tap a status to see which equipment</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setSelectedWhEquipmentStatus(selectedWhEquipmentStatus === 'WORKING' ? null : 'WORKING')}
              className={`w-full rounded-2xl text-left transition ${selectedWhEquipmentStatus === 'WORKING' ? 'ring-2 ring-paddy-900' : ''}`}
            >
              <StatCard
                label="Equipment working"
                value={String(supervisorWhEquipment.filter((e) => e.status === 'WORKING').length)}
                tone="paddy"
              />
            </button>
            <button
              type="button"
              onClick={() => setSelectedWhEquipmentStatus(selectedWhEquipmentStatus === 'NOT_WORKING' ? null : 'NOT_WORKING')}
              className={`w-full rounded-2xl text-left transition ${selectedWhEquipmentStatus === 'NOT_WORKING' ? 'ring-2 ring-paddy-900' : ''}`}
            >
              <StatCard
                label="Not working"
                value={String(supervisorWhEquipment.filter((e) => e.status === 'NOT_WORKING').length)}
              />
            </button>
            <button
              type="button"
              onClick={() => setSelectedWhEquipmentStatus(selectedWhEquipmentStatus === 'NEEDS_REPLACEMENT' ? null : 'NEEDS_REPLACEMENT')}
              className={`w-full rounded-2xl text-left transition ${selectedWhEquipmentStatus === 'NEEDS_REPLACEMENT' ? 'ring-2 ring-paddy-900' : ''}`}
            >
              <StatCard
                label="Needs replacement"
                value={String(supervisorWhEquipment.filter((e) => e.status === 'NEEDS_REPLACEMENT').length)}
              />
            </button>
          </div>

          {selectedWhEquipmentStatus && (
            <div className="mt-3 rounded-2xl border border-paddy-100 bg-white p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">
                {selectedWhEquipmentStatus === 'WORKING' ? 'Working' : selectedWhEquipmentStatus === 'NOT_WORKING' ? 'Not working' : 'Needs replacement'}
              </p>
              <div className="space-y-1.5">
                {supervisorWhEquipment.filter((e) => e.status === selectedWhEquipmentStatus).map((e) => (
                  <div key={e.id} className="flex items-center justify-between rounded-lg bg-rice-50 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-ink-900">{e.name}</span>
                      <span className="ml-2 text-xs text-ink-500">{e.warehouse.name}</span>
                    </div>
                    {e.notes && <span className="text-xs text-ink-500">{e.notes}</span>}
                  </div>
                ))}
                {supervisorWhEquipment.filter((e) => e.status === selectedWhEquipmentStatus).length === 0 && (
                  <p className="text-sm text-ink-500">Nothing in this category right now.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {isOperationsManager && (
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-soil-500">Production overview - every milling center, centralized, this month</p>
            {productionOverview && (
              <div className="flex gap-2">
                <button type="button" onClick={() => onDownloadProductionOverview('csv')} disabled={downloadingProductionOverview !== null} className="rounded-full border border-paddy-100 px-3 py-1.5 text-xs font-medium text-ink-700 disabled:opacity-50">
                  {downloadingProductionOverview === 'csv' ? 'Downloading…' : 'CSV'}
                </button>
                <button type="button" onClick={() => onDownloadProductionOverview('xlsx')} disabled={downloadingProductionOverview !== null} className="rounded-full border border-paddy-100 px-3 py-1.5 text-xs font-medium text-ink-700 disabled:opacity-50">
                  {downloadingProductionOverview === 'xlsx' ? 'Downloading…' : 'Excel'}
                </button>
                <button type="button" onClick={() => onDownloadProductionOverview('pdf')} disabled={downloadingProductionOverview !== null} className="rounded-full bg-paddy-900 px-3 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
                  {downloadingProductionOverview === 'pdf' ? 'Downloading…' : 'PDF'}
                </button>
              </div>
            )}
          </div>

          {opsManagerMachines.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSelectMillingCenter(null)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${!selectedMillingCenterId ? 'bg-paddy-900 text-rice-50' : 'bg-white text-ink-700 border border-paddy-100'}`}
              >
                All milling centers
              </button>
              {Array.from(new Map(opsManagerMachines.map((m) => [m.millingCenter.id, m.millingCenter.name])).entries()).map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectMillingCenter(id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${selectedMillingCenterId === id ? 'bg-paddy-900 text-rice-50' : 'bg-white text-ink-700 border border-paddy-100'}`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {productionOverviewError && <p className="mt-3 text-sm text-red-600">{productionOverviewError}</p>}

          {productionOverview && (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-paddy-100 bg-white p-5">
                <h2 className="font-display text-lg text-paddy-900">🌾 Paddy processed</h2>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {productionOverview.processed.map((g) => (
                    <StatCard key={g.gradeLabel} label={g.gradeLabel} value={`${g.bags.toLocaleString()} bags`} unit={`(${fmtKg(g.kg)} KG)`} tone="paddy" />
                  ))}
                  {productionOverview.processed.length === 0 && (
                    <p className="col-span-full text-sm text-ink-500">Nothing processed this month yet.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-paddy-100 bg-white p-5">
                <h2 className="font-display text-lg text-paddy-900">⚙️ What it turned into</h2>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Recovered rice" value={fmtKg(productionOverview.recoveredRiceKg)} tone="paddy" />
                  <StatCard label="Broken rice" value={fmtKg(productionOverview.brokenRiceKg)} />
                  <StatCard label="Rice hull" value={fmtKg(productionOverview.riceHullKg)} />
                  <StatCard label="Recovery rate" value={`${productionOverview.recoveryPercent.toFixed(1)}%`} tone="husk" />
                </div>
                <p className="mt-3 border-t border-paddy-100 pt-3 text-xs text-ink-500">
                  {fmtKg(productionOverview.energyConsumedKwh)} kWh of energy used to produce this - the real baseline
                  this month&rsquo;s activity is building for future expectations.
                </p>
              </div>
            </div>
          )}

          <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-soil-500">Machinery at a glance - tap a status to see which machine</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setSelectedMachineStatusGroup(selectedMachineStatusGroup === 'running' ? null : 'running')}
              className={`w-full rounded-2xl text-left transition ${selectedMachineStatusGroup === 'running' ? 'ring-2 ring-paddy-900' : ''}`}
            >
              <StatCard
                label="Running or idle"
                value={String(opsManagerMachines.filter((m) => m.status === 'RUNNING' || m.status === 'IDLE').length)}
                tone="paddy"
              />
            </button>
            <button
              type="button"
              onClick={() => setSelectedMachineStatusGroup(selectedMachineStatusGroup === 'attention' ? null : 'attention')}
              className={`w-full rounded-2xl text-left transition ${selectedMachineStatusGroup === 'attention' ? 'ring-2 ring-paddy-900' : ''}`}
            >
              <StatCard
                label="Needs attention (maintenance, fault, or offline)"
                value={String(opsManagerMachines.filter((m) => !['RUNNING', 'IDLE'].includes(m.status)).length)}
              />
            </button>
          </div>

          {selectedMachineStatusGroup && (
            <div className="mt-3 rounded-2xl border border-paddy-100 bg-white p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">
                {selectedMachineStatusGroup === 'running' ? 'Running or idle' : 'Needs attention'}
              </p>
              <div className="space-y-1.5">
                {opsManagerMachines
                  .filter((m) => (selectedMachineStatusGroup === 'running' ? m.status === 'RUNNING' || m.status === 'IDLE' : !['RUNNING', 'IDLE'].includes(m.status)))
                  .map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg bg-rice-50 px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium text-ink-900">{m.machineName}</span>
                        <span className="ml-2 text-xs text-ink-500">{m.millingCenter.name}</span>
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${MACHINE_STATUS_STYLES[m.status] ?? 'bg-ink-500/10'}`}>{m.status}</span>
                    </div>
                  ))}
                {opsManagerMachines.filter((m) => (selectedMachineStatusGroup === 'running' ? m.status === 'RUNNING' || m.status === 'IDLE' : !['RUNNING', 'IDLE'].includes(m.status))).length === 0 && (
                  <p className="text-sm text-ink-500">Nothing in this category right now.</p>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Expenses pending approval"
              value={String(opsManagerExpenses.filter((e) => e.status === 'PENDING').length)}
              unit={`GHS ${opsManagerExpenses.filter((e) => e.status === 'PENDING').reduce((s, e) => s + e.amount, 0).toLocaleString()}`}
              tone="husk"
            />
            <StatCard
              label="Expenses this month"
              value={`GHS ${opsManagerExpenses.filter((e) => isThisMonth(e.date)).reduce((s, e) => s + e.amount, 0).toLocaleString()}`}
            />
            <StatCard
              label="Expenses approved this month"
              value={`GHS ${opsManagerExpenses.filter((e) => e.status === 'APPROVED' && isThisMonth(e.date)).reduce((s, e) => s + e.amount, 0).toLocaleString()}`}
            />
          </div>
        </div>
      )}


      {(isFinanceOfficer || isFinanceDirector) && (
        <div className="mb-8">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Finance overview - accountability and transparency, at a glance</p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Orders pending"
              value={String(financeOrders.filter((o) => ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'RESERVED'].includes(o.status)).length)}
              unit={`GHS ${financeOrders.filter((o) => ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'RESERVED'].includes(o.status)).reduce((s, o) => s + o.totalAmount, 0).toLocaleString()}`}
              tone="husk"
            />
            <StatCard
              label="Sold this month"
              value={String(financeOrders.filter((o) => o.status === 'FULFILLED' && isThisMonth(o.createdAt)).length)}
              unit={`GHS ${financeOrders.filter((o) => o.status === 'FULFILLED' && isThisMonth(o.createdAt)).reduce((s, o) => s + o.totalAmount, 0).toLocaleString()}`}
              tone="paddy"
            />
            <StatCard
              label="Owed to us (receivables)"
              value={`GHS ${financeDebtors.reduce((s, d) => s + d.outstanding, 0).toLocaleString()}`}
              unit={`${financeDebtors.length} customer${financeDebtors.length === 1 ? '' : 's'}`}
            />
            <StatCard
              label="Owed by us (approved expenses)"
              value={`GHS ${financeExpenses.filter((e) => e.status === 'APPROVED').reduce((s, e) => s + e.amount, 0).toLocaleString()}`}
              unit={`${financeExpenses.filter((e) => e.status === 'APPROVED').length} expense${financeExpenses.filter((e) => e.status === 'APPROVED').length === 1 ? '' : 's'}`}
              tone="soil"
            />
          </div>

          {warehouseOverview && warehouseOverview.packagedRice.length > 0 && (
            <div className="mt-4 rounded-2xl border border-paddy-100 bg-white p-5">
              <h2 className="font-display text-lg text-paddy-900">Packaged rice available to sell</h2>
              <p className="text-xs text-ink-500">Your jurisdiction is what&rsquo;s ready for sale - not raw paddy still in the fields or warehouses.</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {warehouseOverview.packagedRice.map((g) => (
                  <div key={g.label} className="rounded-lg bg-rice-50 px-3 py-2">
                    <p className="text-xs text-ink-500">{g.label}</p>
                    <p className="text-sm font-medium text-ink-900">{g.bags.toLocaleString()} bags</p>
                    <p className="text-xs text-ink-500">({fmtKg(g.kg)})</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {financeDebtors.length > 0 && (
            <div className="mt-4 rounded-2xl border border-paddy-100 bg-white p-5">
              <h2 className="font-display text-lg text-paddy-900">Who owes the company</h2>
              <div className="mt-3 space-y-1.5">
                {financeDebtors.slice(0, 8).map((d) => (
                  <div key={d.customerId} className="flex items-center justify-between rounded-lg bg-rice-50 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-ink-900">{d.customerName}</span>
                      <span className="ml-2 font-mono text-xs text-ink-500">{d.customerNumber}</span>
                    </div>
                    <span className="font-medium text-soil-700">GHS {d.outstanding.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isFinanceDirector && (
        <div className="mb-8">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Your approval queue - payments, expenses, and invoices at a glance</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Payments awaiting verification"
              value={String(fdPayments.filter((p) => p.status === 'PENDING_VERIFICATION').length)}
              unit={`GHS ${fdPayments.filter((p) => p.status === 'PENDING_VERIFICATION').reduce((s, p) => s + p.amount, 0).toLocaleString()}`}
              tone="husk"
            />
            <StatCard
              label="Expenses awaiting your approval"
              value={String(fdExpenses.filter((e) => e.status === 'PENDING').length)}
              unit={`GHS ${fdExpenses.filter((e) => e.status === 'PENDING').reduce((s, e) => s + e.amount, 0).toLocaleString()}`}
              tone="husk"
            />
            <StatCard
              label="Outstanding invoice balance"
              value={`GHS ${fdInvoices.reduce((s, i) => s + i.balance, 0).toLocaleString()}`}
              unit={`${fdInvoices.filter((i) => i.balance > 0).length} unpaid`}
            />
          </div>
        </div>
      )}

      {isMdOrCeo && (
        <div className="mb-8">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Company-wide operations - Farm Supervisor, Warehouse Supervisor, and Operations Manager, in one place</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Farm equipment working" value={String(mdFarmEquipment.filter((e) => e.status === 'WORKING').length)} unit={`of ${mdFarmEquipment.length}`} tone="paddy" />
            <StatCard label="Warehouse equipment working" value={String(mdWarehouseEquipment.filter((e) => e.status === 'WORKING').length)} unit={`of ${mdWarehouseEquipment.length}`} tone="paddy" />
            <StatCard label="Machines running or idle" value={String(mdMachines.filter((m) => m.status === 'RUNNING' || m.status === 'IDLE').length)} unit={`of ${mdMachines.length}`} tone="paddy" />
          </div>

          <div className="mt-4 rounded-2xl border border-paddy-100 bg-white p-5">
            <h2 className="font-display text-lg text-paddy-900">Sales orders</h2>
            <p className="text-xs text-ink-500">Every order in the pipeline - submitted orders now go to the Finance Director for clearance, not to you directly.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Awaiting Finance clearance"
                value={String(mdSalesOrders.filter((o) => o.status === 'SUBMITTED').length)}
                tone="husk"
              />
              <StatCard label="Reserved, ready for delivery" value={String(mdSalesOrders.filter((o) => o.status === 'RESERVED').length)} />
              <StatCard label="Fulfilled this month" value={String(mdSalesOrders.filter((o) => o.status === 'FULFILLED' && isThisMonth(o.createdAt)).length)} tone="paddy" />
              <StatCard
                label="Total order value this month"
                value={`GHS ${mdSalesOrders.filter((o) => isThisMonth(o.createdAt)).reduce((s, o) => s + o.totalAmount, 0).toLocaleString()}`}
              />
            </div>
          </div>

          {mdCallRequests.length > 0 && (
            <Link
              href="/messages"
              className="mt-4 flex items-center justify-between rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-4 transition hover:border-paddy-500"
            >
              <div>
                <p className="font-display text-base text-paddy-900">📞 {mdCallRequests.length} call request{mdCallRequests.length === 1 ? '' : 's'} waiting on you</p>
                <p className="text-xs text-ink-500">Approve one to call them back - opens in Messages.</p>
              </div>
              <span className="text-paddy-700">→</span>
            </Link>
          )}

          {mdResetRequests.length > 0 && (
            <div className="mt-4 rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-5">
              <h2 className="font-display text-lg text-paddy-900">Reset requests awaiting your approval</h2>
              <p className="text-xs text-ink-500">A genuinely sensitive, top-management responsibility - moved here from My Office so it&rsquo;s actually visible.</p>
              <div className="mt-3 space-y-1.5">
                {mdResetRequests.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-ink-900">{r.requestNumber} · {r.resetType.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-ink-500">Requested by {r.requestedBy.firstName} {r.requestedBy.lastName} - {r.reason}</p>
                      {r.financeApprovedBy && <p className="text-xs text-paddy-700">✓ Finance Director already approved</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => runResetApproval(r.id)}
                      className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50"
                    >
                      Approve
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-paddy-100 bg-white p-5">
            <h2 className="font-display text-lg text-paddy-900">Expenses by domain, this month</h2>
            <p className="text-xs text-ink-500">A real analytics view, not just a count - where spending is actually concentrated.</p>
            <div className="mt-4" style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <BarChart
                  data={[
                    { domain: 'Farms', amount: mdExpenses.filter((e) => e.farm && isThisMonth(e.date)).reduce((s, e) => s + e.amount, 0) },
                    { domain: 'Warehouses', amount: mdExpenses.filter((e) => e.warehouse && isThisMonth(e.date)).reduce((s, e) => s + e.amount, 0) },
                    { domain: 'Other', amount: mdExpenses.filter((e) => !e.farm && !e.warehouse && isThisMonth(e.date)).reduce((s, e) => s + e.amount, 0) },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#EDE6D6" />
                  <XAxis dataKey="domain" stroke="#8A7B62" fontSize={12} />
                  <YAxis stroke="#8A7B62" fontSize={12} />
                  <Tooltip formatter={(value: number) => `GHS ${value.toLocaleString()}`} contentStyle={{ borderRadius: 8, border: '1px solid #EDE6D6' }} />
                  <Bar dataKey="amount" fill="#C9982F" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Expenses pending approval"
              value={String(mdExpenses.filter((e) => e.status === 'PENDING').length)}
              unit={`GHS ${mdExpenses.filter((e) => e.status === 'PENDING').reduce((s, e) => s + e.amount, 0).toLocaleString()}`}
              tone="husk"
            />
            <StatCard
              label="Farm expenses this month"
              value={`GHS ${mdExpenses.filter((e) => e.farm && isThisMonth(e.date)).reduce((s, e) => s + e.amount, 0).toLocaleString()}`}
            />
            <StatCard
              label="Warehouse expenses this month"
              value={`GHS ${mdExpenses.filter((e) => e.warehouse && isThisMonth(e.date)).reduce((s, e) => s + e.amount, 0).toLocaleString()}`}
            />
          </div>
        </div>
      )}

      {myFarmId ? (
        myFarmInventoryError ? (
          <div className="mb-8 rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-700">Couldn&rsquo;t load your farm&rsquo;s inventory</p>
            <p className="text-xs text-red-600">{myFarmInventoryError}</p>
          </div>
        ) : !myFarmInventory ? (
          <p className="mb-8 text-sm text-ink-500">Loading your farm&rsquo;s inventory…</p>
        ) : (
          <div className="mb-8">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Your farm&rsquo;s inventory - available now</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatCard label="Total paddy on your farm" value={fmtKg(myFarmInventory.totalKg)} unit="KG" tone="paddy" />
              <StatCard label="Total bags" value={String(myFarmInventory.totalBags)} />
              {myFarmInventory.byGrade.map((g) => (
                <StatCard key={g.gradeCode} label={g.gradeLabel} value={`${g.bagCount.toLocaleString()} bags`} unit={`(${fmtKg(g.totalKg)} KG)`} />
              ))}
            </div>

            {myFarmInventory.dispatchedByGrade.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">What you&rsquo;ve dispatched - all sizes, every order ever sent</p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <StatCard label="Total dispatched" value={fmtKg(myFarmInventory.dispatchedTotalKg)} unit="KG" tone="husk" />
                  <StatCard label="Total bags sent" value={String(myFarmInventory.dispatchedTotalBags)} tone="husk" />
                  {myFarmInventory.dispatchedByGrade.map((g) => (
                    <StatCard key={g.gradeCode} label={g.gradeLabel} value={`${g.bagCount.toLocaleString()} bags`} unit={`(${fmtKg(g.totalKg)} KG)`} tone="husk" />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between rounded-2xl border border-paddy-100 bg-white p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-soil-500">🔧 Machinery &amp; equipment</p>
                <p className="mt-1 text-sm text-ink-700">
                  {myFarmEquipment.length === 0
                    ? 'Nothing recorded yet'
                    : `${myFarmEquipment.filter((e) => e.status === 'WORKING').length} working · ${myFarmEquipment.filter((e) => e.status === 'NOT_WORKING').length} not working · ${myFarmEquipment.filter((e) => e.status === 'NEEDS_REPLACEMENT').length} needs replacement`}
                </p>
              </div>
              <Link href="/expenses" className="whitespace-nowrap rounded-full bg-paddy-900 px-4 py-2 text-xs font-medium text-rice-50">
                {myFarmEquipment.length === 0 ? 'Log equipment →' : 'Manage equipment →'}
              </Link>
            </div>
          </div>
        )
      ) : (
        <div className="mb-8">

          {isOperationsOfficer && warehouseOverview && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              {warehouseOverview.atMilling.map((g) => (
                <StatCard key={g.gradeLabel} label={`Paddy at milling - ${g.gradeLabel}`} value={`${g.bags.toLocaleString()} bags`} unit={`(${fmtKg(g.kg)} KG)`} />
              ))}
              {warehouseOverview.atMilling.length === 0 && <StatCard label="Paddy at milling" value="0 bags" />}
              {warehouseOverview.packagedRice.map((g) => (
                <StatCard key={g.label} label={`Packaged rice - ${g.label}`} value={fmtKg(g.kg)} unit={`(${g.bags.toLocaleString()} bags)`} tone="husk" />
              ))}
            </div>
          )}

      {isSalesOfficer && (
        <div className="mb-8">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Your orders - delivered, pending, and everything else</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Delivered"
              value={String(salesOfficerOrders.filter((o) => o.status === 'FULFILLED').length)}
              tone="paddy"
            />
            <StatCard
              label="Pending"
              value={String(salesOfficerOrders.filter((o) => ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'RESERVED'].includes(o.status)).length)}
              tone="husk"
            />
            <StatCard
              label="Rejected or cancelled"
              value={String(salesOfficerOrders.filter((o) => ['REJECTED', 'CANCELLED'].includes(o.status)).length)}
            />
          </div>

          {warehouseOverview && warehouseOverview.packagedRice.length > 0 && (
            <div className="mt-4 rounded-2xl border border-paddy-100 bg-white p-5">
              <h2 className="font-display text-lg text-paddy-900">Available to sell</h2>
              <p className="text-xs text-ink-500">Packaged rice on hand right now, by size - your own jurisdiction, not the full system.</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {warehouseOverview.packagedRice.map((g) => (
                  <div key={g.label} className="rounded-lg bg-rice-50 px-3 py-2">
                    <p className="text-xs text-ink-500">{g.label}</p>
                    <p className="text-sm font-medium text-ink-900">{g.bags.toLocaleString()} bags</p>
                    <p className="text-xs text-ink-500">({fmtKg(g.kg)})</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

          {isAdmin && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              <StatCard label="Total users" value={String(adminUsers.length)} tone="paddy" />
              <StatCard label="Active users" value={String(adminUsers.filter((u) => u.status === 'ACTIVE').length)} />
              <StatCard label="Suspended or inactive" value={String(adminUsers.filter((u) => u.status !== 'ACTIVE').length)} />
              <StatCard label="Distinct roles in use" value={String(new Set(adminUsers.flatMap((u) => u.roles.map((r) => r.role.code))).size)} />
            </div>
          )}

          {isAdmin && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Link href="/admin" className="rounded-2xl border border-paddy-100 bg-white p-5 transition hover:border-paddy-500">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">System reset requests</p>
                <p className="mt-2 font-display text-lg text-paddy-900">
                  {adminResetRequests.filter((r) => r.status === 'APPROVED').length > 0
                    ? `${adminResetRequests.filter((r) => r.status === 'APPROVED').length} ready to execute`
                    : `${adminResetRequests.filter((r) => !['REJECTED', 'CANCELLED', 'EXECUTED'].includes(r.status)).length} in progress`}
                </p>
              </Link>
              <Link href="/admin" className="rounded-2xl border border-paddy-100 bg-white p-5 transition hover:border-paddy-500">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Last successful backup</p>
                <p className="mt-2 font-display text-lg text-paddy-900">
                  {adminBackupStatus?.lastSuccess?.completedAt ? new Date(adminBackupStatus.lastSuccess.completedAt).toLocaleDateString() : 'None recorded'}
                </p>
              </Link>
              <Link href="/master-data" className="rounded-2xl border border-paddy-100 bg-white p-5 transition hover:border-paddy-500">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Master data</p>
                <p className="mt-2 font-display text-lg text-paddy-900">
                  {adminProducts.filter((p) => p.isActive).length} products · {adminPackagingSizes.filter((s) => s.isActive).length} sizes active
                </p>
              </Link>
            </div>
          )}

          {isAdmin && adminAuditLog.length > 0 && (
            <div className="mt-4 rounded-2xl border border-paddy-100 bg-white p-5">
              <h2 className="font-display text-lg text-paddy-900">Recent system activity</h2>
              <div className="mt-3 space-y-1.5">
                {adminAuditLog.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-lg bg-rice-50 px-3 py-2 text-sm">
                    <span className="text-ink-900">
                      {entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'System'} - {entry.action}
                    </span>
                    <span className="text-xs text-ink-500">{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isOperationsOfficer && !isAdmin && !isSalesOfficer && !isFinanceOfficer && !isFinanceDirector && (summaryError ? (
            <p className="text-sm text-red-600">{summaryError}</p>
          ) : !summary ? (
            <p className="text-sm text-ink-500">Loading live figures…</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              <StatCard label="Paddy on farms" value={`${summary.totalPaddyAvailableBags.toLocaleString()} bags`} unit={`(${fmtKg(summary.totalPaddyAvailableKg)} KG)`} />
              <StatCard label="Paddy in transit" value={`${summary.paddyInTransitBags.toLocaleString()} bags`} unit={`(${fmtKg(summary.paddyInTransitKg)} KG)`} />
              {!isFarmDirector && <StatCard label="Paddy in warehouses" value={fmtKg(summary.paddyInWarehousesKg)} unit="KG" />}
              {!isFarmDirector && <StatCard label="Bulk rice at milling" value={fmtKg(summary.bulkRiceAtMillingKg)} unit="KG" />}
              {!isFarmDirector && <StatCard label="Packaged rice available" value={fmtKg(summary.packagedRiceAvailableKg)} unit="KG" tone="paddy" />}
              {hasFinancialVisibility(me) && (
                <>
                  <StatCard label="Sales today" value={fmtGHS(summary.salesTodayAmount)} tone="husk" />
                  <StatCard label="Sales this month" value={fmtGHS(summary.salesThisMonthAmount)} tone="husk" />
                  <StatCard label="Outstanding receivables" value={fmtGHS(summary.outstandingReceivables)} tone="soil" />
                  <StatCard label="Expenses this month" value={fmtGHS(summary.expensesThisMonth)} tone="soil" />
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
