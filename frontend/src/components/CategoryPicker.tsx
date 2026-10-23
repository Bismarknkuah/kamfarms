'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { ExpenseCategory } from '@/lib/api-client';

/**
 * Pick an expense category from a list that pops up. If the right name is not there, type the exact name under "Other":
 * it is saved on the expense as the custom name (the 'Other' category stays the bucket for reports).
 */
export function CategoryPicker({ categories, value, onSelect }: {
  categories: ExpenseCategory[];
  value: string;
  onSelect: (categoryId: string, customLabel?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const other = categories.find((c) => c.name === 'Other');
  const chosen = categories.find((c) => c.id === value);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const pick = (id: string) => { onSelect(id); setOpen(false); };
  const useCustom = () => {
    const name = custom.trim();
    if (name.length < 2 || !other) return;
    onSelect(other.id, name);
    setCustom('');
    setOpen(false);
  };

  return (
    <>
      <button type="button" data-testid="category-trigger" onClick={() => setOpen(true)}
        className="flex items-center justify-between gap-2 rounded-lg border border-paddy-100 bg-white px-3 py-2 text-left text-sm">
        <span className={chosen ? 'text-ink-900' : 'text-ink-500'}>{chosen ? chosen.name : 'Choose a category…'}</span>
        <ChevronDown className="h-4 w-4 text-ink-500" aria-hidden />
      </button>
      {open && (
        <div data-testid="category-modal" role="dialog" aria-modal="true" aria-label="Choose a category"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg text-ink-900">What was it for?</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-2 hover:bg-rice-50"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
              {categories.filter((c) => c.name !== 'Other').map((c) => (
                <button key={c.id} type="button" data-testid="category-option" data-name={c.name} onClick={() => pick(c.id)}
                  className={`rounded-xl border px-3 py-3 text-left text-sm ${c.id === value ? 'border-paddy-900 bg-paddy-50' : 'border-paddy-100 hover:bg-rice-50'}`}>
                  {c.name}
                </button>
              ))}
            </div>
            {other && (
              <div data-testid="category-custom" className="mt-3 rounded-xl border border-dashed border-paddy-200 p-3">
                <label className="text-xs font-medium text-ink-700" htmlFor="category-custom-input">Not in the list? Type the exact name</label>
                <div className="mt-1 flex gap-2">
                  <input id="category-custom-input" data-testid="category-custom-input" value={custom} onChange={(e) => setCustom(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); useCustom(); } }}
                    placeholder="e.g. Tarpaulin hire" className="min-w-0 flex-1 rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                  <button type="button" data-testid="category-custom-submit" onClick={useCustom} disabled={custom.trim().length < 2}
                    className="rounded-full bg-paddy-900 px-4 py-2 text-sm font-medium text-rice-50 disabled:opacity-50">Use this name</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
