'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { inventoryTransactionsApi, InventoryTransactionRecord, InventoryTraceReferences, deliveryOrdersApi, DispatchTrace, salesOrdersApi, SalesOrder, MeResponse, ApiError } from '@/lib/api-client';

function fmtLocation(type: string | null) {
  if (!type) return ' - ';
  if (type === 'EXTERNAL') return 'In transit';
  if (type === 'CUSTOMER') return 'Customer';
  return type.charAt(0) + type.slice(1).toLowerCase().replace('_', ' ');
}

export default function TracePage() {
  const { me, accessToken, loading, error } = useCurrentUser();
  const [batchNumber, setBatchNumber] = useState('');
  const [results, setResults] = useState<InventoryTransactionRecord[] | null>(null);
  const [refs, setRefs] = useState<InventoryTraceReferences | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [orderNumberQuery, setOrderNumberQuery] = useState('');
  const [dispatchTrace, setDispatchTrace] = useState<DispatchTrace | null>(null);
  const [dispatchTraceError, setDispatchTraceError] = useState<string | null>(null);
  const [tracingDispatch, setTracingDispatch] = useState(false);

  const onTraceDispatch = async () => {
    if (!accessToken || !orderNumberQuery.trim()) return;
    setTracingDispatch(true);
    setDispatchTraceError(null);
    setDispatchTrace(null);
    try {
      const data = await deliveryOrdersApi.getFullTrace(accessToken, orderNumberQuery.trim());
      setDispatchTrace(data);
    } catch (err) {
      setDispatchTraceError(err instanceof ApiError ? err.message : 'No dispatch found with that order number.');
    } finally {
      setTracingDispatch(false);
    }
  };

  const onSearch = async (byBatch: boolean) => {
    if (!accessToken) return;
    setSearching(true);
    setSearchError(null);
    setSearched(true);
    try {
      const data = byBatch
        ? await inventoryTransactionsApi.list(accessToken, { batchNumber: batchNumber.trim() })
        : await inventoryTransactionsApi.list(accessToken, {});
      setResults(data);
      if (byBatch && batchNumber.trim()) {
        inventoryTransactionsApi.traceReferences(accessToken, batchNumber.trim()).then(setRefs).catch(() => setRefs(null));
      } else {
        setRefs(null);
      }
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : 'Failed to search.');
    } finally {
      setSearching(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  // Trace plays a genuinely different role for a Sales Officer - real
  // batch/dispatch tracing across the farm-to-warehouse-to-milling
  // pipeline isn't their jurisdiction (confirmed directly: they hold
  // none of audit.view/farm.inventory.view/warehouse.inventory.view/
  // milling.view that the search below actually needs). What they
  // legitimately need from a page called "Trace" is tracking their own
  // orders' stage, so that's what this renders for them instead of the
  // generic search UI everyone else sees.
  const isSalesOfficer = me.roles.some((r) => r.code === 'SALES_OFFICER');
  if (isSalesOfficer) {
    return <SalesOrderTraceView me={me} accessToken={accessToken} />;
  }

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Trace</h1>

      <div className="mt-4 rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-5">
        <h2 className="font-display text-lg text-paddy-900">🚛 Track a dispatch</h2>
        <p className="mt-1 text-sm text-ink-500">Enter a dispatch order number to see exactly where it stands - from order, through the road, to arrival.</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={orderNumberQuery}
            onChange={(e) => setOrderNumberQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onTraceDispatch()}
            placeholder="Order number (e.g. DO-2026-000123)…"
            className="w-72 rounded-lg border border-paddy-100 px-3 py-2 text-sm"
          />
          <button type="button" onClick={onTraceDispatch} disabled={tracingDispatch || !orderNumberQuery.trim()} className="rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50 disabled:opacity-50">
            {tracingDispatch ? 'Searching…' : 'Track'}
          </button>
        </div>

        {dispatchTraceError && <p className="mt-3 text-sm text-red-600">{dispatchTraceError}</p>}

        {dispatchTrace && (
          <div className="mt-4 rounded-xl bg-white p-4">
            <p className="text-sm text-ink-900">
              <span className="font-medium">{dispatchTrace.order.farmName}</span> → <span className="font-medium">{dispatchTrace.order.warehouseName}</span>
              <span className="mx-2 text-ink-300">·</span>
              {dispatchTrace.order.gradeLabel}: {dispatchTrace.order.bagCount} bags
              {dispatchTrace.order.totalKg ? ` (${dispatchTrace.order.totalKg} KG${dispatchTrace.order.totalKgEstimated ? ', estimated' : ''})` : ''}
            </p>

            {/* Stage-by-stage timeline - the actual "state of the dispatch" */}
            <div className="mt-4 space-y-0">
              {[
                { label: 'Order created', done: true, detail: dispatchTrace.order.status },
                { label: 'Dispatch report submitted', done: !!dispatchTrace.report, detail: dispatchTrace.report?.status ?? 'Not yet submitted' },
                { label: 'On the road', done: !!dispatchTrace.shipment, detail: dispatchTrace.shipment ? `Departed ${new Date(dispatchTrace.shipment.departedAt).toLocaleString()}` : 'Not yet dispatched' },
                { label: 'Arrived & received', done: !!dispatchTrace.shipment?.receivedAt, detail: dispatchTrace.shipment?.receivedAt ? `Received ${new Date(dispatchTrace.shipment.receivedAt).toLocaleString()}` : 'Not yet received' },
              ].map((stage, i, arr) => (
                <div key={stage.label} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${stage.done ? 'bg-paddy-700 text-rice-50' : 'bg-ink-500/10 text-ink-500'}`}>
                      {stage.done ? '✓' : i + 1}
                    </div>
                    {i < arr.length - 1 && <div className={`w-0.5 flex-1 ${stage.done ? 'bg-paddy-700' : 'bg-ink-500/10'}`} style={{ minHeight: '24px' }} />}
                  </div>
                  <div className="pb-4">
                    <p className={`text-sm font-medium ${stage.done ? 'text-ink-900' : 'text-ink-500'}`}>{stage.label}</p>
                    <p className="text-xs text-ink-500">{stage.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            {dispatchTrace.report?.driverName && (
              <p className="text-xs text-ink-500">
                Driver: {dispatchTrace.report.driverName}
                {dispatchTrace.report.vehiclePlateNumber && ` · Vehicle: ${dispatchTrace.report.vehiclePlateNumber}`}
              </p>
            )}

            {dispatchTrace.shipment && dispatchTrace.shipment.events.length > 0 && (
              <div className="mt-3 border-t border-paddy-100 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-soil-500">Location updates</p>
                <div className="mt-2 space-y-1">
                  {dispatchTrace.shipment.events.filter((e) => e.eventType === 'LOCATION_UPDATE').map((e, i) => (
                    <p key={i} className="text-sm text-ink-700">📍 {e.notes} <span className="text-xs text-ink-500"> -  {new Date(e.createdAt).toLocaleString()}</span></p>
                  ))}
                </div>
              </div>
            )}

            {dispatchTrace.shipment?.varianceRequiresApproval && (
              <div className="mt-3 rounded-lg bg-red-50 p-3">
                <p className="text-sm font-medium text-red-700">Variance flagged for approval</p>
                <p className="text-xs text-red-600">
                  Expected {dispatchTrace.order.bagCount} bags, received {dispatchTrace.shipment.receivedBags} bags
                  {dispatchTrace.shipment.varianceKg !== null && ` (${dispatchTrace.shipment.varianceKg > 0 ? '+' : ''}${dispatchTrace.shipment.varianceKg} KG)`}
                  {dispatchTrace.shipment.receivedCondition && ` · Condition: ${dispatchTrace.shipment.receivedCondition}`}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-6 text-sm text-ink-500">
        Enter a batch number to see its complete forward-and-backward history - every transaction, who recorded it, and when.
        Leave it blank to see your most recent transactions instead.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={batchNumber}
          onChange={(e) => setBatchNumber(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch(true)}
          placeholder="Batch number (e.g. PB-0001, PE-2026-000012)…"
          className="w-72 rounded-lg border border-paddy-100 px-3 py-2 text-sm"
        />
        <button type="button" onClick={() => onSearch(true)} disabled={searching || !batchNumber.trim()} className="rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50 disabled:opacity-50">
          {searching ? 'Searching…' : 'Trace batch'}
        </button>
        <button type="button" onClick={() => onSearch(false)} disabled={searching} className="rounded-full border border-paddy-100 px-5 py-2 text-sm font-medium text-ink-700 disabled:opacity-50">
          Show recent activity
        </button>
      </div>

      {searchError && <p className="mt-4 text-sm text-red-600">{searchError}</p>}

      {refs && (refs.referencedByProductionRecords.length > 0 || refs.referencedByPackagingBatches.length > 0 || refs.referencedBySalesOrders.length > 0) && (
        <div className="mt-6 rounded-2xl border border-husk-500 bg-husk-100/30 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-soil-500">Recorded references - noted by operators, not automatically derived</p>
          <div className="mt-2 space-y-1 text-sm">
            {refs.referencedByProductionRecords.map((r) => (
              <p key={r.recordNumber} className="text-ink-700">Named as a source in production record <span className="font-mono text-xs">{r.recordNumber}</span> ({new Date(r.date).toLocaleDateString()})</p>
            ))}
            {refs.referencedByPackagingBatches.map((b) => (
              <p key={b.batchNumber} className="text-ink-700">Named as a source in packaging batch <span className="font-mono text-xs">{b.batchNumber}</span> ({new Date(b.date).toLocaleDateString()})</p>
            ))}
            {refs.referencedBySalesOrders.map((o) => (
              <p key={o.orderNumber} className="text-ink-700">Named as a fulfillment source for sales order <span className="font-mono text-xs">{o.orderNumber}</span></p>
            ))}
          </div>
        </div>
      )}

      {searched && results && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paddy-100">
              {results.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 text-xs text-ink-500">{new Date(t.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-700">{t.type}</td>
                  <td className="px-4 py-3 text-ink-700">{fmtLocation(t.sourceLocationType)}</td>
                  <td className="px-4 py-3 text-ink-700">{fmtLocation(t.destLocationType)}</td>
                  <td className="px-4 py-3 text-ink-900">{t.paddyGrade?.label ?? t.product?.name ?? ' - '}{t.packagingSize ? ` (${t.packagingSize.label})` : ''}</td>
                  <td className="px-4 py-3 text-ink-700">{t.quantityKg.toLocaleString()} KG{t.bagCount !== null ? ` / ${t.bagCount} bags` : ''}</td>
                  <td className="px-4 py-3 text-ink-700">{t.user.firstName} {t.user.lastName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-500">{t.referenceDocument ?? t.batchNumber ?? ' - '}</td>
                </tr>
              ))}
              {results.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-500">No transactions found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}

// ── Sales Officer: track your own orders, not the general pipeline ──
function SalesOrderTraceView({ me, accessToken }: { me: MeResponse; accessToken: string | null }) {
  const [orders, setOrders] = useState<SalesOrder[] | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    salesOrdersApi
      .list(accessToken)
      .then((all) => setOrders(all.filter((o) => o.salesOfficer.id === me.id)))
      .catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load your orders.'));
  }, [accessToken, me.id]);

  const selected = orders?.find((o) => o.id === selectedId) ?? null;

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Trace your orders</h1>
      <p className="mt-1 text-sm text-ink-500">Every order you've created, and exactly what stage it's at right now.</p>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-2">
          {orders?.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelectedId(o.id)}
              className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                selectedId === o.id ? 'border-husk-500 bg-husk-100/30' : 'border-paddy-100 bg-white hover:border-husk-300'
              }`}
            >
              <div>
                <p className="font-mono text-xs text-ink-500">{o.orderNumber}</p>
                <p className="font-medium text-ink-900">{o.customer.name}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  o.status === 'FULFILLED' ? 'bg-paddy-700 text-rice-50' : ['REJECTED', 'CANCELLED'].includes(o.status) ? 'bg-red-100 text-red-700' : 'bg-husk-300 text-soil-700'
                }`}
              >
                {o.status}
              </span>
            </button>
          ))}
          {orders?.length === 0 && <p className="text-sm text-ink-500">No orders yet - create one from the Sales page to see it tracked here.</p>}
        </div>

        {selected && (
          <div className="rounded-2xl border border-paddy-100 bg-white p-5">
            <p className="font-mono text-xs text-ink-500">{selected.orderNumber}</p>
            <h2 className="mt-1 font-display text-lg text-paddy-900">{selected.customer.name}</h2>

            {(selected.deliveryLocation || selected.requestedDeliveryDate) && (
              <div className="mt-2 space-y-0.5 text-xs text-ink-500">
                {selected.deliveryLocation && <p>📍 {selected.deliveryLocation}</p>}
                {selected.requestedDeliveryDate && <p>Requested for {new Date(selected.requestedDeliveryDate).toLocaleDateString()}</p>}
              </div>
            )}

            <div className="mt-4 space-y-2">
              {[
                { label: 'Order created', at: selected.createdAt, always: true },
                { label: 'Submitted for approval', at: selected.submittedAt },
                { label: 'Approved & stock reserved', at: selected.approvedAt },
                { label: 'Delivered', at: selected.fulfilledAt },
              ].map((step) => (
                <div key={step.label} className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${step.at || step.always ? 'bg-paddy-700' : 'bg-ink-500/20'}`} />
                  <div>
                    <p className={`text-sm ${step.at || step.always ? 'font-medium text-ink-900' : 'text-ink-500'}`}>{step.label}</p>
                    {step.at && <p className="text-xs text-ink-500">{new Date(step.at).toLocaleString()}</p>}
                  </div>
                </div>
              ))}
              {selected.status === 'REJECTED' && (
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <div>
                    <p className="text-sm font-medium text-red-700">Rejected</p>
                    {selected.rejectionReason && <p className="text-xs text-ink-500">{selected.rejectionReason}</p>}
                  </div>
                </div>
              )}
              {selected.status === 'CANCELLED' && (
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-ink-500" />
                  <p className="text-sm font-medium text-ink-700">Cancelled</p>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-1 border-t border-paddy-100 pt-4">
              {selected.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-ink-700">{item.product.name} - {item.packagingSize.label} × {item.bagCount}</span>
                  <span className="text-ink-500">{item.totalKg.toLocaleString()} KG</span>
                </div>
              ))}
            </div>

            {selected.receiptUrl && (
              <p className="mt-3 text-xs text-ink-700">
                🧾 <a href={selected.receiptUrl} target="_blank" rel="noreferrer" className="font-medium text-paddy-700 underline">View attached receipt</a>
              </p>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
