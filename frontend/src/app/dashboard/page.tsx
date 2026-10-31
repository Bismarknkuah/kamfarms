'use client';

import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { Overview } from '@/components/overview/Overview';

/**
 * The Overview. It starts with a greeting and goes straight to the analytics of the person's own area. Every page a
 * person uses is in the side menu, so there are no shortcuts, desks or task strips here.
 */
export default function DashboardPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading your overview…</p></main>;
  }
  if (error || !me || !accessToken) {
    return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error ?? 'Unable to load your session.'}</p></main>;
  }
  return (
    <DashboardShell me={me}>
      <Overview me={me} accessToken={accessToken} hasPermission={hasPermission} />
    </DashboardShell>
  );
}
