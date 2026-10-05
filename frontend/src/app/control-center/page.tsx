'use client';

import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { ControlCenter, hasControlCenter } from '@/components/ControlCenter';

export default function ControlCenterPage() {
  const { me, accessToken, loading, error } = useCurrentUser();
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading...</p></main>;
  if (error || !me || !accessToken) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;
  return (
    <DashboardShell me={me}>
      {hasControlCenter(me) ? <ControlCenter accessToken={accessToken} me={me} /> : <p className="rounded-2xl bg-white px-5 py-4 text-sm text-ink-500" data-testid="no-control-center">Your role does not have a control center.</p>}
    </DashboardShell>
  );
}
