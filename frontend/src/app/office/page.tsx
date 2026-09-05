'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import {
  paddyEntriesApi, farmsApi, paddyGradesApi, PaddyEntry, Farm, PaddyGrade,
  salesOrdersApi, customersApi, masterDataApi, SalesOrder, Customer, Product, PackagingSize,
  paymentsApi, Payment,
  shipmentsApi, Shipment,
  productionApi, ProductionRecord,
  warehousesApi, Warehouse,
  deliveryOrdersApi, deliveryReportsApi, DeliveryOrder, DeliveryReport,
  systemResetApi, ResetRequest,
  stockTransfersApi, StockTransfer,
  inventoryAdjustmentsApi, InventoryAdjustment,
  ApiError,
} from '@/lib/api-client';

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: 'bg-ink-500/10 text-ink-700',
    SUBMITTED: 'bg-husk-300 text-soil-700',
    APPROVED: 'bg-paddy-700 text-rice-50',
    REJECTED: 'bg-red-100 text-red-700',
    PENDING_VERIFICATION: 'bg-husk-300 text-soil-700',
    VERIFIED: 'bg-paddy-700 text-rice-50',
    FULFILLED: 'bg-paddy-700 text-rice-50',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-ink-500/10 text-ink-700'}`}>{status.replace('_', ' ')}</span>;
}

