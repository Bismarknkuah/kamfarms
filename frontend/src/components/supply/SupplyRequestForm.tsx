'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { ApiError, PaddyGrade, SupplyView, paddyGradesApi, supplyApi, warehousesApi } from '@/lib/api-client';
import { SizeBags, linesOf } from '@/components/SizeBags';
import { longDate } from '@/lib/dates';

type Dir = { id: string; name: string; location?: string | null; millingCenters?: { id: string; name: string }[] };
const dayFrom = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const WHEN = [['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['In a week', 7]] as const;

/**
 * Ask for paddy: pick the warehouse (or the mill) that needs it, put the bags on Size 4 and Size 5, say when it is needed, and send. It goes to
 * the next person in the chain, who is told and given a task with a link.
 */
export function SupplyRequestForm({ accessToken, allowWarehouse, allowMill, onlyWarehouseIds, onlyMillIds, onSent, onClose }: {
  accessToken: string; allowWarehouse: boolean; allowMill: boolean; onlyWarehouseIds?: string[] | null; onlyMillIds?: string[] | null; onSent: () => void; onClose?: () => void;
}) {
  const [dir, setDir] = useState<Dir[]>([]);
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  const [kind, setKind] = useState<'WAREHOUSE' | 'MILL'>(allowWarehouse ? 'WAREHOUSE' : 'MILL');
  const [target, setTarget] = useState('');
  const [bags, setBags] = useState<Record<string, number>>({});
  const [neededBy, setNeededBy] = useState(dayFrom(2));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState<SupplyView | null>(null);

  useEffect(() => {
    warehousesApi.directory(accessToken).then(setDir).catch(() => {});
    paddyGradesApi.list(accessToken).then(setGrades).catch(() => {});
  }, [accessToken]);

  const targets = kind === 'WAREHOUSE'
    ? dir.filter((w) => !onlyWarehouseIds || onlyWarehouseIds.includes(w.id)).map((w) => ({ id: w.id, label: `${w.name}${w.location ? ` (${w.location})` : ''}` }))
    : dir.flatMap((w) => (w.millingCenters ?? []).filter((m) => !onlyMillIds || onlyMillIds.includes(m.id)).map((m) => ({ id: m.id, label: `${m.name} (${w.name})` })));
  useEffect(() => {
    if (targets.length === 1) setTarget(targets[0].id);
    else if (!targets.some((t) => t.id === target)) setTarget('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, dir.length, onlyWarehouseIds?.join(','), onlyMillIds?.join(',')]);

  const send = async () => {
    setSent(null); setFailure(null);
    const found: string[] = [];
    if (!target) found.push(kind === 'WAREHOUSE' ? 'Choose the warehouse that needs the paddy.' : 'Choose the mill that needs the paddy.');
    if (linesOf(bags).length === 0) found.push('Put the bags you need on Size 4 or Size 5.');
    if (!neededBy) found.push('Choose the day you need it.');
    setProblems(found);
    if (found.length > 0) return;
    setBusy(true);
    try {
      const view = await supplyApi.create(accessToken, {
        ...(kind === 'WAREHOUSE' ? { warehouseId: target } : { millingCenterId: target }),
        lines: linesOf(bags).map((l) => ({ paddyGradeId: l.paddyGradeId, bagCount: l.bags })), neededBy, notes: notes.trim() || undefined,
      });
      setSent(view); setBags({}); setNotes('');
      onSent();
    } catch (err) {
      setFailure(err instanceof ApiError ? err.message : 'The request could not be sent. Check your connection and try again.');
    } finally { setBusy(false); }
  };

  const chosen = targets.find((t) => t.id === target);
  return (
    <div className="space-y-3" data-testid="supply-form">
      {sent && (
        <div role="status" data-testid="supply-sent" className="rounded-2xl border-2 border-paddy-700 bg-paddy-50 p-4">
          <p className="flex items-center gap-2 font-display text-lg text-paddy-900"><CheckCircle2 className="h-5 w-5 text-paddy-700" aria-hidden="true" /> Request sent</p>
          <p className="mt-1 text-sm text-ink-700"><span className="font-mono text-xs" data-testid="supply-sent-number">{sent.requestNumber}</span> &middot; {sent.label}</p>
        </div>
      )}
      {failure && (
        <div role="alert" data-testid="supply-failed" className="rounded-2xl border-2 border-red-300 bg-red-50 p-4">
          <p className="flex items-center gap-2 font-display text-lg text-red-800"><TriangleAlert className="h-5 w-5" aria-hidden="true" /> Not sent</p>
          <p className="mt-1 text-sm text-ink-900" data-testid="supply-failed-reason">{failure}</p>
        </div>
      )}
      <div className="rounded-2xl border border-husk-300 bg-husk-100/30 p-4">
        <h3 className="font-display text-lg text-paddy-900">Ask for paddy</h3>
        {allowWarehouse && allowMill && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {([['WAREHOUSE', 'A warehouse needs paddy'], ['MILL', 'The mill needs paddy']] as const).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={kind === k} data-testid={`kind-${k.toLowerCase()}`} onClick={() => setKind(k)} className={`rounded-2xl border-2 px-3 py-3 text-sm font-medium ${kind === k ? 'border-paddy-900 bg-paddy-900 text-rice-50' : 'border-paddy-100 bg-white text-ink-700'}`}>{label}</button>
            ))}
          </div>
        )}
        <div className="mt-3">
          <label htmlFor="supply-target" className="mb-1 block text-xs font-medium text-ink-700">{kind === 'WAREHOUSE' ? 'Which warehouse' : 'Which mill'}</label>
          {targets.length === 1 ? <p className="text-base font-medium text-ink-900" data-testid="supply-target-fixed">{chosen?.label}</p> : (
            <select id="supply-target" value={target} onChange={(e) => setTarget(e.target.value)} className="w-full rounded-xl border border-paddy-100 bg-white px-3 py-3 text-base">
              <option value="">Choose...</option>
              {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          )}
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-soil-500">How many bags</p>
        <div className="mt-1"><SizeBags grades={grades} value={bags} onChange={setBags} /></div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-soil-500">When do you need it</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {WHEN.map(([label, n]) => <button key={label} type="button" aria-pressed={neededBy === dayFrom(n)} onClick={() => setNeededBy(dayFrom(n))} className={`rounded-full border-2 px-4 py-2 text-sm font-medium ${neededBy === dayFrom(n) ? 'border-paddy-900 bg-paddy-900 text-rice-50' : 'border-paddy-100 bg-white text-ink-700'}`}>{label}</button>)}
        </div>
        <input aria-label="Day needed" type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} className="mt-2 w-full rounded-xl border border-paddy-100 bg-white px-3 py-2 text-sm" />
        {neededBy && <p className="mt-1 text-xs text-ink-500">Needed by {longDate(neededBy)}</p>}
        <input aria-label="Anything to add" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="Anything to add? (not needed)" className="mt-3 w-full rounded-xl border border-paddy-100 bg-white px-3 py-2 text-sm" />
        {problems.length > 0 && (
          <div role="alert" data-testid="supply-problems" className="mt-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <ul className="list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        <div className="mt-4 flex items-center gap-4">
          <button type="button" data-testid="supply-send" onClick={send} disabled={busy} className="rounded-full bg-paddy-900 px-8 py-3 text-base font-medium text-rice-50 disabled:opacity-50">{busy ? 'Sending...' : 'Send request'}</button>
          {onClose && <button type="button" onClick={onClose} className="text-sm text-ink-500">Close</button>}
        </div>
      </div>
    </div>
  );
}
