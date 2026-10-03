'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { ApiError, type SettingGroupInfo, type SettingItem, rolesApi, settingsRegistryApi } from '@/lib/api-client';

type Draft = Record<string, number | string[] | ''>;

const sameValue = (a: unknown, b: unknown) => (Array.isArray(a) && Array.isArray(b) ? JSON.stringify([...a].sort()) === JSON.stringify([...b].sort()) : a === b);
const show = (v: number | string[]) => (Array.isArray(v) ? v.join(', ') : String(v));

export default function SystemSettingsPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const canEdit = !!me && hasPermission('settings.manage');

  const [groups, setGroups] = useState<SettingGroupInfo[]>([]);
  const [items, setItems] = useState<SettingItem[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [roles, setRoles] = useState<{ code: string; name: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const apply = useCallback((reg: { groups: SettingGroupInfo[]; items: SettingItem[] }) => {
    setGroups(reg.groups);
    setItems(reg.items);
    setDraft(Object.fromEntries(reg.items.map((i) => [i.key, i.value])));
  }, []);

  useEffect(() => {
    if (!accessToken || !canEdit) return;
    Promise.all([settingsRegistryApi.list(accessToken), rolesApi.list(accessToken)])
      .then(([reg, roleList]) => {
        apply(reg);
        setRoles((roleList as { code: string; name: string }[]).map((r) => ({ code: r.code, name: r.name })));
      })
      .catch((err: unknown) => setLoadError(err instanceof ApiError && err.status === 404 ? 'Your server does not have the settings feature yet. Update the server (API) first: the Overview page explains how.' : err instanceof ApiError ? err.message : 'Could not load the settings.'));
  }, [accessToken, canEdit, apply]);

  /** Any edit makes the last message ("Saved", or an error) stale, so it goes. */
  const edit = (fn: (d: Draft) => Draft) => {
    setStatus(null);
    setDraft(fn);
  };

  const changed = items.filter((i) => !sameValue(draft[i.key], i.value));
  const dirty = changed.length > 0;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;
  if (!canEdit) {
    return (
      <DashboardShell me={me}>
        <h1 className="font-display text-2xl font-medium text-paddy-900">System settings</h1>
        <p className="mt-3 rounded-xl bg-husk-100/50 px-4 py-3 text-sm text-soil-700">Only the System Administrator can change the system&rsquo;s settings.</p>
      </DashboardShell>
    );
  }

  const save = async () => {
    if (!accessToken || !dirty) return;
    setSaving(true);
    setStatus(null);
    try {
      const values = Object.fromEntries(changed.map((i) => [i.key, draft[i.key] as number | string[]]));
      apply(await settingsRegistryApi.update(accessToken, values));
      setStatus({ kind: 'ok', text: `Saved ${changed.length === 1 ? '1 change' : `${changed.length} changes`}. The system uses the new values straight away.` });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const reset = async (key: string) => {
    if (!accessToken) return;
    setStatus(null);
    try {
      apply(await settingsRegistryApi.reset(accessToken, key));
      setStatus({ kind: 'ok', text: 'Put back to the standard value.' });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not reset. Please try again.' });
    }
  };

  const field = 'w-28 rounded-lg border border-paddy-100 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20';

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">System settings</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-500">The rules and limits the system works by. Each one starts at a standard value; change it here and the system follows, with no developer and no deployment. Every change is recorded in the audit log.</p>

      {loadError && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="settings-load-error">{loadError}</p>}
      {!loadError && items.length === 0 && <p className="mt-6 text-sm text-ink-500">Loading the settings…</p>}

      <div className="mt-6 max-w-4xl space-y-6">
        {groups.map((g) => {
          const rows = items.filter((i) => i.group === g.id);
          if (rows.length === 0) return null;
          return (
            <section key={g.id} id={g.id} className="rounded-2xl border border-paddy-100 bg-white p-5 sm:p-6" aria-labelledby={`${g.id}-title`} data-testid="settings-group">
              <h2 id={`${g.id}-title`} className="font-display text-xl font-medium text-paddy-900">{g.title}</h2>
              <p className="mt-1 text-sm text-ink-500">{g.intro}</p>
              <ul className="mt-4 divide-y divide-paddy-100">
                {rows.map((i) => {
                  const edited = !sameValue(draft[i.key], i.value);
                  return (
                    <li key={i.key} className="py-4" data-testid="setting-row" data-key={i.key}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 max-w-xl">
                          <p className="text-sm font-semibold text-ink-900">{i.label}{!i.isDefault && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Changed</span>}</p>
                          <p className="mt-0.5 text-sm text-ink-500">{i.help}</p>
                        </div>
                        {i.type === 'number' && (
                          <div className="flex items-center gap-2">
                            <input
                              aria-label={i.label}
                              type="number"
                              inputMode="decimal"
                              min={i.min}
                              max={i.max}
                              step={i.step}
                              value={draft[i.key] as number | ''}
                              onChange={(e) => edit((d) => ({ ...d, [i.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
                              className={`${field} ${edited ? 'border-amber-400' : ''}`}
                            />
                            <span className="w-14 text-sm text-ink-500">{i.unit}</span>
                          </div>
                        )}
                      </div>
                      {i.type === 'roles' && (
                        <fieldset className="mt-3">
                          <legend className="sr-only">{i.label}</legend>
                          <div className="flex flex-wrap gap-2">
                            {roles.map((r) => {
                              const chosen = (draft[i.key] as string[]).includes(r.code);
                              return (
                                <label key={r.code} className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${chosen ? 'border-paddy-900 bg-paddy-900 text-rice-50' : 'border-paddy-100 bg-white text-ink-700'}`}>
                                  <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={chosen}
                                    onChange={(e) => edit((d) => ({ ...d, [i.key]: e.target.checked ? [...(d[i.key] as string[]), r.code] : (d[i.key] as string[]).filter((c) => c !== r.code) }))}
                                  />
                                  {r.name}
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      )}
                      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                        <span>Standard: {show(i.default)}{i.type === 'number' && i.unit ? ` ${i.unit}` : ''}{i.type === 'number' ? `. Allowed: ${i.min} to ${i.max}.` : ''}</span>
                        {!i.isDefault && <button type="button" onClick={() => void reset(i.key)} className="font-medium text-paddy-900 underline underline-offset-2">Put back to standard</button>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {items.length > 0 && (
        <div className="sticky bottom-4 z-20 mt-8 max-w-4xl rounded-2xl border border-paddy-100 bg-white/95 px-4 py-3 shadow-lg backdrop-blur" data-testid="save-bar">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 text-sm" role="status" aria-live="polite">
              {status ? <span className={status.kind === 'ok' ? 'text-paddy-700' : 'text-red-700'}>{status.text}</span> : dirty ? <span className="font-medium text-soil-700">{changed.length === 1 ? '1 setting has been changed and not saved' : `${changed.length} settings have been changed and not saved`}</span> : <span className="text-ink-500">Nothing to save.</span>}
            </div>
            <button type="button" onClick={() => { apply({ groups, items }); setStatus(null); }} disabled={!dirty || saving} className="rounded-full border border-paddy-100 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-rice-50 disabled:opacity-40">Discard changes</button>
            <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="rounded-full bg-paddy-900 px-6 py-2 text-sm font-medium text-rice-50 transition hover:bg-paddy-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
