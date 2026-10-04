import { BagSizes, COLD_START, MIN_RUNS, RunSample, benchmarkRates, confidenceOf, describeBasis, outputsFromEnergy, outputsFromPaddy, outputsFromRice, ratesFromRuns } from '../ai-yield.util';

const bags: BagSizes = { paddyKg: 50, riceKg: 50, brokenKg: 50, hullKg: 20, hullBasis: 'setting' };
// 1,000 kg of paddy used 25 kWh and gave 680 rice, 120 broken, 180 hull, 20 waste: 40 kg of paddy per kWh.
const run = (over: Partial<RunSample> = {}): RunSample => ({ paddyKg: 1000, energyKwh: 25, riceKg: 680, brokenKg: 120, hullKg: 180, wasteKg: 20, ...over });
const runs = (n: number, over: Partial<RunSample> = {}) => Array.from({ length: n }, () => run(over));

describe('ratesFromRuns', () => {
  it('turns total output over total power into what 1 kWh gives', () => {
    const r = ratesFromRuns(runs(12));
    expect(r.basis).toBe('history');
    expect(r.perKwh).toEqual({ paddyKg: 40, riceKg: 27.2, brokenKg: 4.8, hullKg: 7.2, wasteKg: 0.8 });
    expect(r.runs).toBe(12);
    expect(r.energyKwh).toBe(300);
    expect(r.paddyKg).toBe(12000);
  });

  it('uses ratio of totals, so one tiny run with a freak reading cannot drag the answer', () => {
    // 11 normal runs plus one 10 kg run that used 5 kWh: its own ratio is absurd (2 kg per kWh), the totals barely move.
    const r = ratesFromRuns([...runs(11), run({ paddyKg: 10, energyKwh: 5, riceKg: 6.8, brokenKg: 1.2, hullKg: 1.8, wasteKg: 0.2 })]);
    expect(r.perKwh.paddyKg).toBeGreaterThan(36);
    expect(r.perKwh.paddyKg).toBeLessThan(40);
  });

  it('gives a typical range of one spread either side, and never a negative one', () => {
    const r = ratesFromRuns([...runs(6, { riceKg: 640 }), ...runs(6, { riceKg: 720 })]);
    const [lo, hi] = r.typical!.riceKg;
    expect(lo).toBeLessThan(r.perKwh.riceKg);
    expect(hi).toBeGreaterThan(r.perKwh.riceKg);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(ratesFromRuns(runs(12)).typical!.riceKg).toEqual([27.2, 27.2]); // identical runs: no spread
  });

  it('is honest about how much to trust it: low, medium, high by number of runs', () => {
    expect([3, 4, 9, 10].map((n) => ratesFromRuns(runs(n)).confidence)).toEqual(['low', 'medium', 'medium', 'high']);
    expect([0, 3, 4, 10, 40].map(confidenceOf)).toEqual(['low', 'low', 'medium', 'high', 'high']);
  });

  it('ignores runs with no power reading or no paddy, which would divide by zero', () => {
    const r = ratesFromRuns([...runs(5), run({ energyKwh: 0 }), run({ paddyKg: 0 })]);
    expect(r.runs).toBe(5);
    expect(Number.isFinite(r.perKwh.riceKg)).toBe(true);
  });

  it(`falls back to a labelled industry benchmark below ${MIN_RUNS} runs, never to made-up company figures`, () => {
    for (const n of [0, 1, 2]) {
      const r = ratesFromRuns(runs(n));
      expect(r.basis).toBe('benchmark');
      expect(r.confidence).toBe('low');
      expect(r.typical).toBeNull();
      expect(r.energyKwh).toBe(0);
      expect(r.runs).toBe(n);
    }
    const b = benchmarkRates();
    expect(b.perKwh.paddyKg).toBeCloseTo(1 / COLD_START.kwhPerKg, 6);
    expect(b.perKwh.riceKg).toBeCloseTo(b.perKwh.paddyKg * 0.68, 6);
  });
});

