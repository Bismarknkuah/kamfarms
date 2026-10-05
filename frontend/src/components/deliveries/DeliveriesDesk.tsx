'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Plus, Truck } from 'lucide-react';
import { ApiError, PaddyGrade, PaddyTransferPlaces, PaddyTransferView, SupplyView, paddyGradesApi, paddyTransfersApi, supplyApi } from '@/lib/api-client';
import { SizeBags, linesOf } from '@/components/SizeBags';
import { ageLabel } from '@/lib/sales-flow';

const sizesOf = (lines: { gradeLabel: string; bags: number }[]) => lines.filter((l) => l.bags > 0).map((l) => `${l.gradeLabel}: ${l.bags}`).join('  ·  ');
const roadOf = (t: { vehiclePlate: string | null; driverName: string | null }) => [t.driverName && `driver ${t.driverName}`, t.vehiclePlate && `vehicle ${t.vehiclePlate}`].filter(Boolean).join(', ');
const BIG = 'rounded-full bg-paddy-900 px-6 py-3 text-base font-medium text-rice-50 disabled:bg-ink-500/30';
const QUIET = 'rounded-full border-2 border-ink-500/25 px-5 py-3 text-sm font-medium text-ink-700';

interface Props { accessToken: string; hasPermission: (code: string) => boolean; focusTransfer?: string | null; sendFor?: string | null }

/**
 * A warehouse's place for deliveries: the paddy COMING to it from another warehouse (count it in with one big button), and the paddy it SENDS
 * out (Size 4 and Size 5, bags only, where to). Paddy from farms is counted in on the Shipments page, as before.
 */
