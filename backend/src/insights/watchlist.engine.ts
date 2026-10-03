/**
 * The watchlist: where recent records look unusual compared with what each
 * place's OWN history predicts.
 *
 * Nothing here is a verdict. A flag means "worth a look", and it comes with
 * the numbers behind it, the expected figure, and what to check next. The
 * engine never uses a benchmark invented from outside: every comparison is a
 * place against its own earlier approved records (or, for a few checks, against
 * its sister places), and a check that does not have enough history says so
 * instead of staying quiet. "No flags" therefore never silently means "fine".
 *
 * It names record numbers and places, never people.
 *
 * Pure functions only (no database), so every rule is tested with plain data.
 */

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type LocationKind = 'MILLING_CENTER' | 'WAREHOUSE' | 'FARM';
export type WatchTab = 'milling' | 'warehouses' | 'farms' | 'expenses';
export type SignalCode =
  | 'LOW_RECOVERY' | 'HIGH_RECOVERY' | 'HIGH_POWER_PER_KG' | 'POWER_WITHOUT_PRODUCTION'
  | 'RECEIVING_SHORTFALL' | 'STOCK_WRITE_DOWNS' | 'RESERVED_NOT_DELIVERED'
  | 'INTAKE_DROP' | 'HIGH_REJECTION_RATE' | 'SPEND_SPIKE' | 'MISSING_RECEIPTS';

export interface Signal {
  id: string;
  code: SignalCode;
  severity: Severity;
  locationKind: LocationKind;
  locationId: string;
  locationName: string;
  title: string;
  detail: string;
  expected: string | null;
  actual: string | null;
  evidence: string[];
  whatToCheck: string;
  /** How much history stands behind the comparison. */
  confidence: Confidence;
  /** Which Oversight tab shows the underlying figures. */
  tab: WatchTab;
}

export interface LocationStatus {
  kind: LocationKind;
  id: string;
  name: string;
  status: 'CLEAR' | 'WATCH' | 'INVESTIGATE' | 'NOT_ENOUGH_DATA';
  /** Checks that had enough records to judge. */
  checked: string[];
  /** Checks that could not be made, and why. */
  skipped: string[];
}

export interface Watchlist {
  generatedAt: string;
  windowDays: number;
  summary: { high: number; medium: number; low: number; total: number; placesToInvestigate: number };
  signals: Signal[];
  locations: LocationStatus[];
}

// ---- the plain records the engine reads (the service maps the database onto these) ----
export interface Run { id: string; number: string; centerId: string; date: Date; paddyKg: number; riceKg: number; kwh: number | null; status: 'APPROVED' | 'SUBMITTED' }
export interface MeterDay { centerId: string; date: Date; kwh: number }
export interface ShipmentRow { id: string; number: string; warehouseId: string; farmId: string; expectedBags: number; receivedBags: number; receivedAt: Date }
export interface AdjustmentRow { id: string; number: string; locationKind: LocationKind; locationId: string; bags: number; at: Date }
export interface ReservedRow { id: string; number: string; warehouseId: string; since: Date }
export interface IntakeRow { farmId: string; date: Date; bags: number; status: 'APPROVED' | 'REJECTED' }
export interface ExpenseRow { id: string; number: string; farmId: string | null; warehouseId: string | null; amount: number; date: Date; hasReceipt: boolean }
export interface Place { id: string; name: string }

export interface WatchInput {
  now: Date;
  windowDays: number;
  centers: Place[];
  warehouses: Place[];
  farms: Place[];
  runs: Run[];
  meterDays: MeterDay[];
  shipments: ShipmentRow[];
  adjustments: AdjustmentRow[];
  reserved: ReservedRow[];
  intake: IntakeRow[];
  expenses: ExpenseRow[];
}

