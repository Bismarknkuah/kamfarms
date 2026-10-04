'use client';

import type { DeliveryOrder } from '@/lib/api-client';
import { longDate } from '@/lib/dates';

const day = (iso: string) => longDate(iso);
const PRIORITY: Record<string, string> = { LOW: 'bg-ink-500/10 text-ink-700', NORMAL: '', HIGH: 'bg-amber-100 text-amber-900', URGENT: 'bg-red-100 text-red-800' };

/**
 * What the farm manager must know to do the dispatch, in one place: WHERE the bags go (the warehouse and its location), what, how many, by
 * when, and the supervisor's instruction. Shown wherever an order is picked, so nobody has to ask "which warehouse?".
 */
export function OrderBrief({ order }: { order: DeliveryOrder }) {
  const w = order.destinationWarehouse;
  return (
    <div data-testid="order-brief" className="rounded-xl border border-paddy-100 bg-rice-50/60 px-4 py-3 text-sm">
      <p className="text-ink-900">
        <span className="text-ink-500">Send to</span> <strong data-testid="brief-warehouse">{w.name}</strong>
        {w.location ? <span className="text-ink-700" data-testid="brief-location"> ({w.location})</span> : null}
      </p>
      <p className="mt-0.5 text-ink-700">
        {order.paddyGrade.label}: <strong>{order.bagCount} bag{order.bagCount === 1 ? '' : 's'}</strong> from {order.farm.name}
        {order.requestedDate ? <> &middot; needed by <strong>{day(order.requestedDate)}</strong></> : null}
        {order.priority && order.priority !== 'NORMAL' && <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY[order.priority] ?? ''}`}>{order.priority.toLowerCase()} priority</span>}
      </p>
      {order.notes && <p className="mt-1 rounded-lg bg-white px-3 py-1.5 text-xs text-ink-700" data-testid="brief-notes"><span className="font-medium">Instructions{order.createdBy ? ` from ${order.createdBy.firstName} ${order.createdBy.lastName}` : ''}:</span> {order.notes}</p>}
    </div>
  );
}
