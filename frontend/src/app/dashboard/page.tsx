'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useCurrentUser } from '@/lib/use-current-user';
import { DispatchDesk } from '@/components/dispatch/DispatchDesk';
import { SupplyDesk } from '@/components/supply/SupplyDesk';
import { ControlCenter, hasControlCenter } from '@/components/ControlCenter';
import { DashboardShell } from '@/components/DashboardShell';
import { hasFinancialVisibility } from '@/lib/nav-items';
import { YieldPredictionCard } from '@/components/DataEntryKit';
import { IconStatCard, DonutChart } from '@/components/StatCard';
import { FinanceDesk, ReleaseDesk, DeliveryDesk, MyOrdersDesk } from '@/components/SalesDesks';
import { roleLabel } from '@/lib/role-labels';
import { Wheat, Truck, Factory, Package, DollarSign } from 'lucide-react';
import { WatchlistCard } from '@/components/WatchlistCard';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { OutputFeedbackCard } from '@/components/OutputFeedbackCard';
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
  callsApi,
  CallRequest,
  Invoice,
  receivablesApi,
  TopDebtor,
  shipmentsApi,
  productionApi,
  usersApi,
  auditApi,
  AuditLogEntry,
  farmsApi,
  farmEquipmentApi,
  warehouseEquipmentApi,
  paddyGradesApi,
  PaddyGrade,
  YieldPrediction,
  analyticsApi,
  ExecutiveAnalytics,
  inventoryApi,
  InventorySummary,
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
      <p className="mt-2 font-display text-2xl">{value}
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
  const [opsOfficerThisMonth, setOpsOfficerThisMonth] = useState({ records: 0, processedKg: 0, recoveredKg: 0, recoveryPercent: 0 });
  const [myFarmInventory, setMyFarmInventory] = useState<{
    totalKg: number;
    totalBags: number;
    byGrade: { gradeCode: string; gradeLabel: string; bagCount: number; totalKg: number }[];
    dispatchedByGrade: { gradeCode: string; gradeLabel: string; bagCount: number; totalKg: number }[];
    dispatchedTotalKg: number;
    dispatchedTotalBags: number;
  } | null>(null);
  const [myFarmIdRobust, setMyFarmIdRobust] = useState<string | null>(null);
  const [myFarmPendingCount, setMyFarmPendingCount] = useState(0);
  const [myFarmApprovedTodayCount, setMyFarmApprovedTodayCount] = useState(0);
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
  // A real, concrete gap this closes: MD/CEO already held every
  // permission needed to see the company's live activity and its
  // yield/energy predictions (audit.view, milling.view), but nothing
  // on their own dashboard ever surfaced either - both existed only as
  // separate pages someone would have to already know to visit.
  const [mdActivityLog, setMdActivityLog] = useState<AuditLogEntry[]>([]);
  const [mdActivityLogError, setMdActivityLogError] = useState<string | null>(null);
  const [mdGrades, setMdGrades] = useState<PaddyGrade[]>([]);
  // Real per-location rows, not fabricated: no single endpoint returns
  // a company-wide breakdown by individual farm or warehouse (only
  // company-wide totals), so each farm's and warehouse's real current
  // stock is fetched directly, one call per location, via Promise.all.
  const [mdFarmTable, setMdFarmTable] = useState<{ name: string; isActive: boolean; totalBags: number; totalKg: number }[]>([]);
  const [mdWarehouseTable, setMdWarehouseTable] = useState<{ name: string; paddyKg: number; packagedKg: number }[]>([]);
  const [mdAnalytics, setMdAnalytics] = useState<ExecutiveAnalytics | null>(null);
  const [mdInventorySummary, setMdInventorySummary] = useState<InventorySummary | null>(null);
  const [mdPredictGradeId, setMdPredictGradeId] = useState('');
  const [mdPredictBags, setMdPredictBags] = useState('1000');
  const [mdPrediction, setMdPrediction] = useState<YieldPrediction | null>(null);
  const [mdPredicting, setMdPredicting] = useState(false);
  // Finance Director's overview (the Finance Officer role was merged into it): packaged rice actually available to sell, the
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
  // Auditor's own dashboard - the last role that still fell into the
  // generic company summary with nothing about its actual job. An
  // Auditor's day is the audit trail itself, so it leads here: who did
  // what, most recent first, with a real error state rather than a
  // silent blank if the log fails to load.
  const [auditorLog, setAuditorLog] = useState<AuditLogEntry[]>([]);
  const [auditorLogError, setAuditorLogError] = useState<string | null>(null);
  // Surfacing what Admin can now actually do with their expanded
  // capability - reset requests genuinely awaiting action (create the
  // request UI now exists, so this stat is finally meaningful), backup
  // health, and master-data counts, all linking straight to the real
  // pages rather than just restating "you have access" with no numbers
  // behind it.
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
  const [farmDirectorPendingCount, setFarmDirectorPendingCount] = useState(0);
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
    // The System Administrator's page (AdminDashboard) loads its own data, so none of the other roles' desks and
    // summaries are fetched for them. Without this, an Administrator, who now passes every permission check, would
    // trigger every one of those requests for a page that never shows them.
    if (me.roles.some((r) => r.code === 'ADMIN')) return;
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
          .then((orders) => {
            const mine = orders.filter((o) => o.submittedById !== me?.id);
            return mine.length > 0 ? { label: 'Sales orders waiting for your review', count: mine.length, href: '/sales' } : null;
          })
          .catch(() => null),
      );
    }
    if (hasPermission('sales.release')) {
      items.push(
        salesOrdersApi
          .list(accessToken, 'APPROVED')
          .then((orders) => (orders.length > 0 ? { label: 'Orders approved by Finance, waiting for you to release for delivery', count: orders.length, href: '/sales' } : null))
          .catch(() => null),
      );
    }
    if (hasPermission('sales.assign')) {
      items.push(
        salesOrdersApi
          .list(accessToken, 'RELEASED')
          .then((orders) => (orders.length > 0 ? { label: 'Released orders waiting for you to choose a warehouse', count: orders.length, href: '/sales' } : null))
          .catch(() => null),
      );
    }
    if (hasPermission('sales.fulfill')) {
      items.push(
        salesOrdersApi
          .list(accessToken)
          .then((everything) => {
            const orders = everything.filter((o) => ['RESERVED', 'PROCESSING', 'ON_TRACK'].includes(o.status));
            const scoped = me?.roles.some((r) => r.scopes.some((sc) => sc.scopeType === 'GLOBAL'))
              ? orders
              : orders.filter((o) => o.allocatedWarehouse && (me?.roles ?? []).some((r) => r.scopes.some((sc) => sc.scopeType === 'WAREHOUSE' && sc.scopeId === o.allocatedWarehouse?.id)));
            return scoped.length > 0 ? { label: 'Orders at your warehouse to process, send or confirm', count: scoped.length, href: '/sales' } : null;
          })
          .catch(() => null),
      );
    }
    if (hasPermission('finance.approve.director')) {
      items.push(
        expensesApi
          .list(accessToken, 'PENDING')
          .then((list) => {
            const n = list.filter((e) => e.submittedByFinanceDirector).length;
            return n > 0 ? { label: 'Expenses the Finance Director entered, waiting for your approval', count: n, href: '/expenses' } : null;
          })
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
    (hasPermission('farm.view') ? farmsApi.list(accessToken) : Promise.resolve([] as Awaited<ReturnType<typeof farmsApi.list>>)).then((list) => {
      if (list.length === 1) {
        const farmId = list[0].id;
        setMyFarmIdRobust(farmId);
        farmsApi.getInventory(accessToken, farmId)
          .then(setMyFarmInventory)
          .catch((err: unknown) => setMyFarmInventoryError(err instanceof ApiError ? err.message : 'Failed to load your farm’s inventory.'));
        farmEquipmentApi.list(accessToken, farmId).then(setMyFarmEquipment).catch(() => {});
        paddyEntriesApi.list(accessToken, farmId, 'SUBMITTED').then((list) => setMyFarmPendingCount(list.length)).catch(() => {});
        // "Approved today" - filtered client-side from this farm's
        // approved entries, since no status+date-range query param
        // exists on this endpoint; a single farm's own entry count is
        // small enough that this is a real, correct count, not an
        // approximation.
        paddyEntriesApi.list(accessToken, farmId, 'APPROVED').then((list) =>
          setMyFarmApprovedTodayCount(list.filter((e) => new Date(e.entryDate).toDateString() === new Date().toDateString()).length),
        ).catch(() => {});
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

    if (roleCodes.includes('FINANCE_DIRECTOR')) {
      salesOrdersApi.list(accessToken).then(setFinanceOrders).catch(() => {});
      expensesApi.list(accessToken).then(setFinanceExpenses).catch(() => {});
      receivablesApi.topDebtors(accessToken).then(setFinanceDebtors).catch(() => {});
      reportsApi.getWarehouseOverview(accessToken).then(setWarehouseOverview).catch(() => {});
    }

    if (roleCodes.includes('AUDITOR')) {
      auditApi.list(accessToken).then((res) => setAuditorLog(res.items)).catch((err: unknown) =>
        setAuditorLogError(err instanceof ApiError ? err.message : 'Failed to load the audit trail.'),
      );
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
      auditApi.list(accessToken).then((res) => setMdActivityLog(res.items)).catch((err: unknown) =>
        setMdActivityLogError(err instanceof ApiError ? err.message : 'Failed to load the activity log.'),
      );
      paddyGradesApi.list(accessToken).then((list) => {
        setMdGrades(list);
        if (list.length > 0) {
          setMdPredictGradeId((prev) => prev || list[0].id);
          // First prediction fires as soon as a grade is known - the
          // panel opens with a real answer already showing, not an
          // empty form waiting to be filled in.
          setMdPredicting(true);
          productionApi.predict(accessToken, list[0].id, 1000).then(setMdPrediction).finally(() => setMdPredicting(false));
        }
      }).catch(() => {});

      analyticsApi.get(accessToken).then(setMdAnalytics).catch(() => {});
      inventoryApi.getSummary(accessToken).then(setMdInventorySummary).catch(() => {});

      farmsApi.list(accessToken).then((farms) => {
        Promise.all(farms.map((f) =>
          farmsApi.getInventory(accessToken, f.id).then((inv) => ({ name: f.name, isActive: f.isActive, totalBags: inv.totalBags ?? 0, totalKg: inv.totalKg ?? 0 })),
        )).then(setMdFarmTable).catch(() => {});
      }).catch(() => {});

      warehousesApi.list(accessToken).then((warehouses) => {
        Promise.all(warehouses.map((w) =>
          warehousesApi.getInventory(accessToken, w.id).then((inv) => ({
            name: w.name,
            paddyKg: inv.paddyTotalKg,
            packagedKg: inv.packagedByProduct.reduce((s, p) => s + p.totalKg, 0),
          })),
        )).then(setMdWarehouseTable).catch(() => {});
      }).catch(() => {});
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
          const totalProcessedKg = mine.reduce((sum, r) => sum + r.paddyProcessedKg, 0);
          setPersonalStats((prev) => [...prev, 
            { label: 'Production records logged this month', value: String(mine.length) },
            { label: 'Rice recovered this month', value: totalRecoveredKg.toLocaleString('en-US', { maximumFractionDigits: 0 }), unit: 'KG' },
          ]);
          setOpsOfficerThisMonth({
            records: mine.length,
            processedKg: totalProcessedKg,
            recoveredKg: totalRecoveredKg,
            // A true recovery rate, not an average-of-percentages - the
            // same real-vs-fabricated distinction already applied to
            // Operations Manager's own productionOverview figure.
            recoveryPercent: totalProcessedKg > 0 ? (totalRecoveredKg / totalProcessedKg) * 100 : 0,
          });
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
      paddyEntriesApi.list(accessToken, undefined, 'SUBMITTED').then((list) => setFarmDirectorPendingCount(list.length)).catch(() => {});
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
  const isFarmManager = me.roles.some((r) => r.code === 'FARM_MANAGER');
  const isWarehouseManager = me.roles.some((r) => r.code === 'WAREHOUSE_MANAGER');
  const isWarehouseSupervisor = me.roles.some((r) => r.code === 'WAREHOUSE_SUPERVISOR');
  const isMdOrCeo = me.roles.some((r) => r.code === 'MD' || r.code === 'CEO');
  // A plain function, not a hook, deliberately - this runs from the
  // grade-select and bag-input's own onChange, well after the
  // component's hooks have already all been called in a fixed order.
  const runMdPrediction = (gradeId: string, bags: string) => {
    if (!accessToken || !gradeId) return;
    const n = parseInt(bags, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    setMdPredicting(true);
    productionApi.predict(accessToken, gradeId, n).then(setMdPrediction).finally(() => setMdPredicting(false));
  };
  const isOperationsOfficer = me.roles.some((r) => r.code === 'OPERATIONS_OFFICER');
  const isOperationsManager = me.roles.some((r) => r.code === 'OPERATIONS_MANAGER');
  const isFinanceDirector = me.roles.some((r) => r.code === 'FINANCE_DIRECTOR');
  // Warehouse-scoped people (a Warehouse Manager) only see deliveries leaving their own warehouse.
  const deliveryScope: string[] | null = me.roles.some((r) => r.scopes.some((sc) => sc.scopeType === 'GLOBAL'))
    ? null
    : me.roles.flatMap((r) => r.scopes.filter((sc) => sc.scopeType === 'WAREHOUSE' && sc.scopeId).map((sc) => sc.scopeId as string));
  const isAdmin = me.roles.some((r) => r.code === 'ADMIN');
  const isSalesOfficer = me.roles.some((r) => r.code === 'SALES_OFFICER');
  const isAuditor = me.roles.some((r) => r.code === 'AUDITOR');

  // The System Administrator has a page of their own (control center, demo switch, resets, backups), not the
  // desks and task strips the other roles share.
  if (isAdmin && accessToken) {
    return (
      <DashboardShell me={me}>
        <AdminDashboard me={me} accessToken={accessToken} />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell me={me}>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-medium text-paddy-900">
          Welcome, {me.firstName} {me.lastName}
        </h1>
        <p className="text-sm text-ink-500">{me.roles.map((r) => roleLabel(r.code)).join(', ')}</p>
      </div>

      {accessToken && hasControlCenter(me) && <div className="mb-8"><ControlCenter accessToken={accessToken} me={me} /></div>}

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

      {accessToken && (
        <>
          {(isFarmDirector || isFarmManager) && <div className="mb-8" data-testid="dashboard-dispatch-desk"><DispatchDesk accessToken={accessToken} me={me} hasPermission={hasPermission} variant="dashboard" /></div>}
          {hasPermission('supply.view') && (hasPermission('supply.request') || hasPermission('supply.forward') || hasPermission('supply.fulfil')) && <div className="mb-8" data-testid="dashboard-supply-desk"><SupplyDesk accessToken={accessToken} me={me} hasPermission={hasPermission} variant="dashboard" /></div>}
          {isFinanceDirector && <FinanceDesk accessToken={accessToken} meId={me.id} />}
          {isMdOrCeo && <ReleaseDesk accessToken={accessToken} canApproveDirectorExpenses={hasPermission('finance.approve.director')} />}
          {isMdOrCeo && <OutputFeedbackCard accessToken={accessToken} />}
          {hasPermission('sales.fulfill') && <DeliveryDesk accessToken={accessToken} onlyWarehouseIds={deliveryScope} canAssign={hasPermission('sales.assign')} />}
          {isSalesOfficer && <MyOrdersDesk accessToken={accessToken} meId={me.id} firstName={me.firstName} />}
        </>
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
          {/* Headline row matching the new reference's "Land" stats -
              all four figures real: available/in-transit are the same
              farmOverview data the detail panel below already shows,
              never a second, different source that could drift from
              it. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <IconStatCard icon={Wheat} tone="green" label="Total paddy (all farms)" value={`${(farmOverview?.paddy.available.reduce((s, g) => s + g.kg, 0) ?? 0).toLocaleString()} kg`} />
            <IconStatCard icon={Truck} tone="blue" label="In transit" value={`${(farmOverview?.paddy.dispatched.reduce((s, g) => s + g.kg, 0) ?? 0).toLocaleString()} kg`} />
            <IconStatCard icon={Factory} tone="purple" label="Pending approvals" value={String(farmDirectorPendingCount)} />
            <IconStatCard icon={Package} tone="orange" label="Farms" value={String(supervisorFarms?.length ?? 0)} />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
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
              <h2 className="font-display text-lg text-paddy-900">Paddy rice</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">{selectedEquipmentStatus === 'WORKING' ? 'Working' : selectedEquipmentStatus === 'NOT_WORKING' ? 'Not working' : 'Needs replacement'}
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
          {/* Headline row, real data throughout - every figure here is
              the exact same warehouseOverview the detail panel below
              already renders, just surfaced as the new icon-card
              format rather than a second, separately-fetched source. */}
          {warehouseOverview && (
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <IconStatCard icon={Wheat} tone="green" label="Paddy available" value={`${warehouseOverview.paddy.available.reduce((s, g) => s + g.kg, 0).toLocaleString()} kg`} />
              <IconStatCard icon={Truck} tone="blue" label="In transit" value={`${warehouseOverview.paddy.inTransit.reduce((s, g) => s + g.kg, 0).toLocaleString()} kg`} />
              <IconStatCard icon={Factory} tone="purple" label="At milling" value={`${warehouseOverview.atMilling.reduce((s, g) => s + g.kg, 0).toLocaleString()} kg`} />
              <IconStatCard icon={Package} tone="orange" label="Packaged rice" value={`${warehouseOverview.packagedRice.reduce((s, p) => s + p.kg, 0).toLocaleString()} kg`} />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-soil-500">{isWarehouseSupervisor ? 'Warehouse overview - every warehouse, centralized' : 'Your warehouse’s overview'}
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
                <h2 className="font-display text-lg text-paddy-900">Paddy rice</h2>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                    <h2 className="font-display text-lg text-paddy-900">At milling</h2>
                    <p className="text-xs text-ink-500">Paddy sent to the milling center, not yet processed.</p>
                  </div>
                  <p className="font-display text-2xl text-paddy-900">{warehouseOverview.atMilling.reduce((s, g) => s + g.bags, 0).toLocaleString()} <span className="text-sm font-sans font-normal">bags</span>
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
                    <h2 className="font-display text-lg text-paddy-900">Packaged rice</h2>
                    <p className="text-xs text-ink-500">Finished product, by pack size.</p>
                  </div>
                  <p className="font-display text-2xl text-paddy-900">{fmtKg(warehouseOverview.packagedRice.reduce((s, g) => s + g.kg, 0))}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">{selectedWhEquipmentStatus === 'WORKING' ? 'Working' : selectedWhEquipmentStatus === 'NOT_WORKING' ? 'Not working' : 'Needs replacement'}
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
          {/* Headline row - the exact same productionOverview the
              detail panel below already renders, in the new icon-card
              format. Matches the reference's Total Processed/Recovered
              Rice/Broken Rice/Efficiency stats precisely, since this
              endpoint already tracks all four as real figures. */}
          {productionOverview && (
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <IconStatCard icon={Wheat} tone="green" label="Total processed" value={`${productionOverview.processed.reduce((s, g) => s + g.kg, 0).toLocaleString()} kg`} />
              <IconStatCard icon={Package} tone="blue" label="Recovered rice" value={fmtKg(productionOverview.recoveredRiceKg)} />
              <IconStatCard icon={Truck} tone="orange" label="Broken rice" value={fmtKg(productionOverview.brokenRiceKg)} />
              <IconStatCard icon={Factory} tone="purple" label="Efficiency" value={`${productionOverview.recoveryPercent.toFixed(1)}%`} />
            </div>
          )}

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
                <h2 className="font-display text-lg text-paddy-900">Paddy processed</h2>
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
                <h2 className="font-display text-lg text-paddy-900">What it turned into</h2>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Recovered rice" value={fmtKg(productionOverview.recoveredRiceKg)} tone="paddy" />
                  <StatCard label="Broken rice" value={fmtKg(productionOverview.brokenRiceKg)} />
                  <StatCard label="Rice hull" value={fmtKg(productionOverview.riceHullKg)} />
                  <StatCard label="Recovery rate" value={`${productionOverview.recoveryPercent.toFixed(1)}%`} tone="husk" />
                </div>
                <p className="mt-3 border-t border-paddy-100 pt-3 text-xs text-ink-500">{fmtKg(productionOverview.energyConsumedKwh)} kWh of energy used to produce this - the real baseline
                  this month&rsquo;s activity is building for future expectations.
                </p>
              </div>
            </div>
          )}

          <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-soil-500">Machinery at a glance - tap a status to see which machine</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">{selectedMachineStatusGroup === 'running' ? 'Running or idle' : 'Needs attention'}
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

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
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


      {isFinanceDirector && (
        <div className="mb-8">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Finance overview - accountability and transparency, at a glance</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <IconStatCard
              icon={Truck} tone="orange" label="Orders pending"
              value={String(financeOrders.filter((o) => ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'RELEASED', 'RESERVED', 'PROCESSING', 'ON_TRACK'].includes(o.status)).length)}
              trend={`GHS ${financeOrders.filter((o) => ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'RELEASED', 'RESERVED', 'PROCESSING', 'ON_TRACK'].includes(o.status)).reduce((s, o) => s + o.totalAmount, 0).toLocaleString()}`}
            />
            <IconStatCard
              icon={Package} tone="green" label="Sold this month"
              value={String(financeOrders.filter((o) => o.status === 'FULFILLED' && isThisMonth(o.createdAt)).length)}
              trend={`GHS ${financeOrders.filter((o) => o.status === 'FULFILLED' && isThisMonth(o.createdAt)).reduce((s, o) => s + o.totalAmount, 0).toLocaleString()}`}
            />
            <IconStatCard
              icon={DollarSign} tone="blue" label="Owed to us (receivables)"
              value={`GHS ${financeDebtors.reduce((s, d) => s + d.outstanding, 0).toLocaleString()}`}
              trend={`${financeDebtors.length} customer${financeDebtors.length === 1 ? '' : 's'}`}
            />
            <IconStatCard
              icon={Factory} tone="purple" label="Owed by us (approved expenses)"
              value={`GHS ${financeExpenses.filter((e) => e.status === 'APPROVED').reduce((s, e) => s + e.amount, 0).toLocaleString()}`}
              trend={`${financeExpenses.filter((e) => e.status === 'APPROVED').length} expense${financeExpenses.filter((e) => e.status === 'APPROVED').length === 1 ? '' : 's'}`}
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

      {isMdOrCeo && (
        <div className="mb-8">
          <Link
            href="/oversight"
            className="mb-4 flex items-center justify-between gap-4 rounded-2xl border-2 border-paddy-900 bg-paddy-900 p-5 text-rice-50 transition hover:bg-paddy-700"
          >
            <div>
              <p className="font-display text-lg">Oversight: the whole company in one place</p>
              <p className="mt-0.5 text-sm text-paddy-100">Spend at every farm and warehouse, power use and expected output at each milling center, plus stock, sales, and what needs attention.</p>
            </div>
            <span className="shrink-0 text-2xl">→</span>
          </Link>

          <WatchlistCard accessToken={accessToken} />

          {/* The headline view, matching the new reference design -
              every figure below is real: current snapshot totals from
              the same inventory-summary endpoint /inventory itself
              uses, and this month's real sales from the same analytics
              endpoint /analytics itself uses. "Milled today" in the
              reference would need a daily-throughput figure this
              system doesn't track anywhere - labelled honestly as
              "Currently at milling" (a real snapshot) instead of
              inventing a per-day number. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <IconStatCard icon={Wheat} tone="green" label="Paddy on farms" value={`${(mdInventorySummary?.paddy.farmKg ?? 0).toLocaleString()} kg`} />
            <IconStatCard icon={Truck} tone="blue" label="In transit" value={`${(mdInventorySummary?.paddy.inTransitKg ?? 0).toLocaleString()} kg`} />
            <IconStatCard icon={Factory} tone="purple" label="Currently at milling" value={`${(mdInventorySummary?.paddy.atMillingKg ?? 0).toLocaleString()} kg`} />
            <IconStatCard icon={Package} tone="orange" label="Packaged rice" value={`${(mdInventorySummary?.finishedRice.reduce((s, r) => s + r.availableKg, 0) ?? 0).toLocaleString()} kg`} />
            <IconStatCard icon={DollarSign} tone="teal" label="Sales this month" value={`GHS ${(mdAnalytics?.monthlySales.at(-1)?.amount ?? 0).toLocaleString()}`} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-paddy-100 bg-white p-5 lg:col-span-1">
              <h2 className="font-display text-lg text-paddy-900">Inventory overview</h2>
              <div className="mt-4">
                {mdInventorySummary ? (
                  <DonutChart
                    centerLabel={`${(mdInventorySummary.paddy.farmKg + mdInventorySummary.paddy.warehouseKg + mdInventorySummary.finishedRice.reduce((s, r) => s + r.totalKg, 0)).toLocaleString()} kg`}
                    data={[
                      { name: 'Paddy (farms)', value: mdInventorySummary.paddy.farmKg },
                      { name: 'Paddy (warehouses)', value: mdInventorySummary.paddy.warehouseKg },
                      { name: 'Packaged rice', value: mdInventorySummary.finishedRice.reduce((s, r) => s + r.totalKg, 0) },
                      { name: 'Rice hull', value: mdInventorySummary.riceHullKg },
                      { name: 'Broken rice', value: mdInventorySummary.brokenRiceKg },
                    ]}
                  />
                ) : <p className="text-sm text-ink-500">Loading…</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-paddy-100 bg-white p-5 lg:col-span-1">
              <h2 className="font-display text-lg text-paddy-900">Sales vs. expenses</h2>
              <p className="text-xs text-ink-500">Last 6 months, real figures - the same chart /analytics shows in full.</p>
              <div className="mt-3" style={{ width: '100%', height: 180 }}>
                {mdAnalytics ? (
                  <ResponsiveContainer>
                    <BarChart data={mdAnalytics.monthlySales.map((s, i) => ({ month: s.month.slice(5), sales: s.amount, expenses: mdAnalytics.monthlyExpenses[i]?.amount ?? 0 }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EDE6D6" />
                      <XAxis dataKey="month" stroke="#8A7B62" fontSize={11} />
                      <YAxis stroke="#8A7B62" fontSize={11} />
                      <Tooltip formatter={(v: number) => `GHS ${v.toLocaleString()}`} contentStyle={{ borderRadius: 8, border: '1px solid #EDE6D6' }} />
                      <Bar dataKey="sales" fill="#1F4D2C" radius={[4, 4, 0, 0]} name="Sales" />
                      <Bar dataKey="expenses" fill="#C9972B" radius={[4, 4, 0, 0]} name="Expenses" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-ink-500">Loading…</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-paddy-100 bg-white p-5 lg:col-span-1">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-lg text-paddy-900">Recent activity</h2>
                <Link href="/audit-log" className="shrink-0 text-xs font-medium text-paddy-700 hover:underline">View all →</Link>
              </div>
              {mdActivityLogError ? (
                <p className="mt-3 text-sm text-red-600">{mdActivityLogError}</p>
              ) : (
                <div className="mt-3 space-y-1.5">
                  {mdActivityLog.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="rounded-lg bg-rice-50 px-3 py-2 text-xs">
                      <p className="truncate text-ink-900"><span className="font-medium">{entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'System'}</span> {entry.action}</p>
                      <p className="text-ink-500">{new Date(entry.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-paddy-100 bg-white p-5">
              <h2 className="font-display text-lg text-paddy-900">Farm performance</h2>
              <p className="text-xs text-ink-500">Real current stock per farm - no moisture or weekly-trend figure is tracked at this level, so neither is shown here.</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-ink-500">
                      <th className="pb-2 font-medium">Farm</th>
                      <th className="pb-2 font-medium">Paddy available</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mdFarmTable.map((f) => (
                      <tr key={f.name} className="border-t border-paddy-50">
                        <td className="py-2 font-medium text-ink-900">{f.name}</td>
                        <td className="py-2 text-ink-700">{(f.totalBags ?? 0).toLocaleString()} bags · {(f.totalKg ?? 0).toLocaleString()} kg</td>
                        <td className="py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${f.isActive ? 'bg-paddy-100 text-paddy-900' : 'bg-ink-500/10 text-ink-500'}`}>
                            {f.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-paddy-100 bg-white p-5">
              <h2 className="font-display text-lg text-paddy-900">Warehouse stock</h2>
              <p className="text-xs text-ink-500">Real current stock per warehouse - no capacity figure exists in this system, so utilization isn&rsquo;t shown either.</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-ink-500">
                      <th className="pb-2 font-medium">Warehouse</th>
                      <th className="pb-2 font-medium">Paddy</th>
                      <th className="pb-2 font-medium">Packaged rice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mdWarehouseTable.map((w) => (
                      <tr key={w.name} className="border-t border-paddy-50">
                        <td className="py-2 font-medium text-ink-900">{w.name}</td>
                        <td className="py-2 text-ink-700">{w.paddyKg.toLocaleString()} kg</td>
                        <td className="py-2 text-ink-700">{w.packagedKg.toLocaleString()} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Quick actions - adapted from the reference, not copied
              verbatim: its exact actions (New Paddy Entry, Create
              Delivery Order) belong to roles MD/CEO don't hold the
              create-permission for. These four are genuinely what this
              role can do. */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['/reports', 'View reports'],
              ['/analytics', 'View analytics'],
              ['/audit-log', 'Audit trail'],
              ['/organization', 'Organization'],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="rounded-xl border border-paddy-100 bg-white p-4 text-center text-sm font-medium text-paddy-900 transition hover:border-husk-300 hover:bg-rice-50">
                {label}
              </Link>
            ))}
          </div>

          <p className="mb-2 mt-8 text-xs font-medium uppercase tracking-wide text-soil-500">Company-wide operations - Farm Supervisor, Warehouse Supervisor, and Operations Manager, in one place</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Farm equipment working" value={String(mdFarmEquipment.filter((e) => e.status === 'WORKING').length)} unit={`of ${mdFarmEquipment.length}`} tone="paddy" />
            <StatCard label="Warehouse equipment working" value={String(mdWarehouseEquipment.filter((e) => e.status === 'WORKING').length)} unit={`of ${mdWarehouseEquipment.length}`} tone="paddy" />
            <StatCard label="Machines running or idle" value={String(mdMachines.filter((m) => m.status === 'RUNNING' || m.status === 'IDLE').length)} unit={`of ${mdMachines.length}`} tone="paddy" />
          </div>

          <div className="mt-4 rounded-2xl border border-paddy-100 bg-white p-5">
            <h2 className="font-display text-lg text-paddy-900">Sales orders</h2>
            <p className="text-xs text-ink-500">Every order in the pipeline - submitted orders now go to the Finance Director for clearance, not to you directly.</p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Awaiting Finance clearance"
                value={String(mdSalesOrders.filter((o) => o.status === 'SUBMITTED').length)}
                tone="husk"
              />
              <StatCard label="With the warehouse side" value={String(mdSalesOrders.filter((o) => ['RELEASED', 'RESERVED', 'PROCESSING', 'ON_TRACK'].includes(o.status)).length)} />
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
                <p className="font-display text-base text-paddy-900">{mdCallRequests.length} call request{mdCallRequests.length === 1 ? '' : 's'} waiting on you</p>
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
                      {r.financeApprovedBy && <p className="text-xs text-paddy-700">Finance Director already approved</p>}
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

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
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

          <Link
            href="/analytics"
            className="mt-4 flex items-center justify-between rounded-2xl border-2 border-paddy-900 bg-paddy-900 p-5 text-rice-50 transition hover:bg-paddy-700"
          >
            <div>
              <p className="font-display text-lg">Six-month analytics</p>
              <p className="mt-0.5 text-sm text-paddy-100">Sales vs. expenses, product performance, and farm-by-farm intake, trended over time - not just where things stand today.</p>
            </div>
            <span className="shrink-0 text-2xl">→</span>
          </Link>

          <div className="mt-4 rounded-2xl border border-paddy-100 bg-white p-5">
            <h2 className="font-display text-lg text-paddy-900">What&rsquo;s expected from the mill</h2>
            <p className="text-xs text-ink-500">The same yield and energy prediction the milling floor uses - pick a grade and a bag count to see what a run should produce, before it happens.</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Grade</label>
                <select
                  value={mdPredictGradeId}
                  onChange={(e) => { setMdPredictGradeId(e.target.value); runMdPrediction(e.target.value, mdPredictBags); }}
                  className="rounded-lg border border-paddy-100 px-3 py-2 text-sm"
                >
                  {mdGrades.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Bags</label>
                <input
                  type="number"
                  value={mdPredictBags}
                  onChange={(e) => { setMdPredictBags(e.target.value); runMdPrediction(mdPredictGradeId, e.target.value); }}
                  className="w-28 rounded-lg border border-paddy-100 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-4">
              {mdPredicting && <p className="text-sm text-ink-500">Checking this grade&rsquo;s history…</p>}
              {mdPrediction && !mdPredicting && (
                <YieldPredictionCard prediction={mdPrediction} fmtKg={(n) => `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} KG`} />
              )}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-paddy-100 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg text-paddy-900">Activity across the company</h2>
                <p className="text-xs text-ink-500">Every action, most recent first - the same live trail the Auditor sees.</p>
              </div>
              <Link href="/audit-log" className="shrink-0 rounded-full border border-paddy-100 px-4 py-2 text-xs font-medium text-paddy-900 hover:bg-paddy-50">Full log</Link>
            </div>
            {mdActivityLogError ? (
              <p className="mt-4 text-sm text-red-600">{mdActivityLogError}</p>
            ) : mdActivityLog.length === 0 ? (
              <p className="mt-4 text-sm text-ink-500">Loading recent activity…</p>
            ) : (
              <div className="mt-4 space-y-1.5">
                {mdActivityLog.slice(0, 10).map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg bg-rice-50 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-ink-900">
                      <span className="font-medium">{entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'System'}</span>
                      <span className="text-ink-500"> · {entry.action}</span>
                      <span className="text-ink-500"> · {entry.entity}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-500">{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <IconStatCard icon={Wheat} tone="green" label="Paddy available" value={fmtKg(myFarmInventory.totalKg)} />
              <IconStatCard icon={Factory} tone="purple" label="Pending submissions" value={String(myFarmPendingCount)} />
              <IconStatCard icon={Package} tone="orange" label="Approved today" value={String(myFarmApprovedTodayCount)} />
              <IconStatCard icon={Truck} tone="blue" label="Dispatched (all time)" value={fmtKg(myFarmInventory.dispatchedTotalKg)} />
            </div>

            <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-soil-500">Your farm&rsquo;s inventory - available now</p>
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
                <p className="text-xs font-medium uppercase tracking-wide text-soil-500">Machinery &amp; equipment</p>
                <p className="mt-1 text-sm text-ink-700">{myFarmEquipment.length === 0
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

          {isOperationsOfficer && (
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <IconStatCard icon={Wheat} tone="green" label="Processed this month" value={`${opsOfficerThisMonth.processedKg.toLocaleString()} kg`} />
              <IconStatCard icon={Package} tone="blue" label="Recovered this month" value={`${opsOfficerThisMonth.recoveredKg.toLocaleString()} kg`} />
              <IconStatCard icon={Factory} tone="purple" label="Recovery rate" value={`${opsOfficerThisMonth.recoveryPercent.toFixed(1)}%`} />
              <IconStatCard icon={Truck} tone="orange" label="Records logged" value={String(opsOfficerThisMonth.records)} />
            </div>
          )}

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
          {/* Headline row - the same salesOfficerOrders already
              filtered below, just in the new icon-card format. Sales
              value is real fulfilled-order revenue this month (by
              fulfilledAt, the actual completion date), not every
              order's value regardless of whether it closed. */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <IconStatCard icon={Package} tone="green" label="Delivered" value={String(salesOfficerOrders.filter((o) => o.status === 'FULFILLED').length)} />
            <IconStatCard icon={Truck} tone="blue" label="Pending" value={String(salesOfficerOrders.filter((o) => ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'RELEASED', 'RESERVED', 'PROCESSING', 'ON_TRACK'].includes(o.status)).length)} />
            <IconStatCard icon={Factory} tone="purple" label="Rejected or cancelled" value={String(salesOfficerOrders.filter((o) => ['REJECTED', 'CANCELLED'].includes(o.status)).length)} />
            <IconStatCard icon={DollarSign} tone="teal" label="Sales value this month" value={`GHS ${salesOfficerOrders.filter((o) => o.status === 'FULFILLED' && o.fulfilledAt && isThisMonth(o.fulfilledAt)).reduce((s, o) => s + o.totalAmount, 0).toLocaleString()}`} />
          </div>

          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Your orders - delivered, pending, and everything else</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Delivered"
              value={String(salesOfficerOrders.filter((o) => o.status === 'FULFILLED').length)}
              tone="paddy"
            />
            <StatCard
              label="Pending"
              value={String(salesOfficerOrders.filter((o) => ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'RELEASED', 'RESERVED', 'PROCESSING', 'ON_TRACK'].includes(o.status)).length)}
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

          {isAuditor && (
            <div className="mb-6 rounded-2xl border-2 border-paddy-900 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg text-paddy-900">Audit trail - live</h2>
                  <p className="mt-1 text-sm text-ink-500">Every action across the company, most recent first. Read-only - you see everything, you change nothing.</p>
                </div>
                <Link href="/audit-log" className="shrink-0 rounded-full bg-paddy-900 px-4 py-2 text-xs font-medium text-rice-50">Open full log</Link>
              </div>
              {auditorLogError ? (
                <p className="mt-4 text-sm text-red-600">{auditorLogError}</p>
              ) : auditorLog.length === 0 ? (
                <p className="mt-4 text-sm text-ink-500">Loading the audit trail…</p>
              ) : (
                <div className="mt-4 space-y-1.5">
                  {auditorLog.slice(0, 12).map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg bg-rice-50 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate text-ink-900">
                        <span className="font-medium">{entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'System'}</span>
                        <span className="text-ink-500"> · {entry.action}</span>
                        <span className="text-ink-500"> · {entry.entity}</span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-500">{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-paddy-100 pt-4">
                {[['/inventory','Inventory'],['/finance','Finance'],['/sales','Sales'],['/production','Production'],['/organization','Organization']].map(([href,label]) => (
                  <Link key={href} href={href} className="rounded-full border border-paddy-100 px-3 py-1.5 text-xs font-medium text-paddy-900 hover:bg-paddy-50">{label}</Link>
                ))}
              </div>
            </div>
          )}

          {!isOperationsOfficer && !isAdmin && !isSalesOfficer && !isFinanceDirector && (summaryError ? (
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
