'use client';

import { ReviewDialog } from '@/components/review/ReviewDialog';
import { OrderBrief } from '@/components/dispatch/OrderBrief';
import { OrderTracker } from '@/components/dispatch/OrderTracker';
import { RequestFailed, RequestSent } from '@/components/dispatch/DispatchFeedback';
import { DeliveryReportDetails } from '@/components/review/EntityDetails';
import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { deliveryOrdersApi, deliveryReportsApi, farmsApi, warehousesApi, paddyGradesApi, DeliveryOrder, DeliveryReport, Farm, Warehouse, PaddyGrade, ApiError, DispatchRequestResult } from '@/lib/api-client';

const REPORT_STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-ink-500/10 text-ink-700',
  SUPERVISOR_REVIEW: 'bg-husk-300 text-soil-700',
  APPROVED: 'bg-paddy-100 text-paddy-700',
  REJECTED: 'bg-red-100 text-red-700',
  IN_TRANSIT: 'bg-husk-300 text-soil-700',
  ARRIVED: 'bg-paddy-100 text-paddy-700',
  RECONCILED: 'bg-paddy-700 text-rice-50',
  CANCELLED: 'bg-ink-500/10 text-ink-500',
};

const TABS = ['Dispatch orders', 'Dispatch reports'] as const;

