'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Clock, DollarSign, Download, Sprout, Warehouse as WarehouseIcon, X } from 'lucide-react';
import type { Expense } from '@/lib/api-client';
import { IconStatCard } from '@/components/StatCard';
import {
  SPEND_PERIOD_LABELS,
  SpendPeriod,
  expensesToCsv,
  formatGhs,
  inPeriod,
  monthlySpend,
  spendByCategory,
  spendByLocation,
} from '@/lib/oversight-utils';

const STATUS_STYLES: Record<string, string> = {
  APPROVED: 'bg-paddy-100 text-paddy-900',
  PENDING: 'bg-amber-100 text-amber-800',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-ink-500/10 text-ink-500',
};

const select = 'rounded-lg border border-paddy-100 bg-white px-3 py-2 text-sm text-ink-900';

function ReceiptThumb({ url, onOpen }: { url: string; onOpen: (u: string) => void }) {
  if (url.startsWith('data:image')) {
    return (
      <button type="button" onClick={() => onOpen(url)} aria-label="View receipt" className="block overflow-hidden rounded-md border border-paddy-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Receipt" className="h-9 w-9 object-cover" />
      </button>
    );
  }
  // A non-image attachment (e.g. a PDF) can't be previewed inline - offer it as a download.
  return (
    <a href={url} download className="text-xs font-medium text-paddy-700 underline">
      Download
    </a>
  );
}