/** Every threshold in one place, so the rules can be read, argued with and changed deliberately. */
export const WATCH = {
  minBaselineRuns: 5,
  recoverySigma: 3,
  recoveryDropPoints: 5,
  recoverySigmaFloor: 1,
  minRunsWithPower: 3,
  powerMedium: 0.25,
  powerHigh: 0.5,
  minMeteredDays: 5,
  idlePowerMinKwh: 10,
  idlePowerShare: 0.2,
  minShipments: 3,
  shortfallMediumPct: 1.5,
  shortfallMediumBags: 5,
  shortfallHighPct: 4,
  shortfallHighBags: 10,
  writeDownMediumBags: 20,
  writeDownHighBags: 50,
  writeDownHighCount: 6,
  reservedDays: 3,
  reservedHighDays: 7,
  minBaselineBags: 20,
  intakeDropRatio: 0.5,
  intakeHighRatio: 0.25,
  seasonalPeerRatio: 0.7,
  peerRelative: 0.6,
  minDecidedEntries: 6,
  rejectMedium: 0.25,
  rejectHigh: 0.4,
  minBaselineSpend: 1000,
  spikeMediumFactor: 2,
  spikeMediumExtra: 1000,
  spikeHighFactor: 3,
  spikeHighExtra: 3000,
  minExpensesForReceipts: 5,
  minSpendForReceipts: 2000,
  missingReceiptShare: 0.6,
} as const;

/** The limits in force: the built-in ones, or those the System Administrator has set. */
export type Thresholds = { -readonly [K in keyof typeof WATCH]: number };

const DAY = 86_400_000;
const daysAgo = (now: Date, n: number) => new Date(now.getTime() - n * DAY);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length === 0 ? 0 : sum(xs) / xs.length);
const fmt0 = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const pct1 = (n: number) => `${n.toFixed(1)}%`;
const ghs = (n: number) => `GHS ${fmt0(n)}`;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const confidenceFor = (n: number): Confidence => (n >= 20 ? 'HIGH' : n >= 10 ? 'MEDIUM' : 'LOW');

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** Spread of a sample that one odd value cannot distort (1.4826 x the median absolute deviation). */
export function robustSigma(xs: number[], med: number = median(xs)): number {
  return 1.4826 * median(xs.map((x) => Math.abs(x - med)));
}

class Tracker {
  private rows = new Map<string, { checked: Set<string>; skipped: Set<string>; judged: number }>();
  private row(kind: LocationKind, id: string) {
    const key = `${kind}:${id}`;
    let r = this.rows.get(key);
    if (!r) { r = { checked: new Set(), skipped: new Set(), judged: 0 }; this.rows.set(key, r); }
    return r;
  }
  /**
   * `judges` is false for checks that look for events (a write-down, a stalled order). Finding no events says
   * little about a place, so those checks are listed but do not, on their own, let a place be called CLEAR.
   */
  check(kind: LocationKind, id: string, what: string, judges = true) {
    const r = this.row(kind, id);
    r.checked.add(what);
    if (judges) r.judged += 1;
  }
  skip(kind: LocationKind, id: string, why: string) { this.row(kind, id).skipped.add(why); }
  get(kind: LocationKind, id: string) { const r = this.row(kind, id); return { checked: [...r.checked], skipped: [...r.skipped], judged: r.judged }; }
}

type Push = (s: Omit<Signal, 'id'>) => void;

