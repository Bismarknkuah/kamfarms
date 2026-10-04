'use client';

import { useEffect, useState } from 'react';
import { ApiError, DispatchRequestResult, Farm, PaddyGrade, deliveryOrdersApi, farmsApi, paddyGradesApi, warehousesApi } from '@/lib/api-client';
import { RequestFailed, RequestSent } from '@/components/dispatch/DispatchFeedback';
import { SizeBags, linesOf } from '@/components/SizeBags';
import { longDate } from '@/lib/dates';

const dayFrom = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const WHEN = [['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['In a week', 7]] as const;

/**
 * The Farm Director asks a farm manager to dispatch: which farm, which warehouse (shown with where it is), Size 4 and Size 5 bags, the day it is
 * needed, and a note if wanted. It becomes the farm manager's task and appears on the Dispatch desk of both of them.
 */
export function DispatchRequestForm({ accessToken, onSent, onClose }: { accessToken: string; onSent: () => void; onClose?: () => void }) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; location?: string | null }[]>([]);
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  const [orderFarmId, setOrderFarmId] = useState('');
  const [orderWarehouseId, setOrderWarehouseId] = useState('');
  const [bags, setBags] = useState<Record<string, number>>({});
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderDate, setOrderDate] = useState('');
  const [orderPriority, setOrderPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderProblems, setOrderProblems] = useState<string[]>([]);
  const [requestResult, setRequestResult] = useState<DispatchRequestResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    farmsApi.list(accessToken).then((f) => { setFarms(f); if (f.length === 1) setOrderFarmId(f[0].id); }).catch(() => {});
    warehousesApi.directory(accessToken).then(setWarehouses).catch(() => {});
    paddyGradesApi.list(accessToken).then(setGrades).catch(() => {});
  }, [accessToken]);

  const chosen = warehouses.find((w) => w.id === orderWarehouseId);
  const onCreateOrder = async () => {
    setRequestResult(null);
    setRequestError(null);
    // Every tap on "Send" is answered: either what is wrong, or that it went.
    const problems: string[] = [];
    if (!orderFarmId) problems.push('Choose the farm the bags will leave from.');
    if (!orderWarehouseId) problems.push('Choose the warehouse the bags must go to.');
    if (!orderDate) problems.push('Choose the date the bags are needed at the warehouse.');
    if (linesOf(bags).length === 0) problems.push('Put the bags on Size 4 or Size 5.');
    setOrderProblems(problems);
    if (problems.length > 0) return;
    setCreatingOrder(true);
    try {
      // ONE request with every size, saved together (all or none), which also becomes the farm manager's task.
      const result = await deliveryOrdersApi.createRequest(accessToken, {
        farmId: orderFarmId, destinationWarehouseId: orderWarehouseId, requestedDate: orderDate, priority: orderPriority, notes: orderNotes.trim() || undefined,
        lines: linesOf(bags).map((l) => ({ paddyGradeId: l.paddyGradeId, bagCount: l.bags })),
      });
      setRequestResult(result);
      setBags({}); setOrderNotes(''); setOrderPriority('NORMAL'); setOrderDate('');
      onSent();
    } catch (err) {
      setRequestError(err instanceof ApiError ? err.message : 'The request could not be sent. Check your connection and try again.');
    } finally {
      setCreatingOrder(false);
    }
  };

  return (
    <div className="space-y-3">
      {requestResult && <RequestSent result={requestResult} onClose={() => setRequestResult(null)} />}
      {requestError && <RequestFailed message={requestError} onClose={() => setRequestError(null)} />}
      <div className="rounded-2xl border border-husk-300 bg-husk-100/30 p-4" data-testid="request-form">
        <h3 className="font-display text-lg text-paddy-900">Ask a farm manager to send paddy</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="req-farm" className="mb-1 block text-xs font-medium text-ink-700">From which farm</label>
            <select id="req-farm" value={orderFarmId} onChange={(e) => setOrderFarmId(e.target.value)} className="w-full rounded-xl border border-paddy-100 bg-white px-3 py-3 text-base">
              <option value="">Choose...</option>
              {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="req-warehouse" className="mb-1 block text-xs font-medium text-ink-700">To which warehouse</label>
            <select id="req-warehouse" value={orderWarehouseId} onChange={(e) => setOrderWarehouseId(e.target.value)} className="w-full rounded-xl border border-paddy-100 bg-white px-3 py-3 text-base">
              <option value="">Choose...</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}{w.location ? ` - ${w.location}` : ''}</option>)}
            </select>
          </div>
        </div>
        {chosen && <p className="mt-3 rounded-xl bg-white px-4 py-2 text-sm text-ink-900" data-testid="request-destination">Send it to <strong>{chosen.name}</strong>{chosen.location ? ` (${chosen.location})` : ''}.</p>}

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-soil-500">How many bags</p>
        <div className="mt-1"><SizeBags grades={grades} value={bags} onChange={setBags} /></div>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-soil-500">When is it needed at the warehouse</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {WHEN.map(([label, n]) => <button key={label} type="button" aria-pressed={orderDate === dayFrom(n)} onClick={() => setOrderDate(dayFrom(n))} className={`rounded-full border-2 px-4 py-2 text-sm font-medium ${orderDate === dayFrom(n) ? 'border-paddy-900 bg-paddy-900 text-rice-50' : 'border-paddy-100 bg-white text-ink-700'}`}>{label}</button>)}
        </div>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label htmlFor="req-date" className="mb-1 block text-xs font-medium text-ink-700">Or choose the day</label><input id="req-date" type="date" value={orderDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setOrderDate(e.target.value)} className="w-full rounded-xl border border-paddy-100 bg-white px-3 py-2 text-sm" /></div>
          <div><label htmlFor="req-priority" className="mb-1 block text-xs font-medium text-ink-700">How urgent</label>
            <select id="req-priority" value={orderPriority} onChange={(e) => setOrderPriority(e.target.value as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT')} className="w-full rounded-xl border border-paddy-100 bg-white px-3 py-2 text-sm">
              <option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
            </select></div>
        </div>
        {orderDate && <p className="mt-1 text-xs text-ink-500">Needed by {longDate(orderDate)}</p>}
        <div className="mt-3">
          <label htmlFor="req-notes" className="mb-1 block text-xs font-medium text-ink-700">A note for the farm manager (not needed)</label>
          <textarea id="req-notes" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Load Size 4 first" className="w-full rounded-xl border border-paddy-100 bg-white px-3 py-2 text-sm" />
        </div>
        {orderProblems.length > 0 && (
          <div role="alert" data-testid="request-problems" className="mt-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-medium">Not sent yet. Please fix:</p>
            <ul className="mt-1 list-disc pl-5">{orderProblems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        <div className="mt-4 flex items-center gap-4">
          <button type="button" data-testid="request-send" onClick={onCreateOrder} disabled={creatingOrder} className="rounded-full bg-paddy-900 px-8 py-3 text-base font-medium text-rice-50 disabled:opacity-50">{creatingOrder ? 'Sending...' : 'Send request'}</button>
          {onClose && <button type="button" onClick={onClose} className="text-sm text-ink-500">Close</button>}
        </div>
      </div>
    </div>
  );
}
