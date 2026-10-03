'use client';

import { useEffect, useState } from 'react';
import { ApiError, SalesOrder, SalesOrderAvailability, salesOrdersApi } from '@/lib/api-client';

/** Where the rice could come from. Fetched once per order. */
function useAvailability(accessToken: string, orderId: string) {
  const [data, setData] = useState<SalesOrderAvailability | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setData(null);
    setFailed(false);
    salesOrdersApi
      .availability(accessToken, orderId)
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [accessToken, orderId]);
  return { data, failed };
}

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'That did not go through. Please try again.');

/** The Finance Director's decision on a submitted order. It is a
 * financial call: no warehouse is asked for. The stock line is advice
 * only; the Managing Director chooses where it ships from. */
export function FinanceDecision({ order, accessToken, onDone }: { order: SalesOrder; accessToken: string; onDone: () => void }) {
  const { data: stock } = useAvailability(accessToken, order.id);
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
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
    } finally {
      setBusy(false);
    }
  };

  const covering = stock?.warehouses.filter((w) => w.canFulfillAll) ?? [];

  return (
    <div className="space-y-3 rounded-xl border border-husk-300 bg-husk-100/30 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-soil-500">Your decision</p>

      {stock && (
        <p className={`text-xs ${covering.length > 0 ? 'text-paddy-700' : 'text-soil-700'}`}>
          {covering.length > 0
            ? `Stock check: can be delivered in full from ${covering.map((w) => w.warehouseName).join(' or ')}.`
            : 'Stock check: no single warehouse can cover this whole order today. You can still approve it on financial grounds; the Managing Director chooses where it ships from.'}
        </p>
      )}

      {rejecting ? (
        <div className="space-y-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is it being sent back? The Sales Officer will see this."
            aria-label="Reason for rejecting this order"
            className="w-full rounded-lg border border-paddy-100 bg-white px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || reason.trim().length < 3}
              onClick={() => run(() => salesOrdersApi.reject(accessToken, order.id, reason.trim()))}
              className="rounded-full bg-red-700 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Confirm rejection'}
            </button>
            <button type="button" onClick={() => setRejecting(false)} className="text-xs text-ink-500">Back</button>
          </div>
        </div>
      ) : (
        <>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for the Managing Director, e.g. 50% deposit received"
            aria-label="Optional note for the Managing Director"
            maxLength={300}
            className="w-full rounded-lg border border-paddy-100 bg-white px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => salesOrdersApi.approve(accessToken, order.id, note.trim() || undefined))}
              className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50"
            >
              {busy ? 'Approving…' : 'Approve and send to the MD'}
            </button>
            <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="rounded-full border border-red-300 px-4 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
              Reject
            </button>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** The Managing Director's / CEO's step: with Finance's approval in hand,
 * choose the warehouse the rice leaves from and hand the delivery to the
 * Warehouse Supervisor. Warehouses that cannot cover the order can be seen
 * but not chosen, with the reason. */
export function ReleaseForDelivery({ order, accessToken, onDone }: { order: SalesOrder; accessToken: string; onDone: () => void }) {
  const { data: stock, failed } = useAvailability(accessToken, order.id);
  const [chosen, setChosen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-select the order's preferred warehouse if it can cover it, else the first that can.
  useEffect(() => {
    if (!stock || chosen) return;
    const pick = stock.warehouses.find((w) => w.warehouseId === stock.preferredWarehouseId && w.canFulfillAll) ?? stock.warehouses.find((w) => w.canFulfillAll);
    if (pick) setChosen(pick.warehouseId);
  }, [stock, chosen]);

  const release = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await salesOrdersApi.release(accessToken, order.id, { allocatedWarehouseId: chosen, note: note.trim() || undefined });
      onDone();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const none = !!stock && stock.warehouses.every((w) => !w.canFulfillAll);

  return (
    <div className="space-y-3 rounded-xl border border-husk-300 bg-husk-100/30 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-soil-500">Release for delivery</p>
      <p className="text-xs text-ink-500">Finance has approved this order. Choose where the rice leaves from; the Warehouse Supervisor is then given the delivery.</p>

      {!stock && !failed && <p className="text-xs text-ink-500">Checking stock…</p>}
      {failed && <p className="text-xs text-red-600">Could not check stock just now. Refresh and try again.</p>}

      {stock && (
        <fieldset className="space-y-1.5">
          <legend className="sr-only">Warehouse to deliver from</legend>
          {stock.warehouses.map((w) => {
            const short = w.lines.filter((l) => !l.enough).map((l) => `${l.product} ${l.size}: needs ${l.requestedBags}, has ${l.availableBags}`);
            return (
              <label
                key={w.warehouseId}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${w.canFulfillAll ? 'cursor-pointer border-paddy-100 bg-white' : 'border-ink-500/10 bg-ink-500/5 text-ink-500'} ${chosen === w.warehouseId ? 'ring-2 ring-paddy-700' : ''}`}
              >
                <input
                  type="radio"
                  name={`warehouse-${order.id}`}
                  checked={chosen === w.warehouseId}
                  disabled={!w.canFulfillAll}
                  onChange={() => setChosen(w.warehouseId)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-ink-900">{w.warehouseName}</span>
                  <span className={`ml-2 text-xs ${w.canFulfillAll ? 'text-paddy-700' : 'text-red-700'}`}>
                    {w.canFulfillAll ? 'can cover the whole order' : 'cannot cover it'}
                  </span>
                  {short.length > 0 && <span className="block text-xs text-ink-500">{short.join('; ')}</span>}
                </span>
              </label>
            );
          })}
          {none && <p className="text-xs text-soil-700">No warehouse can cover this order right now. Ask the Warehouse Supervisor to arrange stock, then release it.</p>}
        </fieldset>
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional instruction for the Warehouse Supervisor"
        aria-label="Optional instruction for the Warehouse Supervisor"
        maxLength={300}
        className="w-full rounded-lg border border-paddy-100 bg-white px-3 py-2 text-sm"
      />
      <button type="button" disabled={busy || !chosen} onClick={release} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
        {busy ? 'Releasing…' : 'Release to the Warehouse Supervisor'}
      </button>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
