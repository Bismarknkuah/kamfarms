import type { MoneyPeriod } from '@/lib/api-client';

export const PERIODS: { key: MoneyPeriod; label: string; versus: string }[] = [
  { key: 'month', label: 'This month', versus: 'last month' },
  { key: 'last30', label: 'Last 30 days', versus: 'the 30 days before' },
  { key: 'quarter', label: 'This quarter', versus: 'last quarter' },
  { key: 'year', label: 'This year', versus: 'last year' },
  { key: 'all', label: 'All time', versus: '' },
];

export const cedis = (n: number) => `GHS ${Math.round(n).toLocaleString()}`;
export const cedis2 = (n: number) => `GHS ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Whole cedis; millions are shortened so a big number never overflows its tile. */
export const cedisShort = (n: number) => (Math.abs(n) >= 1_000_000 ? `GHS ${(n / 1_000_000).toFixed(2)}M` : cedis(n));

/** How this period compares with the one before it. `null` when there is nothing to compare with (or the earlier figure was zero). */
export function change(current: number, previous: number | null): { pct: number | null; dir: 'up' | 'down' | 'flat' | 'none' } {
  if (previous === null) return { pct: null, dir: 'none' };
  if (previous === 0) return { pct: null, dir: current === 0 ? 'flat' : current > 0 ? 'up' : 'down' };
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return { pct, dir: Math.abs(pct) < 0.5 ? 'flat' : pct > 0 ? 'up' : 'down' };
}

export const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
export const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
export const greeting = (d = new Date()) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 17 ? 'Good afternoon' : 'Good evening');
export const statusLabel = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