export function ExpensesPanel({ expenses, farmNames, warehouseNames }: { expenses: Expense[]; farmNames: string[]; warehouseNames: string[] }) {
  const [period, setPeriod] = useState<SpendPeriod>('THIS_MONTH');
  const [status, setStatus] = useState('ALL');
  const [where, setWhere] = useState('ALL');
  const [limit, setLimit] = useState(15);
  const [receipt, setReceipt] = useState<string | null>(null);

  const matchesLocation = (e: Expense) => {
    if (where === 'ALL') return true;
    const [type, name] = [where.slice(0, where.indexOf(':')), where.slice(where.indexOf(':') + 1)];
    if (type === 'FARM') return e.farm?.name === name;
    if (type === 'WAREHOUSE') return !e.farm && e.warehouse?.name === name;
    return !e.farm && !e.warehouse;
  };

  const filtered = useMemo(
    () => expenses.filter((e) => inPeriod(e.date, period) && (status === 'ALL' || e.status === status) && matchesLocation(e)),
    // matchesLocation closes over `where`, which is already a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses, period, status, where],
  );

  // The location table ignores the location filter on purpose (it IS the
  // location breakdown) but respects period and status.
  const forLocationTable = useMemo(
    () => expenses.filter((e) => inPeriod(e.date, period) && (status === 'ALL' || e.status === status)),
    [expenses, period, status],
  );
  const locations = useMemo(() => spendByLocation(forLocationTable, farmNames, warehouseNames), [forLocationTable, farmNames, warehouseNames]);
  const categories = useMemo(() => spendByCategory(filtered), [filtered]);
  const trend = useMemo(() => monthlySpend(expenses.filter(matchesLocation)), [expenses, where]); // eslint-disable-line react-hooks/exhaustive-deps

  const approved = filtered.filter((e) => e.status === 'APPROVED').reduce((s, e) => s + e.amount, 0);
  const pending = filtered.filter((e) => e.status === 'PENDING');
  const pendingAmount = pending.reduce((s, e) => s + e.amount, 0);
  const farmSpend = locations.filter((l) => l.type === 'FARM').reduce((s, l) => s + l.approved, 0);
  const warehouseSpend = locations.filter((l) => l.type === 'WAREHOUSE').reduce((s, l) => s + l.approved, 0);
  const maxLocation = Math.max(1, ...locations.map((l) => l.approved + l.pending));
  const maxCategory = Math.max(1, ...categories.map((c) => c.amount));

  const downloadCsv = () => {
    const blob = new Blob([expensesToCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${period.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-paddy-100 bg-white p-4">
        <label className="text-xs font-medium text-ink-700">
          Period
          <select value={period} onChange={(e) => { setPeriod(e.target.value as SpendPeriod); setLimit(15); }} className={`${select} mt-1 block`}>
            {(Object.keys(SPEND_PERIOD_LABELS) as SpendPeriod[]).map((p) => <option key={p} value={p}>{SPEND_PERIOD_LABELS[p]}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-700">
          Status
          <select value={status} onChange={(e) => { setStatus(e.target.value); setLimit(15); }} className={`${select} mt-1 block`}>
            <option value="ALL">All statuses</option>
            <option value="APPROVED">Approved</option>
            <option value="PENDING">Pending approval</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>
        <label className="text-xs font-medium text-ink-700">
          Location
          <select value={where} onChange={(e) => { setWhere(e.target.value); setLimit(15); }} className={`${select} mt-1 block`}>
            <option value="ALL">Every farm and warehouse</option>
            <optgroup label="Farms">{farmNames.map((n) => <option key={n} value={`FARM:${n}`}>{n}</option>)}</optgroup>
            <optgroup label="Warehouses">{warehouseNames.map((n) => <option key={n} value={`WAREHOUSE:${n}`}>{n}</option>)}</optgroup>
          </select>
        </label>
        <button type="button" onClick={downloadCsv} disabled={filtered.length === 0} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-paddy-100 px-4 py-2 text-xs font-medium text-paddy-900 hover:bg-paddy-50 disabled:opacity-50">
          <Download className="h-3.5 w-3.5" /> Download CSV
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <IconStatCard icon={DollarSign} tone="green" label="Approved spend" value={formatGhs(approved)} trend={`${filtered.filter((e) => e.status === 'APPROVED').length} expenses`} />
        <IconStatCard icon={Clock} tone="orange" label="Waiting for approval" value={formatGhs(pendingAmount)} trend={`${pending.length} expense${pending.length === 1 ? '' : 's'}`} />
        <IconStatCard icon={Sprout} tone="teal" label="Spent on farms" value={formatGhs(farmSpend)} />
        <IconStatCard icon={WarehouseIcon} tone="blue" label="Spent at warehouses" value={formatGhs(warehouseSpend)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-paddy-100 bg-white p-5">
          <h2 className="font-display text-lg text-paddy-900">Spend by location</h2>
          <p className="text-xs text-ink-500">Every farm and warehouse, including those with nothing spent. {SPEND_PERIOD_LABELS[period]}.</p>
          <div className="mt-4 space-y-3">
            {locations.map((l) => (
              <div key={l.key}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium text-ink-900">
                    {l.name}
                    <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-ink-500">{l.type === 'FARM' ? 'Farm' : l.type === 'WAREHOUSE' ? 'Warehouse' : ''}</span>
                  </span>
                  <span className="shrink-0 text-ink-900">{formatGhs(l.approved)}</span>
                </div>
                <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-rice-50">
                  <div className="h-full bg-paddy-900" style={{ width: `${(l.approved / maxLocation) * 100}%` }} />
                  <div className="h-full bg-amber-400" style={{ width: `${(l.pending / maxLocation) * 100}%` }} />
                </div>
                {l.pending > 0 && <p className="mt-0.5 text-[11px] text-amber-800">+ {formatGhs(l.pending)} waiting for approval</p>}
              </div>
            ))}
            {locations.length === 0 && <p className="text-sm text-ink-500">No farms or warehouses found.</p>}
          </div>
          <p className="mt-4 flex items-center gap-3 text-[11px] text-ink-500">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-paddy-900" /> Approved</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-400" /> Pending</span>
          </p>
        </div>

        <div className="rounded-2xl border border-paddy-100 bg-white p-5">
          <h2 className="font-display text-lg text-paddy-900">Spend by category</h2>
          <p className="text-xs text-ink-500">Approved only, for the filters above.</p>
          <div className="mt-4 space-y-3">
            {categories.map((c) => (
              <div key={c.name}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-ink-900">{c.name}</span>
                  <span className="shrink-0 text-ink-900">{formatGhs(c.amount)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-rice-50">
                  <div className="h-full bg-husk-500" style={{ width: `${(c.amount / maxCategory) * 100}%` }} />
                </div>
              </div>
            ))}
            {categories.length === 0 && <p className="text-sm text-ink-500">No approved spend for these filters.</p>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-paddy-100 bg-white p-5">
        <h2 className="font-display text-lg text-paddy-900">Last six months</h2>
        <p className="text-xs text-ink-500">Approved spend per month, split by where it was spent{where === 'ALL' ? '' : ` (${where.slice(where.indexOf(':') + 1)} only)`}.</p>
        <div className="mt-3" style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EDE6D6" />
              <XAxis dataKey="label" stroke="#8A7B62" fontSize={11} />
              <YAxis stroke="#8A7B62" fontSize={11} />
              <Tooltip formatter={(v: number) => formatGhs(v)} contentStyle={{ borderRadius: 8, border: '1px solid #EDE6D6' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar isAnimationActive={false} dataKey="farms" stackId="a" fill="#1F4D2C" name="Farms" />
              <Bar isAnimationActive={false} dataKey="warehouses" stackId="a" fill="#C9972B" name="Warehouses" />
              <Bar isAnimationActive={false} dataKey="other" stackId="a" fill="#8A8A8A" name="Other" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-paddy-100 bg-white p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-lg text-paddy-900">Expense ledger</h2>
          <p className="text-xs text-ink-500">{filtered.length} matching</p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs text-ink-500">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Where</th>
                <th className="pb-2 font-medium">What</th>
                <th className="pb-2 text-right font-medium">Amount</th>
                <th className="pb-2 pl-3 font-medium">Status</th>
                <th className="pb-2 font-medium">Entered by</th>
                <th className="pb-2 font-medium">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((e) => (
                <tr key={e.id} className="border-t border-paddy-50 align-middle">
                  <td className="py-2 text-ink-700">{String(e.date).slice(0, 10)}</td>
                  <td className="py-2 text-ink-900">{e.farm?.name ?? e.warehouse?.name ?? 'Unassigned'}</td>
                  <td className="py-2 text-ink-700">
                    {e.category.name === 'Other' && e.customCategoryLabel ? `Other: ${e.customCategoryLabel}` : e.category.name}
                    {e.itemDescription && <span className="block text-xs text-ink-500">{e.itemDescription}</span>}
                  </td>
                  <td className="py-2 text-right font-medium text-ink-900">{formatGhs(e.amount, 2)}</td>
                  <td className="py-2 pl-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[e.status] ?? 'bg-ink-500/10 text-ink-500'}`}>{e.status.charAt(0) + e.status.slice(1).toLowerCase()}</span></td>
                  <td className="py-2 text-ink-700">{e.submittedBy.firstName} {e.submittedBy.lastName}</td>
                  <td className="py-2">{e.attachmentUrl ? <ReceiptThumb url={e.attachmentUrl} onOpen={setReceipt} /> : <span className="text-xs text-ink-500">None</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="py-6 text-center text-sm text-ink-500">No expenses match these filters.</p>}
        </div>
        {filtered.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + 25)} className="mt-3 rounded-full border border-paddy-100 px-4 py-2 text-xs font-medium text-paddy-900 hover:bg-paddy-50">
            Show more ({filtered.length - limit} left)
          </button>
        )}
      </div>

      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setReceipt(null)} role="dialog" aria-modal="true" aria-label="Receipt">
          <button type="button" onClick={() => setReceipt(null)} aria-label="Close" className="absolute right-4 top-4 rounded-full bg-white p-2 text-ink-900">
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={receipt} alt="Receipt" className="max-h-[90vh] max-w-full rounded-lg bg-white object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
