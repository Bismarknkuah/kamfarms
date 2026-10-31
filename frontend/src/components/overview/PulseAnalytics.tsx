'use client';

import { overviewApi, type OvPulse } from '@/lib/api-client';
import { useOverviewAnalytics } from './useOverviewAnalytics';
import { AnalyticsFrame, ChartCard, Kpi, PlaceBars, ghs, kg, pc } from './analytics-parts';

/** The whole company in one glance for the MD / CEO: stock along the chain, money, and what is waiting on someone. */
export function PulseAnalytics({ accessToken }: { accessToken: string }) {
  const a = useOverviewAnalytics<OvPulse>((d) => overviewApi.pulse(accessToken, d));
  const d = a.data;
  const w = d?.waiting;
  const waiting = w ? w.paddyEntries + w.productionRuns + w.salesOrders + w.payments : 0;
  return (
    <AnalyticsFrame id="pulse" title="The company today" note="Stock along the chain, the money, and what is waiting for a decision." days={a.days} setDays={a.setDays} loading={a.loading} error={a.error} refresh={a.refresh} ready={!!d}>
      {d && w && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Sales" value={ghs(d.money.sales)} note={`${d.money.orders} orders`} tone="dark" id="pulse-sales" />
            <Kpi label="Collected" value={ghs(d.money.collected)} id="pulse-collected" />
            <Kpi label="Estimated profit" value={ghs(d.money.estimatedProfit)} note={`${ghs(d.money.spent)} spent`} tone={d.money.estimatedProfit < 0 ? 'warn' : 'good'} id="pulse-profit" />
            <Kpi label="Owed to us" value={ghs(d.money.owed)} note={`${ghs(d.money.late)} late`} tone={d.money.late > 0 ? 'warn' : 'plain'} id="pulse-owed" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard id="pulse-stock" title="Where the stock is" note="KG, right now.">
                <PlaceBars label="Stock" rows={[{ name: 'Farm paddy', value: d.stock.farmPaddyKg }, { name: 'On the road', value: d.stock.onRoadKg }, { name: 'Warehouse paddy', value: d.stock.warehousePaddyKg }, { name: 'Packaged rice', value: d.stock.packagedKg }]} />
              </ChartCard>
            </div>
            <div className="space-y-3">
              <Kpi label="Rice recovered" value={kg(d.production.recoveredKg)} unit="KG" note={`${pc(d.production.recoveryPct)} of ${kg(d.production.processedKg)} KG milled`} id="pulse-rice" />
              <Kpi label="Waiting for a decision" value={`${waiting}`} note={`${w.paddyEntries} paddy, ${w.productionRuns} milling, ${w.salesOrders} orders, ${w.payments} payments`} tone={waiting ? 'warn' : 'good'} id="pulse-waiting" />
              <Kpi label="Needs attention" value={`${w.flaggedRuns + w.countGaps + w.machineFaults}`} note={`${w.flaggedRuns} off balance, ${w.countGaps} count gaps, ${w.machineFaults} machine faults`} tone={w.flaggedRuns + w.countGaps + w.machineFaults ? 'warn' : 'good'} id="pulse-attention" />
            </div>
          </div>
        </div>
      )}
    </AnalyticsFrame>
  );
}
