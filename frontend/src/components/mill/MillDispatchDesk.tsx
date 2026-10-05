'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Factory, Plus } from 'lucide-react';
import { ApiError, type MillDispatchInput, type MillDispatchOptions, type MillDispatchView, millDispatchApi } from '@/lib/api-client';
import { SizeBags, linesOf } from '@/components/SizeBags';

const BIG = 'rounded-full bg-paddy-900 px-6 py-3 text-base font-medium text-rice-50 disabled:bg-ink-500/30';
const QUIET = 'rounded-full border-2 border-ink-500/25 px-5 py-3 text-sm font-medium text-ink-700';
const DANGER = 'rounded-full border-2 border-red-300 px-5 py-3 text-sm font-medium text-red-700';
const TONE: Record<string, string> = { PENDING_APPROVAL: 'bg-husk-300 text-soil-700', IN_TRANSIT: 'bg-amber-100 text-amber-900', RECEIVED: 'bg-paddy-900 text-rice-50', REJECTED: 'bg-red-100 text-red-800', CANCELLED: 'bg-ink-500/10 text-ink-500' };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const lineText = (l: MillDispatchView['lines'][number]) => (l.kind === 'BROKEN_RICE' || l.kind === 'RICE_HULL' ? `${l.label}: ${l.kg} kg` : `${l.label}: ${l.bags}`);

/**
 * Paddy from the warehouse to its mill, and finished products (packaged rice, broken rice, rice hull) from the mill to its warehouse. The one who asks sees their own
 * form; the supervisor sees what is waiting for approval; whoever receives sees what is on the way and counts it in. Big buttons, few words.
 */