// ── Farm Manager: quick paddy entry ──────────────────────────────────
function PaddyQuickAction({ accessToken, meId }: { accessToken: string; meId: string }) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  const [recent, setRecent] = useState<PaddyEntry[]>([]);
  const [farmId, setFarmId] = useState('');
  const [autoSelectedFarm, setAutoSelectedFarm] = useState(false);

  // One row per grade — a single intake trip is very often more than
  // one grade at once (e.g. 7 bags of Size 4, 2 bags of Size 5), and
  // forcing two completely separate trips through this form just to
  // record what actually happened as one delivery was the real
  // friction here. Farm/date/moisture/quality/notes are shared across
  // every row since they describe the same intake; grade, bags, and
  // weight are the only things that vary per row.
  const [rows, setRows] = useState([{ paddyGradeId: '', bagCount: '', weightKg: '' }]);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [moisturePercent, setMoisturePercent] = useState('');
  const [qualityGrade, setQualityGrade] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = () => {
    farmsApi.list(accessToken).then((list) => {
      setFarms(list);
      // A Farm Manager only ever has one farm to log against — no
      // reason to make them pick it every single time. If there's
      // genuinely only one farm in the list they can see at all
      // (server-side scoping already guarantees that for this role),
      // it's selected automatically and the dropdown is hidden.
      if (list.length === 1) {
        setFarmId(list[0].id);
        setAutoSelectedFarm(true);
      }
    }).catch(() => {});
    paddyGradesApi.list(accessToken).then(setGrades).catch(() => {});
    paddyEntriesApi.list(accessToken).then((entries) => setRecent(entries.slice(0, 5))).catch(() => {});
  };
  useEffect(load, [accessToken]);

  const updateRow = (index: number, field: 'paddyGradeId' | 'bagCount' | 'weightKg', value: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };
  const addRow = () => setRows((prev) => [...prev, { paddyGradeId: '', bagCount: '', weightKg: '' }]);
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  const validRows = rows.filter((r) => r.paddyGradeId && r.bagCount);
  const totalBags = validRows.reduce((sum, r) => sum + (parseInt(r.bagCount, 10) || 0), 0);

  const onSubmit = async () => {
    if (!farmId || validRows.length === 0) return;
    setSubmitting(true);
    setFormError(null);
    try {
      // Each grade becomes its own real PaddyEntry — every grade keeps
      // its own independent approval status this way (a Farm Supervisor
      // can approve the Size 4 bags while querying the Size 5 ones,
      // rather than one combined record forcing an all-or-nothing
      // decision), while the form itself presents it as one intake.
      for (const row of validRows) {
        await paddyEntriesApi.create(accessToken, {
          farmId, paddyGradeId: row.paddyGradeId,
          weightKg: row.weightKg ? parseFloat(row.weightKg) : undefined,
          bagCount: parseInt(row.bagCount, 10),
          moisturePercent: moisturePercent ? parseFloat(moisturePercent) : undefined,
          qualityGrade: qualityGrade || undefined,
          notes: notes || undefined,
          entryDate: new Date().toISOString().slice(0, 10),
        });
      }
      setRows([{ paddyGradeId: '', bagCount: '', weightKg: '' }]);
      setMoisturePercent(''); setQualityGrade(''); setNotes('');
      setSuccess(validRows.length > 1 ? `${validRows.length} grade entries logged ✓` : 'Logged ✓');
      setTimeout(() => setSuccess(null), 3000);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to log entry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">🌾 Log paddy intake</h2>
      <p className="mt-1 text-sm text-ink-500">Your primary task — logged here goes straight to your Farm Supervisor for approval.</p>

      {!autoSelectedFarm && (
        <select value={farmId} onChange={(e) => setFarmId(e.target.value)} className="mt-4 rounded-lg border border-paddy-100 px-3 py-2 text-sm">
          <option value="">Farm…</option>
          {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      )}

      <div className="mt-4 space-y-3">
        {rows.map((row, index) => {
          const otherSelected = rows.filter((_, i) => i !== index).map((r) => r.paddyGradeId);
          return (
            <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <select value={row.paddyGradeId} onChange={(e) => updateRow(index, 'paddyGradeId', e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                <option value="">Paddy grade…</option>
                {grades.filter((g) => !otherSelected.includes(g.id) || g.id === row.paddyGradeId).map((g) => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </select>
              <input type="number" value={row.bagCount} onChange={(e) => updateRow(index, 'bagCount', e.target.value)} placeholder="Bag count (required)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              <input type="number" value={row.weightKg} onChange={(e) => updateRow(index, 'weightKg', e.target.value)} placeholder="Weight KG (optional)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              {rows.length > 1 && (
                <button type="button" onClick={() => removeRow(index)} className="rounded-lg border border-red-200 px-2 text-sm text-red-600 hover:bg-red-50">
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" onClick={addRow} className="mt-2 text-xs font-medium text-paddy-700 underline">
        + Add another grade (e.g. Size 4 and Size 5 in the same intake)
      </button>
      {!rows.some((r) => r.weightKg) && (
        <p className="mt-1 text-xs text-ink-500">No scale? Leave weight blank on any row — it will be estimated from bag count.</p>
      )}
      {totalBags > 0 && <p className="mt-1 text-xs font-medium text-paddy-700">{totalBags} bags total across {validRows.length} grade{validRows.length === 1 ? '' : 's'}</p>}

      <button type="button" onClick={() => setShowMoreDetails((v) => !v)} className="mt-3 text-xs font-medium text-paddy-700 underline">
        {showMoreDetails ? 'Hide extra details' : '+ Add moisture, quality grade, or a note (helps your Farm Supervisor review faster)'}
      </button>
      {showMoreDetails && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="number" value={moisturePercent} onChange={(e) => setMoisturePercent(e.target.value)} placeholder="Moisture % (optional)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          <input value={qualityGrade} onChange={(e) => setQualityGrade(e.target.value)} placeholder="Quality grade (optional)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="sm:col-span-2 rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
        </div>
      )}

      {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      {success && <p className="mt-2 text-sm font-medium text-paddy-700">{success}</p>}
      <button type="button" onClick={onSubmit} disabled={submitting || !farmId || validRows.length === 0} className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
        {submitting ? 'Logging…' : validRows.length > 1 ? `Log ${validRows.length} entries` : 'Log entry'}
      </button>

      {recent.length > 0 && (
        <div className="mt-5 border-t border-paddy-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Your recent entries</p>
          <div className="space-y-1.5">
            {recent.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs">
                <span className="text-ink-700">
                  {e.bagCount.toLocaleString()} bags
                  {' · '}
                  {e.weightKg.toLocaleString()} KG{e.weightEstimated ? ' (estimated)' : ''}
                  {' · '}
                  {new Date(e.entryDate).toLocaleDateString()}
                </span>
                <StatusPill status={e.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Farm Manager: create a delivery order, then submit its advanced
// report — driver, vehicle, labour, transport, and other costs. ──────
function DeliveryQuickAction({ accessToken }: { accessToken: string }) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [reports, setReports] = useState<DeliveryReport[]>([]);
  const [farmId, setFarmId] = useState('');
  const [autoSelectedFarm, setAutoSelectedFarm] = useState(false);

  const [mode, setMode] = useState<'order' | 'report'>('order');

  // New order
  const [warehouseId, setWarehouseId] = useState('');
  const [orderGradeId, setOrderGradeId] = useState('');
  const [bagCount, setBagCount] = useState('');
  const [totalKg, setTotalKg] = useState('');
  const [creatingOrder, setCreatingOrder] = useState(false);

  // Report against an order
  const [deliveryOrderId, setDeliveryOrderId] = useState('');
  const [actualBagCount, setActualBagCount] = useState('');
  const [actualKg, setActualKg] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehiclePlateNumber, setVehiclePlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [labourCost, setLabourCost] = useState('');
  const [numberOfLabourers, setNumberOfLabourers] = useState('');
  const [transportationFee, setTransportationFee] = useState('');
  const [otherCosts, setOtherCosts] = useState('');
  const [otherCostsDescription, setOtherCostsDescription] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = () => {
    farmsApi.list(accessToken).then((list) => {
      setFarms(list);
      if (list.length === 1) { setFarmId(list[0].id); setAutoSelectedFarm(true); }
    }).catch(() => {});
    warehousesApi.list(accessToken).then(setWarehouses).catch(() => {});
    paddyGradesApi.list(accessToken).then(setGrades).catch(() => {});
    deliveryOrdersApi.list(accessToken).then((list) => setOrders(list.slice(0, 10))).catch(() => {});
    deliveryReportsApi.list(accessToken).then((list) => setReports(list.slice(0, 5))).catch(() => {});
  };
  useEffect(load, [accessToken]);

  // Orders that don't already have a report submitted against them —
  // the only sensible ones to pick from when logging a report.
  const reportedOrderIds = new Set(reports.map((r) => r.deliveryOrderId));
  const openOrders = orders.filter((o) => !reportedOrderIds.has(o.id));

  const onCreateOrder = async () => {
    if (!farmId || !warehouseId || !orderGradeId || !bagCount || !totalKg) return;
    setCreatingOrder(true);
    setFormError(null);
    try {
      await deliveryOrdersApi.create(accessToken, {
        farmId, destinationWarehouseId: warehouseId, paddyGradeId: orderGradeId,
        bagCount: parseInt(bagCount, 10), totalKg: parseFloat(totalKg),
        requestedDate: new Date().toISOString().slice(0, 10),
      });
      setBagCount(''); setTotalKg('');
      setSuccess('Delivery order created \u2713');
      setTimeout(() => setSuccess(null), 3000);
      load();
      setMode('report');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create order.');
    } finally {
      setCreatingOrder(false);
    }
  };

  const onSubmitReport = async () => {
    if (!deliveryOrderId || !actualBagCount || !actualKg) return;
    setSubmittingReport(true);
    setFormError(null);
    try {
      await deliveryReportsApi.create(accessToken, {
        deliveryOrderId,
        actualBagCount: parseInt(actualBagCount, 10),
        actualKg: parseFloat(actualKg),
        driverName: driverName || undefined,
        driverPhone: driverPhone || undefined,
        vehiclePlateNumber: vehiclePlateNumber || undefined,
        vehicleType: vehicleType || undefined,
        labourCost: labourCost ? parseFloat(labourCost) : undefined,
        numberOfLabourers: numberOfLabourers ? parseInt(numberOfLabourers, 10) : undefined,
        transportationFee: transportationFee ? parseFloat(transportationFee) : undefined,
        otherCosts: otherCosts ? parseFloat(otherCosts) : undefined,
        otherCostsDescription: otherCostsDescription || undefined,
        departureDate: new Date().toISOString().slice(0, 10),
      });
      setActualBagCount(''); setActualKg(''); setDriverName(''); setDriverPhone('');
      setVehiclePlateNumber(''); setVehicleType(''); setLabourCost(''); setNumberOfLabourers('');
      setTransportationFee(''); setOtherCosts(''); setOtherCostsDescription(''); setDeliveryOrderId('');
      setSuccess('Delivery report submitted \u2713');
      setTimeout(() => setSuccess(null), 3000);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to submit report.');
    } finally {
      setSubmittingReport(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">\ud83d\ude9b Deliveries</h2>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setMode('order')} className={`rounded-full px-4 py-1.5 text-xs font-medium ${mode === 'order' ? 'bg-paddy-900 text-rice-50' : 'bg-white text-ink-700'}`}>
          1. Create order
        </button>
        <button type="button" onClick={() => setMode('report')} className={`rounded-full px-4 py-1.5 text-xs font-medium ${mode === 'report' ? 'bg-paddy-900 text-rice-50' : 'bg-white text-ink-700'}`}>
          2. Submit report ({openOrders.length} open)
        </button>
      </div>

      {mode === 'order' ? (
        <div className="mt-4">
          <p className="text-sm text-ink-500">Request a delivery of paddy from your farm to a warehouse.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {!autoSelectedFarm && (
              <select value={farmId} onChange={(e) => setFarmId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                <option value="">Farm\u2026</option>
                {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
              <option value="">Destination warehouse\u2026</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <select value={orderGradeId} onChange={(e) => setOrderGradeId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
              <option value="">Paddy grade\u2026</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
            <input type="number" value={bagCount} onChange={(e) => setBagCount(e.target.value)} placeholder="Bag count" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input type="number" value={totalKg} onChange={(e) => setTotalKg(e.target.value)} placeholder="Total KG" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          </div>
          <button type="button" onClick={onCreateOrder} disabled={creatingOrder || !farmId || !warehouseId || !orderGradeId || !bagCount || !totalKg} className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
            {creatingOrder ? 'Creating\u2026' : 'Create order'}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-ink-500">Log what actually happened \u2014 driver, vehicle, and every cost, once the paddy is on its way.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <select value={deliveryOrderId} onChange={(e) => setDeliveryOrderId(e.target.value)} className="sm:col-span-2 rounded-lg border border-paddy-100 px-3 py-2 text-sm">
              <option value="">Which order is this for?\u2026</option>
              {openOrders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber} \u2014 {o.destinationWarehouse.name} ({o.bagCount} bags)</option>)}
            </select>
            <input type="number" value={actualBagCount} onChange={(e) => setActualBagCount(e.target.value)} placeholder="Actual bags loaded" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input type="number" value={actualKg} onChange={(e) => setActualKg(e.target.value)} placeholder="Actual KG" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Driver name" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="Driver phone" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input value={vehiclePlateNumber} onChange={(e) => setVehiclePlateNumber(e.target.value)} placeholder="Vehicle plate number" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} placeholder="Vehicle type (e.g. truck)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input type="number" value={labourCost} onChange={(e) => setLabourCost(e.target.value)} placeholder="Labour cost (GHS)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input type="number" value={numberOfLabourers} onChange={(e) => setNumberOfLabourers(e.target.value)} placeholder="Number of labourers" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input type="number" value={transportationFee} onChange={(e) => setTransportationFee(e.target.value)} placeholder="Transportation fee (GHS)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input type="number" value={otherCosts} onChange={(e) => setOtherCosts(e.target.value)} placeholder="Other costs (GHS)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input value={otherCostsDescription} onChange={(e) => setOtherCostsDescription(e.target.value)} placeholder="What were the other costs for?" className="sm:col-span-2 rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          </div>
          <button type="button" onClick={onSubmitReport} disabled={submittingReport || !deliveryOrderId || !actualBagCount || !actualKg} className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
            {submittingReport ? 'Submitting\u2026' : 'Submit report'}
          </button>
        </div>
      )}

      {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      {success && <p className="mt-2 text-sm font-medium text-paddy-700">{success}</p>}

      {reports.length > 0 && (
        <div className="mt-5 border-t border-paddy-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Recent delivery reports</p>
          <div className="space-y-1.5">
            {reports.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs">
                <span className="text-ink-700">{r.reportNumber} \u00b7 GHS {r.totalDeliveryCost.toLocaleString()} total cost</span>
                <StatusPill status={r.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sales Officer: quick single-item order ───────────────────────────
function SalesQuickAction({ accessToken }: { accessToken: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sizes, setSizes] = useState<PackagingSize[]>([]);
  const [recent, setRecent] = useState<SalesOrder[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [packagingSizeId, setPackagingSizeId] = useState('');
  const [bagCount, setBagCount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = () => {
    customersApi.list(accessToken).then(setCustomers).catch(() => {});
    masterDataApi.products(accessToken).then(setProducts).catch(() => {});
    masterDataApi.packagingSizes(accessToken).then(setSizes).catch(() => {});
    salesOrdersApi.list(accessToken).then((orders) => setRecent(orders.slice(0, 5))).catch(() => {});
  };
  useEffect(load, [accessToken]);

  const onSubmit = async () => {
    if (!customerId || !productId || !packagingSizeId || !bagCount) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await salesOrdersApi.create(accessToken, {
        customerId,
        items: [{ productId, packagingSizeId, bagCount: parseInt(bagCount, 10) }],
      });
      setBagCount('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">💰 Quick order</h2>
      <p className="mt-1 text-sm text-ink-500">One product, one size — for a multi-item order, use the full Sales page.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
          <option value="">Customer…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={productId} onChange={(e) => setProductId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
          <option value="">Product…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={packagingSizeId} onChange={(e) => setPackagingSizeId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
          <option value="">Bag size…</option>
          {sizes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <input type="number" value={bagCount} onChange={(e) => setBagCount(e.target.value)} placeholder="Bag count" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
      </div>
      {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      {success && <p className="mt-2 text-sm font-medium text-paddy-700">Order created ✓</p>}
      <button type="button" onClick={onSubmit} disabled={submitting || !customerId || !productId || !packagingSizeId || !bagCount} className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
        {submitting ? 'Creating…' : 'Create order'}
      </button>

      {recent.length > 0 && (
        <div className="mt-5 border-t border-paddy-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Your recent orders</p>
          <div className="space-y-1.5">
            {recent.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs">
                <span className="text-ink-700">{o.orderNumber} · GHS {o.totalAmount.toLocaleString()}</span>
                <StatusPill status={o.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Finance Officer: quick payment ───────────────────────────────────
function PaymentQuickAction({ accessToken }: { accessToken: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recent, setRecent] = useState<Payment[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = () => {
    customersApi.list(accessToken).then(setCustomers).catch(() => {});
    paymentsApi.list(accessToken).then((p) => setRecent(p.slice(0, 5))).catch(() => {});
  };
  useEffect(load, [accessToken]);

  const onSubmit = async () => {
    if (!customerId || !amount) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await paymentsApi.create(accessToken, { customerId, amount: parseFloat(amount), method, paymentDate: new Date().toISOString().slice(0, 10) });
      setAmount('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">💳 Record a payment</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
          <option value="">Customer…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (GHS)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="BANK_DEPOSIT">Bank deposit</option>
          <option value="OTHER_APPROVED_METHOD">Other approved method</option>
        </select>
      </div>
      {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      {success && <p className="mt-2 text-sm font-medium text-paddy-700">Payment recorded ✓</p>}
      <button type="button" onClick={onSubmit} disabled={submitting || !customerId || !amount} className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
        {submitting ? 'Recording…' : 'Record payment'}
      </button>

      {recent.length > 0 && (
        <div className="mt-5 border-t border-paddy-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Recent payments</p>
          <div className="space-y-1.5">
            {recent.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs">
                <span className="text-ink-700">{p.paymentNumber} · GHS {p.amount.toLocaleString()}</span>
                <StatusPill status={p.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Warehouse Manager: receive a shipment ────────────────────────────
function ShipmentQuickAction({ accessToken }: { accessToken: string }) {
  const [inTransit, setInTransit] = useState<Shipment[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [receivedKg, setReceivedKg] = useState('');
  const [receivedBags, setReceivedBags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = () => {
    shipmentsApi.list(accessToken, undefined, true).then(setInTransit).catch(() => {});
  };
  useEffect(load, [accessToken]);

  const selected = inTransit.find((s) => s.id === selectedId);

  const onSubmit = async () => {
    if (!selectedId || !receivedKg || !receivedBags) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await shipmentsApi.receive(accessToken, selectedId, parseFloat(receivedKg), parseInt(receivedBags, 10));
      setSelectedId(''); setReceivedKg(''); setReceivedBags('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to receive shipment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">🚚 Receive a shipment</h2>
      <p className="mt-1 text-sm text-ink-500">{inTransit.length} shipment{inTransit.length === 1 ? '' : 's'} currently in transit to you.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); const s = inTransit.find((x) => x.id === e.target.value); if (s) { setReceivedKg(String(s.expectedKg)); setReceivedBags(String(s.expectedBags)); } }} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
          <option value="">Select shipment…</option>
          {inTransit.map((s) => <option key={s.id} value={s.id}>{s.shipmentNumber} — {s.farm.name}</option>)}
        </select>
        <input type="number" value={receivedKg} onChange={(e) => setReceivedKg(e.target.value)} placeholder="Received (KG)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
        <input type="number" value={receivedBags} onChange={(e) => setReceivedBags(e.target.value)} placeholder="Received (bags)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
      </div>
      {selected && <p className="mt-2 text-xs text-ink-500">Expected: {selected.expectedKg.toLocaleString()} KG / {selected.expectedBags} bags</p>}
      {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      {success && <p className="mt-2 text-sm font-medium text-paddy-700">Shipment received ✓</p>}
      <button type="button" onClick={onSubmit} disabled={submitting || !selectedId || !receivedKg || !receivedBags} className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
        {submitting ? 'Receiving…' : 'Confirm receipt'}
      </button>
    </div>
  );
}

// ── Approval-queue roles: Farm Supervisor / Warehouse Supervisor / Operations Manager / Finance Director ──
function ApprovalQueue({
  accessToken, title, icon, items, onApprove, onReject, renderLabel,
}: {
  accessToken: string; title: string; icon: string;
  items: { id: string; label: string }[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  renderLabel?: never;
}) {
  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">{icon} {title}</h2>
      <p className="mt-1 text-sm text-ink-500">{items.length} awaiting your decision.</p>
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-lg bg-white px-4 py-2.5 text-sm">
            <span className="text-ink-900">{item.label}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => onApprove(item.id)} className="rounded-full bg-paddy-900 px-3 py-1 text-xs font-medium text-rice-50">Approve</button>
              <button type="button" onClick={() => onReject(item.id)} className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50">Reject</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-ink-500">Nothing waiting — you&rsquo;re caught up.</p>}
      </div>
    </div>
  );
}

function PaddyApprovalQueue({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<PaddyEntry[]>([]);
  const load = () => { paddyEntriesApi.list(accessToken, undefined, 'SUBMITTED').then(setItems).catch(() => {}); };
  useEffect(load, [accessToken]);
  return (
    <ApprovalQueue
      accessToken={accessToken} title="Paddy entries" icon="🌾"
      items={items.map((e) => ({ id: e.id, label: `${e.weightKg.toLocaleString()} KG — ${new Date(e.entryDate).toLocaleDateString()}` }))}
      onApprove={async (id) => { await paddyEntriesApi.approve(accessToken, id); load(); }}
      onReject={async (id) => { await paddyEntriesApi.reject(accessToken, id, 'Reviewed and rejected from My Office.'); load(); }}
    />
  );
}

function SalesApprovalQueue({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<SalesOrder[]>([]);
  const load = () => { salesOrdersApi.list(accessToken, 'SUBMITTED').then(setItems).catch(() => {}); };
  useEffect(load, [accessToken]);
  return (
    <ApprovalQueue
      accessToken={accessToken} title="Sales orders" icon="💰"
      items={items.map((o) => ({ id: o.id, label: `${o.orderNumber} — GHS ${o.totalAmount.toLocaleString()}` }))}
      onApprove={async (id) => { await salesOrdersApi.approve(accessToken, id); load(); }}
      onReject={async (id) => { await salesOrdersApi.reject(accessToken, id, 'Reviewed and rejected from My Office.'); load(); }}
    />
  );
}

function PaymentVerificationQueue({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<Payment[]>([]);
  const load = () => { paymentsApi.list(accessToken, 'PENDING_VERIFICATION').then(setItems).catch(() => {}); };
  useEffect(load, [accessToken]);
  return (
    <ApprovalQueue
      accessToken={accessToken} title="Payments to verify" icon="💳"
      items={items.map((p) => ({ id: p.id, label: `${p.paymentNumber} — GHS ${p.amount.toLocaleString()}` }))}
      onApprove={async (id) => { await paymentsApi.verify(accessToken, id); load(); }}
      onReject={async (id) => { await paymentsApi.reject(accessToken, id, 'Reviewed and rejected from My Office.'); load(); }}
    />
  );
}

function ProductionApprovalQueue({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<ProductionRecord[]>([]);
  const load = () => { productionApi.list(accessToken, 'SUBMITTED').then(setItems).catch(() => {}); };
  useEffect(load, [accessToken]);
  return (
    <ApprovalQueue
      accessToken={accessToken} title="Production records" icon="🏭"
      items={items.map((r) => ({ id: r.id, label: `${r.recordNumber} — ${r.recoveryPercent.toFixed(1)}% recovery` }))}
      onApprove={async (id) => { await productionApi.approve(accessToken, id); load(); }}
      onReject={async (id) => { await productionApi.reject(accessToken, id, 'Reviewed and rejected from My Office.'); load(); }}
    />
  );
}

/** Reset requests need dual sign-off (Finance Director AND MD) before
 * Admin can execute — a plain approve/reject queue would be wrong here,
 * since one click shouldn't imply the whole thing is settled. Shows
 * both approval slots so it's clear whose sign-off is still pending,
 * and the "Approve" button only records this specific approver's own
 * decision. */
// ── Warehouse Supervisor: dispatch a transfer between two warehouses
// they oversee, then receive it at the destination \u2014 the same real
// two-step shape Section 23 of the spec describes, not a single number
// silently changing in two places. ────────────────────────────────────
// ── Farm Supervisor / Warehouse Supervisor / Operations Manager: real
// inventory correction requests, never a raw number typed over the
// existing balance \u2014 Section 24's exact requirement. ────────────────
// ── Farm Manager / Warehouse Manager: request a correction for their
// own location \u2014 never applied until an actual supervisor approves it.
function InventoryAdjustmentRequestAction({ accessToken, meId }: { accessToken: string; meId: string }) {
  const [myFarmId, setMyFarmId] = useState('');
  const [myWarehouseId, setMyWarehouseId] = useState('');
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sizes, setSizes] = useState<PackagingSize[]>([]);
  const [recent, setRecent] = useState<InventoryAdjustment[]>([]);

  const [paddyGradeId, setPaddyGradeId] = useState('');
  const [productId, setProductId] = useState('');
  const [packagingSizeId, setPackagingSizeId] = useState('');
  const [adjustmentKg, setAdjustmentKg] = useState('');
  const [adjustmentBags, setAdjustmentBags] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = () => {
    farmsApi.list(accessToken).then((list) => { if (list.length === 1) setMyFarmId(list[0].id); }).catch(() => {});
    warehousesApi.list(accessToken).then((list) => { if (list.length === 1) setMyWarehouseId(list[0].id); }).catch(() => {});
    paddyGradesApi.list(accessToken).then(setGrades).catch(() => {});
    masterDataApi.products(accessToken).then(setProducts).catch(() => {});
    masterDataApi.packagingSizes(accessToken).then(setSizes).catch(() => {});
    inventoryAdjustmentsApi.list(accessToken).then((list) => setRecent(list.slice(0, 5))).catch(() => {});
  };
  useEffect(load, [accessToken]);

  const isFarm = !!myFarmId;
  const locationId = myFarmId || myWarehouseId;

  const onSubmit = async () => {
    if (!locationId || !adjustmentKg || !adjustmentBags || !reason.trim()) return;
    if (isFarm && !paddyGradeId) return;
    if (!isFarm && (!productId || !packagingSizeId)) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await inventoryAdjustmentsApi.create(accessToken, {
        locationType: isFarm ? 'FARM' : 'WAREHOUSE',
        locationId,
        paddyGradeId: isFarm ? paddyGradeId : undefined,
        productId: isFarm ? undefined : productId,
        packagingSizeId: isFarm ? undefined : packagingSizeId,
        adjustmentKg: parseFloat(adjustmentKg),
        adjustmentBags: parseInt(adjustmentBags, 10),
        reason: reason.trim(),
      });
      setAdjustmentKg(''); setAdjustmentBags(''); setReason('');
      setSuccess('Correction requested \u2713 \u2014 awaiting your supervisor\u2019s approval.');
      setTimeout(() => setSuccess(null), 4000);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!locationId) return null;

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">\ud83d\udcdd Request a stock correction</h2>
      <p className="mt-1 text-sm text-ink-500">
        Physical count doesn&rsquo;t match the system? Request a correction \u2014 it only takes effect once your supervisor approves it, never immediately.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {isFarm ? (
          <select value={paddyGradeId} onChange={(e) => setPaddyGradeId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
            <option value="">Paddy grade\u2026</option>
            {grades.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        ) : (
          <>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
              <option value="">Product\u2026</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={packagingSizeId} onChange={(e) => setPackagingSizeId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
              <option value="">Bag size\u2026</option>
              {sizes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </>
        )}
        <input type="number" value={adjustmentKg} onChange={(e) => setAdjustmentKg(e.target.value)} placeholder="KG adjustment (negative for shortage)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
        <input type="number" value={adjustmentBags} onChange={(e) => setAdjustmentBags(e.target.value)} placeholder="Bag adjustment (negative for shortage)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required) \u2014 e.g. physical count variance" rows={2} className="sm:col-span-2 rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
      </div>
      {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      {success && <p className="mt-2 text-sm font-medium text-paddy-700">{success}</p>}
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting || !adjustmentKg || !adjustmentBags || !reason.trim() || (isFarm ? !paddyGradeId : !productId || !packagingSizeId)}
        className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50"
      >
        {submitting ? 'Submitting\u2026' : 'Request correction'}
      </button>

      {recent.length > 0 && (
        <div className="mt-5 border-t border-paddy-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Your recent requests</p>
          <div className="space-y-1.5">
            {recent.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs">
                <span className="text-ink-700">{a.adjustmentNumber} \u00b7 {a.adjustmentKg > 0 ? '+' : ''}{a.adjustmentKg.toLocaleString()} KG</span>
                <StatusPill status={a.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InventoryAdjustmentQueue({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<InventoryAdjustment[]>([]);
  const load = () => {
    inventoryAdjustmentsApi.list(accessToken, 'PENDING').then(setItems).catch(() => {});
  };
  useEffect(load, [accessToken]);

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">\ud83d\udcdd Inventory correction requests</h2>
      <p className="mt-1 text-sm text-ink-500">{items.length} pending \u2014 a physical-count variance someone flagged, not yet applied to the ledger.</p>
      <div className="mt-4 space-y-3">
        {items.map((a) => (
          <div key={a.id} className="rounded-lg bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs text-ink-500">{a.adjustmentNumber}</p>
                <p className="font-medium text-ink-900">{a.paddyGrade?.label ?? `${a.product?.name ?? ''} (${a.packagingSize?.label ?? ''})`}</p>
                <p className="text-sm text-ink-500">{a.reason}</p>
                <p className="mt-1 text-xs text-ink-500">
                  System shows {a.systemQuantityKg.toLocaleString()} KG / {a.systemBagCount} bags \u2014 requesting {a.adjustmentKg > 0 ? '+' : ''}{a.adjustmentKg.toLocaleString()} KG / {a.adjustmentBags > 0 ? '+' : ''}{a.adjustmentBags} bags
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={async () => { await inventoryAdjustmentsApi.approve(accessToken, a.id); load(); }} className="rounded-full bg-paddy-900 px-3 py-1 text-xs font-medium text-rice-50">
                  Approve
                </button>
                <button type="button" onClick={async () => { await inventoryAdjustmentsApi.reject(accessToken, a.id, 'Reviewed and rejected from My Office.'); load(); }} className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-ink-500">Nothing waiting \u2014 you&rsquo;re caught up.</p>}
      </div>
    </div>
  );
}

function StockTransferQuickAction({ accessToken }: { accessToken: string }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sizes, setSizes] = useState<PackagingSize[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [mode, setMode] = useState<'dispatch' | 'receive'>('dispatch');

  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destWarehouseId, setDestWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [packagingSizeId, setPackagingSizeId] = useState('');
  const [bagCount, setBagCount] = useState('');
  const [totalKg, setTotalKg] = useState('');
  const [reason, setReason] = useState('');
  const [dispatching, setDispatching] = useState(false);

  const [receivingId, setReceivingId] = useState('');
  const [receivedBagCount, setReceivedBagCount] = useState('');
  const [receivedKg, setReceivedKg] = useState('');
  const [receiving, setReceiving] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = () => {
    warehousesApi.list(accessToken).then(setWarehouses).catch(() => {});
    masterDataApi.products(accessToken).then(setProducts).catch(() => {});
    masterDataApi.packagingSizes(accessToken).then(setSizes).catch(() => {});
    stockTransfersApi.list(accessToken).then(setTransfers).catch(() => {});
  };
  useEffect(load, [accessToken]);

  const pendingReceipt = transfers.filter((t) => t.status === 'DISPATCHED');

  const onDispatch = async () => {
    if (!sourceWarehouseId || !destWarehouseId || !productId || !packagingSizeId || !bagCount || !totalKg) return;
    setDispatching(true);
    setFormError(null);
    try {
      await stockTransfersApi.create(accessToken, {
        sourceWarehouseId, destWarehouseId, productId, packagingSizeId,
        bagCount: parseInt(bagCount, 10), totalKg: parseFloat(totalKg),
        reason: reason || undefined,
      });
      setBagCount(''); setTotalKg(''); setReason('');
      setSuccess('Transfer dispatched \u2713');
      setTimeout(() => setSuccess(null), 3000);
      load();
      setMode('receive');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to dispatch transfer.');
    } finally {
      setDispatching(false);
    }
  };

  const onReceive = async () => {
    if (!receivingId || !receivedBagCount || !receivedKg) return;
    setReceiving(true);
    setFormError(null);
    try {
      await stockTransfersApi.receive(accessToken, receivingId, parseInt(receivedBagCount, 10), parseFloat(receivedKg));
      setReceivingId(''); setReceivedBagCount(''); setReceivedKg('');
      setSuccess('Transfer received \u2713');
      setTimeout(() => setSuccess(null), 3000);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to receive transfer.');
    } finally {
      setReceiving(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">\ud83d\udd04 Stock transfers</h2>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setMode('dispatch')} className={`rounded-full px-4 py-1.5 text-xs font-medium ${mode === 'dispatch' ? 'bg-paddy-900 text-rice-50' : 'bg-white text-ink-700'}`}>
          1. Dispatch
        </button>
        <button type="button" onClick={() => setMode('receive')} className={`rounded-full px-4 py-1.5 text-xs font-medium ${mode === 'receive' ? 'bg-paddy-900 text-rice-50' : 'bg-white text-ink-700'}`}>
          2. Receive ({pendingReceipt.length} pending)
        </button>
      </div>

      {mode === 'dispatch' ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <select value={sourceWarehouseId} onChange={(e) => setSourceWarehouseId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
            <option value="">From warehouse\u2026</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select value={destWarehouseId} onChange={(e) => setDestWarehouseId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
            <option value="">To warehouse\u2026</option>
            {warehouses.filter((w) => w.id !== sourceWarehouseId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
            <option value="">Product\u2026</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={packagingSizeId} onChange={(e) => setPackagingSizeId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
            <option value="">Bag size\u2026</option>
            {sizes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <input type="number" value={bagCount} onChange={(e) => setBagCount(e.target.value)} placeholder="Bag count" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          <input type="number" value={totalKg} onChange={(e) => setTotalKg(e.target.value)} placeholder="Total KG" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="sm:col-span-2 rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          <button type="button" onClick={onDispatch} disabled={dispatching || !sourceWarehouseId || !destWarehouseId || !productId || !packagingSizeId || !bagCount || !totalKg} className="sm:col-span-2 mt-1 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
            {dispatching ? 'Dispatching\u2026' : 'Dispatch transfer'}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <select value={receivingId} onChange={(e) => setReceivingId(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm">
            <option value="">Which transfer arrived?\u2026</option>
            {pendingReceipt.map((t) => (
              <option key={t.id} value={t.id}>{t.transferNumber} \u2014 {t.product.name} ({t.packagingSize.label}) from {t.sourceWarehouse.name}, {t.bagCount} bags expected</option>
            ))}
          </select>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="number" value={receivedBagCount} onChange={(e) => setReceivedBagCount(e.target.value)} placeholder="Bags actually received" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input type="number" value={receivedKg} onChange={(e) => setReceivedKg(e.target.value)} placeholder="KG actually received" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          </div>
          <button type="button" onClick={onReceive} disabled={receiving || !receivingId || !receivedBagCount || !receivedKg} className="mt-3 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
            {receiving ? 'Recording\u2026' : 'Confirm receipt'}
          </button>
        </div>
      )}

      {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      {success && <p className="mt-2 text-sm font-medium text-paddy-700">{success}</p>}

      {transfers.length > 0 && (
        <div className="mt-5 border-t border-paddy-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Recent transfers</p>
          <div className="space-y-1.5">
            {transfers.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs">
                <span className="text-ink-700">{t.transferNumber} \u00b7 {t.sourceWarehouse.name} \u2192 {t.destWarehouse.name}</span>
                <StatusPill status={t.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResetApprovalQueue({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<ResetRequest[]>([]);
  const load = () => {
    systemResetApi.list(accessToken).then((all) => setItems(all.filter((r) => !['APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED'].includes(r.status)))).catch(() => {});
  };
  useEffect(load, [accessToken]);

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">🔒 System reset requests</h2>
      <p className="mt-1 text-sm text-ink-500">{items.length} awaiting sign-off — needs both Finance Director and MD before Admin can execute.</p>
      <div className="mt-4 space-y-3">
        {items.map((req) => (
          <div key={req.id} className="rounded-lg bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs text-ink-500">{req.requestNumber}</p>
                <p className="font-medium text-ink-900">{req.scope}</p>
                <p className="text-sm text-ink-500">{req.reason}</p>
              </div>
              <button
                type="button"
                onClick={async () => { await systemResetApi.approve(accessToken, req.id); load(); }}
                className="rounded-full bg-paddy-900 px-3 py-1 text-xs font-medium text-rice-50"
              >
                Approve
              </button>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-ink-500">
              <span>Finance: {req.financeApprovedBy ? `✓ ${req.financeApprovedBy.firstName}` : 'Pending'}</span>
              <span>MD: {req.mdApprovedBy ? `✓ ${req.mdApprovedBy.firstName}` : 'Pending'}</span>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-ink-500">Nothing waiting — you&rsquo;re caught up.</p>}
      </div>
    </div>
  );
}

export default function MyOfficePage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me || !accessToken) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  const sections: React.ReactNode[] = [];
  if (hasPermission('paddy.create')) sections.push(<PaddyQuickAction key="paddy" accessToken={accessToken} meId={me.id} />);
  if (hasPermission('sales.create')) sections.push(<SalesQuickAction key="sales" accessToken={accessToken} />);
  if (hasPermission('payment.create')) sections.push(<PaymentQuickAction key="payment" accessToken={accessToken} />);
  if (hasPermission('warehouse.receive')) sections.push(<ShipmentQuickAction key="shipment" accessToken={accessToken} />);
  if (hasPermission('delivery.create')) sections.push(<DeliveryQuickAction key="delivery" accessToken={accessToken} />);
  if (hasPermission('paddy.approve')) sections.push(<PaddyApprovalQueue key="paddy-approve" accessToken={accessToken} />);
  if (hasPermission('sales.approve')) sections.push(<SalesApprovalQueue key="sales-approve" accessToken={accessToken} />);
  if (hasPermission('payment.verify')) sections.push(<PaymentVerificationQueue key="payment-verify" accessToken={accessToken} />);
  if (hasPermission('production.approve')) sections.push(<ProductionApprovalQueue key="production-approve" accessToken={accessToken} />);
  if (hasPermission('reset.approve')) sections.push(<ResetApprovalQueue key="reset-approve" accessToken={accessToken} />);
  if (hasPermission('warehouse.transfer')) sections.push(<StockTransferQuickAction key="stock-transfer" accessToken={accessToken} />);
  if (hasPermission('farm.inventory.view') || hasPermission('warehouse.inventory.view')) {
    sections.push(<InventoryAdjustmentRequestAction key="inventory-adjust-request" accessToken={accessToken} meId={me.id} />);
  }
  if (hasPermission('inventory.adjust')) sections.push(<InventoryAdjustmentQueue key="inventory-adjust" accessToken={accessToken} />);

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">My Office</h1>
      <p className="mt-1 text-sm text-ink-500">Your primary task, ready to go — no navigating around to find it.</p>

      <div className="mt-6 space-y-6">
        {sections.length > 0 ? sections : (
          <div className="rounded-2xl border border-paddy-100 bg-white p-8 text-center text-sm text-ink-500">
            Your role doesn&rsquo;t have a primary data-entry or approval task — check Overview for company-wide status instead.
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
