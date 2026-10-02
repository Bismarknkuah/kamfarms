'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { LucideIcon } from 'lucide-react';

const TONES = {
  green: 'bg-paddy-100 text-paddy-900',
  blue: 'bg-sky-100 text-sky-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-husk-100 text-husk-700',
  teal: 'bg-teal-100 text-teal-700',
} as const;

/** A single metric with a colored circular icon badge and an optional
 * real trend line underneath - never a fabricated percentage. Pass
 * `trend` only when there is an actual prior-period number to compare
 * against; omit it rather than inventing one. */
export function IconStatCard({
  icon: Icon, tone, label, value, trend,
}: {
  icon: LucideIcon;
  tone: keyof typeof TONES;
  label: string;
  value: string;
  trend?: string;
}) {
  return (
    <div className="rounded-2xl border border-paddy-100 bg-white p-5">
      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${TONES[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 font-display text-2xl text-paddy-900">{value}</p>
      <p className="text-xs text-ink-500">{label}</p>
      {trend && <p className="mt-1 text-xs font-medium text-paddy-700">{trend}</p>}
    </div>
  );
}

const DONUT_COLORS = ['#1F4D2C', '#C9972B', '#6B4A2F', '#3B8266', '#8A8A8A'];

/** A labeled donut with a real center total and a real legend - not
 * decoration. Slices with zero value are filtered out before
 * rendering, since recharts draws a visible sliver for a true zero
 * that reads as real data at a glance. */
export function DonutChart({ data, centerLabel }: { data: { name: string; value: number }[]; centerLabel?: string }) {
  const real = data.filter((d) => d.value > 0);
  const total = real.reduce((s, d) => s + d.value, 0);
  if (real.length === 0) {
    return <p className="flex h-48 items-center justify-center text-sm text-ink-500">No data yet.</p>;
  }
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-36 w-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={real} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={2}>
              {real.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number) => v.toLocaleString()} />
          </PieChart>
        </ResponsiveContainer>
        {centerLabel && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-ink-500">Total</span>
            <span className="text-sm font-semibold text-paddy-900">{centerLabel}</span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {real.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 truncate text-ink-700">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="shrink-0 font-medium text-ink-900">{d.value.toLocaleString()} kg</span>
            <span className="w-9 shrink-0 text-right text-ink-500">{total > 0 ? Math.round((d.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
