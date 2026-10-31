'use client';

import { overviewApi, type OvPlaces, type OvWarehousePlace } from '@/lib/api-client';
import { useOverviewAnalytics } from './useOverviewAnalytics';
import { AnalyticsFrame, ChartCard, Kpi, MeasureTrend, PlaceTable, kg, pc } from './analytics-parts';
import { Box, PlaceHeading, RecentList, SizeTable } from './PlaceParts';

/** The Warehouse Manager's Overview: their own warehouse only. */
export function WarehousePlace({ accessToken }: { accessToken: string }) {
  const a = useOverviewAnalytics<OvPlaces<OvWarehousePlace>>((d) => overviewApi.myWarehouse(accessToken, d));
  const places = a.data?.places ?? [];
  return (
    <AnalyticsFrame id="warehouse-place" title={places.length === 1 ? 'My warehouse' : 'My warehouses'} note="Paddy and packaged rice on your shelves, and the trucks still on their way to you." days={a.days} setDays={a.setDays} loading={a.loading} error={a.error} refresh={a.refresh} ready={!!a.data} empty={!!a.data && places.length === 0}>
      <div className="space-y-8">
        {places.map((p) => (
          <div key={p.id} data-testid="place" data-place={p.name}>
            <PlaceHeading id="warehouse" kind="Warehouse" name={p.name} />
            <Box>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="Paddy in store" value={kg(p.totals.paddyKg)} unit="KG" tone="dark" id="paddy" />
                <Kpi label="Packaged rice" value={kg(p.totals.packagedKg)} unit="KG" id="rice" />
                <Kpi label="On the way" value={kg(p.totals.incomingKg)} unit="KG" note={`${p.totals.incomingTrucks} truck${p.totals.incomingTrucks === 1 ? '' : 's'}`} id="incoming" />
                <Kpi label="Count difference" value={pc(p.totals.variancePct)} note={`${kg(p.totals.receivedKg)} KG received${p.totals.awaitingReview ? `, ${p.totals.awaitingReview} to review` : ''}`} tone={p.totals.awaitingReview ? 'warn' : 'plain'} id="variance" />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2"><ChartCard id="warehouse-trend" title={`Paddy received, ${a.data?.unit === 'day' ? 'per day' : 'per week'}`} note="KG counted in."><MeasureTrend rows={p.trend} dataKey="kg" unit={a.data?.unit ?? 'week'} suffix=" KG" /></ChartCard></div>
                <div className="space-y-4"><SizeTable id="warehouse-paddy" title="Paddy by size" rows={p.paddyBySize} /><SizeTable id="warehouse-rice" title="Rice by pack size" rows={p.riceBySize} /></div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-sm font-medium text-paddy-900">Trucks on the way</p>
                  <PlaceTable id="warehouse-road" columns={[{ key: 'ref', label: 'Shipment' }, { key: 'from', label: 'From' }, { key: 'kg', label: 'KG', align: 'right' }, { key: 'departed', label: 'Left' }]} rows={p.onTheWay.map((s) => ({ ref: s.ref, from: s.from, kg: kg(s.kg), departed: s.departed }))} />
                </div>
                <RecentList id="warehouse-recent" title="Latest shipments" rows={p.recent} />
              </div>
            </Box>
          </div>
        ))}
      </div>
    </AnalyticsFrame>
  );
}
