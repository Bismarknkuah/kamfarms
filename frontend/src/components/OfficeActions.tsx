'use client';
import { GradeChips, BagStepper, EstimatedWeightHint, RunningTotal, ConditionChips, VarianceBadge } from './DataEntryKit';

// Shared, reusable action components - originally defined inline in
// office/page.tsx, extracted here so dedicated single-purpose pages
// (log-paddy-intake, dispatch, stock-correction) can import just one
// each, rather than a Farm Manager always landing on the combined
// My Office page with every section stacked together regardless of
// which one they came to use.

import { useEffect, useState } from 'react';
import { paddyEntriesApi, farmsApi, paddyGradesApi, PaddyEntry, Farm, PaddyGrade, salesOrdersApi, customersApi, masterDataApi, SalesOrder, Customer, Product, PackagingSize, paymentsApi, Payment, shipmentsApi, Shipment, productionApi, ProductionRecord, warehousesApi, Warehouse, deliveryOrdersApi, deliveryReportsApi, DeliveryOrder, DeliveryReport, systemResetApi, ResetRequest, stockTransfersApi, StockTransfer, inventoryAdjustmentsApi, InventoryAdjustment, paddyRequestsApi, PaddyRequest, ApiError, PaddyIntakeResult } from '@/lib/api-client';
import { IntakeFailure, IntakeSuccess } from '@/components/intake/IntakeFeedback';
import { DispatchDesk } from '@/components/dispatch/DispatchDesk';
import { primarySizes } from '@/components/SizeBags';

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
  // A real, confirmed bug fixed here, the same class as the warehouse
  // requests page: this fetch's failure was silently swallowed,
  // meaning a genuine load failure looked exactly like "no entries
  // yet" - the section simply vanished either way, with zero way to
  // tell the two apart.
  const [recentError, setRecentError] = useState<string | null>(null);
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
  // What the person is told about the intake they just sent: it stays until dismissed, whichever panel they are on.
  const [intakeResult, setIntakeResult] = useState<PaddyIntakeResult | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);
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
    paddyEntriesApi.list(accessToken).then((entries) => setRecent(entries.slice(0, 5))).catch((err: unknown) => setRecentError(err instanceof ApiError ? err.message : 'Failed to load your recent entries.'));
  };
  useEffect(load, [accessToken]);

  const updateRow = (index: number, field: 'paddyGradeId' | 'bagCount' | 'weightKg', value: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };
  const addRow = () => setRows((prev) => [...prev, { paddyGradeId: '', bagCount: '', weightKg: '' }]);
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  const validRows = rows.filter((r) => r.paddyGradeId && r.bagCount);
  const totalBags = validRows.reduce((sum, r) => sum + (parseInt(r.bagCount, 10) || 0), 0);

  // Size 4 and Size 5 are on the form from the start: nobody has to choose a size or add a line.
  useEffect(() => {
    if (grades.length === 0) return;
    setRows((prev) => (prev.length === 1 && !prev[0].paddyGradeId && !prev[0].bagCount ? primarySizes(grades).map((g) => ({ paddyGradeId: g.id, bagCount: '', weightKg: '' })) : prev));
  }, [grades]);

  const onSubmit = async () => {
    if (!farmId || validRows.length === 0) return;
    setIntakeResult(null);
    setIntakeError(null);
    const bad = validRows.findIndex((r) => !/^\d+$/.test(r.bagCount) || parseInt(r.bagCount, 10) < 1);
    if (bad >= 0) {
      setShowReview(false);
      setIntakeError(`Line ${bad + 1}: bags must be a whole number of at least 1.`);
      return;
    }
    setSubmitting(true);
    try {
      // Every size goes in ONE call, saved together and sent for approval together: all of it or none of it. (It used to save one size,
      // then the next; a failure on the second left the first behind, already submitted, and a retry then doubled it up.) Each size keeps
      // its own approval, and the server answers with what it recorded so the person can be shown it.
      const saved = await paddyEntriesApi.createIntake(accessToken, {
        farmId,
        entryDate,
        lines: validRows.map((row) => ({ paddyGradeId: row.paddyGradeId, bagCount: parseInt(row.bagCount, 10), weightKg: row.weightKg ? parseFloat(row.weightKg) : undefined })),
        moisturePercent: moisturePercent ? parseFloat(moisturePercent) : undefined,
        qualityGrade: qualityGrade || undefined,
        notes: notes || undefined,
      });
      setIntakeResult(saved);
      setRows([{ paddyGradeId: '', bagCount: '', weightKg: '' }]);
      setMoisturePercent(''); setQualityGrade(''); setNotes('');
      setShowReview(false);
      load();
    } catch (err) {
      // Shown above BOTH panels, so a failure is never hidden behind the review step.
      setShowReview(false);
      setIntakeError(err instanceof ApiError ? err.message : 'The intake could not be saved. Check your connection and try again.');
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
      <p className="font-display text-base italic text-soil-500">Farm</p>
      <h2 className="mt-0.5 font-display text-2xl font-medium text-paddy-900">Log paddy intake</h2>
      <p className="mt-1 text-sm text-ink-500">Your primary task - logged here goes straight to your Farm Supervisor for approval.</p>

      <div className="mt-4 space-y-3" aria-live="polite">
        {intakeResult && <IntakeSuccess result={intakeResult} onClose={() => setIntakeResult(null)} />}
        {intakeError && <IntakeFailure message={intakeError} onClose={() => setIntakeError(null)} />}
      </div>

      {!showReview ? (
        <div className="mt-5 space-y-5">
          {/* Step 1 - where and when */}
          <div className="rounded-xl bg-white/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-soil-500">1. Where did this paddy come from?</p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  <div key={index} className="rounded-xl border border-paddy-100 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <label className="mb-2 block text-xs font-medium text-ink-700">Bag size / grade</label>
                        <GradeChips grades={grades} value={row.paddyGradeId} onChange={(id) => updateRow(index, 'paddyGradeId', id)} disabledIds={otherSelected} />
                      </div>
                      {rows.length > 1 && (
                        <button type="button" onClick={() => removeRow(index)} className="shrink-0 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-medium text-ink-700">Number of bags</label>
                        <BagStepper value={row.bagCount} onChange={(v) => updateRow(index, 'bagCount', v)} />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-medium text-ink-700">Weight (KG) <span className="font-normal text-ink-500">- optional</span></label>
                        <input type="number" inputMode="decimal" value={row.weightKg} onChange={(e) => updateRow(index, 'weightKg', e.target.value)} placeholder="Only if you weighed it" className="w-full rounded-xl border-2 border-paddy-100 px-3 py-3 text-sm" />
                        <div className="mt-1.5"><EstimatedWeightHint bags={row.bagCount} weightKg={row.weightKg} /></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={addRow} className="mt-2 text-xs font-medium text-paddy-700 underline">
              + Add another size
            </button>
              <RunningTotal rows={rows} label="This intake" />
            {!rows.some((r) => r.weightKg) && (
              <p className="mt-1 text-xs text-ink-500">No scale? Leave weight blank on any row - it will be estimated from bag count.</p>
            )}
            {totalBags > 0 && <p className="mt-1 text-xs font-medium text-paddy-700">{totalBags} bags total across {validRows.length} size{validRows.length === 1 ? '' : 's'}</p>}
          </div>

          {/* Step 3 - optional extra detail */}
          <div className="rounded-xl bg-white/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-soil-500">3. Moisture, quality grade, or a note (optional)</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          {(!farmId || validRows.length === 0) && <p className="text-xs text-ink-500" data-testid="intake-hint">{!farmId ? 'Choose the farm to continue.' : 'Add at least one size and its bags to continue.'}</p>}
          <button type="button" onClick={() => setShowReview(true)} disabled={!farmId || validRows.length === 0} className="rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
            Review {validRows.length > 1 ? `${validRows.length} entries` : 'entry'} →
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border-2 border-paddy-900 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-soil-500">Review before submitting</p>
          <p className="mt-3 text-sm text-ink-900">Farm: <span className="font-medium">{farms.find((f) => f.id === farmId)?.name ?? ' - '}</span>
            <span className="mx-2 text-ink-300">·</span>
            Date: <span className="font-medium">{new Date(entryDate).toLocaleDateString()}</span>
          </p>
          <div className="mt-3 space-y-1.5 border-t border-paddy-100 pt-3">
            {validRows.map((row, i) => (
              <p key={i} className="text-sm text-ink-700"><span className="font-medium text-ink-900">{grades.find((g) => g.id === row.paddyGradeId)?.label ?? ' - '}</span>: {row.bagCount} bags
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

      {recentError && (
        <div className="mt-5 border-t border-paddy-200 pt-4">
          <p className="text-xs text-red-600">{recentError}</p>
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
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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


/** My Office: the same Dispatch desk the Farm Supervisor and the farm manager both work from, so what they see here is what the other sees. */
export function DeliveryQuickAction({ accessToken, me, hasPermission }: { accessToken: string; me: { id: string; roles: { code: string }[] }; hasPermission: (code: string) => boolean }) {
  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <DispatchDesk accessToken={accessToken} me={me} hasPermission={hasPermission} variant="office" />
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
      await paddyRequestsApi.respond(accessToken, requestId, 'DECLINED', declineReason.trim());
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
      <h2 className="font-display text-2xl font-medium text-paddy-900">Paddy requests from warehouses</h2>
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
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                <input value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Why are you declining? (required, the requester will read it)" aria-required="true" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => onDecline(r.id)} disabled={declining || declineReason.trim().length < 3} className="rounded-full bg-red-600 px-5 py-1.5 text-xs font-medium text-white disabled:opacity-50">
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
  // Same class of bug as the paddy intake and dispatch recent lists -
  // this fetch's failure was silently swallowed.
  const [recentError, setRecentError] = useState<string | null>(null);

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
    inventoryAdjustmentsApi.list(accessToken).then((list) => setRecent(list.slice(0, 5))).catch((err: unknown) => setRecentError(err instanceof ApiError ? err.message : 'Failed to load your recent requests.'));
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
      setSuccess('Correction requested - awaiting your supervisor’s approval.');
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
      <h2 className="font-display text-2xl font-medium text-paddy-900">Request a stock correction</h2>
      <p className="mt-1 text-sm text-ink-500">Physical count doesn&rsquo;t match the system? Request a correction - it only takes effect once your supervisor approves it, never immediately.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      {recentError && (
        <div className="mt-5 border-t border-paddy-200 pt-4">
          <p className="text-xs text-red-600">{recentError}</p>
        </div>
      )}

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
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');
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
      await inventoryAdjustmentsApi.reject(accessToken, id, rejectComment.trim());
      setRejectingId(null);
      setRejectComment('');
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to reject.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-2xl font-medium text-paddy-900">Inventory correction requests</h2>
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
                <p className="mt-1 text-xs text-ink-500">System shows {a.systemQuantityKg.toLocaleString()} KG / {a.systemBagCount} bags - requesting {a.adjustmentKg > 0 ? '+' : ''}{a.adjustmentKg.toLocaleString()} KG / {a.adjustmentBags > 0 ? '+' : ''}{a.adjustmentBags} bags
                </p>
              </div>
              {editingId !== a.id && rejectingId !== a.id && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => onApprove(a.id, false)} disabled={submitting} className="rounded-full bg-paddy-900 px-3 py-1 text-xs font-medium text-rice-50 disabled:opacity-50">
                    Approve
                  </button>
                  <button type="button" onClick={() => onStartEdit(a)} className="rounded-full border border-paddy-100 px-3 py-1 text-xs font-medium text-paddy-900 hover:bg-paddy-50">
                    Edit &amp; approve
                  </button>
                  <button type="button" onClick={() => { setRejectingId(a.id); setRejectComment(''); }} disabled={submitting} className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                    Reject
                  </button>
                </div>
              )}
            </div>

            {rejectingId === a.id && (
              <div className="mt-3 space-y-2 border-t border-paddy-100 pt-3">
                <label htmlFor={`adj-reject-${a.id}`} className="block text-xs font-medium text-ink-700">Your comment <span className="text-red-700">(required)</span></label>
                <textarea id={`adj-reject-${a.id}`} value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} rows={2} maxLength={500} aria-required="true" placeholder="Why is this correction not approved? The person who asked for it will read this." className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                <p className="text-xs text-ink-500">A comment is required when rejecting: write at least 3 characters.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => onReject(a.id)} disabled={submitting || rejectComment.trim().length < 3} className="rounded-full bg-red-700 px-5 py-1.5 text-xs font-medium text-white disabled:opacity-50">{submitting ? 'Sending...' : 'Confirm rejection'}</button>
                  <button type="button" onClick={() => setRejectingId(null)} className="rounded-full border border-paddy-100 px-5 py-1.5 text-xs font-medium text-ink-700">Back</button>
                </div>
              </div>
            )}

            {editingId === a.id && (
              <div className="mt-3 space-y-2 border-t border-paddy-100 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-soil-500">Correct the figures before approving</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
    if (!selectedId || !receivedBags) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await shipmentsApi.receive(accessToken, selectedId, receivedKg ? parseFloat(receivedKg) : undefined, parseInt(receivedBags, 10));
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
      <h2 className="font-display text-2xl font-medium text-paddy-900">Receive a shipment</h2>
      <p className="mt-1 text-sm text-ink-500">{inTransit.length} shipment{inTransit.length === 1 ? '' : 's'} currently in transit to you.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); const s = inTransit.find((x) => x.id === e.target.value); if (s) { setReceivedKg(String(s.expectedKg)); setReceivedBags(String(s.expectedBags)); } }} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
          <option value="">Select shipment…</option>
          {inTransit.map((s) => <option key={s.id} value={s.id}>{s.shipmentNumber} - {s.farm.name}</option>)}
        </select>
        <input type="number" value={receivedKg} onChange={(e) => setReceivedKg(e.target.value)} placeholder="Received KG (optional)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
        <input type="number" value={receivedBags} onChange={(e) => setReceivedBags(e.target.value)} placeholder="Received (bags)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
      </div>
      {selected && <p className="mt-2 text-xs text-ink-500">Expected: {selected.expectedKg.toLocaleString()} KG / {selected.expectedBags} bags</p>}
      {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      {success && <p className="mt-2 text-sm font-medium text-paddy-700">Shipment received</p>}
      <button type="button" onClick={onSubmit} disabled={submitting || !selectedId || !receivedBags} className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
        {submitting ? 'Receiving…' : 'Confirm receipt'}
      </button>
    </div>
  );
}