// ----------------------------------------------------------------------------------------------
// MILLING CENTERS: how much rice the paddy gave, how much power it took, and whether power was used with nothing logged
// ----------------------------------------------------------------------------------------------
function millingSignals(i: WatchInput, start: Date, t: Tracker, push: Push, cfg: Thresholds) {
  const K: LocationKind = 'MILLING_CENTER';
  for (const c of i.centers) {
    const allRuns = i.runs.filter((r) => r.centerId === c.id);
    const usable = allRuns.filter((r) => r.paddyKg > 0);
    const history = usable.filter((r) => r.status === 'APPROVED' && r.date < start);
    const recent = usable.filter((r) => r.date >= start && r.date <= i.now);
    const rec = (r: Run) => (r.riceKg / r.paddyKg) * 100;
    const base = { locationKind: K, locationId: c.id, locationName: c.name, tab: 'milling' as WatchTab };

    // 1. Rice recovery against the center's own usual
    if (history.length < cfg.minBaselineRuns) {
      t.skip(K, c.id, `Rice recovery needs ${cfg.minBaselineRuns} earlier approved runs; there ${history.length === 1 ? 'is' : 'are'} ${history.length}.`);
    } else if (recent.length === 0) {
      t.skip(K, c.id, 'No production runs were logged in this period.');
    } else {
      t.check(K, c.id, 'Rice recovery');
      const hist = history.map(rec);
      const m = median(hist);
      const sigma = Math.max(robustSigma(hist, m), cfg.recoverySigmaFloor);
      const drop = Math.max(cfg.recoveryDropPoints, cfg.recoverySigma * sigma);
      const conf = confidenceFor(history.length);
      const low = recent.filter((r) => m - rec(r) >= drop);
      if (low.length > 0) {
        const gaps = low.map((r) => m - rec(r));
        const missingKg = sum(low.map((r) => ((m - rec(r)) / 100) * r.paddyKg));
        push({
          ...base, code: 'LOW_RECOVERY', confidence: conf,
          severity: low.length >= 3 || Math.max(...gaps) >= drop * 2 ? 'HIGH' : 'MEDIUM',
          title: `${c.name}: some runs gave less rice than usual`,
          detail: `${low.length} of ${plural(recent.length, 'run')} in the last ${i.windowDays} days recovered ${Math.min(...gaps).toFixed(1) === Math.max(...gaps).toFixed(1) ? `${Math.min(...gaps).toFixed(1)} points` : `${Math.min(...gaps).toFixed(1)} to ${Math.max(...gaps).toFixed(1)} points`} less rice than this center usually does. That is roughly ${fmt0(missingKg)} kg of rice not accounted for.`,
          expected: `${pct1(m)} recovery (median of ${history.length} earlier approved runs)`,
          actual: `${pct1(mean(low.map(rec)))} on the ${plural(low.length, 'flagged run')}`,
          evidence: low.map((r) => `${r.number}: ${pct1(rec(r))}`).slice(0, 6),
          whatToCheck: 'Compare the paddy weighed in with the rice and by-products weighed out for these runs, and check them against the stock ledger.',
        });
      }
      const high = recent.filter((r) => rec(r) - m >= drop);
      if (high.length > 0) {
        push({
          ...base, code: 'HIGH_RECOVERY', confidence: conf, severity: 'LOW',
          title: `${c.name}: some runs gave more rice than usual`,
          detail: `${high.length} of ${plural(recent.length, 'run')} recovered more rice than this center normally does. Unusually good results are worth confirming too, as inflated weights hide problems elsewhere.`,
          expected: `${pct1(m)} recovery (median of ${history.length} earlier approved runs)`,
          actual: `${pct1(mean(high.map(rec)))} on the ${plural(high.length, 'flagged run')}`,
          evidence: high.map((r) => `${r.number}: ${pct1(rec(r))}`).slice(0, 6),
          whatToCheck: 'Check the recorded weights for these runs.',
        });
      }
    }

    // 2. Power per kilogram of paddy
    const histPower = history.filter((r) => r.kwh !== null && r.kwh > 0).map((r) => (r.kwh as number) / r.paddyKg);
    const recentPower = recent.filter((r) => r.kwh !== null && r.kwh > 0);
    if (histPower.length < cfg.minBaselineRuns) {
      t.skip(K, c.id, `Power per kg needs ${cfg.minBaselineRuns} earlier approved runs with power logged; there ${histPower.length === 1 ? 'is' : 'are'} ${histPower.length}.`);
    } else if (recentPower.length < cfg.minRunsWithPower) {
      t.skip(K, c.id, `Power per kg needs ${cfg.minRunsWithPower} runs with power logged in this period; there ${recentPower.length === 1 ? 'is' : 'are'} ${recentPower.length}.`);
    } else {
      t.check(K, c.id, 'Power per kg of paddy');
      const usual = median(histPower);
      const now = sum(recentPower.map((r) => r.kwh as number)) / sum(recentPower.map((r) => r.paddyKg));
      const over = now / usual - 1;
      if (over >= cfg.powerMedium) {
        push({
          ...base, code: 'HIGH_POWER_PER_KG', confidence: confidenceFor(histPower.length),
          severity: over >= cfg.powerHigh ? 'HIGH' : 'MEDIUM',
          title: `${c.name}: more power per kg of paddy than usual`,
          detail: `Over ${plural(recentPower.length, 'run')} the center used ${now.toFixed(3)} kWh per kg of paddy, ${Math.round(over * 100)}% more than its usual ${usual.toFixed(3)}.`,
          expected: `${usual.toFixed(3)} kWh per kg (median of ${histPower.length} earlier approved runs)`,
          actual: `${now.toFixed(3)} kWh per kg over ${plural(recentPower.length, 'run')}`,
          evidence: recentPower.map((r) => `${r.number}: ${((r.kwh as number) / r.paddyKg).toFixed(3)} kWh/kg`).slice(0, 6),
          whatToCheck: 'Compare the meter readings with the production log. Look for machines left running, faults, or runs that were not logged.',
        });
      }
    }

    // 3. Power used on days when no production was logged
    const byDay = new Map<string, number>();
    for (const m of i.meterDays.filter((x) => x.centerId === c.id)) byDay.set(dayKey(m.date), (byDay.get(dayKey(m.date)) ?? 0) + m.kwh);
    const runDays = new Set(allRuns.map((r) => dayKey(r.date)));
    const inWindow = [...byDay.entries()].filter(([d]) => d >= dayKey(start) && d <= dayKey(i.now));
    if (inWindow.length < cfg.minMeteredDays) {
      t.skip(K, c.id, `Power against production needs meter readings on ${cfg.minMeteredDays} days; there ${inWindow.length === 1 ? 'is' : 'are'} ${inWindow.length}.`);
    } else {
      t.check(K, c.id, 'Metered power against production');
      const productionDays = [...byDay.entries()].filter(([d]) => runDays.has(d)).map(([, k]) => k);
      const typical = productionDays.length >= 3 ? median(productionDays) : 0;
      const threshold = Math.max(cfg.idlePowerMinKwh, cfg.idlePowerShare * typical);
      const idle = inWindow.filter(([d, k]) => !runDays.has(d) && k >= threshold).sort(([a], [b]) => (a < b ? -1 : 1));
      if (idle.length > 0) {
        push({
          ...base, code: 'POWER_WITHOUT_PRODUCTION', confidence: inWindow.length >= 15 ? 'HIGH' : inWindow.length >= 8 ? 'MEDIUM' : 'LOW',
          severity: idle.length >= 3 || idle.length / inWindow.length >= 0.25 ? 'HIGH' : 'MEDIUM',
          title: `${c.name}: power used on days with no production logged`,
          detail: `On ${idle.length} of ${plural(inWindow.length, 'metered day')} the center used at least ${fmt0(threshold)} kWh with no production run recorded (${fmt0(sum(idle.map(([, k]) => k)))} kWh in all).`,
          expected: 'Very little power on a day when nothing is milled',
          actual: `${fmt0(sum(idle.map(([, k]) => k)))} kWh across ${plural(idle.length, 'day')}`,
          evidence: idle.map(([d, k]) => `${d}: ${fmt0(k)} kWh`).slice(0, 6),
          whatToCheck: 'Find out what was running on these days. Milling that was never recorded is the usual reason.',
        });
      }
    }
  }
}

