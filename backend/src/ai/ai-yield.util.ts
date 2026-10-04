/**
 * What power and paddy turn into, worked out from the company's own approved milling runs.
 *
 * Everything here is a ratio of TOTALS (all the rice from all the runs divided by all the power those runs used),
 * not an average of each run's own ratio, so one tiny run with a freak reading cannot drag the answer around. The
 * spread around it (the "typical range") does use each run's own ratio, because that is what shows how much runs differ.
 */
export const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Used ONLY when there are too few runs with a power reading. Industry-typical, never the company's data, always labelled so. */
export const COLD_START = { recoveryPercent: 68, brokenPercent: 12, hullPercent: 18, wastePercent: 2, kwhPerKg: 0.028 };
/** Fewer runs than this and the numbers are the benchmark, not the company's own. */
export const MIN_RUNS = 3;

export type Confidence = 'high' | 'medium' | 'low';
export const confidenceOf = (runs: number): Confidence => (runs >= 10 ? 'high' : runs >= 4 ? 'medium' : 'low');

export interface RunSample { paddyKg: number; energyKwh: number; riceKg: number; brokenKg: number; hullKg: number; wasteKg: number }
export interface PerKwh { paddyKg: number; riceKg: number; brokenKg: number; hullKg: number; wasteKg: number }
export type Range = [number, number];

export interface YieldRates {
  runs: number;
  basis: 'history' | 'benchmark';
  confidence: Confidence;
  /** Metered power behind the figures (0 for the benchmark). */
  energyKwh: number;
  /** Paddy behind the figures (0 for the benchmark). */
  paddyKg: number;
  perKwh: PerKwh;
  /** One spread either side of the figure, per kWh. Null for the benchmark. */
  typical: { riceKg: Range; brokenKg: Range; hullKg: Range } | null;
}

export interface BagSizes { paddyKg: number; riceKg: number; brokenKg: number; hullKg: number; hullBasis: 'history' | 'setting' }

export interface Outputs {
  kwh: number;
  paddyKg: number; paddyBags: number;
  riceKg: number; riceBags: number;
  brokenKg: number; brokenBags: number;
  hullKg: number; hullBags: number;
  wasteKg: number;
  /** Typical range in bags, one spread either side. Null when the figures are the benchmark. */
  typicalBags: { rice: Range; broken: Range; hull: Range } | null;
}

export function benchmarkRates(runs = 0): YieldRates {
  const paddy = 1 / COLD_START.kwhPerKg;
  const part = (percent: number) => (paddy * percent) / 100;
  return {
    runs, basis: 'benchmark', confidence: 'low', energyKwh: 0, paddyKg: 0, typical: null,
    perKwh: { paddyKg: paddy, riceKg: part(COLD_START.recoveryPercent), brokenKg: part(COLD_START.brokenPercent), hullKg: part(COLD_START.hullPercent), wasteKg: part(COLD_START.wastePercent) },
  };
}

function spreadOf(values: number[], central: number): Range {
  if (values.length < 2) return [central, central];
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1));
  return [Math.max(0, central - sd), central + sd];
}

/**
 * What 1 kWh gives, from runs listed NEWEST FIRST. With a half-life (in runs) recent runs count more than old ones, so the
 * figures follow the mill as it changes (a serviced machine, a new operator); a run's weight halves every `halfLifeRuns`
 * runs back. Without one every run counts equally.
 */
