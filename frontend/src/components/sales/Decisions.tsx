'use client';

import { useEffect, useState } from 'react';
import { ApiError, SalesOrder, SalesOrderAvailability, salesOrdersApi } from '@/lib/api-client';
import { DecisionPanel } from '@/components/review/DecisionPanel';

/** Where the rice could come from. Fetched once per order. */
function useAvailability(accessToken: string, orderId: string) {
  const [data, setData] = useState<SalesOrderAvailability | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setData(null);
    setFailed(false);
    salesOrdersApi.availability(accessToken, orderId).then((d) => live && setData(d)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [accessToken, orderId]);
  return { data, failed };
}

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'That did not go through. Please try again.');
const BOX = 'space-y-3 rounded-xl border border-husk-300 bg-husk-100/30 p-4';
const HEADING = 'text-xs font-medium uppercase tracking-wide text-soil-500';
const INPUT = 'w-full rounded-lg border border-paddy-100 bg-white px-3 py-2 text-sm';

/** The Finance Director's decision on a submitted order: a financial call. Approving sends it to the Managing Director; rejecting
 * needs a comment, which the Sales Officer reads. The stock line is advice only: the Warehouse Supervisor chooses where it ships from. */
export function FinanceDecision({ order, accessToken, onDone }: { order: SalesOrder; accessToken: string; onDone: () => void }) {
  const { data: stock } = useAvailability(accessToken, order.id);
  const covering = stock?.warehouses.filter((w) => w.canFulfillAll) ?? [];
  return (
    <div className={BOX}>
      <p className={HEADING}>Your decision</p>
      {stock && (
        <p className={`text-xs ${covering.length > 0 ? 'text-paddy-700' : 'text-soil-700'}`}>
          {covering.length > 0
            ? `Stock check: can be delivered in full from ${covering.map((w) => w.warehouseName).join(' or ')}.`
            : 'Stock check: no single warehouse can cover this whole order today. You can still approve it on financial grounds; the Warehouse Supervisor chooses where it ships from.'}
        </p>
      )}
      <DecisionPanel
        approveLabel="Approve and send to the MD"
        approveNotePlaceholder="Optional note for the Managing Director, e.g. 50% deposit received"
        rejectPrompt="Why is it being sent back? The Sales Officer will read this."
        onApprove={(note) => salesOrdersApi.approve(accessToken, order.id, note)}
        onReject={(comment) => salesOrdersApi.reject(accessToken, order.id, comment)}
        onDone={onDone}
      />
    </div>
  );
}

/** The Managing Director's / CEO's decision: release the approved order, or reject it with a comment. Releasing does not pick a
 * warehouse; the Warehouse Supervisor does that next. */
export function ReleaseForDelivery({ order, accessToken, onDone }: { order: SalesOrder; accessToken: string; onDone: () => void }) {
  return (
    <div className={BOX}>
      <p className={HEADING}>Your decision</p>
      <p className="text-xs text-ink-500">Finance has approved this order. Release it and the Warehouse Supervisor chooses the warehouse that sends it. Or reject it with a comment.</p>
      <DecisionPanel
        approveLabel="Release to the Warehouse Supervisor"
        approveNotePlaceholder="Optional instruction for the Warehouse Supervisor"
        rejectPrompt="Why are you not releasing it? The Sales Officer and the Finance Director will read this."
        onApprove={(note) => salesOrdersApi.release(accessToken, order.id, { note })}
        onReject={(comment) => salesOrdersApi.reject(accessToken, order.id, comment)}
        onDone={onDone}
      />
    </div>
  );
}

/** The Warehouse Supervisor's step: which warehouse prepares and sends this order. Warehouses that cannot cover it can be seen but not
 * chosen, with the reason. Before the warehouse starts, the order can still be moved to another one. */
