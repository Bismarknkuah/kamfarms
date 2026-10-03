import type { Expense, FarmEquipment, Machine, MeterReading, WarehouseEquipment, YieldPrediction } from './api-client';

// Everything in this file is a pure function of its inputs: no network,
// no React, no clock reads except through an explicit `now` argument.
// That is deliberate - these produce the figures an executive reads and
// acts on, so they are tested against fixture data rather than trusted
// by eye. All date handling is in UTC, matching how the backend stores
// dates (midnight UTC), so a figure never shifts by a day depending on
// the viewer's timezone.

export type SpendPeriod = 'THIS_MONTH' | 'LAST_30' | 'THIS_YEAR' | 'ALL';

export const SPEND_PERIOD_LABELS: Record<SpendPeriod, string> = {
  THIS_MONTH: 'This month',
  LAST_30: 'Last 30 days',
  THIS_YEAR: 'This year',
  ALL: 'All time',
};

export function inPeriod(dateIso: string, period: SpendPeriod, now: Date = new Date()): boolean {
  if (period === 'ALL') return true;
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return false;
  if (period === 'THIS_MONTH') {
    return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
  }
  if (period === 'THIS_YEAR') return d.getUTCFullYear() === now.getUTCFullYear();
  // LAST_30: today and the 29 days before it, never a future-dated entry.
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999);
  const t = d.getTime();
  return t >= start && t <= end;
}

export function formatGhs(n: number, decimals = 0): string {
  return `GHS ${n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
export const formatKg = (n: number) => `${Math.round(n).toLocaleString()} kg`;
export const formatKwh = (n: number) => `${Math.round(n).toLocaleString()} kWh`;

// ── Expenses ──────────────────────────────────────────────────────

export interface LocationSpend {
  key: string;
  type: 'FARM' | 'WAREHOUSE' | 'UNASSIGNED';
  name: string;
  approved: number;
  pending: number;
  count: number;
}

/** One row per farm and warehouse - including ones with no expenses at
 * all, so an executive can see "nothing spent here" rather than the row
 * silently missing. An expense tied to neither (rare) gets its own row
 * so the rows always add up to the overall total. Rejected and
 * cancelled expenses are counted as expenses but never as spend. */
export function spendByLocation(expenses: Expense[], farmNames: string[], warehouseNames: string[]): LocationSpend[] {
  const rows = new Map<string, LocationSpend>();
  const ensure = (type: LocationSpend['type'], name: string): LocationSpend => {
    const key = `${type}:${name}`;
    let row = rows.get(key);
    if (!row) {
      row = { key, type, name, approved: 0, pending: 0, count: 0 };
      rows.set(key, row);
    }
    return row;
  };
  farmNames.forEach((n) => ensure('FARM', n));
  warehouseNames.forEach((n) => ensure('WAREHOUSE', n));

  for (const e of expenses) {
    const row = e.farm
      ? ensure('FARM', e.farm.name)
      : e.warehouse
        ? ensure('WAREHOUSE', e.warehouse.name)
        : ensure('UNASSIGNED', 'Not tied to a farm or warehouse');
    row.count += 1;
    if (e.status === 'APPROVED') row.approved += e.amount;
    else if (e.status === 'PENDING') row.pending += e.amount;
  }

  return Array.from(rows.values())
    .filter((r) => r.type !== 'UNASSIGNED' || r.count > 0)
    .sort((a, b) => b.approved - a.approved || b.pending - a.pending || a.name.localeCompare(b.name));
}

/** Approved spend by category, largest first. A custom "Other" label is
 * kept as its own line (so "Other: Fertilizer sacks" is visible), but
 * only the top `top` lines are listed and the remainder is rolled into
 * one line, so a long tail of one-off labels can't bury the real picture. */
export function spendByCategory(expenses: Expense[], top = 8): { name: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const e of expenses) {
    if (e.status !== 'APPROVED') continue;
    const custom = e.customCategoryLabel?.trim();
    const label = e.category.name === 'Other' && custom ? `Other: ${custom}` : e.category.name;
    totals.set(label, (totals.get(label) ?? 0) + e.amount);
  }
  const sorted = Array.from(totals.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
  if (sorted.length <= top) return sorted;
  const rest = sorted.slice(top).reduce((s, r) => s + r.amount, 0);
  return [...sorted.slice(0, top), { name: 'All other categories', amount: rest }];
}

export interface MonthSpend {
  month: string;
  label: string;
  farms: number;
  warehouses: number;
  other: number;
}

/** Approved spend per month for the last `months` months (oldest first,
 * current month last), split farms / warehouses / other. Months with no
 * spend are present as zeros so the chart axis is never missing a month. */
export function monthlySpend(expenses: Expense[], months = 6, now: Date = new Date()): MonthSpend[] {
  const out: MonthSpend[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({
      month: d.toISOString().slice(0, 7),
      label: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      farms: 0,
      warehouses: 0,
      other: 0,
    });
  }
  const byMonth = new Map(out.map((m) => [m.month, m]));
  for (const e of expenses) {
    if (e.status !== 'APPROVED') continue;
    const bucket = byMonth.get(String(e.date).slice(0, 7));
    if (!bucket) continue;
    if (e.farm) bucket.farms += e.amount;
    else if (e.warehouse) bucket.warehouses += e.amount;
    else bucket.other += e.amount;
  }
  return out;
}

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function expensesToCsv(expenses: Expense[]): string {
  const header = ['Expense number', 'Date', 'Location type', 'Location', 'Category', 'Item', 'Amount (GHS)', 'Status', 'Submitted by'];
  const lines = expenses.map((e) => {
    const type = e.farm ? 'Farm' : e.warehouse ? 'Warehouse' : 'Unassigned';
    const where = e.farm?.name ?? e.warehouse?.name ?? '';
    const category = e.category.name === 'Other' && e.customCategoryLabel ? `Other: ${e.customCategoryLabel}` : e.category.name;
    return [
      e.expenseNumber,
      String(e.date).slice(0, 10),
      type,
      where,
      category,
      e.itemDescription ?? '',
      e.amount.toFixed(2),
      e.status,
      `${e.submittedBy.firstName} ${e.submittedBy.lastName}`,
    ].map(csvCell).join(',');
  });
  return [header.map(csvCell).join(','), ...lines].join('\r\n');
}

// ── Milling power ─────────────────────────────────────────────────

export interface DailyKwh {
  date: string;
  label: string;
  kwh: number;
}

/** Metered kWh per day for the last `days` days, summed across the
 * readings passed in (all of a center's machines). Days with no reading
 * are zero, not missing. Uses the date portion of each reading as stored,
 * so a reading never lands on the wrong day. */
export function dailyKwh(readings: Pick<MeterReading, 'date' | 'consumption'>[], days = 14, now: Date = new Date()): DailyKwh[] {
  const out: DailyKwh[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push({ date: d.toISOString().slice(0, 10), label: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`, kwh: 0 });
  }
  const byDate = new Map(out.map((d) => [d.date, d]));
  for (const r of readings) {
    const bucket = byDate.get(String(r.date).slice(0, 10));
    if (bucket) bucket.kwh += r.consumption;
  }
  return out;
}

