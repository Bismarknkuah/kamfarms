'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { ApiError, Farm, PaddyGrade, PaddyIntakeResult, paddyEntriesApi } from '@/lib/api-client';
import { IntakeFailure, IntakeSuccess } from '@/components/intake/IntakeFeedback';

interface Line { paddyGradeId: string; bagCount: string; weightKg: string }
const EMPTY: Line = { paddyGradeId: '', bagCount: '', weightKg: '' };

/**
 * ONE intake with every size that arrived: "Size 4: 17 bags" and "Size 5: 3 bags" on one form, saved together (all or none) and sent for
 * approval in the same step. Bags are what is counted; kilograms are optional, for the places that have a scale. After saving it SAYS so,
 * and when saving fails it says nothing was saved and why. Nothing happens silently.
 */
export function PaddyIntakeForm({ accessToken, farms, grades, canSubmit, onSaved }: { accessToken: string; farms: Farm[]; grades: PaddyGrade[]; canSubmit: boolean; onSaved: () => void }) {
  const [farmId, setFarmId] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY }]);
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

  const setLine = (i: number, patch: Partial<Line>) => setLines((prev) => prev.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const filled = lines.filter((l) => l.paddyGradeId || l.bagCount);
  const totalBags = lines.reduce((t, l) => t + (parseInt(l.bagCount, 10) || 0), 0);
  const labelOf = (id: string) => grades.find((g) => g.id === id)?.label ?? 'a size';

  /** Everything wrong, in plain words, so no tap on "Submit" is ever met with silence. */
  const check = (): string[] => {
    const out: string[] = [];
    if (!farmId) out.push('Choose the farm.');
    if (!entryDate) out.push('Enter the date.');
    if (filled.length === 0) out.push('Add at least one size with its bags.');
    const seen = new Set<string>();
    filled.forEach((l, i) => {
      const n = i + 1;
      if (!l.paddyGradeId) out.push(`Line ${n}: choose the size.`);
      if (!l.bagCount) out.push(`Line ${n}: enter the number of bags.`);
      else if (!/^\d+$/.test(l.bagCount) || parseInt(l.bagCount, 10) < 1) out.push(`Line ${n}: bags must be a whole number of at least 1.`);
      if (l.weightKg && !(parseFloat(l.weightKg) > 0)) out.push(`Line ${n}: kilograms must be more than zero, or left blank.`);
      if (l.paddyGradeId) { if (seen.has(l.paddyGradeId)) out.push(`${labelOf(l.paddyGradeId)} is on the list twice: put all of its bags on one line.`); seen.add(l.paddyGradeId); }
    });
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
        lines: filled.map((l) => ({ paddyGradeId: l.paddyGradeId, bagCount: parseInt(l.bagCount, 10), weightKg: l.weightKg ? parseFloat(l.weightKg) : undefined })),
        moisturePercent: moisture ? parseFloat(moisture) : undefined,
        qualityGrade: quality.trim() || undefined,
        supplierName: supplier.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setResult(r);
      setLines([{ ...EMPTY }]); setMoisture(''); setQuality(''); setSupplier(''); setNotes('');
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
        <p className="mt-0.5 text-sm text-ink-500">Everything that arrived, in one go: add each size with its bags. Kilograms are optional, for places with a scale.</p>

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

        <div className="mt-4" role="group" aria-label="Sizes in this intake">
          <div className="hidden grid-cols-[1.4fr_0.8fr_1fr_auto] gap-2 px-1 text-xs font-medium text-ink-500 sm:grid"><span>Size</span><span>Bags</span><span>KG (optional)</span><span /></div>
          {lines.map((l, i) => (
            <div key={i} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_0.8fr_1fr_auto]" data-testid="intake-line">
              <select aria-label={`Size, line ${i + 1}`} value={l.paddyGradeId} onChange={(e) => setLine(i, { paddyGradeId: e.target.value })} className={`${input} col-span-2 w-full min-w-0 sm:col-span-1`}>
                <option value="">Choose a size...</option>
                {grades.map((g) => <option key={g.id} value={g.id} disabled={lines.some((o, k) => k !== i && o.paddyGradeId === g.id)}>{g.label}</option>)}
              </select>
              <input aria-label={`Bags, line ${i + 1}`} inputMode="numeric" value={l.bagCount} placeholder="Bags" onChange={(e) => setLine(i, { bagCount: e.target.value.replace(/[^0-9]/g, '') })} className={`${input} w-full min-w-0`} />
              <input aria-label={`Kilograms, line ${i + 1}, optional`} inputMode="decimal" value={l.weightKg} placeholder="No scale? leave blank" onChange={(e) => setLine(i, { weightKg: e.target.value.replace(/[^0-9.]/g, '') })} className={`${input} w-full min-w-0`} />
              {lines.length > 1 ? (
                <button type="button" onClick={() => setLines((prev) => prev.filter((_, k) => k !== i))} aria-label={`Remove line ${i + 1}`} className="col-span-2 grid h-10 place-items-center justify-self-end rounded-full px-3 text-ink-500 hover:bg-red-50 hover:text-red-700 sm:col-span-1 sm:w-10 sm:px-0"><X className="h-4 w-4" aria-hidden="true" /></button>
              ) : <span className="hidden h-10 w-10 sm:block" aria-hidden="true" />}
            </div>
          ))}
          <button type="button" onClick={() => setLines((prev) => [...prev, { ...EMPTY }])} disabled={lines.length >= Math.min(12, Math.max(grades.length, 1))} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-paddy-700 px-4 py-1.5 text-xs font-medium text-paddy-700 disabled:opacity-40">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add another size
          </button>
          <p className="mt-3 text-sm text-ink-700" data-testid="intake-total">
            {filled.length > 0 && totalBags > 0 ? <>Total: <strong>{totalBags} bag{totalBags === 1 ? '' : 's'}</strong> ({filled.filter((l) => l.paddyGradeId && l.bagCount).map((l) => `${labelOf(l.paddyGradeId)} ${l.bagCount}`).join(', ')})</> : 'Nothing added yet.'}
          </p>
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
