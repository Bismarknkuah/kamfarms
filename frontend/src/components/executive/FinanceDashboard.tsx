'use client';

import type { MeResponse } from '@/lib/api-client';
import { ControlCenter, hasControlCenter } from '@/components/ControlCenter';
import { FinanceDesk } from '@/components/SalesDesks';
import { ResetApprovalQueue } from '@/components/review/ResetApprovalQueue';
import { InvoicesToRaise, DelegateTask } from './desks';
import { CategoriesPanel, Controls, CustomersPanel, DebtorsPanel, GoTo, Greeting, LedgerFeed, MoneyBand, MoneyTiles, SalesRecord, SpendByPlace, TrendPanel } from './parts';
import { useMoney } from './hooks';

/**
 * The Finance Director's dashboard: the money desk. Everything he decides or does is on this page: approve orders, verify payments, decide expenses, raise
 * invoices, sign off a system reset, and give someone a task. Below it, the company's money, in full.
 */
export function FinanceDashboard({ me, accessToken }: { me: MeResponse; accessToken: string }) {
  const { period, setPeriod, data, error, loading, refresh } = useMoney(accessToken);
  return (
    <div className="space-y-6" data-testid="exec-dashboard" data-role="FINANCE_DIRECTOR" aria-busy={loading}>
      <Greeting me={me} copy="All the company's money in one place: what is sold, what comes in, what is spent at every farm, warehouse and milling center, and every decision that is waiting for you." />
      <Controls period={period} setPeriod={setPeriod} data={data} loading={loading} refresh={refresh} />
      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="exec-error">{error}</p>}
      <MoneyBand data={data} period={period} />

      {hasControlCenter(me) && <ControlCenter accessToken={accessToken} me={me} />}

      <div data-testid="exec-desk">
        <h2 className="font-display text-lg font-medium text-paddy-900">Decide here</h2>
        <p className="mb-3 text-sm text-ink-500">Approve, verify or refuse without leaving this page.</p>
        <FinanceDesk accessToken={accessToken} meId={me.id} />
      </div>
      <InvoicesToRaise accessToken={accessToken} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div data-testid="exec-resets"><ResetApprovalQueue accessToken={accessToken} /></div>
        <DelegateTask accessToken={accessToken} meId={me.id} />
      </div>

      {data && (
        <>
          <MoneyTiles data={data} />
          <SpendByPlace data={data} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5"><div className="lg:col-span-3"><TrendPanel data={data} /></div><div className="lg:col-span-2"><CategoriesPanel data={data} /></div></div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3"><div className="xl:col-span-2"><SalesRecord data={data} /></div><div className="space-y-4"><DebtorsPanel data={data} /><CustomersPanel data={data} /></div></div>
          <LedgerFeed data={data} />
        </>
      )}
      <GoTo me={me} hrefs={['/finance', '/money', '/expenses', '/sales', '/reports', '/analytics', '/track-dispatch', '/trace', '/audit-log']} />
    </div>
  );
}
