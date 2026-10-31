'use client';

import { overviewApi, type OvWarehouses } from '@/lib/api-client';
import { useOverviewAnalytics } from './useOverviewAnalytics';
import { AnalyticsFrame, ChartCard, Kpi, PlaceBars, PlaceTable, StackedTrend, kg, pc, tonnes } from './analytics-parts';

/** The Warehouse Supervisor's analytics: stock in every warehouse, what is on the way, and how well deliveries are counted in. */
export function WarehouseAnalytics({ accessToken, preload }: { accessToken: string; preload?: OvWarehouses | null }) {
  const a = useOverviewAnalytics<OvWarehouses>((d) => overviewApi.warehouses(accessToken, d));
  const data = a.data ?? preload ?? null;
  const whs = data?.warehouses ?? [];
  const t = data?.totals;
  const accuracy = t && t.receivedKg > 0 ? Math.max(0, 100 - (Math.abs(t.varianceKg) / t.receivedKg) * 100) : null;
  return (
    <AnalyticsFrame id="warehouse-analytics" title="Warehouse performance" note="Paddy and packaged rice in each warehouse, trucks still on the way, and the gap between what was sent and what was counted." days={a.days} setDays={a.setDays} loading={a.loading} error={a.error} refresh={a.refresh} ready={!!data} empty={whs.length === 0}>
      {data && t && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Paddy in warehouses" value={tonnes(t.paddyKg)} note={`${kg(t.paddyKg)} KG`} tone="dark" id="paddy" />
            <Kpi label="Packaged rice" value={tonnes(t.packagedKg)} note={`${kg(t.packagedKg)} KG ready to sell`} id="packaged" />
            <Kpi label="On the way" value={tonnes(t.incomingKg)} note={`${whs.reduce((a2, w) => a2 + w.incomingTrucks, 0)} truck(s) not yet counted in`} id="incoming" />
            <Kpi label="Counting accuracy" value={accuracy === null ? 'no data' : pc(Math.round(accuracy * 10) / 10)} note={t.receivedKg > 0 ? `${kg(Math.abs(t.varianceKg))} KG gap on ${tonnes(t.receivedKg)} received` : 'nothing received in this period'} tone={accuracy !== null && accuracy < 98 ? 'warn' : 'good'} id="accuracy" />
          </div>
          {t.awaitingReview > 0 && <p data-testid="warehouse-analytics-flags" className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900"><strong>{t.awaitingReview}</strong> delivery count{t.awaitingReview === 1 ? '' : 's'} with a gap big enough to need review.</p>}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2"><ChartCard id="warehouse-trend" title={`Paddy counted in, ${data.unit === 'day' ? 'per day' : 'per week'}`} note="By warehouse."><StackedTrend unit={data.unit} keys={whs.map((w) => w.name)} rows={data.trend.map((r) => ({ bucket: r.bucket, values: r.byWarehouse }))} /></ChartCard></div>
            <ChartCard id="warehouse-paddy" title="Paddy on hand" note="Now, by warehouse."><PlaceBars label="Paddy by warehouse" rows={whs.map((w) => ({ name: w.name, value: w.paddyKg }))} /></ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard id="warehouse-packaged" title="Packaged rice on hand" note="Ready to sell, by warehouse."><PlaceBars label="Packaged rice by warehouse" rows={whs.map((w) => ({ name: w.name, value: w.packagedKg }))} color="#C9972B" /></ChartCard>
            <ChartCard id="warehouse-incoming" title="Still on the way" note="Paddy in trucks not yet counted in."><PlaceBars label="Incoming by warehouse" rows={whs.map((w) => ({ name: w.name, value: w.incomingKg }))} color="#3B8266" /></ChartCard>
          </div>
          <PlaceTable id="warehouse-table" columns={[
            { key: 'name', label: 'Warehouse' }, { key: 'paddy', label: 'Paddy (KG)', align: 'right' }, { key: 'packaged', label: 'Packaged (KG)', align: 'right' }, { key: 'incoming', label: 'On the way (KG)', align: 'right' },
            { key: 'received', label: 'Counted in (KG)', align: 'right' }, { key: 'gap', label: 'Gap (KG)', align: 'right' }, { key: 'review', label: 'To review', align: 'right' },
          ]} rows={whs.map((w) => ({ name: w.name, paddy: kg(w.paddyKg), packaged: kg(w.packagedKg), incoming: `${kg(w.incomingKg)}${w.incomingTrucks ? ` (${w.incomingTrucks})` : ''}`, received: kg(w.receivedKg), gap: `${w.varianceKg > 0 ? '+' : ''}${kg(w.varianceKg)}`, review: w.awaitingReview }))} />
        </div>
      )}
    </AnalyticsFrame>
  );
}
