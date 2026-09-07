'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { backupApi, systemResetApi, ResetRequest, ApiError } from '@/lib/api-client';

const TABS = ['Backups', 'System reset'] as const;
const RESET_TYPES = ['CLEAR_TEST_DATA', 'RESET_INVENTORY', 'RESET_TRANSACTIONS', 'RESET_MODULE', 'RESET_DATE_RANGE', 'FULL_OPERATIONAL_RESET', 'OTHER'] as const;
// Only these tables can actually be executed once fully approved -
// confirmed directly against the backend's own allowlist, not assumed.
// Other affected-table names can still be entered on the request
// itself (the backend accepts a broader description of scope at
// request time), but execution will be refused for anything outside
// this list.
const EXECUTABLE_TABLES = ['InventoryTransaction', 'InventoryBalance'];

export default function AdminPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Backups');
  const [backupStatus, setBackupStatus] = useState<{
    lastSuccess: { completedAt: string | null } | null;
    lastFailure: { completedAt: string | null } | null;
    currentlyRunning: unknown;
  } | null>(null);
  const [resetRequests, setResetRequests] = useState<ResetRequest[] | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [showNewReset, setShowNewReset] = useState(false);
  const [newResetType, setNewResetType] = useState<(typeof RESET_TYPES)[number]>('CLEAR_TEST_DATA');
  const [newScope, setNewScope] = useState('');
  const [newTables, setNewTables] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newImpact, setNewImpact] = useState('');
  const [saving, setSaving] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);

  const loadResetRequests = (token: string) => {
    systemResetApi
      .list(token)
      .then(setResetRequests)
      .catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load reset requests.'));
  };

  const onCreateReset = async () => {
    if (!accessToken || !newScope.trim() || !newReason.trim() || !newImpact.trim() || !newTables.trim()) return;
    setSaving(true);
    setPageError(null);
    try {
      await systemResetApi.create(accessToken, {
        resetType: newResetType,
        scope: newScope.trim(),
        affectedTables: newTables.split(',').map((t) => t.trim()).filter(Boolean),
        reason: newReason.trim(),
        impactDescription: newImpact.trim(),
      });
      setShowNewReset(false);
      setNewScope(''); setNewTables(''); setNewReason(''); setNewImpact('');
      loadResetRequests(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to create the reset request.');
    } finally {
      setSaving(false);
    }
  };

  const onExecuteReset = async (id: string) => {
    if (!accessToken) return;
    setExecutingId(id);
    setPageError(null);
    try {
      await systemResetApi.execute(accessToken, id);
      loadResetRequests(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to execute this reset.');
    } finally {
      setExecutingId(null);
    }
  };

  useEffect(() => {
    if (!accessToken || !me) return;
    if (hasPermission('backup.manage')) {
      backupApi.status(accessToken).then(setBackupStatus).catch(() => {});
    }
    loadResetRequests(accessToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, me]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Admin</h1>

      <div className="mt-4 flex gap-1 border-b border-paddy-100">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-husk-500 text-paddy-900' : 'text-ink-500'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {tab === 'Backups' && (
        hasPermission('backup.manage') ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-paddy-100 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Last successful backup</p>
              <p className="mt-2 font-display text-lg text-paddy-900">
                {backupStatus?.lastSuccess?.completedAt ? new Date(backupStatus.lastSuccess.completedAt).toLocaleString() : 'None recorded'}
              </p>
            </div>
            <div className="rounded-2xl border border-paddy-100 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Last failed backup</p>
              <p className="mt-2 font-display text-lg text-paddy-900">
                {backupStatus?.lastFailure?.completedAt ? new Date(backupStatus.lastFailure.completedAt).toLocaleString() : 'None recorded'}
              </p>
            </div>
            <p className="text-xs text-ink-500 sm:col-span-2">
              This tracks backup status - it doesn&rsquo;t run pg_dump itself. A scheduled job calls this after
              actually performing a backup.
            </p>
          </div>
        ) : (
          <p className="mt-6 text-sm text-ink-500">You don&rsquo;t have permission to view backup status.</p>
        )
      )}

      {tab === 'System reset' && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-500">
              Requires both the Finance Director and Managing Director to approve before Admin can execute.
              Execution is restricted to a safe, narrow table allowlist - see docs/RESET_WORKFLOW.md.
            </p>
            {hasPermission('reset.request') && (
              <button
                type="button"
                onClick={() => setShowNewReset((v) => !v)}
                className="whitespace-nowrap rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50"
              >
                + Request a reset
              </button>
            )}
          </div>

          {showNewReset && (
            <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-5">
              <h3 className="font-display text-base text-paddy-900">New reset request</h3>
              <div className="mt-3 space-y-2">
                <select value={newResetType} onChange={(e) => setNewResetType(e.target.value as (typeof RESET_TYPES)[number])} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                  {RESET_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
                <input value={newScope} onChange={(e) => setNewScope(e.target.value)} placeholder="Scope - what this affects, in plain language" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                <div>
                  <input value={newTables} onChange={(e) => setNewTables(e.target.value)} placeholder="Affected tables, comma-separated" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                  <p className="mt-1 text-xs text-ink-500">Only {EXECUTABLE_TABLES.join(' and ')} can actually be executed once approved - other names can be recorded here but execution will be refused.</p>
                </div>
                <textarea value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="Reason for this reset" rows={2} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                <textarea value={newImpact} onChange={(e) => setNewImpact(e.target.value)} placeholder="Impact description - what data will actually be lost or changed" rows={2} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                <button
                  type="button"
                  onClick={onCreateReset}
                  disabled={saving || !newScope.trim() || !newTables.trim() || !newReason.trim() || !newImpact.trim()}
                  className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50"
                >
                  {saving ? 'Submitting…' : 'Submit request'}
                </button>
              </div>
            </div>
          )}

          {resetRequests?.map((req) => (
            <div key={req.id} className="rounded-2xl border border-paddy-100 bg-white p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-xs text-ink-500">{req.requestNumber}</p>
                  <h3 className="mt-0.5 font-display text-lg text-paddy-900">{req.scope}</h3>
                  <p className="mt-1 text-sm text-ink-500">{req.reason}</p>
                  <p className="mt-1 text-xs text-ink-500">Requested by {req.requestedBy.firstName} {req.requestedBy.lastName}</p>
                </div>
                <span className="whitespace-nowrap rounded-full bg-husk-300 px-3 py-1 text-xs font-medium text-soil-700">{req.status}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-paddy-100 pt-3">
                <div className="flex gap-4 text-xs text-ink-500">
                  <span>Finance: {req.financeApprovedBy ? `✓ ${req.financeApprovedBy.firstName}` : 'Pending'}</span>
                  <span>MD: {req.mdApprovedBy ? `✓ ${req.mdApprovedBy.firstName}` : 'Pending'}</span>
                </div>
                {/* Approving happens on the MD/CEO dashboard or Finance
                    Director's My Office page, not here - Admin requests
                    and executes but never holds reset.approve itself,
                    so this page never needs an approve button, only
                    execute once fully approved. */}
                {req.status === 'APPROVED' && hasPermission('reset.execute') && (
                  <button
                    type="button"
                    onClick={() => onExecuteReset(req.id)}
                    disabled={executingId === req.id}
                    className="rounded-full bg-soil-700 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50"
                  >
                    {executingId === req.id ? 'Executing…' : 'Execute reset'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {resetRequests?.length === 0 && (
            <div className="rounded-2xl border border-paddy-100 bg-white p-8 text-center text-sm text-ink-500">
              No reset requests.
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
