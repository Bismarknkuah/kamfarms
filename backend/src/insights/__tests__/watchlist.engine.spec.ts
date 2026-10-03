import { WATCH, WatchInput, Run, Signal, buildWatchlist, median, robustSigma } from '../watchlist.engine';

const NOW = new Date('2026-10-03T12:00:00Z');
const DAY = 86_400_000;
const ago = (n: number) => new Date(NOW.getTime() - n * DAY);

function input(over: Partial<WatchInput> = {}): WatchInput {
  return {
    now: NOW, windowDays: 30,
    centers: [{ id: 'c1', name: 'Milling Center 1' }],
    warehouses: [{ id: 'w1', name: 'Warehouse 1' }],
    farms: [{ id: 'f1', name: 'Farm A' }],
    runs: [], meterDays: [], shipments: [], adjustments: [], reserved: [], intake: [], expenses: [],
    ...over,
  };
}
const run = (n: number, daysBefore: number, rice: number, kwh: number | null = null, status: Run['status'] = 'APPROVED', paddy = 10000, centerId = 'c1'): Run =>
  ({ id: `r${n}`, number: `PR-${n}`, centerId, date: ago(daysBefore), paddyKg: paddy, riceKg: rice, kwh, status });
/** Earlier approved runs: recovery 67/68/69%, so the usual is 68%. */
const history = (n = 12, kwh: number | null = null) => Array.from({ length: n }, (_, i) => run(i + 1, 40 + i * 5, 6800 + ((i % 3) - 1) * 100, kwh));
const find = (signals: Signal[], code: string) => signals.find((s) => s.code === code);
const statusOf = (w: ReturnType<typeof buildWatchlist>, id: string) => w.locations.find((l) => l.id === id)?.status;

describe('the numbers it relies on', () => {
  it('median handles odd, even and empty lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
  });
  it('robust sigma is not dragged by one wild value', () => {
    expect(robustSigma([68, 68, 69, 67, 68, 68, 100])).toBeLessThan(2);
  });
});

describe('milling centers: rice recovered', () => {
  it('stays quiet when recent runs match the center\'s own usual', () => {
    const w = buildWatchlist(input({ runs: [...history(), run(101, 3, 6800), run(102, 8, 6900)] }));
    expect(w.signals).toEqual([]);
    expect(statusOf(w, 'c1')).toBe('CLEAR');
  });

  it('flags a run that gave clearly less rice, with the shortfall in kilograms', () => {
    const w = buildWatchlist(input({ runs: [...history(), run(101, 3, 6200)] }));
    const s = find(w.signals, 'LOW_RECOVERY') as Signal;
    expect(s.severity).toBe('MEDIUM');
    expect(s.expected).toContain('68.0%');
    expect(s.actual).toContain('62.0%');
    expect(s.detail).toContain('600 kg');
    expect(s.evidence).toEqual(['PR-101: 62.0%']);
    expect(statusOf(w, 'c1')).toBe('WATCH');
  });

  it('is HIGH when the gap is very large, or when several runs fall short', () => {
    expect(find(buildWatchlist(input({ runs: [...history(), run(101, 3, 5700)] })).signals, 'LOW_RECOVERY')?.severity).toBe('HIGH');
    const three = buildWatchlist(input({ runs: [...history(), run(101, 3, 6200), run(102, 6, 6200), run(103, 9, 6200)] }));
    expect(find(three.signals, 'LOW_RECOVERY')?.severity).toBe('HIGH');
    expect(statusOf(three, 'c1')).toBe('INVESTIGATE');
  });

  it('does not judge a center with too little history, and says so', () => {
    const w = buildWatchlist(input({ runs: [...history(3), run(101, 3, 5000)] }));
    expect(w.signals).toEqual([]);
    expect(statusOf(w, 'c1')).toBe('NOT_ENOUGH_DATA');
    expect(w.locations[0].skipped.join(' ')).toContain('needs 5 earlier approved runs');
  });

  it('builds its picture of "usual" only from approved runs', () => {
    const unapproved = history().map((r) => ({ ...r, status: 'SUBMITTED' as const }));
    expect(statusOf(buildWatchlist(input({ runs: [...unapproved, run(101, 3, 5000)] })), 'c1')).toBe('NOT_ENOUGH_DATA');
  });

  it('is not triggered by ordinary wobble when every earlier run was identical', () => {
    const same = Array.from({ length: 10 }, (_, i) => run(i + 1, 40 + i * 5, 6800));
    expect(buildWatchlist(input({ runs: [...same, run(101, 3, 6600)] })).signals).toEqual([]);
    expect(find(buildWatchlist(input({ runs: [...same, run(101, 3, 6200)] })).signals, 'LOW_RECOVERY')).toBeDefined();
  });

  it('notes unusually HIGH recovery too, as a low-severity prompt to confirm the weights', () => {
    const s = find(buildWatchlist(input({ runs: [...history(), run(101, 3, 7500)] })).signals, 'HIGH_RECOVERY') as Signal;
    expect(s.severity).toBe('LOW');
    expect(s.whatToCheck).toContain('weights');
  });

  it('judges only the chosen period', () => {
    const old = buildWatchlist(input({ runs: [...history(), run(101, 45, 5000)] }));
    expect(find(old.signals, 'LOW_RECOVERY')).toBeUndefined();
  });

  it('says how much history stands behind the comparison', () => {
    const conf = (n: number) => find(buildWatchlist(input({ runs: [...history(n), run(901, 3, 6200)] })).signals, 'LOW_RECOVERY')?.confidence;
    expect([conf(6), conf(12), conf(30)]).toEqual(['LOW', 'MEDIUM', 'HIGH']);
  });
});

