'use client';

import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Clock, DollarSign, Package, Users } from 'lucide-react';
import type { ExecutiveAnalytics, SalesOrder, TopDebtor } from '@/lib/api-client';
import { IconStatCard } from '@/components/StatCard';
import { formatGhs, inPeriod } from '@/lib/oversight-utils';

const PIPELINE = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'RELEASED', 'RESERVED', 'PROCESSING', 'ON_TRACK'];
const STATUS_ORDER = [...PIPELINE, 'FULFILLED', 'REJECTED', 'CANCELLED'];
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

export function SalesPanel({ orders, analytics, debtors }: { orders: SalesOrder[]; analytics: ExecutiveAnalytics | null; debtors: TopDebtor[] }) {
  const soldThisMonth = orders.filter((o) => o.status === 'FULFILLED' && o.fulfilledAt && inPeriod(o.fulfilledAt, 'THIS_MONTH'));
  const revenue = soldThisMonth.reduce((s, o) => s + o.totalAmount, 0);
  const pipeline = orders.filter((o) => PIPELINE.includes(o.status));
  const pipelineValue = pipeline.reduce((s, o) => s + o.totalAmount, 0);
  const owed = debtors.reduce((s, d) => s + d.outstanding, 0);

  const byStatus = STATUS_ORDER.map((s) => {
    const rows = orders.filter((o) => o.status === s);
    return { status: s, count: rows.length, value: rows.reduce((a, o) => a + o.totalAmount, 0) };
  }).filter((r) => r.count > 0);

  const months = analytics ? analytics.monthlySales.map((m, i) => ({ month: m.month.slice(5), sales: m.amount, expenses: analytics.monthlyExpenses[i]?.amount ?? 0 })) : [];
  const maxProduct = Math.max(1, ...(analytics?.salesByProduct.map((p) => p.amount) ?? [1]));
  const recent = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <IconStatCard icon={DollarSign} tone="green" label="Sales this month" value={formatGhs(revenue)} trend={`${soldThisMonth.length} order${soldThisMonth.length === 1 ? '' : 's'} delivered`} />
        <IconStatCard icon={Clock} tone="orange" label="Orders in progress" value={String(pipeline.length)} trend={formatGhs(pipelineValue)} />
        <IconStatCard icon={Users} tone="blue" label="Owed to the company" value={formatGhs(owed)} trend={`${debtors.length} customer${debtors.length === 1 ? '' : 's'}`} />
        <IconStatCard icon={Package} tone="purple" label="All orders on record" value={String(orders.length)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-paddy-100 bg-white p-5">
          <h2 className="font-display text-lg text-paddy-900">Sales and expenses, six months</h2>
          <div className="mt-3" style={{ width: '100%', height: 220 }}>
            {analytics ? (
              <ResponsiveContainer>
                <BarChart data={months}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EDE6D6" />
                  <XAxis dataKey="month" stroke="#8A7B62" fontSize={11} />
                  <YAxis stroke="#8A7B62" fontSize={11} />
                  <Tooltip formatter={(v: number) => formatGhs(v)} contentStyle={{ borderRadius: 8, border: '1px solid #EDE6D6' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar isAnimationActive={false} dataKey="sales" fill="#1F4D2C" name="Sales" radius={[4, 4, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="expenses" fill="#C9972B" name="Expenses" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-ink-500">Trend figures could not be loaded just now.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-paddy-100 bg-white p-5">
          <h2 className="font-display text-lg text-paddy-900">Best-selling products</h2>
          <p className="text-xs text-ink-500">Delivered orders, last six months.</p>
          <div className="mt-4 space-y-3">
            {analytics?.salesByProduct.map((p) => (
              <div key={p.product}>
                <div className="flex items-baseline justify-between gap-2 text-sm"><span className="truncate text-ink-900">{p.product}</span><span className="shrink-0 text-ink-900">{formatGhs(p.amount)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-rice-50"><div className="h-full bg-husk-500" style={{ width: `${(p.amount / maxProduct) * 100}%` }} /></div>
              </div>
            ))}
            {analytics && analytics.salesByProduct.length === 0 && <p className="text-sm text-ink-500">No delivered sales in the last six months.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-paddy-100 bg-white p-5">
          <h2 className="font-display text-lg text-paddy-900">Orders by stage</h2>
          <div className="mt-3 space-y-1.5">
            {byStatus.map((r) => (
              <div key={r.status} className="flex items-center justify-between rounded-lg bg-rice-50 px-3 py-2 text-sm">
                <span className="text-ink-900">{label(r.status)}</span>
                <span className="text-ink-700">{r.count} &middot; {formatGhs(r.value)}</span>
              </div>
            ))}
            {byStatus.length === 0 && <p className="text-sm text-ink-500">No orders yet.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-paddy-100 bg-white p-5">
          <h2 className="font-display text-lg text-paddy-900">Who owes the company</h2>
          <div className="mt-3 space-y-1.5">
            {debtors.slice(0, 8).map((d) => (
              <div key={d.customerId} className="flex items-center justify-between rounded-lg bg-rice-50 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-ink-900">{d.customerName}</span>
                <span className="shrink-0 font-medium text-ink-900">{formatGhs(d.outstanding)}</span>
              </div>
            ))}
            {debtors.length === 0 && <p className="text-sm text-ink-500">Nothing outstanding.</p>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-paddy-100 bg-white p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-lg text-paddy-900">Latest orders</h2>
          <Link href="/sales" className="text-xs font-medium text-paddy-700 hover:underline">Open sales</Link>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className="text-xs text-ink-500"><th className="pb-2 font-medium">Order</th><th className="pb-2 font-medium">Customer</th><th className="pb-2 font-medium">Stage</th><th className="pb-2 text-right font-medium">Amount</th><th className="pb-2 pl-3 font-medium">Sales officer</th></tr></thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o.id} className="border-t border-paddy-50">
                  <td className="py-2 font-mono text-xs text-ink-700">{o.orderNumber}</td>
                  <td className="py-2 text-ink-900">{o.customer.name}</td>
                  <td className="py-2 text-ink-700">{label(o.status)}</td>
                  <td className="py-2 text-right font-medium text-ink-900">{formatGhs(o.totalAmount)}</td>
                  <td className="py-2 pl-3 text-ink-700">{o.salesOfficer.firstName} {o.salesOfficer.lastName}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recent.length === 0 && <p className="py-6 text-center text-sm text-ink-500">No orders yet.</p>}
        </div>
      </div>
    </div>
  );
}
