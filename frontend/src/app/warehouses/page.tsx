'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { warehousesApi, usersApi, Warehouse, AppUser, ApiError } from '@/lib/api-client';

export default function WarehousesPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [candidateManagers, setCandidateManagers] = useState<AppUser[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = hasPermission('warehouse.update');
  const canCreate = hasPermission('warehouse.create');
  const canDelete = hasPermission('warehouse.delete');

  const loadWarehouses = (token: string) => {
    warehousesApi
      .list(token, showInactive)
      .then(setWarehouses)
      .catch((err: unknown) => setListError(err instanceof ApiError ? err.message : 'Failed to load warehouses.'));
  };

  useEffect(() => {
    if (!accessToken) return;
    loadWarehouses(accessToken);
    if (hasPermission('tasks.assign') || hasPermission('users.manage')) {
      usersApi.list(accessToken).then((res) => setCandidateManagers(res.items)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, showInactive]);

  const onCreate = async () => {
    if (!accessToken || !newCode.trim() || !newName.trim()) return;
    setCreating(true);
    setListError(null);
    try {
      await warehousesApi.create(accessToken, { code: newCode.trim().toUpperCase(), name: newName.trim(), location: newLocation.trim() || undefined });
      setShowCreate(false);
      setNewCode('');
      setNewName('');
      setNewLocation('');
      loadWarehouses(accessToken);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to create warehouse.');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (wh: Warehouse) => {
    setEditingId(wh.id);
    setEditName(wh.name);
    setEditLocation(wh.location ?? '');
  };

  const onSaveEdit = async (id: string) => {
    if (!accessToken) return;
    setSaving(true);
    setListError(null);
    try {
      await warehousesApi.update(accessToken, id, { name: editName.trim(), location: editLocation.trim() || undefined });
      setEditingId(null);
      loadWarehouses(accessToken);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to update warehouse.');
    } finally {
      setSaving(false);
    }
  };

  const onToggleActive = async (wh: Warehouse) => {
    if (!accessToken) return;
    setListError(null);
    try {
      if (wh.isActive) {
        await warehousesApi.deactivate(accessToken, wh.id);
      } else {
        await warehousesApi.update(accessToken, wh.id, { isActive: true });
      }
      loadWarehouses(accessToken);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to update warehouse status.');
    }
  };

  const onAssign = async (warehouseId: string) => {
    if (!accessToken || !selectedManagerId) return;
    setAssigning(true);
    setListError(null);
    try {
      await warehousesApi.assignManager(accessToken, warehouseId, selectedManagerId);
      setAssigningId(null);
      setSelectedManagerId('');
      loadWarehouses(accessToken);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to assign manager.');
    } finally {
      setAssigning(false);
    }
  };

  const onRemove = async (warehouseId: string, userId: string) => {
    if (!accessToken) return;
    try {
      await warehousesApi.removeManager(accessToken, warehouseId, userId);
      loadWarehouses(accessToken);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to remove manager.');
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  const warehouseManagerCandidates = candidateManagers.filter((u) => u.roles.some((r) => r.role.code === 'WAREHOUSE_MANAGER'));

  return (
    <DashboardShell me={me}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-paddy-900">Warehouses</h1>
          <p className="mt-1 text-sm text-ink-500">
            {warehouses ? `${warehouses.length} ${showInactive ? '' : 'active '}${warehouses.length === 1 ? 'warehouse' : 'warehouses'}` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-ink-500">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          {canCreate && (
            <button type="button" onClick={() => setShowCreate((v) => !v)} className="rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50">
              {showCreate ? 'Cancel' : '+ New warehouse'}
            </button>
          )}
        </div>
      </div>

      {listError && <p className="mt-4 text-sm text-red-600">{listError}</p>}

      {showCreate && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-husk-300 bg-husk-100/30 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Code</label>
            <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="WAREHOUSE_4" className="w-32 rounded-lg border border-paddy-100 px-2 py-1.5 text-sm uppercase" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Warehouse 4" className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Location</label>
            <input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Optional" className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
          </div>
          <button type="button" onClick={onCreate} disabled={creating || !newCode.trim() || !newName.trim()} className="rounded-full bg-paddy-900 px-4 py-1.5 text-sm font-medium text-rice-50 disabled:opacity-50">
            {creating ? 'Creating…' : 'Create warehouse'}
          </button>
        </div>
      )}

      {warehouses && (
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((wh) => (
            <div key={wh.id} className={`rounded-2xl border bg-white p-5 ${wh.isActive ? 'border-paddy-100' : 'border-ink-500/20 opacity-70'}`}>
              {editingId === wh.id ? (
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-700">Name</label>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-700">Location</label>
                    <input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => onSaveEdit(wh.id)} disabled={saving} className="rounded-full bg-paddy-900 px-3 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs text-ink-500">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-xs text-ink-500">{wh.code}</p>
                    <h3 className="mt-1 font-display text-lg text-paddy-900">
                      {wh.name}
                      {!wh.isActive && <span className="ml-2 rounded-full bg-ink-500/10 px-2 py-0.5 text-xs font-medium text-ink-500">Inactive</span>}
                    </h3>
                    <p className="mt-1 text-sm text-ink-500">{wh.location ?? 'No location set'}</p>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <button type="button" onClick={() => startEdit(wh)} className="rounded-full border border-paddy-100 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-paddy-50">
                        Edit
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => onToggleActive(wh)}
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${wh.isActive ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-paddy-300 text-paddy-700 hover:bg-paddy-50'}`}
                        >
                          {wh.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 border-t border-paddy-100 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                  Milling centers ({wh.millingCenters.length})
                </p>
                {wh.millingCenters.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-sm text-ink-700">
                    {wh.millingCenters.map((mc) => (
                      <li key={mc.id}>{mc.name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-ink-500">None yet</p>
                )}
              </div>

              <div className="mt-3 border-t border-paddy-100 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Warehouse Manager(s)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {wh.managers.map((m) => (
                    <span key={m.user.id} className="flex items-center gap-2 rounded-full bg-rice-50 px-3 py-1 text-sm text-ink-900">
                      {m.user.firstName} {m.user.lastName}
                      {canManage && (
                        <button type="button" onClick={() => onRemove(wh.id, m.user.id)} className="text-ink-500 hover:text-red-600" title="Remove">
                          &times;
                        </button>
                      )}
                    </span>
                  ))}
                  {wh.managers.length === 0 && <span className="text-sm text-ink-500">No manager assigned</span>}
                </div>

                {canManage && (
                  assigningId === wh.id ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select
                        value={selectedManagerId}
                        onChange={(e) => setSelectedManagerId(e.target.value)}
                        className="rounded-lg border border-paddy-100 px-2 py-1.5 text-xs"
                      >
                        <option value="">Select…</option>
                        {warehouseManagerCandidates.map((u) => (
                          <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => onAssign(wh.id)}
                        disabled={assigning || !selectedManagerId}
                        className="rounded-full bg-paddy-900 px-3 py-1 text-xs font-medium text-rice-50 disabled:opacity-50"
                      >
                        {assigning ? '…' : 'Assign'}
                      </button>
                      <button type="button" onClick={() => setAssigningId(null)} className="text-xs text-ink-500">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAssigningId(wh.id)}
                      className="mt-3 rounded-full border border-husk-500 px-3 py-1 text-xs font-medium text-paddy-900 hover:bg-husk-500 hover:text-white"
                    >
                      + Assign manager
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
          {warehouses.length === 0 && (
            <p className="text-sm text-ink-500">No warehouses yet.</p>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
