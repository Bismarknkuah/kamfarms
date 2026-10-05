'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Circle, Clock, Truck } from 'lucide-react';
import { ApiError, type DispatchJourney, dispatchTrackingApi, shipmentsApi, receiptReviewsApi, DispatchReview } from '@/lib/api-client';
import { SizeBags } from '@/components/SizeBags';

const BIG = 'rounded-full bg-paddy-900 px-6 py-3 text-base font-medium text-rice-50 disabled:bg-ink-500/30';
const QUIET = 'rounded-full border-2 border-ink-500/25 px-5 py-3 text-sm font-medium text-ink-700';
const TONE: Record<string, string> = { REQUESTED: 'bg-husk-300 text-soil-700', IN_REVIEW: 'bg-amber-100 text-amber-900', IN_TRANSIT: 'bg-amber-100 text-amber-900', DELIVERED: 'bg-paddy-900 text-rice-50' };

/** "2 days 3 hours", "5 hours", "under an hour": how long, in words a person says. */
export function hoursText(h: number): string {
  if (h < 1) return 'under an hour';
  const days = Math.floor(h / 24); const hrs = Math.round(h - days * 24);
  const hp = `${hrs} hour${hrs === 1 ? '' : 's'}`; const dp = `${days} day${days === 1 ? '' : 's'}`;
  return days === 0 ? hp : hrs === 0 ? dp : `${dp} ${hp}`;
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const sizes = (j: DispatchJourney) => j.lines.map((l) => `${l.label}: ${l.bags}${l.receivedBags !== null && l.receivedBags !== l.bags ? ` (counted ${l.receivedBags})` : ''}`).join('  ·  ');

interface Props { accessToken: string; hasPermission: (code: string) => boolean; focusRef?: string | null }

/**
 * Every dispatch the person may track, newest first, with where it is. Each opens into its whole journey: every step, who did it, when, how long it
 * waited at that step, the day it was supposed to arrive and whether it did. A warehouse manager counts a truck in with one button.
 */
/** The damaged-bags report on a truck: what was reported, who decides, how long it has waited, and what was decided. Visible to everyone who can track the truck. */
function ReviewPanel({ r, busy, onDecide }: { r: DispatchReview; busy: boolean; onDecide: (kind: 'approve' | 'reject', text: string) => void }) {
  const [text, setText] = useState('');
  const tone = r.status === 'PENDING' ? 'border-amber-300 bg-amber-50' : r.status === 'APPROVED' ? 'border-paddy-100 bg-paddy-50' : 'border-red-200 bg-red-50';
  const head = r.status === 'PENDING' ? 'Damaged bags: waiting for the Warehouse Supervisor' : `Damaged bags: ${r.status === 'APPROVED' ? 'approved' : 'refused'} by ${r.decidedBy ?? 'the Warehouse Supervisor'}`;
  return (
    <div className={`mt-3 rounded-2xl border p-3 ${tone}`} data-testid="review-panel" data-status={r.status}>
      <p className="text-sm font-medium text-ink-900" data-testid="review-head">{head}</p>
      <ul className="mt-1 text-sm text-ink-700">{r.lines.map((l) => <li key={l.label} data-testid="review-line">{l.label}: {l.damagedBags} spoiled or broken of the {l.receivedBags} that arrived</li>)}</ul>
      <p className="mt-1 text-xs text-ink-700" data-testid="review-reported">Reported by {r.submittedBy ?? 'the Warehouse Manager'}, {when(r.submittedAt)}: &ldquo;{r.note}&rdquo;</p>
      {r.status === 'PENDING'
        ? <p className="text-xs font-medium text-amber-800" data-testid="review-waiting">Waiting {hoursText((Date.now() - Date.parse(r.submittedAt)) / 3_600_000)} so far. These bags are held out of the stock until it is decided.</p>
        : <p className="mt-1 text-xs text-ink-700" data-testid="review-decision">Decided {r.decidedAt ? when(r.decidedAt) : ''}{r.decisionNote ? `: \u201c${r.decisionNote}\u201d` : ''}. {r.status === 'APPROVED' ? 'The bags were written off.' : 'The bags are back in the stock.'}</p>}
      {r.canDecide && (
        <div className="mt-3 space-y-2" data-testid="review-actions">
          <label className="block text-sm font-medium text-ink-700">Your comment <span className="font-normal text-ink-500">(needed if you refuse)</span><input data-testid="review-comment" value={text} onChange={(e) => setText(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500/25 px-3 py-3 text-base" /></label>
          <div className="flex flex-wrap gap-3">
            <button type="button" data-testid="review-approve" disabled={busy} onClick={() => onDecide('approve', text)} className={BIG}>Approve: write the bags off</button>
            <button type="button" data-testid="review-reject" disabled={busy || text.trim().length < 3} onClick={() => onDecide('reject', text)} className={QUIET}>Refuse: put them back in stock</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DispatchTracker({ accessToken, hasPermission, focusRef = null }: Props) {
  const [journeys, setJourneys] = useState<DispatchJourney[] | null>(null);
  const [counts, setCounts] = useState<{ open: number; delivered: number; late: number; review?: number }>({ open: 0, delivered: 0, late: 0, review: 0 });
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'delivered' | 'late' | 'review' | 'all'>('all');
  const [q, setQ] = useState('');
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [counted, setCounted] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [damaged, setDamaged] = useState<Record<string, number>>({});
  const [damageNote, setDamageNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => dispatchTrackingApi.list(accessToken, 'all').then((v) => { setJourneys(v.journeys); setCounts(v.counts); setError(null); })
    .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Dispatches could not be loaded.')), [accessToken]);
  useEffect(() => { load(); const t = setInterval(load, 45000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (!focusRef || !journeys) return;
    const j = journeys.find((x) => x.ref === focusRef);
    if (j) { setQ(''); setFilter('all'); setOpened((p) => new Set(p).add(j.id)); }
    const t = setTimeout(() => document.querySelector('[data-focus="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
    return () => clearTimeout(t);
  }, [focusRef, journeys]);

  const shown = (journeys ?? []).filter((j) => (filter === 'all' || (filter === 'open' && j.status !== 'DELIVERED') || (filter === 'delivered' && j.status === 'DELIVERED') || (filter === 'late' && !!j.late) || (filter === 'review' && !!j.needsReview))
    && (!q.trim() || [j.ref, j.requestRef, j.vehicle, j.driver, j.from.name, j.to.name, ...j.lines.map((l) => l.label)].some((v) => v && v.toLowerCase().includes(q.trim().toLowerCase()))));
  const toggle = (id: string) => setOpened((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const startConfirm = (j: DispatchJourney) => { setConfirming(j.id); setCounted(Object.fromEntries(j.lines.filter((l) => l.paddyGradeId).map((l) => [l.paddyGradeId as string, l.bags]))); setNote(''); setDamaged(Object.fromEntries(j.lines.filter((l) => l.paddyGradeId).map((l) => [l.paddyGradeId as string, 0]))); setDamageNote(''); setActionError(null); };
  const confirm = async (j: DispatchJourney) => {
    if (j.action?.type !== 'CONFIRM_TRUCK') return;
    const hurt = Object.values(damaged).reduce((n, v) => n + v, 0);
    if (Object.entries(damaged).some(([id, v]) => v > (counted[id] ?? 0))) { setActionError('Spoiled or broken bags cannot be more than the bags that arrived.'); return; }
    if (hurt > 0 && damageNote.trim().length < 3) { setActionError('Say what is wrong with the spoiled or broken bags. The Warehouse Supervisor needs it to decide.'); return; }
    setBusy(true); setActionError(null); setNotice(null);
    try {
      await shipmentsApi.receiveDispatch(accessToken, j.action.key, { lines: Object.entries(counted).map(([paddyGradeId, receivedBags]) => ({ paddyGradeId, receivedBags, damagedBags: damaged[paddyGradeId] || undefined })), notes: note.trim() || undefined, damageNote: hurt > 0 ? damageNote.trim() : undefined });
      setConfirming(null); await load();
      const total = Object.values(counted).reduce((n, v) => n + v, 0);
      setNotice(total === j.totalBags ? `Delivered: all ${total} bags are counted in. ${j.ref} now says Delivered.` : `Delivered: ${total} bags counted in (${Math.abs(total - j.totalBags)} ${total < j.totalBags ? 'short' : 'extra'}). The difference has been written down for review.`);
      if (hurt > 0) setNotice((n) => `${n ?? ''} ${hurt} spoiled or broken bag(s) are held out of the stock and sent to the Warehouse Supervisor for approval.`);
    } catch (e) { setActionError(e instanceof ApiError ? e.message : 'That did not go through. Nothing was lost: please try again.'); }
    finally { setBusy(false); }
  };

  const decide = async (j: DispatchJourney, kind: 'approve' | 'reject', text: string) => {
    if (!j.review) return;
    setBusy(true); setActionError(null); setNotice(null);
    try {
      await (kind === 'approve' ? receiptReviewsApi.approve : receiptReviewsApi.reject)(accessToken, j.review.id, text.trim() || undefined);
      await load();
      setNotice(kind === 'approve' ? `Approved: the ${j.review.damagedBags} damaged bag(s) on ${j.ref} are written off.` : `Refused: the ${j.review.damagedBags} bag(s) on ${j.ref} are back in the stock.`);
    } catch (e) { setActionError(e instanceof ApiError ? e.message : 'That did not go through. Nothing was changed: please try again.'); }
    finally { setBusy(false); }
  };

  const chip = (key: typeof filter, label: string, n: number | null) => (
    <button key={key} type="button" data-testid={`filter-${key}`} aria-pressed={filter === key} onClick={() => setFilter(key)} className={`rounded-full border px-4 py-2 text-sm font-medium ${filter === key ? 'border-paddy-900 bg-paddy-900 text-rice-50' : 'border-paddy-100 bg-white text-paddy-900'}`}>{label}{n !== null ? ` (${n})` : ''}</button>
  );

  return (
    <section className="space-y-4" data-testid="dispatch-tracker" aria-label="Track dispatch">
      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" data-testid="track-notice" className="rounded-xl border border-paddy-700 bg-paddy-50 px-4 py-2.5 text-sm font-medium text-paddy-900">{notice}</p>}
      {actionError && <p role="alert" data-testid="track-error" className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{actionError}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {chip('all', 'All', (journeys ?? []).length)}{chip('open', 'On the way', counts.open)}{chip('delivered', 'Delivered', counts.delivered)}{chip('late', 'Late', counts.late)}{(counts.review ?? 0) > 0 && chip('review', 'Needs review', counts.review ?? 0)}
        <input data-testid="track-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by number, farm, warehouse or vehicle" aria-label="Find a dispatch" className="ml-auto w-full rounded-full border border-paddy-100 bg-white px-4 py-2 text-sm sm:w-72" />
      </div>

      {journeys !== null && shown.length === 0 && <p className="rounded-xl bg-white px-4 py-3 text-sm text-ink-500" data-testid="track-empty">{(journeys ?? []).length === 0 ? 'No dispatches to show yet.' : 'No dispatch matches that.'}</p>}

      {shown.map((j) => {
        const focus = !!focusRef && j.ref === focusRef; const isOpen = opened.has(j.id) || focus;
        const holding = j.status !== 'DELIVERED' ? j.steps.find((s) => s.state === 'current') : null;
        return (
          <article key={j.id} data-testid="journey" data-ref={j.ref} data-status={j.status} data-kind={j.kind} data-focus={focus ? 'true' : undefined} className="rounded-2xl border border-ink-500/15 bg-white p-4 shadow-sm data-[focus=true]:ring-2 data-[focus=true]:ring-husk-500">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-lg text-paddy-900"><Truck size={18} className="mr-1.5 inline" aria-hidden="true" />{j.ref}{j.requestRef && j.requestRef !== j.ref ? <span className="ml-2 text-xs font-normal text-ink-500">request {j.requestRef}</span> : null}</h3>
                <p className="mt-0.5 text-base font-medium text-ink-900" data-testid="journey-route">{j.from.name} to {j.to.name}</p>
                <p className="text-sm text-ink-700" data-testid="journey-sizes">{sizes(j)}</p>
              </div>
              <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${TONE[j.status]}`} data-testid="journey-status">{j.label}</span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" data-testid="journey-times">
              {j.neededBy && <span className="rounded-full bg-rice-50 px-3 py-1 text-ink-700">Supposed to arrive by <strong>{day(j.neededBy)}</strong></span>}
              {j.deliveredAt && <span className="rounded-full bg-rice-50 px-3 py-1 text-ink-700">Delivered <strong>{when(j.deliveredAt)}</strong></span>}
              {j.late ? <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-800" data-testid="journey-late">{j.late.delivered ? 'Late by' : 'Overdue by'} {hoursText(j.late.hours)}</span>
                : j.neededBy && j.status === 'DELIVERED' ? <span className="rounded-full bg-paddy-100 px-3 py-1 font-medium text-paddy-900" data-testid="journey-ontime">On time</span> : null}
            </div>
            {holding && holding.waitedHours !== null && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-700" data-testid="journey-holding"><Clock size={14} aria-hidden="true" /> Now waiting for the <strong>{holding.role}</strong>{holding.waitedHours >= 1 ? `, for ${hoursText(holding.waitedHours)}` : ''}.</p>
            )}
            {j.slowest && <p className="mt-1 text-xs text-ink-500" data-testid="journey-slowest">Longest wait: <strong className="font-medium text-ink-700">{j.slowest.label}</strong>{j.slowest.who ? ` (${j.slowest.who})` : ` (${j.slowest.role})`}, {hoursText(j.slowest.hours)}{j.slowest.running ? ' so far' : ''}.</p>}

            {j.review && <ReviewPanel r={j.review} busy={busy} onDecide={(kind, text) => decide(j, kind, text)} />}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {j.action?.type === 'CONFIRM_TRUCK' && confirming !== j.id && hasPermission('warehouse.receive') && <button type="button" data-testid="act-confirm" onClick={() => startConfirm(j)} className={BIG}>Truck received</button>}
              {j.action?.type === 'OPEN' && <Link href={j.action.href} data-testid="act-open" className={BIG}>{j.action.label}</Link>}
              <button type="button" data-testid="act-steps" aria-expanded={isOpen} onClick={() => toggle(j.id)} className={QUIET}>{isOpen ? 'Hide the steps' : 'See every step'}</button>
            </div>

            {confirming === j.id && (
              <div className="mt-3 space-y-3 rounded-2xl border-2 border-paddy-700 p-3" data-testid="confirm-form">
                <p className="text-sm font-medium text-ink-700">How many bags really arrived?</p>
                <SizeBags grades={j.lines.filter((l) => l.paddyGradeId).map((l) => ({ id: l.paddyGradeId as string, label: l.label }))} value={counted} onChange={setCounted} idPrefix="Arrived bags" hints={Object.fromEntries(j.lines.filter((l) => l.paddyGradeId).map((l) => [l.paddyGradeId as string, <span key={l.paddyGradeId} className="text-xs text-ink-500">sent: {l.bags}</span>]))} />
                <div className="space-y-2 rounded-xl bg-amber-50 p-3" data-testid="damage-block">
                  <p className="text-sm font-medium text-ink-700">Of the bags that arrived, how many are spoiled or broken?</p>
                  <p className="text-xs text-ink-500">Leave at 0 if they are all good. Spoiled or broken bags are held out of the stock and sent to the Warehouse Supervisor to approve.</p>
                  <SizeBags grades={j.lines.filter((l) => l.paddyGradeId).map((l) => ({ id: l.paddyGradeId as string, label: l.label }))} value={damaged} onChange={setDamaged} idPrefix="Spoiled or broken bags" />
                  {Object.values(damaged).some((n) => n > 0) && <label className="block text-sm font-medium text-ink-700">What is wrong with them? (required)<input data-testid="damage-note" value={damageNote} onChange={(e) => setDamageNote(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500/25 px-3 py-3 text-base" /></label>}
                </div>
                <label className="block text-sm font-medium text-ink-700">A note (if something was wrong)<input data-testid="confirm-note" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500/25 px-3 py-3 text-base" /></label>
                <div className="flex flex-wrap gap-3">
                  <button type="button" data-testid="confirm-submit" disabled={busy} onClick={() => confirm(j)} className={BIG}>{busy ? 'Saving...' : 'Confirm: this many arrived'}</button>
                  <button type="button" data-testid="confirm-back" onClick={() => setConfirming(null)} className={QUIET}>Back</button>
                </div>
              </div>
            )}

            {isOpen && (
              <ol className="mt-4 space-y-3 border-l-2 border-paddy-100 pl-4" data-testid="journey-steps">
                {j.steps.map((s) => (
                  <li key={s.key} data-testid="journey-step" data-state={s.state} data-key={s.key} className="relative">
                    <span className="absolute -left-[1.4rem] top-0.5 grid h-4 w-4 place-items-center rounded-full bg-white">{s.state === 'done' ? <Check size={14} className="text-paddy-700" aria-hidden="true" /> : <Circle size={12} className={s.state === 'current' ? 'text-amber-600' : 'text-ink-500/40'} aria-hidden="true" />}</span>
                    <p className={`text-sm ${s.state === 'upcoming' ? 'text-ink-500' : 'font-medium text-ink-900'}`}>{s.label}{s.who ? <span className="font-normal text-ink-700"> · {s.who}</span> : s.state !== 'done' ? <span className="font-normal text-ink-500"> · {s.role}</span> : null}</p>
                    {s.at && <p className="text-xs text-ink-500">{when(s.at)}{s.waitedHours !== null ? ` · ${hoursText(s.waitedHours)} after the step before` : ''}</p>}
                    {s.state === 'current' && <p className="text-xs font-medium text-amber-800">Waiting now{s.waitedHours !== null && s.waitedHours >= 1 ? `: ${hoursText(s.waitedHours)} so far` : ''}</p>}
                    {s.detail && <p className="text-xs text-ink-700">{s.detail}</p>}
                  </li>
                ))}
              </ol>
            )}
          </article>
        );
      })}
    </section>
  );
}
