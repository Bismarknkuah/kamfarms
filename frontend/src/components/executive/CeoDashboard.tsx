'use client';

import Link from 'next/link';
import type { MeResponse, MoneyOverview } from '@/lib/api-client';
import { ControlCenter, hasControlCenter } from '@/components/ControlCenter';
import { ReleaseDesk } from '@/components/SalesDesks';
import { ResetApprovalQueue } from '@/components/review/ResetApprovalQueue';
import { WatchlistCard } from '@/components/WatchlistCard';
import { BroadcastPanel, DelegateTask } from './desks';
import { cedis, change } from './money';
import { Controls, CustomersPanel, Gauge, GoTo, Greeting, Panel, SpendByPlace, TrendPanel } from './parts';
import { type DispatchFacts, dispatchFacts, useDispatch, useMoney } from './hooks';
import { versusOf } from './parts';

type Tone = 'good' | 'watch' | 'bad' | 'none';
const high = (v: number | null, good: number, watch: number): Tone => (v === null ? 'none' : v >= good ? 'good' : v >= watch ? 'watch' : 'bad');
const low = (v: number | null, good: number, watch: number): Tone => (v === null ? 'none' : v <= good ? 'good' : v <= watch ? 'watch' : 'bad');

function scorecard(d: MoneyOverview, f: DispatchFacts | null) {
  const m = d.money; const sold = m.salesBooked.amount; const got = m.collected.amount;
  const top = d.topCustomers[0];
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
  const collection = pct(got, sold); const margin = pct(m.net.amount, got); const spending = pct(m.spent.amount, got);
  const overdue = m.receivables.outstanding > 0 ? pct(m.receivables.overdue, m.receivables.outstanding) : 0; const onTime = f?.onTimePct ?? null; const conc = top ? pct(top.amount, sold) : null;
  return [
    { id: 'collection', label: 'Sales collected', hint: 'Money collected as a share of sales booked', pct: collection, tone: high(collection, 80, 50) },
    { id: 'margin', label: 'Net cash margin', hint: 'What is left of the money collected after spending', pct: margin, tone: high(margin, 20, 0) },
    { id: 'spending', label: 'Spending against collections', hint: 'Money spent for every 100 collected (lower is better)', pct: spending, tone: low(spending, 70, 100) },
    { id: 'overdue', label: 'Debt that is overdue', hint: 'Share of what customers owe that is past its due date (lower is better)', pct: overdue, tone: low(overdue, 10, 30) },
    { id: 'ontime', label: 'Deliveries on time', hint: 'Delivered trucks and transfers that were not late', pct: onTime, tone: high(onTime, 90, 70) },
    { id: 'concentration', label: 'Biggest customer\'s share', hint: 'How much of the sales one customer is (lower is safer)', pct: conc, tone: low(conc, 30, 50) },
  ];
}

const LEVEL = { high: 'border-red-300 bg-red-50', medium: 'border-amber-300 bg-amber-50', ok: 'border-emerald-200 bg-emerald-50/60' } as const;
const LEVEL_TEXT = { high: 'Needs action', medium: 'Keep an eye on it', ok: 'Fine' } as const;
const LEVEL_PILL = { high: 'bg-red-100 text-red-800', medium: 'bg-amber-100 text-amber-900', ok: 'bg-emerald-100 text-emerald-800' } as const;

function risks(d: MoneyOverview, f: DispatchFacts | null) {
  const m = d.money; const overdueShare = m.receivables.outstanding > 0 ? m.receivables.overdue / m.receivables.outstanding : 0;
  type R = { id: string; level: keyof typeof LEVEL; title: string; value: string; note: string; href: string };
  const out: R[] = [
    { id: 'overdue', level: m.receivables.overdue === 0 ? 'ok' : overdueShare > 0.3 ? 'high' : 'medium', title: 'Overdue debts', value: cedis(m.receivables.overdue), note: `${m.receivables.customers} customer${m.receivables.customers === 1 ? '' : 's'} owe ${cedis(m.receivables.outstanding)} in all`, href: '/finance' },
    { id: 'cash', level: m.net.amount < 0 ? 'high' : 'ok', title: 'Cash position', value: `${m.net.amount < 0 ? '-' : ''}${cedis(Math.abs(m.net.amount))}`, note: 'Money collected less money spent in this period', href: '/money' },
    { id: 'payments', level: m.pendingPayments.count > 0 ? 'medium' : 'ok', title: 'Payments not yet verified', value: cedis(m.pendingPayments.amount), note: `${m.pendingPayments.count} waiting for the Finance Director`, href: '/finance' },
    { id: 'expenses', level: m.pendingExpenses.count > 0 ? 'medium' : 'ok', title: 'Expenses not yet approved', value: cedis(m.pendingExpenses.amount), note: `${m.pendingExpenses.count} waiting for a decision`, href: '/expenses' },
  ];
  if (f) {
    out.push({ id: 'late', level: f.lateNow.length > 0 ? 'high' : 'ok', title: 'Trucks running late', value: String(f.lateNow.length), note: f.lateNow.length > 0 ? `Longest: ${f.lateNow[0].ref}` : 'Nothing is overdue', href: '/track-dispatch' });
    out.push({ id: 'bags', level: f.waitingReview > 0 ? 'medium' : 'ok', title: 'Damaged-bag reports waiting', value: String(f.waitingReview), note: 'Waiting for a Warehouse Supervisor to decide', href: '/track-dispatch' });
  }
  return out;
}