describe('milling centers: power used per kilogram of paddy', () => {
  const recent = (kwh: number, n = 3) => Array.from({ length: n }, (_, i) => run(200 + i, 3 + i * 4, 6800, kwh));
  it.each([
    [400, null], [480, 'MEDIUM'], [600, 'HIGH'],
  ])('with %p kWh per run: %p', (kwh, expected) => {
    const s = find(buildWatchlist(input({ runs: [...history(12, 370), ...recent(kwh as number)] })).signals, 'HIGH_POWER_PER_KG');
    expect(s?.severity ?? null).toBe(expected);
  });
  it('shows the usual and the actual figure', () => {
    const s = find(buildWatchlist(input({ runs: [...history(12, 370), ...recent(480)] })).signals, 'HIGH_POWER_PER_KG') as Signal;
    expect(s.expected).toContain('0.037');
    expect(s.actual).toContain('0.048');
  });
  it('needs enough recent runs with power logged', () => {
    const w = buildWatchlist(input({ runs: [...history(12, 370), ...recent(900, 2)] }));
    expect(find(w.signals, 'HIGH_POWER_PER_KG')).toBeUndefined();
    expect(w.locations[0].skipped.join(' ')).toContain('Power per kg needs 3 runs');
  });
});

describe('milling centers: power used when nothing was logged', () => {
  const meter = (n: number, kwh: number) => ({ centerId: 'c1', date: ago(n), kwh });
  const production = [2, 5, 8, 11, 14, 17].map((d, i) => run(300 + i, d, 6800));
  const busyDays = [2, 5, 8, 11, 14, 17].map((d) => meter(d, 400));
  const go = (extra: ReturnType<typeof meter>[], runs = production) => buildWatchlist(input({ runs: [...history(), ...runs], meterDays: [...busyDays, ...extra] }));

  it('flags days with real power use and no production recorded, HIGH from three days', () => {
    const s = find(go([meter(20, 90), meter(23, 95), meter(26, 85)]).signals, 'POWER_WITHOUT_PRODUCTION') as Signal;
    expect(s.severity).toBe('HIGH');
    expect(s.evidence[0]).toMatch(/^2026-09-07: 85 kWh$/); // the earliest idle day first
    expect(s.detail).toContain('3 of 9 metered days');
  });
  it('is MEDIUM for a single day', () => {
    expect(find(go([meter(20, 90)]).signals, 'POWER_WITHOUT_PRODUCTION')?.severity).toBe('MEDIUM');
  });
  it('ignores a trickle of power (standby, lighting)', () => {
    expect(find(go([meter(20, 50)]).signals, 'POWER_WITHOUT_PRODUCTION')).toBeUndefined();
  });
  it('counts a day as a production day if any run, even an unapproved one, was logged on it', () => {
    const w = go([meter(20, 400)], [...production, run(399, 20, 6800, null, 'SUBMITTED')]);
    expect(find(w.signals, 'POWER_WITHOUT_PRODUCTION')).toBeUndefined();
  });
  it('needs meter readings on enough days', () => {
    const w = buildWatchlist(input({ runs: [...history(), ...production], meterDays: [meter(2, 400), meter(5, 400), meter(20, 400)] }));
    expect(w.locations[0].skipped.join(' ')).toContain('meter readings on 5 days');
  });
});

