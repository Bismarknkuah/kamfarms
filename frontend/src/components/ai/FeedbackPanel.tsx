'use client';

import { useEffect, useState } from 'react';
import { Activity, CircleCheck, Clock, TrendingDown, TrendingUp, TriangleAlert, Wrench } from 'lucide-react';
import { ApiError, aiApi, isAiFeedback, type AiFeedback, type AiLearning, type AiRunFeedback, type AiScorecard, type AiVerdict } from '@/lib/api-client';
import { formatBags } from '@/lib/ai-yield';

type Data = Extract<AiFeedback, { available: true }>;
type Load = { kind: 'loading' } | { kind: 'old' } | { kind: 'error'; message: string } | { kind: 'unavailable'; reason: string } | { kind: 'ok'; data: Data };

export const VERDICT = {
  more: { label: 'More than expected', cls: 'bg-emerald-100 text-emerald-900', ring: 'border-emerald-300', Icon: TrendingUp },
  as_expected: { label: 'As expected', cls: 'bg-paddy-50 text-paddy-900', ring: 'border-paddy-100', Icon: CircleCheck },
  less: { label: 'Less than expected', cls: 'bg-red-100 text-red-900', ring: 'border-red-300', Icon: TrendingDown },
} as const;

/** +9.9% under ten, +24% above: one decimal only where it matters. */
export const signed = (v: number) => `${v > 0 ? '+' : ''}${Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v)}%`;
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function VerdictBadge({ verdict, early, testId }: { verdict: AiVerdict; early?: boolean; testId?: string }) {
  const v = VERDICT[verdict];
  return (
    <span data-testid={testId} className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${v.cls}`}><v.Icon className="h-3.5 w-3.5" aria-hidden="true" />{v.label}</span>
      {early && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">Early estimate</span>}
    </span>
  );
}

const TREND = {
  learning: { label: 'Still learning', cls: 'bg-amber-100 text-amber-900' },
  improving: { label: 'Getting more accurate', cls: 'bg-emerald-100 text-emerald-900' },
  steady: { label: 'Steady', cls: 'bg-paddy-50 text-paddy-900' },
  worsening: { label: 'Getting less accurate', cls: 'bg-red-100 text-red-900' },
} as const;

function LearningCard({ l }: { l: AiLearning }) {
  const t = TREND[l.trend];
  const max = Math.max(10, ...l.weekly.map((w) => w.errorPercent));
  return (
    <div data-testid="learning-card" className="rounded-2xl border border-paddy-100 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500"><Activity className="h-4 w-4 text-paddy-700" aria-hidden="true" /> How the AI is learning</p>
          <p className="mt-2 font-display text-4xl font-medium leading-none text-paddy-900" data-testid="learning-accuracy">{l.accuracyPercent === null ? 'Learning…' : `${l.accuracyPercent}%`}</p>
          <p className="mt-1 text-xs text-ink-500">{l.accuracyPercent === null ? 'Needs a few more approved runs before it can say how accurate it is.' : 'accurate on its latest runs (100% minus its average miss on packaged rice)'}</p>
        </div>
        <span data-testid="learning-trend" className={`rounded-full px-3 py-1 text-xs font-bold ${t.cls}`}>{t.label}</span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div><dt className="text-xs text-ink-500">Learned from</dt><dd className="font-semibold text-paddy-900" data-testid="learning-trained">{l.trainedOnRuns} approved run{l.trainedOnRuns === 1 ? '' : 's'}</dd></div>
        <div><dt className="text-xs text-ink-500">Judged on</dt><dd className="font-semibold text-paddy-900">{l.evaluatedRuns} run{l.evaluatedRuns === 1 ? '' : 's'}</dd></div>
        <div><dt className="text-xs text-ink-500">Latest run</dt><dd className="font-semibold text-paddy-900">{l.lastRunAt ? shortDate(l.lastRunAt) : 'None yet'}</dd></div>
      </dl>
      <div className="mt-4" data-testid="learning-weekly">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Average miss by week (lower is better)</p>
        {l.weekly.length === 0 ? <p className="mt-2 text-sm text-ink-500">No weekly figures yet.</p> : (
          <div className="mt-2 flex h-24 items-end gap-2" role="img" aria-label={`Average miss by week: ${l.weekly.map((w) => `${w.errorPercent}% for the week of ${shortDate(w.weekStart)}`).join(', ')}`}>
            {l.weekly.map((w) => (
              <div key={w.weekStart} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" data-testid="learning-week">
                <span className="text-[10px] font-semibold text-ink-700">{w.errorPercent}%</span>
                <div className="w-full rounded-t bg-husk-500" style={{ height: `${Math.max(6, (w.errorPercent / max) * 72)}px` }} />
                <span className="truncate text-[10px] text-ink-500">{shortDate(w.weekStart)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-500" data-testid="learning-explanation">{l.explanation}</p>
    </div>
  );
}

function CenterCard({ c }: { c: AiScorecard }) {
  const v = VERDICT[c.verdict];
  const top = Math.max(c.expectedRiceBags, c.actualRiceBags, 0.01);
  return (
    <article data-testid="center-card" className={`rounded-2xl border bg-white p-5 ${v.ring}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-display text-xl font-medium text-paddy-900" data-testid="center-name">{c.centerName}</h4>
        <VerdictBadge verdict={c.verdict} early={c.early} testId="center-verdict" />
      </div>
      <p className="mt-3 font-display text-4xl font-medium leading-none text-paddy-900"><span data-testid="center-variance">{signed(c.riceVariancePercent)}</span> <span className="text-sm font-normal text-ink-500">packaged rice against what was expected</span></p>
      <p className="mt-2 text-sm text-ink-700" data-testid="center-totals">Used <strong>{c.kwh.toLocaleString('en-US', { maximumFractionDigits: 1 })} kWh</strong> over {c.runs} run{c.runs === 1 ? '' : 's'}. Expected <strong>{formatBags(c.expectedRiceBags)}</strong> bags, got <strong>{formatBags(c.actualRiceBags)}</strong> bags.</p>
      <div className="mt-3 space-y-1.5" aria-hidden="true">
        <div className="flex items-center gap-2 text-[11px] text-ink-500"><span className="w-14">Expected</span><div className="h-2.5 flex-1 rounded-full bg-ink-500/10"><div className="h-full rounded-full bg-ink-500/50" style={{ width: `${(c.expectedRiceBags / top) * 100}%` }} /></div></div>
        <div className="flex items-center gap-2 text-[11px] text-ink-500"><span className="w-14">Got</span><div className="h-2.5 flex-1 rounded-full bg-ink-500/10"><div className="h-full rounded-full bg-husk-500" style={{ width: `${(c.actualRiceBags / top) * 100}%` }} /></div></div>
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700" data-testid="center-counts">
        <span>{c.asExpected} as expected</span><span>{c.more} more</span><span>{c.less} less</span>
      </p>
      {c.latest && <p className="mt-2 text-xs text-ink-500">Latest run {shortDate(c.latest.date)}: {VERDICT[c.latest.verdict].label.toLowerCase()} ({signed(c.latest.ricePercent)})</p>}
    </article>
  );
}

