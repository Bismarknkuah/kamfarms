'use client';

import { FlowOrder, chainSteps, salesStatusLabel } from '@/lib/sales-flow';

/** The order's whole journey at a glance, like a parcel tracker: one segment per hand-off, and a plain sentence saying where it is. */
export function TrackerBar({ order }: { order: FlowOrder }) {
  const steps = chainSteps(order);
  const current = steps.findIndex((s) => s.state === 'current');
  const stopped = steps.find((s) => s.state === 'stopped');
  const done = steps.filter((s) => s.state === 'done').length;
  const pct = Math.round((done / steps.length) * 100);
  const label =
    order.status === 'FULFILLED' ? 'Delivered: sale complete'
    : stopped ? `Stopped: ${stopped.title}`
    : current >= 0 ? `${done} of ${steps.length} steps done: ${salesStatusLabel(order.status)}`
    : '';
  return (
    <div data-testid="tracker-bar" className="mt-3">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-paddy-900" data-testid="tracker-label">{label}</span>
        <span className="text-ink-500">{pct}% of the way</span>
      </div>
      <div className="mt-1.5 flex gap-1" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="How far this order has come">
        {steps.map((s) => (
          <span
            key={s.id}
            title={`${s.title}: ${s.actor}`}
            className={`h-2 flex-1 rounded-full ${s.state === 'done' ? 'bg-paddy-700' : s.state === 'current' ? 'animate-pulse bg-husk-500' : s.state === 'stopped' ? 'bg-red-500' : 'bg-ink-500/15'}`}
          />
        ))}
      </div>
    </div>
  );
}
