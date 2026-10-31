/** Small pure helpers for the overview analytics: time buckets and safe ratios. Kept apart from the database code so they can be tested alone. */

export const DAY_MS = 86_400_000;

/** How many days a view looks back: 7, 30 or 90 (anything else falls back to 30). */
export function clampDays(raw?: string | number): number {
  const n = Number(raw);
  return n === 7 || n === 30 || n === 90 ? n : 30;
}

/** Monday 00:00 UTC of the week the date falls in. */
export function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  return new Date(x.getTime() - dow * DAY_MS);
}

export function dayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The bucket keys for a window ending at `now`, oldest first. A 7-day window is shown day by day; longer windows week by week, so a chart always has a
 * sensible number of points and a quiet period shows as zero instead of a gap.
 */
export function bucketKeys(days: number, now: Date): { keys: string[]; unit: 'day' | 'week' } {
  const unit: 'day' | 'week' = days <= 7 ? 'day' : 'week';
  const start = new Date(now.getTime() - (days - 1) * DAY_MS);
  const keys: string[] = [];
  if (unit === 'day') {
    for (let t = dayStart(start).getTime(); t <= dayStart(now).getTime(); t += DAY_MS) keys.push(isoDay(new Date(t)));
  } else {
    for (let t = weekStart(start).getTime(); t <= weekStart(now).getTime(); t += 7 * DAY_MS) keys.push(isoDay(new Date(t)));
  }
  return { keys, unit };
}

export function bucketOf(d: Date, unit: 'day' | 'week'): string {
  return isoDay(unit === 'day' ? dayStart(d) : weekStart(d));
}

/** a / b as a percentage, or null when there is nothing to divide by (so a chart shows "no data", not 0%). */
export function pct(a: number, b: number, digits = 1): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
  const f = 10 ** digits;
  return Math.round((a / b) * 100 * f) / f;
}

/** kWh used per tonne of paddy processed, or null when either figure is missing. */
export function kwhPerTonne(kwh: number, processedKg: number): number | null {
  if (!(kwh > 0) || !(processedKg > 0)) return null;
  return Math.round((kwh / (processedKg / 1000)) * 10) / 10;
}

export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
export const round0 = (v: number) => Math.round(v);
