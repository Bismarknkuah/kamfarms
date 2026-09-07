'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { usersApi, tasksApi, rolesApi, AppUser, DirectoryUser, Role, ApiError } from '@/lib/api-client';

/** A genuinely random, readable temporary password - not left to the
 * admin to think one up. Avoids visually ambiguous characters (0/O,
 * 1/l/I) since this needs to be read aloud or typed from a screenshot
 * by someone who didn't choose it themselves. */
function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

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

  // Editing or deactivating a team member - real actions now, not just
  // viewing the list. Available to Admin (any account) and to
  // team.manage holders (their own subordinates only - enforced
  // server-side, this is just the matching UI).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Creating a new user, with an auto-generated temporary password -
  // a real, confirmed gap this closes: there was previously no way to
  // create a user from the UI at all, despite the backend fully
  // supporting it.
  const [roles, setRoles] = useState<Role[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRoleCode, setNewRoleCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const isAdmin = hasPermission('users.manage');
  const canManageTeam = hasPermission('team.manage');
  // Mirrors the backend's own TEAM_VISIBILITY mapping for just these
  // two roles - purely a frontend convenience so a team manager isn't
  // offered role choices the backend would reject anyway; the real
  // enforcement lives entirely server-side regardless of what this
  // shows. Admin still sees the full role picker via rolesApi, which
  // only Admin can actually call (roles.manage-gated).
  const myRoleCodes = me?.roles.map((r) => r.code) ?? [];
  const fixedSubordinateRole = myRoleCodes.includes('FARM_DIRECTOR')
    ? 'FARM_MANAGER'
    : myRoleCodes.includes('WAREHOUSE_SUPERVISOR')
      ? 'WAREHOUSE_MANAGER'
      : myRoleCodes.includes('OPERATIONS_MANAGER')
        ? 'OPERATIONS_OFFICER'
        : null;

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
        // to - the scoped team list is correctly empty for them, not
        // broken, but that leaves the permission unusable. Falls back
        // to the same broad directory built for messaging, so
        // "management" can genuinely assign work to anyone, e.g. a
        // Farm Supervisor.
        if (res.items.length === 0 && !isAdmin && hasPermission('tasks.assign')) {
          usersApi.directory(accessToken).then(setDirectory).catch(() => {});
        }
      })
      .catch((err: unknown) => setUsersError(err instanceof ApiError ? err.message : 'Failed to load users.'));
    if (isAdmin) rolesApi.list(accessToken).then(setRoles).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const onCreateUser = async () => {
    if (!accessToken || !newFirstName.trim() || !newLastName.trim() || !newEmail.trim()) return;
    setCreating(true);
    setCreateError(null);
    const temporaryPassword = generateTemporaryPassword();
    try {
      await usersApi.create(accessToken, {
        firstName: newFirstName.trim(),
        lastName: newLastName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim() || undefined,
        temporaryPassword,
        roleCodes: isAdmin ? (newRoleCode ? [newRoleCode] : undefined) : fixedSubordinateRole ? [fixedSubordinateRole] : undefined,
      });
      setCreatedCredentials({ email: newEmail.trim(), password: temporaryPassword });
      setShowCreate(false);
      setNewFirstName(''); setNewLastName(''); setNewEmail(''); setNewPhone(''); setNewRoleCode('');
      usersApi.list(accessToken).then((res) => setUsers(res.items)).catch(() => {});
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create user.');
    } finally {
      setCreating(false);
    }
  };

  const onCopyCredentials = () => {
    if (!createdCredentials) return;
    navigator.clipboard.writeText(`Email: ${createdCredentials.email}\nTemporary password: ${createdCredentials.password}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const onStartEdit = (u: AppUser) => {
    setEditingId(u.id);
    setEditFirstName(u.firstName);
    setEditLastName(u.lastName);
    setEditPhone(u.phone ?? '');
    setEditError(null);
  };

  const onSaveEdit = async (userId: string) => {
    if (!accessToken || !editFirstName.trim() || !editLastName.trim()) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await usersApi.update(accessToken, userId, {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        phone: editPhone.trim() || undefined,
      });
      setEditingId(null);
      usersApi.list(accessToken).then((res) => setUsers(res.items)).catch(() => {});
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Failed to save changes.');
    } finally {
      setSavingEdit(false);
    }
  };

  const onToggleStatus = async (u: AppUser) => {
    if (!accessToken) return;
    setEditError(null);
    try {
      await usersApi.update(accessToken, u.id, { status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' });
      usersApi.list(accessToken).then((res) => setUsers(res.items)).catch(() => {});
    } catch (err) {
      setUsersError(err instanceof ApiError ? err.message : 'Failed to update status.');
    }
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-paddy-900">{isAdmin ? 'Users' : 'My team'}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {users
              ? isAdmin
                ? `${users.length} accounts`
                : `${users.length} ${users.length === 1 ? 'person reports' : 'people report'} to you - assign them a task directly.`
              : 'Loading…'}
          </p>
        </div>
        {(isAdmin || canManageTeam) && (
          <button type="button" onClick={() => setShowCreate((v) => !v)} className="rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50">
            + New user
          </button>
        )}
      </div>

      {createdCredentials && (
        <div className="mt-4 rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-5">
          <h2 className="font-display text-base text-paddy-900">Account created - share these with them now</h2>
          <p className="mt-1 text-xs text-ink-500">This password won&rsquo;t be shown again. They&rsquo;ll be required to choose their own on first login.</p>
          <div className="mt-3 space-y-1 rounded-lg bg-white px-4 py-3 font-mono text-sm">
            <p><span className="text-ink-500">Email:</span> {createdCredentials.email}</p>
            <p><span className="text-ink-500">Temporary password:</span> {createdCredentials.password}</p>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={onCopyCredentials} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50">
              {copied ? 'Copied ✓' : 'Copy to clipboard'}
            </button>
            <button type="button" onClick={() => setCreatedCredentials(null)} className="text-xs text-ink-500">Dismiss</button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="mt-4 rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-5">
          <h2 className="font-display text-base text-paddy-900">New user</h2>
          <p className="mt-1 text-xs text-ink-500">A temporary password is generated automatically - you&rsquo;ll see it once, right after creating the account.</p>
          {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} placeholder="First name" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input value={newLastName} onChange={(e) => setNewLastName(e.target.value)} placeholder="Last name" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email" type="email" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone (optional)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            {isAdmin ? (
              <select value={newRoleCode} onChange={(e) => setNewRoleCode(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm sm:col-span-2">
                <option value="">No role yet (assign later)</option>
                {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
            ) : (
              <p className="flex items-center rounded-lg bg-rice-50 px-3 py-2 text-sm text-ink-500 sm:col-span-2">
                Role: <span className="ml-1 font-medium text-ink-900">{fixedSubordinateRole}</span> - the only role you can add to your team.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCreateUser}
            disabled={creating || !newFirstName.trim() || !newLastName.trim() || !newEmail.trim()}
            className="mt-3 rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create user'}
          </button>
        </div>
      )}

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
                {(hasPermission('tasks.assign') || isAdmin || canManageTeam) && <th className="px-5 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-paddy-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-3 text-ink-900">{u.firstName} {u.lastName}</td>
                  <td className="px-5 py-3 text-ink-500">{u.email}</td>
                  <td className="px-5 py-3 text-ink-500">{u.roles.map((r) => r.role.code).join(', ') || ' - '}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${u.status === 'ACTIVE' ? 'bg-paddy-100 text-paddy-700' : 'bg-ink-500/10 text-ink-500'}`}>
                      {u.status}
                    </span>
                  </td>
                  {(hasPermission('tasks.assign') || isAdmin || canManageTeam) && (
                    <td className="px-5 py-3">
                      {editingId === u.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {editError && <p className="w-full text-xs text-red-600">{editError}</p>}
                          <input value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} placeholder="First name" className="w-24 rounded-lg border border-paddy-100 px-2 py-1 text-xs" />
                          <input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} placeholder="Last name" className="w-24 rounded-lg border border-paddy-100 px-2 py-1 text-xs" />
                          <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone" className="w-28 rounded-lg border border-paddy-100 px-2 py-1 text-xs" />
                          <button type="button" onClick={() => onSaveEdit(u.id)} disabled={savingEdit || !editFirstName.trim() || !editLastName.trim()} className="rounded-full bg-paddy-900 px-3 py-1 text-xs font-medium text-rice-50 disabled:opacity-50">
                            {savingEdit ? 'Saving…' : 'Save'}
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-xs text-ink-500">Cancel</button>
                        </div>
                      ) : assignSuccess === u.id ? (
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
                        <div className="flex flex-wrap gap-2">
                          {hasPermission('tasks.assign') && (
                            <button
                              type="button"
                              onClick={() => setAssigningId(u.id)}
                              className="rounded-full border border-husk-500 px-3 py-1 text-xs font-medium text-paddy-900 hover:bg-husk-500 hover:text-white"
                            >
                              Assign task
                            </button>
                          )}
                          {(isAdmin || canManageTeam) && u.id !== me.id && (
                            <>
                              <button type="button" onClick={() => onStartEdit(u)} className="rounded-full border border-paddy-100 px-3 py-1 text-xs font-medium text-ink-700 hover:bg-rice-50">
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => onToggleStatus(u)}
                                className={`rounded-full px-3 py-1 text-xs font-medium ${u.status === 'ACTIVE' ? 'border border-red-200 text-red-600 hover:bg-red-50' : 'border border-paddy-100 text-paddy-700 hover:bg-rice-50'}`}
                              >
                                {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-ink-500">
                    {isAdmin ? 'No users yet.' : 'No one directly reports to you - see everyone below instead.'}
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
                    <td className="px-5 py-3 text-ink-500">{u.roleName ?? ' - '}</td>
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
