'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { farmsApi, usersApi, Farm, AppUser, ApiError } from '@/lib/api-client';

export default function FarmsPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [farms, setFarms] = useState<Farm[] | null>(null);
  const [farmsError, setFarmsError] = useState<string | null>(null);
  const [candidateManagers, setCandidateManagers] = useState<AppUser[]>([]);
  const [assigningFarmId, setAssigningFarmId] = useState<string | null>(null);
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Onboarding a brand-new Farm Manager, not just picking an existing
  // account — a separate mode within the same "assign manager" panel,
  // since a Farm Supervisor genuinely needs both: reassigning an
  // existing manager to a different farm, or bringing on someone new.
  const [assignMode, setAssignMode] = useState<'existing' | 'new'>('existing');
  const [newManagerFirstName, setNewManagerFirstName] = useState('');
  const [newManagerLastName, setNewManagerLastName] = useState('');
  const [newManagerEmail, setNewManagerEmail] = useState('');
  const [newManagerPhone, setNewManagerPhone] = useState('');
  const [creatingManager, setCreatingManager] = useState(false);
  const [newManagerCredentials, setNewManagerCredentials] = useState<{ farmId: string; email: string; temporaryPassword: string } | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingFarmId, setEditingFarmId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = hasPermission('farm.update');
  const canCreate = hasPermission('farm.create');
  const canDelete = hasPermission('farm.delete');

  const loadFarms = (token: string) => {
    farmsApi
      .list(token, showInactive)
      .then(setFarms)
      .catch((err: unknown) => setFarmsError(err instanceof ApiError ? err.message : 'Failed to load farms.'));
  };

  useEffect(() => {
    if (!accessToken) return;
    loadFarms(accessToken);
    if (hasPermission('tasks.assign') || hasPermission('users.manage')) {
      usersApi.list(accessToken).then((res) => setCandidateManagers(res.items)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, showInactive]);

  const onCreate = async () => {
    if (!accessToken || !newCode.trim() || !newName.trim()) return;
    setCreating(true);
    setFarmsError(null);
    try {
      await farmsApi.create(accessToken, { code: newCode.trim().toUpperCase(), name: newName.trim(), location: newLocation.trim() || undefined });
      setShowCreate(false);
      setNewCode('');
      setNewName('');
      setNewLocation('');
      loadFarms(accessToken);
    } catch (err) {
      setFarmsError(err instanceof ApiError ? err.message : 'Failed to create farm.');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (farm: Farm) => {
    setEditingFarmId(farm.id);
    setEditName(farm.name);
    setEditLocation(farm.location ?? '');
  };

  const onSaveEdit = async (farmId: string) => {
    if (!accessToken) return;
    setSaving(true);
    setFarmsError(null);
    try {
      await farmsApi.update(accessToken, farmId, { name: editName.trim(), location: editLocation.trim() || undefined });
      setEditingFarmId(null);
      loadFarms(accessToken);
    } catch (err) {
      setFarmsError(err instanceof ApiError ? err.message : 'Failed to update farm.');
    } finally {
      setSaving(false);
    }
  };

  const onToggleActive = async (farm: Farm) => {
    if (!accessToken) return;
    setFarmsError(null);
    try {
      if (farm.isActive) {
        await farmsApi.deactivate(accessToken, farm.id);
      } else {
        await farmsApi.update(accessToken, farm.id, { isActive: true });
      }
      loadFarms(accessToken);
    } catch (err) {
      setFarmsError(err instanceof ApiError ? err.message : 'Failed to update farm status.');
    }
  };

  const onAssign = async (farmId: string) => {
    if (!accessToken || !selectedManagerId) return;
    setAssigning(true);
    setFarmsError(null);
    try {
      await farmsApi.assignManager(accessToken, farmId, selectedManagerId);
      setAssigningFarmId(null);
      setSelectedManagerId('');
      loadFarms(accessToken);
    } catch (err) {
      setFarmsError(err instanceof ApiError ? err.message : 'Failed to assign manager.');
    } finally {
      setAssigning(false);
    }
  };

  const onCreateManager = async (farmId: string) => {
    if (!accessToken || !newManagerFirstName.trim() || !newManagerLastName.trim() || !newManagerEmail.trim()) return;
    setCreatingManager(true);
    setFarmsError(null);
    try {
      const result = await farmsApi.createManager(accessToken, farmId, {
        firstName: newManagerFirstName.trim(),
        lastName: newManagerLastName.trim(),
        email: newManagerEmail.trim(),
        phone: newManagerPhone.trim() || undefined,
      });
      setNewManagerCredentials({ farmId, email: result.email, temporaryPassword: result.temporaryPassword });
      setNewManagerFirstName(''); setNewManagerLastName(''); setNewManagerEmail(''); setNewManagerPhone('');
      loadFarms(accessToken);
    } catch (err) {
      setFarmsError(err instanceof ApiError ? err.message : 'Failed to create manager account.');
    } finally {
      setCreatingManager(false);
    }
  };

  const onRemove = async (farmId: string, userId: string) => {
    if (!accessToken) return;
    try {
      await farmsApi.removeManager(accessToken, farmId, userId);
      loadFarms(accessToken);
    } catch (err) {
      setFarmsError(err instanceof ApiError ? err.message : 'Failed to remove manager.');
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  const farmManagerCandidates = candidateManagers.filter((u) => u.roles.some((r) => r.role.code === 'FARM_MANAGER'));

  return (
    <DashboardShell me={me}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-paddy-900">Farms</h1>
          <p className="mt-1 text-sm text-ink-500">
            {farms ? `${farms.length} ${showInactive ? '' : 'active '}${farms.length === 1 ? 'farm' : 'farms'}` : 'Loading…'}
            {canManage && ' — full oversight: add farms, edit details, assign managers, and approve their work from Paddy Entries.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-ink-500">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          {canCreate && (
            <button type="button" onClick={() => setShowCreate((v) => !v)} className="rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50">
              {showCreate ? 'Cancel' : '+ New farm'}
            </button>
          )}
        </div>
      </div>

      {farmsError && <p className="mt-4 text-sm text-red-600">{farmsError}</p>}

      {showCreate && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-husk-300 bg-husk-100/30 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Code</label>
            <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="FARM_G" className="w-28 rounded-lg border border-paddy-100 px-2 py-1.5 text-sm uppercase" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Farm G" className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Location</label>
            <input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Optional" className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
          </div>
          <button type="button" onClick={onCreate} disabled={creating || !newCode.trim() || !newName.trim()} className="rounded-full bg-paddy-900 px-4 py-1.5 text-sm font-medium text-rice-50 disabled:opacity-50">
            {creating ? 'Creating…' : 'Create farm'}
          </button>
        </div>
      )}

      {farms && (
        <div className="mt-6 space-y-3">
          {farms.map((farm) => (
            <div key={farm.id} className={`rounded-2xl border bg-white p-5 ${farm.isActive ? 'border-paddy-100' : 'border-ink-500/20 opacity-70'}`}>
              <div className="flex items-start justify-between">
                {editingFarmId === farm.id ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink-700">Name</label>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink-700">Location</label>
                      <input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
                    </div>
                    <button type="button" onClick={() => onSaveEdit(farm.id)} disabled={saving} className="rounded-full bg-paddy-900 px-3 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setEditingFarmId(null)} className="text-xs text-ink-500">Cancel</button>
                  </div>
                ) : (
                  <div>
                    <p className="font-mono text-xs text-ink-500">{farm.code}</p>
                    <Link href={`/farms/${farm.id}`} className="mt-0.5 block font-display text-lg text-paddy-900 hover:text-husk-700 hover:underline">
                      {farm.name}
                      {!farm.isActive && <span className="ml-2 rounded-full bg-ink-500/10 px-2 py-0.5 text-xs font-medium text-ink-500">Inactive</span>}
                    </Link>
                    <p className="text-sm text-ink-500">{farm.location ?? 'No location set'}</p>
                    <Link href={`/farms/${farm.id}`} className="mt-1 inline-block text-xs font-medium text-husk-700 hover:underline">
                      View details →
                    </Link>
                  </div>
                )}

                {canManage && editingFarmId !== farm.id && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => startEdit(farm)} className="rounded-full border border-paddy-100 px-3 py-1 text-xs font-medium text-ink-700 hover:bg-paddy-50">
                      Edit
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => onToggleActive(farm)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${farm.isActive ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-paddy-300 text-paddy-700 hover:bg-paddy-50'}`}
                      >
                        {farm.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-3 border-t border-paddy-100 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Farm Manager(s)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {farm.managers.map((m) => (
                    <span key={m.user.id} className="flex items-center gap-2 rounded-full bg-rice-50 px-3 py-1 text-sm text-ink-900">
                      {m.user.firstName} {m.user.lastName}
                      {canManage && (
                        <button type="button" onClick={() => onRemove(farm.id, m.user.id)} className="text-ink-500 hover:text-red-600" title="Remove">
                          &times;
                        </button>
                      )}
                    </span>
                  ))}
                  {farm.managers.length === 0 && <span className="text-sm text-ink-500">No manager assigned</span>}
                </div>

                {canManage && (
                  assigningFarmId === farm.id ? (
                    <div className="mt-3 rounded-lg border border-paddy-100 bg-rice-50 p-3">
                      <div className="mb-2 flex gap-2">
                        <button type="button" onClick={() => setAssignMode('existing')} className={`rounded-full px-3 py-1 text-xs font-medium ${assignMode === 'existing' ? 'bg-paddy-900 text-rice-50' : 'bg-white text-ink-700'}`}>
                          Existing manager
                        </button>
                        <button type="button" onClick={() => setAssignMode('new')} className={`rounded-full px-3 py-1 text-xs font-medium ${assignMode === 'new' ? 'bg-paddy-900 text-rice-50' : 'bg-white text-ink-700'}`}>
                          Onboard someone new
                        </button>
                      </div>

                      {assignMode === 'existing' ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={selectedManagerId}
                            onChange={(e) => setSelectedManagerId(e.target.value)}
                            className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm"
                          >
                            <option value="">Select a Farm Manager…</option>
                            {farmManagerCandidates.map((u) => (
                              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => onAssign(farm.id)}
                            disabled={assigning || !selectedManagerId}
                            className="rounded-full bg-paddy-900 px-3 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50"
                          >
                            {assigning ? 'Assigning…' : 'Assign'}
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <input value={newManagerFirstName} onChange={(e) => setNewManagerFirstName(e.target.value)} placeholder="First name" className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
                            <input value={newManagerLastName} onChange={(e) => setNewManagerLastName(e.target.value)} placeholder="Last name" className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
                            <input value={newManagerEmail} onChange={(e) => setNewManagerEmail(e.target.value)} placeholder="Email" type="email" className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
                            <input value={newManagerPhone} onChange={(e) => setNewManagerPhone(e.target.value)} placeholder="Phone (optional)" className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
                          </div>
                          <p className="mt-1.5 text-xs text-ink-500">
                            A real account is created with a temporary password, scoped to this farm — shown once after creation, so it can be handed to them directly.
                          </p>
                          <button
                            type="button"
                            onClick={() => onCreateManager(farm.id)}
                            disabled={creatingManager || !newManagerFirstName.trim() || !newManagerLastName.trim() || !newManagerEmail.trim()}
                            className="mt-2 rounded-full bg-paddy-900 px-3 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50"
                          >
                            {creatingManager ? 'Creating…' : 'Create account'}
                          </button>
                        </div>
                      )}
                      <button type="button" onClick={() => setAssigningFarmId(null)} className="mt-2 block text-xs text-ink-500">
                        Cancel
                      </button>

                      {newManagerCredentials && newManagerCredentials.farmId === farm.id && (
                        <div className="mt-3 rounded-lg border-2 border-husk-500 bg-husk-100/40 p-3">
                          <p className="text-xs font-medium text-soil-700">
                            Account created — copy these now, they won&rsquo;t be shown again:
                          </p>
                          <p className="mt-1 font-mono text-sm text-ink-900">{newManagerCredentials.email}</p>
                          <p className="font-mono text-sm text-ink-900">{newManagerCredentials.temporaryPassword}</p>
                          <button type="button" onClick={() => setNewManagerCredentials(null)} className="mt-1.5 text-xs text-ink-500 underline">
                            I&rsquo;ve saved this
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAssigningFarmId(farm.id)}
                      className="mt-3 rounded-full border border-husk-500 px-3 py-1 text-xs font-medium text-paddy-900 hover:bg-husk-500 hover:text-white"
                    >
                      + Assign manager
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
          {farms.length === 0 && (
            <div className="rounded-2xl border border-paddy-100 bg-white p-8 text-center text-sm text-ink-500">
              No farms yet.
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
