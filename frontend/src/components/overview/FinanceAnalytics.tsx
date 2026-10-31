'use client';

import { overviewApi, type OvFinance } from '@/lib/api-client';
import { useOverviewAnalytics } from './useOverviewAnalytics';
import { AnalyticsFrame, ChartCard, Kpi, MultiTrend, PlaceBars, PlaceTable, ghs } from './analytics-parts';

const AGING: Record<string, string> = { current: 'Not yet due', d1_30: '1 to 30 days late', d31_60: '31 to 60 days late', d61_90: '61 to 90 days late', d90plus: 'Over 90 days late' };
const METHOD = (m: string) => m.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** Finance: money billed, collected and spent; what customers still owe and how late it is; where the spending goes. */
export function FinanceAnalytics({ accessToken }: { accessToken: string }) {
  const a = useOverviewAnalytics<OvFinance>((d) => overviewApi.finance(accessToken, d));
  const d = a.data;
  const t = d?.totals;
  const empty = !!t && t.invoiced === 0 && t.collected === 0 && t.spent === 0 && t.outstanding === 0;
  return (
    <AnalyticsFrame id="finance-analytics" title="Money in and out" note="What was billed, what was collected, what was spent, and what customers still owe." days={a.days} setDays={a.setDays} loading={a.loading} error={a.error} refresh={a.refresh} ready={!!d} empty={empty}>
      {d && t && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Billed" value={ghs(t.invoiced)} note={`invoices, last ${d.days} days`} tone="dark" id="fin-billed" />
            <Kpi label="Collected" value={ghs(t.collected)} note="verified payments" id="fin-collected" />
            <Kpi label="Spent" value={ghs(t.spent)} note="expenses not rejected" id="fin-spent" />
            <Kpi label="Estimated profit" value={ghs(t.estimatedProfit)} note="billed less spent" tone={t.estimatedProfit < 0 ? 'warn' : 'good'} id="fin-profit" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Payments to verify" value={`${t.paymentsToVerify}`} note="recorded by sales, not yet checked" tone={t.paymentsToVerify ? 'warn' : 'good'} id="fin-verify" />
            <Kpi label="Expenses to approve" value={`${t.expensesToApprove}`} note="waiting for a decision" tone={t.expensesToApprove ? 'warn' : 'good'} id="fin-approve" />
            <Kpi label="Owed to us" value={ghs(t.outstanding)} note="open invoices, all time" id="fin-owed" />
            <Kpi label="Late" value={ghs(t.overdue)} note="past the due date" tone={t.overdue > 0 ? 'warn' : 'plain'} id="fin-late" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2"><ChartCard id="fin-trend" title={`Billed, collected and spent, ${d.unit === 'day' ? 'per day' : 'per week'}`} note="GHS."><MultiTrend unit={d.unit} money rows={d.trend} series={[{ key: 'invoiced', label: 'Billed', color: '#1F4D2C' }, { key: 'collected', label: 'Collected', color: '#3B8266' }, { key: 'spent', label: 'Spent', color: '#B4402B' }]} /></ChartCard></div>
            <ChartCard id="fin-aging" title="How late is the money" note="What is still owed, by age."><PlaceBars label="Owed by age" rows={d.aging.map((x) => ({ name: AGING[x.name] ?? x.name, value: x.amount }))} format={ghs} color="#B4402B" /></ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard id="fin-expenses" title="Where the spending goes" note="By category."><PlaceBars label="Spending by category" rows={d.expensesByCategory.map((x) => ({ name: x.name, value: x.amount }))} format={ghs} color="#6B4A2F" /></ChartCard>
            <ChartCard id="fin-debtors" title="Who owes the most"><PlaceBars label="Customers who owe" rows={d.topDebtors.map((x) => ({ name: x.name, value: x.amount }))} format={ghs} color="#C9972B" /></ChartCard>
            <ChartCard id="fin-methods" title="How customers pay" note="Verified payments."><PlaceBars label="Payments by method" rows={d.paymentsByMethod.map((x) => ({ name: METHOD(x.name), value: x.amount }))} format={ghs} color="#3B8266" /></ChartCard>
          </div>
          <div data-testid="fin-debtors-list">
            <p className="mb-2 text-sm font-medium text-paddy-900">Customers who owe us</p>
            <PlaceTable id="fin-debtors-table" columns={[{ key: 'name', label: 'Customer' }, { key: 'amount', label: 'Owes', align: 'right' }, { key: 'late', label: 'Of which late', align: 'right' }]} rows={d.topDebtors.map((x) => ({ name: x.name, amount: ghs(x.amount), late: x.late > 0 ? ghs(x.late) : '-' }))} />
          </div>
        </div>
      )}
    </AnalyticsFrame>
  );
}