// ----------------------------------------------------------------------------------------------
// WAREHOUSES: paddy arriving short, and orders held but not leaving
// ----------------------------------------------------------------------------------------------
function warehouseSignals(i: WatchInput, start: Date, t: Tracker, push: Push, cfg: Thresholds) {
  const K: LocationKind = 'WAREHOUSE';
  const farmName = new Map(i.farms.map((f) => [f.id, f.name] as [string, string]));
  for (const w of i.warehouses) {
    const base = { locationKind: K, locationId: w.id, locationName: w.name, tab: 'warehouses' as WatchTab };

    const arrived = i.shipments.filter((s) => s.warehouseId === w.id && s.receivedAt >= start && s.receivedAt <= i.now);
    if (arrived.length < cfg.minShipments) {
      t.skip(K, w.id, `Receiving shortfalls need ${cfg.minShipments} shipments received in this period; there ${arrived.length === 1 ? 'is' : 'are'} ${arrived.length}.`);
    } else {
      t.check(K, w.id, 'Paddy received against dispatched');
      const expected = sum(arrived.map((s) => s.expectedBags));
      const received = sum(arrived.map((s) => s.receivedBags));
      const short = arrived.filter((s) => s.receivedBags < s.expectedBags);
      const shortBags = sum(short.map((s) => s.expectedBags - s.receivedBags));
      const shortPct = expected > 0 ? (shortBags / expected) * 100 : 0;
      const share = short.length / arrived.length;
      let severity: Severity | null = null;
      if ((shortPct >= cfg.shortfallHighPct && shortBags >= cfg.shortfallHighBags) || (share >= 0.5 && shortBags >= cfg.shortfallHighBags)) severity = 'HIGH';
      else if (shortPct >= cfg.shortfallMediumPct && shortBags >= cfg.shortfallMediumBags) severity = 'MEDIUM';
      if (severity) {
        const byFarm = new Map<string, number>();
        for (const s of short) byFarm.set(s.farmId, (byFarm.get(s.farmId) ?? 0) + (s.expectedBags - s.receivedBags));
        const top = [...byFarm.entries()].sort((a, b) => b[1] - a[1])[0];
        const lane = top && byFarm.size > 0 && top[1] / shortBags >= 0.5 ? ` Most of it came from ${farmName.get(top[0]) ?? 'one farm'} (${plural(top[1], 'bag')}).` : '';
        push({
          ...base, code: 'RECEIVING_SHORTFALL', severity, confidence: confidenceFor(arrived.length * 2),
          title: `${w.name}: paddy arriving short`,
          detail: `${short.length} of ${plural(arrived.length, 'shipment')} received in the last ${i.windowDays} days arrived short: ${plural(shortBags, 'bag')} (${pct1(shortPct)} of the ${fmt0(expected)} expected).${lane}`,
          expected: `${fmt0(expected)} bags dispatched`,
          actual: `${fmt0(received)} bags received`,
          evidence: short.map((s) => `${s.number}: expected ${s.expectedBags}, received ${s.receivedBags}`).slice(0, 6),
          whatToCheck: 'Check the weighing at dispatch and at receipt, and the condition and route of the loads.',
        });
      }
    }

    // Orders reserved against this warehouse's stock that have not left
    t.check(K, w.id, 'Orders reserved against stock', false);
    const stuck = i.reserved
      .filter((r) => r.warehouseId === w.id)
      .map((r) => ({ r, days: Math.floor((i.now.getTime() - r.since.getTime()) / DAY) }))
      .filter((x) => x.days >= cfg.reservedDays)
      .sort((a, b) => b.days - a.days);
    if (stuck.length > 0) {
      push({
        ...base, code: 'RESERVED_NOT_DELIVERED', confidence: 'HIGH',
        severity: stuck[0].days >= cfg.reservedHighDays ? 'HIGH' : 'MEDIUM',
        title: `${w.name}: reserved orders not leaving`,
        detail: `${plural(stuck.length, 'order')} ${stuck.length === 1 ? 'has' : 'have'} been reserved for ${cfg.reservedDays} days or more, the oldest for ${stuck[0].days} days. The stock is held against ${stuck.length === 1 ? 'it' : 'them'} the whole time.`,
        expected: `Delivered within about ${cfg.reservedDays} days of release`,
        actual: `Oldest still waiting after ${stuck[0].days} days`,
        evidence: stuck.map((x) => `${x.r.number}: ${plural(x.days, 'day')}`).slice(0, 6),
        whatToCheck: 'Ask the Warehouse Supervisor why these deliveries have not gone out.',
      });
    }
  }
}

