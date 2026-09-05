'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { qualityApi, QualityInspection, ApiError } from '@/lib/api-client';

const RESULT_STYLES: Record<string, string> = {
  PENDING: 'bg-ink-500/10 text-ink-700',
  PASSED: 'bg-paddy-700 text-rice-50',
  FAILED: 'bg-red-100 text-red-700',
  QUARANTINED: 'bg-husk-300 text-soil-700',
  RELEASED: 'bg-paddy-100 text-paddy-900',
};

export default function QualityPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [inspections, setInspections] = useState<QualityInspection[] | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [batchNumber, setBatchNumber] = useState('');
  const [moisturePercent, setMoisturePercent] = useState('');
  const [grainQuality, setGrainQuality] = useState('');
  const [foreignMaterialPercent, setForeignMaterialPercent] = useState('');
  const [brokenPercent, setBrokenPercent] = useState('');
  const [appearance, setAppearance] = useState('');
  const [smell, setSmell] = useState('');
  const [qualityGrade, setQualityGrade] = useState('');
  const [result, setResult] = useState('PASSED');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canInspect = hasPermission('quality.manage');

  const loadInspections = (token: string) => {
    qualityApi.list(token).then(setInspections).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load inspections.'));
  };

  useEffect(() => {
    if (accessToken) loadInspections(accessToken);
  }, [accessToken]);

  const resetForm = () => {
    setBatchNumber(''); setMoisturePercent(''); setGrainQuality(''); setForeignMaterialPercent('');
    setBrokenPercent(''); setAppearance(''); setSmell(''); setQualityGrade(''); setResult('PASSED'); setNotes('');
  };

  const onSubmit = async () => {
    if (!accessToken || !batchNumber.trim()) return;
    setSubmitting(true);
    setPageError(null);
    try {
      await qualityApi.create(accessToken, {
        batchNumber: batchNumber.trim(),
        moisturePercent: moisturePercent ? parseFloat(moisturePercent) : undefined,
        grainQuality: grainQuality || undefined,
        foreignMaterialPercent: foreignMaterialPercent ? parseFloat(foreignMaterialPercent) : undefined,
        brokenPercent: brokenPercent ? parseFloat(brokenPercent) : undefined,
        appearance: appearance || undefined,
        smell: smell || undefined,
        qualityGrade: qualityGrade || undefined,
        result,
        notes: notes || undefined,
      });
      resetForm();
      setShowForm(false);
      loadInspections(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to record inspection.');
    } finally {
      setSubmitting(false);
    }
  };

  const onRelease = async (id: string) => {
    if (!accessToken) return;
    try {
      await qualityApi.release(accessToken, id, 'Released after re-check.');
      loadInspections(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to release.');
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-paddy-900">Quality</h1>
          <p className="mt-1 text-sm text-ink-500">{inspections ? `${inspections.length} inspections` : 'Loading…'}</p>
        </div>
        {canInspect && (
          <button type="button" onClick={() => setShowForm((v) => !v)} className="rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50">
            {showForm ? 'Cancel' : '+ New inspection'}
          </button>
        )}
      </div>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {showForm && canInspect && (
        <div className="mt-4 rounded-2xl border border-husk-300 bg-husk-100/30 p-5">
          <h3 className="font-display text-lg text-paddy-900">Record a quality inspection</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-700">Batch number</label>
              <input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="e.g. PB-0001" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-700">Moisture %</label>
              <input type="number" value={moisturePercent} onChange={(e) => setMoisturePercent(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-700">Grain quality</label>
              <input value={grainQuality} onChange={(e) => setGrainQuality(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-700">Foreign material %</label>
              <input type="number" value={foreignMaterialPercent} onChange={(e) => setForeignMaterialPercent(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-700">Broken %</label>
              <input type="number" value={brokenPercent} onChange={(e) => setBrokenPercent(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-700">Quality grade</label>
              <input value={qualityGrade} onChange={(e) => setQualityGrade(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-700">Appearance</label>
              <input value={appearance} onChange={(e) => setAppearance(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-700">Smell</label>
              <input value={smell} onChange={(e) => setSmell(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-700">Result</label>
              <select value={result} onChange={(e) => setResult(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                <option value="PASSED">Passed</option>
                <option value="FAILED">Failed (will be quarantined)</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-ink-700">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          </div>
          <button type="button" onClick={onSubmit} disabled={submitting || !batchNumber.trim()} className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
            {submitting ? 'Saving…' : 'Record inspection'}
          </button>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3">Batch</th>
              <th className="px-4 py-3">Moisture</th>
              <th className="px-4 py-3">Grade</th>
              <th className="px-4 py-3">Inspector</th>
              <th className="px-4 py-3">Result</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paddy-100">
            {inspections?.map((insp) => (
              <tr key={insp.id}>
                <td className="px-4 py-3 font-mono text-xs text-ink-700">{insp.batchNumber}</td>
                <td className="px-4 py-3 text-ink-700">{insp.moisturePercent !== null ? `${insp.moisturePercent}%` : '—'}</td>
                <td className="px-4 py-3 text-ink-700">{insp.qualityGrade ?? '—'}</td>
                <td className="px-4 py-3 text-ink-700">{insp.inspector.firstName} {insp.inspector.lastName}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${RESULT_STYLES[insp.result] ?? 'bg-ink-500/10'}`}>{insp.result}</span>
                </td>
                <td className="px-4 py-3">
                  {insp.result === 'QUARANTINED' && canInspect && (
                    <button type="button" onClick={() => onRelease(insp.id)} className="rounded-full border border-husk-500 px-3 py-1 text-xs font-medium text-paddy-900 hover:bg-husk-500 hover:text-white">
                      Release
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {inspections?.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-500">No inspections recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  );
}
