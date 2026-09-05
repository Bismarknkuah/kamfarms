'use client';

import { useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { inventoryTransactionsApi, InventoryTransactionRecord, ApiError } from '@/lib/api-client';

function fmtLocation(type: string | null) {
  if (!type) return '—';
  if (type === 'EXTERNAL') return 'In transit';
  if (type === 'CUSTOMER') return 'Customer';
  return type.charAt(0) + type.slice(1).toLowerCase().replace('_', ' ');
}

export default function TracePage() {
  const { me, accessToken, loading, error } = useCurrentUser();
  const [batchNumber, setBatchNumber] = useState('');
  const [results, setResults] = useState<InventoryTransactionRecord[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const onSearch = async (byBatch: boolean) => {
    if (!accessToken) return;
    setSearching(true);
    setSearchError(null);
    setSearched(true);
    try {
      const data = byBatch
        ? await inventoryTransactionsApi.list(accessToken, { batchNumber: batchNumber.trim() })
        : await inventoryTransactionsApi.list(accessToken, {});
      setResults(data);
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : 'Failed to search.');
    } finally {
      setSearching(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Trace</h1>
      <p className="mt-1 text-sm text-ink-500">
        Enter a batch number to see its complete forward-and-backward history — every transaction, who recorded it, and when.
        Leave it blank to see your most recent transactions instead.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={batchNumber}
          onChange={(e) => setBatchNumber(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch(true)}
          placeholder="Batch number (e.g. PB-0001, PE-2026-000012)…"
          className="w-72 rounded-lg border border-paddy-100 px-3 py-2 text-sm"
        />
        <button type="button" onClick={() => onSearch(true)} disabled={searching || !batchNumber.trim()} className="rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50 disabled:opacity-50">
          {searching ? 'Searching…' : 'Trace batch'}
        </button>
        <button type="button" onClick={() => onSearch(false)} disabled={searching} className="rounded-full border border-paddy-100 px-5 py-2 text-sm font-medium text-ink-700 disabled:opacity-50">
          Show recent activity
        </button>
      </div>

      {searchError && <p className="mt-4 text-sm text-red-600">{searchError}</p>}

      {searched && results && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paddy-100">
              {results.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 text-xs text-ink-500">{new Date(t.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-700">{t.type}</td>
                  <td className="px-4 py-3 text-ink-700">{fmtLocation(t.sourceLocationType)}</td>
                  <td className="px-4 py-3 text-ink-700">{fmtLocation(t.destLocationType)}</td>
                  <td className="px-4 py-3 text-ink-900">{t.paddyGrade?.label ?? t.product?.name ?? '—'}{t.packagingSize ? ` (${t.packagingSize.label})` : ''}</td>
                  <td className="px-4 py-3 text-ink-700">{t.quantityKg.toLocaleString()} KG{t.bagCount !== null ? ` / ${t.bagCount} bags` : ''}</td>
                  <td className="px-4 py-3 text-ink-700">{t.user.firstName} {t.user.lastName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-500">{t.referenceDocument ?? t.batchNumber ?? '—'}</td>
                </tr>
              ))}
              {results.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-500">No transactions found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}
