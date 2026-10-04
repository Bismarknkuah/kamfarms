'use client';

import { useEffect, useState } from 'react';
import { ApiError, DispatchRequestResult, Farm, PaddyGrade, deliveryOrdersApi, farmsApi, paddyGradesApi, warehousesApi } from '@/lib/api-client';
import { RequestFailed, RequestSent } from '@/components/dispatch/DispatchFeedback';

/**
 * The Farm Supervisor asks a farm manager to dispatch: every size in one request, to ONE warehouse (shown with its location), needed by a
 * date, with instructions. It becomes the farm manager's task and appears on the Dispatch desk of both of them.
 */
export function DispatchRequestForm({ accessToken, onSent, onClose }: { accessToken: string; onSent: () => void; onClose?: () => void }) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; location?: string | null }[]>([]);
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  const [orderFarmId, setOrderFarmId] = useState('');
  const [orderWarehouseId, setOrderWarehouseId] = useState('');
  const [orderRows, setOrderRows] = useState([{ paddyGradeId: '', bagCount: '', totalKg: '' }]);
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

  const updateOrderRow = (index: number, field: 'paddyGradeId' | 'bagCount' | 'totalKg', value: string) => {
    setOrderRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };
  const addOrderRow = () => setOrderRows((prev) => [...prev, { paddyGradeId: '', bagCount: '', totalKg: '' }]);
  const removeOrderRow = (index: number) => setOrderRows((prev) => prev.filter((_, i) => i !== index));
  const validOrderRows = orderRows.filter((r) => r.paddyGradeId && r.bagCount);
  const totalOrderBags = validOrderRows.reduce((sum, r) => sum + (parseInt(r.bagCount, 10) || 0), 0);

  const onCreateOrder = async () => {
    setRequestResult(null);
    setRequestError(null);
    // Every tap on "Send" is answered: either what is wrong, or that it went.
    const problems: string[] = [];
    if (!orderFarmId) problems.push('Choose the farm the bags will leave from.');
    if (!orderWarehouseId) problems.push('Choose the warehouse the bags must go to.');
    if (!orderDate) problems.push('Choose the date the bags are needed at the warehouse.');
    const filled = orderRows.filter((r) => r.paddyGradeId || r.bagCount);
    if (filled.length === 0) problems.push('Add at least one size with its bags.');
    const seen = new Set<string>();
    filled.forEach((r, i) => {
      const n = i + 1;
      if (!r.paddyGradeId) problems.push(`Line ${n}: choose the size.`);
      if (!r.bagCount) problems.push(`Line ${n}: enter the number of bags.`);
      else if (!/^\d+$/.test(r.bagCount) || parseInt(r.bagCount, 10) < 1) problems.push(`Line ${n}: bags must be a whole number of at least 1.`);
      if (r.paddyGradeId) {
        if (seen.has(r.paddyGradeId)) problems.push('A size is on the list twice: put all of its bags on one line.');
        seen.add(r.paddyGradeId);
      }
    });
    setOrderProblems(problems);
    if (problems.length > 0) return;
    setCreatingOrder(true);
    try {
      // ONE request with every size, saved together (all or none), which also becomes the farm manager's task.
      const result = await deliveryOrdersApi.createRequest(accessToken, {
        farmId: orderFarmId,
        destinationWarehouseId: orderWarehouseId,
        requestedDate: orderDate,
        priority: orderPriority,
        notes: orderNotes.trim() || undefined,
        lines: filled.map((r) => ({ paddyGradeId: r.paddyGradeId, bagCount: parseInt(r.bagCount, 10), totalKg: r.totalKg ? parseFloat(r.totalKg) : undefined })),
      });
      setRequestResult(result);
      setOrderRows([{ paddyGradeId: '', bagCount: '', totalKg: '' }]);
      setOrderNotes('');
      setOrderPriority('NORMAL');
      setOrderDate('');
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
                <h3 className="font-display text-lg text-paddy-900">Ask a farm manager to dispatch</h3>
                <p className="mt-0.5 text-xs text-ink-500">It becomes a task on the farm manager&rsquo;s list with all of this in it, and you can follow it here until it arrives.</p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="req-farm" className="mb-1 block text-xs font-medium text-ink-700">From which farm</label>
                    <select id="req-farm" value={orderFarmId} onChange={(e) => setOrderFarmId(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm">
                      <option value="">Select...</option>
                      {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="req-warehouse" className="mb-1 block text-xs font-medium text-ink-700">To which warehouse</label>
                    <select id="req-warehouse" value={orderWarehouseId} onChange={(e) => setOrderWarehouseId(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm">
                      <option value="">Select...</option>
                      {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}{w.location ? ` - ${w.location}` : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="req-date" className="mb-1 block text-xs font-medium text-ink-700">Needed at the warehouse by</label>
                    <input id="req-date" type="date" value={orderDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setOrderDate(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="req-priority" className="mb-1 block text-xs font-medium text-ink-700">How urgent</label>
                    <select id="req-priority" value={orderPriority} onChange={(e) => setOrderPriority(e.target.value as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT')} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm">
                      <option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
                    </select>
                  </div>
                </div>
                {orderWarehouseId && (
                  <p className="mt-3 rounded-xl bg-white px-4 py-2 text-sm text-ink-900" data-testid="request-destination">
                    The farm manager will be told to send it to <strong>{warehouses.find((w) => w.id === orderWarehouseId)?.name}</strong>{warehouses.find((w) => w.id === orderWarehouseId)?.location ? ` (${warehouses.find((w) => w.id === orderWarehouseId)?.location})` : ''}.
                  </p>
                )}
                <div className="mt-3">
                  <label htmlFor="req-notes" className="mb-1 block text-xs font-medium text-ink-700">Instructions for the farm manager (optional)</label>
                  <textarea id="req-notes" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Load the Size 4 first. The truck leaves at 6am. Ask for Mr Adjei at the gate." className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                </div>
  
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-soil-500">What to send, by size</p>
                  <button type="button" onClick={() => setOrderRows(grades.map((g) => ({ paddyGradeId: g.id, bagCount: '', totalKg: '' })))} className="text-xs font-medium text-paddy-700 underline">Select all sizes</button>
                </div>
                <div className="mt-2 space-y-2" role="group" aria-label="Sizes in this request">
                  {orderRows.map((row, index) => {
                    const otherSelected = orderRows.filter((_, i) => i !== index).map((r) => r.paddyGradeId);
                    return (
                      <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr_0.8fr_1fr_auto]" data-testid="request-line">
                        <select aria-label={`Size, line ${index + 1}`} value={row.paddyGradeId} onChange={(e) => updateOrderRow(index, 'paddyGradeId', e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm">
                          <option value="">Choose a size...</option>
                          {grades.filter((g) => !otherSelected.includes(g.id) || g.id === row.paddyGradeId).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                        </select>
                        <input aria-label={`Bags, line ${index + 1}`} inputMode="numeric" value={row.bagCount} placeholder="Bags" onChange={(e) => updateOrderRow(index, 'bagCount', e.target.value.replace(/[^0-9]/g, ''))} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
                        <input aria-label={`Kilograms, line ${index + 1}, optional`} inputMode="decimal" value={row.totalKg} placeholder="KG (optional)" onChange={(e) => updateOrderRow(index, 'totalKg', e.target.value.replace(/[^0-9.]/g, ''))} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
                        {orderRows.length > 1 ? <button type="button" onClick={() => removeOrderRow(index)} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">Remove</button> : <span />}
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={addOrderRow} className="mt-2 text-xs font-medium text-paddy-700 underline">+ Add another size</button>
                <p className="mt-1 text-xs text-ink-500">Bags are what is counted. Kilograms are optional: leave them blank where there is no scale.</p>
                {totalOrderBags > 0 && <p className="mt-1 text-xs font-medium text-paddy-700" data-testid="request-total">{totalOrderBags} bags in all, across {validOrderRows.length} size{validOrderRows.length === 1 ? '' : 's'}</p>}
  
                {orderProblems.length > 0 && (
                  <div role="alert" data-testid="request-problems" className="mt-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <p className="font-medium">Not sent yet. Please fix:</p>
                    <ul className="mt-1 list-disc pl-5">{orderProblems.map((p) => <li key={p}>{p}</li>)}</ul>
                  </div>
                )}
                <button type="button" data-testid="request-send" onClick={onCreateOrder} disabled={creatingOrder} className="mt-4 rounded-full bg-paddy-900 px-6 py-2 text-sm font-medium text-rice-50 disabled:opacity-50">
                  {creatingOrder ? 'Sending...' : 'Send request to the farm manager'}
                </button>
              </div>
      {onClose && <button type="button" onClick={onClose} className="text-xs text-ink-500">Close the form</button>}
    </div>
  );
}
