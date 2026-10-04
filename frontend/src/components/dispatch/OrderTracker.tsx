'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import type { DeliveryOrder } from '@/lib/api-client';
import { ageLabel } from '@/lib/sales-flow';

const TONE: Record<string, string> = {
  REQUESTED: 'bg-husk-300 text-soil-700', PREPARING: 'bg-husk-300 text-soil-700', IN_REVIEW: 'bg-amber-100 text-amber-900',
  ON_THE_WAY: 'bg-paddy-100 text-paddy-700', ARRIVED: 'bg-paddy-900 text-rice-50', CANCELLED: 'bg-ink-500/10 text-ink-500',
};
const when = (iso: string) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Where a dispatch is: one line with whose move it is and for how long, a bar of the five stages, and a timeline to open. */
export function OrderTracker({ order }: { order: DeliveryOrder }) {
  const [open, setOpen] = useState(false);
  const t = order.tracking;
  if (!t) return <span className="text-xs text-ink-500">{order.status}</span>;
  const done = t.steps.filter((s) => s.state === 'done').length;
  return (
    <div data-testid="order-tracker" className="min-w-[14rem]">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[t.stage] ?? 'bg-ink-500/10'}`} data-testid="tracker-stage">{t.label}</span>
      {t.holder && <p className="mt-1 text-xs text-ink-500" data-testid="tracker-holder">With: {t.holder}{t.since ? `, ${ageLabel(t.since)}` : ''}</p>}
      {t.sentBack && <p className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700" data-testid="tracker-sentback">Sent back: {t.sentBack}</p>}
      <div className="mt-1.5 flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={t.steps.length} aria-valuenow={done} aria-label="How far this dispatch has come">
        {t.steps.map((s) => <span key={s.id} title={s.label} className={`h-1.5 flex-1 rounded-full ${s.state === 'done' ? 'bg-paddy-700' : s.state === 'current' ? 'animate-pulse bg-husk-500' : 'bg-ink-500/15'}`} />)}
      </div>
      {t.stage === 'ARRIVED' && t.bagVariance !== null && (
        <p className={`mt-1 text-xs ${t.bagVariance === 0 ? 'text-paddy-700' : 'font-medium text-red-700'}`} data-testid="tracker-variance">
          {t.bagVariance === 0 ? 'Every bag arrived.' : `${Math.abs(t.bagVariance)} bag${Math.abs(t.bagVariance) === 1 ? '' : 's'} ${t.bagVariance < 0 ? 'short' : 'extra'} on arrival.`}{t.varianceRequiresApproval ? ' Needs approval.' : ''}
        </p>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-paddy-700">
        {open ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronRight className="h-3 w-3" aria-hidden="true" />} Track
      </button>
      {open && (
        <ol className="mt-2 space-y-2 border-l border-paddy-100 pl-3" data-testid="tracker-steps">
          {t.steps.map((s) => (
            <li key={s.id} className="text-xs">
              <p className={`flex items-center gap-1.5 font-medium ${s.state === 'upcoming' ? 'text-ink-500' : 'text-ink-900'}`}>
                {s.state === 'done' && <Check className="h-3 w-3 text-paddy-700" aria-hidden="true" />}
                {s.label}{s.state === 'current' && <span className="rounded-full bg-husk-300 px-1.5 text-[10px] text-soil-700">now</span>}
              </p>
              {(s.at || s.by) && <p className="text-ink-500">{s.by ? `${s.by}, ` : ''}{s.at ? when(s.at) : ''}</p>}
              {s.detail && <p className="text-ink-700">{s.detail}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
