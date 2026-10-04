'use client';

import { useEffect, useState } from 'react';
import { ReviewDialog } from '@/components/review/ReviewDialog';
import { DeliveryReportDetails } from '@/components/review/EntityDetails';
import { OrderTracker } from '@/components/dispatch/OrderTracker';
import { DispatchDesk } from '@/components/dispatch/DispatchDesk';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { deliveryOrdersApi, deliveryReportsApi, DeliveryOrder, DeliveryReport, ApiError } from '@/lib/api-client';

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

const TABS = ['Dispatch desk', 'Dispatch orders', 'Dispatch reports'] as const;

export default function DeliveriesPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Dispatch desk');
  const [orders, setOrders] = useState<DeliveryOrder[] | null>(null);
  const [reports, setReports] = useState<DeliveryReport[] | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  // Arriving from a task ("Open the dispatch"): that request is highlighted on the desk.
  const [focusRef, setFocusRef] = useState<string | null>(null);
  // Approving and rejecting happen inside the review window, after the details have been read; a rejection always carries a comment.
  const [reviewing, setReviewing] = useState<DeliveryReport | null>(null);

  const loadOrders = (token: string) => {
    deliveryOrdersApi.list(token).then(setOrders).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load dispatch orders.'));
  };
  const loadReports = (token: string) => {
    deliveryReportsApi.list(token).then(setReports).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load dispatch reports.'));
  };
  useEffect(() => {
    if (!accessToken) return;
    loadOrders(accessToken);
    loadReports(accessToken);
  }, [accessToken]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('request');
    if (ref) setFocusRef(ref);
    const wanted = params.get('tab');
    if (wanted === 'reports') setTab('Dispatch reports');
    if (wanted === 'orders') setTab('Dispatch orders');
  }, []);

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

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading...</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Dispatch</h1>
      <p className="mt-1 text-sm text-ink-500">
        A request says where the bags must go. The farm manager loads one truck with every size and submits one dispatch; the Farm Supervisor approves it as one; the warehouse receives it.
      </p>

      <div className="mt-4 flex gap-2 border-b border-paddy-100">
        {TABS.map((t) => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-husk-500 text-paddy-900' : 'text-ink-500'}`}>{t}</button>
        ))}
      </div>

      {pageError && <p role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{pageError}</p>}

      {tab === 'Dispatch desk' && accessToken && (
        <div className="mt-6">
          <DispatchDesk accessToken={accessToken} me={me} hasPermission={hasPermission} variant="page" focusRef={focusRef} />
        </div>
      )}

      {tab === 'Dispatch orders' && (
        <div className="mt-6">
          <p className="mb-3 text-xs text-ink-500">Every order, newest first. To dispatch, use the Dispatch desk.</p>
          <div className="overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Farm &rarr; Warehouse</th>
                  <th className="px-4 py-3">Bags</th>
                  <th className="px-4 py-3">Where it is</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paddy-100">
                {orders?.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-mono text-xs text-ink-700">{o.orderNumber}{o.requestRef && <span className="block text-[10px] text-ink-500">{o.requestRef}</span>}</td>
                    <td className="px-4 py-3 text-ink-900">{o.farm.name} &rarr; <strong>{o.destinationWarehouse.name}</strong>{o.destinationWarehouse.location ? <span className="text-ink-500"> ({o.destinationWarehouse.location})</span> : null}{o.notes && <span className="mt-0.5 block text-xs text-ink-500">{o.notes}</span>}</td>
                    <td className="px-4 py-3 text-ink-700">{o.paddyGrade.label}: <strong>{o.bagCount}</strong> bag{o.bagCount === 1 ? '' : 's'}<span className="block text-xs text-ink-500">{o.totalKgEstimated ? 'about ' : ''}{o.totalKg.toLocaleString()} KG</span></td>
                    <td className="px-4 py-3"><OrderTracker order={o} /></td>
                  </tr>
                ))}
                {orders?.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-500">No dispatch orders yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Dispatch reports' && (
        <div className="mt-6 space-y-3">
          <p className="text-xs text-ink-500">Every dispatch report, one per size. A report that belongs to a dispatch is decided on the Dispatch desk, together with its other sizes.</p>
          {reports?.map((r) => {
            const mine = r.submittedById === me.id;
            return (
              <div key={r.id} className="rounded-2xl border border-paddy-100 bg-white p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-xs text-ink-500">{r.reportNumber}{r.dispatchRef && <span className="ml-2 text-ink-500">in dispatch {r.dispatchRef}</span>}</p>
                    <h3 className="mt-0.5 font-display text-lg text-paddy-900">{r.farm.name} &rarr; {r.destinationWarehouse.name}</h3>
                    <p className="mt-1 text-sm text-ink-500">{r.actualBagCount} bags &middot; {r.actualKg.toLocaleString()} KG{r.actualKgEstimated ? ' (estimated)' : ''} &middot; {r.paddyGrade.label}</p>
                    {r.vehicle && <p className="mt-1 text-xs text-ink-500">Vehicle {r.vehicle.plateNumber}{r.driver ? ` · Driver ${r.driver.name}` : ''}</p>}
                    {r.rejectionReason && <p className="mt-1 text-xs text-red-600">Rejected: {r.rejectionReason}</p>}
                  </div>
                  <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${REPORT_STATUS_STYLES[r.status] ?? 'bg-ink-500/10'}`}>{r.status.replace('_', ' ')}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-paddy-100 pt-3">
                  {r.dispatchRef ? (
                    <>
                      <span className="text-xs text-ink-500">Part of a dispatch with other sizes: it is decided as one.</span>
                      <button type="button" onClick={() => setTab('Dispatch desk')} className="rounded-full border border-paddy-100 px-4 py-1.5 text-xs font-medium text-paddy-900">Open the Dispatch desk</button>
                    </>
                  ) : (
                    <>
                      {/* Only the person who prepared a draft can send it: the supervisor is never offered a button that cannot work. */}
                      {r.status === 'DRAFT' && mine && hasPermission('delivery.create') && (
                        <button type="button" onClick={() => runAction(() => deliveryReportsApi.submit(accessToken!, r.id))} className="rounded-full border border-paddy-100 px-4 py-1.5 text-xs font-medium text-paddy-900">Submit for approval</button>
                      )}
                      {r.status === 'DRAFT' && !mine && <span className="text-xs text-ink-500">A draft still being prepared by the farm manager.</span>}
                      {r.status === 'SUPERVISOR_REVIEW' && (hasPermission('delivery.approve') || hasPermission('delivery.reject')) && (
                        <button type="button" onClick={() => setReviewing(r)} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50">Review</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {reports?.length === 0 && <div className="rounded-2xl border border-paddy-100 bg-white p-8 text-center text-sm text-ink-500">No dispatch reports yet.</div>}
        </div>
      )}
      <ReviewDialog
        open={!!reviewing}
        title={reviewing ? `Dispatch report ${reviewing.reportNumber}` : ''}
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
