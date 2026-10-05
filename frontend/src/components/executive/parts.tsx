'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Building2, CircleAlert, Clock, Factory, Hourglass, Landmark, Package, Receipt, RefreshCw, Sprout, Wallet, Warehouse } from 'lucide-react';
import type { MeResponse, MoneyOverview, MoneyPeriod, MoneyPlace } from '@/lib/api-client';
import { visibleNavItems } from '@/lib/nav-items';
import { ICON_MAP } from '@/components/DashboardShell';
import { PERIODS, cedis, cedis2, cedisShort, change, clock, greeting, statusLabel, when } from './money';

export const versusOf = (p: MoneyPeriod) => PERIODS.find((x) => x.key === p)?.versus ?? '';

export function Panel({ title, note, children, id, action }: { title: string; note?: string; children: ReactNode; id?: string; action?: ReactNode }) {
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

export function Greeting({ me, copy }: { me: MeResponse; copy: string }) {
  return (
    <div>
      <p className="font-display text-base italic text-soil-500">Control center</p>
      <h1 className="font-display text-3xl font-medium text-paddy-900" data-testid="exec-greeting">{greeting()}, {me.firstName}</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-500">{copy}</p>
    </div>
  );
}

export function Controls({ period, setPeriod, data, loading, refresh }: { period: MoneyPeriod; setPeriod: (p: MoneyPeriod) => void; data: MoneyOverview | null; loading: boolean; refresh: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="exec-controls">
      <div role="group" aria-label="Reporting period" className="inline-flex flex-wrap gap-1 rounded-full border border-paddy-100 bg-white p-1">
        {PERIODS.map((p) => (
          <button key={p.key} type="button" data-testid={`period-${p.key}`} aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${period === p.key ? 'bg-paddy-900 text-rice-50' : 'text-ink-700 hover:bg-rice-50'}`}>{p.label}</button>
        ))}
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-500/10 px-3 py-1 text-xs text-ink-700" data-testid="exec-updated"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{data ? `Updated ${clock(data.generatedAt)}` : 'Loading'}{loading && data ? ' - updating' : ''}</span>
      <button type="button" data-testid="exec-refresh" onClick={refresh} className="inline-flex items-center gap-1.5 rounded-full border border-paddy-100 bg-white px-3 py-1 text-xs font-medium text-paddy-900 hover:border-paddy-500"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh</button>
    </div>
  );
}

type Delta = ReturnType<typeof change>;
function DeltaLine({ id, delta, versus, goodWhenUp, dark }: { id: string; delta: Delta; versus: string; goodWhenUp: boolean; dark: boolean }) {
  if (delta.dir === 'none') return null;
  const good = delta.dir === 'flat' || (delta.dir === 'up') === goodWhenUp;
  const tone = delta.dir === 'flat' ? (dark ? 'text-paddy-100' : 'text-ink-500') : good ? (dark ? 'text-emerald-300' : 'text-emerald-700') : (dark ? 'text-husk-300' : 'text-amber-800');
  return (
    <p className={`mt-1 text-xs font-medium ${tone}`} data-testid={`${id}-change`} data-dir={delta.dir}>
      {delta.dir === 'up' ? '\u25B2' : delta.dir === 'down' ? '\u25BC' : '\u25A0'} {delta.pct === null ? (delta.dir === 'flat' ? 'No change' : 'New') : `${Math.abs(delta.pct).toFixed(0)}%`}{versus ? ` vs ${versus}` : ''}
    </p>
  );
}

function kpis(data: MoneyOverview, period: MoneyPeriod) {
  const m = data.money; const v = versusOf(period);
  return [
    { id: 'kpi-sales', label: 'Sales booked', value: cedisShort(m.salesBooked.amount), raw: m.salesBooked.amount, sub: `${m.salesBooked.orders.toLocaleString()} approved order${m.salesBooked.orders === 1 ? '' : 's'}`, delta: change(m.salesBooked.amount, m.salesBooked.previous), versus: v, goodWhenUp: true },
    { id: 'kpi-collected', label: 'Money collected', value: cedisShort(m.collected.amount), raw: m.collected.amount, sub: `${m.collected.payments.toLocaleString()} verified payment${m.collected.payments === 1 ? '' : 's'}`, delta: change(m.collected.amount, m.collected.previous), versus: v, goodWhenUp: true },
    { id: 'kpi-spent', label: 'Money spent', value: cedisShort(m.spent.amount), raw: m.spent.amount, sub: `${m.spent.items.toLocaleString()} approved expense${m.spent.items === 1 ? '' : 's'}`, delta: change(m.spent.amount, m.spent.previous), versus: v, goodWhenUp: false },
    { id: 'kpi-net', label: 'Net cash', value: `${m.net.amount < 0 ? '-' : ''}${cedisShort(Math.abs(m.net.amount))}`, raw: m.net.amount, sub: 'Collected, less spent', delta: change(m.net.amount, m.net.previous), versus: v, goodWhenUp: true },
  ];
}

/** The Finance Director's headline: the four money figures on a dark band. */
export function MoneyBand({ data, period }: { data: MoneyOverview | null; period: MoneyPeriod }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-paddy-900 p-6 text-rice-50" data-testid="money-band">
      {!data ? <p className="text-sm text-paddy-100" data-testid="exec-loading">Adding up the company&rsquo;s money...</p> : (
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {kpis(data, period).map((k) => (
            <div key={k.id} data-testid={k.id}>
              <p className="text-xs font-medium uppercase tracking-wide text-paddy-100">{k.label}</p>
              <p className={`mt-1 font-display text-3xl font-medium sm:text-4xl ${k.id === 'kpi-net' && k.raw < 0 ? 'text-husk-300' : 'text-rice-50'}`} data-testid={`${k.id}-value`} data-value={k.raw}>{k.value}</p>
              <p className="mt-1 text-xs text-paddy-100">{k.sub}</p>
              <DeltaLine id={k.id} delta={k.delta} versus={k.versus} goodWhenUp={k.goodWhenUp} dark />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The MD's version: the same four figures as light cards, smaller, because for the MD money is one part of running the business. */
export function KpiRow({ data, period }: { data: MoneyOverview | null; period: MoneyPeriod }) {
  if (!data) return <p className="text-sm text-ink-500" data-testid="exec-loading">Adding up the company&rsquo;s money...</p>;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="kpi-row">
      {kpis(data, period).map((k) => (
        <div key={k.id} data-testid={k.id} className="rounded-2xl border border-paddy-100 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{k.label}</p>
          <p className={`mt-1 font-display text-2xl font-medium ${k.id === 'kpi-net' && k.raw < 0 ? 'text-amber-800' : 'text-paddy-900'}`} data-testid={`${k.id}-value`} data-value={k.raw}>{k.value}</p>
          <p className="mt-0.5 text-xs text-ink-500">{k.sub}</p>
          <DeltaLine id={k.id} delta={k.delta} versus={k.versus} goodWhenUp={k.goodWhenUp} dark={false} />
        </div>
      ))}
    </div>
  );
}

export function Tile({ href, icon: Icon, label, value, note, warn, id }: { href: string; icon: typeof Wallet; label: string; value: string; note: string; warn?: boolean; id: string }) {
  return (
    <Link href={href} data-testid="money-tile" data-key={id} className={`rounded-2xl border bg-white p-4 transition hover:border-paddy-500 ${warn ? 'border-amber-300' : 'border-paddy-100'}`}>
      <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-paddy-50 text-paddy-700"><Icon className="h-4 w-4" aria-hidden="true" /></span><p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p></div>
      <p className={`mt-2 font-display text-3xl font-medium ${warn ? 'text-amber-800' : 'text-paddy-900'}`} data-testid="money-tile-value">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{note}</p>
    </Link>
  );
}

export function MoneyTiles({ data }: { data: MoneyOverview }) {
  const m = data.money; const topCost = data.spendByCategory[0];
  return (
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

export function SpendByPlace({ data, title = 'Where the money is spent' }: { data: MoneyOverview; title?: string }) {
  const s = data.spendByPlace; const spent = data.money.spent.amount;
  return (
    <div data-testid="exec-spending">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="font-display text-lg font-medium text-paddy-900">{title}</h2><p className="text-sm text-ink-500">Approved spending in {data.period.label.toLowerCase()}, at every farm, warehouse and milling center. Each expense is counted once, at the most specific place it names.</p></div>
        <Link href="/money?kind=out" className="inline-flex items-center gap-1 text-sm font-medium text-paddy-700 hover:underline">All spending <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlaceCard kind="farms" title="Farms" icon={Sprout} total={s.totals.farms} spent={spent} rows={s.farms} keyOf={(p) => `farm:${p.id}`} />
        <PlaceCard kind="warehouses" title="Warehouses" icon={Warehouse} total={s.totals.warehouses} spent={spent} rows={s.warehouses} keyOf={(p) => `warehouse:${p.id}`} />
        <PlaceCard kind="milling-centers" title="Milling centers" icon={Factory} total={s.totals.millingCenters} spent={spent} rows={s.millingCenters} keyOf={(p) => `mill:${p.id}`} />
        <PlaceCard kind="head-office" title="Head office" icon={Building2} total={s.totals.headOffice} spent={spent} rows={[{ id: 'office', name: 'Not tied to a place', amount: s.headOffice.amount, items: s.headOffice.items, pending: s.headOffice.pending, share: s.headOffice.share }]} keyOf={() => 'office'} />
      </div>
    </div>
  );
}

export function TrendPanel({ data }: { data: MoneyOverview }) {
  return (
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
  );
}

export function CategoriesPanel({ data }: { data: MoneyOverview }) {
  return (
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
  );
}

const STATUS_TONE = (s: string) => (s === 'FULFILLED' ? 'bg-emerald-100 text-emerald-800' : ['ON_TRACK', 'PROCESSING', 'RESERVED', 'RELEASED'].includes(s) ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-900');
export function SalesRecord({ data }: { data: MoneyOverview }) {
  return (
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
  );
}

export function DebtorsPanel({ data }: { data: MoneyOverview }) {
  return (
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
  );
}

export function CustomersPanel({ data, withShare = false }: { data: MoneyOverview; withShare?: boolean }) {
  const total = data.money.salesBooked.amount;
  return (
    <Panel title="Biggest customers" note={`By sales booked in ${data.period.label.toLowerCase()}${withShare ? ', with their share of all sales' : ''}.`} id="exec-customers">
      {data.topCustomers.length === 0 ? <p className="text-sm text-ink-500">No sales in this period.</p> : (
        <ul className="space-y-2">
          {data.topCustomers.map((c) => (
            <li key={c.name} data-testid="customer-row" data-name={c.name} data-amount={c.amount}>
              <div className="flex items-center justify-between gap-3 text-sm"><span className="truncate text-ink-900">{c.name}<span className="ml-2 text-xs text-ink-500">{c.orders} order{c.orders === 1 ? '' : 's'}</span></span><span className="font-semibold text-paddy-900">{cedis(c.amount)}{withShare && total > 0 ? <span className="ml-2 text-xs font-normal text-ink-500" data-testid="customer-share">{Math.round((c.amount / total) * 100)}%</span> : null}</span></div>
              {withShare && total > 0 && <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paddy-50"><div className="h-full rounded-full bg-paddy-700" style={{ width: `${Math.max(3, (c.amount / total) * 100)}%` }} /></div>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function LedgerFeed({ data }: { data: MoneyOverview }) {
  return (
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
  );
}

export function GoTo({ me, hrefs, title = 'Go to', id = 'exec-manage' }: { me: MeResponse; hrefs: string[]; title?: string; id?: string }) {
  const offered = new Map(visibleNavItems(me).map((i) => [i.href, i]));
  const items = hrefs.map((h) => offered.get(h)).filter((i): i is NonNullable<typeof i> => Boolean(i));
  if (items.length === 0) return null;
  return (
    <div data-testid={id}>
      <h2 className="font-display text-lg font-medium text-paddy-900">{title}</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((i) => {
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
  );
}

const RING = { good: '#3B8266', watch: '#C9972B', bad: '#B4402B', none: '#B9B2A2' } as const;
/** A dial: how full the ring is says how much, its colour says whether that is good. `lowerIsBetter` is about the colour only. */
export function Gauge({ id, label, hint, pct, tone }: { id: string; label: string; hint: string; pct: number | null; tone: keyof typeof RING }) {
  const c = 2 * Math.PI * 34; const fill = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-paddy-100 bg-white p-4" data-testid="gauge" data-key={id} data-value={pct === null ? '' : Math.round(pct)} data-tone={tone}>
      <div className="relative h-20 w-20 shrink-0">
        <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90" aria-hidden="true"><circle cx="40" cy="40" r="34" fill="none" stroke="#EDE6D6" strokeWidth="8" /><circle cx="40" cy="40" r="34" fill="none" stroke={RING[tone]} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(c * fill) / 100} ${c}`} /></svg>
        <span className="absolute inset-0 grid place-items-center font-display text-lg font-medium text-paddy-900" data-testid="gauge-value">{pct === null ? 'n/a' : `${Math.round(pct)}%`}</span>
      </div>
      <div className="min-w-0"><p className="font-semibold text-paddy-900">{label}</p><p className="mt-0.5 text-xs text-ink-500">{hint}</p></div>
    </div>
  );
}
