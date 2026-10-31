'use client';

import { type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RefreshCw } from 'lucide-react';
import type { OverviewDays } from '@/lib/api-client';

export const PALETTE = ['#1F4D2C', '#C9972B', '#3B8266', '#6B4A2F', '#8A8A8A', '#B4402B'];
export const kg = (n: number | null | undefined) => (n === null || n === undefined ? '-' : Math.round(n).toLocaleString('en-US'));
export const tonnes = (n: number) => `${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} t`;
export const ghs = (n: number) => `GHS ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
export const pc = (n: number | null | undefined) => (n === null || n === undefined ? 'no data' : `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`);

/** "2026-10-19" -> "19 Oct". */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const RANGES: { d: OverviewDays; label: string }[] = [{ d: 7, label: '7 days' }, { d: 30, label: '30 days' }, { d: 90, label: '90 days' }];

/** The frame every analytics block sits in: a title, the time range, a refresh button, and honest loading / error / empty states. */
export function AnalyticsFrame({ id, title, note, days, setDays, loading, error, refresh, empty, ready, children }: {
  id: string; title: string; note: string; days: OverviewDays; setDays: (d: OverviewDays) => void; loading: boolean; error: string | null; refresh: () => void; empty?: boolean; ready: boolean; children: ReactNode;
}) {
  return (
    <section data-testid={id} aria-labelledby={`${id}-t`} className="mb-8 rounded-3xl border border-paddy-100 bg-gradient-to-b from-white to-rice-50/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm italic text-soil-500">Analytics</p>
          <h2 id={`${id}-t`} className="font-display text-2xl font-medium text-paddy-900">{title}</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-500">{note}</p>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Time range" className="inline-flex gap-1 rounded-full border border-paddy-100 bg-white p-1">
            {RANGES.map((r) => (
              <button key={r.d} type="button" aria-pressed={days === r.d} data-testid={`${id}-range-${r.d}`} onClick={() => setDays(r.d)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${days === r.d ? 'bg-paddy-900 text-rice-50' : 'text-ink-700 hover:bg-rice-50'}`}>{r.label}</button>
            ))}
          </div>
          <button type="button" onClick={refresh} aria-label="Refresh analytics" data-testid={`${id}-refresh`} className="rounded-full border border-paddy-100 bg-white p-2 text-paddy-900 hover:border-paddy-500">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          </button>
        </div>
      </div>
      {error && <p role="alert" data-testid={`${id}-error`} className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error} <button type="button" onClick={refresh} className="font-medium underline">Try again</button></p>}
      {!error && !ready && <p className="mt-4 text-sm text-ink-500" data-testid={`${id}-loading`}>Loading...</p>}
      {!error && ready && empty && <p data-testid={`${id}-empty`} className="mt-4 rounded-xl border border-dashed border-paddy-100 bg-white px-4 py-6 text-center text-sm text-ink-500">Nothing to show for your places yet.</p>}
      {!error && ready && !empty && <div className={`mt-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>{children}</div>}
    </section>
  );
}

export function Kpi({ label, value, unit, note, tone = 'plain', id }: { label: string; value: string; unit?: string; note?: string; tone?: 'plain' | 'dark' | 'warn' | 'good'; id?: string }) {
  const t = { plain: 'border-paddy-100 bg-white text-paddy-900', dark: 'border-paddy-900 bg-paddy-900 text-rice-50', warn: 'border-amber-300 bg-amber-50 text-amber-900', good: 'border-emerald-200 bg-emerald-50 text-emerald-900' }[tone];
  return (
    <div className={`rounded-2xl border p-4 ${t}`} data-testid="kpi" data-key={id ?? label}>
      <p className={`text-xs font-medium uppercase tracking-wide ${tone === 'dark' ? 'text-paddy-300' : 'text-ink-500'}`}>{label}</p>
      <p className="mt-1.5 font-display text-2xl font-medium" data-testid="kpi-value">{value}{unit && <span className="ml-1 font-sans text-sm opacity-70">{unit}</span>}</p>
      {note && <p className={`mt-1 text-xs ${tone === 'dark' ? 'text-paddy-100' : 'text-ink-500'}`}>{note}</p>}
    </div>
  );
}

export function ChartCard({ title, note, children, id }: { title: string; note?: string; children: ReactNode; id?: string }) {
  return (
    <div className="rounded-2xl border border-paddy-100 bg-white p-4" data-testid={id}>
      <h3 className="font-display text-base font-medium text-paddy-900">{title}</h3>
      {note && <p className="text-xs text-ink-500">{note}</p>}
      <div className="mt-3 h-56">{children}</div>
    </div>
  );
}

export const NoData = ({ text = 'No records in this period.' }: { text?: string }) => <p className="grid h-full place-items-center text-sm text-ink-500">{text}</p>;

/** A stacked-by-place bar chart over time (intake by farm, receipts by warehouse). */
export function StackedTrend({ rows, keys, unit }: { rows: { bucket: string; values: Record<string, number> }[]; keys: string[]; unit: 'day' | 'week' }) {
  if (rows.every((r) => Object.values(r.values).every((v) => !v)) || keys.length === 0) return <NoData />;
  const data = rows.map((r) => ({ label: shortDate(r.bucket), ...Object.fromEntries(keys.map((k) => [k, r.values[k] ?? 0])) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E7E2D4" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" aria-label={unit === 'day' ? 'Day' : 'Week starting'} />
        <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}t` : `${v}`)} />
        <Tooltip formatter={(v: number, n: string) => [`${kg(v)} KG`, n]} />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {keys.map((k, i) => <Bar key={k} dataKey={k} stackId="a" fill={PALETTE[i % PALETTE.length]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** One measure over time as a soft area; quiet periods are gaps, not zeros. */
export function MeasureTrend({ rows, dataKey, unit, color = PALETTE[0], suffix = '', domain }: { rows: { bucket: string; [k: string]: number | string | null }[]; dataKey: string; unit: 'day' | 'week'; color?: string; suffix?: string; domain?: [number | 'auto', number | 'auto'] }) {
  if (rows.every((r) => r[dataKey] === null || r[dataKey] === 0)) return <NoData />;
  const data = rows.map((r) => ({ label: shortDate(r.bucket), v: r[dataKey] }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
        <defs><linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></linearGradient></defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E7E2D4" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" aria-label={unit === 'day' ? 'Day' : 'Week starting'} />
        <YAxis tick={{ fontSize: 11 }} width={48} domain={domain ?? ['auto', 'auto']} tickFormatter={(v: number) => (suffix ? `${v}${suffix}` : v >= 1000 ? `${Math.round(v / 1000)}t` : `${v}`)} />
        <Tooltip formatter={(v: number) => [suffix ? `${v}${suffix}` : `${kg(v)} KG`, '']} />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2.5} fill={`url(#g-${dataKey})`} connectNulls={false} dot={{ r: 2.5 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Places side by side, one bar each, so the best and the weakest are obvious at a glance. */
export function PlaceBars({ rows, label, format = (n: number) => `${kg(n)} KG`, color = PALETTE[0] }: { rows: { name: string; value: number | null }[]; label: string; format?: (n: number) => string; color?: string }) {
  const real = rows.filter((r) => r.value !== null) as { name: string; value: number }[];
  if (real.length === 0) return <NoData />;
  const sorted = [...real].sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map((r) => r.value), 1);
  return (
    <ul className="h-full space-y-2.5 overflow-y-auto pr-1" aria-label={label}>
      {sorted.map((r, i) => (
        <li key={r.name} data-testid="place-bar" data-name={r.name}>
          <div className="flex items-baseline justify-between text-sm"><span className="font-medium text-ink-900">{r.name}</span><span className="text-ink-700">{format(r.value)}</span></div>
          <div className="mt-1 h-2.5 rounded-full bg-paddy-100/60"><div className="h-2.5 rounded-full" style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: i === 0 ? color : `${color}99` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function PlaceTable({ columns, rows, id }: { columns: { key: string; label: string; align?: 'left' | 'right' }[]; rows: Record<string, ReactNode>[]; id: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-paddy-100 bg-white" data-testid={id}>
      <table className="w-full min-w-[34rem] text-sm">
        <thead><tr className="border-b border-paddy-100 bg-rice-50/70 text-xs uppercase tracking-wide text-ink-500">
          {columns.map((c) => <th key={c.key} scope="col" className={`px-4 py-2.5 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-paddy-100/60 last:border-0" data-testid="place-row">
              {columns.map((c) => <td key={c.key} className={`px-4 py-2.5 ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.key === 'name' ? 'font-medium text-paddy-900' : 'text-ink-700'}`}>{r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { LineChart, Line };