function sentence(label: string, cur: number, prev: number | null, versus: string) {
  const c = change(cur, prev);
  const how = c.dir === 'none' ? 'in all' : c.dir === 'flat' ? `unchanged on ${versus}` : c.pct === null ? `new, with nothing to compare against ${versus}` : `${c.dir} ${Math.abs(c.pct).toFixed(0)}% on ${versus}`;
  return { text: `${label} ${cedis(Math.abs(cur))}${cur < 0 ? ' short' : ''}, ${how}.`, dir: c.dir };
}

/**
 * The CEO's dashboard: how the company is performing and where it is at risk. A scorecard of six dials, a risk radar, a plain-words account of what changed,
 * where the money goes, who the company depends on, and the decisions that are the CEO's (release orders, director-level expenses, resets, announcements).
 */
export function CeoDashboard({ me, accessToken, hasPermission }: { me: MeResponse; accessToken: string; hasPermission: (c: string | string[]) => boolean }) {
  const { period, setPeriod, data, error, loading, refresh } = useMoney(accessToken);
  const facts = dispatchFacts(useDispatch(accessToken));
  const versus = versusOf(period);
  const m = data?.money; const top = data?.spendByCategory[0];

  return (
    <div className="space-y-6" data-testid="exec-dashboard" data-role="CEO" aria-busy={loading}>
      <Greeting me={me} copy="How the company is performing, where it is at risk, and the decisions that are yours." />
      <Controls period={period} setPeriod={setPeriod} data={data} loading={loading} refresh={refresh} />
      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="exec-error">{error}</p>}

      <div data-testid="exec-scorecard">
        <h2 className="font-display text-lg font-medium text-paddy-900">The company scorecard</h2>
        <p className="text-sm text-ink-500">Six measures of how the company is doing in {data ? data.period.label.toLowerCase() : 'this period'}. Green is healthy, gold is worth watching, red needs action.</p>
        {!data ? <p className="mt-3 text-sm text-ink-500" data-testid="exec-loading">Working out the scorecard...</p> : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{scorecard(data, facts).map((g) => <Gauge key={g.id} {...g} />)}</div>
        )}
      </div>

      {data && (
        <div data-testid="exec-risk">
          <h2 className="font-display text-lg font-medium text-paddy-900">Where the company is exposed</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {risks(data, facts).map((r) => (
              <Link key={r.id} href={r.href} data-testid="risk-card" data-key={r.id} data-level={r.level} className={`rounded-2xl border p-4 transition hover:shadow-sm ${LEVEL[r.level]}`}>
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-paddy-900">{r.title}</p><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVEL_PILL[r.level]}`}>{LEVEL_TEXT[r.level]}</span></div>
                <p className="mt-2 font-display text-2xl font-medium text-paddy-900" data-testid="risk-value">{r.value}</p>
                <p className="mt-1 text-xs text-ink-700">{r.note}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {hasControlCenter(me) && <ControlCenter accessToken={accessToken} me={me} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2" data-testid="exec-desk">
          <h2 className="font-display text-lg font-medium text-paddy-900">Decide here</h2>
          <p className="mb-3 text-sm text-ink-500">Release approved orders and decide on the expenses that are yours to decide.</p>
          <ReleaseDesk accessToken={accessToken} canApproveDirectorExpenses={hasPermission('finance.approve.director')} />
        </div>
        <div data-testid="exec-resets"><ResetApprovalQueue accessToken={accessToken} /></div>
      </div>

      {data && m && (
        <>
          <Panel title="What changed" note={`${data.period.label}, in plain words.`} id="exec-narrative">
            <ul className="space-y-2 text-sm text-ink-900">
              {[
                { key: 'sales', ...sentence('Sales booked were', m.salesBooked.amount, m.salesBooked.previous, versus), raw: m.salesBooked.amount },
                { key: 'collected', ...sentence('Money collected was', m.collected.amount, m.collected.previous, versus), raw: m.collected.amount },
                { key: 'spent', ...sentence('Money spent was', m.spent.amount, m.spent.previous, versus), raw: m.spent.amount },
                { key: 'net', ...sentence('Net cash was', m.net.amount, m.net.previous, versus), raw: m.net.amount },
              ].map((l) => <li key={l.key} data-testid="narrative-line" data-key={l.key} data-dir={l.dir} data-value={l.raw} className="flex gap-2"><span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-paddy-700" />{l.text}</li>)}
              {top && <li data-testid="narrative-line" data-key="top-cost" className="flex gap-2"><span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-husk-500" />The biggest cost was {top.name}: {cedis(top.amount)}, {Math.round(top.share * 100)}% of everything spent.</li>}
            </ul>
          </Panel>
          <SpendByPlace data={data} title="Where the company spends" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5"><div className="lg:col-span-3"><TrendPanel data={data} /></div><div className="lg:col-span-2"><CustomersPanel data={data} withShare /></div></div>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><DelegateTask accessToken={accessToken} meId={me.id} /><BroadcastPanel accessToken={accessToken} meId={me.id} /></div>
      <div data-testid="exec-watch"><WatchlistCard accessToken={accessToken} /></div>
      <GoTo me={me} hrefs={['/oversight', '/analytics', '/money', '/track-dispatch', '/finance', '/sales', '/reports', '/assistant', '/audit-log']} />
    </div>
  );
}
