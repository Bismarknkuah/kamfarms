'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import {
  farmsApi, paddyEntriesApi, deliveryOrdersApi,
  Farm, PaddyEntry, DeliveryOrder,
  ApiError,
} from '@/lib/api-client';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-ink-500/10 text-ink-700',
  SUBMITTED: 'bg-husk-300 text-soil-700',
  APPROVED: 'bg-paddy-700 text-rice-50',
  REJECTED: 'bg-red-100 text-red-700',
};

export default function FarmDetailPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const params = useParams();
  const router = useRouter();
  const farmId = params.id as string;

  const [farm, setFarm] = useState<Farm | null>(null);
  const [inventory, setInventory] = useState<{ totalKg: number; totalBags: number; byGrade: { gradeCode: string; gradeLabel: string; totalKg: number; bagCount: number }[] } | null>(null);
  const [entries, setEntries] = useState<PaddyEntry[] | null>(null);
  const [orders, setOrders] = useState<DeliveryOrder[] | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !farmId) return;
    farmsApi.list(accessToken, true)
      .then((list) => {
        const found = list.find((f) => f.id === farmId);
        if (!found) {
          setPageError('Farm not found, or you don\u2019t have access to it.');
          return;
        }
        setFarm(found);
      })
      .catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load farm.'));

    farmsApi.getInventory(accessToken, farmId).then(setInventory).catch(() => {});
    paddyEntriesApi.list(accessToken, farmId).then((res) => setEntries(res.slice(0, 10))).catch(() => {});
    if (hasPermission('delivery.view') || hasPermission('delivery.create') || hasPermission('delivery.approve')) {
      deliveryOrdersApi.list(accessToken, farmId).then((res) => setOrders(res.slice(0, 10))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, farmId]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <button type="button" onClick={() => router.push('/farms')} className="text-sm text-ink-500 hover:text-paddy-900">
        ← Back to Farms
      </button>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {farm && (
        <>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs text-ink-500">{farm.code}</p>
              <h1 className="mt-0.5 font-display text-2xl font-medium text-paddy-900">
                {farm.name}
                {!farm.isActive && <span className="ml-2 rounded-full bg-ink-500/10 px-2 py-0.5 text-xs font-medium text-ink-500">Inactive</span>}
              </h1>
              <p className="mt-1 text-sm text-ink-500">{farm.location ?? 'No location set'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Farm Manager(s)</p>
              {farm.managers.length > 0 ? (
                farm.managers.map((m) => <p key={m.user.id} className="text-sm text-ink-900">{m.user.firstName} {m.user.lastName}</p>)
              ) : (
                <p className="text-sm text-ink-500">No manager assigned</p>
              )}
            </div>
          </div>

          {inventory && (
            <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-5">
              <h2 className="font-display text-lg text-paddy-900">Current inventory</h2>
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-rice-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Total</p>
                  <p className="mt-1 font-display text-lg text-paddy-900">{inventory.totalKg.toLocaleString()} KG</p>
                  <p className="text-xs text-ink-500">{inventory.totalBags.toLocaleString()} bags</p>
                </div>
                {inventory.byGrade.map((g) => (
                  <div key={g.gradeCode} className="rounded-lg bg-rice-50 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{g.gradeLabel}</p>
                    <p className="mt-1 font-display text-lg text-paddy-900">{g.totalKg.toLocaleString()} KG</p>
                    <p className="text-xs text-ink-500">{g.bagCount.toLocaleString()} bags</p>
                  </div>
                ))}
              </div>
              {inventory.byGrade.length === 0 && <p className="mt-2 text-sm text-ink-500">No stock currently on hand.</p>}
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-paddy-100 bg-white p-5">
              <h2 className="font-display text-lg text-paddy-900">Recent paddy entries</h2>
              <div className="mt-3 space-y-2">
                {entries?.map((e) => (
                  <div key={e.id} className="flex items-center justify-between rounded-lg bg-rice-50 px-3 py-2 text-sm">
                    <span className="text-ink-700">
                      {e.bagCount.toLocaleString()} bags · {e.weightKg.toLocaleString()} KG{e.weightEstimated ? ' (est.)' : ''} · {e.paddyGrade.label}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[e.status] ?? 'bg-ink-500/10'}`}>{e.status}</span>
                  </div>
                ))}
                {entries?.length === 0 && <p className="text-sm text-ink-500">No paddy entries logged yet.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-paddy-100 bg-white p-5">
              <h2 className="font-display text-lg text-paddy-900">Recent deliveries</h2>
              <div className="mt-3 space-y-2">
                {orders?.map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-lg bg-rice-50 px-3 py-2 text-sm">
                    <span className="text-ink-700">{o.orderNumber} → {o.destinationWarehouse.name} · {o.bagCount} bags</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[o.status] ?? 'bg-ink-500/10'}`}>{o.status.replace('_', ' ')}</span>
                  </div>
                ))}
                {orders === null && !hasPermission('delivery.view') && !hasPermission('delivery.create') && !hasPermission('delivery.approve') && (
                  <p className="text-sm text-ink-500">You don&rsquo;t have permission to view deliveries.</p>
                )}
                {orders?.length === 0 && <p className="text-sm text-ink-500">No deliveries logged yet.</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </DashboardShell>
  );
}
