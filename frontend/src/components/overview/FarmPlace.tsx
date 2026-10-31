'use client';

import { overviewApi, type OvFarmPlace, type OvPlaces } from '@/lib/api-client';
import { useOverviewAnalytics } from './useOverviewAnalytics';
import { AnalyticsFrame, ChartCard, Kpi, MeasureTrend, ghs, kg, pc } from './analytics-parts';
import { Box, PlaceHeading, RecentList, SizeTable } from './PlaceParts';

/** The Farm Manager's Overview: their own farm only. The server returns only the farms they are assigned to. */
export function FarmPlace({ accessToken }: { accessToken: string }) {
  const a = useOverviewAnalytics<OvPlaces<OvFarmPlace>>((d) => overviewApi.myFarm(accessToken, d));
  const places = a.data?.places ?? [];
  return (
    <AnalyticsFrame id="farm-place" title={places.length === 1 ? 'My farm' : 'My farms'} note="Paddy in, paddy in stock and what has gone out, for the farm you manage." days={a.days} setDays={a.setDays} loading={a.loading} error={a.error} refresh={a.refresh} ready={!!a.data} empty={!!a.data && places.length === 0}>
      <div className="space-y-8">
        {places.map((p) => (
          <div key={p.id} data-testid="place" data-place={p.name}>
            <PlaceHeading id="farm" kind="Farm" name={p.name} />
            <Box>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <Kpi label="Paddy in stock" value={kg(p.totals.stockKg)} unit="KG" note={`${p.totals.stockBags.toLocaleString('en-US')} bags`} tone="dark" id="stock" />
                <Kpi label="Received this period" value={kg(p.totals.intakeKg)} unit="KG" note={`${p.totals.intakeBags.toLocaleString('en-US')} bags approved`} id="intake" />
                <Kpi label="On the road" value={kg(p.totals.onRoadKg)} unit="KG" note={`${kg(p.totals.sentKg)} KG sent in all`} id="road" />
                <Kpi label="Waiting for approval" value={`${p.totals.pending}`} note={p.totals.rejected ? `${p.totals.rejected} sent back` : 'none sent back'} tone={p.totals.rejected ? 'warn' : 'plain'} id="pending" />
                <Kpi label="Delivery cost" value={ghs(p.totals.deliveryCost)} id="cost" />
                <Kpi label="Average moisture" value={pc(p.totals.avgMoisture)} id="moisture" />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2"><ChartCard id="farm-trend" title={`Paddy received, ${a.data?.unit === 'day' ? 'per day' : 'per week'}`} note="KG approved."><MeasureTrend rows={p.trend} dataKey="kg" unit={a.data?.unit ?? 'week'} suffix=" KG" /></ChartCard></div>
                <SizeTable id="farm-sizes" title="Stock by size" rows={p.stockBySize} />
              </div>
              <RecentList id="farm-recent" title="Latest paddy entries" rows={p.recent} />
            </Box>
          </div>
        ))}
      </div>
    </AnalyticsFrame>
  );
}
