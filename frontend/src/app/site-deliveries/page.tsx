'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { DeliveriesDesk } from '@/components/deliveries/DeliveriesDesk';

export default function SiteDeliveriesPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  // Arriving from a notification or from a paddy request: that delivery is highlighted, or the send form is filled in for that request.
  const [focus, setFocus] = useState<string | null>(null);
  const [sendFor, setSendFor] = useState<string | null>(null);
  useEffect(() => { const q = new URLSearchParams(window.location.search); setFocus(q.get('transfer')); setSendFor(q.get('send')); }, []);
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading...</p></main>;
  if (error || !me || !accessToken) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;
  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Deliveries</h1>
      <p className="mt-1 text-sm text-ink-500">Paddy coming to you from another warehouse, and the paddy you send out.</p>
      <div className="mt-6"><DeliveriesDesk accessToken={accessToken} hasPermission={hasPermission} focusTransfer={focus} sendFor={sendFor} /></div>
    </DashboardShell>
  );
}