export function ratesFromRuns(samples: RunSample[], options: { halfLifeRuns?: number } = {}): YieldRates {
  const runs = samples.filter((s) => s.energyKwh > 0 && s.paddyKg > 0);
  if (runs.length < MIN_RUNS) return benchmarkRates(runs.length);
  const half = options.halfLifeRuns && options.halfLifeRuns > 0 ? options.halfLifeRuns : 0;
  const weight = (k: number) => (half ? Math.pow(0.5, k / half) : 1);
  const total = (pick: (s: RunSample) => number) => runs.reduce((t, s) => t + pick(s), 0);
  const weighted = (pick: (s: RunSample) => number) => runs.reduce((t, s, k) => t + weight(k) * pick(s), 0);
  const energyW = weighted((s) => s.energyKwh);
  const per = (pick: (s: RunSample) => number) => weighted(pick) / energyW;
  const perKwh: PerKwh = {
    paddyKg: per((s) => s.paddyKg), riceKg: per((s) => s.riceKg), brokenKg: per((s) => s.brokenKg), hullKg: per((s) => s.hullKg), wasteKg: per((s) => s.wasteKg),
  };
  const range = (pick: (s: RunSample) => number, central: number): Range => {
    const [lo, hi] = spreadOf(runs.map((s) => pick(s) / s.energyKwh), central);
    return [round3(lo), round3(hi)];
  };
  return {
    runs: runs.length, basis: 'history', confidence: confidenceOf(runs.length), energyKwh: round3(total((s) => s.energyKwh)), paddyKg: round3(total((s) => s.paddyKg)),
    perKwh: { paddyKg: round3(perKwh.paddyKg), riceKg: round3(perKwh.riceKg), brokenKg: round3(perKwh.brokenKg), hullKg: round3(perKwh.hullKg), wasteKg: round3(perKwh.wasteKg) },
    typical: { riceKg: range((s) => s.riceKg, perKwh.riceKg), brokenKg: range((s) => s.brokenKg, perKwh.brokenKg), hullKg: range((s) => s.hullKg, perKwh.hullKg) },
  };
}

/** What a given amount of metered power should produce. */
export function outputsFromEnergy(rates: YieldRates, kwh: number, bags: BagSizes): Outputs {
  const kg = (perKwh: number) => round3(perKwh * kwh);
  const paddyKg = kg(rates.perKwh.paddyKg), riceKg = kg(rates.perKwh.riceKg), brokenKg = kg(rates.perKwh.brokenKg), hullKg = kg(rates.perKwh.hullKg);
  const inBags = (perKwh: number, bagKg: number) => round3((perKwh * kwh) / bagKg);
  const t = rates.typical;
  return {
    kwh: round3(kwh),
    paddyKg, paddyBags: round3(paddyKg / bags.paddyKg),
    riceKg, riceBags: round3(riceKg / bags.riceKg),
    brokenKg, brokenBags: round3(brokenKg / bags.brokenKg),
    hullKg, hullBags: round3(hullKg / bags.hullKg),
    wasteKg: kg(rates.perKwh.wasteKg),
    typicalBags: t && {
      rice: [inBags(t.riceKg[0], bags.riceKg), inBags(t.riceKg[1], bags.riceKg)],
      broken: [inBags(t.brokenKg[0], bags.brokenKg), inBags(t.brokenKg[1], bags.brokenKg)],
      hull: [inBags(t.hullKg[0], bags.hullKg), inBags(t.hullKg[1], bags.hullKg)],
    },
  };
}

/** What a given amount of paddy should produce, and the power it should take. */
export function outputsFromPaddy(rates: YieldRates, paddyKg: number, bags: BagSizes): Outputs {
  return outputsFromEnergy(rates, paddyKg / rates.perKwh.paddyKg, bags);
}

/**
 * What it takes to get a given amount of packaged rice (recovered, or wanted): the paddy to send to the mill, the power it should take,
 * and the broken rice and hull that come with it. The same rates as the other two directions, read the other way round.
 */
export function outputsFromRice(rates: YieldRates, riceKg: number, bags: BagSizes): Outputs {
  const riceKgPerKwh = rates.perKwh.riceKg;
  return outputsFromEnergy(rates, riceKgPerKwh > 0 ? riceKg / riceKgPerKwh : 0, bags);
}

/** Plain words saying where the figures come from, so nobody has to guess how much to trust them. */
export function describeBasis(rates: YieldRates, subject = 'your milling runs'): string {
  if (rates.basis === 'benchmark') {
    const have = rates.runs === 0 ? 'No approved milling runs with a power reading exist' : `Only ${rates.runs} approved milling run${rates.runs === 1 ? '' : 's'} with a power reading exist`;
    return `${have} for ${subject}, which is fewer than the ${MIN_RUNS} needed. These figures are an industry benchmark (about ${Math.round(COLD_START.kwhPerKg * 1000)} kWh per tonne of paddy, ${COLD_START.recoveryPercent}% rice, ${COLD_START.brokenPercent}% broken, ${COLD_START.hullPercent}% hull), not your company's own data.`;
  }
  return `Based on ${rates.runs} approved milling runs for ${subject} that recorded their power, ${Math.round(rates.energyKwh).toLocaleString('en-US')} kWh in all. The typical range is one spread either side of the figure.`;
}
