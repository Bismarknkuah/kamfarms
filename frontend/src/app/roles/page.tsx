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

  // Editing the role's own name/description - separate from the
  // permission-toggle save above, since it hits a different endpoint
  // and shouldn't be blocked behind "Save changes".
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  // Adding a brand-new role from scratch.
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleCode, setNewRoleCode] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [creatingRole, setCreatingRole] = useState(false);

  // Cloning the currently-selected role as a starting point for a new one.
  const [showCloneRole, setShowCloneRole] = useState(false);
  const [cloneCode, setCloneCode] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);

  const [deletingRole, setDeletingRole] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
    setEditingName(false);
    setConfirmingDelete(false);
  };

  const toggleCode = (code: string) => {
    setEditedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const startEditingName = () => {
    if (!selectedRole) return;
    setNameDraft(selectedRole.name);
    setDescriptionDraft(selectedRole.description ?? '');
    setEditingName(true);
  };

  const onSaveDetails = async () => {
    if (!accessToken || !selectedRole || !nameDraft.trim()) return;
    setSavingDetails(true);
    setPageError(null);
    try {
      const updated = await rolesApi.updateDetails(accessToken, selectedRole.code, { name: nameDraft.trim(), description: descriptionDraft.trim() || undefined });
      setSelectedRole(updated);
      loadRoles(accessToken);
      setEditingName(false);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to rename role.');
    } finally {
      setSavingDetails(false);
    }
  };

  const onCreateRole = async () => {
    if (!accessToken || !newRoleCode.trim() || !newRoleName.trim()) return;
    setCreatingRole(true);
    setPageError(null);
    try {
      const created = await rolesApi.create(accessToken, { code: newRoleCode.trim().toUpperCase().replace(/\s+/g, '_'), name: newRoleName.trim() });
      setNewRoleCode(''); setNewRoleName(''); setShowAddRole(false);
      loadRoles(accessToken);
      selectRole(created);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to create role.');
    } finally {
      setCreatingRole(false);
    }
  };

  const onCloneRole = async () => {
    if (!accessToken || !selectedRole || !cloneCode.trim() || !cloneName.trim()) return;
    setCloning(true);
    setPageError(null);
    try {
      const cloned = await rolesApi.clone(accessToken, selectedRole.code, cloneCode.trim().toUpperCase().replace(/\s+/g, '_'), cloneName.trim());
      setCloneCode(''); setCloneName(''); setShowCloneRole(false);
      loadRoles(accessToken);
      selectRole(cloned);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to clone role.');
    } finally {
      setCloning(false);
    }
  };

  const onDeleteRole = async () => {
    if (!accessToken || !selectedRole) return;
    setDeletingRole(true);
    setPageError(null);
    try {
      await rolesApi.delete(accessToken, selectedRole.code);
      setSelectedRole(null);
      setConfirmingDelete(false);
      loadRoles(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to delete role.');
    } finally {
      setDeletingRole(false);
    }
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
        {roles ? `${roles.length} roles` : 'Loading…'} - every role and exactly what it can do. This is real system
        access control, not a settings toy: changes here take effect immediately for everyone with that role.
      </p>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-1">
          {hasPermission('roles.manage') && (
            <div className="mb-3">
              <button
                type="button"
                onClick={() => setShowAddRole((v) => !v)}
                className="w-full rounded-lg border border-dashed border-paddy-300 px-3 py-2 text-sm font-medium text-paddy-700 hover:border-paddy-500"
              >
                {showAddRole ? 'Cancel' : '+ New role'}
              </button>
              {showAddRole && (
                <div className="mt-2 space-y-2 rounded-lg border border-paddy-100 bg-white p-3">
                  <input
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="Display name, e.g. Regional Auditor"
                    className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm"
                  />
                  <input
                    value={newRoleCode}
                    onChange={(e) => setNewRoleCode(e.target.value)}
                    placeholder="Code, e.g. REGIONAL_AUDITOR"
                    className="w-full rounded-lg border border-paddy-100 px-3 py-2 font-mono text-xs uppercase"
                  />
                  <p className="text-xs text-ink-500">A new role starts with no permissions - select it below to add them.</p>
                  <button
                    type="button"
                    onClick={onCreateRole}
                    disabled={creatingRole || !newRoleName.trim() || !newRoleCode.trim()}
                    className="w-full rounded-full bg-paddy-900 px-4 py-2 text-sm font-medium text-rice-50 disabled:opacity-50"
                  >
                    {creatingRole ? 'Creating…' : 'Create role'}
                  </button>
                </div>
              )}
            </div>
          )}
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
                <div className="flex-1">
                  {editingName ? (
                    <div className="space-y-2 pr-4">
                      <input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        className="w-full rounded-lg border border-paddy-100 px-3 py-1.5 text-lg font-display text-paddy-900"
                        placeholder="Display name"
                      />
                      <input
                        value={descriptionDraft}
                        onChange={(e) => setDescriptionDraft(e.target.value)}
                        className="w-full rounded-lg border border-paddy-100 px-3 py-1.5 text-sm"
                        placeholder="Description (optional)"
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={onSaveDetails} disabled={savingDetails || !nameDraft.trim()} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
                          {savingDetails ? 'Saving…' : 'Save name'}
                        </button>
                        <button type="button" onClick={() => setEditingName(false)} className="rounded-full border border-paddy-100 px-4 py-1.5 text-xs font-medium text-ink-700">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-lg text-paddy-900">{selectedRole.name}</h2>
                        {hasPermission('roles.manage') && (
                          <button type="button" onClick={startEditingName} className="text-xs font-medium text-paddy-700 underline">
                            Rename
                          </button>
                        )}
                      </div>
                      {selectedRole.description && <p className="mt-0.5 text-xs text-ink-500">{selectedRole.description}</p>}
                      <p className="font-mono text-xs text-ink-500">{selectedRole.code}</p>
                      {selectedRole.isSystemRole && (
                        <p className="mt-1 text-xs text-soil-500">Built-in role - name and permissions can be adjusted, but it can&rsquo;t be deleted.</p>
                      )}
                    </>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
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
                  {hasPermission('roles.manage') && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setCloneCode(''); setCloneName(`${selectedRole.name} (copy)`); setShowCloneRole((v) => !v); }}
                        className="rounded-full border border-paddy-100 px-3 py-1 text-xs font-medium text-ink-700"
                      >
                        Clone
                      </button>
                      {!selectedRole.isSystemRole && (
                        <button
                          type="button"
                          onClick={() => setConfirmingDelete(true)}
                          className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {showCloneRole && (
                <div className="mt-3 space-y-2 rounded-lg border border-husk-300 bg-husk-100/30 p-3">
                  <p className="text-xs font-medium text-ink-700">Clone &ldquo;{selectedRole.name}&rdquo; into a new role, starting with the same permissions</p>
                  <input value={cloneName} onChange={(e) => setCloneName(e.target.value)} placeholder="New display name" className="w-full rounded-lg border border-paddy-100 px-3 py-1.5 text-sm" />
                  <input value={cloneCode} onChange={(e) => setCloneCode(e.target.value)} placeholder="New code, e.g. FARM_MANAGER_2" className="w-full rounded-lg border border-paddy-100 px-3 py-1.5 font-mono text-xs uppercase" />
                  <button type="button" onClick={onCloneRole} disabled={cloning || !cloneCode.trim() || !cloneName.trim()} className="rounded-full bg-husk-700 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
                    {cloning ? 'Cloning…' : 'Create clone'}
                  </button>
                </div>
              )}

              {confirmingDelete && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-700">
                    Delete &ldquo;{selectedRole.name}&rdquo; permanently? Anyone currently assigned this role will lose the access it grants. This can&rsquo;t be undone.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={onDeleteRole} disabled={deletingRole} className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                      {deletingRole ? 'Deleting…' : 'Yes, delete it'}
                    </button>
                    <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-full border border-paddy-100 px-4 py-1.5 text-xs font-medium text-ink-700">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

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
