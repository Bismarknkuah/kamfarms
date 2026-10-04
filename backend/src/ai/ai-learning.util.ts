import { BagSizes, MIN_RUNS, RunSample, YieldRates, benchmarkRates, outputsFromEnergy, ratesFromRuns, round3 } from './ai-yield.util';

/**
 * How the AI learns, and how it is held to account.
 *
 * For every milling run the AI works out what it EXPECTED before that run (from the approved runs recorded earlier,
 * recent ones counting more), then compares that with what the run actually gave. That one comparison does three jobs:
 *   - it is the feedback the MD and CEO read: "Mill A used 2 kWh, was expected to give X, and gave more / as expected / less";
 *   - it is the AI's report card: how far off its expectations were, and whether that is shrinking as it learns;
 *   - it is training: once a run is approved (and was not flagged as not adding up) it joins the history the next
 *     expectation is built from, so the AI adapts as soon as operations record and approve runs.
 * Nothing is stored: it is all worked out again from the recorded runs, so it can never drift from them.
 */
export type Verdict = 'more' | 'as_expected' | 'less';
export type Basis = 'grade' | 'overall' | 'benchmark';

export interface LearnRun extends RunSample {
  id: string; recordNumber: string; date: Date;
  /** Approved runs teach the AI; submitted ones only get feedback. */
  approved: boolean;
  /** A run flagged as not adding up would teach the wrong numbers, so it is never learned from. */
  flagged: boolean;
  gradeId: string; gradeLabel: string; centerId: string; centerName: string;
}
export interface Amounts { riceKg: number; riceBags: number; brokenKg: number; brokenBags: number; hullKg: number; hullBags: number }
export interface RunFeedback {
  id: string; recordNumber: string; date: string; approved: boolean;
  centerId: string; centerName: string; gradeLabel: string; kwh: number; paddyKg: number;
  basis: Basis; baselineRuns: number;
  expected: Amounts; actual: Amounts;
  variance: { ricePercent: number; brokenPercent: number; hullPercent: number };
  verdict: Verdict; exact: boolean;
  /** Judged only against the industry benchmark, because there was not yet enough history: an early estimate, not a real verdict. */
  early: boolean;
  sentence: string;
}
export interface Scorecard {
  /** True when every run here was an early estimate (no real history to judge against yet). */
  early: boolean;
  centerId: string; centerName: string; runs: number; more: number; asExpected: number; less: number;
  kwh: number; expectedRiceBags: number; actualRiceBags: number; riceVariancePercent: number; verdict: Verdict;
  latest: { date: string; verdict: Verdict; ricePercent: number } | null; sentence: string;
}
export interface Learning {
  trainedOnRuns: number; lastRunAt: string | null; halfLifeRuns: number; tolerancePercent: number;
  evaluatedRuns: number; accuracyPercent: number | null;
  trend: 'learning' | 'improving' | 'steady' | 'worsening';
  recentErrorPercent: number | null; earlierErrorPercent: number | null;
  weekly: { weekStart: string; errorPercent: number; runs: number }[];
  explanation: string;
}

