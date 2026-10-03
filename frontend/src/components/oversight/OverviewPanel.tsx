'use client';

import Link from 'next/link';
import { AlertTriangle, DollarSign, Factory, Package, Wheat } from 'lucide-react';
import type { AuditLogEntry, Expense, Farm, Machine, SalesOrder, Warehouse, WarehouseEquipment, WarehouseOverview, FarmEquipment } from '@/lib/api-client';
import type { FarmInventory } from './types';
import { IconStatCard } from '@/components/StatCard';
import { buildAttention, formatGhs, formatKg, inPeriod } from '@/lib/oversight-utils';

export type OversightTab = 'overview' | 'expenses' | 'milling' | 'farms' | 'warehouses' | 'sales';

export function OverviewPanel({
  expenses,
  farms,
  farmInventories,
  warehouses,
  warehouseOverviews,
  machines,
  farmEquipment,
  warehouseEquipment,
  orders,
  activity,
  goTab,
}: {
  expenses: Expense[];
  farms: Farm[];
  farmInventories: Record<string, FarmInventory>;
  warehouses: Warehouse[];
  warehouseOverviews: Record<string, WarehouseOverview>;
  machines: Machine[];
  farmEquipment: FarmEquipment[];
  warehouseEquipment: WarehouseEquipment[];
  orders: SalesOrder[];
  activity: AuditLogEntry[];
  goTab: (t: OversightTab) => void;
}) {
  const month = expenses.filter((e) => inPeriod(e.date, 'THIS_MONTH'));
  const approved = month.filter((e) => e.status === 'APPROVED').reduce((s, e) => s + e.amount, 0);
  const pending = expenses.filter((e) => e.status === 'PENDING');
  const pendingAmount = pending.reduce((s, e) => s + e.amount, 0);
  const farmKg = farms.reduce((s, f) => s + (farmInventories[f.id]?.totalKg ?? 0), 0);
  const overviews = warehouses.map((w) => warehouseOverviews[w.id]).filter(Boolean);
  const atMillingKg = overviews.reduce((s, o) => s + o.atMilling.reduce((a, g) => a + g.kg, 0), 0);
  const packagedKg = overviews.reduce((s, o) => s + o.packagedRice.reduce((a, g) => a + g.kg, 0), 0);
  const sales = orders.filter((o) => o.status === 'FULFILLED' && o.fulfilledAt && inPeriod(o.fulfilledAt, 'THIS_MONTH')).reduce((s, o) => s + o.totalAmount, 0);

  const attention = buildAttention({
    pendingExpenseCount: pending.length,
    pendingExpenseAmount: pendingAmount,
    machines,
    farmEquipment,
    warehouseEquipment,
  });

  const shortcuts: { tab: OversightTab; title: string; body: string }[] = [
    { tab: 'expenses', title: 'Expenses', body: 'Every farm and warehouse, by category and month.' },
    { tab: 'milling', title: 'Milling and power', body: 'Power used, what it should have used, and the rice to expect.' },
    { tab: 'farms', title: 'Farms', body: 'Stock, equipment, and spend for each farm.' },
    { tab: 'warehouses', title: 'Warehouses', body: 'Paddy, milling, and packaged rice at each site.' },
    { tab: 'sales', title: 'Sales', body: 'Revenue, orders by stage, and who owes the company.' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <IconStatCard icon={DollarSign} tone="orange" label="Approved spend this month" value={formatGhs(approved)} trend={pending.length > 0 ? `${formatGhs(pendingAmount)} waiting for approval` : undefined} />
        <IconStatCard icon={Wheat} tone="green" label="Paddy on farms" value={formatKg(farmKg)} />
        <IconStatCard icon={Factory} tone="purple" label="Paddy at the mills" value={formatKg(atMillingKg)} />
        <IconStatCard icon={Package} tone="blue" label="Packaged rice ready" value={formatKg(packagedKg)} />
        <IconStatCard icon={DollarSign} tone="teal" label="Sales this month" value={formatGhs(sales)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-paddy-100 bg-white p-5">
          <h2 className="font-display text-lg text-paddy-900">Needs your attention</h2>
          <div className="mt-3 space-y-2">
            {attention.map((a) => (
              <Link key={a.id} href={a.href} className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm transition hover:opacity-80 ${a.level === 'high' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{a.text}</span>
              </Link>
            ))}
            {attention.length === 0 && <p className="rounded-lg bg-paddy-50 px-3 py-3 text-sm text-paddy-900">Nothing needs attention right now: no machine faults, no equipment problems, and no expenses waiting for approval.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-paddy-100 bg-white p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-lg text-paddy-900">Latest activity</h2>
            <Link href="/audit-log" className="text-xs font-medium text-paddy-700 hover:underline">Full log</Link>
          </div>
          <div className="mt-3 space-y-1.5">
            {activity.slice(0, 8).map((a) => (
              <div key={a.id} className="rounded-lg bg-rice-50 px-3 py-2 text-xs">
                <p className="truncate text-ink-900"><span className="font-medium">{a.user ? `${a.user.firstName} ${a.user.lastName}` : 'System'}</span> {a.action} {a.entity}</p>
                <p className="text-ink-500">{new Date(a.createdAt).toLocaleString()}</p>
              </div>
            ))}
            {activity.length === 0 && <p className="text-sm text-ink-500">No recent activity to show.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {shortcuts.map((s) => (
          <button key={s.tab} type="button" onClick={() => goTab(s.tab)} className="rounded-2xl border border-paddy-100 bg-white p-4 text-left transition hover:border-husk-300 hover:shadow-md">
            <p className="font-display text-base text-paddy-900">{s.title}</p>
            <p className="mt-1 text-xs text-ink-500">{s.body}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