describe('warehouses: paddy arriving short', () => {
  const ship = (i: number, expected: number, received: number, farmId = 'f1', daysBefore = 5) => ({ id: `s${i}`, number: `SH-${i}`, warehouseId: 'w1', farmId, expectedBags: expected, receivedBags: received, receivedAt: ago(daysBefore) });
  const many = (shortBy: number[], farmId = 'f1', total = 10) => Array.from({ length: total }, (_, i) => ship(i + 1, 100, 100 - (shortBy[i] ?? 0), farmId, 2 + i));
  const go = (shipments: ReturnType<typeof ship>[], farms = [{ id: 'f1', name: 'Farm A' }, { id: 'f2', name: 'Farm B' }]) => buildWatchlist(input({ shipments, farms }));

  it('flags a clear shortfall as MEDIUM when it is a small share of many loads', () => {
    const s = find(go(many([10, 10, 10, 10], 'f1', 20)).signals, 'RECEIVING_SHORTFALL') as Signal;
    expect(s.severity).toBe('MEDIUM');
    expect(s.detail).toContain('4 of 20 shipments');
    expect(s.detail).toContain('40 bags (2.0% of the 2,000 expected)');
  });
  it('is HIGH when the shortfall is large, and names the farm most of it came from', () => {
    const s = find(go(many([15, 15, 15], 'f2')).signals, 'RECEIVING_SHORTFALL') as Signal;
    expect(s.severity).toBe('HIGH');
    expect(s.detail).toContain('Most of it came from Farm B (45 bags)');
    expect(s.evidence[0]).toBe('SH-1: expected 100, received 85');
  });
  it('stays quiet for tiny differences, and for loads that arrive in full', () => {
    expect(go(many([1, 1, 2])).signals).toEqual([]);
    expect(statusOf(go(many([])), 'w1')).toBe('CLEAR');
  });
  it('needs enough shipments to judge', () => {
    const w = go(many([30, 30], 'f1', 2));
    expect(find(w.signals, 'RECEIVING_SHORTFALL')).toBeUndefined();
    expect(w.locations.find((l) => l.id === 'w1')?.skipped.join(' ')).toContain('need 3 shipments');
  });
  it('ignores shipments received before the period', () => {
    expect(go(many([15, 15, 15]).map((s) => ({ ...s, receivedAt: ago(60) }))).signals).toEqual([]);
  });
});

