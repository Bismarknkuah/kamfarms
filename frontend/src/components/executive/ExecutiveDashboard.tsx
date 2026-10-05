'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Building2, CircleAlert, Clock, Factory, Hourglass, Landmark, Package, Receipt, RefreshCw, Sprout, Truck, Wallet, Warehouse, Wheat } from 'lucide-react';
import { ApiError, type InventorySummary, type MeResponse, type MoneyOverview, type MoneyPeriod, type MoneyPlace, financeCenterApi, inventoryApi } from '@/lib/api-client';
import { visibleNavItems } from '@/lib/nav-items';
import { ICON_MAP } from '@/components/DashboardShell';
import { ControlCenter, hasControlCenter } from '@/components/ControlCenter';
import { FinanceDesk, ReleaseDesk } from '@/components/SalesDesks';
import { WatchlistCard } from '@/components/WatchlistCard';
import { OutputFeedbackCard } from '@/components/OutputFeedbackCard';
import { DonutChart } from '@/components/StatCard';
import { PERIODS, cedis, cedis2, cedisShort, change, clock, greeting, statusLabel, when } from './money';

type Mode = 'FINANCE' | 'EXECUTIVE';
interface Props { me: MeResponse; accessToken: string; hasPermission: (code: string | string[]) => boolean; mode: Mode }

