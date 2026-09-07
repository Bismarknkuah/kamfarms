'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { packagingApi, masterDataApi, warehousesApi, PackagingBatch, Product, PackagingSize, ApiError } from '@/lib/api-client';

export default function PackagingPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [batches, setBatches] = useState<PackagingBatch[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [sizes, setSizes] = useState<PackagingSize[]>([]);
  const [millingCenters, setMillingCenters] = useState<{ id: string; name: string }[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);

  const [showCreatePanel, setShowCreatePanel] = useState(false);
  // One row per product/size combination - a real packaging run very
  // often covers more than one at once ("50 bags of Pectra Rice at
  // 25KG, plus 20 bags of Rice Hull at 50KG"), matching the same
  // multi-row pattern already proven correct for paddy intake and
  // dispatch.
  const [batchRows, setBatchRows] = useState([{ productId: '', packagingSizeId: '', bagCount: '' }]);
  const [millingCenterId, setMillingCenterId] = useState('');
  const [sourceBulkKg, setSourceBulkKg] = useState('');
  const [packagingDate, setPackagingDate] = useState(new Date().toISOString().slice(0, 10));
  const [sourceReferences, setSourceReferences] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const loadBatches = (token: string) => {
    packagingApi.list(token).then(setBatches).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load packaging batches.'));
  };

  useEffect(() => {
    if (!accessToken) return;
    loadBatches(accessToken);
    masterDataApi.products(accessToken).then(setProducts).catch(() => {});
    masterDataApi.packagingSizes(accessToken).then(setSizes).catch(() => {});
    warehousesApi.list(accessToken).then((list) => {
      setMillingCenters(list.flatMap((w) => w.millingCenters.filter((mc) => mc.isActive).map((mc) => ({ id: mc.id, name: `${mc.name} (${w.name})` }))));
    }).catch(() => {});
  }, [accessToken]);

  const updateBatchRow = (index: number, field: 'productId' | 'packagingSizeId' | 'bagCount', value: string) => {
    setBatchRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };
  const addBatchRow = () => setBatchRows((prev) => [...prev, { productId: '', packagingSizeId: '', bagCount: '' }]);
  const removeBatchRow = (index: number) => setBatchRows((prev) => prev.filter((_, i) => i !== index));
  const validBatchRows = batchRows.filter((r) => r.productId && r.packagingSizeId && r.bagCount);

  const onCreate = async () => {
    if (!accessToken || !millingCenterId || validBatchRows.length === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      for (const row of validBatchRows) {
        await packagingApi.create(accessToken, {
          productId: row.productId, packagingSizeId: row.packagingSizeId, bagCount: parseInt(row.bagCount, 10), millingCenterId,
          sourceBulkKg: sourceBulkKg ? parseFloat(sourceBulkKg) : undefined,
          packagingDate, notes: notes || undefined,
          sourceReferenceNumbers: sourceReferences.trim() ? sourceReferences.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        });
      }
      setBatchRows([{ productId: '', packagingSizeId: '', bagCount: '' }]);
      setSourceBulkKg(''); setSourceReferences(''); setNotes('');
      setCreateSuccess(`${validBatchRows.length} packaging batch${validBatchRows.length === 1 ? '' : 'es'} recorded ✓`);
      setTimeout(() => setCreateSuccess(null), 3000);
      loadBatches(accessToken);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to record packaging batch.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-paddy-900">Packaging</h1>
          <p className="mt-1 text-sm text-ink-500">
            {batches ? `${batches.length} batches` : 'Loading…'} - bulk rice becomes retail bags; total KG is always
            derived from bag count × size, never typed directly.
          </p>
        </div>
        {hasPermission('packaging.create') && (
          <button
            type="button"
            onClick={() => setShowCreatePanel((v) => !v)}
            className="flex items-center gap-2 rounded-full bg-paddy-900 px-5 py-2.5 text-sm font-medium text-rice-50 shadow-sm transition hover:bg-paddy-700"
          >
            📦 Record packaging batch
          </button>
        )}
      </div>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {showCreatePanel && (
        <div className="mt-4 rounded-2xl border-2 border-paddy-900 bg-rice-50 p-6">
          <h2 className="font-display text-lg text-paddy-900">Record a packaging batch</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <select value={millingCenterId} onChange={(e) => setMillingCenterId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
              <option value="">Source milling center…</option>
              {millingCenters.map((mc) => <option key={mc.id} value={mc.id}>{mc.name}</option>)}
            </select>
            <input type="date" value={packagingDate} onChange={(e) => setPackagingDate(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          </div>

          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-soil-500">Products packaged</p>
          <div className="space-y-3">
            {batchRows.map((row, index) => (
              <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <div>
                  {index === 0 && <label className="mb-1 block text-xs font-medium text-ink-700">Product</label>}
                  <select value={row.productId} onChange={(e) => updateBatchRow(index, 'productId', e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                    <option value="">Select…</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  {index === 0 && <label className="mb-1 block text-xs font-medium text-ink-700">Bag size</label>}
                  <select value={row.packagingSizeId} onChange={(e) => updateBatchRow(index, 'packagingSizeId', e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                    <option value="">Select…</option>
                    {sizes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  {index === 0 && <label className="mb-1 block text-xs font-medium text-ink-700">Number of bags</label>}
                  <input type="number" value={row.bagCount} onChange={(e) => updateBatchRow(index, 'bagCount', e.target.value)} placeholder="Bags" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                </div>
                {batchRows.length > 1 && (
                  <div className={index === 0 ? 'mt-5' : ''}>
                    <button type="button" onClick={() => removeBatchRow(index)} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addBatchRow} className="mt-2 text-xs font-medium text-paddy-700 underline">
            + Add another product or size
          </button>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <input type="number" value={sourceBulkKg} onChange={(e) => setSourceBulkKg(e.target.value)} placeholder="Bulk KG actually consumed (optional)" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-ink-500">Leave blank if there was no packaging loss.</p>
            </div>
            <input value={sourceReferences} onChange={(e) => setSourceReferences(e.target.value)} placeholder="Source production record numbers (comma-separated, optional)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="sm:col-span-2 rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          </div>

          {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}
          {createSuccess && <p className="mt-2 text-sm font-medium text-paddy-700">{createSuccess}</p>}
          <button
            type="button"
            onClick={onCreate}
            disabled={creating || !millingCenterId || validBatchRows.length === 0}
            className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50"
          >
            {creating ? 'Saving…' : 'Record batch'}
          </button>
        </div>
      )}

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