function RunRow({ r }: { r: AiRunFeedback }) {
  return (
    <li data-testid="run-row" className="rounded-xl border border-paddy-100 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-paddy-900">{r.centerName} <span className="font-normal text-ink-500">· {r.gradeLabel} · {shortDate(r.date)} · {r.recordNumber}</span></p>
          <p className="mt-0.5 text-sm text-ink-700" data-testid="run-numbers">Used {r.kwh.toLocaleString('en-US', { maximumFractionDigits: 1 })} kWh. Expected <strong>{formatBags(r.expected.riceBags)}</strong>, got <strong>{formatBags(r.actual.riceBags)}</strong> bags of packaged rice.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VerdictBadge verdict={r.verdict} early={r.early} testId="run-verdict" />
          <span className="text-sm font-bold text-paddy-900" data-testid="run-variance">{signed(r.variance.ricePercent)}</span>
          {!r.approved && <span className="inline-flex items-center gap-1 rounded-full bg-ink-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-700"><Clock className="h-3 w-3" aria-hidden="true" />Awaiting approval</span>}
        </div>
      </div>
      <details className="group mt-1.5">
        <summary className="cursor-pointer list-none text-xs font-medium text-paddy-700 hover:underline">Read it in full</summary>
        <p className="mt-1.5 text-sm text-ink-700" data-testid="run-sentence">{r.sentence}</p>
        <p className="mt-1 text-xs text-ink-500">Broken rice {signed(r.variance.brokenPercent)} and hull {signed(r.variance.hullPercent)} against expectation. Judged against {r.basis === 'benchmark' ? 'an industry benchmark' : r.basis === 'grade' ? `${r.baselineRuns} earlier approved runs of this grade` : `${r.baselineRuns} earlier approved runs`}.</p>
      </details>
    </li>
  );
}

