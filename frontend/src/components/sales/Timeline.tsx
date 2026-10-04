'use client';

import { Ban, Check, FileText, PackageCheck, Plus, Send, Trash2, Truck, Warehouse, X, type LucideIcon } from 'lucide-react';
import type { SalesOrderEvent } from '@/lib/api-client';

const when = (iso: string) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

function describe(e: SalesOrderEvent): { title: string; Icon: LucideIcon; tone: string } {
  const place = str(e.meta?.warehouseName) ?? 'a warehouse';
  switch (e.type) {
    case 'CREATED': return { title: 'Order created', Icon: Plus, tone: 'bg-ink-500/15 text-ink-700' };
    case 'SUBMITTED': return { title: 'Sent to the Finance Director', Icon: Send, tone: 'bg-husk-300 text-soil-700' };
    case 'APPROVED': return { title: 'Approved by Finance', Icon: Check, tone: 'bg-paddy-700 text-rice-50' };
    case 'REJECTED': return { title: e.meta?.stage === 'MD' ? 'Rejected by the Managing Director' : 'Rejected by Finance', Icon: X, tone: 'bg-red-600 text-white' };
    case 'RELEASED': return { title: 'Released by the Managing Director', Icon: Check, tone: 'bg-paddy-700 text-rice-50' };
    case 'ASSIGNED': return { title: `Assigned to ${place}`, Icon: Warehouse, tone: 'bg-paddy-700 text-rice-50' };
    case 'REASSIGNED': return { title: `Moved to ${place}`, Icon: Warehouse, tone: 'bg-husk-500 text-white' };
    case 'PROCESSING': return { title: 'Processing started', Icon: PackageCheck, tone: 'bg-paddy-700 text-rice-50' };
    case 'ON_TRACK': return { title: 'On track: it has left the warehouse', Icon: Truck, tone: 'bg-paddy-700 text-rice-50' };
    case 'DELIVERED': return { title: 'Delivered', Icon: Check, tone: 'bg-paddy-900 text-rice-50' };
    case 'CANCELLED': return { title: 'Cancelled', Icon: Ban, tone: 'bg-ink-500 text-white' };
    case 'RECEIPT_ADDED': return { title: 'Receipt added', Icon: FileText, tone: 'bg-ink-500/15 text-ink-700' };
    case 'RECEIPT_REMOVED': return { title: 'Receipt removed', Icon: Trash2, tone: 'bg-ink-500/15 text-ink-700' };
    default: return { title: e.type.replace(/_/g, ' ').toLowerCase(), Icon: Check, tone: 'bg-ink-500/15 text-ink-700' };
  }
}

/**
 * The order's activity trail: every step, who did it and in what role, when, and what they said. This is what makes
 * the sale transparent: anyone who may see the order can see exactly who has handled it.
 */
export function OrderTimeline({ events }: { events: SalesOrderEvent[] | undefined }) {
  if (!events) return <p className="text-xs text-ink-500">Loading the activity trail...</p>;
  if (events.length === 0) return <p className="text-xs text-ink-500">Nothing has happened on this order yet.</p>;
  return (
    <ol className="space-y-3" aria-label="Activity trail">
      {events.map((e, i) => {
        const { title, Icon, tone } = describe(e);
        const tracking = e.type === 'ON_TRACK' ? [str(e.meta?.driverName) && `Driver: ${e.meta?.driverName}`, str(e.meta?.vehicleNumber) && `Vehicle: ${e.meta?.vehicleNumber}`, str(e.meta?.expectedDeliveryAt) && `Expected: ${when(String(e.meta?.expectedDeliveryAt))}`].filter(Boolean) : [];
        return (
          <li key={e.id} className="relative flex gap-3" data-testid="timeline-event">
            {i < events.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-4px)] w-px bg-ink-500/20" aria-hidden="true" />}
            <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 pb-1">
              <p className="text-sm font-medium text-ink-900">{title}</p>
              <p className="text-xs text-ink-500">
                {e.actorName}{e.actorRole ? `, ${e.actorRole}` : ''} <span aria-hidden="true">&middot;</span> {when(e.createdAt)}
              </p>
              {tracking.length > 0 && <p className="mt-0.5 text-xs text-ink-700">{tracking.join(' / ')}</p>}
              {e.comment && (
                <p className={`mt-1 rounded-lg px-3 py-1.5 text-xs ${e.type === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-rice-50 text-ink-700'}`}>
                  &ldquo;{e.comment}&rdquo;
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
