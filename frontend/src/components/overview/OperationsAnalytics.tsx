'use client';

import { overviewApi, type OvOperations } from '@/lib/api-client';
import { useOverviewAnalytics } from './useOverviewAnalytics';
import { AnalyticsFrame, ChartCard, Kpi, MeasureTrend, PlaceBars, PlaceTable, kg, pc, tonnes } from './analytics-parts';

const MACHINE_TONE: Record<string, string> = { RUNNING: 'bg-paddy-700 text-rice-50', IDLE: 'bg-ink-500/10 text-ink-700', MAINTENANCE: 'bg-husk-300 text-soil-700', FAULT: 'bg-red-100 text-red-700', OFFLINE: 'bg-ink-500/10 text-ink-500' };

/** The Operations Manager's analytics: how much was milled, how much rice it gave, how much power it took, and whether the machines are keeping up. */
export function OperationsAnalytics({ accessToken, preload }: { accessToken: string; preload?: OvOperations | null }) {
  const a = useOverviewAnalytics<OvOperations>((d) => overviewApi.operations(accessToken, d));
  const data = a.data ?? preload ?? null;
  const mills = data?.mills ?? [];
  const t = data?.totals;
  return (
    <AnalyticsFrame id="ops-analytics" title="Milling performance" note="Approved milling runs: paddy processed, rice recovered, power used per tonne, and the state of the machines." days={a.days} setDays={a.setDays} loading={a.loading} error={a.error} refresh={a.refresh} ready={!!data} empty={mills.length === 0}>
      {data && t && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Paddy milled" value={tonnes(t.processedKg)} note={`${t.runs} run${t.runs === 1 ? '' : 's'} in ${data.days} days`} tone="dark" id="milled" />
            <Kpi label="Rice recovered" value={pc(t.recoveryPct)} note={`${kg(t.recoveredKg)} KG of ${kg(t.processedKg)} KG`} id="recovery" />
            <Kpi label="Power per tonne" value={t.kwhPerTonne === null ? 'no data' : `${t.kwhPerTonne}`} unit={t.kwhPerTonne === null ? undefined : 'kWh'} note="runs that recorded energy" id="energy" />
            <Kpi label="Needs your look" value={`${t.flagged + t.awaitingApproval}`} note={`${t.awaitingApproval} to approve, ${t.flagged} flagged on mass balance`} tone={t.flagged + t.awaitingApproval > 0 ? 'warn' : 'good'} id="attention" />
          </div>
          <div className="flex flex-wrap gap-2" data-testid="ops-machines" aria-label="Machines by state">
            {Object.entries(data.machines).filter(([, n]) => n > 0).map(([s, n]) => <span key={s} className={`rounded-full px-3 py-1 text-xs font-medium ${MACHINE_TONE[s] ?? MACHINE_TONE.IDLE}`}>{n} {s.toLowerCase()}</span>)}
            {Object.values(data.machines).every((n) => n === 0) && <span className="text-xs text-ink-500">No machines set up yet.</span>}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard id="ops-processed" title={`Paddy milled, ${data.unit === 'day' ? 'per day' : 'per week'}`}><MeasureTrend unit={data.unit} rows={data.trend} dataKey="processedKg" /></ChartCard>
            <ChartCard id="ops-recovery" title="Recovery rate" note="Rice recovered from every 100 KG of paddy."><MeasureTrend unit={data.unit} rows={data.trend} dataKey="recoveryPct" color="#C9972B" suffix="%" domain={[0, 100]} /></ChartCard>
            <ChartCard id="ops-energy" title="Power per tonne (kWh)" note="Lower is better."><MeasureTrend unit={data.unit} rows={data.trend} dataKey="kwhPerTonne" color="#6B4A2F" suffix="" /></ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard id="ops-mill-recovery" title="Mills compared: recovery" note="Higher is better."><PlaceBars label="Recovery by mill" rows={mills.map((m) => ({ name: m.name, value: m.recoveryPct }))} format={(n) => `${n}%`} color="#C9972B" /></ChartCard>
            <ChartCard id="ops-mill-energy" title="Mills compared: power per tonne" note="Lower is better."><PlaceBars label="kWh per tonne by mill" rows={mills.map((m) => ({ name: m.name, value: m.kwhPerTonne }))} format={(n) => `${n} kWh`} color="#6B4A2F" /></ChartCard>
          </div>
          <PlaceTable id="ops-table" columns={[
            { key: 'name', label: 'Mill' }, { key: 'milled', label: 'Milled (KG)', align: 'right' }, { key: 'rice', label: 'Rice (KG)', align: 'right' }, { key: 'recovery', label: 'Recovery', align: 'right' },
            { key: 'broken', label: 'Broken', align: 'right' }, { key: 'hull', label: 'Hull (KG)', align: 'right' }, { key: 'kwh', label: 'kWh / tonne', align: 'right' }, { key: 'hours', label: 'Run hours', align: 'right' }, { key: 'flagged', label: 'Flagged', align: 'right' },
          ]} rows={mills.map((m) => ({ name: m.name, milled: kg(m.processedKg), rice: kg(m.recoveredKg), recovery: m.recoveryPct === null ? '-' : `${m.recoveryPct}%`, broken: m.brokenPct === null ? '-' : `${m.brokenPct}%`, hull: kg(m.hullKg), kwh: m.kwhPerTonne ?? '-', hours: m.runtimeHours, flagged: m.flagged }))} />
        </div>
      )}
    </AnalyticsFrame>
  );
}
