'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { GradeChips, BagStepper, RunningTotal } from '@/components/DataEntryKit';
import { productionApi, machinesApi, warehousesApi, paddyGradesApi, paddyMillingReceiptsApi, ProductionRecord, Machine, MachineDetail, Warehouse, PaddyGrade, YieldPrediction, PaddyMillingReceipt, ApiError } from '@/lib/api-client';

const MACHINE_STATUS_STYLES: Record<string, string> = {
  RUNNING: 'bg-paddy-700 text-rice-50',
  IDLE: 'bg-ink-500/10 text-ink-700',
  MAINTENANCE: 'bg-husk-300 text-soil-700',
  FAULT: 'bg-red-100 text-red-700',
  OFFLINE: 'bg-ink-500/10 text-ink-500',
};

function fmtKg(kg: number) {
  return `${kg.toLocaleString('en-US', { maximumFractionDigits: 0 })} KG`;
}

export default function ProductionPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [records, setRecords] = useState<ProductionRecord[] | null>(null);
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [millingCenters, setMillingCenters] = useState<{ id: string; name: string }[]>([]);
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);

  const [selectedMachine, setSelectedMachine] = useState<MachineDetail | null>(null);
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [newMachineCode, setNewMachineCode] = useState('');
  const [newMachineName, setNewMachineName] = useState('');
  const [newMachineMillingCenterId, setNewMachineMillingCenterId] = useState('');
  const [addingMachine, setAddingMachine] = useState(false);

  // ── Confirm paddy received at milling ──────────────────────────
  const [receipts, setReceipts] = useState<PaddyMillingReceipt[]>([]);
  const [showReceiptPanel, setShowReceiptPanel] = useState(false);
  const [receiptMillingCenterId, setReceiptMillingCenterId] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  // One row per grade - the exact request: both Size 4 and Size 5
  // confirmed as received today, in the same submission.
  const [receiptRows, setReceiptRows] = useState([{ paddyGradeId: '', bagCount: '' }]);
  const [receiptNotes, setReceiptNotes] = useState('');
  const [creatingReceipt, setCreatingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [receiptSuccess, setReceiptSuccess] = useState<string | null>(null);

  // ── Log a production run ────────────────────────────────────────
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [prMillingCenterId, setPrMillingCenterId] = useState('');
  const [prMachineId, setPrMachineId] = useState('');
  const [prDate, setPrDate] = useState(new Date().toISOString().slice(0, 10));
  const [prShift, setPrShift] = useState('');
  const [prPaddyGradeId, setPrPaddyGradeId] = useState('');
  const [prPaddyProcessedKg, setPrPaddyProcessedKg] = useState('');
  const [prPaddyProcessedBags, setPrPaddyProcessedBags] = useState('');
  const [prMeterOpening, setPrMeterOpening] = useState('');
  const [prMeterClosing, setPrMeterClosing] = useState('');
  const [prediction, setPrediction] = useState<YieldPrediction | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [prRecoveredRiceKg, setPrRecoveredRiceKg] = useState('');
  const [prBrokenRiceKg, setPrBrokenRiceKg] = useState('');
  const [prRiceHullKg, setPrRiceHullKg] = useState('');
  const [prRiceHullBags, setPrRiceHullBags] = useState('');
  const [prWasteLossKg, setPrWasteLossKg] = useState('');
  const [prSourceReferences, setPrSourceReferences] = useState('');
  const [prRemarks, setPrRemarks] = useState('');
  const [creatingRecord, setCreatingRecord] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // The dedicated meter-reading panel - its own entry point, not
  // something you have to discover by clicking a machine row first.
  const [showMeterPanel, setShowMeterPanel] = useState(false);
  const [meterMachineId, setMeterMachineId] = useState('');
  const [meterMachineDetail, setMeterMachineDetail] = useState<MachineDetail | null>(null);
  const [readingDate, setReadingDate] = useState(new Date().toISOString().slice(0, 10));
  const [currentReading, setCurrentReading] = useState('');
  const [recordingReading, setRecordingReading] = useState(false);
  const [readingError, setReadingError] = useState<string | null>(null);
  const [readingSuccess, setReadingSuccess] = useState<string | null>(null);

  const loadRecords = (token: string) => {
    productionApi.list(token).then(setRecords).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load production records.'));
  };

  const loadReceipts = (token: string) => {
    paddyMillingReceiptsApi.list(token).then(setReceipts).catch(() => {});
  };

  useEffect(() => {
    if (!accessToken) return;
    loadRecords(accessToken);
    machinesApi.list(accessToken).then(setMachines).catch(() => {});
    paddyGradesApi.list(accessToken).then(setGrades).catch(() => {});
    paddyMillingReceiptsApi.list(accessToken).then(setReceipts).catch(() => {});
    warehousesApi.list(accessToken).then((list) => {
      setMillingCenters(list.flatMap((w) => w.millingCenters.filter((mc) => mc.isActive).map((mc) => ({ id: mc.id, name: `${mc.name} (${w.name})` }))));
    }).catch(() => {});
  }, [accessToken]);

  const updateReceiptRow = (index: number, field: 'paddyGradeId' | 'bagCount', value: string) => {
    setReceiptRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };
  const addReceiptRow = () => setReceiptRows((prev) => [...prev, { paddyGradeId: '', bagCount: '' }]);
  const removeReceiptRow = (index: number) => setReceiptRows((prev) => prev.filter((_, i) => i !== index));
  const validReceiptRows = receiptRows.filter((r) => r.paddyGradeId && r.bagCount);

  const onCreateReceipt = async () => {
    if (!accessToken || !receiptMillingCenterId || validReceiptRows.length === 0) return;
    setCreatingReceipt(true);
    setReceiptError(null);
    try {
      await paddyMillingReceiptsApi.create(accessToken, {
        millingCenterId: receiptMillingCenterId,
        date: receiptDate,
        lines: validReceiptRows.map((r) => ({ paddyGradeId: r.paddyGradeId, bagCount: parseInt(r.bagCount, 10) })),
        notes: receiptNotes || undefined,
      });
      setReceiptRows([{ paddyGradeId: '', bagCount: '' }]);
      setReceiptNotes('');
      setReceiptSuccess('Paddy receipt confirmed ✓');
      setTimeout(() => setReceiptSuccess(null), 3000);
      loadReceipts(accessToken);
    } catch (err) {
      setReceiptError(err instanceof ApiError ? err.message : 'Failed to confirm paddy receipt.');
    } finally {
      setCreatingReceipt(false);
    }
  };

  const onCreateRecord = async () => {
    if (!accessToken || !prMillingCenterId || !prPaddyGradeId || !prPaddyProcessedKg || !prRecoveredRiceKg || !prBrokenRiceKg || !prRiceHullKg || !prWasteLossKg) return;
    setCreatingRecord(true);
    setCreateError(null);
    try {
      await productionApi.create(accessToken, {
        millingCenterId: prMillingCenterId,
        machineId: prMachineId || undefined,
        date: prDate,
        shift: prShift || undefined,
        paddyGradeId: prPaddyGradeId,
        paddyProcessedKg: parseFloat(prPaddyProcessedKg),
        paddyProcessedBags: prPaddyProcessedBags ? parseInt(prPaddyProcessedBags, 10) : undefined,
        recoveredRiceKg: parseFloat(prRecoveredRiceKg),
        brokenRiceKg: parseFloat(prBrokenRiceKg),
        riceHullKg: parseFloat(prRiceHullKg),
        riceHullBags: prRiceHullBags ? parseInt(prRiceHullBags, 10) : undefined,
        wasteLossKg: parseFloat(prWasteLossKg),
        electricityMeterOpening: prMeterOpening ? parseFloat(prMeterOpening) : undefined,
        electricityMeterClosing: prMeterClosing ? parseFloat(prMeterClosing) : undefined,
        energyConsumptionKwh: prMeterOpening && prMeterClosing ? Math.max(parseFloat(prMeterClosing) - parseFloat(prMeterOpening), 0) : undefined,
        remarks: prRemarks || undefined,
        sourceReferenceNumbers: prSourceReferences.trim() ? prSourceReferences.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      });
      setPrMachineId(''); setPrPaddyProcessedKg(''); setPrPaddyProcessedBags(''); setPrRecoveredRiceKg(''); setPrBrokenRiceKg('');
      setPrRiceHullKg(''); setPrWasteLossKg(''); setPrMeterOpening(''); setPrMeterClosing(''); setPrSourceReferences(''); setPrRemarks('');
      setCreateSuccess('Production run logged ✓ - sent for approval.');
      setTimeout(() => setCreateSuccess(null), 4000);
      loadRecords(accessToken);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to log production run.');
    } finally {
      setCreatingRecord(false);
    }
  };

  const onApprove = async (id: string) => {
    if (!accessToken) return;
    try {
      await productionApi.approve(accessToken, id);
      loadRecords(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to approve.');
    }
  };

  const openMachine = async (machineId: string) => {
    if (!accessToken) return;
    try {
      const detail = await machinesApi.findById(accessToken, machineId);
      setSelectedMachine(detail);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to load machine.');
    }
  };

  const onUpdateMachineStatus = async (machineId: string, status: string) => {
    if (!accessToken) return;
    try {
      await machinesApi.updateStatus(accessToken, machineId, { status });
      machinesApi.list(accessToken).then(setMachines).catch(() => {});
      if (selectedMachine?.id === machineId) openMachine(machineId);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to update machine status.');
    }
  };

  const onAddMachine = async () => {
    if (!accessToken || !newMachineCode.trim() || !newMachineName.trim() || !newMachineMillingCenterId) return;
    setAddingMachine(true);
    try {
      await machinesApi.create(accessToken, {
        machineCode: newMachineCode.trim().toUpperCase(),
        machineName: newMachineName.trim(),
        millingCenterId: newMachineMillingCenterId,
      });
      setNewMachineCode(''); setNewMachineName(''); setShowAddMachine(false);
      machinesApi.list(accessToken).then(setMachines).catch(() => {});
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to add machine.');
    } finally {
      setAddingMachine(false);
    }
  };

  const onSelectMeterMachine = async (machineId: string) => {
    setMeterMachineId(machineId);
    setMeterMachineDetail(null);
    setCurrentReading('');
    setReadingSuccess(null);
    if (!accessToken || !machineId) return;
    try {
      const detail = await machinesApi.findById(accessToken, machineId);
      setMeterMachineDetail(detail);
    } catch (err) {
      setReadingError(err instanceof ApiError ? err.message : 'Failed to load machine.');
    }
  };

  const lastReading = meterMachineDetail?.meterReadings[0] ?? null;
  const previewConsumption =
    currentReading && lastReading ? Math.max(parseFloat(currentReading) - lastReading.closingReading, 0) : null;
  const previewIsFirstReading = currentReading && meterMachineDetail && !lastReading;
  // Two real data-quality guards for a cumulative meter. A reading
  // lower than the last one on file is almost always a typo (or a
  // replaced meter), and silently recording zero consumption for it
  // would corrupt the energy figures downstream - so it's called out
  // loudly, before saving. And a consumption far outside this
  // machine's own recent average is flagged, not blocked, so a
  // genuine spike is still recordable but never recorded by accident.
  const readingBelowLast = !!(currentReading && lastReading && parseFloat(currentReading) < lastReading.closingReading);
  const recentConsumptions = (meterMachineDetail?.meterReadings ?? []).slice(0, 6).map((r) => r.consumption).filter((c) => c > 0);
  const recentAverage = recentConsumptions.length >= 2 ? recentConsumptions.reduce((a, b) => a + b, 0) / recentConsumptions.length : null;
  const consumptionRatio = previewConsumption !== null && recentAverage ? previewConsumption / recentAverage : null;
  const consumptionLooksUnusual = consumptionRatio !== null && (consumptionRatio > 2.5 || consumptionRatio < 0.3);

  const onRecordReading = async () => {
    if (!accessToken || !meterMachineId || !currentReading) return;
    setRecordingReading(true);
    setReadingError(null);
    try {
      await machinesApi.recordMeterReading(accessToken, meterMachineId, {
        date: readingDate,
        currentReading: parseFloat(currentReading),
      });
      setReadingSuccess(`Reading logged - ${previewConsumption?.toLocaleString() ?? '0'} kWh consumed since the last entry.`);
      setCurrentReading('');
      const refreshed = await machinesApi.findById(accessToken, meterMachineId);
      setMeterMachineDetail(refreshed);
      if (selectedMachine?.id === meterMachineId) setSelectedMachine(refreshed);
    } catch (err) {
      setReadingError(err instanceof ApiError ? err.message : 'Failed to record reading.');
    } finally {
      setRecordingReading(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-paddy-900">Production</h1>
          <p className="mt-1 text-sm text-ink-500">{records ? `${records.length} production records` : 'Loading…'}</p>
        </div>
        {hasPermission('meter.create') && (
          <button
            type="button"
            onClick={() => setShowMeterPanel((v) => !v)}
            className="flex items-center gap-2 rounded-full bg-husk-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-husk-700"
          >
            ⚡ Log meter reading
          </button>
        )}
        {hasPermission('production.create') && (
          <button
            type="button"
            onClick={() => setShowReceiptPanel((v) => !v)}
            className="flex items-center gap-2 rounded-full bg-husk-700 px-5 py-2.5 text-sm font-medium text-rice-50 shadow-sm transition hover:bg-husk-900"
          >
            📥 Confirm paddy received
          </button>
        )}
        {hasPermission('milling.view') && (
          <button
            type="button"
            onClick={() => setShowCreatePanel((v) => !v)}
            className="flex items-center gap-2 rounded-full bg-paddy-900 px-5 py-2.5 text-sm font-medium text-rice-50 shadow-sm transition hover:bg-paddy-700"
          >
            🌾 Log production run
          </button>
        )}
      </div>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {showReceiptPanel && (
        <div className="mt-4 rounded-2xl border-2 border-husk-700 bg-rice-50 p-6">
          <h2 className="font-display text-lg text-paddy-900">Confirm paddy received at milling</h2>
          <p className="mt-1 text-sm text-ink-500">What actually arrived today - add one row per size, so both Size 4 and Size 5 can be confirmed together.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <select value={receiptMillingCenterId} onChange={(e) => setReceiptMillingCenterId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
              <option value="">Milling center…</option>
              {millingCenters.map((mc) => <option key={mc.id} value={mc.id}>{mc.name}</option>)}
            </select>
            <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          </div>

          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-soil-500">Sizes received today</p>
          <div className="space-y-3">
            {receiptRows.map((row, index) => {
              const otherSelected = receiptRows.filter((_, i) => i !== index).map((r) => r.paddyGradeId);
              return (
                <div key={index} className="rounded-xl border border-paddy-100 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <label className="mb-2 block text-xs font-medium text-ink-700">Size / grade</label>
                      <GradeChips grades={grades} value={row.paddyGradeId} onChange={(id) => updateReceiptRow(index, 'paddyGradeId', id)} disabledIds={otherSelected} />
                    </div>
                    {receiptRows.length > 1 && (
                      <button type="button" onClick={() => removeReceiptRow(index)} className="shrink-0 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="mt-4">
                    <label className="mb-2 block text-xs font-medium text-ink-700">Bags received today</label>
                    <BagStepper value={row.bagCount} onChange={(v) => updateReceiptRow(index, 'bagCount', v)} />
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={addReceiptRow} className="mt-2 text-xs font-medium text-paddy-700 underline">
            + Add another size
          </button>
          <RunningTotal rows={receiptRows} label="Received at milling" />

          <textarea value={receiptNotes} onChange={(e) => setReceiptNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="mt-4 w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />

          {receiptError && <p className="mt-2 text-sm text-red-600">{receiptError}</p>}
          {receiptSuccess && <p className="mt-2 text-sm font-medium text-paddy-700">{receiptSuccess}</p>}
          <button
            type="button"
            onClick={onCreateReceipt}
            disabled={creatingReceipt || !receiptMillingCenterId || validReceiptRows.length === 0}
            className="mt-4 rounded-full bg-husk-700 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50"
          >
            {creatingReceipt ? 'Confirming…' : 'Confirm receipt'}
          </button>
        </div>
      )}

      {showCreatePanel && (
        <div className="mt-4 rounded-2xl border-2 border-paddy-900 bg-rice-50 p-6">
          <h2 className="font-display text-lg text-paddy-900">Log a production run</h2>
          <p className="mt-1 text-sm text-ink-500">
            Paddy in, rice and by-products out - recovery, broken %, hull %, and mass balance are all calculated
            automatically once this is submitted for approval.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <select value={prMillingCenterId} onChange={(e) => setPrMillingCenterId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
              <option value="">Milling center…</option>
              {millingCenters.map((mc) => <option key={mc.id} value={mc.id}>{mc.name}</option>)}
            </select>
            <select value={prMachineId} onChange={(e) => setPrMachineId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
              <option value="">Machine (optional)…</option>
              {machines?.map((m) => <option key={m.id} value={m.id}>{m.machineName}</option>)}
            </select>
            <select
              value={prPaddyGradeId}
              onChange={(e) => {
                setPrPaddyGradeId(e.target.value);
                setPrediction(null);
                if (e.target.value && prPaddyProcessedBags && accessToken) {
                  setPredicting(true);
                  productionApi.predict(accessToken, e.target.value, parseInt(prPaddyProcessedBags, 10)).then(setPrediction).catch(() => {}).finally(() => setPredicting(false));
                }
              }}
              className="rounded-lg border border-paddy-100 px-3 py-2 text-sm"
            >
              <option value="">Paddy grade…</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
            <input type="date" value={prDate} onChange={(e) => setPrDate(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <select value={prShift} onChange={(e) => setPrShift(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
              <option value="">Shift (optional)…</option>
              <option value="DAY">Day</option>
              <option value="NIGHT">Night</option>
            </select>
            <input
              type="number"
              value={prPaddyProcessedBags}
              onChange={(e) => {
                setPrPaddyProcessedBags(e.target.value);
                setPrediction(null);
                if (e.target.value && prPaddyGradeId && accessToken) {
                  setPredicting(true);
                  productionApi.predict(accessToken, prPaddyGradeId, parseInt(e.target.value, 10)).then(setPrediction).catch(() => {}).finally(() => setPredicting(false));
                }
              }}
              placeholder="Bags sent to milling"
              className="rounded-lg border border-paddy-100 px-3 py-2 text-sm"
            />
            <input type="number" value={prPaddyProcessedKg} onChange={(e) => setPrPaddyProcessedKg(e.target.value)} placeholder="Paddy processed (KG)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input type="number" value={prRecoveredRiceKg} onChange={(e) => setPrRecoveredRiceKg(e.target.value)} placeholder="Recovered rice (KG)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input type="number" value={prBrokenRiceKg} onChange={(e) => setPrBrokenRiceKg(e.target.value)} placeholder="Broken rice (KG)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input type="number" value={prRiceHullBags} onChange={(e) => setPrRiceHullBags(e.target.value)} placeholder="Rice hull (bags)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input type="number" value={prRiceHullKg} onChange={(e) => setPrRiceHullKg(e.target.value)} placeholder="Rice hull (KG)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input type="number" value={prWasteLossKg} onChange={(e) => setPrWasteLossKg(e.target.value)} placeholder="Waste / loss (KG)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input type="number" value={prMeterOpening} onChange={(e) => setPrMeterOpening(e.target.value)} placeholder="Electricity meter - opening (optional)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input type="number" value={prMeterClosing} onChange={(e) => setPrMeterClosing(e.target.value)} placeholder="Electricity meter - closing (optional)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input value={prSourceReferences} onChange={(e) => setPrSourceReferences(e.target.value)} placeholder="Source shipment/delivery numbers (comma-separated, optional)" className="sm:col-span-2 rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <textarea value={prRemarks} onChange={(e) => setPrRemarks(e.target.value)} placeholder="Remarks (optional)" rows={2} className="sm:col-span-2 lg:col-span-3 rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          </div>

          {predicting && <p className="mt-3 text-sm text-ink-500">Checking this grade&rsquo;s history…</p>}
          {prediction && !predicting && (
            prediction.hasHistory ? (() => {
              // Turn the prediction from four passive numbers into an active
              // check: a visible split so the officer sees the proportions,
              // a confidence marker from how many runs it rests on, and a
              // live comparison against what they're actually typing - so a
              // run well off the expected yield is flagged before it's
              // submitted, not discovered in a report a month later.
              const total = (prediction.expectedRecoveredKg ?? 0) + (prediction.expectedBrokenKg ?? 0) + (prediction.expectedHullKg ?? 0) + (prediction.expectedWasteKg ?? 0);
              const pct = (v?: number) => (total > 0 ? Math.round(((v ?? 0) / total) * 100) : 0);
              const confidence = prediction.sampleSize >= 10 ? 'High' : prediction.sampleSize >= 4 ? 'Medium' : 'Low';
              const confTone = confidence === 'High' ? 'bg-green-50 text-green-800 border-green-200' : confidence === 'Medium' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-red-50 text-red-800 border-red-200';
              const compare = (typed: string, expected?: number) => {
                const t = parseFloat(typed); if (!typed || !expected || Number.isNaN(t)) return null;
                const diff = ((t - expected) / expected) * 100; return { diff, off: Math.abs(diff) > 15 };
              };
              const rec = compare(prRecoveredRiceKg, prediction.expectedRecoveredKg);
              const brk = compare(prBrokenRiceKg, prediction.expectedBrokenKg);
              const hull = compare(prRiceHullKg, prediction.expectedHullKg);
              const rows = [
                { label: 'Recovered rice', kg: prediction.expectedRecoveredKg, tone: 'bg-paddy-900', cmp: rec },
                { label: 'Broken rice', kg: prediction.expectedBrokenKg, tone: 'bg-husk-500', cmp: brk },
                { label: 'Rice hull', kg: prediction.expectedHullKg, tone: 'bg-soil-500', cmp: hull },
                { label: 'Waste / loss', kg: prediction.expectedWasteKg, tone: 'bg-ink-300', cmp: null },
              ];
              return (
                <div className="mt-3 rounded-xl border border-husk-300 bg-husk-100/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-soil-500">
                      Expected yield - from {prediction.sampleSize} past approved run{prediction.sampleSize === 1 ? '' : 's'} of this grade
                    </p>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${confTone}`}>{confidence} confidence</span>
                  </div>
                  <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-white">
                    {rows.map((r) => <div key={r.label} className={`${r.tone}`} style={{ width: `${pct(r.kg)}%` }} title={`${r.label} ${pct(r.kg)}%`} />)}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {rows.map((r) => (
                      <div key={r.label}>
                        <p className="flex items-center gap-1.5 text-xs text-ink-500"><span className={`inline-block h-2 w-2 rounded-sm ${r.tone}`} />{r.label} · {pct(r.kg)}%</p>
                        <p className="font-display text-paddy-900">{fmtKg(r.kg ?? 0)}</p>
                        {r.cmp && (
                          <p className={`text-[11px] ${r.cmp.off ? 'font-semibold text-amber-800' : 'text-ink-500'}`}>
                            You typed {r.cmp.diff > 0 ? '+' : ''}{r.cmp.diff.toFixed(0)}% vs expected{r.cmp.off ? ' - worth a second look' : ''}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-ink-500">
                    Power expected: {prediction.expectedEnergyKwh !== null && prediction.expectedEnergyKwh !== undefined ? `${prediction.expectedEnergyKwh.toFixed(1)} kWh` : 'no meter history yet'}
                    {' · '}Based on {prediction.basedOnRecoveryPercent?.toFixed(1) ?? '?'}% recovery historically.
                  </p>
                </div>
              );
            })() : (
              <p className="mt-3 text-sm text-ink-500">No approved history yet for this grade - once a few runs are approved, expected yield will show here automatically.</p>
            )
          )}
          {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}
          {createSuccess && <p className="mt-2 text-sm font-medium text-paddy-700">{createSuccess}</p>}
          <button
            type="button"
            onClick={onCreateRecord}
            disabled={creatingRecord || !prMillingCenterId || !prPaddyGradeId || !prPaddyProcessedKg || !prRecoveredRiceKg || !prBrokenRiceKg || !prRiceHullKg || !prWasteLossKg}
            className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50"
          >
            {creatingRecord ? 'Saving…' : 'Log production run'}
          </button>
        </div>
      )}

      {showMeterPanel && hasPermission('meter.create') && (
        <div className="mt-4 rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
          <h2 className="font-display text-lg text-paddy-900">Log a meter reading</h2>
          <p className="mt-1 text-sm text-ink-500">
            Read the meter&rsquo;s current cumulative value directly off the machine and enter it below - that&rsquo;s
            the only number needed. The system already knows the last reading on file and works out consumption
            for you.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-700">Machine</label>
              <select
                value={meterMachineId}
                onChange={(e) => onSelectMeterMachine(e.target.value)}
                className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm"
              >
                <option value="">Select a machine…</option>
                {machines?.map((m) => (
                  <option key={m.id} value={m.id}>{m.machineName} - {m.millingCenter.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-700">Date</label>
              <input
                type="date"
                value={readingDate}
                onChange={(e) => setReadingDate(e.target.value)}
                className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {meterMachineId && (
            <div className="mt-4 rounded-xl bg-white p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Last reading on file</p>
                <p className="font-display text-lg text-paddy-900">
                  {lastReading ? `${lastReading.closingReading.toLocaleString()} ${lastReading.unit}` : meterMachineDetail ? 'No previous reading - this will be the first' : 'Loading…'}
                </p>
              </div>
              {lastReading && <p className="text-right text-xs text-ink-500">{new Date(lastReading.date).toLocaleDateString()}</p>}

              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-ink-700">Current reading (kWh)</label>
                <input
                  type="number"
                  value={currentReading}
                  onChange={(e) => setCurrentReading(e.target.value)}
                  placeholder="Enter the number shown on the meter now"
                  className="w-full rounded-lg border border-paddy-100 px-3 py-3 text-lg font-medium outline-none focus:border-husk-500 focus:ring-2 focus:ring-husk-500/30"
                />
              </div>

              {readingBelowLast && (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                  <strong>This is lower than the last reading ({lastReading!.closingReading.toLocaleString()} {lastReading!.unit}).</strong> A cumulative meter only counts up - double-check the number on the machine. If the meter was replaced or reset, add a note so the drop is explained.
                </div>
              )}
              {previewConsumption !== null && !previewIsFirstReading && !readingBelowLast && (
                <div className="mt-2 rounded-lg bg-rice-50 px-3 py-2">
                  <p className="text-sm text-paddy-700">
                    → This will record <strong>{previewConsumption.toLocaleString()} kWh</strong> consumed since the last reading.
                  </p>
                  {recentAverage !== null && (
                    <p className={`mt-1 text-xs ${consumptionLooksUnusual ? 'font-medium text-amber-800' : 'text-ink-500'}`}>
                      {consumptionLooksUnusual
                        ? `Unusual - this machine has averaged about ${Math.round(recentAverage).toLocaleString()} kWh per reading recently. Worth a second look before saving.`
                        : `In line with this machine's recent average of about ${Math.round(recentAverage).toLocaleString()} kWh per reading.`}
                    </p>
                  )}
                </div>
              )}
              {previewIsFirstReading && (
                <p className="mt-2 text-sm text-ink-500">
                  This is the first reading for this machine - consumption will start from zero.
                </p>
              )}

              {readingError && <p className="mt-2 text-sm text-red-600">{readingError}</p>}
              {readingSuccess && <p className="mt-2 text-sm font-medium text-paddy-700">{readingSuccess} ✓</p>}

              <button
                type="button"
                onClick={onRecordReading}
                disabled={recordingReading || !currentReading}
                className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50"
              >
                {recordingReading ? 'Saving…' : 'Log reading'}
              </button>
            </div>
          )}
        </div>
      )}

      {receipts.length > 0 && (
        <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-5">
          <h2 className="font-display text-lg text-paddy-900">Recent paddy receipts at milling</h2>
          <div className="mt-3 space-y-2">
            {receipts.slice(0, 10).map((r) => (
              <div key={r.receiptNumber} className="rounded-lg bg-rice-50 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-ink-500">{r.receiptNumber}</span>
                  <span className="text-xs text-ink-500">{new Date(r.date).toLocaleDateString()} · {r.millingCenter.name}</span>
                </div>
                <p className="mt-1 text-ink-900">
                  {r.lines.map((l) => `${l.bagCount} bags of ${l.paddyGrade.label}`).join(', ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3">Milling center</th>
                <th className="px-4 py-3">Recovery</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paddy-100">
              {records?.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono text-xs text-ink-700">{r.recordNumber}</td>
                  <td className="px-4 py-3 text-ink-900">{r.millingCenter.name}</td>
                  <td className="px-4 py-3 text-ink-700">
                    {r.recoveryPercent.toFixed(1)}%
                    {r.massBalanceFlag && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Flagged</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${r.status === 'APPROVED' ? 'bg-paddy-700 text-rice-50' : r.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-husk-300 text-soil-700'}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.status === 'SUBMITTED' && hasPermission('production.approve') && (
                      <button type="button" onClick={() => onApprove(r.id)} className="rounded-full border border-husk-500 px-3 py-1 text-xs font-medium text-paddy-900 hover:bg-husk-500 hover:text-white">
                        Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {records?.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-500">No production records yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-paddy-100 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-paddy-900">Machines</h2>
            {hasPermission('machine.manage') && (
              <button type="button" onClick={() => setShowAddMachine((v) => !v)} className="text-xs font-medium text-paddy-700 underline">
                {showAddMachine ? 'Cancel' : '+ Add machine'}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-500">Click a machine to see its full reading history.</p>

          {showAddMachine && (
            <div className="mt-3 space-y-2 rounded-lg border border-husk-300 bg-husk-100/30 p-3">
              <input value={newMachineCode} onChange={(e) => setNewMachineCode(e.target.value)} placeholder="Code, e.g. MC-M1" className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm uppercase" />
              <input value={newMachineName} onChange={(e) => setNewMachineName(e.target.value)} placeholder="Name, e.g. Rice Mill 1" className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
              <select value={newMachineMillingCenterId} onChange={(e) => setNewMachineMillingCenterId(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm">
                <option value="">Milling center…</option>
                {millingCenters.map((mc) => <option key={mc.id} value={mc.id}>{mc.name}</option>)}
              </select>
              <button
                type="button"
                onClick={onAddMachine}
                disabled={addingMachine || !newMachineCode.trim() || !newMachineName.trim() || !newMachineMillingCenterId}
                className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50"
              >
                {addingMachine ? 'Adding…' : 'Add machine'}
              </button>
            </div>
          )}

          <div className="mt-3 space-y-2">
            {machines?.map((m) => (
              <div
                key={m.id}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 transition ${
                  selectedMachine?.id === m.id ? 'border-husk-500 bg-husk-100/30' : 'border-paddy-100'
                }`}
              >
                <button type="button" onClick={() => openMachine(m.id)} className="flex-1 text-left hover:opacity-80">
                  <p className="text-sm font-medium text-ink-900">{m.machineName}</p>
                  <p className="text-xs text-ink-500">{m.millingCenter.name}</p>
                </button>
                {hasPermission('machine.manage') ? (
                  <select
                    value={m.status}
                    onChange={(e) => onUpdateMachineStatus(m.id, e.target.value)}
                    className={`rounded-full border-0 px-2.5 py-0.5 text-xs font-medium ${MACHINE_STATUS_STYLES[m.status] ?? 'bg-ink-500/10'}`}
                  >
                    <option value="RUNNING">RUNNING</option>
                    <option value="IDLE">IDLE</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                    <option value="FAULT">FAULT</option>
                    <option value="OFFLINE">OFFLINE</option>
                  </select>
                ) : (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${MACHINE_STATUS_STYLES[m.status] ?? 'bg-ink-500/10'}`}>
                    {m.status}
                  </span>
                )}
              </div>
            ))}
            {machines?.length === 0 && <p className="text-sm text-ink-500">No machines yet.</p>}
          </div>

          {selectedMachine && (
            <div className="mt-4 border-t border-paddy-100 pt-4">
              <h3 className="font-display text-base text-paddy-900">{selectedMachine.machineName} - reading history</h3>
              <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
                {selectedMachine.meterReadings.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg bg-rice-50 px-3 py-1.5 text-xs">
                    <span className="text-ink-700">{new Date(r.date).toLocaleDateString()}</span>
                    <span className="text-ink-900">{r.consumption.toLocaleString()} {r.unit}</span>
                    {r.isAnomalous && <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">Anomaly</span>}
                  </div>
                ))}
                {selectedMachine.meterReadings.length === 0 && (
                  <p className="text-xs text-ink-500">No readings logged for this machine yet.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
