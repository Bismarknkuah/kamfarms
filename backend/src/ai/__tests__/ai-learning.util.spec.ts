import { BagSizes, RunSample, ratesFromRuns } from '../ai-yield.util';
import { LearnOptions, LearnRun, baselineFor, learningStats, scorecards, verdictOf, walkForward } from '../ai-learning.util';

const bags: BagSizes = { paddyKg: 50, riceKg: 50, brokenKg: 50, hullKg: 20, hullBasis: 'setting' };
const OPTS: LearnOptions = { halfLifeRuns: 0, tolerancePercent: 5, bags };
// 1,000 kg of paddy used 25 kWh and gave 680 rice, 120 broken, 180 hull: 27.2 kg of rice per kWh.
let n = 0;
const run = (over: Partial<LearnRun> = {}): LearnRun => {
  n += 1;
  return { id: `r${n}`, recordNumber: `PR-${n}`, date: new Date(Date.UTC(2026, 8, 1 + n)), approved: true, flagged: false, gradeId: 'g4', gradeLabel: 'Size 4', centerId: 'c1', centerName: 'Mill A',
    paddyKg: 1000, energyKwh: 25, riceKg: 680, brokenKg: 120, hullKg: 180, wasteKg: 20, ...over };
};
const runs = (k: number, over: Partial<LearnRun> = {}) => Array.from({ length: k }, () => run(over));

describe('recency weighting in ratesFromRuns (newest first)', () => {
  const sample = (rice: number): RunSample => ({ paddyKg: 1000, energyKwh: 25, riceKg: rice, brokenKg: 120, hullKg: 180, wasteKg: 20 });
  it('counts every run equally by default', () => {
    expect(ratesFromRuns([sample(800), sample(800), sample(600), sample(600)]).perKwh.riceKg).toBe(28);
  });
  it('follows recent runs when given a half-life: the newest runs pull the figure up', () => {
    const newestFirst = [sample(800), sample(800), sample(600), sample(600)];
    const adaptive = ratesFromRuns(newestFirst, { halfLifeRuns: 2 }).perKwh.riceKg;
    expect(adaptive).toBeGreaterThan(28);
    expect(adaptive).toBeLessThan(32);
    expect(ratesFromRuns([...newestFirst].reverse(), { halfLifeRuns: 2 }).perKwh.riceKg).toBeLessThan(28);
  });
  it('treats a half-life of 0 as no weighting, and leaves the totals behind the figure unweighted', () => {
    const r = ratesFromRuns([sample(800), sample(600), sample(700)], { halfLifeRuns: 0 });
    expect(r.perKwh.riceKg).toBe(28);
    expect(ratesFromRuns([sample(800), sample(600), sample(700)], { halfLifeRuns: 1 }).energyKwh).toBe(75);
  });
});

