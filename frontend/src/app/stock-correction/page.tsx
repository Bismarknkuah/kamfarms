'use client';

import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { InventoryAdjustmentRequestAction, InventoryAdjustmentQueue } from '@/components/OfficeActions';

export default function StockCorrectionPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me || !accessToken) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <div className="space-y-6">
        {hasPermission('inventory.adjust') && <InventoryAdjustmentQueue accessToken={accessToken} />}
        {hasPermission('farm.inventory.view') && <InventoryAdjustmentRequestAction accessToken={accessToken} meId={me.id} />}
      </div>
    </DashboardShell>
  );
}
