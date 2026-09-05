'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { paddyEntriesApi, farmsApi, paddyGradesApi, PaddyEntry, Farm, PaddyGrade, ApiError } from '@/lib/api-client';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-ink-500/10 text-ink-700',
  SUBMITTED: 'bg-husk-300 text-soil-700',
  APPROVED: 'bg-paddy-700 text-rice-50',
  REJECTED: 'bg-red-100 text-red-700',
};

export default function PaddyEntriesPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [entries, setEntries] = useState<PaddyEntry[] | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [farmId, setFarmId] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [gradeId, setGradeId] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [bagCount, setBagCount] = useState('');
  const [creating, setCreating] = useState(false);

  const loadEntries = (token: string) => {
    paddyEntriesApi
      .list(token)
      .then(setEntries)
      .catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load paddy entries.'));
  };

  useEffect(() => {
    if (!accessToken) return;
    loadEntries(accessToken);
    farmsApi.list(accessToken).then(setFarms).catch(() => {});
    paddyGradesApi.list(accessToken).then(setGrades).catch(() => {});
  }, [accessToken]);

  const totalApprovedKg = entries?.filter((e) => e.status === 'APPROVED').reduce((sum, e) => sum + e.weightKg, 0) ?? 0;

  const runAction = async (fn: () => Promise<unknown>) => {
    if (!accessToken) return;
    setPageError(null);
    try {
      await fn();
      loadEntries(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  };

  const onCreate = async () => {
    if (!accessToken || !farmId || !gradeId || !weightKg || !bagCount) return;
    setCreating(true);
    setPageError(null);
    try {
      await paddyEntriesApi.create(accessToken, {
        farmId,
        entryDate,
        paddyGradeId: gradeId,
        weightKg: parseFloat(weightKg),
        bagCount: parseInt(bagCount, 10),
      });
      setShowCreate(false);
      setWeightKg('');
      setBagCount('');
      loadEntries(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to create entry.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-paddy-900">Paddy entries</h1>
          <p className="mt-1 text-sm text-ink-500">
            {entries ? `${entries.length} entries` : 'Loading…'} · {totalApprovedKg.toLocaleString()} KG approved
          </p>
        </div>
        {hasPermission('paddy.create') && (
          <button type="button" onClick={() => setShowCreate((v) => !v)} className="rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50">
            {showCreate ? 'Cancel' : 'Log paddy intake'}
          </button>
        )}
      </div>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {showCreate && (
        <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-husk-300 bg-husk-100/30 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Farm</label>
            <select value={farmId} onChange={(e) => setFarmId(e.target.value)} className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm">
              <option value="">Select…</option>
              {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Date</label>
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Grade</label>
            <select value={gradeId} onChange={(e) => setGradeId(e.target.value)} className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm">
              <option value="">Select…</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Weight (KG)</label>
            <input type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} className="w-28 rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Bags</label>
            <input type="number" value={bagCount} onChange={(e) => setBagCount(e.target.value)} className="w-24 rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
          </div>
          <button type="button" onClick={onCreate} disabled={creating} className="rounded-full bg-paddy-900 px-4 py-1.5 text-sm font-medium text-rice-50 disabled:opacity-50">
            {creating ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3">Entry</th>
              <th className="px-4 py-3">Farm</th>
              <th className="px-4 py-3">Grade</th>
              <th className="px-4 py-3">Weight</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paddy-100">
            {entries?.map((e) => (
              <>
                <tr key={e.id} className={expandedId === e.id ? 'bg-rice-50' : undefined}>
                  <td className="px-4 py-3 font-mono text-xs text-ink-700">
                    <button type="button" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)} className="flex items-center gap-1.5 hover:text-paddy-900">
                      <span className={`transition-transform ${expandedId === e.id ? 'rotate-90' : ''}`}>›</span>
                      {e.entryNumber}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-ink-900">{e.farm.name}</td>
                  <td className="px-4 py-3 text-ink-700">{e.paddyGrade.label}</td>
                  <td className="px-4 py-3 text-ink-700">
                    {e.weightKg.toLocaleString()} KG{e.weightEstimated ? <span className="text-ink-500"> (est.)</span> : ''} / {e.bagCount} bags
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[e.status] ?? 'bg-ink-500/10'}`}>{e.status}</span>
                    {e.rejectionReason && <p className="mt-1 text-xs text-red-600">{e.rejectionReason}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {e.status === 'DRAFT' && hasPermission('paddy.submit') && (
                        <button type="button" onClick={() => runAction(() => paddyEntriesApi.submit(accessToken!, e.id))} className="rounded-full border border-paddy-100 px-3 py-1 text-xs font-medium text-ink-700 hover:bg-paddy-50">
                          Submit
                        </button>
                      )}
                      {e.status === 'SUBMITTED' && hasPermission('paddy.approve') && (
                        <button type="button" onClick={() => runAction(() => paddyEntriesApi.approve(accessToken!, e.id))} className="rounded-full border border-husk-500 px-3 py-1 text-xs font-medium text-paddy-900 hover:bg-husk-500 hover:text-white">
                          Approve
                        </button>
                      )}
                      {e.status === 'SUBMITTED' && hasPermission('paddy.reject') && (
                        rejectingId === e.id ? (
                          <div className="flex items-center gap-1">
                            <input value={rejectReason} onChange={(ev) => setRejectReason(ev.target.value)} placeholder="Reason…" className="w-28 rounded-lg border border-paddy-100 px-2 py-1 text-xs" />
                            <button
                              type="button"
                              onClick={() => {
                                if (!rejectReason.trim()) return;
                                runAction(() => paddyEntriesApi.reject(accessToken!, e.id, rejectReason));
                                setRejectingId(null);
                                setRejectReason('');
                              }}
                              className="rounded-full border border-red-300 px-2 py-1 text-xs font-medium text-red-700"
                            >
                              Confirm
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setRejectingId(e.id)} className="rounded-full border border-paddy-100 px-3 py-1 text-xs font-medium text-ink-700">
                            Reject
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
                {expandedId === e.id && (
                  <tr className="bg-rice-50">
                    <td colSpan={6} className="px-4 pb-4 pt-0">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-paddy-100 bg-white p-4 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Submitted by</p>
                          <p className="text-ink-900">{e.submittedBy.firstName} {e.submittedBy.lastName}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Entry date</p>
                          <p className="text-ink-900">{new Date(e.entryDate).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Harvest date</p>
                          <p className="text-ink-900">{e.harvestDate ? new Date(e.harvestDate).toLocaleDateString() : 'Not provided'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Moisture</p>
                          <p className="text-ink-900">{e.moisturePercent !== null ? `${e.moisturePercent}%` : 'Not measured'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Quality grade</p>
                          <p className="text-ink-900">{e.qualityGrade ?? 'Not recorded'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Weight source</p>
                          <p className="text-ink-900">{e.weightEstimated ? 'Estimated from bag count' : 'Measured on a scale'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Supplier</p>
                          <p className="text-ink-900">{e.supplierName ?? 'Not provided'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Storage location</p>
                          <p className="text-ink-900">{e.storageLocation ?? 'Not provided'}</p>
                        </div>
                        {e.notes && (
                          <div className="col-span-2 sm:col-span-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Notes</p>
                            <p className="text-ink-900">{e.notes}</p>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {entries?.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-500">No paddy entries yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  );
}
