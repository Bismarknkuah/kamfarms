'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { warehousesApi, Warehouse, WarehouseInventory, ApiError } from '@/lib/api-client';

export default function WarehouseDetailPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const params = useParams();
  const router = useRouter();
  const warehouseId = params.id as string;

  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [inventory, setInventory] = useState<WarehouseInventory | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !warehouseId) return;
    // No single-warehouse-by-id endpoint exists (only list and
    // directory) - the full list is fetched and filtered client-side
    // rather than adding a new backend route for what's already a
    // small, cached-in-memory collection.
    warehousesApi.list(accessToken, true).then((list) => {
      const found = list.find((w) => w.id === warehouseId);
      if (!found) { setPageError('Warehouse not found.'); return; }
      setWarehouse(found);
    }).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load warehouse.'));

    warehousesApi.getInventory(accessToken, warehouseId).then(setInventory).catch((err: unknown) =>
      setPageError(err instanceof ApiError ? err.message : 'Failed to load warehouse inventory.'),
    );
  }, [accessToken, warehouseId]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  if (!hasPermission('warehouse.view')) {
    return (
      <DashboardShell me={me}>
        <p className="text-sm text-ink-700">You don&rsquo;t have permission to view this page.</p>
      </DashboardShell>
    );
  }

  const packagedTotalKg = inventory?.packagedByProduct.reduce((s, p) => s + p.totalKg, 0) ?? 0;

  return (
    <DashboardShell me={me}>
      <button type="button" onClick={() => router.push('/warehouses')} className="mb-3 text-xs font-medium text-paddy-700 underline">
        ← All warehouses
      </button>

      {pageError && <p className="text-sm text-red-600">{pageError}</p>}

      {warehouse && (
        <>
          <p className="font-mono text-xs text-ink-500">{warehouse.code}</p>
          <h1 className="mt-1 font-display text-3xl font-medium text-paddy-900">{warehouse.name}</h1>
          <p className="mt-1 text-sm text-ink-500">{warehouse.location ?? 'No location set'}</p>

          {warehouse.managers.length > 0 && (
            <p className="mt-2 text-xs text-ink-500">
              Managed by {warehouse.managers.map((m) => `${m.user.firstName} ${m.user.lastName}`).join(', ')}
            </p>
          )}

          {warehouse.millingCenters.length > 0 && (
            <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-5">
              <h2 className="font-display text-lg text-paddy-900">Milling centers at this warehouse</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {warehouse.millingCenters.map((mc) => (
                  <span key={mc.id} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${mc.isActive ? 'border-paddy-100 text-paddy-900' : 'border-ink-500/20 text-ink-500'}`}>
                    {mc.name}{!mc.isActive && ' (inactive)'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {inventory && (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-paddy-100 bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-soil-500">Paddy on hand</p>
                  <p className="mt-1 font-display text-2xl text-paddy-900">{inventory.paddyTotalKg.toLocaleString()} KG</p>
                  <p className="text-xs text-ink-500">{inventory.paddyByGrade.reduce((s, g) => s + g.bagCount, 0).toLocaleString()} bags, all grades</p>
                </div>
                <div className="rounded-2xl border border-paddy-100 bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-soil-500">Packaged rice on hand</p>
                  <p className="mt-1 font-display text-2xl text-paddy-900">{packagedTotalKg.toLocaleString()} KG</p>
                  <p className="text-xs text-ink-500">{inventory.packagedByProduct.reduce((s, p) => s + p.bagCount, 0).toLocaleString()} bags, all products</p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-5">
                <h2 className="font-display text-lg text-paddy-900">Paddy by grade</h2>
                <div className="mt-3 space-y-1.5">
                  {inventory.paddyByGrade.map((g) => (
                    <div key={g.gradeCode} className="flex items-center justify-between rounded-lg bg-rice-50 px-3 py-2 text-sm">
                      <span className="font-medium text-ink-900">{g.gradeLabel}</span>
                      <span className="text-ink-700">{g.bagCount.toLocaleString()} bags · {g.totalKg.toLocaleString()} KG</span>
                    </div>
                  ))}
                  {inventory.paddyByGrade.length === 0 && <p className="text-sm text-ink-500">No paddy currently on hand at this warehouse.</p>}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-5">
                <h2 className="font-display text-lg text-paddy-900">Packaged rice by product</h2>
                <div className="mt-3 space-y-1.5">
                  {inventory.packagedByProduct.map((p, i) => (
                    <div key={`${p.productName}-${p.packageLabel}-${i}`} className="flex items-center justify-between rounded-lg bg-rice-50 px-3 py-2 text-sm">
                      <span className="font-medium text-ink-900">{p.productName} - {p.packageLabel}</span>
                      <span className="text-ink-700">{p.bagCount.toLocaleString()} bags · {p.totalKg.toLocaleString()} KG</span>
                    </div>
                  ))}
                  {inventory.packagedByProduct.length === 0 && <p className="text-sm text-ink-500">No packaged rice currently on hand at this warehouse.</p>}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </DashboardShell>
  );
}