export interface LearnOptions { halfLifeRuns: number; tolerancePercent: number; bags: BagSizes; maxPriors?: number }

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}%`;
export const fmtBags = (n: number) => (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.round(n).toLocaleString('en-US'));
const fmtKwh = (n: number) => (n < 10 ? String(round1(n)) : Math.round(n).toLocaleString('en-US'));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const verdictOf = (ricePercent: number, tolerancePercent: number): Verdict =>
  ricePercent > tolerancePercent ? 'more' : ricePercent < -tolerancePercent ? 'less' : 'as_expected';

/** What the earlier approved runs say (grade first, then all grades, else the labelled benchmark). `priors` is newest first. */
export function baselineFor(run: LearnRun, priors: LearnRun[], halfLifeRuns: number): { rates: YieldRates; basis: Basis; baselineRuns: number } {
  const sameGrade = priors.filter((p) => p.gradeId === run.gradeId);
  if (sameGrade.length >= MIN_RUNS) return { rates: ratesFromRuns(sameGrade, { halfLifeRuns }), basis: 'grade', baselineRuns: sameGrade.length };
  if (priors.length >= MIN_RUNS) return { rates: ratesFromRuns(priors, { halfLifeRuns }), basis: 'overall', baselineRuns: priors.length };
  return { rates: benchmarkRates(priors.length), basis: 'benchmark', baselineRuns: priors.length };
}

function sentenceOf(f: Omit<RunFeedback, 'sentence'>): string {
  const e = f.expected, a = f.actual;
  const head = `${f.centerName} used ${fmtKwh(f.kwh)} kWh and was expected to give ${fmtBags(e.riceBags)} bags of packaged rice, ${fmtBags(e.brokenBags)} of broken rice and ${fmtBags(e.hullBags)} of hull. It gave ${fmtBags(a.riceBags)}, ${fmtBags(a.brokenBags)} and ${fmtBags(a.hullBags)}.`;
  const tail = f.verdict === 'more' ? ` That is more packaged rice than expected (${pct(f.variance.ricePercent)}).`
    : f.verdict === 'less' ? ` That is less packaged rice than expected (${pct(f.variance.ricePercent)}).`
    : f.exact ? ' That is exactly as expected.' : ` That is as expected (${pct(f.variance.ricePercent)}).`;
  return head + tail + (f.basis === 'benchmark' ? ' (An early estimate: there is not enough history yet, so it is judged against an industry benchmark.)' : '');
}

export function evaluateRun(run: LearnRun, base: ReturnType<typeof baselineFor>, o: LearnOptions): RunFeedback {
  const exp = outputsFromEnergy(base.rates, run.energyKwh, o.bags);
  const bagsOf = (kg: number, bagKg: number) => round3(kg / bagKg);
  const expected: Amounts = { riceKg: exp.riceKg, riceBags: exp.riceBags, brokenKg: exp.brokenKg, brokenBags: exp.brokenBags, hullKg: exp.hullKg, hullBags: exp.hullBags };
  const actual: Amounts = {
    riceKg: run.riceKg, riceBags: bagsOf(run.riceKg, o.bags.riceKg), brokenKg: run.brokenKg, brokenBags: bagsOf(run.brokenKg, o.bags.brokenKg), hullKg: run.hullKg, hullBags: bagsOf(run.hullKg, o.bags.hullKg),
  };
  const v = (act: number, exp2: number) => (exp2 > 0 ? round1(((act - exp2) / exp2) * 100) : 0);
  const variance = { ricePercent: v(actual.riceKg, expected.riceKg), brokenPercent: v(actual.brokenKg, expected.brokenKg), hullPercent: v(actual.hullKg, expected.hullKg) };
  const partial = {
    id: run.id, recordNumber: run.recordNumber, date: run.date.toISOString(), approved: run.approved,
    centerId: run.centerId, centerName: run.centerName, gradeLabel: run.gradeLabel, kwh: run.energyKwh, paddyKg: run.paddyKg,
    basis: base.basis, baselineRuns: base.baselineRuns, expected, actual, variance,
    verdict: verdictOf(variance.ricePercent, o.tolerancePercent), exact: Math.abs(variance.ricePercent) < 0.5, early: base.basis === 'benchmark',
  };
  return { ...partial, sentence: sentenceOf(partial) };
}

/** Replays the runs oldest to newest: each is judged against what the runs before it had taught, then (if approved and sound) added to what is known. */
export function walkForward(runsAsc: LearnRun[], o: LearnOptions): RunFeedback[] {
  const maxPriors = o.maxPriors ?? 200;
  const training: LearnRun[] = [];
  const out: RunFeedback[] = [];
  for (const run of runsAsc) {
    const priors = training.slice(-maxPriors).reverse();
    out.push(evaluateRun(run, baselineFor(run, priors, o.halfLifeRuns), o));
    if (run.approved && !run.flagged) training.push(run);
  }
  return out;
}

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const weekStartOf = (iso: string) => {
  const d = new Date(iso); const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10);
};

export function learningStats(feedback: RunFeedback[], trainedOnRuns: number, lastRunAt: string | null, o: { halfLifeRuns: number; tolerancePercent: number }): Learning {
  const judged = feedback.filter((f) => f.approved && f.basis !== 'benchmark');
  const errors = judged.map((f) => Math.abs(f.variance.ricePercent));
  const recent = errors.slice(-20), earlier = errors.slice(-40, -20);
  const recentErr = recent.length >= 5 ? round1(mean(recent)) : null;
  const earlierErr = earlier.length >= 5 ? round1(mean(earlier)) : null;
  let trend: Learning['trend'] = 'learning';
  if (recentErr !== null && earlierErr !== null && errors.length >= 8) trend = recentErr < earlierErr - 1 ? 'improving' : recentErr > earlierErr + 1 ? 'worsening' : 'steady';
  const byWeek = new Map<string, number[]>();
  judged.forEach((f, i) => { const w = weekStartOf(f.date); byWeek.set(w, [...(byWeek.get(w) ?? []), errors[i]]); });
  const weekly = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-8).map(([weekStart, e]) => ({ weekStart, errorPercent: round1(mean(e)), runs: e.length }));
  const weighting = o.halfLifeRuns > 0 ? `recent runs count more than old ones (a run's weight halves every ${o.halfLifeRuns} runs)` : 'every run counts equally';
  return {
    trainedOnRuns, lastRunAt, halfLifeRuns: o.halfLifeRuns, tolerancePercent: o.tolerancePercent,
    evaluatedRuns: judged.length, accuracyPercent: recentErr === null ? null : Math.max(0, Math.min(100, round1(100 - recentErr))),
    trend, recentErrorPercent: recentErr, earlierErrorPercent: earlierErr, weekly,
    explanation: `The AI has learned from ${plural(trainedOnRuns, 'approved run')}. Each new approved run is added at once, ${weighting}. A run is "as expected" when its packaged rice is within ${o.tolerancePercent}% of what the AI expected.`,
  };
}

