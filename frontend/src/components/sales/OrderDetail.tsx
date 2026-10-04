'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Truck } from 'lucide-react';
import { ApiError, SalesOrder, salesOrdersApi } from '@/lib/api-client';
import { ChainProgress } from '@/components/sales/ChainProgress';
import { TrackerBar } from '@/components/sales/TrackerBar';
import { AssignWarehouse, FinanceDecision, ReleaseForDelivery, WarehouseSteps } from '@/components/sales/Decisions';
import { ReceiptsPanel } from '@/components/sales/ReceiptsPanel';
import { OrderTimeline } from '@/components/sales/Timeline';
import { ageLabel, isSlow, needsMyAction, waitingOn, waitingSince } from '@/lib/sales-flow';

const fmtGHS = (n: number) => `GHS ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const when = (iso: string) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const CANCELLABLE = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RELEASED', 'RESERVED'];
const CLOSED = ['FULFILLED', 'REJECTED', 'CANCELLED'];
const SECTION = 'mt-5 border-t border-paddy-100 pt-4';
const messageOf = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/**
 * One order, in the order a decision-maker needs it: who and what it is, where it is and who has it, the items, the payment
 * receipts, THEN the decision for whoever's turn it is, and the full activity trail. The details always come before the
 * decision, so nobody approves or rejects blind.
 */
export function OrderDetail({ summary, accessToken, meId, hasPermission, showFinancials, onChanged }: {
  summary: SalesOrder;
  accessToken: string;
  meId: string;
  hasPermission: (permission: string) => boolean;
  showFinancials: boolean;
  onChanged: () => void;
}) {
  const [full, setFull] = useState<SalesOrder | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(() => {
    salesOrdersApi.findById(accessToken, summary.id).then((o) => { setFull(o); setLoadError(null); }).catch((e) => setLoadError(messageOf(e, 'Could not load this order.')));
  }, [accessToken, summary.id]);
  useEffect(() => { setFull(null); load(); }, [load]);
  const changed = () => { onChanged(); load(); };

  const o: SalesOrder = full ?? summary;
  const isOwner = o.salesOfficer.id === meId || o.submittedById === meId;
  const holder = waitingOn(o.status);
  const since = waitingSince(o);
  const last = (type: string) => [...(o.events ?? [])].reverse().find((e) => e.type === type);
  const rejection = last('REJECTED');
  const cancellation = last('CANCELLED');
  const onTrack = last('ON_TRACK');
  const waitingMe = needsMyAction(o, hasPermission, meId);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try { await fn(); setCancelling(false); changed(); } catch (e) { setActionError(messageOf(e, 'That did not go through. Please try again.')); } finally { setBusy(false); }
  };

  const canCancel = CANCELLABLE.includes(o.status) && ((isOwner && hasPermission('sales.create')) || hasPermission('sales.release'));
  const receiptCount = o.receipts?.length ?? o._count?.receipts ?? 0;

  return (
    <div className="rounded-2xl border border-paddy-100 bg-white p-5" data-testid="order-detail">
      <p className="font-mono text-xs text-ink-500">{o.orderNumber}</p>
      <h3 className="mt-1 font-display text-lg text-paddy-900">{o.customer.name}</h3>
      <p className="text-sm text-ink-500">Sold by {o.salesOfficer.firstName} {o.salesOfficer.lastName}</p>
      {(o.deliveryLocation || o.requestedDeliveryDate) && (
        <div className="mt-2 space-y-0.5 text-xs text-ink-500">
          {o.deliveryLocation && <p>Delivery to {o.deliveryLocation}</p>}
          {o.requestedDeliveryDate && <p>Requested for {new Date(o.requestedDeliveryDate).toLocaleDateString()}</p>}
        </div>
      )}

      <TrackerBar order={o} />

      {/* Where it is, and who has it: the accountability line. */}
      {o.status === 'FULFILLED' && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-paddy-100 px-3 py-2 text-sm font-medium text-paddy-900" data-testid="banner-delivered">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Delivered{o.fulfilledAt ? ` on ${new Date(o.fulfilledAt).toLocaleDateString()}` : ''}. Sale complete.
        </p>
      )}
      {o.status === 'REJECTED' && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="banner-rejected">
          <span className="font-medium">Rejected{rejection ? ` by ${rejection.actorName}${rejection.actorRole ? `, ${rejection.actorRole}` : ''}` : ''}.</span> Reason: {o.rejectionReason ?? rejection?.comment ?? 'not recorded'}
        </p>
      )}
      {o.status === 'CANCELLED' && (
        <p className="mt-3 rounded-lg bg-ink-500/10 px-3 py-2 text-sm text-ink-700">Cancelled{cancellation ? ` by ${cancellation.actorName}` : ''}.{cancellation?.comment ? ` Reason: ${cancellation.comment}` : ''}</p>
      )}
      {holder && o.status !== 'DRAFT' && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${isSlow(o) ? 'border border-amber-400 bg-amber-50 text-amber-900' : waitingMe ? 'bg-husk-300 text-soil-700' : 'bg-husk-100/50 text-soil-700'}`} data-testid="holder-banner">
          With the <strong>{holder}</strong>{since ? <>, for {ageLabel(since)}</> : null}.{isSlow(o) ? ' This has been waiting a while.' : ''}{waitingMe ? ' It is your turn.' : ''}
        </p>
      )}
      {onTrack && o.status === 'ON_TRACK' && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-paddy-100 bg-rice-50 px-3 py-2 text-xs text-ink-700" data-testid="tracking-card">
          <Truck className="mt-0.5 h-4 w-4 shrink-0 text-paddy-700" aria-hidden="true" />
          <span>
            On its way{typeof onTrack.meta?.driverName === 'string' ? ` with ${onTrack.meta.driverName}` : ''}{typeof onTrack.meta?.vehicleNumber === 'string' ? `, vehicle ${onTrack.meta.vehicleNumber}` : ''}.
            {typeof onTrack.meta?.expectedDeliveryAt === 'string' ? ` Expected ${when(onTrack.meta.expectedDeliveryAt)}.` : ''} Left {when(onTrack.createdAt)}.
          </span>
        </p>
      )}

      <div className="mt-4 rounded-xl border border-paddy-100 bg-rice-50/50 p-4">
        <ChainProgress order={o} />
        {o.allocatedWarehouse && <p className="mt-3 text-xs text-ink-500">Delivering from {o.allocatedWarehouse.name}</p>}
      </div>

      <div className={SECTION}>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">What was ordered</p>
        <div className="space-y-1">
          {o.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-ink-700">{item.product.name} - {item.packagingSize.label} x {item.bagCount}</span>
              {showFinancials && <span className="text-ink-900">{fmtGHS(item.lineTotal)}</span>}
            </div>
          ))}
          {showFinancials && (
            <div className="flex justify-between border-t border-paddy-100 pt-2 text-sm font-medium"><span>Total</span><span>{fmtGHS(o.totalAmount)}</span></div>
          )}
        </div>
        {o.notes && <p className="mt-2 text-xs text-ink-500">Note: {o.notes}</p>}
      </div>

      <div className={SECTION}>
        {full ? (
          <ReceiptsPanel order={full} accessToken={accessToken} canUpload={isOwner && hasPermission('sales.create') && !CLOSED.includes(o.status)} canRemove={isOwner && o.status === 'DRAFT'} onChanged={changed} />
        ) : loadError ? (
          <p role="alert" className="text-xs text-red-600">{loadError}</p>
        ) : (
          <p className="text-xs text-ink-500">Loading the receipts...</p>
        )}
      </div>

      {/* The decision for whoever's turn it is: after the details above, never before. */}
      <div className="mt-5 space-y-3">
        {o.status === 'DRAFT' && isOwner && hasPermission('sales.create') && (
          <div className="space-y-2">
            {full && receiptCount === 0 && <p className="text-xs text-soil-700">No payment receipt is attached. You can still send it, but Finance will see that none was added.</p>}
            <button type="button" disabled={busy} data-testid="submit-order" onClick={() => act(() => salesOrdersApi.submit(accessToken, o.id))} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
              {busy ? 'Sending...' : 'Send to the Finance Director'}
            </button>
          </div>
        )}
        {o.status === 'SUBMITTED' && hasPermission('sales.approve') && o.submittedById !== meId && <FinanceDecision key={o.id} order={o} accessToken={accessToken} onDone={changed} />}
        {o.status === 'APPROVED' && hasPermission('sales.release') && <ReleaseForDelivery key={o.id} order={o} accessToken={accessToken} onDone={changed} />}
        {o.status === 'RELEASED' && hasPermission('sales.assign') && <AssignWarehouse key={o.id} order={o} accessToken={accessToken} onDone={changed} />}
        {['RESERVED', 'PROCESSING', 'ON_TRACK'].includes(o.status) && hasPermission('sales.fulfill') && <WarehouseSteps key={`${o.id}-${o.status}`} order={full ?? o} accessToken={accessToken} onDone={changed} />}
        {o.status === 'RESERVED' && hasPermission('sales.assign') && (
          <details className="rounded-xl border border-paddy-100 p-3 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-paddy-700">Move it to a different warehouse</summary>
            <div className="mt-3"><AssignWarehouse key={`${o.id}-re`} order={o} accessToken={accessToken} onDone={changed} reassign /></div>
          </details>
        )}

        {canCancel && (
          cancelling ? (
            <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/40 p-3 text-xs">
              <p className="text-ink-700">Cancel this order? {o.status === 'RESERVED' ? 'The stock held for it is freed and the warehouse task closed. ' : 'Whoever holds it is told. '}</p>
              <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={300} placeholder="Why? (optional, shown in the trail)" aria-label="Why the order is cancelled" className="w-full rounded-lg border border-paddy-100 bg-white px-3 py-2 text-sm" />
              <div className="flex gap-3">
                <button type="button" disabled={busy} onClick={() => act(() => salesOrdersApi.cancel(accessToken, o.id, cancelReason.trim() || undefined))} className="rounded-full border border-red-300 px-3 py-1 font-medium text-red-700 disabled:opacity-50">Yes, cancel it</button>
                <button type="button" onClick={() => setCancelling(false)} className="text-ink-500">Keep it</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setCancelling(true)} className="text-xs font-medium text-red-700 underline">Cancel this order</button>
          )
        )}
        {actionError && <p role="alert" className="text-xs text-red-600">{actionError}</p>}
      </div>

      <div className={SECTION}>
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-soil-500">Who has handled this order</p>
        <OrderTimeline events={full?.events} />
      </div>
    </div>
  );
}
