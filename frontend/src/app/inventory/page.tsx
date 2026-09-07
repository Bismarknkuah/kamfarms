'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { inventoryApi, reportsApi, InventoryOverview, InventorySummary, InventoryRow, WarehouseOverview, ApiError } from '@/lib/api-client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function fmtKg(n: number) {
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} KG`;
}

function InventorySection({ title, rows, emptyLabel, filterText }: { title: string; rows: InventoryRow[]; emptyLabel: string; filterText: string }) {
  const filtered = filterText.trim()
    ? rows.filter((r) => r.itemLabel.toLowerCase().includes(filterText.trim().toLowerCase()))
    : rows;

  // Grouped by location - a flat list of 30 rows across 6 farms is
  // harder to scan than 6 small groups, and "how much does Farm B
  // have" is a more natural question than "list everything everywhere."
  const byLocation = new Map<string, InventoryRow[]>();
  for (const row of filtered) {
    const list = byLocation.get(row.locationName) ?? [];
    list.push(row);
    byLocation.set(row.locationName, list);
  }

  return (
    <div className="rounded-2xl border border-paddy-100 bg-white p-5">
      <h2 className="font-display text-lg text-paddy-900">{title}</h2>
      {byLocation.size === 0 ? (
        <p className="mt-2 text-sm text-ink-500">{filterText.trim() ? 'No sizes match that search here.' : emptyLabel}</p>
      ) : (
        <div className="mt-3 space-y-4">
          {Array.from(byLocation.entries()).map(([location, items]) => {
            const totalKg = items.reduce((sum, i) => sum + i.quantityKg, 0);
            const totalBags = items.reduce((sum, i) => sum + i.bagCount, 0);
            return (
              <div key={location} className="rounded-lg border border-paddy-100 p-3">
                <div className="flex items-baseline justify-between">
                  <p className="font-medium text-ink-900">{location}</p>
                  <p className="text-xs text-ink-500">{totalBags.toLocaleString()} bags ({totalKg.toLocaleString()} KG)</p>
                </div>
                <div className="mt-2 space-y-1">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-ink-700">{item.itemLabel}</span>
                      <span className="font-medium text-paddy-900">{item.bagCount.toLocaleString()} bags <span className="font-normal text-ink-500">({item.quantityKg.toLocaleString()} KG)</span></span>
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
  const [locationFilter, setLocationFilter] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [warehouseOverview, setWarehouseOverview] = useState<WarehouseOverview | null>(null);
  const [warehouseSection, setWarehouseSection] = useState<'received' | 'available' | 'inTransit' | 'milling' | 'packaged' | null>(null);

  const onDownload = async (format: 'csv' | 'xlsx' | 'pdf') => {
    if (!accessToken) return;
    setDownloading(format);
    try {
      await reportsApi.downloadInventory(accessToken, format);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to download.');
    } finally {
      setDownloading(null);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    inventoryApi.get(accessToken).then(setData).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load inventory.'));
    inventoryApi.getSummary(accessToken).then(setSummary).catch(() => {});
    if (hasPermission('warehouse.inventory.view')) {
      reportsApi.getWarehouseOverview(accessToken).then(setWarehouseOverview).catch(() => {});
    }
  }, [accessToken]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-paddy-900">Inventory</h1>
          <p className="mt-1 text-sm text-ink-500">The company’s single source of truth for stock - not separate, possibly conflicting numbers in farms, warehouses, and sales.</p>
        </div>
        {hasPermission('reports.export') && (
          <div className="flex gap-2">
            <button type="button" onClick={() => onDownload('csv')} disabled={downloading !== null} className="rounded-full border border-paddy-100 px-4 py-2 text-xs font-medium text-ink-700 disabled:opacity-50">
              {downloading === 'csv' ? 'Downloading…' : 'Download CSV'}
            </button>
            <button type="button" onClick={() => onDownload('xlsx')} disabled={downloading !== null} className="rounded-full border border-paddy-100 px-4 py-2 text-xs font-medium text-ink-700 disabled:opacity-50">
              {downloading === 'xlsx' ? 'Downloading…' : 'Download Excel'}
            </button>
            <button type="button" onClick={() => onDownload('pdf')} disabled={downloading !== null} className="rounded-full bg-paddy-900 px-4 py-2 text-xs font-medium text-rice-50 disabled:opacity-50">
              {downloading === 'pdf' ? 'Downloading…' : 'Download PDF'}
            </button>
          </div>
        )}
      </div>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {warehouseOverview && (
        <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-5">
          <h2 className="font-display text-lg text-paddy-900">Your warehouse - three-part overview</h2>
          <p className="text-xs text-ink-500">Tap a card for the breakdown by size.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {([
              { key: 'received' as const, label: 'Paddy received', bags: warehouseOverview.paddy.received.reduce((s, g) => s + g.bags, 0) },
              { key: 'available' as const, label: 'Paddy available', bags: warehouseOverview.paddy.available.reduce((s, g) => s + g.bags, 0) },
              { key: 'inTransit' as const, label: 'Paddy in transit', bags: warehouseOverview.paddy.inTransit.reduce((s, g) => s + g.bags, 0) },
            ]).map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => setWarehouseSection(warehouseSection === section.key ? null : section.key)}
                className={`rounded-xl bg-rice-50 p-4 text-left transition ${warehouseSection === section.key ? 'ring-2 ring-paddy-900' : ''}`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{section.label}</p>
                <p className="mt-1 font-display text-xl text-paddy-900">{section.bags.toLocaleString()} bags</p>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setWarehouseSection(warehouseSection === 'milling' ? null : 'milling')}
              className={`rounded-xl bg-rice-50 p-4 text-left transition ${warehouseSection === 'milling' ? 'ring-2 ring-paddy-900' : ''}`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">At milling</p>
              <p className="mt-1 font-display text-xl text-paddy-900">{warehouseOverview.atMilling.reduce((s, g) => s + g.bags, 0).toLocaleString()} bags</p>
            </button>
            <button
              type="button"
              onClick={() => setWarehouseSection(warehouseSection === 'packaged' ? null : 'packaged')}
              className={`rounded-xl bg-husk-100/40 p-4 text-left transition ${warehouseSection === 'packaged' ? 'ring-2 ring-paddy-900' : ''}`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Packaged rice</p>
              <p className="mt-1 font-display text-xl text-paddy-900">{fmtKg(warehouseOverview.packagedRice.reduce((s, g) => s + g.kg, 0))}</p>
            </button>
          </div>
          {warehouseSection && (
            <div className="mt-3 border-t border-paddy-100 pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">By size</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {warehouseSection === 'packaged'
                  ? warehouseOverview.packagedRice.map((g) => (
                      <div key={g.label} className="rounded-lg bg-rice-50 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{g.label}</p>
                        <p className="mt-1 font-display text-paddy-900">{fmtKg(g.kg)}</p>
                        <p className="text-xs text-ink-500">{g.bags.toLocaleString()} bags</p>
                      </div>
                    ))
                  : (warehouseSection === 'milling' ? warehouseOverview.atMilling : warehouseOverview.paddy[warehouseSection]).map((g) => (
                      <div key={g.gradeLabel} className="rounded-lg bg-rice-50 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{g.gradeLabel}</p>
                        <p className="mt-1 font-display text-paddy-900">{g.bags.toLocaleString()} bags</p>
                        <p className="text-xs text-ink-500">{fmtKg(g.kg)}</p>
                      </div>
                    ))}
              </div>
            </div>
          )}
        </div>
      )}

      {summary && (
        <>
          <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-5">
            <h2 className="font-display text-lg text-paddy-900">🌾 Paddy</h2>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg bg-rice-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">On farms</p>
                <p className="mt-1 font-display text-lg text-paddy-900">{summary.paddy.farmBags.toLocaleString()} bags</p>
                <p className="text-xs text-ink-500">{fmtKg(summary.paddy.farmKg)}</p>
              </div>
              <div className="rounded-lg bg-rice-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">In transit</p>
                <p className="mt-1 font-display text-lg text-paddy-900">{summary.paddy.inTransitBags.toLocaleString()} bags</p>
                <p className="text-xs text-ink-500">{fmtKg(summary.paddy.inTransitKg)}</p>
              </div>
              {hasPermission('warehouse.inventory.view') && (
                <div className="rounded-lg bg-rice-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">In warehouses</p>
                  <p className="mt-1 font-display text-lg text-paddy-900">
                    {data ? `${data.warehouses.reduce((s, r) => s + r.bagCount, 0).toLocaleString()} bags` : fmtKg(summary.paddy.warehouseKg)}
                  </p>
                  {data && <p className="text-xs text-ink-500">{fmtKg(summary.paddy.warehouseKg)}</p>}
                </div>
              )}
              {hasPermission('milling.view') && (
                <div className="rounded-lg bg-rice-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">At milling</p>
                  <p className="mt-1 font-display text-lg text-paddy-900">{fmtKg(summary.paddy.atMillingKg)}</p>
                </div>
              )}
              {hasPermission('milling.view') && (
                <div className="rounded-lg bg-husk-100/40 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Rice hulls available</p>
                  <p className="mt-1 font-display text-lg text-paddy-900">{fmtKg(summary.riceHullKg)}</p>
                </div>
              )}
              {hasPermission('milling.view') && (
                <div className="rounded-lg bg-husk-100/40 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Broken rice available</p>
                  <p className="mt-1 font-display text-lg text-paddy-900">{fmtKg(summary.brokenRiceKg)}</p>
                </div>
              )}
            </div>
          </div>

          {summary.paddy.byFarm.length > 0 && (
            <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-5">
              <h2 className="font-display text-lg text-paddy-900">Paddy on farms, by size</h2>
              <p className="text-xs text-ink-500">Every farm's bags, added together by size.</p>
              <div className="mt-4" style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={Array.from(
                      summary.paddy.byFarm.reduce((map, row) => {
                        const existing = map.get(row.gradeLabel) ?? { gradeLabel: row.gradeLabel, bags: 0, kg: 0 };
                        existing.bags += row.bags;
                        existing.kg += row.kg;
                        map.set(row.gradeLabel, existing);
                        return map;
                      }, new Map<string, { gradeLabel: string; bags: number; kg: number }>()).values(),
                    )}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#EDE6D6" />
                    <XAxis dataKey="gradeLabel" stroke="#8A7B62" fontSize={12} />
                    <YAxis stroke="#8A7B62" fontSize={12} />
                    <Tooltip formatter={(value: number) => `${value.toLocaleString()} bags`} contentStyle={{ borderRadius: 8, border: '1px solid #EDE6D6' }} />
                    <Bar dataKey="bags" fill="#C9982F" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {hasPermission('warehouse.inventory.view') && (
            <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg text-paddy-900">📦 Pectra Rice - company stock</h2>
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
          )}
        </>
      )}

      {data && (
        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-soil-500">By location</p>
            <input
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              placeholder="Filter by size - e.g. Size 4"
              className="w-56 rounded-lg border border-paddy-100 px-3 py-1.5 text-xs"
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <InventorySection title="🌾 On farms" rows={data.farms} emptyLabel="No paddy on hand at any farm right now." filterText={locationFilter} />
            {hasPermission('warehouse.inventory.view') && (
              <InventorySection title="🏭 In warehouses" rows={data.warehouses} emptyLabel="No stock in any warehouse right now." filterText={locationFilter} />
            )}
            {hasPermission('milling.view') && (
              <InventorySection title="⚙️ At milling" rows={data.millingCenters} emptyLabel="No stock at any milling center right now." filterText={locationFilter} />
            )}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
