'use client';

import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { DeliveryQuickAction } from '@/components/OfficeActions';

export default function DispatchQuickPage() {
  const { me, accessToken, loading, error } = useCurrentUser();

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me || !accessToken) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <DeliveryQuickAction accessToken={accessToken} />
    </DashboardShell>
  );
}
