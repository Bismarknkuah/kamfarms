'use client';

// Shared, reusable action components - originally defined inline in
// office/page.tsx, extracted here so dedicated single-purpose pages
// (log-paddy-intake, dispatch, stock-correction) can import just one
// each, rather than a Farm Manager always landing on the combined
// My Office page with every section stacked together regardless of
// which one they came to use.

import { useEffect, useState } from 'react';
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
  paddyRequestsApi, PaddyRequest,
  ApiError,
} from '@/lib/api-client';

export function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: 'bg-ink-500/10 text-ink-700',
    SUBMITTED: 'bg-husk-300 text-soil-700',
    APPROVED: 'bg-paddy-700 text-rice-50',
    REJECTED: 'bg-red-100 text-red-700',
    PENDING_VERIFICATION: 'bg-husk-300 text-soil-700',
    VERIFIED: 'bg-paddy-700 text-rice-50',
    FULFILLED: 'bg-paddy-700 text-rice-50',
    PENDING: 'bg-husk-300 text-soil-700',
    ACCEPTED: 'bg-paddy-700 text-rice-50',
    DECLINED: 'bg-red-100 text-red-700',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-ink-500/10 text-ink-700'}`}>{status.replace('_', ' ')}</span>;
}

export function PaddyQuickAction({ accessToken, meId }: { accessToken: string; meId: string }) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  const [recent, setRecent] = useState<PaddyEntry[]>([]);
  const [farmId, setFarmId] = useState('');
  const [autoSelectedFarm, setAutoSelectedFarm] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));

  // One row per grade - a single intake trip is very often more than
  // one grade at once (e.g. 7 bags of Size 4, 2 bags of Size 5), and
  // forcing two completely separate trips through this form just to
  // record what actually happened as one delivery was the real
  // friction here. Farm/date/moisture/quality/notes are shared across
  // every row since they describe the same intake; grade, bags, and
  // weight are the only things that vary per row.
  const [rows, setRows] = useState([{ paddyGradeId: '', bagCount: '', weightKg: '' }]);
  const [moisturePercent, setMoisturePercent] = useState('');
  const [qualityGrade, setQualityGrade] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);

  // Editing an already-submitted, not-yet-approved entry - a genuinely
  // separate flow from logging a new intake, since it targets one
  // existing entry (single grade/weight/bags) rather than a fresh
  // multi-row trip.
  const EDITABLE_ENTRY_STATUSES = ['DRAFT', 'SUBMITTED', 'REJECTED'];
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editGradeId, setEditGradeId] = useState('');
  const [editBagCount, setEditBagCount] = useState('');
  const [editWeightKg, setEditWeightKg] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const load = () => {
    farmsApi.list(accessToken).then((list) => {
      setFarms(list);
      // A Farm Manager only ever has one farm to log against - no
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
      // Each grade becomes its own real PaddyEntry - every grade keeps
      // its own independent approval status this way (a Farm Supervisor
      // can approve the Size 4 bags while querying the Size 5 ones,
      // rather than one combined record forcing an all-or-nothing
      // decision), while the form itself presents it as one intake.
      //
      // A real, confirmed bug fixed here: create() only ever produces a
      // DRAFT entry - a separate submit() call is what actually moves
      // it to SUBMITTED, the only status a Farm Director's approval
      // queue or the inventory ledger ever act on. This call was
      // missing entirely, meaning every entry logged through this form
      // stayed in DRAFT forever - never approved, never added to the
      // farm's inventory balance, which is exactly why a dispatch
      // request against that same farm would see 0 KG available
      // despite paddy having genuinely been "logged."
      for (const row of validRows) {
        const created = await paddyEntriesApi.create(accessToken, {
          farmId, paddyGradeId: row.paddyGradeId,
          weightKg: row.weightKg ? parseFloat(row.weightKg) : undefined,
          bagCount: parseInt(row.bagCount, 10),
          moisturePercent: moisturePercent ? parseFloat(moisturePercent) : undefined,
          qualityGrade: qualityGrade || undefined,
          notes: notes || undefined,
          entryDate,
        });
        await paddyEntriesApi.submit(accessToken, created.id);
      }
      setRows([{ paddyGradeId: '', bagCount: '', weightKg: '' }]);
      setMoisturePercent(''); setQualityGrade(''); setNotes('');
      setSuccess(validRows.length > 1 ? `${validRows.length} grade entries logged ✓` : 'Logged ✓');
      setShowReview(false);
      setTimeout(() => setSuccess(null), 3000);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to log entry.');
    } finally {
      setSubmitting(false);
    }
  };

  const onStartEdit = (e: PaddyEntry) => {
    setEditingEntryId(e.id);
    setEditGradeId(e.paddyGradeId);
    setEditBagCount(String(e.bagCount));
    setEditWeightKg(e.weightEstimated ? '' : String(e.weightKg));
    setEditNotes(e.notes ?? '');
  };

  const onSaveEdit = async (id: string) => {
    setSavingEdit(true);
    setFormError(null);
    try {
      await paddyEntriesApi.update(accessToken, id, {
        paddyGradeId: editGradeId || undefined,
        bagCount: editBagCount ? parseInt(editBagCount, 10) : undefined,
        weightKg: editWeightKg ? parseFloat(editWeightKg) : undefined,
        notes: editNotes || undefined,
      });
      setEditingEntryId(null);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save changes.');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">🌾 Log paddy intake</h2>
      <p className="mt-1 text-sm text-ink-500">Your primary task - logged here goes straight to your Farm Supervisor for approval.</p>

      {!showReview ? (
        <div className="mt-5 space-y-5">
          {/* Step 1 - where and when */}
          <div className="rounded-xl bg-white/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-soil-500">1. Where did this paddy come from?</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {!autoSelectedFarm && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-700">Farm</label>
                  <select value={farmId} onChange={(e) => setFarmId(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                    <option value="">Select a farm…</option>
                    {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Date received</label>
                <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          {/* Step 2 - what's in this intake */}
          <div className="rounded-xl bg-white/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-soil-500">2. What's in this intake?</p>
            <p className="mt-0.5 text-xs text-ink-500">Add one row per size - you can mix Size 4 and Size 5 bags from the same trip.</p>
            <div className="mt-3 space-y-3">
              {rows.map((row, index) => {
                const otherSelected = rows.filter((_, i) => i !== index).map((r) => r.paddyGradeId);
                return (
                  <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                    <div>
                      {index === 0 && <label className="mb-1 block text-xs font-medium text-ink-700">Bag size / grade</label>}
                      <select value={row.paddyGradeId} onChange={(e) => updateRow(index, 'paddyGradeId', e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                        <option value="">Select…</option>
                        {grades.filter((g) => !otherSelected.includes(g.id) || g.id === row.paddyGradeId).map((g) => (
                          <option key={g.id} value={g.id}>{g.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      {index === 0 && <label className="mb-1 block text-xs font-medium text-ink-700">Number of bags</label>}
                      <input type="number" value={row.bagCount} onChange={(e) => updateRow(index, 'bagCount', e.target.value)} placeholder="Required" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                    </div>
                    <div>
                      {index === 0 && <label className="mb-1 block text-xs font-medium text-ink-700">Weight (KG)</label>}
                      <input type="number" value={row.weightKg} onChange={(e) => updateRow(index, 'weightKg', e.target.value)} placeholder="Optional" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                    </div>
                    {rows.length > 1 && (
                      <div className={index === 0 ? 'mt-5' : ''}>
                        <button type="button" onClick={() => removeRow(index)} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={addRow} className="mt-2 text-xs font-medium text-paddy-700 underline">
              + Add another size
            </button>
            {!rows.some((r) => r.weightKg) && (
              <p className="mt-1 text-xs text-ink-500">No scale? Leave weight blank on any row - it will be estimated from bag count.</p>
            )}
            {totalBags > 0 && <p className="mt-1 text-xs font-medium text-paddy-700">{totalBags} bags total across {validRows.length} size{validRows.length === 1 ? '' : 's'}</p>}
          </div>

          {/* Step 3 - optional extra detail */}
          <div className="rounded-xl bg-white/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-soil-500">3. Moisture, quality grade, or a note (optional)</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Moisture %</label>
                <input type="number" value={moisturePercent} onChange={(e) => setMoisturePercent(e.target.value)} placeholder="Optional" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Quality grade</label>
                <input value={qualityGrade} onChange={(e) => setQualityGrade(e.target.value)} placeholder="Optional" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-ink-700">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" rows={2} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          {success && <p className="text-sm font-medium text-paddy-700">{success}</p>}
          <button type="button" onClick={() => setShowReview(true)} disabled={!farmId || validRows.length === 0} className="rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
            Review {validRows.length > 1 ? `${validRows.length} entries` : 'entry'} →
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border-2 border-paddy-900 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-soil-500">Review before submitting</p>
          <p className="mt-3 text-sm text-ink-900">
            Farm: <span className="font-medium">{farms.find((f) => f.id === farmId)?.name ?? ' - '}</span>
            <span className="mx-2 text-ink-300">·</span>
            Date: <span className="font-medium">{new Date(entryDate).toLocaleDateString()}</span>
          </p>
          <div className="mt-3 space-y-1.5 border-t border-paddy-100 pt-3">
            {validRows.map((row, i) => (
              <p key={i} className="text-sm text-ink-700">
                <span className="font-medium text-ink-900">{grades.find((g) => g.id === row.paddyGradeId)?.label ?? ' - '}</span>: {row.bagCount} bags
                {row.weightKg ? ` · ${row.weightKg} KG (measured)` : ' · weight to be estimated from bag count'}
              </p>
            ))}
          </div>
          {(moisturePercent || qualityGrade || notes) && (
            <div className="mt-3 space-y-0.5 border-t border-paddy-100 pt-3 text-xs text-ink-500">
              {moisturePercent && <p>Moisture: {moisturePercent}%</p>}
              {qualityGrade && <p>Quality grade: {qualityGrade}</p>}
              {notes && <p>Notes: {notes}</p>}
            </div>
          )}
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setShowReview(false)} className="rounded-full border border-paddy-100 px-5 py-2 text-sm font-medium text-ink-700">
              ← Edit
            </button>
            <button type="button" onClick={onSubmit} disabled={submitting} className="rounded-full bg-paddy-900 px-6 py-2 text-sm font-medium text-rice-50 disabled:opacity-50">
              {submitting ? 'Submitting…' : 'Confirm & submit'}
            </button>
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-5 border-t border-paddy-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Your recent entries</p>
          <div className="space-y-1.5">
            {recent.map((e) => (
              <div key={e.id} className="rounded-lg bg-white px-3 py-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-ink-700">
                    {e.paddyGrade.label} · {e.bagCount.toLocaleString()} bags
                    {' · '}
                    {e.weightKg.toLocaleString()} KG{e.weightEstimated ? ' (estimated)' : ''}
                    {' · '}
                    {new Date(e.entryDate).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusPill status={e.status} />
                    {EDITABLE_ENTRY_STATUSES.includes(e.status) && editingEntryId !== e.id && (
                      <button type="button" onClick={() => onStartEdit(e)} className="rounded-full border border-paddy-100 px-2 py-0.5 text-xs font-medium text-paddy-900 hover:bg-paddy-50">
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                {editingEntryId === e.id && (
                  <div className="mt-2 space-y-2 border-t border-paddy-100 pt-2">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <select value={editGradeId} onChange={(ev) => setEditGradeId(ev.target.value)} className="rounded-lg border border-paddy-100 px-2 py-1.5 text-xs">
                        {grades.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                      </select>
                      <input type="number" value={editBagCount} onChange={(ev) => setEditBagCount(ev.target.value)} placeholder="Bags" className="rounded-lg border border-paddy-100 px-2 py-1.5 text-xs" />
                      <input type="number" value={editWeightKg} onChange={(ev) => setEditWeightKg(ev.target.value)} placeholder="KG (optional)" className="rounded-lg border border-paddy-100 px-2 py-1.5 text-xs" />
                    </div>
                    <textarea value={editNotes} onChange={(ev) => setEditNotes(ev.target.value)} placeholder="Notes (optional)" rows={2} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-xs" />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => onSaveEdit(e.id)} disabled={savingEdit} className="rounded-full bg-paddy-900 px-4 py-1 text-xs font-medium text-rice-50 disabled:opacity-50">
                        {savingEdit ? 'Saving…' : 'Save changes'}
                      </button>
                      <button type="button" onClick={() => setEditingEntryId(null)} className="rounded-full border border-paddy-100 px-4 py-1 text-xs font-medium text-ink-700">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


export function DeliveryQuickAction({ accessToken }: { accessToken: string }) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [reports, setReports] = useState<DeliveryReport[]>([]);
  const [farmId, setFarmId] = useState('');
  const [autoSelectedFarm, setAutoSelectedFarm] = useState(false);

  const [mode, setMode] = useState<'order' | 'report'>('order');

  // New order - multiple sizes in one order, matching the exact same
  // pattern already proven for paddy intake: a warehouse very often
  // needs both Size 4 and Size 5 in the same trip, and DeliveryOrder
  // itself is single-grade at the schema level, so this creates one
  // real order per row, same as intake creates one real entry per row.
  const [warehouseId, setWarehouseId] = useState('');
  const [orderRows, setOrderRows] = useState([{ paddyGradeId: '', bagCount: '', totalKg: '' }]);
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
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editBagCount, setEditBagCount] = useState('');
  const [editKg, setEditKg] = useState('');
  const [editDriverName, setEditDriverName] = useState('');
  const [editVehiclePlate, setEditVehiclePlate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const EDITABLE_REPORT_STATUSES = ['DRAFT', 'SUBMITTED', 'SUPERVISOR_REVIEW', 'REJECTED'];

  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showOrderReview, setShowOrderReview] = useState(false);
  const [showReportReview, setShowReportReview] = useState(false);

  const load = () => {
    farmsApi.list(accessToken).then((list) => {
      setFarms(list);
      if (list.length === 1) { setFarmId(list[0].id); setAutoSelectedFarm(true); }
    }).catch(() => {});
    warehousesApi.directory(accessToken).then(setWarehouses).catch(() => {});
    paddyGradesApi.list(accessToken).then(setGrades).catch(() => {});
    deliveryOrdersApi.list(accessToken).then((list) => setOrders(list.slice(0, 10))).catch(() => {});
    deliveryReportsApi.list(accessToken).then((list) => setReports(list.slice(0, 5))).catch(() => {});
  };
  useEffect(load, [accessToken]);

  // Orders that don't already have a report submitted against them  - 
  // the only sensible ones to pick from when logging a report.
  const reportedOrderIds = new Set(reports.map((r) => r.deliveryOrderId));
  const openOrders = orders.filter((o) => !reportedOrderIds.has(o.id));

  const updateOrderRow = (index: number, field: 'paddyGradeId' | 'bagCount' | 'totalKg', value: string) => {
    setOrderRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };
  const addOrderRow = () => setOrderRows((prev) => [...prev, { paddyGradeId: '', bagCount: '', totalKg: '' }]);
  const removeOrderRow = (index: number) => setOrderRows((prev) => prev.filter((_, i) => i !== index));
  const validOrderRows = orderRows.filter((r) => r.paddyGradeId && r.bagCount);
  const totalOrderBags = validOrderRows.reduce((sum, r) => sum + (parseInt(r.bagCount, 10) || 0), 0);

  const onCreateOrder = async () => {
    if (!farmId || !warehouseId || validOrderRows.length === 0) return;
    setCreatingOrder(true);
    setFormError(null);
    try {
      // Same pattern as paddy intake - each size becomes its own real
      // DeliveryOrder, since the model itself is single-grade, while
      // the form presents it as one dispatch covering every size.
      for (const row of validOrderRows) {
        await deliveryOrdersApi.create(accessToken, {
          farmId, destinationWarehouseId: warehouseId, paddyGradeId: row.paddyGradeId,
          bagCount: parseInt(row.bagCount, 10), totalKg: row.totalKg ? parseFloat(row.totalKg) : undefined,
          requestedDate: new Date().toISOString().slice(0, 10),
        });
      }
      setOrderRows([{ paddyGradeId: '', bagCount: '', totalKg: '' }]);
      setSuccess(validOrderRows.length > 1 ? `${validOrderRows.length} orders created ✓` : 'Dispatch order created ✓');
      setShowOrderReview(false);
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
      setSuccess('Dispatch report submitted ✓');
      setShowReportReview(false);
      setTimeout(() => setSuccess(null), 3000);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to submit report.');
    } finally {
      setSubmittingReport(false);
    }
  };

  const onStartEditReport = (r: DeliveryReport) => {
    setEditingReportId(r.id);
    setEditBagCount(String(r.actualBagCount));
    setEditKg(String(r.actualKg));
    setEditDriverName(r.driver?.name ?? '');
    setEditVehiclePlate(r.vehicle?.plateNumber ?? '');
  };

  const onSaveEdit = async (id: string) => {
    setSavingEdit(true);
    setFormError(null);
    try {
      await deliveryReportsApi.update(accessToken, id, {
        actualBagCount: editBagCount ? parseInt(editBagCount, 10) : undefined,
        actualKg: editKg ? parseFloat(editKg) : undefined,
        driverName: editDriverName || undefined,
        vehiclePlateNumber: editVehiclePlate || undefined,
      });
      setEditingReportId(null);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save changes.');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">🚛 Dispatch</h2>
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
          <p className="text-sm text-ink-500">
            {autoSelectedFarm ? 'Request a delivery of paddy from your farm to a warehouse.' : 'Order any farm to dispatch paddy to a warehouse - pick which farm below.'}
          </p>
          <div className="mt-3 rounded-xl bg-white/60 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {!autoSelectedFarm && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-700">Farm</label>
                  <select value={farmId} onChange={(e) => setFarmId(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                    <option value="">Select a farm…</option>
                    {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Destination warehouse</label>
                <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                  <option value="">Select a warehouse…</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-soil-500">Sizes in this dispatch</p>
            <p className="mt-0.5 text-xs text-ink-500">Add one row per size - dispatch Size 4 and Size 5 together in one go.</p>
            <div className="mt-2 space-y-3">
              {orderRows.map((row, index) => {
                const otherSelected = orderRows.filter((_, i) => i !== index).map((r) => r.paddyGradeId);
                return (
                  <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                    <div>
                      {index === 0 && <label className="mb-1 block text-xs font-medium text-ink-700">Bag size / grade</label>}
                      <select value={row.paddyGradeId} onChange={(e) => updateOrderRow(index, 'paddyGradeId', e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                        <option value="">Select…</option>
                        {grades.filter((g) => !otherSelected.includes(g.id) || g.id === row.paddyGradeId).map((g) => (
                          <option key={g.id} value={g.id}>{g.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      {index === 0 && <label className="mb-1 block text-xs font-medium text-ink-700">Number of bags</label>}
                      <input type="number" value={row.bagCount} onChange={(e) => updateOrderRow(index, 'bagCount', e.target.value)} placeholder="Required" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                    </div>
                    <div>
                      {index === 0 && <label className="mb-1 block text-xs font-medium text-ink-700">Total weight (KG)</label>}
                      <input type="number" value={row.totalKg} onChange={(e) => updateOrderRow(index, 'totalKg', e.target.value)} placeholder="Optional - estimated if left blank" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                    </div>
                    {orderRows.length > 1 && (
                      <div className={index === 0 ? 'mt-5' : ''}>
                        <button type="button" onClick={() => removeOrderRow(index)} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={addOrderRow} className="mt-2 text-xs font-medium text-paddy-700 underline">
              + Add another size
            </button>
            {!orderRows.some((r) => r.totalKg) && (
              <p className="mt-1 text-xs text-ink-500">No scale? Leave weight blank on any row - it will be estimated from bag count.</p>
            )}
            {totalOrderBags > 0 && <p className="mt-1 text-xs font-medium text-paddy-700">{totalOrderBags} bags total across {validOrderRows.length} size{validOrderRows.length === 1 ? '' : 's'}</p>}
          </div>
          {showOrderReview ? (
            <div className="mt-4 rounded-xl border-2 border-paddy-900 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-soil-500">Review before submitting</p>
              <p className="mt-2 text-sm text-ink-900">From: <span className="font-medium">{farms.find((f) => f.id === farmId)?.name ?? ' - '}</span></p>
              <p className="text-sm text-ink-900">To: <span className="font-medium">{warehouses.find((w) => w.id === warehouseId)?.name ?? ' - '}</span></p>
              <div className="mt-2 space-y-1">
                {validOrderRows.map((row, i) => (
                  <p key={i} className="text-sm text-ink-700">
                    <span className="font-medium text-ink-900">{grades.find((g) => g.id === row.paddyGradeId)?.label ?? ' - '}</span>: {row.bagCount} bags
                    {row.totalKg ? ` (${row.totalKg} KG)` : ' (weight to be estimated from bag count)'}
                  </p>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => setShowOrderReview(false)} className="rounded-full border border-paddy-100 px-5 py-2 text-sm font-medium text-ink-700">
                  ← Edit
                </button>
                <button type="button" onClick={onCreateOrder} disabled={creatingOrder} className="rounded-full bg-paddy-900 px-6 py-2 text-sm font-medium text-rice-50 disabled:opacity-50">
                  {creatingOrder ? 'Creating…' : 'Confirm & create order'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowOrderReview(true)} disabled={!farmId || !warehouseId || validOrderRows.length === 0} className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
              Review order{validOrderRows.length > 1 ? 's' : ''}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-ink-500">Log what actually happened - driver, vehicle, and every cost, once the paddy is on its way.</p>

          <div className="mt-3 rounded-xl bg-white/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-soil-500">1. Which order, and what actually shipped</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-ink-700">Order</label>
                <select value={deliveryOrderId} onChange={(e) => setDeliveryOrderId(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                  <option value="">Which order is this for?…</option>
                  {openOrders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber} - {o.destinationWarehouse.name} ({o.bagCount} bags)</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Actual bags loaded</label>
                <input type="number" value={actualBagCount} onChange={(e) => setActualBagCount(e.target.value)} placeholder="Required" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Actual weight (KG)</label>
                <input type="number" value={actualKg} onChange={(e) => setActualKg(e.target.value)} placeholder="Required" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-white/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-soil-500">2. Driver &amp; vehicle</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Driver name</label>
                <input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Optional" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Driver phone</label>
                <input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="Optional" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Vehicle plate number</label>
                <input value={vehiclePlateNumber} onChange={(e) => setVehiclePlateNumber(e.target.value)} placeholder="Optional - this is the driver's tracking number" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Vehicle type</label>
                <input value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} placeholder="e.g. Truck" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-white/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-soil-500">3. Costs</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Labour cost (GHS)</label>
                <input type="number" value={labourCost} onChange={(e) => setLabourCost(e.target.value)} placeholder="Optional" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Number of labourers</label>
                <input type="number" value={numberOfLabourers} onChange={(e) => setNumberOfLabourers(e.target.value)} placeholder="Optional" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Transportation fee (GHS)</label>
                <input type="number" value={transportationFee} onChange={(e) => setTransportationFee(e.target.value)} placeholder="Optional" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Other costs (GHS)</label>
                <input type="number" value={otherCosts} onChange={(e) => setOtherCosts(e.target.value)} placeholder="Optional" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-ink-700">What were the other costs for?</label>
                <input value={otherCostsDescription} onChange={(e) => setOtherCostsDescription(e.target.value)} placeholder="Optional" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          {showReportReview ? (
            <div className="mt-4 rounded-xl border-2 border-paddy-900 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-soil-500">Review before submitting</p>
              <p className="mt-2 text-sm text-ink-900">
                Order: <span className="font-medium">{openOrders.find((o) => o.id === deliveryOrderId)?.orderNumber ?? ' - '}</span>
              </p>
              <p className="text-sm text-ink-700">{actualBagCount} bags · {actualKg} KG loaded</p>
              {(driverName || vehiclePlateNumber) && (
                <p className="text-sm text-ink-700">
                  {driverName && <>Driver: {driverName}{driverPhone ? ` (${driverPhone})` : ''} </>}
                  {vehiclePlateNumber && <>· Vehicle: {vehiclePlateNumber}{vehicleType ? ` (${vehicleType})` : ''}</>}
                </p>
              )}
              {(labourCost || transportationFee || otherCosts) && (
                <p className="text-sm text-ink-700">
                  Costs: {labourCost && `GHS ${labourCost} labour (${numberOfLabourers || '?'} people)`}
                  {transportationFee && ` · GHS ${transportationFee} transport`}
                  {otherCosts && ` · GHS ${otherCosts} other${otherCostsDescription ? ` (${otherCostsDescription})` : ''}`}
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => setShowReportReview(false)} className="rounded-full border border-paddy-100 px-5 py-2 text-sm font-medium text-ink-700">
                  ← Edit
                </button>
                <button type="button" onClick={onSubmitReport} disabled={submittingReport} className="rounded-full bg-paddy-900 px-6 py-2 text-sm font-medium text-rice-50 disabled:opacity-50">
                  {submittingReport ? 'Submitting…' : 'Confirm & submit report'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowReportReview(true)} disabled={!deliveryOrderId || !actualBagCount || !actualKg} className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
              Review report
            </button>
          )}
        </div>
      )}

      {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      {success && <p className="mt-2 text-sm font-medium text-paddy-700">{success}</p>}

      {reports.length > 0 && (
        <div className="mt-5 border-t border-paddy-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Recent dispatch reports</p>
          <div className="space-y-1.5">
            {reports.map((r) => (
              <div key={r.id} className="rounded-lg bg-white px-3 py-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-ink-700">{r.reportNumber} · GHS {r.totalDeliveryCost.toLocaleString()} total cost</span>
                  <div className="flex items-center gap-2">
                    <StatusPill status={r.status} />
                    {EDITABLE_REPORT_STATUSES.includes(r.status) && editingReportId !== r.id && (
                      <button type="button" onClick={() => onStartEditReport(r)} className="rounded-full border border-paddy-100 px-2 py-0.5 text-xs font-medium text-paddy-900 hover:bg-paddy-50">
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                {editingReportId === r.id && (
                  <div className="mt-2 space-y-2 border-t border-paddy-100 pt-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input type="number" value={editBagCount} onChange={(e) => setEditBagCount(e.target.value)} placeholder="Actual bags" className="rounded-lg border border-paddy-100 px-2 py-1.5 text-xs" />
                      <input type="number" value={editKg} onChange={(e) => setEditKg(e.target.value)} placeholder="Actual KG" className="rounded-lg border border-paddy-100 px-2 py-1.5 text-xs" />
                      <input value={editDriverName} onChange={(e) => setEditDriverName(e.target.value)} placeholder="Driver name" className="rounded-lg border border-paddy-100 px-2 py-1.5 text-xs" />
                      <input value={editVehiclePlate} onChange={(e) => setEditVehiclePlate(e.target.value)} placeholder="Vehicle plate" className="rounded-lg border border-paddy-100 px-2 py-1.5 text-xs" />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => onSaveEdit(r.id)} disabled={savingEdit} className="rounded-full bg-paddy-900 px-4 py-1 text-xs font-medium text-rice-50 disabled:opacity-50">
                        {savingEdit ? 'Saving…' : 'Save changes'}
                      </button>
                      <button type="button" onClick={() => setEditingReportId(null)} className="rounded-full border border-paddy-100 px-4 py-1 text-xs font-medium text-ink-700">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


export function PaddyRequestApprovalQueue({ accessToken }: { accessToken: string }) {
  const [requests, setRequests] = useState<PaddyRequest[]>([]);
  const [acceptedUnlinked, setAcceptedUnlinked] = useState<PaddyRequest[]>([]);
  const [recentOrders, setRecentOrders] = useState<DeliveryOrder[]>([]);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [linking, setLinking] = useState(false);
  const [farms, setFarms] = useState<Farm[]>([]);

  // Assigning a task to a farm - the real workflow: a Farm Supervisor
  // cannot dispatch paddy themselves, they decide which farm(s) can
  // meet the request and hand each one a concrete task. Callable more
  // than once per request, since a request may need two farms
  // together to fulfill.
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignFarmId, setAssignFarmId] = useState('');
  const [assignBagCount, setAssignBagCount] = useState('');
  const [assignNote, setAssignNote] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declining, setDeclining] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  // A real, confirmed gap alongside the empty-state one above: this
  // fetch's own failure was silently swallowed, meaning a genuine
  // 500/403 looked exactly like "no requests yet" - the two are very
  // different situations and shouldn't be indistinguishable.
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () => {
    setLoadError(null);
    paddyRequestsApi.list(accessToken).then((list) => {
      setRequests(list.filter((r) => r.status === 'PENDING' || r.status === 'ACCEPTED'));
      setAcceptedUnlinked(list.filter((r) => r.status === 'ACCEPTED' && !r.linkedOrder));
    }).catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load paddy requests.'));
    deliveryOrdersApi.list(accessToken).then((list) => setRecentOrders(list.slice(0, 15))).catch(() => {});
    farmsApi.list(accessToken).then(setFarms).catch(() => {});
  };
  useEffect(load, [accessToken]);

  const onLinkOrder = async (requestId: string) => {
    if (!selectedOrderId) return;
    setLinking(true);
    setFormError(null);
    try {
      await paddyRequestsApi.linkOrder(accessToken, requestId, selectedOrderId);
      setLinkingId(null);
      setSelectedOrderId('');
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to link order.');
    } finally {
      setLinking(false);
    }
  };

  const onAssign = async (requestId: string) => {
    if (!assignFarmId || !assignBagCount) return;
    setAssigning(true);
    setFormError(null);
    try {
      await paddyRequestsApi.assignToFarm(accessToken, requestId, {
        farmId: assignFarmId,
        bagCount: parseInt(assignBagCount, 10),
        note: assignNote || undefined,
      });
      setAssigningId(null);
      setAssignFarmId('');
      setAssignBagCount('');
      setAssignNote('');
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to assign task.');
    } finally {
      setAssigning(false);
    }
  };

  const onDecline = async (requestId: string) => {
    setDeclining(true);
    setFormError(null);
    try {
      await paddyRequestsApi.respond(accessToken, requestId, 'DECLINED', declineReason || undefined);
      setDecliningId(null);
      setDeclineReason('');
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to decline.');
    } finally {
      setDeclining(false);
    }
  };

  // A real, confirmed bug fixed here: this returned null with zero
  // explanation whenever there were no pending requests - genuinely
  // indistinguishable from the page being broken, which is exactly
  // what made an earlier working state look identical to a real
  // outage. A clear empty state now shows instead, so "nothing here
  // yet" and "something's wrong" never look the same again.
  if (requests.length === 0 && acceptedUnlinked.length === 0) {
    return (
      <div className="rounded-2xl border border-paddy-100 bg-white p-8 text-center text-sm text-ink-500">
        {loadError ? <span className="text-red-600">{loadError}</span> : 'No paddy requests from warehouses right now - this page will show them here as soon as one comes in.'}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">📥 Paddy requests from warehouses</h2>
      <p className="mt-1 text-sm text-ink-500">Decide which farm(s) can meet each request, then assign a dispatch task - the farm's manager reviews it and creates the actual order.</p>
      {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      <div className="mt-3 space-y-3">
        {requests.map((r) => (
          <div key={r.id} className="rounded-xl bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink-900">{r.warehouse.name} needs {r.requestedBagCount} bags of {r.paddyGrade.label} ({r.requestedKg} KG)</p>
              <StatusPill status={r.status} />
            </div>
            {r.notes && <p className="text-xs text-ink-500">{r.notes}</p>}
            <p className="mt-1 text-xs text-ink-500">Requested by {r.requestedBy.firstName} {r.requestedBy.lastName}</p>

            {assigningId === r.id ? (
              <div className="mt-3 space-y-2 border-t border-paddy-100 pt-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <select value={assignFarmId} onChange={(e) => setAssignFarmId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                    <option value="">Which farm can provide this?…</option>
                    {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <input type="number" value={assignBagCount} onChange={(e) => setAssignBagCount(e.target.value)} placeholder="Bags this farm should send" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                </div>
                <input value={assignNote} onChange={(e) => setAssignNote(e.target.value)} placeholder="Note to the farm manager (optional)" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => onAssign(r.id)} disabled={assigning || !assignFarmId || !assignBagCount} className="rounded-full bg-paddy-900 px-5 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
                    {assigning ? 'Assigning…' : 'Assign task'}
                  </button>
                  <button type="button" onClick={() => setAssigningId(null)} className="rounded-full border border-paddy-100 px-5 py-1.5 text-xs font-medium text-ink-700">Cancel</button>
                </div>
              </div>
            ) : decliningId === r.id ? (
              <div className="mt-3 space-y-2 border-t border-paddy-100 pt-3">
                <input value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Reason for declining (optional)" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => onDecline(r.id)} disabled={declining} className="rounded-full bg-red-600 px-5 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                    {declining ? 'Sending…' : 'Confirm decline'}
                  </button>
                  <button type="button" onClick={() => setDecliningId(null)} className="rounded-full border border-paddy-100 px-5 py-1.5 text-xs font-medium text-ink-700">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => { setAssigningId(r.id); setAssignFarmId(''); setAssignBagCount(''); setAssignNote(''); }} className="rounded-full bg-paddy-900 px-5 py-1.5 text-xs font-medium text-rice-50">
                  {r.status === 'ACCEPTED' ? 'Assign another farm' : 'Assign to a farm'}
                </button>
                {r.status === 'PENDING' && (
                  <button type="button" onClick={() => { setDecliningId(r.id); setDeclineReason(''); }} className="rounded-full border border-red-200 px-5 py-1.5 text-xs font-medium text-red-600">
                    Decline
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {acceptedUnlinked.length > 0 && (
        <div className="mt-5 border-t border-paddy-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Accepted - link to the actual dispatch order once the farm manager has created one</p>
          <div className="space-y-3">
            {acceptedUnlinked.map((r) => (
              <div key={r.id} className="rounded-xl bg-white p-4">
                <p className="text-sm font-medium text-ink-900">{r.warehouse.name} · {r.requestedBagCount} bags of {r.paddyGrade.label}</p>
                {r.responseNote && <p className="text-xs text-ink-500">Your response: {r.responseNote}</p>}

                {linkingId === r.id ? (
                  <div className="mt-2 flex gap-2">
                    <select value={selectedOrderId} onChange={(e) => setSelectedOrderId(e.target.value)} className="flex-1 rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                      <option value="">Which dispatch order fulfills this?…</option>
                      {recentOrders.map((o) => (
                        <option key={o.id} value={o.id}>{o.orderNumber} - {o.farm.name} → {o.destinationWarehouse.name} ({o.bagCount} bags)</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => onLinkOrder(r.id)} disabled={linking || !selectedOrderId} className="rounded-full bg-paddy-900 px-4 py-2 text-xs font-medium text-rice-50 disabled:opacity-50">
                      {linking ? 'Linking…' : 'Link'}
                    </button>
                    <button type="button" onClick={() => setLinkingId(null)} className="rounded-full border border-paddy-100 px-4 py-2 text-xs font-medium text-ink-700">Cancel</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => { setLinkingId(r.id); setSelectedOrderId(''); }} className="mt-2 rounded-full bg-paddy-900 px-5 py-1.5 text-xs font-medium text-rice-50">
                    Link to an order
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function InventoryAdjustmentRequestAction({ accessToken, meId }: { accessToken: string; meId: string }) {
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
      setSuccess('Correction requested ✓ - awaiting your supervisor’s approval.');
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
      <h2 className="font-display text-lg text-paddy-900">📝 Request a stock correction</h2>
      <p className="mt-1 text-sm text-ink-500">
        Physical count doesn&rsquo;t match the system? Request a correction - it only takes effect once your supervisor approves it, never immediately.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {isFarm ? (
          <select value={paddyGradeId} onChange={(e) => setPaddyGradeId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
            <option value="">Paddy grade…</option>
            {grades.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        ) : (
          <>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
              <option value="">Product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={packagingSizeId} onChange={(e) => setPackagingSizeId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
              <option value="">Bag size…</option>
              {sizes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </>
        )}
        <input type="number" value={adjustmentKg} onChange={(e) => setAdjustmentKg(e.target.value)} placeholder="KG adjustment (negative for shortage)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
        <input type="number" value={adjustmentBags} onChange={(e) => setAdjustmentBags(e.target.value)} placeholder="Bag adjustment (negative for shortage)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required) - e.g. physical count variance" rows={2} className="sm:col-span-2 rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
      </div>
      {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      {success && <p className="mt-2 text-sm font-medium text-paddy-700">{success}</p>}
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting || !adjustmentKg || !adjustmentBags || !reason.trim() || (isFarm ? !paddyGradeId : !productId || !packagingSizeId)}
        className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Request correction'}
      </button>

      {recent.length > 0 && (
        <div className="mt-5 border-t border-paddy-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Your recent requests</p>
          <div className="space-y-1.5">
            {recent.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs">
                <span className="text-ink-700">{a.adjustmentNumber} · {a.adjustmentKg > 0 ? '+' : ''}{a.adjustmentKg.toLocaleString()} KG</span>
                <StatusPill status={a.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// A Farm Supervisor reviewing a stock correction request can catch a
// genuine mistake in what the Farm Manager submitted - rather than
// forcing a decline and a whole new resubmission for something as
// simple as a wrong bag count, editing the figures is part of the
// approval step itself.
export function InventoryAdjustmentQueue({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<InventoryAdjustment[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKg, setEditKg] = useState('');
  const [editBags, setEditBags] = useState('');
  const [editReason, setEditReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = () => {
    inventoryAdjustmentsApi.list(accessToken, 'PENDING').then(setItems).catch(() => {});
  };
  useEffect(load, [accessToken]);

  const onStartEdit = (a: InventoryAdjustment) => {
    setEditingId(a.id);
    setEditKg(String(a.adjustmentKg));
    setEditBags(String(a.adjustmentBags));
    setEditReason(a.reason);
  };

  const onApprove = async (id: string, useEdits: boolean) => {
    setSubmitting(true);
    setFormError(null);
    try {
      await inventoryAdjustmentsApi.approve(
        accessToken,
        id,
        useEdits
          ? { adjustmentKg: parseFloat(editKg), adjustmentBags: parseInt(editBags, 10), reason: editReason }
          : undefined,
      );
      setEditingId(null);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to approve.');
    } finally {
      setSubmitting(false);
    }
  };

  const onReject = async (id: string) => {
    setSubmitting(true);
    setFormError(null);
    try {
      await inventoryAdjustmentsApi.reject(accessToken, id, 'Reviewed and rejected.');
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to reject.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">📝 Inventory correction requests</h2>
      <p className="mt-1 text-sm text-ink-500">{items.length} pending - a physical-count variance someone flagged, not yet applied to the ledger.</p>
      {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      <div className="mt-4 space-y-3">
        {items.map((a) => (
          <div key={a.id} className="rounded-lg bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs text-ink-500">{a.adjustmentNumber}</p>
                <p className="font-medium text-ink-900">{a.paddyGrade?.label ?? `${a.product?.name ?? ''} (${a.packagingSize?.label ?? ''})`}</p>
                <p className="text-sm text-ink-500">{a.reason}</p>
                <p className="mt-1 text-xs text-ink-500">
                  System shows {a.systemQuantityKg.toLocaleString()} KG / {a.systemBagCount} bags - requesting {a.adjustmentKg > 0 ? '+' : ''}{a.adjustmentKg.toLocaleString()} KG / {a.adjustmentBags > 0 ? '+' : ''}{a.adjustmentBags} bags
                </p>
              </div>
              {editingId !== a.id && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => onApprove(a.id, false)} disabled={submitting} className="rounded-full bg-paddy-900 px-3 py-1 text-xs font-medium text-rice-50 disabled:opacity-50">
                    Approve
                  </button>
                  <button type="button" onClick={() => onStartEdit(a)} className="rounded-full border border-paddy-100 px-3 py-1 text-xs font-medium text-paddy-900 hover:bg-paddy-50">
                    Edit &amp; approve
                  </button>
                  <button type="button" onClick={() => onReject(a.id)} disabled={submitting} className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                    Reject
                  </button>
                </div>
              )}
            </div>

            {editingId === a.id && (
              <div className="mt-3 space-y-2 border-t border-paddy-100 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-soil-500">Correct the figures before approving</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input type="number" value={editKg} onChange={(e) => setEditKg(e.target.value)} placeholder="Corrected KG (signed)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                  <input type="number" value={editBags} onChange={(e) => setEditBags(e.target.value)} placeholder="Corrected bags (signed)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                </div>
                <input value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="Reason" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => onApprove(a.id, true)} disabled={submitting || !editKg || !editBags} className="rounded-full bg-paddy-900 px-5 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
                    {submitting ? 'Approving…' : 'Approve with corrections'}
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="rounded-full border border-paddy-100 px-5 py-1.5 text-xs font-medium text-ink-700">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-ink-500">Nothing waiting - you&rsquo;re caught up.</p>}
      </div>
    </div>
  );
}
export function ShipmentQuickAction({ accessToken }: { accessToken: string }) {
  const [inTransit, setInTransit] = useState<Shipment[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [receivedKg, setReceivedKg] = useState('');
  const [receivedBags, setReceivedBags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = () => {
    shipmentsApi.list(accessToken, { inTransitOnly: true }).then(setInTransit).catch(() => {});
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
          {inTransit.map((s) => <option key={s.id} value={s.id}>{s.shipmentNumber} - {s.farm.name}</option>)}
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

