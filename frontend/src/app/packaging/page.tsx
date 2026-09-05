'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { packagingApi, PackagingBatch, ApiError } from '@/lib/api-client';

export default function PackagingPage() {
  const { me, accessToken, loading, error } = useCurrentUser();
  const [batches, setBatches] = useState<PackagingBatch[] | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    packagingApi
      .list(accessToken)
      .then(setBatches)
      .catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load packaging batches.'));
  }, [accessToken]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Packaging</h1>
      <p className="mt-1 text-sm text-ink-500">
        {batches ? `${batches.length} batches` : 'Loading…'} — no approval step; bulk rice becomes retail bags
        as a direct operational record.
      </p>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3">Batch</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Bags</th>
              <th className="px-4 py-3">Total KG</th>
              <th className="px-4 py-3">Warehouse</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paddy-100">
            {batches?.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-3 font-mono text-xs text-ink-700">{b.batchNumber}</td>
                <td className="px-4 py-3 text-ink-900">{b.product.name}</td>
                <td className="px-4 py-3 text-ink-700">{b.packagingSize.label}</td>
                <td className="px-4 py-3 text-ink-700">{b.bagCount}</td>
                <td className="px-4 py-3 text-ink-700">{b.totalKg.toLocaleString()}</td>
                <td className="px-4 py-3 text-ink-700">{b.warehouse.name}</td>
              </tr>
            ))}
            {batches?.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-500">No packaging batches yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  );
}