describe('any place: stock written down, against its sister places', () => {
  const adj = (i: number, bags: number, id = 'w1', kind: 'WAREHOUSE' | 'FARM' | 'MILLING_CENTER' = 'WAREHOUSE', daysBefore = 4) => ({ id: `a${i}`, number: `ADJ-${i}`, locationKind: kind, locationId: id, bags, at: ago(daysBefore) });
  const three = [{ id: 'w1', name: 'Warehouse 1' }, { id: 'w2', name: 'Warehouse 2' }, { id: 'w3', name: 'Warehouse 3' }];
  const go = (adjustments: ReturnType<typeof adj>[]) => buildWatchlist(input({ warehouses: three, adjustments }));

  it('flags a warehouse that wrote down far more than its peers', () => {
    const s = find(go([adj(1, -20), adj(2, -15), adj(3, -10), adj(4, -5, 'w2')]).signals, 'STOCK_WRITE_DOWNS') as Signal;
    expect(s.locationName).toBe('Warehouse 1');
    expect(s.severity).toBe('MEDIUM');
    expect(s.detail).toContain('3 approved corrections removed 45 bags');
  });
  it('is HIGH for a very large write-down, or for a long run of small ones', () => {
    expect(find(go([adj(1, -60)]).signals, 'STOCK_WRITE_DOWNS')?.severity).toBe('HIGH');
    expect(find(go(Array.from({ length: 6 }, (_, i) => adj(i + 1, -4))).signals, 'STOCK_WRITE_DOWNS')?.severity).toBe('HIGH');
  });
  it('does not single anyone out when all the places write down about the same', () => {
    expect(go([adj(1, -30), adj(2, -30, 'w2'), adj(3, -30, 'w3')]).signals).toEqual([]);
  });
  it('ignores additions, and corrections from before the period', () => {
    expect(go([adj(1, +80), adj(2, -90, 'w1', 'WAREHOUSE', 50)]).signals).toEqual([]);
  });
  it('applies to farms and milling centers too, each compared with its own kind', () => {
    const farms = [{ id: 'f1', name: 'Farm A' }, { id: 'f2', name: 'Farm B' }];
    const w = buildWatchlist(input({ farms, adjustments: [adj(1, -30, 'f1', 'FARM'), adj(2, -2, 'f2', 'FARM'), adj(3, -40, 'c1', 'MILLING_CENTER')] }));
    const farm = w.signals.find((s) => s.locationId === 'f1') as Signal;
    expect(farm.tab).toBe('farms');
    expect(w.signals.find((s) => s.locationId === 'c1')?.tab).toBe('milling');
  });
});

describe('warehouses: orders reserved but not leaving', () => {
  const order = (days: number, n = 1) => ({ id: `o${n}`, number: `SO-${n}`, warehouseId: 'w1', since: ago(days) });
  it.each([[2, null], [4, 'MEDIUM'], [8, 'HIGH']])('an order reserved for %p days: %p', (days, expected) => {
    const s = find(buildWatchlist(input({ reserved: [order(days as number)] })).signals, 'RESERVED_NOT_DELIVERED');
    expect(s?.severity ?? null).toBe(expected);
  });
  it('lists the oldest first', () => {
    const s = find(buildWatchlist(input({ reserved: [order(4, 1), order(9, 2)] })).signals, 'RESERVED_NOT_DELIVERED') as Signal;
    expect(s.evidence).toEqual(['SO-2: 9 days', 'SO-1: 4 days']);
  });
});

