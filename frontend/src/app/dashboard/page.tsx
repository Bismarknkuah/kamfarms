'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { findSingleLocationScope, hasFinancialVisibility } from '@/lib/nav-items';
import {
  reportsApi,
  ExecutiveSummary,
  ApiError,
  tasksApi,
  notificationsApi,
  paddyEntriesApi,
  deliveryReportsApi,
  salesOrdersApi,
  paymentsApi,
  shipmentsApi,
  productionApi,
  usersApi,
  farmsApi,
} from '@/lib/api-client';

type StatTone = 'default' | 'paddy' | 'husk' | 'soil';

const STAT_TONE_STYLES: Record<StatTone, string> = {
  default: 'border border-paddy-100 bg-white text-paddy-900 [&_.stat-label]:text-ink-500 [&_.stat-unit]:text-ink-500',
  paddy: 'bg-paddy-900 text-rice-50 [&_.stat-label]:text-paddy-300 [&_.stat-unit]:text-paddy-300',
  husk: 'bg-husk-500 text-white [&_.stat-label]:text-husk-100 [&_.stat-unit]:text-husk-100',
  soil: 'bg-soil-700 text-rice-50 [&_.stat-label]:text-husk-100 [&_.stat-unit]:text-husk-100',
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
 * their local time zone — used to filter already-fetched lists down to
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
  const [myFarmInventory, setMyFarmInventory] = useState<{ totalKg: number; totalBags: number; byGrade: { gradeCode: string; gradeLabel: string; totalKg: number }[] } | null>(null);

  useEffect(() => {
    if (!accessToken || !me) return;
    // Fetched whenever it'll actually be shown: financial-visibility
    // roles need it for the full grid, and everyone else without a
    // single farm scope of their own needs it for the inventory-only
    // grid. Only a Farm Manager (myFarmId set below) skips this
    // entirely — they get their own farm's inventory instead, and
    // fetching the company-wide summary for them would just be wasted
    // work for a view they never see.
    if (hasFinancialVisibility(me) || !findSingleLocationScope(me, 'FARM')) {
      reportsApi
        .executiveSummary(accessToken)
        .then(setSummary)
        .catch((err: unknown) => setSummaryError(err instanceof ApiError ? err.message : 'Failed to load KPIs.'));
    }

    // "Needs your attention" — real counts, not decoration. Every fetch
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
<<<<<<< HEAD
=======
    if (hasPermission('warehouse.receive')) {
      // Section 25's "long-running shipment / unreceived shipment"
      // alert — computed live on each visit rather than a background
      // job, since this sandbox has no way to verify a scheduled job
      // actually runs reliably in the real deployment. Anything still
      // in transit more than 3 days after departure is worth a flag —
      // it likely either arrived without being logged, or is stuck.
      items.push(
        shipmentsApi
          .list(accessToken)
          .then((shipments) => {
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            const overdue = shipments.filter((s) => !s.receivedAt && new Date(s.departedAt) < threeDaysAgo);
            return overdue.length > 0 ? { label: 'Shipments overdue — departed 3+ days ago, still unreceived', count: overdue.length, href: '/shipments' } : null;
          })
          .catch(() => null),
      );
    }
>>>>>>> 3f403ee (Add long-running shipment alert; confirm Section 9/17 calculations complete)
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

    // Personal, role-specific "your activity this month" — for roles
    // whose whole job IS sales or paddy intake but who don't hold
    // reports.view (the company-wide grid above is invisible to them),
    // this is the actual replacement, not a decoration next to it.
    // Computed from data the role can already legitimately see —
    // SalesOrdersService.list() returns every order visible to anyone
    // holding sales.create/approve/fulfill/view, not just "my orders",
    // so a Sales Officer's own figures are filtered out client-side by
    // matching salesOfficer.id, not assumed from a scoped endpoint.
    const roleCodes = me.roles.map((r) => r.code);

    if (roleCodes.includes('SALES_OFFICER')) {
      salesOrdersApi
        .list(accessToken)
        .then((orders) => {
          const mine = orders.filter((o) => o.salesOfficer.id === me.id && isThisMonth(o.createdAt));
          const total = mine.reduce((sum, o) => sum + o.totalAmount, 0);
          setPersonalStats((prev) => [...prev, 
            { label: 'Your sales this month', value: `GHS ${total.toLocaleString('en-US', { maximumFractionDigits: 2 })}` },
            { label: 'Orders you created this month', value: String(mine.length) },
          ]);
        })
        .catch(() => {});
    }

    // A Farm Manager's own farm — computed once here since both the
    // fetch below and the render need it, and re-deriving it via a
    // second findSingleLocationScope call in JSX on every render would
    // be wasteful for no benefit.
    const myFarmId = findSingleLocationScope(me, 'FARM');
    if (myFarmId) {
      farmsApi.getInventory(accessToken, myFarmId).then(setMyFarmInventory).catch(() => {});
    }

    if (roleCodes.includes('FARM_MANAGER')) {
      paddyEntriesApi
        .list(accessToken)
        .then((entries) => {
          const pending = entries.filter((e) => e.status === 'SUBMITTED').length;
          setPersonalStats((prev) => [...prev,
            { label: 'Entries awaiting your Farm Supervisor\u2019s approval', value: String(pending) },
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
    }

    if (roleCodes.includes('OPERATIONS_OFFICER')) {
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

    // The three "line manager" roles — real team-management capability
    // was added to Farms/Warehouses/Users earlier; this surfaces it
    // here too, so it's not only discoverable by clicking into Users.
    // usersApi.list() is already correctly scoped server-side to each
    // of these roles' actual subordinate role (Farm Manager, Warehouse
    // Manager, Operations Officer respectively) — no client-side
    // filtering needed here, unlike the personal-activity stats above.
    if (roleCodes.some((r) => ['FARM_DIRECTOR', 'WAREHOUSE_SUPERVISOR', 'OPERATIONS_MANAGER'].includes(r))) {
      usersApi
        .list(accessToken)
        .then((res) => {
          setPersonalStats((prev) => [...prev, { label: 'People on your team', value: String(res.items.length) }]);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, me]);

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

  // The nav sidebar handles primary navigation now — this page no
  // longer duplicates it as a grid of the same links.
  const myFarmId = findSingleLocationScope(me, 'FARM');

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

      {myFarmId ? (
        myFarmInventory && (
          <div className="mb-8">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Your farm&rsquo;s inventory</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatCard label="Total paddy on your farm" value={fmtKg(myFarmInventory.totalKg)} unit="KG" tone="paddy" />
              <StatCard label="Total bags" value={String(myFarmInventory.totalBags)} />
              {myFarmInventory.byGrade.map((g) => (
                <StatCard key={g.gradeCode} label={g.gradeLabel} value={fmtKg(g.totalKg)} unit="KG" />
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="mb-8">
          {summaryError ? (
            <p className="text-sm text-red-600">{summaryError}</p>
          ) : !summary ? (
            <p className="text-sm text-ink-500">Loading live figures…</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              <StatCard label="Paddy on farms" value={fmtKg(summary.totalPaddyAvailableKg)} unit="KG" />
              <StatCard label="Paddy in transit" value={fmtKg(summary.paddyInTransitKg)} unit="KG" />
              <StatCard label="Paddy in warehouses" value={fmtKg(summary.paddyInWarehousesKg)} unit="KG" />
              <StatCard label="Bulk rice at milling" value={fmtKg(summary.bulkRiceAtMillingKg)} unit="KG" />
              <StatCard label="Packaged rice available" value={fmtKg(summary.packagedRiceAvailableKg)} unit="KG" tone="paddy" />
              {hasFinancialVisibility(me) && (
                <>
                  <StatCard label="Sales today" value={fmtGHS(summary.salesTodayAmount)} tone="husk" />
                  <StatCard label="Sales this month" value={fmtGHS(summary.salesThisMonthAmount)} tone="husk" />
                  <StatCard label="Outstanding receivables" value={fmtGHS(summary.outstandingReceivables)} tone="soil" />
                  <StatCard label="Expenses this month" value={fmtGHS(summary.expensesThisMonth)} tone="soil" />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
