'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { inventoryApi, InventoryOverview, InventorySummary, InventoryRow, ApiError } from '@/lib/api-client';

function fmtKg(n: number) {
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} KG`;
}

function InventorySection({ title, rows, emptyLabel }: { title: string; rows: InventoryRow[]; emptyLabel: string }) {
  // Grouped by location — a flat list of 30 rows across 6 farms is
  // harder to scan than 6 small groups, and "how much does Farm B
  // have" is a more natural question than "list everything everywhere."
  const byLocation = new Map<string, InventoryRow[]>();
  for (const row of rows) {
    const list = byLocation.get(row.locationName) ?? [];
    list.push(row);
    byLocation.set(row.locationName, list);
  }

  return (
    <div className="rounded-2xl border border-paddy-100 bg-white p-5">
      <h2 className="font-display text-lg text-paddy-900">{title}</h2>
      {byLocation.size === 0 ? (
        <p className="mt-2 text-sm text-ink-500">{emptyLabel}</p>
      ) : (
        <div className="mt-3 space-y-4">
          {Array.from(byLocation.entries()).map(([location, items]) => {
            const totalKg = items.reduce((sum, i) => sum + i.quantityKg, 0);
            const totalBags = items.reduce((sum, i) => sum + i.bagCount, 0);
            return (
              <div key={location} className="rounded-lg border border-paddy-100 p-3">
                <div className="flex items-baseline justify-between">
                  <p className="font-medium text-ink-900">{location}</p>
                  <p className="text-xs text-ink-500">{totalKg.toLocaleString()} KG · {totalBags.toLocaleString()} bags</p>
                </div>
                <div className="mt-2 space-y-1">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-ink-700">{item.itemLabel}</span>
                      <span className="text-ink-500">{item.quantityKg.toLocaleString()} KG · {item.bagCount.toLocaleString()} bags</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function InventoryPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [data, setData] = useState<InventoryOverview | null>(null);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    inventoryApi.get(accessToken).then(setData).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load inventory.'));
    inventoryApi.getSummary(accessToken).then(setSummary).catch(() => {});
  }, [accessToken]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading\u2026</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Inventory</h1>
      <p className="mt-1 text-sm text-ink-500">The company\u2019s single source of truth for stock \u2014 not separate, possibly conflicting numbers in farms, warehouses, and sales.</p>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {summary && (
        <>
          <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-5">
            <h2 className="font-display text-lg text-paddy-900">\ud83c\udf3e Paddy</h2>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg bg-rice-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">On farms</p>
                <p className="mt-1 font-display text-lg text-paddy-900">{fmtKg(summary.paddy.farmKg)}</p>
              </div>
              <div className="rounded-lg bg-rice-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">In transit</p>
                <p className="mt-1 font-display text-lg text-paddy-900">{fmtKg(summary.paddy.inTransitKg)}</p>
              </div>
              <div className="rounded-lg bg-rice-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">In warehouses</p>
                <p className="mt-1 font-display text-lg text-paddy-900">{fmtKg(summary.paddy.warehouseKg)}</p>
              </div>
              <div className="rounded-lg bg-rice-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">At milling</p>
                <p className="mt-1 font-display text-lg text-paddy-900">{fmtKg(summary.paddy.atMillingKg)}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg text-paddy-900">\ud83d\udce6 Pectra Rice \u2014 company stock</h2>
              <p className="text-xs text-ink-500">Available = physical stock minus active reservations.</p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                    <th className="py-2 pr-4">Package</th>
                    <th className="py-2 pr-4">Available bags</th>
                    <th className="py-2 pr-4">Reserved bags</th>
                    <th className="py-2 pr-4">Total bags</th>
                    <th className="py-2">Total KG</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-paddy-100">
                  {summary.finishedRice.map((r) => (
                    <tr key={r.label}>
                      <td className="py-2 pr-4 font-medium text-ink-900">{r.label}</td>
                      <td className="py-2 pr-4 text-ink-700">{r.availableBags.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-ink-700">{r.reservedBags.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-ink-700">{r.totalBags.toLocaleString()}</td>
                      <td className="py-2 text-ink-700">{r.totalKg.toLocaleString()}</td>
                    </tr>
                  ))}
                  {summary.finishedRice.length > 0 && (
                    <tr className="font-medium text-paddy-900">
                      <td className="py-2 pr-4">TOTAL</td>
                      <td className="py-2 pr-4">{summary.finishedRice.reduce((s, r) => s + r.availableBags, 0).toLocaleString()}</td>
                      <td className="py-2 pr-4">{summary.finishedRice.reduce((s, r) => s + r.reservedBags, 0).toLocaleString()}</td>
                      <td className="py-2 pr-4">{summary.finishedRice.reduce((s, r) => s + r.totalBags, 0).toLocaleString()}</td>
                      <td className="py-2">{summary.finishedRice.reduce((s, r) => s + r.totalKg, 0).toLocaleString()}</td>
                    </tr>
                  )}
                  {summary.finishedRice.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-ink-500">No packaged rice in any warehouse yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {data && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">By location</p>
          <div className="grid gap-6 lg:grid-cols-3">
            <InventorySection title="\ud83c\udf3e On farms" rows={data.farms} emptyLabel="No paddy on hand at any farm right now." />
            <InventorySection title="\ud83c\udfed In warehouses" rows={data.warehouses} emptyLabel="No stock in any warehouse right now." />
            <InventorySection title="\u2699\ufe0f At milling" rows={data.millingCenters} emptyLabel="No stock at any milling center right now." />
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