// ----------------------------------------------------------------------------------------------
// ANY PLACE: stock written down, set against its sister places
// ----------------------------------------------------------------------------------------------
function writeDownSignals(i: WatchInput, start: Date, t: Tracker, push: Push, cfg: Thresholds) {
  const groups: { kind: LocationKind; places: Place[]; tab: WatchTab; word: string }[] = [
    { kind: 'MILLING_CENTER', places: i.centers, tab: 'milling', word: 'milling centers' },
    { kind: 'WAREHOUSE', places: i.warehouses, tab: 'warehouses', word: 'warehouses' },
    { kind: 'FARM', places: i.farms, tab: 'farms', word: 'farms' },
  ];
  for (const g of groups) {
    const rows = g.places.map((p) => ({
      p,
      items: i.adjustments.filter((a) => a.locationKind === g.kind && a.locationId === p.id && a.bags < 0 && a.at >= start && a.at <= i.now),
    }));
    for (const r of rows) {
      t.check(g.kind, r.p.id, 'Stock corrections', false);
      const bags = sum(r.items.map((a) => -a.bags));
      const others = rows.filter((x) => x !== r).map((x) => sum(x.items.map((a) => -a.bags)));
      const peer = others.length > 0 ? median(others) : 0;
      let severity: Severity | null = null;
      if ((bags >= cfg.writeDownHighBags && bags >= 3 * peer) || (r.items.length >= cfg.writeDownHighCount && bags >= cfg.writeDownMediumBags)) severity = 'HIGH';
      else if (bags >= cfg.writeDownMediumBags && bags >= 2 * peer) severity = 'MEDIUM';
      if (!severity) continue;
      push({
        locationKind: g.kind, locationId: r.p.id, locationName: r.p.name, tab: g.tab, code: 'STOCK_WRITE_DOWNS', severity,
        confidence: others.length > 0 ? 'MEDIUM' : 'LOW',
        title: `${r.p.name}: stock written down`,
        detail: `${plural(r.items.length, 'approved correction')} removed ${plural(bags, 'bag')} in the last ${i.windowDays} days${peer > 0 ? ` (other ${g.word} typically ${fmt0(peer)})` : others.length > 0 ? ` (no other ${g.word.replace(/s$/, '')} wrote anything down)` : ''}.`,
        expected: peer > 0 ? `About ${fmt0(peer)} bags written down` : 'Little or nothing written down',
        actual: `${fmt0(bags)} bags written down`,
        evidence: r.items.map((a) => `${a.number}: ${plural(-a.bags, 'bag')}`).slice(0, 6),
        whatToCheck: 'Read the reasons given on these corrections and compare them with physical counts.',
      });
    }
  }
}

