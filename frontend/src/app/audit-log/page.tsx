'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { auditApi, AuditLogEntry, ApiError } from '@/lib/api-client';

export default function AuditLogPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[] | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    auditApi.list(accessToken).then((res) => setAuditLogs(res.items)).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load audit log.'));
  }, [accessToken]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  if (!hasPermission('audit.view')) {
    return (
      <DashboardShell me={me}>
        <p className="text-sm text-ink-700">You don&rsquo;t have permission to view this page.</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Audit Log</h1>
      <p className="mt-1 text-sm text-ink-500">Every recorded action across the system — who did what, and when.</p>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paddy-100">
            {auditLogs?.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-3 text-xs text-ink-500">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-ink-900">{log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-700">{log.action}</td>
                <td className="px-4 py-3 text-ink-500">{log.entity}{log.entityId ? ` #${log.entityId.slice(0, 8)}` : ''}</td>
              </tr>
            ))}
            {auditLogs?.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-500">No audit entries yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  );
}
