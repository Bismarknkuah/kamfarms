'use client';

import { type ReactNode, useId } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

/** Small form pieces shared by every section of the Homepage editor. */

export const inputClass =
  'w-full rounded-lg border border-paddy-100 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20';
export const smallButton =
  'inline-flex items-center gap-1.5 rounded-full border border-paddy-100 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:bg-rice-50 disabled:opacity-40';

/** Moves one entry up (-1) or down (+1), returning a new list. */
export function move<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

export function Panel({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-2xl border border-paddy-100 bg-white p-5 sm:p-6" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="font-display text-xl font-medium text-paddy-900">{title}</h2>
      {hint && <p className="mt-1 text-sm text-ink-500">{hint}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

export function TextField({ label, value, onChange, max, placeholder, help, rows }: { label: string; value: string; onChange: (v: string) => void; max: number; placeholder?: string; help?: string; rows?: number }) {
  const id = useId();
  const nearLimit = value.length > max * 0.85;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink-700">{label}</label>
        {nearLimit && <span className={`text-xs ${value.length > max ? 'text-red-600' : 'text-ink-500'}`}>{value.length}/{max}</span>}
      </div>
      {rows ? (
        <textarea id={id} value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${inputClass} mt-1 resize-y`} />
      ) : (
        <input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${inputClass} mt-1`} />
      )}
      {help && <p className="mt-1 text-xs text-ink-500">{help}</p>}
    </div>
  );
}

export function RowButtons({ onUp, onDown, onRemove, first, last, what }: { onUp: () => void; onDown: () => void; onRemove: () => void; first: boolean; last: boolean; what: string }) {
  const b = 'grid h-8 w-8 place-items-center rounded-full border border-paddy-100 bg-white text-ink-700 transition hover:bg-rice-50 disabled:opacity-30';
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={onUp} disabled={first} aria-label={`Move ${what} up`} className={b}><ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /></button>
      <button type="button" onClick={onDown} disabled={last} aria-label={`Move ${what} down`} className={b}><ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /></button>
      <button type="button" onClick={onRemove} aria-label={`Remove ${what}`} className={`${b} text-red-700 hover:bg-red-50`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
    </div>
  );
}

export function AddButton({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-paddy-300 px-4 py-2 text-sm font-medium text-paddy-900 transition hover:bg-rice-50 disabled:opacity-40">
      <Plus className="h-4 w-4" aria-hidden="true" /> {children}
    </button>
  );
}

/** A list of single lines of text (bullet points, bag sizes and so on). */
export function StringList({ label, items, onChange, max, maxLen, addLabel, placeholder }: { label: string; items: string[]; onChange: (items: string[]) => void; max: number; maxLen: number; addLabel: string; placeholder?: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-ink-700">{label}</p>
      <ul className="mt-2 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              aria-label={`${label} ${i + 1}`}
              value={item}
              maxLength={maxLen}
              placeholder={placeholder}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              className={inputClass}
            />
            <RowButtons what={`${label} ${i + 1}`} first={i === 0} last={i === items.length - 1} onUp={() => onChange(move(items, i, -1))} onDown={() => onChange(move(items, i, 1))} onRemove={() => onChange(items.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ul>
      {items.length < max && <div className="mt-2"><AddButton onClick={() => onChange([...items, ''])}>{addLabel}</AddButton></div>}
    </div>
  );
}