describe('farms: paddy logged against usual, allowing for the season', () => {
  const entry = (farmId: string, daysBefore: number, bags: number, status: 'APPROVED' | 'REJECTED' = 'APPROVED') => ({ farmId, date: ago(daysBefore), bags, status });
  const usual = (farmId: string) => [entry(farmId, 45, 100), entry(farmId, 75, 100), entry(farmId, 105, 100)];
  const farms = [{ id: 'fa', name: 'Farm A' }, { id: 'fb', name: 'Farm B' }, { id: 'fc', name: 'Farm C' }];
  const go = (rows: ReturnType<typeof entry>[]) => buildWatchlist(input({ farms, intake: rows }));

  it('flags a farm whose intake fell by more than half while the others held steady', () => {
    const w = go([...usual('fa'), ...usual('fb'), ...usual('fc'), entry('fa', 5, 30), entry('fb', 5, 100), entry('fc', 5, 100)]);
    const s = find(w.signals, 'INTAKE_DROP') as Signal;
    expect(s.locationName).toBe('Farm A');
    expect(s.severity).toBe('MEDIUM');
    expect(s.detail).toContain('30%');
    expect(s.whatToCheck).toContain('seasonal');
  });
  it('is HIGH when it fell to a quarter or less', () => {
    const w = go([...usual('fa'), ...usual('fb'), entry('fa', 5, 20), entry('fb', 5, 100)]);
    expect(find(w.signals, 'INTAKE_DROP')?.severity).toBe('HIGH');
  });
  it('treats a fall shared by every farm as the season, not a suspicion', () => {
    const w = go([...usual('fa'), ...usual('fb'), ...usual('fc'), entry('fa', 5, 40), entry('fb', 5, 40), entry('fc', 5, 40)]);
    expect(w.signals).toEqual([]);
  });
  it('still flags a farm that fell far further than the others in an off-season', () => {
    const w = go([...usual('fa'), ...usual('fb'), ...usual('fc'), entry('fa', 5, 10), entry('fb', 5, 40), entry('fc', 5, 40)]);
    const s = find(w.signals, 'INTAKE_DROP') as Signal;
    expect(s.locationName).toBe('Farm A');
    expect(s.severity).toBe('MEDIUM'); // never HIGH when the season explains part of it
    expect(s.detail).toContain('probably the season');
  });
  it('does not judge a farm that has never logged much', () => {
    const w = go([entry('fa', 45, 5), entry('fa', 75, 5), entry('fa', 105, 5), entry('fa', 5, 0)]);
    expect(find(w.signals, 'INTAKE_DROP')).toBeUndefined();
    expect(w.locations.find((l) => l.id === 'fa')?.skipped.join(' ')).toContain('Paddy intake needs about 20 bags');
  });

  describe('rejection rate', () => {
    const decided = (rejected: number, total: number) => Array.from({ length: total }, (_, i) => entry('fa', 2 + i, 10, i < rejected ? 'REJECTED' : 'APPROVED'));
    it.each([[1, 10, null], [3, 10, 'MEDIUM'], [5, 10, 'HIGH']])('%p rejected of %p: %p', (rej, total, expected) => {
      const s = find(go(decided(rej as number, total as number)).signals, 'HIGH_REJECTION_RATE');
      expect(s?.severity ?? null).toBe(expected);
    });
    it('needs at least six decisions', () => {
      expect(find(go(decided(3, 5)).signals, 'HIGH_REJECTION_RATE')).toBeUndefined();
    });
  });
});

describe('farms and warehouses: spending', () => {
  const spend = (i: number, daysBefore: number, amount: number, where: { farmId?: string | null; warehouseId?: string | null } = { farmId: 'f1' }, hasReceipt = true) =>
    ({ id: `e${i}`, number: `EXP-${i}`, farmId: where.farmId ?? null, warehouseId: where.warehouseId ?? null, amount, date: ago(daysBefore), hasReceipt });
  const usual = (where?: { farmId?: string | null; warehouseId?: string | null }) => [spend(1, 45, 1500, where), spend(2, 75, 1500, where), spend(3, 105, 1500, where)];
  const go = (expenses: ReturnType<typeof spend>[]) => buildWatchlist(input({ expenses }));

  it.each([[2500, null], [3200, 'MEDIUM'], [5000, 'HIGH']])('%p this period against 1,500 usually: %p', (amount, expected) => {
    const s = find(go([...usual(), spend(9, 5, amount as number)]).signals, 'SPEND_SPIKE');
    expect(s?.severity ?? null).toBe(expected);
  });
  it('lists the biggest items so they can be checked', () => {
    const s = find(go([...usual(), spend(9, 5, 4000), spend(10, 6, 1200)]).signals, 'SPEND_SPIKE') as Signal;
    expect(s.evidence[0]).toBe('EXP-9: GHS 4,000');
  });
  it('works for warehouses', () => {
    const s = find(go([...usual({ warehouseId: 'w1' }), spend(9, 5, 5000, { warehouseId: 'w1' })]).signals, 'SPEND_SPIKE') as Signal;
    expect(s.locationKind).toBe('WAREHOUSE');
    expect(s.tab).toBe('warehouses');
  });
  it('ignores head-office spending that belongs to no farm or warehouse', () => {
    expect(go([...usual({ farmId: null }), spend(9, 5, 9000, { farmId: null })]).signals).toEqual([]);
  });
  it('does not judge a place with little spending on record', () => {
    const w = go([spend(1, 45, 200), spend(9, 5, 5000)]);
    expect(find(w.signals, 'SPEND_SPIKE')).toBeUndefined();
    expect(w.locations.find((l) => l.id === 'f1')?.skipped.join(' ')).toContain('Spending against usual needs');
  });
  it('flags many expenses with no receipt, as a low-severity prompt', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((i) => spend(i, 3 + i, 500, { farmId: 'f1' }, i === 6));
    const s = find(go(rows).signals, 'MISSING_RECEIPTS') as Signal;
    expect(s.severity).toBe('LOW');
    expect(s.detail).toContain('5 of 6 approved expenses in the last 30 days (GHS 2,500)');
  });
});