export function countRecentAnomalies(readings: Pick<MeterReading, 'date' | 'isAnomalous'>[], days = 30, now: Date = new Date()): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1));
  return readings.filter((r) => r.isAnomalous && new Date(r.date).getTime() >= start).length;
}

export interface PredictionPart {
  gradeLabel: string;
  bags: number;
  /** The weight actually on hand, when known. The prediction endpoint
   * works from bag count at a standard bag weight; the outputs are
   * scaled to this so they match the stock figure shown beside them. */
  kg: number;
  prediction: YieldPrediction;
}

export interface PredictionTotals {
  inputKg: number;
  recoveredKg: number;
  brokenKg: number;
  hullKg: number;
  wasteKg: number;
  /** null when no grade had any meter history to estimate power from. */
  energyKwh: number | null;
  /** true when power could be estimated for some grades but not all. */
  energyPartial: boolean;
  minSample: number;
  confidence: 'High' | 'Medium' | 'Low' | 'None';
  basedOn: { gradeLabel: string; runs: number }[];
  withoutHistory: string[];
}

/** Combines per-grade predictions into one total. A grade with no
 * approved history contributes nothing (and is reported in
 * `withoutHistory`) - it is never guessed at. Confidence is set by the
 * thinnest grade, since a total is only as solid as its weakest part. */
