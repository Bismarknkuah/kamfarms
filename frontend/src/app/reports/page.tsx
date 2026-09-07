'use client';

import { useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { reportsApi, ApiError } from '@/lib/api-client';

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';
type Format = 'csv' | 'xlsx' | 'pdf';

function periodToRange(period: Period): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now);
  if (period === 'daily') from.setDate(from.getDate() - 1);
  if (period === 'weekly') from.setDate(from.getDate() - 7);
  if (period === 'monthly') from.setMonth(from.getMonth() - 1);
  if (period === 'yearly') from.setFullYear(from.getFullYear() - 1);
  return { from: from.toISOString().slice(0, 10), to };
}

const PERIODS: { value: Period; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const FORMATS: { value: Format; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'pdf', label: 'PDF' },
];

/** One report type this person's role actually covers - each card
 * only ever renders if the person genuinely has the underlying
 * permission, matching what the backend itself would allow them to
 * download; this isn't just a display choice layered on top. */
function ReportCard({
  title,
  description,
  onDownload,
}: {
  title: string;
  description: string;
  onDownload: (format: Format) => Promise<void>;
}) {
  const [busy, setBusy] = useState<Format | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  const handle = async (format: Format) => {
    setBusy(format);
    setCardError(null);
    try {
      await onDownload(format);
    } catch (err) {
      setCardError(err instanceof ApiError ? err.message : 'Failed to download.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-paddy-100 bg-white p-6">
      <h2 className="font-display text-lg text-paddy-900">{title}</h2>
      <p className="mt-1 text-sm text-ink-500">{description}</p>
      {cardError && <p className="mt-2 text-sm text-red-600">{cardError}</p>}
      <div className="mt-4 flex gap-2">
        {FORMATS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => handle(f.value)}
            disabled={busy !== null}
            className="rounded-full border border-paddy-100 px-5 py-2 text-sm font-medium text-ink-700 disabled:opacity-50"
          >
            {busy === f.value ? 'Downloading…' : f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [period, setPeriod] = useState<Period>('monthly');

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me || !accessToken) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  const { from, to } = periodToRange(period);

  const canFarm = hasPermission('farm.view');
  const canWarehouse = hasPermission('warehouse.view');
  const canSales = hasPermission('sales.view') || hasPermission('sales.create') || hasPermission('finance.view');
  const canFinance = hasPermission('finance.view');
  // Inventory-by-location is scoped server-side to this person's own
  // farm(s)/warehouse(s) already (confirmed directly against the
  // backend) - broadly useful to show whenever reports.view is held,
  // since what comes back is never more than they're entitled to see.
  const canInventory = hasPermission('reports.view');

  const noReportsAvailable = !canFarm && !canWarehouse && !canSales && !canFinance && !canInventory;

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Reports</h1>
      <p className="mt-1 text-sm text-ink-500">
        Only the reports your role actually covers - each one downloads exactly the data you already have access to, nothing more.
      </p>

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-paddy-100 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Period for date-ranged reports</p>
        <div className="ml-auto flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${period === p.value ? 'bg-paddy-900 text-rice-50' : 'bg-rice-50 text-ink-700'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {noReportsAvailable && (
        <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-8 text-center text-sm text-ink-500">
          No report types are available for your role yet.
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {canFarm && (
          <ReportCard
            title="Farm intake report"
            description="Paddy intake for the period you choose, by farm."
            onDownload={(format) => reportsApi.downloadFarmReport(accessToken, { from, to, format })}
          />
        )}
        {canWarehouse && (
          <ReportCard
            title="Warehouse report"
            description="Current stock and activity at your warehouse(s)."
            onDownload={(format) => reportsApi.downloadWarehouseReport(accessToken, format)}
          />
        )}
        {canSales && (
          <ReportCard
            title="Sales report"
            description="Orders fulfilled for the period you choose, by salesperson and product."
            onDownload={(format) => reportsApi.downloadSalesReport(accessToken, format, { from, to })}
          />
        )}
        {canFinance && (
          <ReportCard
            title="Finance report"
            description="Revenue, verified payments, expenses by category, and estimated profit for the period you choose."
            onDownload={(format) => reportsApi.downloadFinanceReport(accessToken, format, { from, to })}
          />
        )}
        {canInventory && (
          <ReportCard
            title="Inventory by location"
            description="Every farm, warehouse, and milling center's current stock, in one table."
            onDownload={(format) => reportsApi.downloadInventory(accessToken, format)}
          />
        )}
      </div>
    </DashboardShell>
  );
}
