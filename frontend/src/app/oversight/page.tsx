'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import {
  AuditLogEntry,
  Expense,
  ExecutiveAnalytics,
  Farm,
  FarmEquipment,
  Machine,
  PaddyGrade,
  SalesOrder,
  TopDebtor,
  Warehouse,
  WarehouseEquipment,
  WarehouseOverview,
  analyticsApi,
  auditApi,
  expensesApi,
  farmEquipmentApi,
  farmsApi,
  machinesApi,
  paddyGradesApi,
  receivablesApi,
  reportsApi,
  salesOrdersApi,
  warehouseEquipmentApi,
  warehousesApi,
} from '@/lib/api-client';
import type { FarmInventory } from '@/components/oversight/types';
import { OverviewPanel, OversightTab } from '@/components/oversight/OverviewPanel';
import { ExpensesPanel } from '@/components/oversight/ExpensesPanel';
import { MillingPanel } from '@/components/oversight/MillingPanel';
import { FarmsPanel } from '@/components/oversight/FarmsPanel';
import { WarehousesPanel } from '@/components/oversight/WarehousesPanel';
import { SalesPanel } from '@/components/oversight/SalesPanel';

const TABS: { id: OversightTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'milling', label: 'Milling and power' },
  { id: 'farms', label: 'Farms' },
  { id: 'warehouses', label: 'Warehouses' },
  { id: 'sales', label: 'Sales' },
];

export default function OversightPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();

  const [tab, setTab] = useState<OversightTab>('overview');
  // A tab's panel mounts the first time it is opened and then stays
  // mounted (hidden), so switching back never re-fetches or loses filters.
  const [visited, setVisited] = useState<Set<OversightTab>>(new Set(['overview']));

  const [farms, setFarms] = useState<Farm[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  const [farmEquipment, setFarmEquipment] = useState<FarmEquipment[]>([]);
  const [warehouseEquipment, setWarehouseEquipment] = useState<WarehouseEquipment[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [debtors, setDebtors] = useState<TopDebtor[]>([]);
  const [analytics, setAnalytics] = useState<ExecutiveAnalytics | null>(null);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [farmInv, setFarmInv] = useState<Record<string, FarmInventory>>({});
  const [whOverviews, setWhOverviews] = useState<Record<string, WarehouseOverview>>({});
  const [baseReady, setBaseReady] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const failed: string[] = [];
    // Each source loads independently: one failing must never blank the
    // whole page, and the person is told exactly which part is missing.
    const track = <T,>(name: string, p: Promise<T>, apply: (v: T) => void) =>
      p.then((v) => { if (!cancelled) apply(v); }).catch(() => { failed.push(name); });

    (async () => {
      const [farmList, warehouseList] = await Promise.all([
        farmsApi.list(accessToken).catch(() => { failed.push('Farms'); return [] as Farm[]; }),
        warehousesApi.list(accessToken).catch(() => { failed.push('Warehouses'); return [] as Warehouse[]; }),
      ]);
      if (cancelled) return;
      setFarms(farmList);
      setWarehouses(warehouseList);

      await Promise.all([
        track('Expenses', expensesApi.list(accessToken), setExpenses),
        track('Machines', machinesApi.list(accessToken), setMachines),
        track('Paddy grades', paddyGradesApi.list(accessToken), setGrades),
        track('Farm equipment', farmEquipmentApi.list(accessToken), setFarmEquipment),
        track('Warehouse equipment', warehouseEquipmentApi.list(accessToken), setWarehouseEquipment),
        track('Sales orders', salesOrdersApi.list(accessToken), setOrders),
        track('Receivables', receivablesApi.topDebtors(accessToken), setDebtors),
        track('Analytics', analyticsApi.get(accessToken), setAnalytics),
        track('Recent activity', auditApi.list(accessToken).then((r) => r.items), setActivity),
        ...farmList.map((f) => track(`Stock at ${f.name}`, farmsApi.getInventory(accessToken, f.id), (inv) => setFarmInv((prev) => ({ ...prev, [f.id]: inv })))),
        ...warehouseList.map((w) => track(`Stock at ${w.name}`, reportsApi.getWarehouseOverview(accessToken, w.id), (ov) => setWhOverviews((prev) => ({ ...prev, [w.id]: ov })))),
      ]);
      if (!cancelled) {
        setFailures(failed);
        setBaseReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken]);

  const open = (t: OversightTab) => {
    setTab(t);
    setVisited((prev) => (prev.has(t) ? prev : new Set(prev).add(t)));
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  if (!(hasPermission('reports.view') && hasPermission('expense.view') && hasPermission('milling.view'))) {
    return (
      <DashboardShell me={me}>
        <p className="text-sm text-ink-700">You don&rsquo;t have permission to view this page.</p>
      </DashboardShell>
    );
  }

  const show = (t: OversightTab) => (tab === t ? '' : 'hidden');

  return (
    <DashboardShell me={me}>
      <p className="font-display text-base italic text-soil-500">Oversight</p>
      <h1 className="mt-1 font-display text-3xl font-medium text-paddy-900">The whole company, in one place</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-500">
        Every farm, warehouse, milling center, sale, and expense. You see everything and change nothing here; each figure comes from the same records the teams enter.
      </p>

      {baseReady && failures.length > 0 && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Some information could not be loaded just now: {Array.from(new Set(failures)).join(', ')}. Figures that depend on it may be incomplete. Refresh to try again.
        </p>
      )}

      <div className="mt-5 flex gap-1.5 overflow-x-auto border-b border-paddy-100 pb-px" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => open(t.id)}
            className={`shrink-0 rounded-t-lg px-4 py-2.5 text-sm font-medium transition ${tab === t.id ? 'border-b-2 border-paddy-900 text-paddy-900' : 'text-ink-500 hover:text-paddy-900'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!baseReady && <p className="mt-6 text-sm text-ink-500">Gathering figures from every farm, warehouse, and milling center…</p>}

      {baseReady && (
        <div className="mt-5">
          <div className={show('overview')}>
            <OverviewPanel
              expenses={expenses}
              farms={farms}
              farmInventories={farmInv}
              warehouses={warehouses}
              warehouseOverviews={whOverviews}
              machines={machines}
              farmEquipment={farmEquipment}
              warehouseEquipment={warehouseEquipment}
              orders={orders}
              activity={activity}
              goTab={open}
            />
          </div>
          {visited.has('expenses') && (
            <div className={show('expenses')}>
              <ExpensesPanel expenses={expenses} farmNames={farms.map((f) => f.name)} warehouseNames={warehouses.map((w) => w.name)} />
            </div>
          )}
          {visited.has('milling') && (
            <div className={show('milling')}>
              <MillingPanel
                accessToken={accessToken ?? ''}
                active={tab === 'milling'}
                ready={baseReady}
                warehouses={warehouses}
                machines={machines}
                grades={grades}
                warehouseOverviews={whOverviews}
              />
            </div>
          )}
          {visited.has('farms') && (
            <div className={show('farms')}>
              <FarmsPanel farms={farms} inventories={farmInv} equipment={farmEquipment} expenses={expenses} />
            </div>
          )}
          {visited.has('warehouses') && (
            <div className={show('warehouses')}>
              <WarehousesPanel warehouses={warehouses} overviews={whOverviews} equipment={warehouseEquipment} expenses={expenses} />
            </div>
          )}
          {visited.has('sales') && (
            <div className={show('sales')}>
              <SalesPanel orders={orders} analytics={analytics} debtors={debtors} />
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
