'use client';

import { overviewApi, type OvFarms } from '@/lib/api-client';
import { useOverviewAnalytics } from './useOverviewAnalytics';
import { AnalyticsFrame, ChartCard, Kpi, PlaceBars, PlaceTable, StackedTrend, ghs, kg, tonnes } from './analytics-parts';

/** The Farm Director's analytics: how much came in, where it sits, what it costs to move, and which farm is slipping. */
export function FarmAnalytics({ accessToken, preload }: { accessToken: string; preload?: OvFarms | null }) {
  const a = useOverviewAnalytics<OvFarms>((d) => overviewApi.farms(accessToken, d));
  const data = a.data ?? preload ?? null;
  const farms = data?.farms ?? [];
  const names = farms.map((f) => f.name);
  const t = data?.totals;
  return (
    <AnalyticsFrame id="farm-analytics" title="Farm performance" note="Approved paddy intake, stock on hand, and the cost of getting it to the warehouses, farm by farm." days={a.days} setDays={a.setDays} loading={a.loading} error={a.error} refresh={a.refresh} ready={!!data} empty={farms.length === 0}>
      {data && t && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Paddy in" value={tonnes(t.intakeKg)} note={`approved, last ${data.days} days`} tone="dark" id="intake" />
            <Kpi label="Stock on farms" value={tonnes(t.stockKg)} note={`${kg(t.stockKg)} KG`} id="stock" />
            <Kpi label="Sent to warehouses" value={tonnes(t.dispatchedKg)} note={`${tonnes(t.inTransitKg)} still on the road`} id="dispatched" />
            <Kpi label="Delivery cost" value={ghs(t.deliveryCost)} note={t.dispatchedKg > 0 ? `${ghs(t.deliveryCost / (t.dispatchedKg / 1000))} per tonne` : 'nothing sent yet'} id="cost" />
          </div>
          {(t.pendingEntries > 0 || t.rejectedEntries > 0) && (
            <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900" data-testid="farm-analytics-flags">
              {t.pendingEntries > 0 && <span><strong>{t.pendingEntries}</strong> intake{t.pendingEntries === 1 ? '' : 's'} waiting for your approval. </span>}
              {t.rejectedEntries > 0 && <span><strong>{t.rejectedEntries}</strong> sent back for correction in this period.</span>}
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2"><ChartCard id="farm-trend" title={`Paddy intake by farm, ${data.unit === 'day' ? 'per day' : 'per week'}`} note="Approved entries only."><StackedTrend unit={data.unit} keys={names} rows={data.trend.map((r) => ({ bucket: r.bucket, values: r.byFarm }))} /></ChartCard></div>
            <ChartCard id="farm-compare" title="Farms compared" note={`Paddy in, last ${data.days} days`}><PlaceBars label="Paddy intake by farm" rows={farms.map((f) => ({ name: f.name, value: f.intakeKg }))} /></ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard id="farm-stock" title="Stock on hand" note="Paddy sitting at each farm now."><PlaceBars label="Stock by farm" rows={farms.map((f) => ({ name: f.name, value: f.stockKg }))} color="#C9972B" /></ChartCard>
            <ChartCard id="farm-cost" title="Cost to move a tonne" note="Delivery cost per tonne sent. Lower is better." ><PlaceBars label="Delivery cost per tonne" rows={farms.map((f) => ({ name: f.name, value: f.costPerTonne }))} format={(n) => ghs(n)} color="#6B4A2F" /></ChartCard>
          </div>
          <PlaceTable id="farm-table" columns={[
            { key: 'name', label: 'Farm' }, { key: 'intake', label: 'Paddy in (KG)', align: 'right' }, { key: 'stock', label: 'Stock (KG)', align: 'right' }, { key: 'sent', label: 'Sent (KG)', align: 'right' },
            { key: 'road', label: 'On the road (KG)', align: 'right' }, { key: 'moisture', label: 'Moisture', align: 'right' }, { key: 'pending', label: 'To approve', align: 'right' }, { key: 'rejected', label: 'Sent back', align: 'right' },
          ]} rows={farms.map((f) => ({ name: f.name, intake: kg(f.intakeKg), stock: kg(f.stockKg), sent: kg(f.dispatchedKg), road: kg(f.inTransitKg), moisture: f.avgMoisture === null ? '-' : `${f.avgMoisture}%`, pending: f.pendingEntries, rejected: f.rejectedEntries }))} />
        </div>
      )}
    </AnalyticsFrame>
  );
}