export function scorecards(feedback: RunFeedback[], tolerancePercent: number): Scorecard[] {
  const byCenter = new Map<string, RunFeedback[]>();
  for (const f of feedback) byCenter.set(f.centerId, [...(byCenter.get(f.centerId) ?? []), f]);
  const order: Record<Verdict, number> = { less: 0, as_expected: 1, more: 2 };
  return [...byCenter.values()].map((all) => {
    // A center is judged on runs the AI could really judge; only when it has none do its early estimates stand in (and say so).
    const real = all.filter((f) => !f.early);
    const early = real.length === 0;
    const runs = early ? all : real;
    const sum = (pick: (f: RunFeedback) => number) => runs.reduce((t, f) => t + pick(f), 0);
    const expKg = sum((f) => f.expected.riceKg), actKg = sum((f) => f.actual.riceKg);
    const variance = expKg > 0 ? round1(((actKg - expKg) / expKg) * 100) : 0;
    const verdict = verdictOf(variance, tolerancePercent);
    const newest = [...runs].sort((a, b) => b.date.localeCompare(a.date))[0];
    const expBags = round3(sum((f) => f.expected.riceBags)), actBags = round3(sum((f) => f.actual.riceBags)), kwh = round3(sum((f) => f.kwh));
    const word = verdict === 'more' ? 'more than expected' : verdict === 'less' ? 'less than expected' : 'as expected';
    return {
      early, centerId: runs[0].centerId, centerName: runs[0].centerName, runs: runs.length,
      more: runs.filter((f) => f.verdict === 'more').length, asExpected: runs.filter((f) => f.verdict === 'as_expected').length, less: runs.filter((f) => f.verdict === 'less').length,
      kwh, expectedRiceBags: expBags, actualRiceBags: actBags, riceVariancePercent: variance, verdict,
      latest: { date: newest.date, verdict: newest.verdict, ricePercent: newest.variance.ricePercent },
      sentence: `${runs[0].centerName}: ${plural(runs.length, 'run')}, ${fmtKwh(kwh)} kWh used. Expected ${fmtBags(expBags)} bags of packaged rice and got ${fmtBags(actBags)} (${pct(variance)}), which is ${word}.${early ? ' (An early estimate: there is not enough history yet, so it is judged against an industry benchmark.)' : ''}`,
    };
  }).sort((a, b) => order[a.verdict] - order[b.verdict] || a.riceVariancePercent - b.riceVariancePercent || a.centerName.localeCompare(b.centerName));
}
