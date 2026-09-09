'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { shipmentsApi, Shipment, ApiError } from '@/lib/api-client';
import { InventoryAdjustmentRequestAction } from '@/components/OfficeActions';
import { BagStepper, ConditionChips, VarianceBadge, EstimatedWeightHint, STANDARD_PADDY_BAG_WEIGHT_KG } from '@/components/DataEntryKit';

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedShipment, setExpandedShipment] = useState<Shipment | null>(null);
  const [newLocationNote, setNewLocationNote] = useState('');
  const [postingLocation, setPostingLocation] = useState(false);

  const loadShipments = (token: string) => {
    shipmentsApi.list(token).then(setShipments).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load shipments.'));
  };

  useEffect(() => {
    if (accessToken) loadShipments(accessToken);
  }, [accessToken]);

  const onReceive = async (id: string) => {
    if (!accessToken || !receivedBags) return;
    setReceiving(true);
    setPageError(null);
    try {
      // Bags are the real count; kilos are estimated at the standard
      // bag weight when the receiver has no scale, exactly as the farm
      // side does - the backend needs a number either way.
      const bags = parseInt(receivedBags, 10);
      const kg = receivedKg ? parseFloat(receivedKg) : bags * STANDARD_PADDY_BAG_WEIGHT_KG;
      await shipmentsApi.receive(
        accessToken, id, kg, bags,
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

  const onToggleTrack = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedShipment(null);
      return;
    }
    if (!accessToken) return;
    setExpandedId(id);
    try {
      const detail = await shipmentsApi.findById(accessToken, id);
      setExpandedShipment(detail);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to load tracking details.');
    }
  };

  const onPostLocation = async (id: string) => {
    if (!accessToken || !newLocationNote.trim()) return;
    setPostingLocation(true);
    try {
      const updated = await shipmentsApi.addLocationUpdate(accessToken, id, newLocationNote.trim());
      setExpandedShipment(updated);
      setNewLocationNote('');
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to post location update.');
    } finally {
      setPostingLocation(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me || !accessToken) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  const inTransit = shipments?.filter((s) => !s.receivedAt) ?? [];
  const received = shipments?.filter((s) => s.receivedAt) ?? [];

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Shipments</h1>
      <p className="mt-1 text-sm text-ink-500">
        {shipments ? `${inTransit.length} in transit, ${received.length} received` : 'Loading…'} - a shipment is
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
                    <div className="w-full max-w-md rounded-2xl border-2 border-paddy-900 bg-white p-4 sm:ml-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-soil-500">Count what actually arrived</p>
                      <p className="mt-0.5 text-xs text-ink-500">Pre-filled with what was expected - just correct it if the count is different.</p>
                      <div className="mt-3">
                        <label className="mb-2 block text-xs font-medium text-ink-700">Bags received</label>
                        <BagStepper value={receivedBags} onChange={setReceivedBags} />
                        <div className="mt-2"><VarianceBadge expected={s.expectedBags} received={parseInt(receivedBags || '0', 10) || 0} /></div>
                      </div>
                      <div className="mt-4">
                        <label className="mb-2 block text-xs font-medium text-ink-700">Condition on arrival</label>
                        <ConditionChips value={receivedCondition} onChange={setReceivedCondition} />
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-ink-700">Weight (KG) <span className="font-normal text-ink-500">- optional</span></label>
                          <input type="number" inputMode="decimal" value={receivedKg} onChange={(e) => setReceivedKg(e.target.value)} placeholder="Only if weighed" className="w-full rounded-xl border-2 border-paddy-100 px-3 py-2.5 text-sm" />
                          <div className="mt-1"><EstimatedWeightHint bags={receivedBags} weightKg={receivedKg} /></div>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-ink-700">Moisture % <span className="font-normal text-ink-500">- optional</span></label>
                          <input type="number" inputMode="decimal" value={receivedMoisturePercent} onChange={(e) => setReceivedMoisturePercent(e.target.value)} placeholder="e.g. 14" className="w-full rounded-xl border-2 border-paddy-100 px-3 py-2.5 text-sm" />
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button type="button" onClick={() => onReceive(s.id)} disabled={receiving || !receivedBags} className="flex-1 rounded-full bg-paddy-900 px-4 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
                          {receiving ? 'Saving…' : 'Confirm receipt'}
                        </button>
                        <button type="button" onClick={() => setReceivingId(null)} className="rounded-full border border-paddy-100 px-4 py-2.5 text-sm text-ink-700">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => { setReceivingId(s.id); setReceivedBags(String(s.expectedBags)); setReceivedKg(''); setReceivedCondition('Good'); setReceivedMoisturePercent(''); }} className="whitespace-nowrap rounded-full bg-paddy-900 px-4 py-2 text-sm font-medium text-rice-50">
                      Receive this shipment
                    </button>
                  )
                )}
              </div>

              <button type="button" onClick={() => onToggleTrack(s.id)} className="mt-2 text-xs font-medium text-paddy-700 underline">
                {expandedId === s.id ? 'Hide tracking' : 'Track this shipment'}
              </button>

              {expandedId === s.id && (
                <div className="mt-3 rounded-xl border border-paddy-100 bg-white p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Timeline</p>
                  <div className="mt-2 space-y-1.5">
                    {expandedShipment?.events?.map((ev) => (
                      <div key={ev.id} className="rounded-lg bg-rice-50 px-3 py-1.5 text-sm">
                        <p className="text-xs font-medium text-paddy-900">
                          {ev.eventType === 'LOCATION_UPDATE' ? '📍 Location update' : ev.eventType.replace('_', ' ')}
                          <span className="ml-2 font-normal text-ink-500">{new Date(ev.createdAt).toLocaleString()}</span>
                        </p>
                        {ev.notes && <p className="text-ink-700">{ev.notes}</p>}
                      </div>
                    ))}
                    {expandedShipment?.events?.length === 0 && <p className="text-xs text-ink-500">No updates yet - still just departed.</p>}
                    {!expandedShipment && <p className="text-xs text-ink-500">Loading…</p>}
                  </div>

                  {hasPermission('delivery.approve') && (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={newLocationNote}
                        onChange={(ev) => setNewLocationNote(ev.target.value)}
                        onKeyDown={(ev) => ev.key === 'Enter' && onPostLocation(s.id)}
                        placeholder="e.g. Passed Kumasi checkpoint, ETA 2 hours"
                        className="flex-1 rounded-lg border border-paddy-100 px-3 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        disabled={postingLocation || !newLocationNote.trim()}
                        onClick={() => onPostLocation(s.id)}
                        className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50"
                      >
                        {postingLocation ? 'Posting…' : 'Post update'}
                      </button>
                    </div>
                  )}
                </div>
              )}
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
                      {s.receivedCondition ?? ' - '}
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

      {hasPermission('warehouse.inventory.view') && (
        <div className="mt-6">
          <InventoryAdjustmentRequestAction accessToken={accessToken} meId={me.id} />
        </div>
      )}
    </DashboardShell>
  );
}