function Tile({ id, count, verdict, label }: { id: string; count: number; verdict?: AiVerdict; label: string }) {
  const v = verdict ? VERDICT[verdict] : null;
  return (
    <div data-testid={id} className={`rounded-2xl border bg-white p-4 ${v ? v.ring : 'border-paddy-100'}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">{v && <v.Icon className="h-4 w-4" aria-hidden="true" />}{label}</p>
      <p className="mt-1 font-display text-4xl font-medium leading-none text-paddy-900" data-testid={`${id}-count`}>{count}</p>
    </div>
  );
}

/**
 * The MD and CEO's feedback: for each milling center, did its runs give more than, as much as, or less than the AI
 * expected for the power used? Plus how the AI itself is learning. A scoped person sees only their own centers.
 */
export function FeedbackPanel({ accessToken, companyWide }: { accessToken: string; companyWide: boolean }) {
  const [days, setDays] = useState(30);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    setLoad({ kind: 'loading' });
    aiApi.feedback(accessToken, days)
      .then((d) => { if (live) setLoad(!isAiFeedback(d) ? { kind: 'error', message: 'The server sent the feedback in a form this page does not understand. Ask the System Administrator to check that the server is up to date.' } : d.available ? { kind: 'ok', data: d } : { kind: 'unavailable', reason: d.reason }); })
      .catch((e: unknown) => { if (live) setLoad(e instanceof ApiError && e.status === 404 ? { kind: 'old' } : { kind: 'error', message: e instanceof ApiError ? e.message : 'The feedback could not be loaded.' }); });
    return () => { live = false; };
  }, [accessToken, days]);

  return (
    <section data-testid="feedback" className="rounded-3xl border border-paddy-100 bg-rice-50/60 p-5 shadow-sm sm:p-7" aria-label="Output against what was expected">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-medium text-paddy-900">Is {companyWide ? 'every milling center' : 'each of your milling centers'} delivering what was expected?</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-500">Every milling run is compared with what the AI expected for the power it used, worked out before the run from the approved runs that came earlier.</p>
        </div>
        <div role="group" aria-label="Period" className="inline-flex rounded-full bg-white p-1 text-sm font-medium" data-testid="fb-days">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" aria-pressed={days === d} data-testid={`fb-days-${d}`} onClick={() => setDays(d)} className={`rounded-full px-4 py-2 transition ${days === d ? 'bg-paddy-900 text-rice-50 shadow' : 'text-ink-700 hover:text-paddy-900'}`}>{d} days</button>
          ))}
        </div>
      </div>

      {load.kind === 'loading' && <div className="mt-5 h-48 animate-pulse rounded-2xl bg-white" aria-hidden="true" data-testid="fb-loading" />}
      {load.kind === 'old' && <p role="status" data-testid="fb-old-server" className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950"><Wrench className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />Your server does not have the AI feedback yet. Ask the System Administrator to update the server.</p>}
      {load.kind === 'error' && <p role="status" data-testid="fb-error" className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />{load.message}</p>}
      {load.kind === 'unavailable' && <p role="status" data-testid="fb-unavailable" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">{load.reason}</p>}

      {load.kind === 'ok' && (() => {
        const d = load.data;
        const s = d.summary;
        return (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile id="fb-more" count={s.more} verdict="more" label="More than expected" />
              <Tile id="fb-as" count={s.asExpected} verdict="as_expected" label="As expected" />
              <Tile id="fb-less" count={s.less} verdict="less" label="Less than expected" />
              <Tile id="fb-runs" count={s.runs} label={`Runs in ${d.days} days`} />
            </div>
            {(s.early > 0 || s.pendingApproval > 0) && (
              <p className="text-xs text-ink-500" data-testid="fb-notes">
                {s.early > 0 && <span>{s.early} run{s.early === 1 ? ' is' : 's are'} early estimate{s.early === 1 ? '' : 's'}: there was not enough history yet to judge {s.early === 1 ? 'it' : 'them'}, so {s.early === 1 ? 'it is' : 'they are'} not counted above. </span>}
                {s.pendingApproval > 0 && <span>{s.pendingApproval} run{s.pendingApproval === 1 ? ' is' : 's are'} awaiting approval: shown here, but the AI does not learn from {s.pendingApproval === 1 ? 'it' : 'them'} until approved.</span>}
              </p>
            )}

            {s.runs === 0 ? (
              <p data-testid="fb-empty" className="rounded-2xl border-2 border-dashed border-paddy-100 bg-white p-6 text-center text-sm text-ink-500">No milling runs with an electricity meter reading were recorded in the last {d.days} days. When Operations record a run with its meter opening and closing, it appears here with what the AI expected for the power it used.</p>
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <LearningCard l={d.learning} />
                  <div className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2" data-testid="center-cards">
                    {d.centers.map((c) => <CenterCard key={c.centerId} c={c} />)}
                  </div>
                </div>
                <div>
                  <h3 className="font-display text-lg font-medium text-paddy-900">Run by run</h3>
                  <p className="text-xs text-ink-500">Newest first. &ldquo;As expected&rdquo; means within {d.tolerancePercent}% of what the AI expected.</p>
                  <ul className="mt-3 space-y-2" data-testid="run-feed">{d.runs.map((r) => <RunRow key={r.id} r={r} />)}</ul>
                </div>
              </>
            )}
          </div>
        );
      })()}
    </section>
  );
}