export function MillDispatchDesk({ accessToken, hasPermission, focusId = null }: { accessToken: string; hasPermission: (code: string) => boolean; focusId?: string | null }) {
  const [items, setItems] = useState<MillDispatchView[] | null>(null);
  const [options, setOptions] = useState<MillDispatchOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [form, setForm] = useState<'TO_MILL' | 'TO_WAREHOUSE' | null>(null);
  const [mill, setMill] = useState('');
  const [paddy, setPaddy] = useState<Record<string, number>>({});
  const [packaged, setPackaged] = useState<Record<string, number>>({});
  const [broken, setBroken] = useState(''); const [hull, setHull] = useState('');
  const [driver, setDriver] = useState(''); const [vehicle, setVehicle] = useState(''); const [note, setNote] = useState('');
  const [problems, setProblems] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null); const [why, setWhy] = useState('');
  const [counting, setCounting] = useState<string | null>(null); const [counted, setCounted] = useState<Record<string, string>>({}); const [countNote, setCountNote] = useState('');

  const load = useCallback(() => millDispatchApi.list(accessToken).then((v) => { setItems(v); setError(null); }).catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Dispatches could not be loaded.')), [accessToken]);
  useEffect(() => { load(); const t = setInterval(load, 45000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (hasPermission('milldispatch.request')) millDispatchApi.options(accessToken).then(setOptions).catch(() => {}); }, [accessToken, hasPermission]);
  useEffect(() => {
    if (!focusId || !items) return;
    const t = setTimeout(() => document.querySelector('[data-focus="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
    return () => clearTimeout(t);
  }, [focusId, items]);

  const millsToMill = (options?.toMill?.places ?? []).flatMap((p) => p.mills.map((m) => ({ id: m.id, label: `${m.name} (from ${p.warehouse.name})`, paddy: p.paddy })));
  const millsToWh = options?.toWarehouse?.mills ?? [];
  const chosenPaddy = millsToMill.find((m) => m.id === mill)?.paddy ?? [];
  const chosen = millsToWh.find((m) => m.id === mill);
  const open = (dir: 'TO_MILL' | 'TO_WAREHOUSE') => {
    setForm(dir); setProblems([]); setActionError(null); setNotice(null); setPaddy({}); setPackaged({}); setBroken(''); setHull('');
    const first = dir === 'TO_MILL' ? (options?.toMill?.places ?? []).flatMap((p) => p.mills)[0] : options?.toWarehouse?.mills[0];
    setMill(first?.id ?? '');
  };
  const send = async () => {
    if (!form) return; const out: string[] = []; const lines: MillDispatchInput['lines'] = [];
    if (!mill) out.push('Choose the milling center.');
    if (form === 'TO_MILL') {
      for (const l of linesOf(paddy)) { lines.push({ kind: 'PADDY', paddyGradeId: l.paddyGradeId, bags: l.bags }); const have = chosenPaddy.find((g) => g.paddyGradeId === l.paddyGradeId); if (have && l.bags > have.bags) out.push(`The warehouse has only ${have.bags} bag${have.bags === 1 ? '' : 's'} of ${have.label}.`); }
      if (lines.length === 0) out.push('Put the bags on Size 4 or Size 5.');
    } else if (chosen) {
      for (const p of chosen.packaged) { const n = packaged[`${p.productId}:${p.packagingSizeId}`] ?? 0; if (n > 0) { lines.push({ kind: 'PACKAGED_RICE', productId: p.productId, packagingSizeId: p.packagingSizeId, bags: n }); if (n > p.bags) out.push(`The mill has only ${p.bags} bags of ${p.label}.`); } }
      if (Number(broken) > 0) { lines.push({ kind: 'BROKEN_RICE', kg: Number(broken) }); if (chosen.broken && Number(broken) > chosen.broken.kg) out.push(`The mill has only ${chosen.broken.kg} kg of broken rice.`); }
      if (Number(hull) > 0) { lines.push({ kind: 'RICE_HULL', kg: Number(hull) }); if (chosen.hull && Number(hull) > chosen.hull.kg) out.push(`The mill has only ${chosen.hull.kg} kg of rice hull.`); }
      if (lines.length === 0) out.push('Say what you are sending: packaged rice, broken rice or rice hull.');
    }
    setProblems(out); setActionError(null); if (out.length > 0) return;
    setBusy(true);
    try {
      const v = await millDispatchApi.request(accessToken, { direction: form, millingCenterId: mill, lines, driverName: driver.trim() || undefined, vehiclePlate: vehicle.trim() || undefined, notes: note.trim() || undefined });
      setForm(null); setDriver(''); setVehicle(''); setNote(''); await load();
      setNotice(`Asked: ${v.lines.map(lineText).join(', ')} to ${v.to}. It is waiting for the ${v.approverRole} to approve; nothing has left yet.`);
    } catch (e) { setActionError(e instanceof ApiError ? e.message : 'That did not go through. Nothing was sent. Please try again.'); } finally { setBusy(false); }
  };
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setActionError(null); setNotice(null);
    try { await fn(); setRejecting(null); setWhy(''); setCounting(null); await load(); setNotice(done); } catch (e) { setActionError(e instanceof ApiError ? e.message : 'That did not go through. Please try again.'); }
  };
  const startCount = (d: MillDispatchView) => { setCounting(d.id); setCounted(Object.fromEntries(d.lines.map((l) => [l.key, String(l.kind === 'BROKEN_RICE' || l.kind === 'RICE_HULL' ? l.kg : l.bags)]))); setCountNote(''); setActionError(null); };
  const confirmCount = (d: MillDispatchView) => act(() => millDispatchApi.receive(accessToken, d.id, { lines: d.lines.map((l) => (l.kind === 'BROKEN_RICE' || l.kind === 'RICE_HULL' ? { key: l.key, kg: Number(counted[l.key] ?? 0) } : { key: l.key, bags: Number(counted[l.key] ?? 0) })), notes: countNote.trim() || undefined }), `Counted in at ${d.to}. The dispatch now says Received.`);

  const needsMe = (items ?? []).filter((d) => d.canApprove || d.canReceive);
  const mineIds = new Set(needsMe.map((d) => d.id));
  const going = (items ?? []).filter((d) => !mineIds.has(d.id) && ['PENDING_APPROVAL', 'IN_TRANSIT'].includes(d.status));
  const finished = (items ?? []).filter((d) => !mineIds.has(d.id) && !['PENDING_APPROVAL', 'IN_TRANSIT'].includes(d.status)).slice(0, 8);
  const card = (d: MillDispatchView) => (
    <article key={d.id} data-testid="mill-dispatch" data-id={d.id} data-number={d.transferNumber} data-direction={d.direction} data-status={d.status} data-focus={focusId === d.id ? 'true' : undefined} className="rounded-2xl border border-ink-500/15 bg-white p-4 shadow-sm data-[focus=true]:ring-2 data-[focus=true]:ring-husk-500">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg text-paddy-900"><Factory size={18} className="mr-1.5 inline" aria-hidden="true" />{d.from} to {d.to}</h3>
          <p className="text-xs text-ink-500">{d.transferNumber} · {d.direction === 'TO_MILL' ? 'paddy to the mill' : 'finished products to the warehouse'} · asked by {d.requestedBy}, {when(d.requestedAt)}</p>
        </div>
        <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${TONE[d.status]}`} data-testid="md-status">{d.label}</span>
      </div>
      <ul className="mt-2 space-y-0.5 text-base font-medium text-ink-900" data-testid="md-lines">{d.lines.map((l) => <li key={l.key}>{lineText(l)}{l.receivedBags !== null || l.receivedKg !== null ? <span className="text-sm font-normal text-ink-500"> (counted {l.kind === 'BROKEN_RICE' || l.kind === 'RICE_HULL' ? `${l.receivedKg} kg` : l.receivedBags})</span> : null}</li>)}</ul>
      {(d.vehiclePlate || d.driverName) && <p className="mt-1 text-xs text-ink-500">{[d.driverName && `driver ${d.driverName}`, d.vehiclePlate && `vehicle ${d.vehiclePlate}`].filter(Boolean).join(', ')}</p>}
      {d.notes && <p className="mt-2 rounded-lg bg-rice-50 px-3 py-1.5 text-xs text-ink-700">{d.notes}</p>}
      {d.decisionNote && <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-800" data-testid="md-note">{d.decisionNote}</p>}
      <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" data-testid="md-steps">{d.steps.map((s) => <li key={s.label} data-state={s.state} className={s.state === 'done' ? 'text-paddy-900' : s.state === 'stopped' ? 'text-red-700' : s.state === 'current' ? 'font-medium text-amber-800' : 'text-ink-500'}>{s.state === 'done' ? <Check size={12} className="mr-0.5 inline" aria-hidden="true" /> : null}{s.label}{s.who ? ` · ${s.who}` : ''}{s.at ? ` · ${when(s.at)}` : ''}</li>)}</ol>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {d.canApprove && <button type="button" data-testid="md-approve" onClick={() => act(() => millDispatchApi.approve(accessToken, d.id), `Approved. ${d.lines.map(lineText).join(', ')} has left and is on the way to ${d.to}.`)} className={BIG}>Approve</button>}
        {d.canApprove && <button type="button" data-testid="md-refuse" onClick={() => { setRejecting(d.id); setWhy(''); }} className={DANGER}>Not possible</button>}
        {d.canReceive && counting !== d.id && <button type="button" data-testid="md-count" onClick={() => startCount(d)} className={BIG}>{d.direction === 'TO_MILL' ? 'Paddy received at the mill' : 'Received at the warehouse'}</button>}
        {d.canCancel && <button type="button" data-testid="md-cancel" onClick={() => act(() => millDispatchApi.cancel(accessToken, d.id), d.status === 'IN_TRANSIT' ? 'Cancelled. Everything is back in stock.' : 'Cancelled. Nothing had left.')} className={QUIET}>Cancel</button>}
      </div>
      {rejecting === d.id && (
        <div className="mt-3 space-y-2" data-testid="md-refuse-form">
          <label className="block text-sm font-medium text-ink-700">Why? (a few words)<input data-testid="md-refuse-reason" value={why} onChange={(e) => setWhy(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500/25 px-3 py-3 text-base" /></label>
          <div className="flex gap-3"><button type="button" data-testid="md-refuse-confirm" disabled={why.trim().length < 3} onClick={() => act(() => millDispatchApi.reject(accessToken, d.id, why.trim()), 'Not approved. The person who asked has been told why.')} className={DANGER}>Confirm: not possible</button><button type="button" onClick={() => setRejecting(null)} className={QUIET}>Back</button></div>
        </div>
      )}
      {counting === d.id && (
        <div className="mt-3 space-y-3 rounded-2xl border-2 border-paddy-700 p-3" data-testid="md-count-form">
          <p className="text-sm font-medium text-ink-700">How much really arrived?</p>
          {d.lines.map((l) => { const kg = l.kind === 'BROKEN_RICE' || l.kind === 'RICE_HULL'; return (
            <label key={l.key} className="flex items-center justify-between gap-3 text-sm text-ink-700">{l.label} <span className="text-xs text-ink-500">sent: {kg ? `${l.kg} kg` : l.bags}</span>
              <input type="number" min={0} step={kg ? '0.01' : '1'} aria-label={`${kg ? 'Kilograms' : 'Bags'} of ${l.label} that arrived`} value={counted[l.key] ?? ''} onChange={(e) => setCounted((p) => ({ ...p, [l.key]: e.target.value }))} className="w-28 rounded-xl border border-ink-500/25 px-3 py-2 text-base" /></label>); })}
          <label className="block text-sm font-medium text-ink-700">A note (if something was wrong)<input data-testid="md-count-note" value={countNote} onChange={(e) => setCountNote(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500/25 px-3 py-3 text-base" /></label>
          <div className="flex flex-wrap gap-3"><button type="button" data-testid="md-count-confirm" onClick={() => confirmCount(d)} className={BIG}>Confirm: this much arrived</button><button type="button" onClick={() => setCounting(null)} className={QUIET}>Back</button></div>
        </div>
      )}
    </article>
  );
  const section = (title: string, testid: string, rows: MillDispatchView[]) => rows.length > 0 && (<section data-testid={testid} aria-label={title}><h2 className="font-display text-lg text-paddy-900">{title}<span className="ml-2 rounded-full bg-husk-300 px-2 py-0.5 text-xs font-medium text-soil-700">{rows.length}</span></h2><div className="mt-2 space-y-3">{rows.map(card)}</div></section>);

  return (
    <div className="space-y-8" data-testid="mill-dispatch-desk">
      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" data-testid="md-notice" className="rounded-xl border border-paddy-700 bg-paddy-50 px-4 py-2.5 text-sm font-medium text-paddy-900">{notice}</p>}
      {actionError && <p role="alert" data-testid="md-error" className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{actionError}</p>}

      <div className="rounded-2xl border border-paddy-100 bg-white p-4" data-testid="mill-steps">
        <p className="text-sm font-medium text-paddy-900">How the mill works, step by step</p>
        <ol className="mt-2 grid gap-3 text-sm text-ink-700 sm:grid-cols-5">
          <li><strong>1. Ask for paddy.</strong> The mill asks its warehouse; the Warehouse Supervisor approves.</li>
          <li><strong>2. Count it in.</strong> When it arrives the mill counts the bags. That is the mill&rsquo;s record of paddy received.</li>
          <li><strong>3. Record the milling.</strong> {hasPermission('milling.view') ? <a href="/production" className="font-medium text-paddy-700 underline">Production</a> : 'Production'}: the paddy used, and the rice, broken rice and hull recovered.</li>
          <li><strong>4. Record the packaging.</strong> {hasPermission('packaging.create') ? <a href="/packaging" className="font-medium text-paddy-700 underline">Packaging</a> : 'Packaging'}: the packaged rice.</li>
          <li><strong>5. Send it back.</strong> Packaged rice, broken rice and hull go to the warehouse, which counts them in.</li>
        </ol>
      </div>

      {options && !form && (
        <div className="flex flex-wrap gap-3">
          {options.toMill && millsToMill.length > 0 && <button type="button" data-testid="md-open-paddy" onClick={() => open('TO_MILL')} className={`${BIG} inline-flex items-center gap-2`}><Plus size={18} aria-hidden="true" /> {options.toMill.asOfficer ? 'Ask for paddy for the mill' : 'Send paddy to the mill'}</button>}
          {options.toWarehouse && millsToWh.length > 0 && <button type="button" data-testid="md-open-products" onClick={() => open('TO_WAREHOUSE')} className={`${BIG} inline-flex items-center gap-2`}><Plus size={18} aria-hidden="true" /> Send finished products to the warehouse</button>}
        </div>
      )}
      {form && (
        <form data-testid="md-form" onSubmit={(e) => { e.preventDefault(); send(); }} noValidate className="space-y-4 rounded-2xl border-2 border-paddy-700 bg-white p-4">
          <h2 className="font-display text-lg text-paddy-900">{form === 'TO_MILL' ? 'Send paddy to the milling center' : 'Send finished products to the warehouse'}</h2>
          <label className="block text-sm font-medium text-ink-700">{form === 'TO_MILL' ? 'Milling center' : 'From the milling center'}
            <select data-testid="md-mill" value={mill} onChange={(e) => { setMill(e.target.value); setPackaged({}); }} className="mt-1 w-full rounded-xl border border-ink-500/25 bg-white px-3 py-3 text-base">
              {(form === 'TO_MILL' ? millsToMill : millsToWh.map((m) => ({ id: m.id, label: `${m.name} (to ${m.warehouse.name})` }))).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          {form === 'TO_MILL' ? (
            <SizeBags grades={chosenPaddy.map((g) => ({ id: g.paddyGradeId, label: g.label }))} value={paddy} onChange={setPaddy} hints={Object.fromEntries(chosenPaddy.map((g) => [g.paddyGradeId, <span key={g.paddyGradeId} className="text-xs text-ink-500">in stock: {g.bags}</span>]))} />
          ) : chosen && (
            <div className="space-y-3" data-testid="md-products">
              {chosen.packaged.length === 0 && <p className="text-sm text-ink-500">No packaged rice is waiting at this mill.</p>}
              {chosen.packaged.map((p) => (<label key={`${p.productId}:${p.packagingSizeId}`} className="flex items-center justify-between gap-3 text-sm text-ink-700">{p.label} <span className="text-xs text-ink-500">at the mill: {p.bags} bags</span>
                <input type="number" min={0} max={p.bags} aria-label={`Bags of ${p.label}`} value={packaged[`${p.productId}:${p.packagingSizeId}`] ?? ''} onChange={(e) => setPackaged((x) => ({ ...x, [`${p.productId}:${p.packagingSizeId}`]: Number(e.target.value) }))} className="w-28 rounded-xl border border-ink-500/25 px-3 py-2 text-base" /></label>))}
              <label className="flex items-center justify-between gap-3 text-sm text-ink-700">Broken rice (kg) <span className="text-xs text-ink-500">at the mill: {chosen.broken?.kg ?? 0} kg</span><input type="number" min={0} step="0.01" aria-label="Kilograms of broken rice" value={broken} onChange={(e) => setBroken(e.target.value)} className="w-28 rounded-xl border border-ink-500/25 px-3 py-2 text-base" /></label>
              <label className="flex items-center justify-between gap-3 text-sm text-ink-700">Rice hull (kg) <span className="text-xs text-ink-500">at the mill: {chosen.hull?.kg ?? 0} kg</span><input type="number" min={0} step="0.01" aria-label="Kilograms of rice hull" value={hull} onChange={(e) => setHull(e.target.value)} className="w-28 rounded-xl border border-ink-500/25 px-3 py-2 text-base" /></label>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-ink-700">Driver (if you know)<input data-testid="md-driver" value={driver} onChange={(e) => setDriver(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500/25 px-3 py-3 text-base" /></label>
            <label className="block text-sm font-medium text-ink-700">Vehicle number (if you know)<input data-testid="md-vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500/25 px-3 py-3 text-base" /></label>
          </div>
          <label className="block text-sm font-medium text-ink-700">A note (if you want)<input data-testid="md-note-input" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500/25 px-3 py-3 text-base" /></label>
          {problems.length > 0 && <ul role="alert" data-testid="md-problems" className="space-y-1 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <div className="flex flex-wrap gap-3"><button type="submit" data-testid="md-send" disabled={busy} className={BIG}>{busy ? 'Sending...' : 'Ask for approval'}</button><button type="button" data-testid="md-close" onClick={() => setForm(null)} className={QUIET}>Close</button></div>
          <p className="text-xs text-ink-500">Nothing leaves until it is approved. When it is approved it leaves the stock and is on the way, and it joins the other end&rsquo;s stock when they count it in.</p>
        </form>
      )}

      {items !== null && items.length === 0 && <p className="rounded-xl bg-white px-4 py-3 text-sm text-ink-500" data-testid="md-empty">No mill dispatches yet.</p>}
      {section('Needs you', 'md-needs', needsMe)}
      {section('On the way, or waiting for approval', 'md-going', going)}
      {section('Done', 'md-done', finished)}
    </div>
  );
}
