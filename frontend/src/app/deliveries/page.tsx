'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import {
  deliveryOrdersApi,
  deliveryReportsApi,
  farmsApi,
  warehousesApi,
  paddyGradesApi,
  DeliveryOrder,
  DeliveryReport,
  Farm,
  Warehouse,
  PaddyGrade,
  ApiError,
} from '@/lib/api-client';

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

const TABS = ['Delivery orders', 'Delivery reports'] as const;

export default function DeliveriesPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Delivery orders');
  const [orders, setOrders] = useState<DeliveryOrder[] | null>(null);
  const [reports, setReports] = useState<DeliveryReport[] | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);

  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [orderFarmId, setOrderFarmId] = useState('');
  const [orderWarehouseId, setOrderWarehouseId] = useState('');
  const [orderGradeId, setOrderGradeId] = useState('');
  const [orderBagCount, setOrderBagCount] = useState('');
  const [orderTotalKg, setOrderTotalKg] = useState('');
  const [creatingOrder, setCreatingOrder] = useState(false);

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

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

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
    warehousesApi.list(accessToken).then(setWarehouses).catch(() => {});
    paddyGradesApi.list(accessToken).then(setGrades).catch(() => {});
  }, [accessToken]);

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

  const onCreateOrder = async () => {
    if (!accessToken || !orderFarmId || !orderWarehouseId || !orderGradeId || !orderBagCount || !orderTotalKg) return;
    setCreatingOrder(true);
    setPageError(null);
    try {
      await deliveryOrdersApi.create(accessToken, {
        farmId: orderFarmId,
        destinationWarehouseId: orderWarehouseId,
        requestedDate: new Date().toISOString().slice(0, 10),
        paddyGradeId: orderGradeId,
        bagCount: parseInt(orderBagCount, 10),
        totalKg: parseFloat(orderTotalKg),
      });
      setShowCreateOrder(false);
      setOrderBagCount('');
      setOrderTotalKg('');
      loadOrders(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to create delivery order.');
    } finally {
      setCreatingOrder(false);
    }
  };

  const onCreateReport = async () => {
    if (!accessToken || !reportingOrderId || !reportBagCount || !reportKg) return;
    setCreatingReport(true);
    setPageError(null);
    try {
      await deliveryReportsApi.create(accessToken, {
        deliveryOrderId: reportingOrderId,
        actualBagCount: parseInt(reportBagCount, 10),
        actualKg: parseFloat(reportKg),
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
      setTab('Delivery reports');
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
      <h1 className="font-display text-2xl font-medium text-paddy-900">Deliveries</h1>
      <p className="mt-1 text-sm text-ink-500">
        A delivery order is the plan; a delivery report is what actually happened — labor, transport, driver,
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

      {tab === 'Delivery orders' && (
        <div className="mt-6">
          {hasPermission('delivery.create') && (
            <button type="button" onClick={() => setShowCreateOrder((v) => !v)} className="mb-4 rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50">
              {showCreateOrder ? 'Cancel' : 'New delivery order'}
            </button>
          )}
          {showCreateOrder && (
            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-husk-300 bg-husk-100/30 p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Farm</label>
                <select value={orderFarmId} onChange={(e) => setOrderFarmId(e.target.value)} className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm">
                  <option value="">Select…</option>
                  {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Destination warehouse</label>
                <select value={orderWarehouseId} onChange={(e) => setOrderWarehouseId(e.target.value)} className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm">
                  <option value="">Select…</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Grade</label>
                <select value={orderGradeId} onChange={(e) => setOrderGradeId(e.target.value)} className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm">
                  <option value="">Select…</option>
                  {grades.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Bags</label>
                <input type="number" value={orderBagCount} onChange={(e) => setOrderBagCount(e.target.value)} className="w-20 rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Total KG</label>
                <input type="number" value={orderTotalKg} onChange={(e) => setOrderTotalKg(e.target.value)} className="w-24 rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
              </div>
              <button type="button" onClick={onCreateOrder} disabled={creatingOrder} className="rounded-full bg-paddy-900 px-4 py-1.5 text-sm font-medium text-rice-50 disabled:opacity-50">
                {creatingOrder ? 'Creating…' : 'Create'}
              </button>
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Farm → Warehouse</th>
                  <th className="px-4 py-3">Bags / KG</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paddy-100">
                {orders?.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-mono text-xs text-ink-700">{o.orderNumber}</td>
                    <td className="px-4 py-3 text-ink-900">{o.farm.name} → {o.destinationWarehouse.name}</td>
                    <td className="px-4 py-3 text-ink-700">{o.bagCount} / {o.totalKg.toLocaleString()} KG</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-husk-300 px-2.5 py-0.5 text-xs font-medium text-soil-700">{o.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {hasPermission('delivery.create') && (
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
              <h3 className="font-display text-lg text-paddy-900">Delivery report</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div><label className="mb-1 block text-xs font-medium text-ink-700">Actual bags</label><input type="number" value={reportBagCount} onChange={(e) => setReportBagCount(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-medium text-ink-700">Actual KG</label><input type="number" value={reportKg} onChange={(e) => setReportKg(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" /></div>
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

      {tab === 'Delivery reports' && (
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
                {r.status === 'SUPERVISOR_REVIEW' && hasPermission('delivery.approve') && (
                  <button type="button" onClick={() => runAction(() => deliveryReportsApi.approve(accessToken!, r.id))} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50">
                    Approve
                  </button>
                )}
                {r.status === 'SUPERVISOR_REVIEW' && hasPermission('delivery.reject') && (
                  rejectingId === r.id ? (
                    <div className="flex items-center gap-2">
                      <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason…" className="rounded-lg border border-paddy-100 px-2 py-1.5 text-xs" />
                      <button
                        type="button"
                        onClick={() => {
                          if (!rejectReason.trim()) return;
                          runAction(() => deliveryReportsApi.reject(accessToken!, r.id, rejectReason));
                          setRejectingId(null);
                          setRejectReason('');
                        }}
                        className="rounded-full border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700"
                      >
                        Confirm reject
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setRejectingId(r.id)} className="rounded-full border border-paddy-100 px-4 py-1.5 text-xs font-medium text-ink-700">
                      Reject
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
          {reports?.length === 0 && <div className="rounded-2xl border border-paddy-100 bg-white p-8 text-center text-sm text-ink-500">No delivery reports yet.</div>}
        </div>
      )}
    </DashboardShell>
  );
}