describe('the watchlist as a whole', () => {
  const worst = input({
    runs: [...history(), run(101, 3, 5700)],
    shipments: Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, number: `SH-${i}`, warehouseId: 'w1', farmId: 'f1', expectedBags: 100, receivedBags: i < 3 ? 85 : 100, receivedAt: ago(2 + i) })),
    reserved: [{ id: 'o1', number: 'SO-1', warehouseId: 'w1', since: ago(4) }],
  });
  it('puts the most serious first, counts them, and gives each a unique id', () => {
    const w = buildWatchlist(worst);
    expect(w.signals.map((s) => s.severity)).toEqual([...w.signals.map((s) => s.severity)].sort((a, b) => ['HIGH', 'MEDIUM', 'LOW'].indexOf(a) - ['HIGH', 'MEDIUM', 'LOW'].indexOf(b)));
    expect(w.summary).toMatchObject({ total: w.signals.length, high: w.signals.filter((s) => s.severity === 'HIGH').length, medium: w.signals.filter((s) => s.severity === 'MEDIUM').length });
    expect(new Set(w.signals.map((s) => s.id)).size).toBe(w.signals.length);
    expect(w.summary.placesToInvestigate).toBe(2);
  });
  it('reports a status for every place, so silence is never mistaken for health', () => {
    const w = buildWatchlist(input());
    expect(w.locations.map((l) => `${l.kind}:${l.status}`)).toEqual(['MILLING_CENTER:NOT_ENOUGH_DATA', 'WAREHOUSE:NOT_ENOUGH_DATA', 'FARM:NOT_ENOUGH_DATA']);
    expect(w.locations.every((l) => l.checked.length + l.skipped.length > 0)).toBe(true);
  });
  it('only calls a place CLEAR when a check that needed history was actually made on it', () => {
    // stock corrections and reserved orders look for events; finding none is not the same as having judged the place
    const quietButUnjudged = buildWatchlist(input({ adjustments: [], reserved: [] }));
    expect(quietButUnjudged.locations.every((l) => l.checked.length > 0 && l.status === 'NOT_ENOUGH_DATA')).toBe(true);
    const judged = buildWatchlist(input({ runs: [...history(), run(101, 3, 6800)] }));
    expect(statusOf(judged, 'c1')).toBe('CLEAR');
  });
  it('uses a shorter period when asked', () => {
    const w7 = buildWatchlist({ ...worst, windowDays: 7 });
    expect(find(w7.signals, 'RECEIVING_SHORTFALL')?.detail).toContain('3 of 6 shipments received in the last 7 days'); // only the loads that arrived within 7 days
    expect(w7.windowDays).toBe(7);
    const older = buildWatchlist({ ...worst, windowDays: 7, shipments: worst.shipments.map((x) => ({ ...x, receivedAt: ago(20) })) });
    expect(find(older.signals, 'RECEIVING_SHORTFALL')).toBeUndefined();
  });
  it('shows no more than six pieces of evidence per flag, and never names a person', () => {
    const many = buildWatchlist(input({ runs: [...history(), ...Array.from({ length: 9 }, (_, i) => run(500 + i, 1 + i * 3, 6000))] }));
    expect(find(many.signals, 'LOW_RECOVERY')?.evidence.length).toBe(6);
    expect(JSON.stringify(many)).not.toMatch(/operator|submittedBy|approvedBy|userId|firstName/i);
  });
  it('keeps every threshold in one readable place', () => {
    expect(WATCH.minBaselineRuns).toBe(5);
    expect(Object.keys(WATCH).length).toBeGreaterThan(25);
  });
});
