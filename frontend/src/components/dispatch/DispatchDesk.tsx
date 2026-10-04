'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { ApiError, DispatchResult, DispatchView, RequestCard, deliveryOrdersApi, deliveryReportsApi } from '@/lib/api-client';
import { ageLabel } from '@/lib/sales-flow';
import { longDate } from '@/lib/dates';
import { ReviewDialog } from '@/components/review/ReviewDialog';
import { DispatchRequestForm } from '@/components/dispatch/DispatchRequestForm';
import { DispatchForm } from '@/components/dispatch/DispatchForm';
import { DispatchDetails } from '@/components/dispatch/DispatchDetails';
import { DispatchSent } from '@/components/dispatch/DispatchFeedback';

const TONE: Record<string, string> = {
  REQUESTED: 'bg-husk-300 text-soil-700', PREPARING: 'bg-husk-300 text-soil-700', IN_REVIEW: 'bg-amber-100 text-amber-900',
  ON_THE_WAY: 'bg-paddy-100 text-paddy-700', ARRIVED: 'bg-paddy-900 text-rice-50', CANCELLED: 'bg-ink-500/10 text-ink-500',
};
const when = (iso: string) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const describe = (d: Pick<DispatchView, 'lines' | 'totalBags'>) => (d.lines.length === 1 ? `${d.totalBags} bags of ${d.lines[0].gradeLabel}` : `${d.totalBags} bags (${d.lines.map((l) => `${l.gradeLabel} ${l.bags}`).join(', ')})`);
const bagsText = (c: RequestCard) => c.lines.map((l) => `${l.gradeLabel}: ${l.bagCount} bag${l.bagCount === 1 ? '' : 's'}`).join(' · ');

interface Props {
  accessToken: string;
  me: { id: string; roles: { code: string }[] };
  hasPermission: (code: string) => boolean;
  /** page: the whole desk; dashboard / office: the same desk, a little tighter, with a link to the full page. */
  variant?: 'page' | 'dashboard' | 'office';
  /** A request reference to highlight (arriving from a task). */
  focusRef?: string | null;
}

/**
 * THE shared screen of the Farm Supervisor and the farm manager. Every dispatch request is one card, the same card for both of them: where it
 * goes and when, which sizes, where it is now and whose move it is. What each person must DO comes first: the manager loads the truck and submits
 * ONE dispatch with every size; the supervisor approves that dispatch as one. Everything else is there to follow, until it arrives.
 */