describe('outputsFromEnergy', () => {
  const rates = ratesFromRuns(runs(12));

  it('answers the question: 1 kWh gives this many bags of packaged rice, broken rice and hull', () => {
    const o = outputsFromEnergy(rates, 1, bags);
    expect(o.paddyKg).toBe(40);
    expect(o.paddyBags).toBe(0.8);
    expect(o.riceKg).toBe(27.2);
    expect(o.riceBags).toBe(0.544);
    expect(o.brokenKg).toBe(4.8);
    expect(o.brokenBags).toBe(0.096);
    expect(o.hullKg).toBe(7.2);
    expect(o.hullBags).toBe(0.36);
  });

  it('scales in a straight line, without floating-point noise', () => {
    const o = outputsFromEnergy(rates, 100, bags);
    expect([o.riceKg, o.riceBags, o.brokenBags, o.hullBags, o.paddyBags]).toEqual([2720, 54.4, 9.6, 36, 80]);
    expect(outputsFromEnergy(rates, 1000, bags).riceBags).toBe(544);
  });

  it('uses each output\'s own bag weight', () => {
    const o = outputsFromEnergy(rates, 100, { ...bags, riceKg: 25, brokenKg: 100, hullKg: 40 });
    expect([o.riceBags, o.brokenBags, o.hullBags]).toEqual([108.8, 4.8, 18]);
  });

  it('carries the typical range in bags, and none for a benchmark', () => {
    const varied = ratesFromRuns([...runs(6, { riceKg: 640 }), ...runs(6, { riceKg: 720 })]);
    const o = outputsFromEnergy(varied, 100, bags);
    expect(o.typicalBags!.rice[0]).toBeLessThan(o.riceBags);
    expect(o.typicalBags!.rice[1]).toBeGreaterThan(o.riceBags);
    expect(outputsFromEnergy(benchmarkRates(), 100, bags).typicalBags).toBeNull();
  });
});

describe('outputsFromPaddy', () => {
  it('works backwards from paddy to the power it should take and the bags it should give', () => {
    const rates = ratesFromRuns(runs(12));
    const o = outputsFromPaddy(rates, 4000, bags); // 80 bags of 50 kg
    expect(o.kwh).toBe(100);
    expect(o.riceBags).toBe(54.4);
    expect(o.hullBags).toBe(36);
  });
});

describe('describeBasis', () => {
  it('says how many runs and how much power the figures rest on', () => {
    expect(describeBasis(ratesFromRuns(runs(12)), 'the whole company')).toMatch(/Based on 12 approved milling runs for the whole company .* 300 kWh in all/);
  });
  it('says plainly when it is only a benchmark and why', () => {
    const t = describeBasis(benchmarkRates(1), 'Warehouse 1');
    expect(t).toMatch(/Only 1 approved milling run with a power reading exist for Warehouse 1/);
    expect(t).toMatch(/not your company's own data/);
    expect(describeBasis(benchmarkRates(0))).toMatch(/No approved milling runs/);
  });
});

describe('outputsFromRice: from the rice recovered (or wanted) to the paddy, the power and the by-products', () => {
  const rates = ratesFromRuns(runs(12)); // 1 kWh: 40 kg paddy, 27.2 kg rice, 4.8 kg broken, 7.2 kg hull

  it('says how much paddy to send, how much power it takes, and the broken rice and hull that come with it', () => {
    const o = outputsFromRice(rates, 2720, bags); // 54.4 bags of 50 kg
    expect(o.kwh).toBe(100);
    expect(o.paddyKg).toBe(4000);
    expect(o.paddyBags).toBe(80);
    expect(o.riceKg).toBe(2720);
    expect(o.riceBags).toBe(54.4);
    expect(o.brokenBags).toBe(9.6);
    expect(o.hullBags).toBe(36);
  });

  it('is the exact reverse of paddy in: milling those bags and asking for the rice they gave lands on the same paddy and power', () => {
    for (const paddyKg of [250, 1000, 4000, 123456]) {
      const forward = outputsFromPaddy(rates, paddyKg, bags);
      const back = outputsFromRice(rates, forward.riceKg, bags);
      expect(back.paddyKg).toBeCloseTo(paddyKg, 0);
      expect(back.kwh).toBeCloseTo(forward.kwh, 1);
      expect(back.hullKg).toBeCloseTo(forward.hullKg, 0);
    }
  });

  it('agrees with the power direction too: the power that rice took gives that rice back', () => {
    const o = outputsFromRice(rates, 680, bags);
    const again = outputsFromEnergy(rates, o.kwh, bags);
    expect(again.riceKg).toBeCloseTo(680, 1);
    expect(again.paddyKg).toBeCloseTo(o.paddyKg, 1);
  });

  it('scales in a straight line: double the rice, double everything else', () => {
    const one = outputsFromRice(rates, 500, bags), two = outputsFromRice(rates, 1000, bags);
    expect(two.kwh).toBeCloseTo(one.kwh * 2, 2);
    expect(two.paddyKg).toBeCloseTo(one.paddyKg * 2, 2);
    expect(two.hullKg).toBeCloseTo(one.hullKg * 2, 2);
  });

  it('works on the benchmark too, and carries no range for it', () => {
    const o = outputsFromRice(benchmarkRates(), 680, bags);
    expect(o.paddyKg).toBeCloseTo(1000, 0); // 68 percent recovery
    expect(o.typicalBags).toBeNull();
  });

  it('never divides by zero if the rice rate is somehow zero: it says nothing is needed rather than returning Infinity', () => {
    const odd = { ...rates, perKwh: { ...rates.perKwh, riceKg: 0 } };
    const o = outputsFromRice(odd, 500, bags);
    expect(o.kwh).toBe(0);
    expect(Number.isFinite(o.paddyKg)).toBe(true);
  });
});