export default function DeliveriesPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Dispatch orders');
  const [orders, setOrders] = useState<DeliveryOrder[] | null>(null);
  const [reports, setReports] = useState<DeliveryReport[] | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; location?: string | null }[]>([]);
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);

  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [orderFarmId, setOrderFarmId] = useState('');
  const [orderWarehouseId, setOrderWarehouseId] = useState('');
  // One row per size - a real dispatch very often covers more than one
  // grade at once ("send Size 4 and Size 5 together"), matching the
  // same multi-row pattern already proven correct for paddy intake and
  // the quick-dispatch form. Weight is optional throughout - bags are
  // the number a Farm Supervisor actually deals in.
  const [orderRows, setOrderRows] = useState([{ paddyGradeId: '', bagCount: '', totalKg: '' }]);
  const [creatingOrder, setCreatingOrder] = useState(false);
  // What the farm manager is being asked to do, in full: where it goes, by when, how urgent, and any instruction.
  const [orderDate, setOrderDate] = useState('');
  const [orderPriority, setOrderPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderProblems, setOrderProblems] = useState<string[]>([]);
  const [requestResult, setRequestResult] = useState<DispatchRequestResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  // Arriving from a task ("Open the dispatch"): the orders of that request are highlighted.
  const [focusRef, setFocusRef] = useState<string | null>(null);

  const [reportingOrderId, setReportingOrderId] = useState<string | null>(null);
  const [reportBagCount, setReportBagCount] = useState('');
  const [reportKg, setReportKg] = useState('');
  const [labourCost, setLabourCost] = useState('');
  const [numberOfLabourers, setNumberOfLabourers] = useState('');
  const [transportationFee, setTransportationFee] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [creatingReport, setCreatingReport] = useState(false);

  // Approving and rejecting happen inside the review window, after the details have been read; a rejection always carries a comment.
  const [reviewing, setReviewing] = useState<DeliveryReport | null>(null);

  const loadOrders = (token: string) => {
    deliveryOrdersApi.list(token).then(setOrders).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load delivery orders.'));
  };
  const loadReports = (token: string) => {
    deliveryReportsApi.list(token).then(setReports).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load delivery reports.'));
  };

  useEffect(() => {
    if (!accessToken) return;
    loadOrders(accessToken);
    loadReports(accessToken);
    farmsApi.list(accessToken).then(setFarms).catch(() => {});
    warehousesApi.directory(accessToken).then(setWarehouses).catch(() => {});
    paddyGradesApi.list(accessToken).then(setGrades).catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('request');
    if (ref) setFocusRef(ref);
  }, []);
  useEffect(() => {
    if (focusRef && orders) document.querySelector('[data-focus-request="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusRef, orders]);

  const runAction = async (fn: () => Promise<unknown>) => {
    if (!accessToken) return;
    setPageError(null);
    try {
      await fn();
      loadReports(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  };

  const updateOrderRow = (index: number, field: 'paddyGradeId' | 'bagCount' | 'totalKg', value: string) => {
    setOrderRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };
  const addOrderRow = () => setOrderRows((prev) => [...prev, { paddyGradeId: '', bagCount: '', totalKg: '' }]);
  const removeOrderRow = (index: number) => setOrderRows((prev) => prev.filter((_, i) => i !== index));
  const validOrderRows = orderRows.filter((r) => r.paddyGradeId && r.bagCount);
  const totalOrderBags = validOrderRows.reduce((sum, r) => sum + (parseInt(r.bagCount, 10) || 0), 0);

  const onCreateOrder = async () => {
    if (!accessToken) return;
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
      setFocusRef(result.requestRef);
      loadOrders(accessToken);
    } catch (err) {
      setRequestError(err instanceof ApiError ? err.message : 'The request could not be sent. Check your connection and try again.');
    } finally {
      setCreatingOrder(false);
    }
  };

  const onCreateReport = async () => {
    if (!accessToken || !reportingOrderId) return;
    if (!reportBagCount || !(parseInt(reportBagCount, 10) >= 1)) {
      setPageError('Enter the number of bags that were loaded. Kilograms are optional.');
      return;
    }
    setCreatingReport(true);
    setPageError(null);
    try {
      await deliveryReportsApi.create(accessToken, {
        deliveryOrderId: reportingOrderId,
        actualBagCount: parseInt(reportBagCount, 10),
        actualKg: reportKg ? parseFloat(reportKg) : undefined,
        labourCost: labourCost ? parseFloat(labourCost) : undefined,
        numberOfLabourers: numberOfLabourers ? parseInt(numberOfLabourers, 10) : undefined,
        transportationFee: transportationFee ? parseFloat(transportationFee) : undefined,
        vehiclePlateNumber: vehiclePlate || undefined,
        driverName: driverName || undefined,
        driverPhone: driverPhone || undefined,
        departureTime: departureTime || undefined,
      });
      setReportingOrderId(null);
      setReportBagCount('');
      setReportKg('');
      setLabourCost('');
      setNumberOfLabourers('');
      setTransportationFee('');
      setVehiclePlate('');
      setDriverName('');
      setDriverPhone('');
      setDepartureTime('');
      loadReports(accessToken);
      setTab('Dispatch reports');
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to create delivery report.');
    } finally {
      setCreatingReport(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Dispatch</h1>
      <p className="mt-1 text-sm text-ink-500">
        A delivery order is the plan; a delivery report is what actually happened - labor, transport, driver,
        and vehicle details, submitted for approval.
      </p>

      <div className="mt-4 flex gap-1 border-b border-paddy-100">
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-husk-500 text-paddy-900' : 'text-ink-500'}`}>
            {t}
          </button>
        ))}
      </div>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {tab === 'Dispatch orders' && (
        <div className="mt-6">
          {hasPermission('delivery.create') && (
            <button type="button" onClick={() => setShowCreateOrder((v) => !v)} className="mb-4 rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50">
              {showCreateOrder ? 'Cancel' : 'Ask a farm manager to dispatch'}
            </button>
          )}
          {requestResult && <div className="mb-4"><RequestSent result={requestResult} onClose={() => setRequestResult(null)} /></div>}
          {requestError && <div className="mb-4"><RequestFailed message={requestError} onClose={() => setRequestError(null)} /></div>}
          {showCreateOrder && (
            <div className="mb-4 rounded-2xl border border-husk-300 bg-husk-100/30 p-4" data-testid="request-form">
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
          )}

          <div className="overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Farm → Warehouse</th>
                  <th className="px-4 py-3">Bags</th>
                  <th className="px-4 py-3">Where it is</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paddy-100">
                {orders?.map((o) => (
                  <tr key={o.id} data-focus-request={focusRef && o.requestRef === focusRef ? 'true' : undefined} className={focusRef && o.requestRef === focusRef ? 'bg-husk-100/40 ring-2 ring-inset ring-husk-500' : ''}>
                    <td className="px-4 py-3 font-mono text-xs text-ink-700">{o.orderNumber}</td>
                    <td className="px-4 py-3 text-ink-900">{o.farm.name} → <strong>{o.destinationWarehouse.name}</strong>{o.destinationWarehouse.location ? <span className="text-ink-500"> ({o.destinationWarehouse.location})</span> : null}{o.requestRef && <span className="block font-mono text-[10px] text-ink-500">{o.requestRef}</span>}{o.notes && <span className="mt-0.5 block text-xs text-ink-500">{o.notes}</span>}</td>
                    <td className="px-4 py-3 text-ink-700">{o.paddyGrade.label}: <strong>{o.bagCount}</strong> bag{o.bagCount === 1 ? '' : 's'}<span className="block text-xs text-ink-500">{o.totalKgEstimated ? 'about ' : ''}{o.totalKg.toLocaleString()} KG</span></td>
                    <td className="px-4 py-3">
                      <OrderTracker order={o} />
                    </td>
                    <td className="px-4 py-3">
                      {hasPermission('delivery.create') && !(o.tracking && ['IN_REVIEW', 'ON_THE_WAY', 'ARRIVED', 'CANCELLED'].includes(o.tracking.stage)) && (
                        <button type="button" onClick={() => setReportingOrderId(o.id)} className="rounded-full border border-husk-500 px-3 py-1 text-xs font-medium text-paddy-900 hover:bg-husk-500 hover:text-white">
                          Log delivery report
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {orders?.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-500">No delivery orders yet.</td></tr>}
              </tbody>
            </table>
          </div>

          {reportingOrderId && (
            <div className="mt-4 rounded-2xl border border-husk-300 bg-husk-100/30 p-5">
              <h3 className="font-display text-lg text-paddy-900">Dispatch report</h3>
              {orders?.find((o) => o.id === reportingOrderId) && <div className="mt-3"><OrderBrief order={orders.find((o) => o.id === reportingOrderId)!} /></div>}
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div><label className="mb-1 block text-xs font-medium text-ink-700">Actual bags</label><input type="number" value={reportBagCount} onChange={(e) => setReportBagCount(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-medium text-ink-700">Actual KG (optional)</label><input type="number" value={reportKg} placeholder="No scale? leave blank" onChange={(e) => setReportKg(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-medium text-ink-700">Departure time</label><input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-medium text-ink-700">Labour cost (GHS)</label><input type="number" value={labourCost} onChange={(e) => setLabourCost(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-medium text-ink-700">Number of labourers</label><input type="number" value={numberOfLabourers} onChange={(e) => setNumberOfLabourers(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-medium text-ink-700">Transportation fee (GHS)</label><input type="number" value={transportationFee} onChange={(e) => setTransportationFee(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-medium text-ink-700">Vehicle plate number</label><input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-medium text-ink-700">Driver name</label><input value={driverName} onChange={(e) => setDriverName(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-medium text-ink-700">Driver phone</label><input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" /></div>
              </div>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={onCreateReport} disabled={creatingReport} className="rounded-full bg-paddy-900 px-4 py-1.5 text-sm font-medium text-rice-50 disabled:opacity-50">
                  {creatingReport ? 'Saving…' : 'Save delivery report'}
                </button>
                <button type="button" onClick={() => setReportingOrderId(null)} className="rounded-full border border-paddy-100 px-4 py-1.5 text-sm font-medium text-ink-700">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'Dispatch reports' && (
        <div className="mt-6 space-y-3">
          {reports?.map((r) => (
            <div key={r.id} className="rounded-2xl border border-paddy-100 bg-white p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-xs text-ink-500">{r.reportNumber}</p>
                  <h3 className="mt-0.5 font-display text-lg text-paddy-900">{r.farm.name} → {r.destinationWarehouse.name}</h3>
                  <p className="mt-1 text-sm text-ink-500">{r.actualBagCount} bags · {r.actualKg.toLocaleString()} KG · {r.paddyGrade.label}</p>
                  {r.vehicle && <p className="mt-1 text-xs text-ink-500">Vehicle {r.vehicle.plateNumber}{r.driver ? ` · Driver ${r.driver.name}` : ''}</p>}
                  {r.rejectionReason && <p className="mt-1 text-xs text-red-600">Rejected: {r.rejectionReason}</p>}
                </div>
                <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${REPORT_STATUS_STYLES[r.status] ?? 'bg-ink-500/10'}`}>{r.status.replace('_', ' ')}</span>
              </div>
              <div className="mt-3 flex gap-2 border-t border-paddy-100 pt-3">
                {r.status === 'DRAFT' && hasPermission('delivery.create') && (
                  <button type="button" onClick={() => runAction(() => deliveryReportsApi.submit(accessToken!, r.id))} className="rounded-full border border-paddy-100 px-4 py-1.5 text-xs font-medium text-ink-700 hover:bg-paddy-50">
                    Submit for approval
                  </button>
                )}
                {r.status === 'SUPERVISOR_REVIEW' && (hasPermission('delivery.approve') || hasPermission('delivery.reject')) && (
                  <button type="button" onClick={() => setReviewing(r)} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50">
                    Review
                  </button>
                )}
              </div>
            </div>
          ))}
          {reports?.length === 0 && <div className="rounded-2xl border border-paddy-100 bg-white p-8 text-center text-sm text-ink-500">No delivery reports yet.</div>}
        </div>
      )}
      <ReviewDialog
        open={!!reviewing}
        title={reviewing ? `Delivery report ${reviewing.reportNumber}` : ''}
        subtitle={reviewing ? `${reviewing.farm.name} to ${reviewing.destinationWarehouse.name}` : undefined}
        details={reviewing ? <DeliveryReportDetails report={reviewing} /> : null}
        canApprove={hasPermission('delivery.approve')}
        canReject={hasPermission('delivery.reject')}
        rejectPrompt="Why is this report not approved? The person who filed it will read this."
        onApprove={async () => { await deliveryReportsApi.approve(accessToken!, reviewing!.id); loadReports(accessToken!); }}
        onReject={async (comment) => { await deliveryReportsApi.reject(accessToken!, reviewing!.id, comment); loadReports(accessToken!); }}
        onClose={() => setReviewing(null)}
      />
    </DashboardShell>
  );
}
