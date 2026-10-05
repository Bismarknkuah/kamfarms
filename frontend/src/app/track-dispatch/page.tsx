'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { DispatchTracker } from '@/components/tracking/DispatchTracker';

export default function TrackDispatchPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  // Arriving from a search result: that dispatch is opened.
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => { setFocus(new URLSearchParams(window.location.search).get('ref')); }, []);
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading...</p></main>;
  if (error || !me || !accessToken) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;
  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Track dispatch</h1>
      <p className="mt-1 text-sm text-ink-500">Where every dispatch is, who handled it and when, and the day it was supposed to arrive.</p>
      <div className="mt-6"><DispatchTracker accessToken={accessToken} hasPermission={hasPermission} focusRef={focus} /></div>
    </DashboardShell>
  );
}
