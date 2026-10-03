'use client';

import { Check, X } from 'lucide-react';
import { FlowOrder, StepState, chainSteps, waitingOn } from '@/lib/sales-flow';

const DOT: Record<StepState, string> = {
  done: 'bg-paddy-700 text-rice-50',
  current: 'bg-husk-500 text-white ring-4 ring-husk-100',
  upcoming: 'border border-ink-500/30 bg-white text-ink-500',
  stopped: 'bg-red-600 text-white',
};

const when = (iso: string) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The four hand-offs of a sale, top to bottom: who has done their part,
 * who the order is waiting on now, and who is still to come. */
export function ChainProgress({ order }: { order: FlowOrder }) {
  const steps = chainSteps(order);
  const holder = waitingOn(order.status);

  return (
    <div>
      <ol>
        {steps.map((step, i) => {
          const detail =
            step.state === 'done'
              ? `${step.by ?? step.actor}${step.at ? `, ${when(step.at)}` : ''}`
              : step.state === 'current'
                ? `Waiting on the ${step.actor}`
                : step.state === 'stopped'
                  ? 'The order stopped here'
                  : step.actor;
          return (
            <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
              {i < steps.length - 1 && (
                <span className={`absolute left-[11px] top-6 h-full w-px ${step.state === 'done' ? 'bg-paddy-700' : 'bg-ink-500/20'}`} aria-hidden="true" />
              )}
              <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${DOT[step.state]}`}>
                {step.state === 'done' ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : step.state === 'stopped' ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className={`text-sm font-medium ${step.state === 'upcoming' ? 'text-ink-500' : 'text-ink-900'}`}>{step.title}</p>
                <p className="text-xs text-ink-500">{detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {holder && order.status !== 'DRAFT' && (
        <p className="mt-3 rounded-lg bg-husk-100/50 px-3 py-2 text-xs text-soil-700">
          Waiting on the <strong>{holder}</strong>
        </p>
      )}
    </div>
  );
}
