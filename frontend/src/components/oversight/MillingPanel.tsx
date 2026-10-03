'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Factory, Gauge, Wheat, Zap } from 'lucide-react';
import {
  Machine,
  PaddyGrade,
  ProductionOverview,
  Warehouse,
  WarehouseOverview,
  machinesApi,
  productionApi,
  reportsApi,
} from '@/lib/api-client';
import { IconStatCard } from '@/components/StatCard';
import {
  DailyKwh,
  PredictionTotals,
  countMachineStatus,
  countRecentAnomalies,
  dailyKwh,
  formatKg,
  formatKwh,
  sumPredictions,
  variancePercent,
} from '@/lib/oversight-utils';

const STANDARD_BAG_KG = 50;

type Forecast = PredictionTotals & { bags: number; kg: number };

interface CenterView {
  id: string;
  name: string;
  warehouseId: string;
  warehouseName: string;
  centersAtSite: number;
  machineTotal: number;
  machineCounts: Record<string, number>;
  production: ProductionOverview | null;
  daily: DailyKwh[];
  anomalies: number;
  hasReadings: boolean;
  monthExpectedKwh: number | null;
  monthExpectedPartial: boolean;
}

interface SiteView {
  atMilling: Forecast | null;
  arriving: Forecast | null;
}

const MACHINE_CHIPS: { status: string; label: string; style: string }[] = [
  { status: 'RUNNING', label: 'running', style: 'bg-paddy-100 text-paddy-900' },
  { status: 'IDLE', label: 'idle', style: 'bg-ink-500/10 text-ink-700' },
  { status: 'MAINTENANCE', label: 'in maintenance', style: 'bg-amber-100 text-amber-800' },
  { status: 'FAULT', label: 'in fault', style: 'bg-red-100 text-red-700' },
  { status: 'OFFLINE', label: 'offline', style: 'bg-ink-500/10 text-ink-500' },
];

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <div className="rounded-xl bg-rice-50 px-3 py-2.5">
      <p className="text-[11px] text-ink-500">{label}</p>
      <p className={`font-display text-lg leading-tight ${tone === 'warn' ? 'text-amber-800' : 'text-paddy-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-ink-500">{sub}</p>}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: PredictionTotals['confidence'] }) {
  if (confidence === 'None') return null;
  const tone = confidence === 'High' ? 'bg-green-50 text-green-800 border-green-200' : confidence === 'Medium' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-red-50 text-red-800 border-red-200';
  return <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}>{confidence} confidence</span>;
}

function ExpectationBox({ title, data, emptyText }: { title: string; data: Forecast | null; emptyText: string }) {
  const body = () => {
    if (!data) return <p className="mt-2 text-sm text-ink-500">Not available right now.</p>;
    if (data.bags === 0 && data.kg === 0) return <p className="mt-2 text-sm text-ink-500">{emptyText}</p>;
    return (
      <>
        <p className="mt-1 text-sm text-ink-900">
          <span className="font-semibold">{data.bags.toLocaleString()} bags</span> ({formatKg(data.kg)})
        </p>
        {data.confidence === 'None' ? (
          <p className="mt-3 text-xs text-ink-500">
            No approved past runs yet for {data.withoutHistory.join(', ') || 'these grades'}, so no estimate is shown rather than a guess.
          </p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Tile label="Rice expected" value={formatKg(data.recoveredKg)} />
              <Tile label="Broken rice" value={formatKg(data.brokenKg)} />
              <Tile label="Rice hull" value={formatKg(data.hullKg)} />
              <Tile
                label="Power estimate"
                value={data.energyKwh !== null ? formatKwh(data.energyKwh) : 'No meter history'}
                sub={data.energyPartial ? 'not every grade has meter history' : undefined}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ConfidenceBadge confidence={data.confidence} />
              <span className="text-[11px] text-ink-500">
                From past approved runs: {data.basedOn.map((b) => `${b.gradeLabel} (${b.runs})`).join(', ')}
              </span>
            </div>
            {data.withoutHistory.length > 0 && (
              <p className="mt-2 text-[11px] text-amber-800">No past runs for {data.withoutHistory.join(', ')}, so those are left out of this estimate.</p>
            )}
          </>
        )}
      </>
    );
  };
  return (
    <div className="rounded-xl border border-paddy-100 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-soil-500">{title}</p>
      {body()}
    </div>
  );
}

export function MillingPanel({
  accessToken,
  active,
  ready,
  warehouses,
  machines,
  grades,
  warehouseOverviews,
}: {
  accessToken: string;
  active: boolean;
  /** True once the shared lists this panel depends on have finished loading. */
  ready: boolean;
  warehouses: Warehouse[];
  machines: Machine[];
  grades: PaddyGrade[];
  warehouseOverviews: Record<string, WarehouseOverview>;
}) {
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [centers, setCenters] = useState<CenterView[]>([]);
  const [sites, setSites] = useState<Record<string, SiteView>>({});
  const [failures, setFailures] = useState(0);

  useEffect(() => {
    if (!active || !ready || started) return;
    setStarted(true);
    setLoading(true);
    let failed = 0;
    const safe = async <T,>(p: Promise<T>): Promise<T | null> => {
      try {
        return await p;
      } catch {
        failed += 1;
        return null;
      }
    };
    const gradeIdByLabel = new Map(grades.map((g) => [g.label, g.id]));

    // One prediction per grade, summed. The prediction endpoint works from a
    // bag count; where the weight on hand is known the outputs are scaled to it.
    const forecastFor = async (parts: { gradeLabel: string; bags: number; kg: number }[]): Promise<Forecast> => {
      const wanted = parts.filter((p) => p.bags > 0 || p.kg > 0);
      const results = await Promise.all(
        wanted.map(async (p) => {
          const bags = p.bags > 0 ? p.bags : Math.max(1, Math.round(p.kg / STANDARD_BAG_KG));
          const gradeId = gradeIdByLabel.get(p.gradeLabel);
          const prediction = gradeId ? await safe(productionApi.predict(accessToken, gradeId, bags)) : null;
          return { gradeLabel: p.gradeLabel, bags, kg: p.kg, prediction };
        }),
      );
      const usable = results.flatMap((r) => (r.prediction ? [{ gradeLabel: r.gradeLabel, bags: r.bags, kg: r.kg, prediction: r.prediction }] : []));
      const totals = sumPredictions(usable);
      const unresolved = results.filter((r) => !r.prediction).map((r) => r.gradeLabel);
      return {
        ...totals,
        withoutHistory: [...totals.withoutHistory, ...unresolved],
        bags: wanted.reduce((s, p) => s + (p.bags > 0 ? p.bags : Math.round(p.kg / STANDARD_BAG_KG)), 0),
        kg: wanted.reduce((s, p) => s + p.kg, 0),
      };
    };

    const run = async () => {
      const siteWarehouses = warehouses.filter((w) => w.millingCenters.some((c) => c.isActive));

      const siteEntries = await Promise.all(
        siteWarehouses.map(async (w): Promise<[string, SiteView]> => {
          const ov = warehouseOverviews[w.id];
          if (!ov) return [w.id, { atMilling: null, arriving: null }];
          const [atMilling, arriving] = await Promise.all([forecastFor(ov.atMilling), forecastFor(ov.paddy.inTransit)]);
          return [w.id, { atMilling, arriving }];
        }),
      );

      const centerRows = await Promise.all(
        siteWarehouses.flatMap((w) =>
          w.millingCenters
            .filter((c) => c.isActive)
            .map(async (c): Promise<CenterView> => {
              const centerMachines = machines.filter((m) => m.millingCenter.id === c.id);
              const [production, details] = await Promise.all([
                safe(reportsApi.getProductionOverview(accessToken, c.id)),
                Promise.all(centerMachines.map((m) => safe(machinesApi.findById(accessToken, m.id)))),
              ]);
              const readings = details.flatMap((d) => d?.meterReadings ?? []);

              let monthExpectedKwh: number | null = null;
              let monthExpectedPartial = false;
              if (production && production.processed.length > 0) {
                const f = await forecastFor(production.processed);
                monthExpectedKwh = f.energyKwh;
                monthExpectedPartial = f.energyPartial || f.withoutHistory.length > 0;
              }

              return {
                id: c.id,
                name: c.name,
                warehouseId: w.id,
                warehouseName: w.name,
                centersAtSite: w.millingCenters.filter((x) => x.isActive).length,
                machineTotal: centerMachines.length,
                machineCounts: countMachineStatus(centerMachines),
                production,
                daily: dailyKwh(readings, 14),
                anomalies: countRecentAnomalies(readings, 30),
                hasReadings: readings.length > 0,
                monthExpectedKwh,
                monthExpectedPartial,
              };
            }),
        ),
      );

      setSites(Object.fromEntries(siteEntries));
      setCenters(centerRows);
      setFailures(failed);
      setLoading(false);
    };
    void run();
    // Runs once, the first time the tab is opened with its inputs ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ready, started]);

  const totalPower = centers.reduce((s, c) => s + (c.production?.energyConsumedKwh ?? 0), 0);
  const totalMilled = centers.reduce((s, c) => s + (c.production?.processed.reduce((a, g) => a + g.kg, 0) ?? 0), 0);
  const totalRecovered = centers.reduce((s, c) => s + (c.production?.recoveredRiceKg ?? 0), 0);
  const siteList = Object.values(sites);
  const expectedRice = siteList.reduce((s, v) => s + (v.atMilling?.recoveredKg ?? 0), 0);
  const expectedPower = siteList.reduce((s, v) => s + (v.atMilling?.energyKwh ?? 0), 0);

  if (!started || loading) {
    return <p className="rounded-2xl border border-paddy-100 bg-white p-6 text-sm text-ink-500">Gathering power and production figures for each milling center…</p>;
  }
  if (centers.length === 0) {
    return <p className="rounded-2xl border border-paddy-100 bg-white p-6 text-sm text-ink-500">No active milling centers found.</p>;
  }

  return (
    <div className="space-y-4">
      {failures > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {failures} figure{failures === 1 ? '' : 's'} could not be loaded just now, so some numbers below may be missing. Refresh to try again.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <IconStatCard icon={Zap} tone="orange" label="Power used this month" value={formatKwh(totalPower)} trend="logged on production runs, all centers" />
        <IconStatCard icon={Wheat} tone="green" label="Paddy milled this month" value={formatKg(totalMilled)} />
        <IconStatCard icon={Factory} tone="blue" label="Rice recovered this month" value={formatKg(totalRecovered)} trend={totalMilled > 0 ? `${((totalRecovered / totalMilled) * 100).toFixed(1)}% recovery` : undefined} />
        <IconStatCard icon={Gauge} tone="purple" label="Expected from paddy at the mills" value={formatKg(expectedRice)} trend={expectedPower > 0 ? `about ${formatKwh(expectedPower)} to mill it` : 'power estimate needs meter history'} />
      </div>

      {centers.map((c) => {
        const milledKg = c.production?.processed.reduce((a, g) => a + g.kg, 0) ?? 0;
        const power = c.production?.energyConsumedKwh ?? 0;
        const perTonne = milledKg > 0 && power > 0 ? power / (milledKg / 1000) : null;
        const variance = variancePercent(power, c.monthExpectedKwh);
        const meterTotal = c.daily.reduce((s, d) => s + d.kwh, 0);
        const site = sites[c.warehouseId];

        return (
          <div key={c.id} className="rounded-2xl border border-paddy-100 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl text-paddy-900">{c.name}</h2>
                <p className="text-xs text-ink-500">at {c.warehouseName}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {c.machineTotal === 0 && <span className="rounded-full bg-ink-500/10 px-2.5 py-1 text-xs text-ink-500">No machines registered</span>}
                {MACHINE_CHIPS.filter((m) => c.machineCounts[m.status]).map((m) => (
                  <span key={m.status} className={`rounded-full px-2.5 py-1 text-xs font-medium ${m.style}`}>{c.machineCounts[m.status]} {m.label}</span>
                ))}
              </div>
            </div>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-soil-500">This month so far</h3>
            <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Paddy milled" value={formatKg(milledKg)} />
              <Tile label="Rice recovered" value={formatKg(c.production?.recoveredRiceKg ?? 0)} sub={c.production && milledKg > 0 ? `${c.production.recoveryPercent.toFixed(1)}% recovery` : undefined} />
              <Tile label="Power used on runs" value={power > 0 ? formatKwh(power) : 'None logged'} />
              <Tile label="Power per tonne milled" value={perTonne !== null ? `${Math.round(perTonne).toLocaleString()} kWh` : 'Not enough data'} />
            </div>

            <div className="mt-3 rounded-xl bg-rice-50 px-4 py-3 text-sm text-ink-700">
              {c.monthExpectedKwh !== null && power > 0 && variance !== null ? (
                <>
                  At this center&rsquo;s past efficiency, the paddy milled this month should have used about{' '}
                  <span className="font-semibold text-ink-900">{formatKwh(c.monthExpectedKwh)}</span>. Actual so far:{' '}
                  <span className="font-semibold text-ink-900">{formatKwh(power)}</span>{' '}
                  <span className={Math.abs(variance) > 15 ? 'font-semibold text-amber-800' : 'text-ink-500'}>
                    ({variance > 0 ? '+' : ''}{variance.toFixed(0)}%{Math.abs(variance) > 15 ? ', worth a closer look' : ', in line'})
                  </span>
                  .{c.monthExpectedPartial && ' Some grades have no meter history yet, so the expected figure may be low.'}
                </>
              ) : (
                <>Not enough past meter history to say what this month&rsquo;s volume should have used. This fills in as more runs with power readings are approved.</>
              )}
            </div>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-soil-500">What to expect next</h3>
            <div className="mt-2 grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
              <ExpectationBox title="Paddy at the mill now" data={site?.atMilling ?? null} emptyText="Nothing is waiting at the mill right now." />
              <ExpectationBox title="Paddy on its way here" data={site?.arriving ?? null} emptyText="No paddy is in transit to this site." />
            </div>
            {c.centersAtSite > 1 && (
              <p className="mt-2 text-[11px] text-ink-500">Stock figures cover all {c.centersAtSite} milling centers at {c.warehouseName}; the ledger tracks this site as a whole.</p>
            )}

            <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-soil-500">Machine meters, last 14 days</h3>
              <p className="text-xs text-ink-500">
                {c.hasReadings ? `${formatKwh(meterTotal)} metered` : 'No meter readings recorded'}
                {c.anomalies > 0 && <span className="ml-2 font-medium text-amber-800">{c.anomalies} unusual reading{c.anomalies === 1 ? '' : 's'} in 30 days</span>}
              </p>
            </div>
            {c.hasReadings && meterTotal > 0 ? (
              <div className="mt-2" style={{ width: '100%', height: 150 }}>
                <ResponsiveContainer>
                  <BarChart data={c.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EDE6D6" />
                    <XAxis dataKey="label" stroke="#8A7B62" fontSize={10} interval={1} />
                    <YAxis stroke="#8A7B62" fontSize={10} />
                    <Tooltip formatter={(v: number) => formatKwh(v)} labelFormatter={(l) => `Day ${l}`} contentStyle={{ borderRadius: 8, border: '1px solid #EDE6D6' }} />
                    <Bar isAnimationActive={false} dataKey="kwh" fill="#1F4D2C" radius={[3, 3, 0, 0]} name="Metered" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-500">No machine meter readings in the last 14 days.</p>
            )}
          </div>
        );
      })}

      <p className="text-[11px] text-ink-500">
        &ldquo;Power used on runs&rdquo; is what operators log against each production run and is what the estimates are built from, so the two are directly comparable.
        &ldquo;Machine meters&rdquo; is the separate physical reading taken at each machine. Estimates use the average of past approved runs and are never shown without that history.
      </p>
    </div>
  );
}
