'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, MapPin, Plus, RefreshCw } from 'lucide-react';
import { ApiError, SupplySources, SupplyView, supplyApi } from '@/lib/api-client';
import { ageLabel } from '@/lib/sales-flow';
import { longDate } from '@/lib/dates';
import { SupplyRequestForm } from '@/components/supply/SupplyRequestForm';
import { Whereabouts } from '@/components/supply/Whereabouts';

const TONE: Record<string, string> = {
  WITH_REVIEWER: 'bg-husk-300 text-soil-700', WITH_SUPPLIER: 'bg-amber-100 text-amber-900', DISPATCHING: 'bg-amber-100 text-amber-900',
  ON_THE_WAY: 'bg-paddy-100 text-paddy-700', RECEIVED: 'bg-paddy-900 text-rice-50', READY: 'bg-paddy-900 text-rice-50', DECLINED: 'bg-red-100 text-red-800', CANCELLED: 'bg-ink-500/10 text-ink-500',
};
const sizesOf = (c: SupplyView) => c.lines.map((l) => `${l.gradeLabel}: ${l.bags}`).join('  ·  ');

interface Props { accessToken: string; me: { id: string; roles: { code: string; scopes?: { scopeType: string; scopeId: string | null }[] }[] }; hasPermission: (code: string) => boolean; variant?: 'page' | 'dashboard' | 'office'; focusNumber?: string | null }

/**
 * The paddy request chain on one screen, for everyone in it. What each person must DO comes first, in big buttons with few words: send it on, say
 * it is not possible, choose a farm (with the farms' stock beside each choice), say the paddy is ready. Everything else is there to follow, with where
 * it is and whose move it is, until the paddy arrives.
 */
