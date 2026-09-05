'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { productionApi, machinesApi, ProductionRecord, Machine, MachineDetail, ApiError } from '@/lib/api-client';

const MACHINE_STATUS_STYLES: Record<string, string> = {
  RUNNING: 'bg-paddy-700 text-rice-50',
  IDLE: 'bg-ink-500/10 text-ink-700',
  MAINTENANCE: 'bg-husk-300 text-soil-700',
  FAULT: 'bg-red-100 text-red-700',
  OFFLINE: 'bg-ink-500/10 text-ink-500',
};

export default function ProductionPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [records, setRecords] = useState<ProductionRecord[] | null>(null);
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const [selectedMachine, setSelectedMachine] = useState<MachineDetail | null>(null);

  // The dedicated meter-reading panel — its own entry point, not
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

  useEffect(() => {
    if (!accessToken) return;
    loadRecords(accessToken);
    machinesApi.list(accessToken).then(setMachines).catch(() => {});
  }, [accessToken]);

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

  const onRecordReading = async () => {
    if (!accessToken || !meterMachineId || !currentReading) return;
    setRecordingReading(true);
    setReadingError(null);
    try {
      await machinesApi.recordMeterReading(accessToken, meterMachineId, {
        date: readingDate,
        currentReading: parseFloat(currentReading),
      });
      setReadingSuccess(`Reading logged — ${previewConsumption?.toLocaleString() ?? '0'} kWh consumed since the last entry.`);
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
      </div>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {showMeterPanel && hasPermission('meter.create') && (
        <div className="mt-4 rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
          <h2 className="font-display text-lg text-paddy-900">Log a meter reading</h2>
          <p className="mt-1 text-sm text-ink-500">
            Read the meter&rsquo;s current cumulative value directly off the machine and enter it below — that&rsquo;s
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
                  <option key={m.id} value={m.id}>{m.machineName} — {m.millingCenter.name}</option>
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
                  {lastReading ? `${lastReading.closingReading.toLocaleString()} ${lastReading.unit}` : meterMachineDetail ? 'No previous reading — this will be the first' : 'Loading…'}
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

              {previewConsumption !== null && !previewIsFirstReading && (
                <p className="mt-2 text-sm text-paddy-700">
                  → This will record <strong>{previewConsumption.toLocaleString()} kWh</strong> consumed since the last reading.
                </p>
              )}
              {previewIsFirstReading && (
                <p className="mt-2 text-sm text-ink-500">
                  This is the first reading for this machine — consumption will start from zero.
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
          <h2 className="font-display text-lg text-paddy-900">Machines</h2>
          <p className="mt-1 text-xs text-ink-500">Click a machine to see its full reading history.</p>
          <div className="mt-3 space-y-2">
            {machines?.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => openMachine(m.id)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition hover:border-husk-500 ${
                  selectedMachine?.id === m.id ? 'border-husk-500 bg-husk-100/30' : 'border-paddy-100'
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-ink-900">{m.machineName}</p>
                  <p className="text-xs text-ink-500">{m.millingCenter.name}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${MACHINE_STATUS_STYLES[m.status] ?? 'bg-ink-500/10'}`}>
                  {m.status}
                </span>
              </button>
            ))}
            {machines?.length === 0 && <p className="text-sm text-ink-500">No machines yet.</p>}
          </div>

          {selectedMachine && (
            <div className="mt-4 border-t border-paddy-100 pt-4">
              <h3 className="font-display text-base text-paddy-900">{selectedMachine.machineName} — reading history</h3>
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
