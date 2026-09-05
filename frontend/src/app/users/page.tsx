'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { usersApi, tasksApi, AppUser, DirectoryUser, ApiError } from '@/lib/api-client';

export default function UsersPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [directory, setDirectory] = useState<DirectoryUser[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  const isAdmin = hasPermission('users.manage');

  useEffect(() => {
    if (!accessToken) return;
    usersApi
      .list(accessToken)
      .then((res) => {
        setUsers(res.items);
        // MD, CEO, and anyone else who can assign tasks but isn't a
        // scoped line manager (Farm Supervisor, Warehouse Supervisor,
        // Operations Manager already see their own team above) would
        // otherwise have tasks.assign with nobody to actually assign
        // to — the scoped team list is correctly empty for them, not
        // broken, but that leaves the permission unusable. Falls back
        // to the same broad directory built for messaging, so
        // "management" can genuinely assign work to anyone, e.g. a
        // Farm Supervisor.
        if (res.items.length === 0 && !isAdmin && hasPermission('tasks.assign')) {
          usersApi.directory(accessToken).then(setDirectory).catch(() => {});
        }
      })
      .catch((err: unknown) => setUsersError(err instanceof ApiError ? err.message : 'Failed to load users.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const onAssignTask = async (userId: string) => {
    if (!accessToken || !taskTitle.trim()) return;
    setAssigning(true);
    setUsersError(null);
    try {
      await tasksApi.create(accessToken, {
        title: taskTitle,
        assignedToId: userId,
        dueDate: taskDueDate || undefined,
      });
      setAssigningId(null);
      setTaskTitle('');
      setTaskDueDate('');
      setAssignSuccess(userId);
      setTimeout(() => setAssignSuccess(null), 3000);
    } catch (err) {
      setUsersError(err instanceof ApiError ? err.message : 'Failed to assign task.');
    } finally {
      setAssigning(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  if (!isAdmin && !hasPermission('tasks.assign')) {
    return (
      <DashboardShell me={me}>
        <p className="text-sm text-ink-700">You don&rsquo;t have permission to view this page.</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">{isAdmin ? 'Users' : 'My team'}</h1>
      <p className="mt-1 text-sm text-ink-500">
        {users
          ? isAdmin
            ? `${users.length} accounts`
            : `${users.length} ${users.length === 1 ? 'person reports' : 'people report'} to you — assign them a task directly.`
          : 'Loading…'}
      </p>

      {usersError && <p className="mt-4 text-sm text-red-600">{usersError}</p>}

      {users && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Roles</th>
                <th className="px-5 py-3">Status</th>
                {hasPermission('tasks.assign') && <th className="px-5 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-paddy-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-3 text-ink-900">{u.firstName} {u.lastName}</td>
                  <td className="px-5 py-3 text-ink-500">{u.email}</td>
                  <td className="px-5 py-3 text-ink-500">{u.roles.map((r) => r.role.code).join(', ') || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${u.status === 'ACTIVE' ? 'bg-paddy-100 text-paddy-700' : 'bg-ink-500/10 text-ink-500'}`}>
                      {u.status}
                    </span>
                  </td>
                  {hasPermission('tasks.assign') && (
                    <td className="px-5 py-3">
                      {assignSuccess === u.id ? (
                        <span className="text-xs font-medium text-paddy-700">Task assigned ✓</span>
                      ) : assigningId === u.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            value={taskTitle}
                            onChange={(e) => setTaskTitle(e.target.value)}
                            placeholder="Task title…"
                            className="w-40 rounded-lg border border-paddy-100 px-2 py-1 text-xs"
                          />
                          <input
                            type="date"
                            value={taskDueDate}
                            onChange={(e) => setTaskDueDate(e.target.value)}
                            className="rounded-lg border border-paddy-100 px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => onAssignTask(u.id)}
                            disabled={assigning || !taskTitle.trim()}
                            className="rounded-full bg-paddy-900 px-3 py-1 text-xs font-medium text-rice-50 disabled:opacity-50"
                          >
                            {assigning ? 'Assigning…' : 'Assign'}
                          </button>
                          <button type="button" onClick={() => { setAssigningId(null); setTaskTitle(''); }} className="text-xs text-ink-500">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAssigningId(u.id)}
                          className="rounded-full border border-husk-500 px-3 py-1 text-xs font-medium text-paddy-900 hover:bg-husk-500 hover:text-white"
                        >
                          Assign task
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-ink-500">
                    {isAdmin ? 'No users yet.' : 'No one directly reports to you — see everyone below instead.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {directory && directory.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">
            Assign a task to anyone in the company
          </p>
          <div className="overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paddy-100">
                {directory.filter((u) => u.id !== me.id).map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-3 text-ink-900">{u.firstName} {u.lastName}</td>
                    <td className="px-5 py-3 text-ink-500">{u.roleName ?? '—'}</td>
                    <td className="px-5 py-3">
                      {assignSuccess === u.id ? (
                        <span className="text-xs font-medium text-paddy-700">Task assigned ✓</span>
                      ) : assigningId === u.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            value={taskTitle}
                            onChange={(e) => setTaskTitle(e.target.value)}
                            placeholder="Task title…"
                            className="w-40 rounded-lg border border-paddy-100 px-2 py-1 text-xs"
                          />
                          <input
                            type="date"
                            value={taskDueDate}
                            onChange={(e) => setTaskDueDate(e.target.value)}
                            className="rounded-lg border border-paddy-100 px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => onAssignTask(u.id)}
                            disabled={assigning || !taskTitle.trim()}
                            className="rounded-full bg-paddy-900 px-3 py-1 text-xs font-medium text-rice-50 disabled:opacity-50"
                          >
                            {assigning ? 'Assigning…' : 'Assign'}
                          </button>
                          <button type="button" onClick={() => { setAssigningId(null); setTaskTitle(''); }} className="text-xs text-ink-500">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAssigningId(u.id)}
                          className="rounded-full border border-husk-500 px-3 py-1 text-xs font-medium text-paddy-900 hover:bg-husk-500 hover:text-white"
                        >
                          Assign task
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