export function sumPredictions(parts: PredictionPart[]): PredictionTotals {
  let inputKg = 0;
  let recoveredKg = 0;
  let brokenKg = 0;
  let hullKg = 0;
  let wasteKg = 0;
  let energy = 0;
  let energyAny = false;
  let energyMissing = false;
  let minSample = Number.POSITIVE_INFINITY;
  const basedOn: PredictionTotals['basedOn'] = [];
  const withoutHistory: string[] = [];

  for (const p of parts) {
    const pr = p.prediction;
    if (!pr.hasHistory || !pr.inputKg) {
      withoutHistory.push(p.gradeLabel);
      continue;
    }
    const scale = p.kg > 0 ? p.kg / pr.inputKg : 1;
    inputKg += pr.inputKg * scale;
    recoveredKg += (pr.expectedRecoveredKg ?? 0) * scale;
    brokenKg += (pr.expectedBrokenKg ?? 0) * scale;
    hullKg += (pr.expectedHullKg ?? 0) * scale;
    wasteKg += (pr.expectedWasteKg ?? 0) * scale;
    if (pr.expectedEnergyKwh === null || pr.expectedEnergyKwh === undefined) {
      energyMissing = true;
    } else {
      energy += pr.expectedEnergyKwh * scale;
      energyAny = true;
    }
    minSample = Math.min(minSample, pr.sampleSize);
    basedOn.push({ gradeLabel: p.gradeLabel, runs: pr.sampleSize });
  }

  const hasAny = basedOn.length > 0;
  const sample = hasAny ? minSample : 0;
  return {
    inputKg,
    recoveredKg,
    brokenKg,
    hullKg,
    wasteKg,
    energyKwh: energyAny ? energy : null,
    energyPartial: energyAny && energyMissing,
    minSample: sample,
    confidence: !hasAny ? 'None' : sample >= 10 ? 'High' : sample >= 4 ? 'Medium' : 'Low',
    basedOn,
    withoutHistory,
  };
}

/** Percentage difference of actual versus expected; null when there is
 * nothing meaningful to compare against. */
export function variancePercent(actual: number, expected: number | null): number | null {
  if (expected === null || expected <= 0) return null;
  return ((actual - expected) / expected) * 100;
}

export function countMachineStatus(machines: Pick<Machine, 'status'>[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of machines) counts[m.status] = (counts[m.status] ?? 0) + 1;
  return counts;
}

export function countEquipmentIssues(items: Pick<FarmEquipment | WarehouseEquipment, 'status'>[]): { working: number; issues: number } {
  let working = 0;
  let issues = 0;
  for (const i of items) {
    if (i.status === 'WORKING') working += 1;
    else issues += 1;
  }
  return { working, issues };
}

// ── Needs attention ───────────────────────────────────────────────

export interface AttentionItem {
  id: string;
  level: 'high' | 'medium';
  text: string;
  href: string;
}

export function buildAttention(input: {
  pendingExpenseCount: number;
  pendingExpenseAmount: number;
  machines: Pick<Machine, 'status'>[];
  farmEquipment: Pick<FarmEquipment, 'status'>[];
  warehouseEquipment: Pick<WarehouseEquipment, 'status'>[];
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const m = countMachineStatus(input.machines);
  if (m.FAULT) {
    items.push({ id: 'fault', level: 'high', text: `${m.FAULT} machine${m.FAULT === 1 ? ' is' : 's are'} in fault`, href: '/production' });
  }
  const down = (m.MAINTENANCE ?? 0) + (m.OFFLINE ?? 0);
  if (down) {
    items.push({ id: 'down', level: 'medium', text: `${down} machine${down === 1 ? ' is' : 's are'} in maintenance or offline`, href: '/production' });
  }
  const farm = countEquipmentIssues(input.farmEquipment).issues;
  const wh = countEquipmentIssues(input.warehouseEquipment).issues;
  if (farm) {
    items.push({ id: 'farm-eq', level: 'medium', text: `${farm} farm equipment item${farm === 1 ? '' : 's'} not working or needing replacement`, href: '/farms' });
  }
  if (wh) {
    items.push({ id: 'wh-eq', level: 'medium', text: `${wh} warehouse equipment item${wh === 1 ? '' : 's'} not working or needing replacement`, href: '/warehouses' });
  }
  if (input.pendingExpenseCount > 0) {
    items.push({
      id: 'pending-exp',
      level: 'medium',
      text: `${input.pendingExpenseCount} expense${input.pendingExpenseCount === 1 ? '' : 's'} (${formatGhs(input.pendingExpenseAmount)}) waiting for approval`,
      href: '/expenses',
    });
  }
  return items.sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1));
}