export function AssignWarehouse({ order, accessToken, onDone, reassign = false }: { order: SalesOrder; accessToken: string; onDone: () => void; reassign?: boolean }) {
  const { data: stock, failed } = useAvailability(accessToken, order.id);
  const [chosen, setChosen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = order.allocatedWarehouse?.id ?? null;

  useEffect(() => {
    if (!stock || chosen || reassign) return;
    const pick = stock.warehouses.find((w) => w.warehouseId === stock.preferredWarehouseId && w.canFulfillAll) ?? stock.warehouses.find((w) => w.canFulfillAll);
    if (pick) setChosen(pick.warehouseId);
  }, [stock, chosen, reassign]);

  const assign = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await salesOrdersApi.assignWarehouse(accessToken, order.id, { warehouseId: chosen, note: note.trim() || undefined });
      onDone();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const none = !!stock && stock.warehouses.every((w) => !w.canFulfillAll);
  return (
    <div className={BOX} data-testid="assign-warehouse">
      <p className={HEADING}>{reassign ? 'Move to a different warehouse' : 'Assign a warehouse'}</p>
      <p className="text-xs text-ink-500">
        {reassign ? 'The stock is held at the current warehouse. Moving it frees that stock and holds it at the new one.' : 'The Managing Director has released this order. Choose the warehouse that will prepare and send it; its stock is held for this order and that warehouse\'s team is told.'}
      </p>
      {!stock && !failed && <p className="text-xs text-ink-500">Checking stock...</p>}
      {failed && <p className="text-xs text-red-600">Could not check stock just now. Refresh and try again.</p>}
      {stock && (
        <fieldset className="space-y-1.5">
          <legend className="sr-only">Warehouse to send it from</legend>
          {stock.warehouses.map((w) => {
            const short = w.lines.filter((l) => !l.enough).map((l) => `${l.product} ${l.size}: needs ${l.requestedBags}, has ${l.availableBags}`);
            const isCurrent = w.warehouseId === current;
            const choosable = w.canFulfillAll && !isCurrent;
            return (
              <label key={w.warehouseId} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${choosable ? 'cursor-pointer border-paddy-100 bg-white' : 'border-ink-500/10 bg-ink-500/5'}`}>
                <input type="radio" name={`warehouse-${order.id}`} checked={chosen === w.warehouseId} disabled={!choosable} onChange={() => setChosen(w.warehouseId)} className="mt-1" />
                <span>
                  <span className="font-medium text-ink-900">{w.warehouseName}</span>
                  <span className={`ml-2 text-xs ${isCurrent ? 'text-ink-500' : w.canFulfillAll ? 'text-paddy-700' : 'text-red-700'}`}>
                    {isCurrent ? 'currently assigned' : w.canFulfillAll ? 'can cover the whole order' : 'cannot cover it'}
                  </span>
                  {short.length > 0 && <span className="block text-xs text-ink-500">{short.join('; ')}</span>}
                </span>
              </label>
            );
          })}
          {none && <p className="text-xs text-soil-700">No warehouse can cover this order right now. Arrange stock first, or ask the Managing Director how to proceed.</p>}
        </fieldset>
      )}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional instruction for that warehouse's team" aria-label="Optional instruction for the warehouse team" maxLength={300} className={INPUT} />
      <button type="button" disabled={busy || !chosen} onClick={assign} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
        {busy ? 'Assigning...' : reassign ? 'Move it to this warehouse' : 'Assign to this warehouse'}
      </button>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** What the assigned warehouse's team does, one step at a time: start processing, move it "on track" once it has left (with the
 * driver, vehicle and expected arrival the Sales Officer can pass to the customer), then confirm delivery. */
export function WarehouseSteps({ order, accessToken, onDone }: { order: SalesOrder; accessToken: string; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [driver, setDriver] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [eta, setEta] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(messageOf(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const where = order.allocatedWarehouse?.name ?? 'the warehouse';
  const noteField = (placeholder: string) => (
    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={300} className={INPUT} />
  );
  const tracking = [...(order.events ?? [])].reverse().find((e) => e.type === 'ON_TRACK');

  return (
    <div className={BOX} data-testid="warehouse-steps">
      {order.status === 'RESERVED' && (
        <>
          <p className={HEADING}>Step 1 of 3: processing</p>
          <p className="text-xs text-ink-500">This order is assigned to {where}. When the team begins picking and packing it, start processing.</p>
          {noteField('Optional note, e.g. who is picking it')}
          <button type="button" disabled={busy} onClick={() => run(() => salesOrdersApi.startProcessing(accessToken, order.id, note.trim() || undefined))} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
            {busy ? 'Starting...' : 'Start processing'}
          </button>
        </>
      )}
      {order.status === 'PROCESSING' && (
        <>
          <p className={HEADING}>Step 2 of 3: on track</p>
          <p className="text-xs text-ink-500">Once it has left {where}, move it on track. The driver and vehicle help the Sales Officer tell the customer what to expect.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="Driver's name" aria-label="Driver's name" maxLength={80} className={INPUT} />
            <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Vehicle number" aria-label="Vehicle number" maxLength={30} className={INPUT} />
          </div>
          <label className="block text-xs text-ink-500">
            Expected to arrive
            <input type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} className={`${INPUT} mt-1`} />
          </label>
          {noteField('Optional note')}
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => salesOrdersApi.dispatch(accessToken, order.id, { driverName: driver.trim() || undefined, vehicleNumber: vehicle.trim() || undefined, expectedDeliveryAt: eta ? new Date(eta).toISOString() : undefined, note: note.trim() || undefined }))}
            className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50"
          >
            {busy ? 'Updating...' : 'Mark on track: it has left'}
          </button>
        </>
      )}
      {order.status === 'ON_TRACK' && (
        <>
          <p className={HEADING}>Step 3 of 3: delivery</p>
          {tracking && (
            <p className="text-xs text-ink-700">
              On its way{typeof tracking.meta?.driverName === 'string' ? `, driver ${tracking.meta.driverName}` : ''}{typeof tracking.meta?.vehicleNumber === 'string' ? `, vehicle ${tracking.meta.vehicleNumber}` : ''}.
            </p>
          )}
          {noteField('Optional note, e.g. who received it')}
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-700">Has the customer received all of it? This takes the stock out of the warehouse.</span>
              <button type="button" disabled={busy} onClick={() => run(() => salesOrdersApi.fulfill(accessToken, order.id, note.trim() || undefined))} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
                {busy ? 'Saving...' : 'Yes, confirm delivery'}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="text-xs text-ink-500">Not yet</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50">Confirm delivered</button>
          )}
        </>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
