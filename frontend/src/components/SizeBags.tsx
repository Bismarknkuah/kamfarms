'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';

export interface SizeGrade { id: string; label: string; isActive?: boolean }
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Size 4 and Size 5: the two sizes this business deals in. If a system has not got both, the first two sizes stand in. */
export function primarySizes<T extends SizeGrade>(grades: T[]): T[] {
  const active = grades.filter((g) => g.isActive !== false);
  const picked = [active.find((g) => norm(g.label) === 'size4'), active.find((g) => norm(g.label) === 'size5')].filter(Boolean) as T[];
  return picked.length === 2 ? picked : active.slice(0, 2);
}

/**
 * Wherever bags of paddy are counted, BOTH sizes are already there with a big minus, a number and a plus: nobody has to choose a size from a
 * list or add a line. Leave a size at 0 and it is simply not on the list. Any other size is one tap away ("Another size").
 * Value: bags by size (grade id -> bags).
 */
export function SizeBags({ grades, value, onChange, hints, locked, idPrefix = 'Bags' }: {
  grades: SizeGrade[];
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  /** Something to show beside a size, e.g. "asked for 17". */
  hints?: Record<string, React.ReactNode>;
  /** A size that cannot be changed here, with the reason (e.g. already sent). */
  locked?: Record<string, string>;
  idPrefix?: string;
}) {
  const primary = primarySizes(grades);
  const others = grades.filter((g) => g.isActive !== false && !primary.some((p) => p.id === g.id));
  const [extra, setExtra] = useState<string[]>([]);
  const shown = [...primary, ...others.filter((g) => extra.includes(g.id) || (value[g.id] ?? 0) > 0)];
  const set = (id: string, n: number) => onChange({ ...value, [id]: Math.max(0, Math.min(99999, Math.floor(n) || 0)) });
  const total = Object.values(value).reduce((t, n) => t + (n || 0), 0);
  return (
    <div className="space-y-2" role="group" aria-label="Bags by size" data-testid="size-bags">
      {shown.map((g) => {
        const n = value[g.id] ?? 0;
        const lock = locked?.[g.id];
        return (
          <div key={g.id} data-testid="size-row" data-size={g.label} className={`flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2.5 ${lock ? 'border-ink-500/20 bg-ink-500/5' : 'border-paddy-100 bg-white'}`}>
            <p className="w-[4.5rem] shrink-0 font-display text-xl text-paddy-900">{g.label}</p>
            <button type="button" disabled={!!lock || n <= 0} aria-label={`One less bag of ${g.label}`} onClick={() => set(g.id, n - 1)} className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-paddy-700 text-paddy-700 disabled:opacity-30"><Minus className="h-5 w-5" aria-hidden="true" /></button>
            <input aria-label={`${idPrefix} of ${g.label}`} inputMode="numeric" disabled={!!lock} value={n === 0 ? '' : String(n)} placeholder="0" onChange={(e) => set(g.id, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0)} className="h-12 w-[4.5rem] min-w-0 shrink rounded-xl border border-paddy-100 bg-white text-center text-xl font-semibold text-paddy-900" />
            <button type="button" disabled={!!lock} aria-label={`One more bag of ${g.label}`} onClick={() => set(g.id, n + 1)} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-paddy-900 text-rice-50 disabled:opacity-30"><Plus className="h-5 w-5" aria-hidden="true" /></button>
            <span className="min-w-0 flex-1 text-xs text-ink-500">{lock ?? hints?.[g.id]}</span>
          </div>
        );
      })}
      {others.length > shown.length - primary.length && (
        <select aria-label="Another size" value="" onChange={(e) => { if (e.target.value) setExtra((x) => [...x, e.target.value]); }} className="w-full rounded-xl border border-paddy-100 bg-white px-3 py-2 text-sm text-ink-700">
          <option value="">+ Another size</option>
          {others.filter((g) => !shown.some((s) => s.id === g.id)).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      )}
      <p className="text-sm font-medium text-paddy-900" data-testid="size-total">{total > 0 ? `Total: ${total} bag${total === 1 ? '' : 's'}` : 'No bags yet'}</p>
    </div>
  );
}

/** The sizes with bags on them, as the lines a request wants. */
export const linesOf = (value: Record<string, number>) => Object.entries(value).filter(([, n]) => n > 0).map(([paddyGradeId, bags]) => ({ paddyGradeId, bags }));