export function DeliveriesDesk({ accessToken, hasPermission, focusTransfer = null, sendFor = null }: Props) {
  const canSend = hasPermission('warehouse.transfer');
  const [transfers, setTransfers] = useState<PaddyTransferView[] | null>(null);
  const [places, setPlaces] = useState<PaddyTransferPlaces | null>(null);
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showSend, setShowSend] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [bags, setBags] = useState<Record<string, number>>({});
  const [driver, setDriver] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [note, setNote] = useState('');
  const [forRequest, setForRequest] = useState<SupplyView | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<PaddyTransferView | null>(null);

  const [counting, setCounting] = useState<string | null>(null);
  const [counted, setCounted] = useState<Record<string, number>>({});
  const [countNote, setCountNote] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelWhy, setCancelWhy] = useState('');

  const load = useCallback(() => Promise.all([paddyTransfersApi.list(accessToken), paddyTransfersApi.places(accessToken)])
    .then(([t, p]) => { setTransfers(t); setPlaces(p); setError(null); })
    .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Deliveries could not be loaded.')), [accessToken]);
  useEffect(() => { load(); const t = setInterval(load, 45000); return () => clearInterval(t); }, [load]);
  useEffect(() => { paddyGradesApi.list(accessToken).then(setGrades).catch(() => {}); }, [accessToken]);

  // One warehouse to send from: no need to choose it.
  useEffect(() => { if (places && !from && places.mine.length === 1) setFrom(places.mine[0].id); }, [places, from]);
  // Arriving from a paddy request the Farm Director gave to this warehouse: fill the form in for it.
  const loaded = places !== null;
  useEffect(() => {
    if (!sendFor || !loaded) return;
    supplyApi.board(accessToken).then((cards) => {
      const c = cards.find((x) => x.requestNumber === sendFor);
      if (!c || !c.sourceWarehouse || c.transfer) return;
      setForRequest(c); setShowSend(true); setFrom(c.sourceWarehouse.id); setTo(c.warehouse.id);
      setBags(Object.fromEntries(c.lines.map((l) => [l.paddyGradeId, l.bags])));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendFor, loaded]);
  useEffect(() => {
    if (!focusTransfer || !transfers) return;
    const t = setTimeout(() => document.querySelector('[data-focus="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    return () => clearTimeout(t);
  }, [focusTransfer, transfers]);

  const stockHere = places?.mine.find((w) => w.id === from)?.stock ?? [];
  const fromName = places?.mine.find((w) => w.id === from)?.name ?? 'This warehouse';
  const hints = Object.fromEntries(stockHere.map((s) => [s.paddyGradeId, <span key={s.paddyGradeId} className="text-xs text-ink-500">in stock: {s.bags}</span>]));

  const send = async () => {
    const lines = linesOf(bags); const out: string[] = [];
    if (!from) out.push('Choose the warehouse the paddy leaves from.');
    if (!to) out.push('Choose where it is going.');
    if (lines.length === 0) out.push('Put the bags on Size 4 or Size 5.');
    for (const l of lines) { const have = stockHere.find((s) => s.paddyGradeId === l.paddyGradeId); if (have && l.bags > have.bags) out.push(`${fromName} has only ${have.bags} bag${have.bags === 1 ? '' : 's'} of ${have.label}.`); }
    setProblems(out); setActionError(null);
    if (out.length > 0) return;
    setBusy(true);
    try {
      const v = await paddyTransfersApi.send(accessToken, { fromWarehouseId: from, toWarehouseId: to, lines, driverName: driver.trim() || undefined, vehiclePlate: vehicle.trim() || undefined, notes: note.trim() || undefined, supplyRequestNumber: forRequest?.requestNumber });
      setSent(v); setShowSend(false); setBags({}); setDriver(''); setVehicle(''); setNote(''); setForRequest(null); setNotice(null);
      await load();
    } catch (err) { setActionError(err instanceof ApiError ? err.message : 'That did not go through. Nothing was sent. Please try again.'); }
    finally { setBusy(false); }
  };
  const startCount = (t: PaddyTransferView) => { setCounting(t.id); setCounted(Object.fromEntries(t.lines.map((l) => [l.paddyGradeId, l.bags]))); setCountNote(''); setActionError(null); };
  const confirmCount = async (t: PaddyTransferView) => {
    setActionError(null); setNotice(null);
    try {
      const v = await paddyTransfersApi.receive(accessToken, t.id, { lines: t.lines.map((l) => ({ paddyGradeId: l.paddyGradeId, bags: counted[l.paddyGradeId] ?? 0 })), notes: countNote.trim() || undefined });
      setCounting(null); setSent(null);
      await load();
      setNotice(v.varianceBags ? `Counted in: ${(v.receivedLines ?? []).reduce((n, l) => n + l.bags, 0)} bags. ${Math.abs(v.varianceBags)} bag${Math.abs(v.varianceBags) === 1 ? '' : 's'} ${v.varianceBags < 0 ? 'short' : 'extra'}: that has been written down for review.` : `Counted in: all ${v.totalBags} bags are in your stock.`);
    } catch (err) { setActionError(err instanceof ApiError ? err.message : 'That did not go through. Please try again.'); }
  };
  const confirmCancel = async (t: PaddyTransferView) => {
    setActionError(null); setNotice(null);
    try { await paddyTransfersApi.cancel(accessToken, t.id, cancelWhy.trim() || undefined); setCancelling(null); setCancelWhy(''); setSent(null); await load(); setNotice('Cancelled. The bags are back in your stock.'); }
    catch (err) { setActionError(err instanceof ApiError ? err.message : 'That did not go through. Please try again.'); }
  };

  const coming = (transfers ?? []).filter((t) => t.status === 'IN_TRANSIT' && t.direction !== 'OUT');
  const going = (transfers ?? []).filter((t) => t.status === 'IN_TRANSIT' && t.direction !== 'IN');
  const finished = (transfers ?? []).filter((t) => t.status !== 'IN_TRANSIT').slice(0, 6);
  const focused = (t: PaddyTransferView) => !!focusTransfer && t.id === focusTransfer;
  const card = 'rounded-2xl border border-ink-500/15 bg-white p-4 shadow-sm data-[focus=true]:ring-2 data-[focus=true]:ring-husk-500';
  const section = (title: string, testid: string, children: React.ReactNode, count?: number) => (
    <section data-testid={testid} aria-label={title}>
      <h2 className="font-display text-lg text-paddy-900">{title}{count ? <span className="ml-2 rounded-full bg-husk-300 px-2 py-0.5 text-xs font-medium text-soil-700">{count}</span> : null}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );

  return (
    <div className="space-y-8" data-testid="deliveries-desk">
      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" data-testid="deliveries-notice" className="rounded-xl border border-paddy-700 bg-paddy-50 px-4 py-2.5 text-sm font-medium text-paddy-900">{notice}</p>}
      {actionError && <p role="alert" data-testid="deliveries-error" className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{actionError}</p>}
      {sent && (
        <div role="status" data-testid="send-sent" className="rounded-2xl border border-paddy-700 bg-paddy-50 p-4">
          <p className="flex items-center gap-2 font-medium text-paddy-900"><Check size={18} aria-hidden="true" /> Sent: {sent.totalBags} bags to {sent.to.name} ({sent.transferNumber})</p>
          <p className="mt-1 text-sm text-ink-700">{sizesOf(sent.lines)}. {sent.to.name} has been told. The paddy is out of your stock now and on the road.</p>
        </div>
      )}

      {canSend && !showSend && (
        <button type="button" data-testid="open-send" onClick={() => { setShowSend(true); setSent(null); setProblems([]); }} className={`${BIG} inline-flex items-center gap-2`}><Plus size={18} aria-hidden="true" /> Send paddy</button>
      )}
      {canSend && showSend && (
        <form data-testid="send-paddy-form" onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-4 rounded-2xl border-2 border-paddy-700 bg-white p-4" noValidate>
          <h2 className="font-display text-lg text-paddy-900">Send paddy to another warehouse</h2>
          {forRequest && <p data-testid="send-for-request" className="rounded-lg bg-husk-300/40 px-3 py-2 text-sm text-soil-700">For paddy request {forRequest.requestNumber} from {forRequest.warehouse.name}. The sizes are filled in for you.</p>}
          {places && places.mine.length > 1 ? (
            <label className="block text-sm font-medium text-ink-700">From
              <select data-testid="send-from" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500/25 bg-white px-3 py-3 text-base">
                <option value="">Choose a warehouse</option>{places.mine.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
          ) : <p className="text-sm text-ink-700">From <strong>{fromName}</strong></p>}
          <label className="block text-sm font-medium text-ink-700">Send to
            <select data-testid="send-to" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500/25 bg-white px-3 py-3 text-base">
              <option value="">Choose a warehouse</option>{(places?.others ?? []).filter((w) => w.id !== from).map((w) => <option key={w.id} value={w.id}>{w.name}{w.location ? ` (${w.location})` : ''}</option>)}
            </select>
          </label>
          <SizeBags grades={grades} value={bags} onChange={setBags} hints={hints} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-ink-700">Driver (if you know)<input data-testid="send-driver" value={driver} onChange={(e) => setDriver(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500/25 px-3 py-3 text-base" /></label>
            <label className="block text-sm font-medium text-ink-700">Vehicle number (if you know)<input data-testid="send-vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500/25 px-3 py-3 text-base" /></label>
          </div>
          <label className="block text-sm font-medium text-ink-700">A note (if you want)<input data-testid="send-note" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500/25 px-3 py-3 text-base" /></label>
          {problems.length > 0 && <ul role="alert" data-testid="send-problems" className="space-y-1 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" data-testid="send-submit" disabled={busy} className={BIG}>{busy ? 'Sending...' : 'Send paddy'}</button>
            <button type="button" data-testid="send-close" onClick={() => { setShowSend(false); setForRequest(null); setProblems([]); }} className={QUIET}>Close</button>
          </div>
          <p className="text-xs text-ink-500">Only bags are asked for. The paddy leaves your stock as soon as you press Send, and joins the other warehouse's stock when they count it in.</p>
        </form>
      )}

      {section('Coming to you', 'deliveries-in', <>
        {coming.length === 0 && <p className="rounded-xl bg-white px-4 py-3 text-sm text-ink-500" data-testid="deliveries-in-empty">No paddy is on its way to you from another warehouse.</p>}
        {coming.map((t) => (
          <article key={t.id} data-testid="in-card" data-transfer={t.id} data-number={t.transferNumber} data-focus={focused(t) ? 'true' : undefined} className={card}>
            <p className="font-display text-lg text-paddy-900"><Truck size={18} className="mr-1.5 inline" aria-hidden="true" />From {t.from.name}</p>
            <p className="mt-0.5 text-base font-medium text-ink-900" data-testid="in-sizes">{sizesOf(t.lines)}</p>
            <p className="mt-1 text-xs text-ink-500">Sent {t.sentAt ? ageLabel(t.sentAt) : ''} by {t.sentBy}{roadOf(t) ? ` · ${roadOf(t)}` : ''}{t.supplyRequestNumber ? ` · for paddy request ${t.supplyRequestNumber}` : ''}</p>
            {t.notes && <p className="mt-2 rounded-lg bg-rice-50 px-3 py-1.5 text-xs text-ink-700">{t.notes}</p>}
            {counting !== t.id && (hasPermission('warehouse.receive') || canSend) && (
              <button type="button" data-testid="act-count" onClick={() => startCount(t)} className={`${BIG} mt-3`}>Paddy arrived</button>
            )}
            {counting === t.id && (
              <div className="mt-3 space-y-3" data-testid="count-form">
                <p className="text-sm font-medium text-ink-700">How many bags really arrived?</p>
                <SizeBags grades={grades.filter((g) => t.lines.some((l) => l.paddyGradeId === g.id))} value={counted} onChange={setCounted} idPrefix="Counted bags" hints={Object.fromEntries(t.lines.map((l) => [l.paddyGradeId, <span key={l.paddyGradeId} className="text-xs text-ink-500">sent: {l.bags}</span>]))} />
                <label className="block text-sm font-medium text-ink-700">A note (if something was wrong)<input data-testid="count-note" value={countNote} onChange={(e) => setCountNote(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500/25 px-3 py-3 text-base" /></label>
                <div className="flex flex-wrap gap-3">
                  <button type="button" data-testid="count-confirm" onClick={() => confirmCount(t)} className={BIG}>Confirm: this many arrived</button>
                  <button type="button" data-testid="count-back" onClick={() => setCounting(null)} className={QUIET}>Back</button>
                </div>
              </div>
            )}
          </article>
        ))}
        {hasPermission('warehouse.receive') && <p className="text-xs text-ink-500" data-testid="deliveries-farm-note">Paddy that comes from a farm is counted in on the <a href="/shipments" className="font-medium text-paddy-700 underline">Shipments</a> page.</p>}
      </>, coming.length)}

      {section('Going out', 'deliveries-out', <>
        {going.length === 0 && <p className="rounded-xl bg-white px-4 py-3 text-sm text-ink-500" data-testid="deliveries-out-empty">Nothing you sent is on the road.</p>}
        {going.map((t) => (
          <article key={t.id} data-testid="out-card" data-transfer={t.id} data-number={t.transferNumber} data-focus={focused(t) ? 'true' : undefined} className={card}>
            <p className="font-display text-lg text-paddy-900"><Truck size={18} className="mr-1.5 inline" aria-hidden="true" />To {t.to.name}</p>
            <p className="mt-0.5 text-base font-medium text-ink-900" data-testid="out-sizes">{sizesOf(t.lines)}</p>
            <p className="mt-1 text-xs text-ink-500" data-testid="out-label">{t.label}{t.sentAt ? ` · sent ${ageLabel(t.sentAt)}` : ''}{roadOf(t) ? ` · ${roadOf(t)}` : ''}{t.supplyRequestNumber ? ` · for paddy request ${t.supplyRequestNumber}` : ''}</p>
            {canSend && cancelling !== t.id && <button type="button" data-testid="act-cancel" onClick={() => { setCancelling(t.id); setCancelWhy(''); }} className={`${QUIET} mt-3`}>Cancel this delivery</button>}
            {cancelling === t.id && (
              <div className="mt-3 space-y-3">
                <label className="block text-sm font-medium text-ink-700">Why? (a few words)<input data-testid="cancel-reason" value={cancelWhy} onChange={(e) => setCancelWhy(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500/25 px-3 py-3 text-base" /></label>
                <div className="flex flex-wrap gap-3">
                  <button type="button" data-testid="cancel-confirm" onClick={() => confirmCancel(t)} className="rounded-full border-2 border-red-300 px-5 py-3 text-sm font-medium text-red-700">Yes, cancel it: the bags come back to my stock</button>
                  <button type="button" onClick={() => setCancelling(null)} className={QUIET}>No</button>
                </div>
              </div>
            )}
          </article>
        ))}
      </>, going.length)}

      {finished.length > 0 && section('Done', 'deliveries-done', <>
        {finished.map((t) => (
          <article key={t.id} data-testid="done-card" data-transfer={t.id} data-focus={focused(t) ? 'true' : undefined} className={`${card} !p-3`}>
            <p className="text-sm font-medium text-ink-900">{t.from.name} to {t.to.name}: {sizesOf(t.lines)}</p>
            <p className="mt-0.5 text-xs text-ink-500">{t.label}{t.receivedBy ? ` · counted in by ${t.receivedBy}` : ''}{t.cancelReason ? ` · ${t.cancelReason}` : ''}</p>
          </article>
        ))}
      </>)}
    </div>
  );
}