describe('walkForward: every run is judged by what the runs before it had taught', () => {
  it('judges the first runs against the labelled benchmark, and later ones against the company\'s own history', () => {
    const fb = walkForward(runs(6), OPTS);
    expect(fb.slice(0, 3).map((f) => f.basis)).toEqual(['benchmark', 'benchmark', 'benchmark']);
    expect(fb[3].basis).toBe('grade');
    expect(fb[3].baselineRuns).toBe(3);
    expect(fb[5].baselineRuns).toBe(5);
  });

  it('answers the MD\'s question: used 2 kWh, was expected to give this, gave more', () => {
    const history = runs(3);
    const better = run({ paddyKg: 100, energyKwh: 2, riceKg: 59.8, brokenKg: 9, hullKg: 14, wasteKg: 1.2 }); // expected 54.4, got 59.8
    const f = walkForward([...history, better], OPTS)[3];
    expect(f.expected.riceKg).toBe(54.4);
    expect(f.actual.riceKg).toBe(59.8);
    expect(f.variance.ricePercent).toBe(9.9);
    expect(f.verdict).toBe('more');
    expect(f.sentence).toBe('Mill A used 2 kWh and was expected to give 1.09 bags of packaged rice, 0.19 of broken rice and 0.72 of hull. It gave 1.20, 0.18 and 0.70. That is more packaged rice than expected (+10%).');
  });

  it('says "less than expected" below the tolerance, and "as expected" inside it, and "exactly" when it is spot on', () => {
    const low = walkForward([...runs(3), run({ riceKg: 600 })], OPTS)[3];
    expect(low.verdict).toBe('less');
    expect(low.sentence).toMatch(/less packaged rice than expected \(-12%\)/);
    const near = walkForward([...runs(3), run({ riceKg: 686 })], OPTS)[3];
    expect(near.verdict).toBe('as_expected');
    expect(near.exact).toBe(false);
    expect(near.sentence).toMatch(/That is as expected \(\+1%\)/);
    const exact = walkForward([...runs(3), run()], OPTS)[3];
    expect(exact.exact).toBe(true);
    expect(exact.sentence).toMatch(/That is exactly as expected\./);
  });

  it('uses the tolerance the Administrator sets', () => {
    const history = [...runs(3), run({ riceKg: 740 })]; // +8.8%
    expect(walkForward(history, OPTS)[3].verdict).toBe('more');
    expect(walkForward(history, { ...OPTS, tolerancePercent: 10 })[3].verdict).toBe('as_expected');
    expect(verdictOf(5, 5)).toBe('as_expected');
    expect(verdictOf(5.1, 5)).toBe('more');
    expect(verdictOf(-5.1, 5)).toBe('less');
  });

  it('learns: once a run is approved the next expectation includes it', () => {
    const fb = walkForward([...runs(3), run({ riceKg: 800 }), run({ riceKg: 800 })], OPTS);
    expect(fb[4].expected.riceKg).toBeGreaterThan(fb[3].expected.riceKg); // it learned from the 800 kg run
  });

  it('with recent runs counting more, it adapts faster to a change at the mill', () => {
    const history = [...runs(8), ...runs(6, { riceKg: 760 }), run({ riceKg: 760 })];
    const equal = walkForward(history, OPTS).pop()!;
    const adaptive = walkForward(history, { ...OPTS, halfLifeRuns: 4 }).pop()!;
    expect(Math.abs(adaptive.variance.ricePercent)).toBeLessThan(Math.abs(equal.variance.ricePercent));
  });

  it('does not learn from a run that is only submitted, or one flagged as not adding up, but still gives feedback on it', () => {
    const fb = walkForward([...runs(3), run({ approved: false, riceKg: 900 }), run({ flagged: true, riceKg: 100 }), run()], OPTS);
    expect(fb[3].approved).toBe(false);
    expect(fb[3].verdict).toBe('more');
    expect(fb[5].baselineRuns).toBe(3); // neither the submitted nor the flagged run was learned from
    expect(fb[5].expected.riceKg).toBe(680);
  });

  it('uses the grade\'s own history when there is enough, and all grades otherwise', () => {
    const size6 = runs(3, { gradeId: 'g6', gradeLabel: 'Size 6', riceKg: 600 });
    const fb = walkForward([...runs(3), ...size6, run({ gradeId: 'g6', gradeLabel: 'Size 6', riceKg: 600 }), run({ gradeId: 'g9', gradeLabel: 'Size 9' })], OPTS);
    expect(fb[6].basis).toBe('grade');
    expect(fb[6].expected.riceKg).toBe(600); // judged by Size 6's own history, not the mix
    expect(fb[7].basis).toBe('overall'); // a grade with no history falls back to all grades
  });

  it('never divides by zero', () => {
    const f = walkForward([...runs(3), run({ riceKg: 0, brokenKg: 0, hullKg: 0 })], OPTS)[3];
    expect(f.variance.ricePercent).toBe(-100);
    expect(Number.isFinite(f.variance.hullPercent)).toBe(true);
  });
});

describe('baselineFor', () => {
  it('is the benchmark with fewer than 3 earlier runs', () => {
    expect(baselineFor(run(), runs(2), 0).basis).toBe('benchmark');
  });
});

