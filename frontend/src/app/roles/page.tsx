'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { rolesApi, permissionsApi, Role, Permission, ApiError } from '@/lib/api-client';

export default function RolesPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [permissionsByModule, setPermissionsByModule] = useState<Record<string, Permission[]>>({});
  const [pageError, setPageError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [editedCodes, setEditedCodes] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadRoles = (token: string) => {
    rolesApi.list(token).then(setRoles).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load roles.'));
  };

  useEffect(() => {
    if (!accessToken) return;
    loadRoles(accessToken);
    permissionsApi.listGrouped(accessToken).then(setPermissionsByModule).catch(() => {});
  }, [accessToken]);

  const selectRole = (role: Role) => {
    setSelectedRole(role);
    setEditedCodes(new Set(role.permissions.map((p) => p.permission.code)));
    setSaved(false);
  };

  const toggleCode = (code: string) => {
    setEditedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const onSave = async () => {
    if (!accessToken || !selectedRole) return;
    setSaving(true);
    setPageError(null);
    try {
      const updated = await rolesApi.updatePermissions(accessToken, selectedRole.code, Array.from(editedCodes));
      setSaved(true);
      loadRoles(accessToken);
      setSelectedRole(updated);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to update permissions.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  if (!hasPermission('roles.manage')) {
    return (
      <DashboardShell me={me}>
        <p className="text-sm text-ink-700">You don&rsquo;t have permission to view this page.</p>
      </DashboardShell>
    );
  }

  const canEditPermissions = hasPermission('permissions.manage');

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Roles &amp; Permissions</h1>
      <p className="mt-1 text-sm text-ink-500">
        {roles ? `${roles.length} roles` : 'Loading…'} — every role and exactly what it can do. This is real system
        access control, not a settings toy: changes here take effect immediately for everyone with that role.
      </p>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-1">
          {roles?.map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => selectRole(r)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                selectedRole?.code === r.code ? 'border-husk-500 bg-husk-100/30' : 'border-paddy-100 bg-white hover:border-husk-300'
              }`}
            >
              <div>
                <p className="font-medium text-ink-900">{r.name}</p>
                <p className="font-mono text-xs text-ink-500">{r.code}</p>
              </div>
              <span className="text-xs text-ink-500">{r.permissions.length}</span>
            </button>
          ))}
        </div>

        <div>
          {!selectedRole ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-paddy-100 bg-white text-sm text-ink-500">
              Select a role to see and edit its permissions.
            </div>
          ) : (
            <div className="rounded-2xl border border-paddy-100 bg-white p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display text-lg text-paddy-900">{selectedRole.name}</h2>
                  <p className="font-mono text-xs text-ink-500">{selectedRole.code}</p>
                  {selectedRole.isSystemRole && (
                    <p className="mt-1 text-xs text-soil-500">Built-in role — permissions can be adjusted, but it can&rsquo;t be deleted.</p>
                  )}
                </div>
                {canEditPermissions && (
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={saving}
                    className="rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                )}
              </div>
              {saved && <p className="mt-2 text-sm font-medium text-paddy-700">Permissions updated ✓</p>}

              <div className="mt-5 space-y-5">
                {Object.entries(permissionsByModule).map(([module, perms]) => (
                  <div key={module}>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">{module}</p>
                    <div className="flex flex-wrap gap-2">
                      {perms.map((p) => {
                        const checked = editedCodes.has(p.code);
                        return (
                          <label
                            key={p.code}
                            className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                              checked ? 'border-paddy-500 bg-paddy-100 text-paddy-900' : 'border-paddy-100 text-ink-500'
                            } ${!canEditPermissions ? 'cursor-not-allowed opacity-70' : ''}`}
                            title={p.description}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => canEditPermissions && toggleCode(p.code)}
                              disabled={!canEditPermissions}
                              className="hidden"
                            />
                            {p.code}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
