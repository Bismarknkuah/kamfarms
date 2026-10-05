'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { MillDispatchDesk } from '@/components/mill/MillDispatchDesk';

export default function MillDispatchPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => { setFocus(new URLSearchParams(window.location.search).get('dispatch')); }, []);
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading...</p></main>;
  if (error || !me || !accessToken) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;
  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Mill dispatch</h1>
      <p className="mt-1 text-sm text-ink-500">Paddy goes from the warehouse to the milling center; finished products come back. Each needs the supervisor&rsquo;s approval and is counted in at the other end.</p>
      <div className="mt-6"><MillDispatchDesk accessToken={accessToken} hasPermission={hasPermission} focusId={focus} /></div>
    </DashboardShell>
  );
}