const COPY: Record<Mode, string> = {
  FINANCE: 'All the company\'s money in one place: what is sold, what comes in, what is spent at every farm, warehouse and milling center, and what is waiting for your decision.',
  EXECUTIVE: 'The whole company at a glance: its money, its stock, and what is waiting for you.',
};
const MANAGE: Record<Mode, string[]> = {
  FINANCE: ['/finance', '/money', '/expenses', '/sales', '/reports', '/analytics', '/track-dispatch', '/trace', '/audit-log'],
  EXECUTIVE: ['/oversight', '/money', '/sales', '/finance', '/analytics', '/reports', '/track-dispatch', '/assistant', '/audit-log'],
};
const STATUS_TONE = (s: string) => (s === 'FULFILLED' ? 'bg-emerald-100 text-emerald-800' : ['ON_TRACK', 'PROCESSING', 'RESERVED', 'RELEASED'].includes(s) ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-900');

function Panel({ title, note, children, id, action }: { title: string; note?: string; children: ReactNode; id?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-paddy-100 bg-white p-5" data-testid={id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="font-display text-lg font-medium text-paddy-900">{title}</h3>{note && <p className="mt-0.5 text-xs text-ink-500">{note}</p>}</div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Kpi({ id, label, value, raw, sub, delta, versus, goodWhenUp }: { id: string; label: string; value: string; raw: number; sub: string; delta: ReturnType<typeof change>; versus: string; goodWhenUp: boolean }) {
  const good = delta.dir === 'flat' || (delta.dir === 'up') === goodWhenUp;
  return (
    <div data-testid={id}>
      <p className="text-xs font-medium uppercase tracking-wide text-paddy-100">{label}</p>
      <p className={`mt-1 font-display text-3xl font-medium sm:text-4xl ${id === 'kpi-net' && raw < 0 ? 'text-husk-300' : 'text-rice-50'}`} data-testid={`${id}-value`} data-value={raw}>{value}</p>
      <p className="mt-1 text-xs text-paddy-100">{sub}</p>
      {delta.dir !== 'none' && (
        <p className={`mt-1 text-xs font-medium ${delta.dir === 'flat' ? 'text-paddy-100' : good ? 'text-emerald-300' : 'text-husk-300'}`} data-testid={`${id}-change`} data-dir={delta.dir}>
          {delta.dir === 'up' ? '\u25B2' : delta.dir === 'down' ? '\u25BC' : '\u25A0'} {delta.pct === null ? (delta.dir === 'flat' ? 'No change' : 'New') : `${Math.abs(delta.pct).toFixed(0)}%`}{versus ? ` vs ${versus}` : ''}
        </p>
      )}
    </div>
  );
}

function Tile({ href, icon: Icon, label, value, note, warn, id }: { href: string; icon: typeof Wallet; label: string; value: string; note: string; warn?: boolean; id: string }) {
  return (
    <Link href={href} data-testid="money-tile" data-key={id} className={`rounded-2xl border bg-white p-4 transition hover:border-paddy-500 ${warn ? 'border-amber-300' : 'border-paddy-100'}`}>
      <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-paddy-50 text-paddy-700"><Icon className="h-4 w-4" aria-hidden="true" /></span><p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p></div>
      <p className={`mt-2 font-display text-3xl font-medium ${warn ? 'text-amber-800' : 'text-paddy-900'}`} data-testid="money-tile-value">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{note}</p>
    </Link>
  );
}

function PlaceCard({ kind, title, icon: Icon, total, spent, rows, keyOf }: { kind: string; title: string; icon: typeof Wallet; total: number; spent: number; rows: MoneyPlace[]; keyOf: (p: MoneyPlace) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <div className="rounded-2xl border border-paddy-100 bg-white p-5" data-testid="place-card" data-kind={kind}>
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-paddy-900 text-husk-300"><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0"><p className="font-semibold text-paddy-900">{title}</p><p className="text-xs text-ink-500">{spent > 0 ? `${Math.round((total / spent) * 100)}% of spending` : 'No spending yet'}</p></div>
      </div>
      <p className="mt-3 font-display text-3xl font-medium text-paddy-900" data-testid="place-total" data-value={total}>{cedis(total)}</p>
      {rows.length === 0 ? <p className="mt-3 text-sm text-ink-500">None set up yet.</p> : (
        <ul className="mt-3 space-y-1">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/money?place=${keyOf(r)}`} data-testid="place-row" data-name={r.name} data-amount={r.amount} className="block rounded-xl px-2 py-2 transition hover:bg-rice-50">
                <span className="flex items-baseline justify-between gap-3"><span className="truncate text-sm font-medium text-ink-900">{r.name}</span><span className="shrink-0 text-sm font-semibold text-paddy-900">{cedis(r.amount)}</span></span>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-paddy-50"><span className="block h-full rounded-full bg-paddy-700" style={{ width: `${r.amount > 0 ? Math.max(3, (r.amount / max) * 100) : 0}%` }} /></span>
                {r.pending > 0 && <span className="mt-1 block text-xs text-amber-800">{cedis(r.pending)} waiting for approval</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ExecutiveDashboard({ me, accessToken, hasPermission, mode }: Props) {
  const [period, setPeriod] = useState<MoneyPeriod>('month');
  const [data, setData] = useState<MoneyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<InventorySummary | null>(null);

  const load = useCallback((p: MoneyPeriod) => financeCenterApi.overview(accessToken, p)
    .then((v) => { setData(v); setError(null); })
    .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'The company\'s money could not be loaded.'))
    .finally(() => setLoading(false)), [accessToken]);
  useEffect(() => {
    setLoading(true); load(period);
    const t = setInterval(() => load(period), 90_000);
    return () => clearInterval(t);
  }, [period, load]);
  useEffect(() => { if (mode === 'EXECUTIVE') inventoryApi.getSummary(accessToken).then(setInventory).catch(() => {}); }, [accessToken, mode]);

  const versus = PERIODS.find((p) => p.key === period)?.versus ?? '';
  const m = data?.money;
  const offered = new Map(visibleNavItems(me).map((i) => [i.href, i]));
  const manage = MANAGE[mode].map((h) => offered.get(h)).filter((i): i is NonNullable<typeof i> => Boolean(i));
  const topCost = data?.spendByCategory[0];

  return (
    <div className="space-y-6" data-testid="exec-dashboard" data-mode={mode} aria-busy={loading}>
      <div>
        <p className="font-display text-base italic text-soil-500">Control center</p>
        <h1 className="font-display text-3xl font-medium text-paddy-900" data-testid="exec-greeting">{greeting()}, {me.firstName}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-500">{COPY[mode]}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="exec-controls">
        <div role="group" aria-label="Reporting period" className="inline-flex flex-wrap gap-1 rounded-full border border-paddy-100 bg-white p-1">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" data-testid={`period-${p.key}`} aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${period === p.key ? 'bg-paddy-900 text-rice-50' : 'text-ink-700 hover:bg-rice-50'}`}>{p.label}</button>
          ))}
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-500/10 px-3 py-1 text-xs text-ink-700" data-testid="exec-updated"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{data ? `Updated ${clock(data.generatedAt)}` : 'Loading'}{loading && data ? ' - updating' : ''}</span>
        <button type="button" data-testid="exec-refresh" onClick={() => { setLoading(true); load(period); }} className="inline-flex items-center gap-1.5 rounded-full border border-paddy-100 bg-white px-3 py-1 text-xs font-medium text-paddy-900 hover:border-paddy-500"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh</button>
      </div>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="exec-error">{error}</p>}

      <div className="overflow-hidden rounded-3xl bg-paddy-900 p-6 text-rice-50" data-testid="money-band">
        {!m ? <p className="text-sm text-paddy-100" data-testid="exec-loading">Adding up the company&rsquo;s money...</p> : (
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            <Kpi id="kpi-sales" label="Sales booked" value={cedisShort(m.salesBooked.amount)} raw={m.salesBooked.amount} sub={`${m.salesBooked.orders.toLocaleString()} approved order${m.salesBooked.orders === 1 ? '' : 's'}`} delta={change(m.salesBooked.amount, m.salesBooked.previous)} versus={versus} goodWhenUp />
            <Kpi id="kpi-collected" label="Money collected" value={cedisShort(m.collected.amount)} raw={m.collected.amount} sub={`${m.collected.payments.toLocaleString()} verified payment${m.collected.payments === 1 ? '' : 's'}`} delta={change(m.collected.amount, m.collected.previous)} versus={versus} goodWhenUp />
            <Kpi id="kpi-spent" label="Money spent" value={cedisShort(m.spent.amount)} raw={m.spent.amount} sub={`${m.spent.items.toLocaleString()} approved expense${m.spent.items === 1 ? '' : 's'}`} delta={change(m.spent.amount, m.spent.previous)} versus={versus} goodWhenUp={false} />
            <Kpi id="kpi-net" label="Net cash" value={`${m.net.amount < 0 ? '-' : ''}${cedisShort(Math.abs(m.net.amount))}`} raw={m.net.amount} sub="Collected, less spent" delta={change(m.net.amount, m.net.previous)} versus={versus} goodWhenUp />
          </div>
        )}
      </div>

      {hasControlCenter(me) && <ControlCenter accessToken={accessToken} me={me} />}

      <div data-testid="exec-desk">
        <h2 className="font-display text-lg font-medium text-paddy-900">Decide here</h2>
        <p className="mb-3 text-sm text-ink-500">{mode === 'FINANCE' ? 'Approve, verify or refuse without leaving this page.' : 'Release approved orders and decide on the expenses that are yours to decide.'}</p>
        {mode === 'FINANCE' ? <FinanceDesk accessToken={accessToken} meId={me.id} /> : <ReleaseDesk accessToken={accessToken} canApproveDirectorExpenses={hasPermission('finance.approve.director')} />}
      </div>

      {m && data && (
        <>
          <div>
            <h2 className="font-display text-lg font-medium text-paddy-900">Where the money stands</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Tile id="receivables" href="/finance" icon={Wallet} label="Owed to us" value={cedisShort(m.receivables.outstanding)} note={`${m.receivables.customers} customer${m.receivables.customers === 1 ? '' : 's'}, ${cedis(m.receivables.overdue)} overdue`} warn={m.receivables.overdue > 0} />
              <Tile id="pending-payments" href="/finance" icon={Hourglass} label="Payments to verify" value={cedisShort(m.pendingPayments.amount)} note={`${m.pendingPayments.count} payment${m.pendingPayments.count === 1 ? '' : 's'} waiting`} warn={m.pendingPayments.count > 0} />
              <Tile id="pending-expenses" href="/expenses" icon={Receipt} label="Expenses to approve" value={cedisShort(m.pendingExpenses.amount)} note={`${m.pendingExpenses.count} expense${m.pendingExpenses.count === 1 ? '' : 's'} waiting`} warn={m.pendingExpenses.count > 0} />
              <Tile id="fulfilled" href="/sales" icon={Package} label="Sales delivered" value={cedisShort(m.salesFulfilled.amount)} note={`${m.salesFulfilled.orders} order${m.salesFulfilled.orders === 1 ? '' : 's'} fulfilled`} />
              <Tile id="top-cost" href="/money?kind=out" icon={ArrowUpRight} label="Biggest cost" value={topCost ? topCost.name : 'None yet'} note={topCost ? `${cedis(topCost.amount)}, ${Math.round(topCost.share * 100)}% of spending` : 'Nothing spent in this period'} />
              <Tile id="head-office" href="/money?place=office" icon={Landmark} label="Head office spending" value={cedisShort(data.spendByPlace.headOffice.amount)} note={`${data.spendByPlace.headOffice.items} item${data.spendByPlace.headOffice.items === 1 ? '' : 's'}`} />
            </div>
          </div>

          {mode === 'EXECUTIVE' && (
            <div data-testid="exec-operations">
              <h2 className="font-display text-lg font-medium text-paddy-900">The company on the ground</h2>
              <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="grid grid-cols-2 gap-3 lg:col-span-2">
                  <Tile id="paddy-farms" href="/inventory" icon={Wheat} label="Paddy on farms" value={`${(inventory?.paddy?.farmKg ?? 0).toLocaleString()} kg`} note="At the farms now" />
                  <Tile id="paddy-transit" href="/track-dispatch" icon={Truck} label="Paddy in transit" value={`${(inventory?.paddy?.inTransitKg ?? 0).toLocaleString()} kg`} note="On the road" />
                  <Tile id="paddy-mill" href="/production" icon={Factory} label="At the mills" value={`${(inventory?.paddy?.atMillingKg ?? 0).toLocaleString()} kg`} note="Being milled" />
                  <Tile id="rice" href="/inventory" icon={Package} label="Packaged rice" value={`${((inventory?.finishedRice ?? []).reduce((s, r) => s + r.availableKg, 0)).toLocaleString()} kg`} note="Ready to sell" />
                </div>
                <Panel title="Stock at a glance">
                  {inventory?.paddy && Array.isArray(inventory.finishedRice) ? <DonutChart centerLabel={`${(inventory.paddy.farmKg + inventory.paddy.warehouseKg + inventory.finishedRice.reduce((s, r) => s + r.totalKg, 0)).toLocaleString()} kg`} data={[
                    { name: 'Paddy (farms)', value: inventory.paddy.farmKg }, { name: 'Paddy (warehouses)', value: inventory.paddy.warehouseKg }, { name: 'Packaged rice', value: inventory.finishedRice.reduce((s, r) => s + r.totalKg, 0) },
                    { name: 'Rice hull', value: inventory.riceHullKg }, { name: 'Broken rice', value: inventory.brokenRiceKg }]} /> : <p className="text-sm text-ink-500">Loading...</p>}
                </Panel>
              </div>
            </div>
          )}

          <div data-testid="exec-spending">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div><h2 className="font-display text-lg font-medium text-paddy-900">Where the money is spent</h2><p className="text-sm text-ink-500">Approved spending in {data.period.label.toLowerCase()}, at every farm, warehouse and milling center. Each expense is counted once, at the most specific place it names.</p></div>
              <Link href="/money?kind=out" className="inline-flex items-center gap-1 text-sm font-medium text-paddy-700 hover:underline">All spending <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <PlaceCard kind="farms" title="Farms" icon={Sprout} total={data.spendByPlace.totals.farms} spent={m.spent.amount} rows={data.spendByPlace.farms} keyOf={(p) => `farm:${p.id}`} />
              <PlaceCard kind="warehouses" title="Warehouses" icon={Warehouse} total={data.spendByPlace.totals.warehouses} spent={m.spent.amount} rows={data.spendByPlace.warehouses} keyOf={(p) => `warehouse:${p.id}`} />
              <PlaceCard kind="milling-centers" title="Milling centers" icon={Factory} total={data.spendByPlace.totals.millingCenters} spent={m.spent.amount} rows={data.spendByPlace.millingCenters} keyOf={(p) => `mill:${p.id}`} />
              <PlaceCard kind="head-office" title="Head office" icon={Building2} total={data.spendByPlace.totals.headOffice} spent={m.spent.amount}
                rows={[{ id: 'office', name: 'Not tied to a place', amount: data.spendByPlace.headOffice.amount, items: data.spendByPlace.headOffice.items, pending: data.spendByPlace.headOffice.pending, share: data.spendByPlace.headOffice.share }]} keyOf={() => 'office'} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <Panel title="Sales, money collected and money spent" note="The last six months, whatever period is chosen above." id="exec-trend">
                <div style={{ width: '100%', height: 250 }} data-testid="trend-chart">
                  <ResponsiveContainer>
                    <BarChart data={data.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EDE6D6" />
                      <XAxis dataKey="label" stroke="#8A7B62" fontSize={11} />
                      <YAxis stroke="#8A7B62" fontSize={11} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                      <Tooltip formatter={(v: number) => cedis(v)} contentStyle={{ borderRadius: 8, border: '1px solid #EDE6D6' }} />
                      <Legend />
                      <Bar dataKey="sales" name="Sales booked" fill="#1F4D2C" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="collected" name="Collected" fill="#3B8266" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="spent" name="Spent" fill="#C9972B" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>
            <div className="lg:col-span-2">
              <Panel title="What the money is spent on" note={`${data.period.label}, biggest first.`} id="exec-categories">
                {data.spendByCategory.length === 0 ? <p className="text-sm text-ink-500">Nothing was spent in this period.</p> : (
                  <ul className="space-y-2.5">
                    {data.spendByCategory.map((c) => (
                      <li key={c.name} data-testid="category-row" data-name={c.name} data-amount={c.amount}>
                        <div className="flex items-baseline justify-between gap-3 text-sm"><span className="font-medium text-ink-900">{c.name}</span><span className="font-semibold text-paddy-900">{cedis(c.amount)}</span></div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paddy-50"><div className="h-full rounded-full bg-husk-500" style={{ width: `${Math.max(3, c.share * 100)}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <Panel title="Sales record" note={`Approved orders in ${data.period.label.toLowerCase()}, newest first.`} id="exec-sales" action={<Link href="/sales" className="inline-flex items-center gap-1 text-sm font-medium text-paddy-700 hover:underline">All sales <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}>
                {data.recentSales.length === 0 ? <p className="text-sm text-ink-500">No sales were booked in this period.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[34rem] text-sm">
                      <thead><tr className="border-b border-paddy-100 text-left text-xs uppercase tracking-wide text-ink-500"><th className="py-2 pr-3 font-medium">Order</th><th className="py-2 pr-3 font-medium">Customer</th><th className="py-2 pr-3 font-medium">Sold by</th><th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 text-right font-medium">Amount</th><th className="py-2 font-medium">Stage</th></tr></thead>
                      <tbody>
                        {data.recentSales.map((s) => (
                          <tr key={s.id} className="border-b border-paddy-100/60" data-testid="sales-row" data-amount={s.amount}>
                            <td className="py-2 pr-3 font-mono text-xs"><Link href={`/sales?order=${s.id}`} className="text-paddy-700 hover:underline">{s.orderNumber}</Link></td>
                            <td className="py-2 pr-3 text-ink-900">{s.customer}</td><td className="py-2 pr-3 text-ink-700">{s.officer}</td><td className="py-2 pr-3 text-ink-700">{when(s.date)}</td>
                            <td className="py-2 pr-3 text-right font-semibold text-paddy-900">{cedis(s.amount)}</td>
                            <td className="py-2"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE(s.status)}`}>{statusLabel(s.status)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>
            <div className="space-y-4">
              <Panel title="Who owes the company" note="Invoices less the payments that are verified." id="exec-debtors">
                {data.debtors.length === 0 ? <p className="text-sm text-ink-500">Nobody owes the company anything.</p> : (
                  <ul className="space-y-1.5">
                    {data.debtors.map((d) => (
                      <li key={d.number} className="flex items-center justify-between gap-3 rounded-lg bg-rice-50 px-3 py-2 text-sm" data-testid="debtor-row" data-name={d.name} data-amount={d.outstanding}>
                        <span className="min-w-0"><span className="block truncate font-medium text-ink-900">{d.name}</span>{d.overdue > 0 && <span className="text-xs text-red-700">{cedis(d.overdue)} overdue</span>}</span>
                        <span className="shrink-0 font-semibold text-soil-700">{cedis(d.outstanding)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Biggest customers" note={`By sales booked in ${data.period.label.toLowerCase()}.`} id="exec-customers">
                {data.topCustomers.length === 0 ? <p className="text-sm text-ink-500">No sales in this period.</p> : (
                  <ul className="space-y-1.5">{data.topCustomers.map((c) => <li key={c.name} className="flex items-center justify-between gap-3 text-sm" data-testid="customer-row"><span className="truncate text-ink-900">{c.name}<span className="ml-2 text-xs text-ink-500">{c.orders} order{c.orders === 1 ? '' : 's'}</span></span><span className="font-semibold text-paddy-900">{cedis(c.amount)}</span></li>)}</ul>
                )}
              </Panel>
            </div>
          </div>

          <Panel title="Latest money in and out" note="Payments from customers and expenses, newest first. Anything waiting for a decision is marked." id="exec-ledger" action={<Link href="/money" className="inline-flex items-center gap-1 text-sm font-medium text-paddy-700 hover:underline">Open the full money ledger <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}>
            {data.recentTransactions.length === 0 ? <p className="text-sm text-ink-500">No money has moved yet.</p> : (
              <ul className="divide-y divide-paddy-100/70">
                {data.recentTransactions.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5" data-testid="ledger-row" data-kind={t.kind} data-number={t.number} data-state={t.state}>
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${t.kind === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-husk-100 text-husk-700'}`}>{t.kind === 'IN' ? <ArrowDownLeft className="h-4 w-4" aria-hidden="true" /> : <ArrowUpRight className="h-4 w-4" aria-hidden="true" />}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink-900">{t.title}{t.place ? <span className="font-normal text-ink-500"> · {t.place.name}</span> : null}</span><span className="block truncate text-xs text-ink-500">{t.number} · {when(t.date)}{t.detail ? ` · ${t.detail}` : ''}</span></span>
                    {t.state === 'waiting' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Waiting</span>}
                    <span className={`shrink-0 text-sm font-semibold ${t.kind === 'IN' ? 'text-emerald-700' : 'text-ink-900'}`}>{t.kind === 'IN' ? '+' : '-'}{cedis2(t.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}

      {mode === 'EXECUTIVE' && <div className="space-y-4" data-testid="exec-watch"><WatchlistCard accessToken={accessToken} /><OutputFeedbackCard accessToken={accessToken} /></div>}

      {manage.length > 0 && (
        <div data-testid="exec-manage">
          <h2 className="font-display text-lg font-medium text-paddy-900">Go to</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {manage.map((i) => {
              const Icon = ICON_MAP[i.icon] ?? CircleAlert;
              return (
                <Link key={i.href} href={i.href} data-testid="manage-link" className="group flex gap-4 rounded-2xl border border-paddy-100 bg-white p-4 transition hover:border-paddy-500 hover:shadow-sm">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-paddy-900 text-husk-300"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <span><span className="block font-semibold text-paddy-900">{i.label}</span><span className="mt-0.5 block text-sm text-ink-500">{i.description}</span></span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
