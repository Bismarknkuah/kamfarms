'use client';

import { overviewApi, type OvMillPlace, type OvPlaces } from '@/lib/api-client';
import { useOverviewAnalytics } from './useOverviewAnalytics';
import { AnalyticsFrame, ChartCard, Kpi, MeasureTrend, kg, pc } from './analytics-parts';
import { Box, Chip, PlaceHeading, RecentList } from './PlaceParts';

/** The Operations Officer's Overview: their own milling center only. */
export function MillPlace({ accessToken }: { accessToken: string }) {
  const a = useOverviewAnalytics<OvPlaces<OvMillPlace>>((d) => overviewApi.myMill(accessToken, d));
  const places = a.data?.places ?? [];
  return (
    <AnalyticsFrame id="mill-place" title={places.length === 1 ? 'My milling center' : 'My milling centers'} note="What your mill processed, how much rice it gave, and how the machines are." days={a.days} setDays={a.setDays} loading={a.loading} error={a.error} refresh={a.refresh} ready={!!a.data} empty={!!a.data && places.length === 0}>
      <div className="space-y-8">
        {places.map((p) => (
          <div key={p.id} data-testid="place" data-place={p.name}>
            <PlaceHeading id="mill" kind="Milling center" name={p.name} />
            <Box>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <Kpi label="Paddy milled" value={kg(p.totals.processedKg)} unit="KG" note={`${p.totals.runs} run${p.totals.runs === 1 ? '' : 's'}`} tone="dark" id="milled" />
                <Kpi label="Rice recovered" value={kg(p.totals.recoveredKg)} unit="KG" note={`${pc(p.totals.recoveryPct)} recovery`} id="recovered" />
                <Kpi label="Broken and hull" value={`${kg(p.totals.brokenKg)} / ${kg(p.totals.hullKg)}`} unit="KG" id="by-products" />
                <Kpi label="Energy" value={p.totals.kwhPerTonne === null ? 'no data' : `${p.totals.kwhPerTonne}`} unit={p.totals.kwhPerTonne === null ? undefined : 'kWh/t'} note={`${p.totals.runtimeHours} machine hours`} id="energy" />
                <Kpi label="Waiting for approval" value={`${p.totals.awaitingApproval}`} id="waiting" />
                <Kpi label="Records to check" value={`${p.totals.flagged}`} note="mass balance off" tone={p.totals.flagged ? 'warn' : 'good'} id="flagged" />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2"><ChartCard id="mill-trend" title={`Paddy milled, ${a.data?.unit === 'day' ? 'per day' : 'per week'}`} note="KG processed."><MeasureTrend rows={p.trend} dataKey="processedKg" unit={a.data?.unit ?? 'week'} suffix=" KG" /></ChartCard></div>
                <div className="rounded-2xl border border-paddy-100 bg-white p-4" data-testid="mill-machines">
                  <p className="text-sm font-medium text-paddy-900">Machines</p>
                  {p.machines.length === 0 ? <p className="mt-3 text-sm text-ink-500">No machines registered.</p> : (
                    <ul className="mt-2 divide-y divide-paddy-100">{p.machines.map((m) => <li key={m.name} className="flex items-center justify-between py-2 text-sm"><span>{m.name}</span><Chip text={m.status} /></li>)}</ul>
                  )}
                </div>
              </div>
              <RecentList id="mill-recent" title="Latest milling records" rows={p.recent} />
            </Box>
          </div>
        ))}
      </div>
    </AnalyticsFrame>
  );
}