export function DispatchDesk({ accessToken, me, hasPermission, variant = 'page', focusRef = null }: Props) {
  const roles = me.roles.map((r) => r.code);
  const isAdmin = roles.includes('ADMIN');
  const isSupervisor = isAdmin || roles.includes('FARM_DIRECTOR');
  const isManager = isAdmin || roles.includes('FARM_MANAGER');
  const canApprove = isSupervisor && hasPermission('delivery.approve');
  const canDispatch = isManager && hasPermission('delivery.create');
  const canRequest = hasPermission('delivery.create');

  const [cards, setCards] = useState<RequestCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [dispatching, setDispatching] = useState<{ card: RequestCard; previous: DispatchView | null } | null>(null);
  const [reviewing, setReviewing] = useState<{ card: RequestCard; dispatch: DispatchView } | null>(null);
  const [sent, setSent] = useState<DispatchResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(
    () => deliveryOrdersApi.requests(accessToken).then((c) => { setCards(c); setError(null); }).catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'The dispatch desk could not be loaded.')),
    [accessToken],
  );
  useEffect(() => {
    load();
    const t = setInterval(load, 45000);
    return () => clearInterval(t);
  }, [load]);
  const loaded = cards !== null;
  useEffect(() => {
    if (!focusRef || !loaded) return;
    setExpanded((prev) => new Set(prev).add(focusRef));
    const t = setTimeout(() => document.querySelector('[data-focus="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    return () => clearTimeout(t);
  }, [focusRef, loaded]);

  const mine = (c: RequestCard) => ({
    review: canApprove ? c.dispatches.find((d) => d.status === 'SUPERVISOR_REVIEW' && d.preparedById !== me.id) : undefined,
    draft: canDispatch ? c.dispatches.find((d) => d.status === 'DRAFT' && d.preparedById === me.id) : undefined,
    load: canDispatch && (c.stage === 'REQUESTED' || c.stage === 'PREPARING'),
  });
  const urgent = (a: RequestCard, b: RequestCard) => Number(b.overdue) - Number(a.overdue) || String(a.requestedDate).localeCompare(String(b.requestedDate));
  const needs = (cards ?? []).filter((c) => { const m = mine(c); return !!m.review || !!m.draft || m.load; }).sort(urgent);
  const needKeys = new Set(needs.map((c) => c.key));
  const progress = (cards ?? []).filter((c) => !needKeys.has(c.key) && c.stage !== 'ARRIVED' && c.stage !== 'CANCELLED').sort(urgent);
  const arrived = (cards ?? []).filter((c) => c.stage === 'ARRIVED' && (!c.arrivedAt || Date.now() - new Date(c.arrivedAt).getTime() < 14 * 86400000));
  const compact = variant !== 'page';
  const shownProgress = compact && !showAll ? progress.slice(0, 3) : progress;

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setActionError(null);
    setNotice(null);
    try { await fn(); setNotice(success); await load(); } catch (err) { setActionError(err instanceof ApiError ? err.message : 'That did not go through. Please try again.'); }
  };
  const sendDraft = (d: DispatchView) => run(() => (d.dispatchRef ? deliveryReportsApi.submitDispatch(accessToken, d.ref) : deliveryReportsApi.submit(accessToken, d.lines[0].reportId)), `Sent to the Farm Supervisor for approval: ${describe(d)}.`);
  const toggle = (key: string) => setExpanded((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const intro = isSupervisor && !isManager
    ? 'Ask a farm manager to dispatch, approve what they prepare, and follow it until it arrives.'
    : isManager && !isSupervisor
      ? 'Requests from your Farm Supervisor. Load the truck, then submit ONE dispatch with every size on it.'
      : 'Dispatch requests, the dispatches prepared for them, and where each one is now.';

  // Plain render functions, NOT components defined in here: a component defined inside another is rebuilt on every refresh, which would wipe a
  // half-typed dispatch form every time the desk updates.
  const renderCard = (c: RequestCard) => {
    const m = mine(c);
    const open = expanded.has(c.key) || (!!focusRef && c.requestRef === focusRef);
    const highlight = !!focusRef && c.requestRef === focusRef;
    const lastBack = c.dispatches.find((d) => d.status === 'REJECTED') ?? null;
    const draftForForm = m.draft ?? lastBack;
    const done = c.steps.filter((s) => s.state === 'done').length;
    return (
      <article key={c.key} data-testid="request-card" data-request={c.requestRef ?? c.key} data-stage={c.stage} data-focus={highlight ? 'true' : undefined} className={`rounded-2xl border bg-white p-4 ${highlight ? 'border-husk-500 ring-2 ring-husk-500' : 'border-paddy-100'}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-xs text-ink-500">{c.requestRef ?? c.key}{c.priority !== 'NORMAL' && <span className={`ml-2 rounded-full px-2 py-0.5 font-sans text-[10px] font-medium ${c.priority === 'URGENT' ? 'bg-red-100 text-red-800' : c.priority === 'HIGH' ? 'bg-amber-100 text-amber-900' : 'bg-ink-500/10 text-ink-700'}`}>{c.priority.toLowerCase()}</span>}
              {c.overdue && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 font-sans text-[10px] font-medium text-red-800" data-testid="overdue-chip">{c.daysOverdue} day{c.daysOverdue === 1 ? '' : 's'} late</span>}</p>
            <h3 className="mt-0.5 font-display text-lg text-paddy-900" data-testid="card-route">{c.farm.name} &rarr; <span data-testid="card-warehouse">{c.warehouse.name}</span>{c.warehouse.location ? <span className="text-base text-ink-500" data-testid="card-location"> ({c.warehouse.location})</span> : null}</h3>
            <p className="mt-0.5 text-sm text-ink-700" data-testid="card-sizes">{bagsText(c)}{c.lines.length > 1 ? ` · ${c.totalBags} bags in all` : ''}</p>
            {c.requestedDate && <p className="text-xs text-ink-500">Needed by {longDate(c.requestedDate)}{c.requestedBy ? ` · asked by ${c.requestedBy}` : ''}</p>}
          </div>
          <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${TONE[c.stage] ?? 'bg-ink-500/10'}`} data-testid="card-stage">{c.label}</span>
        </div>
        {c.notes && <p className="mt-2 rounded-lg bg-rice-50 px-3 py-1.5 text-xs text-ink-700" data-testid="card-notes"><span className="font-medium">Instructions:</span> {c.notes}</p>}
        {c.holder && <p className="mt-2 text-xs text-ink-500" data-testid="card-holder">With: <strong className="font-medium text-ink-700">{c.holder}</strong>{c.since ? `, ${ageLabel(c.since)}` : ''}</p>}
        {c.sentBack && <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-800" data-testid="card-sentback"><span className="font-medium">Sent back:</span> {c.sentBack}</p>}
        {c.dispatches.map((d) => (
          <p key={d.ref} className="mt-2 rounded-lg bg-paddy-50/60 px-3 py-1.5 text-xs text-ink-700" data-testid="card-dispatch">
            <span className="font-medium text-paddy-900">{d.dispatchRef ? `Dispatch ${d.dispatchRef}` : `Report ${d.ref}`}</span>: {describe(d)}{d.preparedBy ? `, prepared by ${d.preparedBy}` : ''}
            {(d.driverName || d.vehiclePlate) ? ` · ${[d.driverName && `driver ${d.driverName}`, d.vehiclePlate && `vehicle ${d.vehiclePlate}`].filter(Boolean).join(', ')}` : ''}
            <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-ink-700">{d.status.replace(/_/g, ' ').toLowerCase()}</span>
          </p>
        ))}
        {c.stage === 'ARRIVED' && c.bagVariance !== null && <p className={`mt-2 text-xs ${c.bagVariance === 0 ? 'text-paddy-700' : 'font-medium text-red-700'}`} data-testid="card-variance">{c.bagVariance === 0 ? 'Every bag arrived.' : `${Math.abs(c.bagVariance)} bag${Math.abs(c.bagVariance) === 1 ? '' : 's'} ${c.bagVariance < 0 ? 'short' : 'extra'} on arrival.`}{c.varianceRequiresApproval ? ' Needs approval.' : ''}</p>}
        <div className="mt-3 flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={c.steps.length} aria-valuenow={done} aria-label="How far this dispatch has come">
          {c.steps.map((s) => <span key={s.id} title={s.label} className={`h-1.5 flex-1 rounded-full ${s.state === 'done' ? 'bg-paddy-700' : s.state === 'current' ? 'animate-pulse bg-husk-500' : 'bg-ink-500/15'}`} />)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {m.review && <button type="button" data-testid="act-review" onClick={() => setReviewing({ card: c, dispatch: m.review! })} className="rounded-full bg-paddy-900 px-5 py-1.5 text-xs font-medium text-rice-50">Review &amp; approve</button>}
          {m.draft && <button type="button" data-testid="act-send-draft" onClick={() => sendDraft(m.draft!)} className="rounded-full bg-paddy-900 px-5 py-1.5 text-xs font-medium text-rice-50">Send for approval</button>}
          {m.load && <button type="button" data-testid="act-dispatch" onClick={() => { setDispatching({ card: c, previous: draftForForm }); setExpanded((p) => new Set(p).add(c.key)); }} className={`rounded-full px-5 py-1.5 text-xs font-medium ${m.draft ? 'border border-paddy-700 text-paddy-700' : 'bg-paddy-900 text-rice-50'}`}>{c.sentBack ? 'Prepare it again' : m.draft ? 'Change it' : 'Load & dispatch'}</button>}
          <button type="button" onClick={() => toggle(c.key)} aria-expanded={open} data-testid="act-track" className="inline-flex items-center gap-1 text-xs font-medium text-paddy-700">{open ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronRight className="h-3 w-3" aria-hidden="true" />} Track</button>
        </div>
        {open && (
          <ol className="mt-3 space-y-2 border-l border-paddy-100 pl-3" data-testid="card-steps">
            {c.steps.map((s) => (
              <li key={s.id} className="text-xs">
                <p className={`flex items-center gap-1.5 font-medium ${s.state === 'upcoming' ? 'text-ink-500' : 'text-ink-900'}`}>{s.state === 'done' && <Check className="h-3 w-3 text-paddy-700" aria-hidden="true" />}{s.label}{s.state === 'current' && <span className="rounded-full bg-husk-300 px-1.5 text-[10px] text-soil-700">now</span>}</p>
                {(s.at || s.by) && <p className="text-ink-500">{s.by ? `${s.by}, ` : ''}{s.at ? when(s.at) : ''}</p>}
                {s.detail && <p className="text-ink-700">{s.detail}</p>}
              </li>
            ))}
          </ol>
        )}
        {dispatching?.card.key === c.key && (
          <DispatchForm accessToken={accessToken} card={c} previous={dispatching.previous} onCancel={() => setDispatching(null)} onDone={(r) => { setDispatching(null); setSent(r); load(); }} />
        )}
      </article>
    );
  };

  const renderList = ({ title, testid, items, hint }: { title: string; testid: string; items: RequestCard[]; hint?: string }) => (
    <section data-testid={testid} aria-label={title}>
      <h3 className="font-display text-base text-paddy-900">{title} <span className="ml-1 rounded-full bg-paddy-100 px-2 py-0.5 text-xs font-medium text-paddy-700">{items.length}</span></h3>
      {hint && <p className="text-xs text-ink-500">{hint}</p>}
      <div className="mt-2 space-y-3">{items.map((c) => renderCard(c))}</div>
    </section>
  );

  return (
    <section aria-label="Dispatch desk" data-testid="dispatch-desk" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-paddy-900">Dispatch desk</h2>
          {!compact && <p className="mt-0.5 max-w-2xl text-sm text-ink-500">{intro}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => load()} aria-label="Refresh the dispatch desk" className="grid h-9 w-9 place-items-center rounded-full border border-paddy-100 text-ink-500 hover:text-paddy-900"><RefreshCw className="h-4 w-4" aria-hidden="true" /></button>
          {canRequest && (
            <button type="button" data-testid="open-request-form" onClick={() => setShowRequest((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50">
              <Plus className="h-4 w-4" aria-hidden="true" /> {showRequest ? 'Close' : isSupervisor ? 'Ask a farm manager to dispatch' : 'Plan a dispatch'}
            </button>
          )}
        </div>
      </div>

      {notice && <p role="status" data-testid="desk-notice" className="rounded-xl border border-paddy-700 bg-paddy-50 px-4 py-2.5 text-sm font-medium text-paddy-900">{notice}</p>}
      {actionError && <p role="alert" data-testid="desk-error" className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{actionError}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error} <button type="button" onClick={() => load()} className="ml-2 underline">Try again</button></p>}
      {sent && <DispatchSent result={sent} onClose={() => setSent(null)} />}
      {showRequest && <DispatchRequestForm accessToken={accessToken} onSent={() => load()} onClose={() => setShowRequest(false)} />}

      {cards === null && !error && <p className="text-sm text-ink-500">Loading the dispatch desk...</p>}
      {cards !== null && (canApprove || canDispatch) && renderList({
        title: canApprove && !canDispatch ? 'Waiting for your decision' : canDispatch && !canApprove ? 'Your move' : 'Needs your action',
        testid: 'desk-needs-action',
        items: needs,
        hint: needs.length === 0 ? undefined : canDispatch && !canApprove ? 'Load the truck and submit one dispatch with every size.' : canApprove && !canDispatch ? 'Review what the farm manager prepared, then approve it or send it back.' : undefined,
      })}
      {cards !== null && needs.length === 0 && (canApprove || canDispatch) && <p className="-mt-2 rounded-xl bg-white px-4 py-3 text-sm text-ink-500" data-testid="desk-nothing">Nothing needs you right now.</p>}
      {cards !== null && renderList({ title: 'In progress', testid: 'desk-progress', items: shownProgress, hint: progress.length === 0 ? 'Nothing else is on its way.' : undefined })}
      {compact && progress.length > 3 && !showAll && <button type="button" onClick={() => setShowAll(true)} className="text-xs font-medium text-paddy-700 underline">Show all {progress.length}</button>}
      {cards !== null && arrived.length > 0 && renderList({ title: 'Arrived recently', testid: 'desk-arrived', items: arrived })}
      {compact && <a href="/deliveries" className="inline-block text-xs font-medium text-paddy-700 underline">Open the full Dispatch desk</a>}

      <ReviewDialog
        open={!!reviewing}
        title={reviewing ? `Dispatch ${reviewing.dispatch.ref}` : ''}
        subtitle={reviewing ? `${reviewing.card.farm.name} to ${reviewing.card.warehouse.name}` : undefined}
        details={reviewing ? <DispatchDetails card={reviewing.card} dispatch={reviewing.dispatch} /> : null}
        canApprove={canApprove}
        canReject={canApprove && hasPermission('delivery.reject')}
        rejectPrompt="Why is this dispatch not approved? The farm manager will read this and prepare it again."
        onApprove={async () => {
          const d = reviewing!.dispatch; const w = reviewing!.card.warehouse.name;
          await (d.dispatchRef ? deliveryReportsApi.approveDispatch(accessToken, d.ref) : deliveryReportsApi.approve(accessToken, d.lines[0].reportId));
          setNotice(`Approved: ${describe(d)} are now on the way to ${w}.`); load();
        }}
        onReject={async (comment) => {
          const d = reviewing!.dispatch;
          await (d.dispatchRef ? deliveryReportsApi.rejectDispatch(accessToken, d.ref, comment) : deliveryReportsApi.reject(accessToken, d.lines[0].reportId, comment));
          setNotice(`Sent back to the farm manager: ${describe(d)}.`); load();
        }}
        onClose={() => setReviewing(null)}
      />
    </section>
  );
}
