'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError, Farm, PaddyGrade, PaddyIntakeResult, paddyEntriesApi } from '@/lib/api-client';
import { IntakeFailure, IntakeSuccess } from '@/components/intake/IntakeFeedback';
import { SizeBags, linesOf } from '@/components/SizeBags';

/**
 * ONE intake with every size that arrived: Size 4 and Size 5 are already on the form with a big minus, a number and a plus, saved together (all or
 * none) and sent for approval in the same step. Bags are what is counted; kilograms are optional, for the places that have a scale. After saving it
 * SAYS so, and when saving fails it says nothing was saved and why. Nothing happens silently.
 */
export function PaddyIntakeForm({ accessToken, farms, grades, canSubmit, onSaved }: { accessToken: string; farms: Farm[]; grades: PaddyGrade[]; canSubmit: boolean; onSaved: () => void }) {
  const [farmId, setFarmId] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [bags, setBags] = useState<Record<string, number>>({});
  const [kg, setKg] = useState<Record<string, string>>({});
  const [moisture, setMoisture] = useState('');
  const [quality, setQuality] = useState('');
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [result, setResult] = useState<PaddyIntakeResult | null>(null);
  const feedback = useRef<HTMLDivElement>(null);

  useEffect(() => { if (farms.length === 1) setFarmId(farms[0].id); }, [farms]);
  useEffect(() => { if ((result || failure) && feedback.current) feedback.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [result, failure]);

  const going = linesOf(bags);
  const labelOf = (id: string) => grades.find((g) => g.id === id)?.label ?? 'a size';

  /** Everything wrong, in plain words, so no tap on "Submit" is ever met with silence. */
  const check = (): string[] => {
    const out: string[] = [];
    if (!farmId) out.push('Choose the farm.');
    if (!entryDate) out.push('Enter the date.');
    if (going.length === 0) out.push('Put the bags on Size 4 or Size 5.');
    for (const l of going) if (kg[l.paddyGradeId] && !(parseFloat(kg[l.paddyGradeId]) > 0)) out.push(`${labelOf(l.paddyGradeId)}: kilograms must be more than zero, or left blank.`);
    return out;
  };

  const save = async (submit: boolean) => {
    setResult(null); setFailure(null);
    const found = check();
    setProblems(found);
    if (found.length > 0) return;
    setBusy(true);
    try {
      const r = await paddyEntriesApi.createIntake(accessToken, {
        farmId, entryDate, submit,
        lines: going.map((l) => ({ paddyGradeId: l.paddyGradeId, bagCount: l.bags, weightKg: kg[l.paddyGradeId] ? parseFloat(kg[l.paddyGradeId]) : undefined })),
        moisturePercent: moisture ? parseFloat(moisture) : undefined,
        qualityGrade: quality.trim() || undefined,
        supplierName: supplier.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setResult(r);
      setBags({}); setKg({}); setMoisture(''); setQuality(''); setSupplier(''); setNotes('');
      onSaved();
    } catch (err) {
      setFailure(err instanceof ApiError ? err.message : 'The intake could not be saved. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const input = 'rounded-lg border border-paddy-100 bg-white px-3 py-2 text-sm';
  return (
    <div className="mt-6 space-y-4" data-testid="intake-form">
      <div className="rounded-2xl border border-husk-300 bg-husk-100/30 p-5">
        <h2 className="font-display text-lg text-paddy-900">Log a paddy intake</h2>
        <p className="mt-0.5 text-sm text-ink-500">Everything that arrived, in one go. Kilograms are not needed.</p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="intake-farm" className="mb-1 block text-xs font-medium text-ink-700">Farm</label>
            <select id="intake-farm" value={farmId} onChange={(e) => setFarmId(e.target.value)} className={`${input} w-full`}>
              <option value="">Select a farm...</option>
              {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="intake-date" className="mb-1 block text-xs font-medium text-ink-700">Date</label>
            <input id="intake-date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className={`${input} w-full`} />
          </div>
        </div>

        <div className="mt-4">
          <SizeBags grades={grades} value={bags} onChange={setBags} />
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-paddy-700">I weighed it (not needed)</summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {grades.filter((g) => (bags[g.id] ?? 0) > 0).map((g) => <input key={g.id} aria-label={`Kilograms of ${g.label}, optional`} inputMode="decimal" value={kg[g.id] ?? ''} placeholder={`${g.label} KG`} onChange={(e) => setKg((p) => ({ ...p, [g.id]: e.target.value.replace(/[^0-9.]/g, '') }))} className={`${input} w-full min-w-0`} />)}
            </div>
          </details>
        </div>

        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-paddy-700">More details (optional): moisture, quality, supplier, notes</summary>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input aria-label="Moisture percent" inputMode="decimal" value={moisture} onChange={(e) => setMoisture(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Moisture %" className={input} />
            <input aria-label="Quality" value={quality} onChange={(e) => setQuality(e.target.value)} placeholder="Quality" className={input} />
            <input aria-label="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier" className={input} />
            <input aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className={input} />
          </div>
        </details>

        {problems.length > 0 && (
          <div role="alert" data-testid="intake-problems" className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-medium">Not submitted yet. Please fix:</p>
            <ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {canSubmit && (
            <button type="button" data-testid="intake-submit" onClick={() => save(true)} disabled={busy} className="rounded-full bg-paddy-900 px-6 py-2 text-sm font-medium text-rice-50 disabled:opacity-50">
              {busy ? 'Submitting...' : 'Submit intake'}
            </button>
          )}
          <button type="button" data-testid="intake-draft" onClick={() => save(false)} disabled={busy} className={canSubmit ? 'text-xs font-medium text-paddy-700 underline disabled:opacity-50' : 'rounded-full bg-paddy-900 px-6 py-2 text-sm font-medium text-rice-50 disabled:opacity-50'}>
            Save as a draft
          </button>
          {busy && <span role="status" className="text-xs text-ink-500">Saving, please wait...</span>}
        </div>
      </div>

      <div ref={feedback}>
        {result && <IntakeSuccess result={result} onAnother={() => setResult(null)} onClose={() => setResult(null)} />}
        {failure && <IntakeFailure message={failure} onClose={() => setFailure(null)} />}
      </div>
    </div>
  );
}
