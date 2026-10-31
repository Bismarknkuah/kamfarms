'use client';

import { overviewApi, type OvSales } from '@/lib/api-client';
import { useOverviewAnalytics } from './useOverviewAnalytics';
import { AnalyticsFrame, ChartCard, Kpi, MultiTrend, PlaceBars, PlaceTable, ghs, kg } from './analytics-parts';

const label = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** Sales: orders and value over time, what is moving through the chain, and which customers buy most. A Sales Officer sees their own; Finance and management see the company's. */
export function SalesAnalytics({ accessToken }: { accessToken: string }) {
  const a = useOverviewAnalytics<OvSales>((d) => overviewApi.sales(accessToken, d));
  const d = a.data;
  const t = d?.totals;
  return (
    <AnalyticsFrame id="sales-analytics" title={d?.company ? 'Sales performance' : 'My sales'} note={d?.company ? 'Orders placed by every salesperson, their value, and where they stand.' : 'Your orders: what you sold, what is still moving, and who buys the most.'} days={a.days} setDays={a.setDays} loading={a.loading} error={a.error} refresh={a.refresh} ready={!!d} empty={!!t && t.orders === 0}>
      {d && t && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Sales value" value={ghs(t.value)} note={`${t.orders} order${t.orders === 1 ? '' : 's'}, last ${d.days} days`} tone="dark" id="sales-value" />
            <Kpi label="Delivered" value={`${t.fulfilled}`} note={`${kg(t.kg)} KG ordered in total`} id="sales-fulfilled" />
            <Kpi label="In progress" value={`${t.inProgress + t.waitingForApproval}`} note={`${t.waitingForApproval} waiting for approval`} id="sales-progress" />
            <Kpi label="Owed by customers" value={ghs(t.owed)} note={t.owedLate > 0 ? `${ghs(t.owedLate)} is late` : 'nothing late'} tone={t.owedLate > 0 ? 'warn' : 'plain'} id="sales-owed" />
            <Kpi label="Average order" value={ghs(t.averageOrder)} note={t.lost > 0 ? `${t.lost} rejected or cancelled` : 'none lost'} tone={t.lost > 0 ? 'warn' : 'plain'} id="sales-average" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2"><ChartCard id="sales-trend" title={`Sales value, ${d.unit === 'day' ? 'per day' : 'per week'}`} note="GHS, orders placed."><MultiTrend unit={d.unit} money rows={d.trend} series={[{ key: 'value', label: 'Sales value', color: '#1F4D2C' }]} /></ChartCard></div>
            <ChartCard id="sales-status" title="Where the orders are" note="Number of orders by stage."><PlaceBars label="Orders by stage" rows={d.status.map((s) => ({ name: label(s.name), value: s.count }))} format={(n) => `${n}`} color="#3B8266" /></ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard id="sales-customers" title="Best customers" note="By order value."><PlaceBars label="Customers by value" rows={d.topCustomers.map((c) => ({ name: c.name, value: c.value }))} format={ghs} color="#C9972B" /></ChartCard>
            {d.company && <ChartCard id="sales-people" title="Salespeople compared" note="By order value."><PlaceBars label="Sales by salesperson" rows={d.bySalesperson.map((c) => ({ name: c.name, value: c.value }))} format={ghs} color="#6B4A2F" /></ChartCard>}
          </div>
          <PlaceTable id="sales-table" columns={[{ key: 'name', label: 'Customer' }, { key: 'orders', label: 'Orders', align: 'right' }, { key: 'value', label: 'Value', align: 'right' }]} rows={d.topCustomers.map((c) => ({ name: c.name, orders: c.orders, value: ghs(c.value) }))} />
        </div>
      )}
    </AnalyticsFrame>
  );
}
