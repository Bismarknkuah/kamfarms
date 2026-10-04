'use client';

import { useState } from 'react';
import { useEffect } from 'react';
import { ApiError, DispatchResult, DispatchView, PaddyGrade, RequestCard, deliveryReportsApi, paddyGradesApi } from '@/lib/api-client';
import { SizeBags, linesOf } from '@/components/SizeBags';
import { DispatchFailed } from '@/components/dispatch/DispatchFeedback';
import { longDate } from '@/lib/dates';

const today = () => new Date().toISOString().slice(0, 10);
const input = 'w-full min-w-0 rounded-lg border border-paddy-100 bg-white px-3 py-2 text-sm';
const num = (s: string) => (s.trim() === '' ? undefined : parseFloat(s));
const OPEN = ['REQUESTED', 'PREPARING'];

/**
 * The farm manager loads the truck and submits ONE dispatch. Size 4 and Size 5 are BOTH on the form, whatever was asked for: the request's sizes
 * are filled in (and any difference from what was asked is flagged), and a size nobody asked for can still go on the truck. Bags are what is
 * counted; kilograms are optional. Every tap is answered: what is wrong, or that it was sent, or why it was not.
 */
export function DispatchForm({ accessToken, card, previous, onDone, onCancel }: { accessToken: string; card: RequestCard; previous?: DispatchView | null; onDone: (r: DispatchResult) => void; onCancel: () => void }) {
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  useEffect(() => { paddyGradesApi.list(accessToken).then(setGrades).catch(() => {}); }, [accessToken]);
  const gradeOf = (label: string) => grades.find((g) => g.label === label);
  // what the request asked for, by size; and which sizes can still be loaded (the others have already left)
  const asked = new Map<string, { orderId: string; bags: number; open: boolean }>();
  for (const l of card.lines) { const g = gradeOf(l.gradeLabel); if (g) asked.set(g.id, { orderId: l.orderId, bags: l.bagCount, open: OPEN.includes(l.stage) }); }
  const [bags, setBags] = useState<Record<string, number>>({});
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || grades.length === 0) return;
    const start: Record<string, number> = {};
    asked.forEach((v, id) => { if (v.open) start[id] = previous?.lines.find((p) => p.gradeLabel === grades.find((g) => g.id === id)?.label)?.bags ?? v.bags; });
    setBags(start); setSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grades, seeded]);
  const [kg, setKg] = useState<Record<string, string>>({});
  const [plate, setPlate] = useState(previous?.vehiclePlate ?? '');
  const [vehicleType, setVehicleType] = useState(previous?.vehicleType ?? '');
  const [driverName, setDriverName] = useState(previous?.driverName ?? '');
  const [driverPhone, setDriverPhone] = useState(previous?.driverPhone ?? '');
  const [departureDate, setDepartureDate] = useState(today());
  const [departureTime, setDepartureTime] = useState(previous?.departureTime ?? '');
  const [arrival, setArrival] = useState(previous?.expectedArrivalTime ?? '');
  const [labourers, setLabourers] = useState(previous?.numberOfLabourers ? String(previous.numberOfLabourers) : '');
  const [labour, setLabour] = useState(previous?.labourCost ? String(previous.labourCost) : '');
  const [transport, setTransport] = useState(previous?.transportationFee ? String(previous.transportationFee) : '');
  const [other, setOther] = useState(previous?.otherCosts ? String(previous.otherCosts) : '');
  const [otherDesc, setOtherDesc] = useState(previous?.otherCostsDescription ?? '');
  const [remarks, setRemarks] = useState(previous?.remarks ?? '');
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  const going = linesOf(bags);
  const totalBags = going.reduce((n, l) => n + l.bags, 0);
  const label = (id: string) => grades.find((g) => g.id === id)?.label ?? 'A size';
  const trip = (parseFloat(labour) || 0) + (parseFloat(transport) || 0) + (parseFloat(other) || 0);
  const locked: Record<string, string> = {};
  asked.forEach((v, id) => { if (!v.open) locked[id] = 'Already sent'; });
  const hints: Record<string, React.ReactNode> = {};
  grades.forEach((g) => {
    const a = asked.get(g.id); const n = bags[g.id] ?? 0;
    if (!a) hints[g.id] = n > 0 ? <span className="font-medium text-amber-800">Not asked for: it will be added</span> : <span>Not asked for</span>;
    else if (a.open) { const d = n - a.bags; hints[g.id] = n === 0 ? <span>Asked for {a.bags}. Not on this truck</span> : d === 0 ? <span className="text-paddy-700">Asked for {a.bags}: as asked</span> : <span className="font-medium text-amber-800">Asked for {a.bags}: {Math.abs(d)} {d < 0 ? 'fewer' : 'more'} than asked</span>; }
  });

  const check = (): string[] => {
    const out: string[] = [];
    if (going.length === 0) out.push('Put at least one size on the truck: enter its bags.');
    for (const l of going) if (kg[l.paddyGradeId] && !(parseFloat(kg[l.paddyGradeId]) > 0)) out.push(`${label(l.paddyGradeId)}: kilograms must be more than zero, or left blank.`);
    for (const [name, v] of [['Labour cost', labour], ['Transport', transport], ['Other costs', other], ['Labourers', labourers]] as const) if (v && !(parseFloat(v) >= 0)) out.push(`${name} must be a number.`);
    return out;
  };

  const send = async (submit: boolean) => {
    setFailure(null);
    const found = check();
    setProblems(found);
    if (found.length > 0) return;
    setBusy(true);
    try {
      const result = await deliveryReportsApi.createDispatch(accessToken, {
        // a size the request has an order for goes against that order; any other size is added as the truck is loaded
        lines: going.map((l) => { const a = asked.get(l.paddyGradeId); return a?.open ? { deliveryOrderId: a.orderId, actualBagCount: l.bags, actualKg: num(kg[l.paddyGradeId] ?? '') } : { paddyGradeId: l.paddyGradeId, actualBagCount: l.bags, actualKg: num(kg[l.paddyGradeId] ?? '') }; }),
        requestRef: card.requestRef ?? undefined,
        vehiclePlateNumber: plate.trim() || undefined, vehicleType: vehicleType.trim() || undefined, driverName: driverName.trim() || undefined, driverPhone: driverPhone.trim() || undefined,
        departureDate: departureDate || undefined, departureTime: departureTime || undefined, expectedArrivalTime: arrival.trim() || undefined,
        numberOfLabourers: num(labourers), labourCost: num(labour), transportationFee: num(transport), otherCosts: num(other), otherCostsDescription: otherDesc.trim() || undefined,
        remarks: remarks.trim() || undefined, submit,
      });
      onDone(result);
    } catch (err) {
      setFailure(err instanceof ApiError ? err.message : 'The dispatch could not be saved. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-4" data-testid="dispatch-form">
      <h4 className="font-display text-lg text-paddy-900">Load the truck and dispatch</h4>
      <p className="mt-0.5 text-sm text-ink-700" data-testid="dispatch-destination">Send to <strong>{card.warehouse.name}</strong>{card.warehouse.location ? ` (${card.warehouse.location})` : ''}{card.requestedDate ? `, needed by ${longDate(card.requestedDate)}` : ''}.</p>
      {card.notes && <p className="mt-1 rounded-lg bg-white px-3 py-1.5 text-xs text-ink-700"><span className="font-medium">Instructions{card.requestedBy ? ` from ${card.requestedBy}` : ''}:</span> {card.notes}</p>}
      {previous?.rejectionReason && <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-800"><span className="font-medium">Sent back:</span> {previous.rejectionReason}</p>}

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-soil-500">1. What is on the truck</p>
      <div className="mt-1" data-testid="dispatch-sizes"><SizeBags grades={grades} value={bags} onChange={setBags} hints={hints} locked={locked} /></div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-paddy-700">I weighed it (not needed)</summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {grades.filter((g) => (bags[g.id] ?? 0) > 0).map((g) => <input key={g.id} aria-label={`Kilograms of ${g.label}, optional`} inputMode="decimal" value={kg[g.id] ?? ''} placeholder={`${g.label} KG`} onChange={(e) => setKg((p) => ({ ...p, [g.id]: e.target.value.replace(/[^0-9.]/g, '') }))} className={input} />)}
        </div>
      </details>
      <p className="mt-1 text-sm font-medium text-paddy-900" data-testid="dispatch-total">{totalBags > 0 ? `On the truck: ${totalBags} bag${totalBags === 1 ? '' : 's'} (${going.map((l) => `${label(l.paddyGradeId)} ${l.bags}`).join(', ')})` : 'Nothing on the truck yet.'}</p>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-soil-500">2. The truck and driver</p>
      <p className="text-xs text-ink-500">Add the vehicle number and driver so the supervisor and the warehouse can recognise the truck.</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input aria-label="Vehicle number" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Vehicle number, e.g. GT-5521-21" className={input} />
        <input aria-label="Vehicle type" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} placeholder="Vehicle type, e.g. Truck" className={input} />
        <input aria-label="Driver name" value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Driver name" className={input} />
        <input aria-label="Driver phone" inputMode="tel" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="Driver phone" className={input} />
        <div><label htmlFor="ds-date" className="mb-1 block text-xs text-ink-500">Leaves on</label><input id="ds-date" type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} className={input} /></div>
        <div><label htmlFor="ds-time" className="mb-1 block text-xs text-ink-500">Leaves at</label><input id="ds-time" type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} className={input} /></div>
        <input aria-label="Expected arrival" value={arrival} onChange={(e) => setArrival(e.target.value)} placeholder="Expected there, e.g. 4pm" className={`${input} sm:col-span-2`} />
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-soil-500">3. What the trip cost (once, for the whole truck)</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input aria-label="Number of labourers" inputMode="numeric" value={labourers} onChange={(e) => setLabourers(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Labourers" className={input} />
        <input aria-label="Labour cost in GHS" inputMode="decimal" value={labour} onChange={(e) => setLabour(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Labour GHS" className={input} />
        <input aria-label="Transport in GHS" inputMode="decimal" value={transport} onChange={(e) => setTransport(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Transport GHS" className={input} />
        <input aria-label="Other costs in GHS" inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Other GHS" className={input} />
        {other && <input aria-label="What the other costs were" value={otherDesc} onChange={(e) => setOtherDesc(e.target.value)} placeholder="What were the other costs?" className={`${input} col-span-2 sm:col-span-4`} />}
      </div>
      {trip > 0 && <p className="mt-1 text-xs text-ink-700">Trip total: <strong>GHS {trip.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong></p>}
      <textarea aria-label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} placeholder="Anything the supervisor or the warehouse should know (optional)" className={`${input} mt-3`} />

      {problems.length > 0 && (
        <div role="alert" data-testid="dispatch-problems" className="mt-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">Not sent yet. Please fix:</p>
          <ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {failure && <div className="mt-3"><DispatchFailed message={failure} onClose={() => setFailure(null)} /></div>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" data-testid="dispatch-submit" onClick={() => send(true)} disabled={busy} className="rounded-full bg-paddy-900 px-6 py-2 text-sm font-medium text-rice-50 disabled:opacity-50">{busy ? 'Submitting...' : 'Submit dispatch for approval'}</button>
        <button type="button" data-testid="dispatch-draft" onClick={() => send(false)} disabled={busy} className="text-xs font-medium text-paddy-700 underline disabled:opacity-50">Save as a draft</button>
        <button type="button" onClick={onCancel} disabled={busy} className="text-xs text-ink-500">Cancel</button>
      </div>
    </div>
  );
}