// ----------------------------------------------------------------------------------------------
// FARMS: paddy logged compared with usual (allowing for the season), and how often entries are rejected
// ----------------------------------------------------------------------------------------------
function farmSignals(i: WatchInput, start: Date, t: Tracker, push: Push, cfg: Thresholds) {
  const K: LocationKind = 'FARM';
  const end = new Date(i.now.getTime() + 1);
  const approved = i.intake.filter((x) => x.status === 'APPROVED');
  const bagsBetween = (farmId: string, from: Date, to: Date) => sum(approved.filter((x) => x.farmId === farmId && x.date >= from && x.date < to).map((x) => x.bags));

  const rows = i.farms.map((f) => {
    const current = bagsBetween(f.id, start, end);
    const prior = [1, 2, 3].map((k) => bagsBetween(f.id, daysAgo(i.now, i.windowDays * (k + 1)), daysAgo(i.now, i.windowDays * k)));
    const baseline = mean(prior);
    const eligible = baseline >= cfg.minBaselineBags && prior.filter((b) => b > 0).length >= 2;
    return { f, current, baseline, ratio: eligible ? current / baseline : NaN, eligible };
  });

  for (const r of rows) {
    const base = { locationKind: K, locationId: r.f.id, locationName: r.f.name, tab: 'farms' as WatchTab };
    if (!r.eligible) {
      t.skip(K, r.f.id, `Paddy intake needs about ${cfg.minBaselineBags} bags a period over the three periods before; this farm has not logged that much.`);
    } else {
      t.check(K, r.f.id, 'Paddy intake against usual');
      const peers = rows.filter((x) => x !== r && x.eligible).map((x) => x.ratio);
      const peerMedian = peers.length > 0 ? median(peers) : NaN;
      const seasonal = !Number.isNaN(peerMedian) && peerMedian <= cfg.seasonalPeerRatio;
      const flagged = seasonal ? r.ratio <= cfg.peerRelative * peerMedian && r.ratio <= cfg.intakeDropRatio : r.ratio <= cfg.intakeDropRatio;
      if (flagged) {
        push({
          ...base, code: 'INTAKE_DROP', confidence: 'MEDIUM',
          severity: r.ratio <= cfg.intakeHighRatio && !seasonal ? 'HIGH' : 'MEDIUM',
          title: `${r.f.name}: much less paddy logged than usual`,
          detail: `${plural(r.current, 'bag')} were approved in the last ${i.windowDays} days, against about ${fmt0(r.baseline)} in each of the three periods before (${Math.round(r.ratio * 100)}% of usual).${seasonal ? ' Most farms are down too, so part of this is probably the season, but this farm fell much further than the others.' : ''}`,
          expected: `About ${fmt0(r.baseline)} bags`,
          actual: `${fmt0(r.current)} bags`,
          evidence: [`Last ${i.windowDays} days: ${r.current} bags`, `Average of the three periods before: ${fmt0(r.baseline)} bags`],
          whatToCheck: 'Harvest is seasonal, so check the calendar first. If it is not the season, ask whether paddy is being sold or stored without being logged.',
        });
      }
    }

    const decided = i.intake.filter((x) => x.farmId === r.f.id && x.date >= start && x.date <= i.now);
    if (decided.length < cfg.minDecidedEntries) {
      t.skip(K, r.f.id, `Rejection rate needs ${cfg.minDecidedEntries} decided paddy entries in this period; there ${decided.length === 1 ? 'is' : 'are'} ${decided.length}.`);
    } else {
      t.check(K, r.f.id, 'Paddy entries rejected');
      const rejected = decided.filter((x) => x.status === 'REJECTED').length;
      const rate = rejected / decided.length;
      if (rate >= cfg.rejectMedium) {
        push({
          ...base, code: 'HIGH_REJECTION_RATE', confidence: decided.length >= 20 ? 'HIGH' : 'MEDIUM',
          severity: rate >= cfg.rejectHigh ? 'HIGH' : 'MEDIUM',
          title: `${r.f.name}: many paddy entries rejected`,
          detail: `${rejected} of ${decided.length} paddy entries decided in the last ${i.windowDays} days were rejected (${Math.round(rate * 100)}%).`,
          expected: 'Most entries approved at the first attempt',
          actual: `${rejected} rejected out of ${decided.length}`,
          evidence: [`${rejected} rejected`, `${decided.length - rejected} approved`],
          whatToCheck: 'Read the rejection reasons. Repeated problems usually point to weighing or quality practice at the farm.',
        });
      }
    }
  }
}

