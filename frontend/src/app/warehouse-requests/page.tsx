'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { SupplyDesk } from '@/components/supply/SupplyDesk';
import { PaddyRequestApprovalQueue } from '@/components/OfficeActions';

export default function PaddyRequestsPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  // Arriving from a task or a notification: that request is highlighted.
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => { setFocus(new URLSearchParams(window.location.search).get('request')); }, []);
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading...</p></main>;
  if (error || !me || !accessToken) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;
  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Paddy requests</h1>
      <p className="mt-1 text-sm text-ink-500">Ask for paddy, send a request on, and see where the paddy is.</p>
      <div className="mt-6"><SupplyDesk accessToken={accessToken} me={me} hasPermission={hasPermission} variant="page" focusNumber={focus} /></div>
      {hasPermission('delivery.approve') && (
        <details className="mt-10" data-testid="older-requests">
          <summary className="cursor-pointer text-sm font-medium text-paddy-700">Older requests (made before paddy requests went through the Warehouse Supervisor)</summary>
          <div className="mt-4"><PaddyRequestApprovalQueue accessToken={accessToken} /></div>
        </details>
      )}
    </DashboardShell>
  );
}
