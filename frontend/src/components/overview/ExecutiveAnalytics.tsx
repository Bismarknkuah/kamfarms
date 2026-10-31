'use client';

import Link from 'next/link';
import { Sprout, Warehouse, Factory } from 'lucide-react';
import { overviewApi } from '@/lib/api-client';
import { useOverviewAnalytics } from './useOverviewAnalytics';
import { AnalyticsFrame, ChartCard, Kpi, MeasureTrend, PlaceBars, StackedTrend, kg, pc, tonnes } from './analytics-parts';
import type { OvFarms, OvOperations, OvWarehouses } from '@/lib/api-client';

type Exec = { farm: OvFarms; warehouse: OvWarehouses; operations: OvOperations };

/** Top management's analytics: the whole chain in one view, paddy in at the farms, through the warehouses, to rice out of the mills. */
export function ExecutiveAnalyticsView({ accessToken }: { accessToken: string }) {
  const a = useOverviewAnalytics<Exec>((d) => overviewApi.executive(accessToken, d));
  const d = a.data;
  const empty = !!d && d.farm.farms.length === 0 && d.warehouse.warehouses.length === 0 && d.operations.mills.length === 0;
  return (
    <AnalyticsFrame id="exec-analytics" title="The business at a glance" note="Paddy in at the farms, stock and trucks at the warehouses, and rice out of the mills, for the same period side by side." days={a.days} setDays={a.setDays} loading={a.loading} error={a.error} refresh={a.refresh} ready={!!d} empty={empty}>
      {d && (
        <div className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-3">
            <Stage href="/farms" icon={Sprout} title="Farms" lines={[['Paddy in', tonnes(d.farm.totals.intakeKg)], ['On farms now', tonnes(d.farm.totals.stockKg)], ['Waiting approval', `${d.farm.totals.pendingEntries}`]]} />
            <Stage href="/warehouses" icon={Warehouse} title="Warehouses" lines={[['Paddy on hand', tonnes(d.warehouse.totals.paddyKg)], ['Packaged rice', tonnes(d.warehouse.totals.packagedKg)], ['On the way', tonnes(d.warehouse.totals.incomingKg)]]} />
            <Stage href="/production" icon={Factory} title="Mills" lines={[['Paddy milled', tonnes(d.operations.totals.processedKg)], ['Recovery', pc(d.operations.totals.recoveryPct)], ['Power / tonne', d.operations.totals.kwhPerTonne === null ? 'no data' : `${d.operations.totals.kwhPerTonne} kWh`]]} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard id="exec-intake" title={`Paddy in, ${d.farm.unit === 'day' ? 'per day' : 'per week'}`} note="By farm."><StackedTrend unit={d.farm.unit} keys={d.farm.farms.map((f) => f.name)} rows={d.farm.trend.map((r) => ({ bucket: r.bucket, values: r.byFarm }))} /></ChartCard>
            <ChartCard id="exec-milled" title={`Paddy milled, ${d.operations.unit === 'day' ? 'per day' : 'per week'}`}><MeasureTrend unit={d.operations.unit} rows={d.operations.trend} dataKey="processedKg" /></ChartCard>
            <ChartCard id="exec-recovery" title="Recovery rate" note="Rice from every 100 KG of paddy."><MeasureTrend unit={d.operations.unit} rows={d.operations.trend} dataKey="recoveryPct" color="#C9972B" suffix="%" domain={[0, 100]} /></ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard id="exec-farms" title="Farms compared" note="Paddy in."><PlaceBars label="Paddy by farm" rows={d.farm.farms.map((f) => ({ name: f.name, value: f.intakeKg }))} /></ChartCard>
            <ChartCard id="exec-warehouses" title="Warehouses compared" note="Packaged rice on hand."><PlaceBars label="Packaged rice by warehouse" rows={d.warehouse.warehouses.map((w) => ({ name: w.name, value: w.packagedKg }))} color="#C9972B" /></ChartCard>
            <ChartCard id="exec-mills" title="Mills compared" note="Recovery rate."><PlaceBars label="Recovery by mill" rows={d.operations.mills.map((m) => ({ name: m.name, value: m.recoveryPct }))} format={(n) => `${n}%`} color="#3B8266" /></ChartCard>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Delivery cost" value={`GHS ${Math.round(d.farm.totals.deliveryCost).toLocaleString('en-US')}`} note="farm to warehouse" id="exec-cost" />
            <Kpi label="Counted in" value={tonnes(d.warehouse.totals.receivedKg)} note={`${kg(Math.abs(d.warehouse.totals.varianceKg))} KG gap`} id="exec-counted" />
            <Kpi label="Rice recovered" value={tonnes(d.operations.totals.recoveredKg)} note={`${tonnes(d.operations.totals.brokenKg)} broken, ${tonnes(d.operations.totals.hullKg)} hull`} id="exec-rice" />
            <Kpi label="Needs a look" value={`${d.operations.totals.flagged + d.operations.totals.awaitingApproval + d.warehouse.totals.awaitingReview}`} note="flagged runs, approvals, count gaps" tone="warn" id="exec-flags" />
          </div>
        </div>
      )}
    </AnalyticsFrame>
  );
}

function Stage({ href, icon: Icon, title, lines }: { href: string; icon: typeof Sprout; title: string; lines: [string, string][] }) {
  return (
    <Link href={href} data-testid="exec-stage" className="group rounded-2xl border border-paddy-100 bg-white p-4 transition hover:border-paddy-500 hover:shadow-sm">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-paddy-900 text-husk-300"><Icon className="h-5 w-5" aria-hidden /></span><h3 className="font-display text-lg font-medium text-paddy-900">{title}</h3></div>
      <dl className="mt-3 space-y-1.5">{lines.map(([k, v]) => <div key={k} className="flex justify-between text-sm"><dt className="text-ink-500">{k}</dt><dd className="font-medium text-ink-900">{v}</dd></div>)}</dl>
    </Link>
  );
}