// ----------------------------------------------------------------------------------------------
// FARMS AND WAREHOUSES: spending compared with usual, and expenses with no receipt
// ----------------------------------------------------------------------------------------------
function spendingSignals(i: WatchInput, start: Date, t: Tracker, push: Push, cfg: Thresholds) {
  const end = new Date(i.now.getTime() + 1);
  const groups: { kind: LocationKind; places: Place[]; tab: WatchTab; pick: (e: ExpenseRow) => string | null }[] = [
    { kind: 'FARM', places: i.farms, tab: 'farms', pick: (e) => e.farmId },
    { kind: 'WAREHOUSE', places: i.warehouses, tab: 'warehouses', pick: (e) => e.warehouseId },
  ];
  for (const g of groups) {
    for (const p of g.places) {
      const mine = i.expenses.filter((e) => g.pick(e) === p.id);
      const between = (from: Date, to: Date) => mine.filter((e) => e.date >= from && e.date < to);
      const current = between(start, end);
      const priorTotals = [1, 2, 3].map((k) => sum(between(daysAgo(i.now, i.windowDays * (k + 1)), daysAgo(i.now, i.windowDays * k)).map((e) => e.amount)));
      const baseline = mean(priorTotals);
      const base = { locationKind: g.kind, locationId: p.id, locationName: p.name, tab: g.tab };
      const total = sum(current.map((e) => e.amount));

      if (baseline < cfg.minBaselineSpend) {
        t.skip(g.kind, p.id, `Spending against usual needs about ${ghs(cfg.minBaselineSpend)} a period over the three periods before; there is less than that on record.`);
      } else {
        t.check(g.kind, p.id, 'Spending against usual');
        let severity: Severity | null = null;
        if (total >= cfg.spikeHighFactor * baseline && total - baseline >= cfg.spikeHighExtra) severity = 'HIGH';
        else if (total >= cfg.spikeMediumFactor * baseline && total - baseline >= cfg.spikeMediumExtra) severity = 'MEDIUM';
        if (severity) {
          const biggest = [...current].sort((a, b) => b.amount - a.amount).slice(0, 4);
          push({
            ...base, code: 'SPEND_SPIKE', severity, confidence: 'MEDIUM',
            title: `${p.name}: spending well above its usual`,
            detail: `Approved spending was ${ghs(total)} in the last ${i.windowDays} days, against about ${ghs(baseline)} in each of the three periods before (${(total / baseline).toFixed(1)} times as much).`,
            expected: `About ${ghs(baseline)}`,
            actual: ghs(total),
            evidence: biggest.map((e) => `${e.number}: ${ghs(e.amount)}`),
            whatToCheck: 'Open the expenses for this place and check the larger items and their receipts.',
          });
        }
      }

      if (current.length >= cfg.minExpensesForReceipts && total >= cfg.minSpendForReceipts) {
        const without = current.filter((e) => !e.hasReceipt);
        if (without.length / current.length >= cfg.missingReceiptShare) {
          push({
            ...base, code: 'MISSING_RECEIPTS', severity: 'LOW', confidence: 'MEDIUM',
            title: `${p.name}: many expenses without a receipt`,
            detail: `${without.length} of ${plural(current.length, 'approved expense')} in the last ${i.windowDays} days (${ghs(sum(without.map((e) => e.amount)))}) have no receipt attached.`,
            expected: 'A receipt photo on most expenses',
            actual: `${without.length} of ${current.length} without one`,
            evidence: [...without].sort((a, b) => b.amount - a.amount).slice(0, 4).map((e) => `${e.number}: ${ghs(e.amount)}`),
            whatToCheck: 'Ask for the receipts, starting with the largest amounts.',
          });
        }
      }
    }
  }
}