describe('learningStats: how accurate the AI has been, and whether it is improving', () => {
  const stats = (feedback: ReturnType<typeof walkForward>, trained = feedback.length) => learningStats(feedback, trained, '2026-09-30T00:00:00.000Z', { halfLifeRuns: 40, tolerancePercent: 5 });

  it('is still learning, with no accuracy figure, until there are enough judged runs', () => {
    const s = stats(walkForward(runs(5), OPTS));
    expect(s.trend).toBe('learning');
    expect(s.accuracyPercent).toBeNull();
    expect(s.trainedOnRuns).toBe(5);
  });

  it('reports accuracy as 100 minus the average miss of recent judged runs', () => {
    const s = stats(walkForward([...runs(10), ...runs(10, { riceKg: 693.6 })], OPTS)); // each later run is 2% above
    expect(s.accuracyPercent).toBeGreaterThan(97);
    expect(s.evaluatedRuns).toBe(17);
  });

  it('says improving when recent misses are smaller than earlier ones, and worsening when larger', () => {
    const noisy = (k: number, d: number) => Array.from({ length: k }, (_, i) => run({ riceKg: 680 + (i % 2 ? d : -d) }));
    const improving = stats(walkForward([...runs(3), ...noisy(20, 60), ...noisy(20, 5)], OPTS));
    expect(improving.trend).toBe('improving');
    expect(improving.recentErrorPercent!).toBeLessThan(improving.earlierErrorPercent!);
    const worsening = stats(walkForward([...runs(3), ...noisy(20, 5), ...noisy(20, 60)], OPTS));
    expect(worsening.trend).toBe('worsening');
  });

  it('shows the average miss by week, oldest first, and explains in words how it learns', () => {
    const s = stats(walkForward(runs(30), OPTS));
    expect(s.weekly.length).toBeGreaterThan(0);
    expect([...s.weekly].map((w) => w.weekStart)).toEqual([...s.weekly].map((w) => w.weekStart).sort());
    expect(s.explanation).toMatch(/learned from 30 approved runs/);
    expect(s.explanation).toMatch(/weight halves every 40 runs/);
    expect(s.explanation).toMatch(/within 5%/);
  });

  it('ignores runs judged only against the benchmark', () => {
    expect(stats(walkForward(runs(3), OPTS)).evaluatedRuns).toBe(0);
  });
});

describe('scorecards: one verdict per milling center', () => {
  it('judges each center on its total, and puts the one that fell short first', () => {
    const history = runs(4);
    const a = [run({ centerId: 'cA', centerName: 'Mill A', riceKg: 748 }), run({ centerId: 'cA', centerName: 'Mill A', riceKg: 748 })];
    const b = [run({ centerId: 'cB', centerName: 'Mill B', riceKg: 612 }), run({ centerId: 'cB', centerName: 'Mill B', riceKg: 680 })];
    const fb = walkForward([...history, ...a, ...b], OPTS).slice(4);
    const cards = scorecards(fb, 5);
    expect(cards.map((c) => c.centerName)).toEqual(['Mill B', 'Mill A']);
    expect(cards[1]).toMatchObject({ runs: 2, more: 2, verdict: 'more', riceVariancePercent: 8.9 }); // the second run was judged after learning from the first
    expect(cards[0]).toMatchObject({ runs: 2, less: 1, asExpected: 1, verdict: 'less' });
    expect(cards[0].sentence).toMatch(/^Mill B: 2 runs, 50 kWh used\. Expected .* bags of packaged rice and got .*which is less than expected\.$/);
    expect(cards[1].latest?.verdict).toBe('more');
  });

  it('says "as expected" for a center within tolerance, and "exactly" nowhere it was not', () => {
    const fb = walkForward([...runs(4), run({ riceKg: 690 })], OPTS).slice(4);
    expect(scorecards(fb, 5)[0].verdict).toBe('as_expected');
    expect(scorecards(fb, 5)[0].sentence).toMatch(/which is as expected\./);
  });

  it('is empty when there are no runs', () => expect(scorecards([], 5)).toEqual([]));

  it('does not let early estimates (judged only against the benchmark) colour a center that has real verdicts', () => {
    const fb = walkForward([...runs(3), run(), run(), run()], OPTS); // the first three are early; the next three are exactly as expected
    const [card] = scorecards(fb, 5);
    expect(card).toMatchObject({ early: false, runs: 3, verdict: 'as_expected', riceVariancePercent: 0 });
    expect(fb.slice(0, 3).every((f) => f.early)).toBe(true);
  });

  it('shows a center that only has early estimates as such, and says so in words', () => {
    const [card] = scorecards(walkForward(runs(3), OPTS), 5);
    expect(card.early).toBe(true);
    expect(card.runs).toBe(3);
    expect(card.sentence).toMatch(/An early estimate: there is not enough history yet/);
  });
});