export function SupplyDesk({ accessToken, me, hasPermission, variant = 'page', focusNumber = null }: Props) {
  const roles = me.roles.map((r) => r.code);
  const isAdmin = roles.includes('ADMIN');
  const canRequest = hasPermission('supply.request');
  const mayReview = (c: SupplyView) => isAdmin || roles.includes(c.kind === 'WAREHOUSE' ? 'WAREHOUSE_SUPERVISOR' : 'OPERATIONS_MANAGER');
  const maySupply = (c: SupplyView) => isAdmin || roles.includes(c.kind === 'WAREHOUSE' ? 'FARM_DIRECTOR' : 'WAREHOUSE_SUPERVISOR');
  const allowWarehouse = isAdmin || roles.includes('WAREHOUSE_MANAGER') || roles.includes('WAREHOUSE_SUPERVISOR');
  const allowMill = isAdmin || roles.includes('OPERATIONS_OFFICER') || roles.includes('OPERATIONS_MANAGER');
  const idsOf = (type: string) => { const all = me.roles.flatMap((r) => r.scopes ?? []); return all.some((s) => s.scopeType === 'GLOBAL') ? null : all.filter((s) => s.scopeType === type && s.scopeId).map((s) => s.scopeId as string); };

  const [cards, setCards] = useState<SupplyView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showWhere, setShowWhere] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [choosing, setChoosing] = useState<string | null>(null);
  const [sources, setSources] = useState<Record<string, SupplySources>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(() => supplyApi.board(accessToken).then((c) => { setCards(c); setError(null); }).catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Paddy requests could not be loaded.')), [accessToken]);
  useEffect(() => { load(); const t = setInterval(load, 45000); return () => clearInterval(t); }, [load]);
  const loaded = cards !== null;
  useEffect(() => {
    if (!focusNumber || !loaded) return;
    setExpanded((p) => new Set(p).add(focusNumber));
    const t = setTimeout(() => document.querySelector('[data-focus="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    return () => clearTimeout(t);
  }, [focusNumber, loaded]);

  // A mill request the Warehouse Supervisor has already asked the Farm Director about is waiting for the paddy to arrive: it is theirs again when it has.
  const waitingOnFarms = (c: SupplyView) => c.kind === 'MILL' && !!c.childNumber && !['RECEIVED', 'DECLINED', 'CANCELLED'].includes(c.childStage ?? '');
  // Another warehouse was asked to send it: its supervisor sends it (on the Deliveries desk). A mill whose paddy is ready confirms it has reached the mill.
  const sendsFor = (c: SupplyView) => { const ids = idsOf('WAREHOUSE'); return c.status === 'ASSIGNED' && !!c.sourceWarehouse && !c.transfer && (isAdmin || roles.includes('WAREHOUSE_SUPERVISOR')) && (ids === null || ids.includes(c.sourceWarehouse.id)); };
  const mayCount = (c: SupplyView) => { const ids = idsOf('MILLING_CENTER'); return c.kind === 'MILL' && c.status === 'READY' && (isAdmin || roles.includes('OPERATIONS_OFFICER') || roles.includes('OPERATIONS_MANAGER')) && (ids === null || (!!c.millingCenter && ids.includes(c.millingCenter.id))); };
  const needsMe = (c: SupplyView) => (c.status === 'SUBMITTED' && hasPermission('supply.forward') && mayReview(c)) || (c.status === 'FORWARDED' && hasPermission('supply.fulfil') && maySupply(c) && !waitingOnFarms(c)) || sendsFor(c) || mayCount(c);
  // a mill request waiting for the Warehouse Supervisor shows the warehouse's stock beside it straight away
  useEffect(() => {
    (cards ?? []).filter((c) => c.kind === 'MILL' && c.status === 'FORWARDED' && needsMe(c) && !sources[c.id]).forEach((c) => {
      supplyApi.sources(accessToken, c.id).then((s) => setSources((p) => ({ ...p, [c.id]: s }))).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setActionError(null); setNotice(null);
    try { await fn(); setNotice(success); setDeclining(null); setChoosing(null); setReason(''); await load(); } catch (err) { setActionError(err instanceof ApiError ? err.message : 'That did not go through. Please try again.'); }
  };
  const choose = async (c: SupplyView) => {
    setChoosing(c.id); setActionError(null);
    if (!sources[c.id]) { try { const s = await supplyApi.sources(accessToken, c.id); setSources((p) => ({ ...p, [c.id]: s })); } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Could not load the farms\' stock.'); } }
  };
  const toggle = (id: string) => setExpanded((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const asker = (c: SupplyView) => c.millingCenter?.name ?? c.warehouse.name;

  const mine = (cards ?? []).filter(needsMe);
  const mineIds = new Set(mine.map((c) => c.id));
  const open = (cards ?? []).filter((c) => !mineIds.has(c.id) && !['RECEIVED', 'READY', 'DECLINED', 'CANCELLED'].includes(c.stage));
  const done = (cards ?? []).filter((c) => !mineIds.has(c.id) && ['RECEIVED', 'READY', 'DECLINED', 'CANCELLED'].includes(c.stage)).slice(0, variant === 'page' ? 10 : 3);
  const compact = variant !== 'page';

  const check = (s: { label: string; has: number; needed: number; enough: boolean }) => (
    <span key={s.label} className={`rounded-full px-3 py-1 text-xs font-medium ${s.enough ? 'bg-paddy-100 text-paddy-900' : 'bg-red-100 text-red-800'}`}>{s.label}: has {s.has}, needs {s.needed}</span>
  );

  // Plain render functions, not components defined in here (those would be rebuilt on every refresh).
  const renderCard = (c: SupplyView) => {
    const focus = !!focusNumber && c.requestNumber === focusNumber;
    const src = sources[c.id];
    const first = c.status === 'SUBMITTED' && mine.some((m) => m.id === c.id);
    const second = c.status === 'FORWARDED' && mine.some((m) => m.id === c.id);
    return (
      <article key={c.id} data-testid="supply-card" data-number={c.requestNumber} data-status={c.status} data-kind={c.kind} data-focus={focus ? 'true' : undefined} className={`rounded-2xl border bg-white p-4 ${focus ? 'border-husk-500 ring-2 ring-husk-500' : 'border-paddy-100'}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-xs text-ink-500">{c.requestNumber}{c.parentNumber ? ` · for the mill (${c.parentNumber})` : ''}</p>
            <h3 className="font-display text-lg text-paddy-900" data-testid="supply-title">{asker(c)} needs paddy</h3>
            <p className="mt-0.5 text-base font-medium text-ink-900" data-testid="supply-sizes">{sizesOf(c)}</p>
            <p className="text-xs text-ink-500">{c.totalBags} bags{c.neededBy ? ` · needed by ${longDate(c.neededBy)}` : ''} · asked by {c.requestedBy}</p>
          </div>
          <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${TONE[c.stage] ?? 'bg-ink-500/10'}`} data-testid="supply-stage">{c.label}</span>
        </div>
        {c.notes && <p className="mt-2 rounded-lg bg-rice-50 px-3 py-1.5 text-xs text-ink-700">{c.notes}</p>}
        {c.holder && <p className="mt-2 text-xs text-ink-500" data-testid="supply-holder">With: <strong className="font-medium text-ink-700">{c.holder}</strong>{c.since ? `, ${ageLabel(c.since)}` : ''}</p>}
        {c.status === 'DECLINED' && <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-800" data-testid="supply-declined">{c.decisionNote}</p>}
        {c.dispatch && (
          <p className="mt-2 rounded-lg bg-paddy-50/60 px-3 py-1.5 text-xs text-ink-700" data-testid="supply-dispatch">
            {c.sourceFarm?.name ?? 'The farm'} is sending it{c.dispatch.driverName || c.dispatch.vehiclePlate ? `: ${[c.dispatch.driverName && `driver ${c.dispatch.driverName}`, c.dispatch.vehiclePlate && `vehicle ${c.dispatch.vehiclePlate}`].filter(Boolean).join(', ')}` : ''}
            {hasPermission('delivery.create') && <a href={`/deliveries?request=${encodeURIComponent(c.dispatch.requestRef)}`} className="ml-2 font-medium text-paddy-700 underline">Open the dispatch</a>}
          </p>
        )}
        {c.transfer && (
          <p className="mt-2 rounded-lg bg-paddy-50/60 px-3 py-1.5 text-xs text-ink-700" data-testid="supply-transfer">
            {c.sourceWarehouse?.name ?? 'The warehouse'} is sending it{c.transfer.driverName || c.transfer.vehiclePlate ? `: ${[c.transfer.driverName && `driver ${c.transfer.driverName}`, c.transfer.vehiclePlate && `vehicle ${c.transfer.vehiclePlate}`].filter(Boolean).join(', ')}` : ''}
            {(hasPermission('warehouse.transfer') || hasPermission('warehouse.receive')) && <a href={`/site-deliveries?transfer=${encodeURIComponent(c.transfer.id)}`} className="ml-2 font-medium text-paddy-700 underline">Open the delivery</a>}
          </p>
        )}
        {c.childNumber && <p className="mt-2 text-xs text-ink-500">The Farm Director was asked for the rest ({c.childNumber}).</p>}
        <div className="mt-3 flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={c.steps.length} aria-valuenow={c.steps.filter((s) => s.state === 'done').length} aria-label="How far this request has come">
          {c.steps.map((s, i) => <span key={i} title={s.label} className={`h-1.5 flex-1 rounded-full ${s.state === 'done' ? 'bg-paddy-700' : s.state === 'current' ? 'animate-pulse bg-husk-500' : s.state === 'stopped' ? 'bg-red-500' : 'bg-ink-500/15'}`} />)}
        </div>

        {first && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" data-testid="act-forward" onClick={() => run(() => supplyApi.forward(accessToken, c.id), `Sent on to the ${c.kind === 'WAREHOUSE' ? 'Farm Director' : 'Warehouse Supervisor'}.`)} className="rounded-full bg-paddy-900 px-6 py-3 text-base font-medium text-rice-50">{c.kind === 'WAREHOUSE' ? 'Send to the Farm Director' : 'Send to the Warehouse Supervisor'}</button>
            <button type="button" data-testid="act-decline" onClick={() => { setDeclining(c.id); setReason(''); }} className="rounded-full border-2 border-red-300 px-5 py-3 text-sm font-medium text-red-700">Not possible</button>
          </div>
        )}
        {second && c.kind === 'WAREHOUSE' && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" data-testid="act-choose-farm" onClick={() => choose(c)} className="rounded-full bg-paddy-900 px-6 py-3 text-base font-medium text-rice-50">Choose where it comes from</button>
            <button type="button" data-testid="act-decline" onClick={() => { setDeclining(c.id); setReason(''); }} className="rounded-full border-2 border-red-300 px-5 py-3 text-sm font-medium text-red-700">Not possible</button>
          </div>
        )}
        {second && c.kind === 'WAREHOUSE' && choosing === c.id && src?.kind === 'WAREHOUSE' && (
          <ul className="mt-3 space-y-2" data-testid="farm-options">
            {src.farms.map((f) => (
              <li key={f.farmId} data-testid="farm-option" data-farm={f.farmName} data-can-cover={f.canCover ? 'yes' : 'no'} className={`rounded-2xl border-2 p-3 ${f.canCover ? 'border-paddy-700' : 'border-ink-500/20'}`}>
                <p className="font-medium text-ink-900">{f.farmName}{f.managers.length > 0 && <span className="text-xs font-normal text-ink-500"> · manager {f.managers.join(', ')}</span>}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">{f.bySize.map(check)}</div>
                <button type="button" data-testid="act-ask-farm" disabled={!f.canCover} onClick={() => run(() => supplyApi.assign(accessToken, c.id, { sourceFarmId: f.farmId }), `${f.farmName} will send it. ${f.managers[0] ?? 'Its manager'} has the task.`)} className="mt-2 rounded-full bg-paddy-900 px-5 py-2.5 text-sm font-medium text-rice-50 disabled:bg-ink-500/30">{f.canCover ? `Ask ${f.farmName} to send it` : 'Not enough here'}</button>
              </li>
            ))}
            {src.farms.length === 0 && <li className="text-sm text-ink-500">No farms to choose from.</li>}
          </ul>
        )}
        {second && c.kind === 'WAREHOUSE' && choosing === c.id && src?.kind === 'WAREHOUSE' && src.warehouses.length > 0 && (
          <div className="mt-4" data-testid="warehouse-options">
            <p className="text-sm font-medium text-ink-700">Or from a warehouse that has paddy</p>
            <ul className="mt-2 space-y-2">
              {src.warehouses.map((w) => (
                <li key={w.warehouseId} data-testid="warehouse-option" data-warehouse={w.warehouseName} data-can-cover={w.canCover ? 'yes' : 'no'} className={`rounded-2xl border-2 p-3 ${w.canCover ? 'border-paddy-700' : 'border-ink-500/20'}`}>
                  <p className="font-medium text-ink-900">{w.warehouseName}{w.supervisors.length > 0 && <span className="text-xs font-normal text-ink-500"> · supervisor {w.supervisors.join(', ')}</span>}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">{w.bySize.map(check)}</div>
                  <button type="button" data-testid="act-ask-warehouse" disabled={!w.canCover} onClick={() => run(() => supplyApi.assign(accessToken, c.id, { sourceWarehouseId: w.warehouseId }), `${w.warehouseName} will send it. ${w.supervisors[0] ?? 'Its supervisor'} has the task.`)} className="mt-2 rounded-full bg-paddy-900 px-5 py-2.5 text-sm font-medium text-rice-50 disabled:bg-ink-500/30">{w.canCover ? `Ask ${w.warehouseName} to send it` : 'Not enough here'}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {second && c.kind === 'MILL' && (
          <div className="mt-3">
            {src?.kind === 'MILL' ? <div className="flex flex-wrap gap-2" data-testid="mill-stock"><span className="w-full text-xs text-ink-500">In {src.warehouse.name} now:</span>{src.bySize.map(check)}</div> : <p className="text-xs text-ink-500">Checking the stock...</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {src?.kind === 'MILL' && src.canCover && <button type="button" data-testid="act-ready" onClick={() => run(() => supplyApi.ready(accessToken, c.id), 'Done: the paddy is ready for the mill.')} className="rounded-full bg-paddy-900 px-6 py-3 text-base font-medium text-rice-50">Paddy is ready</button>}
              {src?.kind === 'MILL' && !src.canCover && !c.childNumber && <button type="button" data-testid="act-ask-director" onClick={() => run(() => supplyApi.askFarmDirector(accessToken, c.id), 'The Farm Director was asked for what is missing.')} className="rounded-full bg-paddy-900 px-6 py-3 text-base font-medium text-rice-50">Ask the Farm Director for the rest</button>}
              <button type="button" data-testid="act-decline" onClick={() => { setDeclining(c.id); setReason(''); }} className="rounded-full border-2 border-red-300 px-5 py-3 text-sm font-medium text-red-700">Not possible</button>
            </div>
          </div>
        )}
        {sendsFor(c) && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a href={`/site-deliveries?send=${encodeURIComponent(c.requestNumber)}`} data-testid="act-send-paddy" className="rounded-full bg-paddy-900 px-6 py-3 text-base font-medium text-rice-50">Send the paddy</a>
          </div>
        )}
        {mayCount(c) && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" data-testid="act-received" onClick={() => run(() => supplyApi.received(accessToken, c.id), 'Done: the paddy is recorded as received at the mill.')} className="rounded-full bg-paddy-900 px-6 py-3 text-base font-medium text-rice-50">Paddy received at the mill</button>
          </div>
        )}
        {declining === c.id && (
          <div className="mt-3 rounded-2xl border border-red-300 bg-red-50 p-3">
            <label htmlFor={`why-${c.id}`} className="block text-sm font-medium text-red-900">Why is it not possible?</label>
            <input id={`why-${c.id}`} data-testid="decline-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="A few words" className="mt-1 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm" />
            <div className="mt-2 flex items-center gap-3">
              <button type="button" data-testid="decline-confirm" disabled={reason.trim().length < 3} onClick={() => run(() => supplyApi.decline(accessToken, c.id, reason.trim()), 'Sent back with your reason.')} className="rounded-full bg-red-700 px-5 py-2 text-sm font-medium text-white disabled:opacity-40">Send</button>
              <button type="button" onClick={() => setDeclining(null)} className="text-sm text-ink-500">Cancel</button>
            </div>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {c.requestedById === me.id && ['SUBMITTED', 'FORWARDED'].includes(c.status) && <button type="button" data-testid="act-cancel" onClick={() => run(() => supplyApi.cancel(accessToken, c.id), 'The request was cancelled.')} className="text-xs font-medium text-red-700 underline">Cancel this request</button>}
          <button type="button" onClick={() => toggle(c.requestNumber)} aria-expanded={expanded.has(c.requestNumber) || focus} data-testid="act-track" className="inline-flex items-center gap-1 text-xs font-medium text-paddy-700">{expanded.has(c.requestNumber) || focus ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronRight className="h-3 w-3" aria-hidden="true" />} Track</button>
        </div>
        {(expanded.has(c.requestNumber) || focus) && (
          <ol className="mt-3 space-y-2 border-l border-paddy-100 pl-3" data-testid="supply-steps">
            {c.steps.map((s, i) => (
              <li key={i} className="text-xs">
                <p className={`flex items-center gap-1.5 font-medium ${s.state === 'upcoming' ? 'text-ink-500' : s.state === 'stopped' ? 'text-red-700' : 'text-ink-900'}`}>{s.state === 'done' && <Check className="h-3 w-3 text-paddy-700" aria-hidden="true" />}{s.label}{s.state === 'current' && <span className="rounded-full bg-husk-300 px-1.5 text-[10px] text-soil-700">now</span>}</p>
                {(s.who || s.at) && <p className="text-ink-500">{s.who ? `${s.who}, ` : ''}{s.at ? new Date(s.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</p>}
                {s.detail && <p className="text-ink-700">{s.detail}</p>}
              </li>
            ))}
          </ol>
        )}
      </article>
    );
  };

  const renderList = (title: string, testid: string, items: SupplyView[], empty?: string) => (
    <section data-testid={testid} aria-label={title}>
      <h3 className="font-display text-base text-paddy-900">{title} <span className="ml-1 rounded-full bg-paddy-100 px-2 py-0.5 text-xs font-medium text-paddy-700">{items.length}</span></h3>
      {items.length === 0 && empty && <p className="mt-1 text-sm text-ink-500">{empty}</p>}
      <div className="mt-2 space-y-3">{items.map((c) => renderCard(c))}</div>
    </section>
  );

  return (
    <section aria-label="Paddy requests" data-testid="supply-desk" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-display text-xl text-paddy-900">Paddy requests</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => load()} aria-label="Refresh paddy requests" className="grid h-10 w-10 place-items-center rounded-full border border-paddy-100 text-ink-500"><RefreshCw className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" data-testid="open-where" onClick={() => setShowWhere((v) => !v)} aria-pressed={showWhere} className="inline-flex items-center gap-1.5 rounded-full border-2 border-paddy-700 px-4 py-2 text-sm font-medium text-paddy-700"><MapPin className="h-4 w-4" aria-hidden="true" /> Where is the paddy?</button>
          {canRequest && <button type="button" data-testid="open-supply-form" onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50"><Plus className="h-4 w-4" aria-hidden="true" /> {showForm ? 'Close' : 'Ask for paddy'}</button>}
        </div>
      </div>
      {notice && <p role="status" data-testid="supply-notice" className="rounded-xl border border-paddy-700 bg-paddy-50 px-4 py-2.5 text-sm font-medium text-paddy-900">{notice}</p>}
      {actionError && <p role="alert" data-testid="supply-error" className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{actionError}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error} <button type="button" onClick={() => load()} className="ml-2 underline">Try again</button></p>}
      {showWhere && <Whereabouts accessToken={accessToken} />}
      {showForm && canRequest && <SupplyRequestForm accessToken={accessToken} allowWarehouse={allowWarehouse} allowMill={allowMill} onlyWarehouseIds={idsOf('WAREHOUSE')} onlyMillIds={idsOf('MILLING_CENTER')} onSent={() => load()} onClose={() => setShowForm(false)} />}
      {cards === null && !error && <p className="text-sm text-ink-500">Loading...</p>}
      {cards !== null && mine.length > 0 && renderList('Your move', 'supply-needs-action', mine)}
      {cards !== null && mine.length === 0 && (hasPermission('supply.forward') || hasPermission('supply.fulfil')) && <p className="rounded-xl bg-white px-4 py-3 text-sm text-ink-500" data-testid="supply-nothing">Nothing needs you right now.</p>}
      {cards !== null && renderList('On the way', 'supply-progress', compact ? open.slice(0, 3) : open, 'No requests on the way.')}
      {cards !== null && done.length > 0 && renderList('Done', 'supply-done', done)}
      {compact && <a href="/warehouse-requests" className="inline-block text-xs font-medium text-paddy-700 underline">Open all paddy requests</a>}
    </section>
  );
}