const SEVERITY_RANK: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const KIND_RANK: Record<LocationKind, number> = { MILLING_CENTER: 0, WAREHOUSE: 1, FARM: 2 };

export function buildWatchlist(input: WatchInput, cfg: Thresholds = WATCH): Watchlist {
  const start = daysAgo(input.now, input.windowDays);
  const signals: Signal[] = [];
  const tracker = new Tracker();
  const push: Push = (s) => signals.push({ ...s, id: `${s.locationKind}:${s.locationId}:${s.code}` });

  millingSignals(input, start, tracker, push, cfg);
  warehouseSignals(input, start, tracker, push, cfg);
  writeDownSignals(input, start, tracker, push, cfg);
  farmSignals(input, start, tracker, push, cfg);
  spendingSignals(input, start, tracker, push, cfg);

  signals.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || KIND_RANK[a.locationKind] - KIND_RANK[b.locationKind] || a.locationName.localeCompare(b.locationName) || a.code.localeCompare(b.code));

  const places: { kind: LocationKind; list: Place[] }[] = [
    { kind: 'MILLING_CENTER', list: input.centers },
    { kind: 'WAREHOUSE', list: input.warehouses },
    { kind: 'FARM', list: input.farms },
  ];
  const locations: LocationStatus[] = [];
  for (const g of places) {
    for (const p of g.list) {
      const mine = signals.filter((s) => s.locationKind === g.kind && s.locationId === p.id);
      const { checked, skipped, judged } = tracker.get(g.kind, p.id);
      const status: LocationStatus['status'] = mine.some((s) => s.severity === 'HIGH') ? 'INVESTIGATE' : mine.length > 0 ? 'WATCH' : judged > 0 ? 'CLEAR' : 'NOT_ENOUGH_DATA';
      locations.push({ kind: g.kind, id: p.id, name: p.name, status, checked, skipped });
    }
  }

  const count = (sev: Severity) => signals.filter((s) => s.severity === sev).length;
  return {
    generatedAt: input.now.toISOString(),
    windowDays: input.windowDays,
    summary: { high: count('HIGH'), medium: count('MEDIUM'), low: count('LOW'), total: signals.length, placesToInvestigate: locations.filter((l) => l.status === 'INVESTIGATE').length },
    signals,
    locations,
  };
}
