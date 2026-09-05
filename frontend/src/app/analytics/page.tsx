'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { analyticsApi, ExecutiveAnalytics, ApiError } from '@/lib/api-client';

function monthLabel(key: string) {
  const [year, month] = key.split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}

function fmtGHS(n: number) {
  return `GHS ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export default function AnalyticsPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [data, setData] = useState<ExecutiveAnalytics | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    analyticsApi.get(accessToken).then(setData).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load analytics.'));
  }, [accessToken]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  if (!hasPermission('finance.view')) {
    return (
      <DashboardShell me={me}>
        <p className="text-sm text-ink-700">You don&rsquo;t have permission to view this page.</p>
      </DashboardShell>
    );
  }

  const trendData = data?.monthlySales.map((s, i) => ({
    month: monthLabel(s.month),
    Sales: s.amount,
    Expenses: data.monthlyExpenses[i]?.amount ?? 0,
    Profit: s.amount - (data.monthlyExpenses[i]?.amount ?? 0),
  }));

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Analytics</h1>
      <p className="mt-1 text-sm text-ink-500">Six-month trends and comparisons — not just where things stand today, but where they&rsquo;ve been heading.</p>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {data && (
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl border border-paddy-100 bg-white p-5">
            <h2 className="font-display text-lg text-paddy-900">Sales vs. expenses, last 6 months</h2>
            <div className="mt-4" style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EDE6D6" />
                  <XAxis dataKey="month" stroke="#8A7B62" fontSize={12} />
                  <YAxis stroke="#8A7B62" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => fmtGHS(value)} contentStyle={{ borderRadius: 8, border: '1px solid #EDE6D6' }} />
                  <Legend />
                  <Line type="monotone" dataKey="Sales" stroke="#132C1A" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Expenses" stroke="#C9982F" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Profit" stroke="#6B4F3B" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-paddy-100 bg-white p-5">
              <h2 className="font-display text-lg text-paddy-900">Sales by product</h2>
              <p className="text-xs text-ink-500">Which products are actually driving revenue.</p>
              <div className="mt-4" style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={data.salesByProduct}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EDE6D6" />
                    <XAxis dataKey="product" stroke="#8A7B62" fontSize={12} />
                    <YAxis stroke="#8A7B62" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: number) => fmtGHS(value)} contentStyle={{ borderRadius: 8, border: '1px solid #EDE6D6' }} />
                    <Bar dataKey="amount" fill="#132C1A" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {data.salesByProduct.length === 0 && <p className="mt-2 text-sm text-ink-500">No fulfilled sales in the last 6 months yet.</p>}
            </div>

            <div className="rounded-2xl border border-paddy-100 bg-white p-5">
              <h2 className="font-display text-lg text-paddy-900">Paddy intake by farm</h2>
              <p className="text-xs text-ink-500">Comparing farm performance side by side.</p>
              <div className="mt-4" style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={data.paddyByFarm}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EDE6D6" />
                    <XAxis dataKey="farm" stroke="#8A7B62" fontSize={12} />
                    <YAxis stroke="#8A7B62" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: number) => `${value.toLocaleString()} KG`} contentStyle={{ borderRadius: 8, border: '1px solid #EDE6D6' }} />
                    <Bar dataKey="kg" fill="#C9982F" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {data.paddyByFarm.length === 0 && <p className="mt-2 text-sm text-ink-500">No approved paddy entries in the last 6 months yet.</p>}
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
