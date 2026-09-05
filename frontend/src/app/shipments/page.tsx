'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { shipmentsApi, Shipment, ApiError } from '@/lib/api-client';

export default function ShipmentsPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [receivedKg, setReceivedKg] = useState('');
  const [receivedBags, setReceivedBags] = useState('');
  const [receivedCondition, setReceivedCondition] = useState('');
  const [receivedMoisturePercent, setReceivedMoisturePercent] = useState('');
  const [receiving, setReceiving] = useState(false);

  const loadShipments = (token: string) => {
    shipmentsApi.list(token).then(setShipments).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load shipments.'));
  };

  useEffect(() => {
    if (accessToken) loadShipments(accessToken);
  }, [accessToken]);

  const onReceive = async (id: string) => {
    if (!accessToken || !receivedKg || !receivedBags) return;
    setReceiving(true);
    setPageError(null);
    try {
      await shipmentsApi.receive(
        accessToken, id, parseFloat(receivedKg), parseInt(receivedBags, 10),
        receivedCondition || undefined,
        receivedMoisturePercent ? parseFloat(receivedMoisturePercent) : undefined,
      );
      setReceivingId(null);
      setReceivedKg(''); setReceivedBags(''); setReceivedCondition(''); setReceivedMoisturePercent('');
      loadShipments(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to record receipt.');
    } finally {
      setReceiving(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  const inTransit = shipments?.filter((s) => !s.receivedAt) ?? [];
  const received = shipments?.filter((s) => s.receivedAt) ?? [];

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Shipments</h1>
      <p className="mt-1 text-sm text-ink-500">
        {shipments ? `${inTransit.length} in transit, ${received.length} received` : 'Loading…'} — a shipment is
        created automatically once a delivery report is approved.
      </p>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-ink-500">In transit</h2>
        <div className="space-y-2">
          {inTransit.map((s) => (
            <div key={s.id} className="rounded-2xl border border-husk-300 bg-husk-100/30 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-xs text-ink-500">{s.shipmentNumber}</p>
                  <p className="mt-0.5 font-medium text-ink-900">{s.farm.name} → {s.warehouse.name}</p>
                  <p className="text-sm text-ink-500">Expected: {s.expectedBags} bags / {s.expectedKg.toLocaleString()} KG · {s.paddyGrade.label}</p>
                  <p className="text-xs text-ink-500">Departed {new Date(s.departedAt).toLocaleString()}</p>
                  {(s.deliveryReport?.vehicle || s.deliveryReport?.driver) && (
                    <p className="mt-1 text-xs text-ink-500">
                      {s.deliveryReport.vehicle && <>Vehicle: {s.deliveryReport.vehicle.plateNumber}{s.deliveryReport.vehicle.vehicleType ? ` (${s.deliveryReport.vehicle.vehicleType})` : ''} </>}
                      {s.deliveryReport.driver && <>· Driver: {s.deliveryReport.driver.name}{s.deliveryReport.driver.phone ? ` (${s.deliveryReport.driver.phone})` : ''}</>}
                    </p>
                  )}
                </div>
                {hasPermission('warehouse.receive') && (
                  receivingId === s.id ? (
                    <div className="flex flex-col gap-2 rounded-lg bg-white p-2">
                      <input type="number" value={receivedBags} onChange={(e) => setReceivedBags(e.target.value)} placeholder="Bags received" className="w-40 rounded-lg border border-paddy-100 px-2 py-1 text-xs" />
                      <input type="number" value={receivedKg} onChange={(e) => setReceivedKg(e.target.value)} placeholder="KG received" className="w-40 rounded-lg border border-paddy-100 px-2 py-1 text-xs" />
                      <input value={receivedCondition} onChange={(e) => setReceivedCondition(e.target.value)} placeholder="Condition (e.g. Good, Wet)" className="w-40 rounded-lg border border-paddy-100 px-2 py-1 text-xs" />
                      <input type="number" value={receivedMoisturePercent} onChange={(e) => setReceivedMoisturePercent(e.target.value)} placeholder="Moisture % (optional)" className="w-40 rounded-lg border border-paddy-100 px-2 py-1 text-xs" />
                      <button type="button" onClick={() => onReceive(s.id)} disabled={receiving} className="rounded-full bg-paddy-900 px-3 py-1 text-xs font-medium text-rice-50 disabled:opacity-50">
                        {receiving ? 'Saving…' : 'Confirm receipt'}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setReceivingId(s.id)} className="whitespace-nowrap rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50">
                      Receive
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
          {inTransit.length === 0 && <p className="text-sm text-ink-500">Nothing currently in transit.</p>}
        </div>

        <h2 className="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-ink-500">Received</h2>
        <div className="overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">Shipment</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Expected</th>
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3">Condition</th>
                <th className="px-4 py-3">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paddy-100">
              {received.map((s) => {
                const variance = (s.receivedKg ?? 0) - s.expectedKg;
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-mono text-xs text-ink-700">{s.shipmentNumber}</td>
                    <td className="px-4 py-3 text-ink-900">{s.farm.name} → {s.warehouse.name}</td>
                    <td className="px-4 py-3 text-ink-700">{s.expectedBags} / {s.expectedKg.toLocaleString()} KG</td>
                    <td className="px-4 py-3 text-ink-700">{s.receivedBags} / {(s.receivedKg ?? 0).toLocaleString()} KG</td>
                    <td className="px-4 py-3 text-ink-700">
                      {s.receivedCondition ?? '—'}
                      {s.receivedMoisturePercent !== null && <span className="text-ink-500"> · {s.receivedMoisturePercent}% moisture</span>}
                    </td>
                    <td className={`px-4 py-3 ${Math.abs(variance) > 5 ? 'font-medium text-red-600' : 'text-ink-500'}`}>
                      {variance > 0 ? '+' : ''}{variance.toFixed(1)} KG
                    </td>
                  </tr>
                );
              })}
              {received.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-500">Nothing received yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardShell>
  );
}
