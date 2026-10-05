'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { accessApi, ApiError, type AccessMatrix } from '@/lib/api-client';

const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/**
 * "Who can use what": the Administrator switches features off for a role. Switched off, the people in that role do not see it in their menu or on their
 * dashboard, and the server refuses it if they reach for it anyway. Kept apart from the Roles page, so it is not reset when the system is updated.
 */
export function FeatureAccess({ accessToken }: { accessToken: string }) {
  const [data, setData] = useState<AccessMatrix | null>(null);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => accessApi.features(accessToken)
    .then((m) => { if (!m || !Array.isArray(m.features) || !Array.isArray(m.roles)) throw new Error('unexpected answer'); setData(m); setDraft(Object.fromEntries(m.roles.map((r) => [r.code, r.denied]))); setError(null); })
    .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'The feature controls could not be loaded.')), [accessToken]);
  useEffect(() => { load(); }, [load]);

  const changed = useMemo(() => (data?.roles ?? []).filter((r) => !same(draft[r.code] ?? [], r.denied)).map((r) => r.code), [data, draft]);
  const toggle = (role: string, key: string) => { setNotice(null); setDraft((d) => { const cur = new Set(d[role] ?? []); if (cur.has(key)) cur.delete(key); else cur.add(key); return { ...d, [role]: [...cur] }; }); };
  const save = async () => {
    setSaving(true); setError(null); setNotice(null);
    try {
      for (const code of changed) await accessApi.save(accessToken, code, draft[code] ?? []);
      const n = changed.length; await load();
      setNotice(`Saved for ${n === 1 ? 'one role' : `${n} roles`}. They see the change as soon as they open or refresh a page.`);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'That did not save. Nothing was changed: please try again.'); }
    finally { setSaving(false); }
  };

  return (
    <section id="feature-access" className="mt-6 rounded-2xl border border-paddy-100 bg-white p-5 sm:p-6" aria-labelledby="feature-access-title" data-testid="feature-access">
      <h2 id="feature-access-title" className="font-display text-xl font-medium text-paddy-900">Who can use what</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-500">
        Tick what each kind of person may use. Untick a feature and the people in that role no longer see it in their menu or on their dashboard, and the system refuses it if they try to open it anyway.
        This is kept apart from the Roles page, so it stays when the system is updated. The System Administrator always keeps everything. A dash means that role was never given the feature.
      </p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="fa-error">{error}</p>}
      {!data && !error && <p className="mt-4 text-sm text-ink-500">Loading...</p>}
      {data && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm" data-testid="fa-table">
              <thead>
                <tr className="border-b border-paddy-100 text-left">
                  <th scope="col" className="sticky left-0 z-10 bg-white py-2 pr-4 font-medium text-ink-700">Feature</th>
                  {data.roles.map((r) => <th key={r.code} scope="col" data-testid="fa-role" data-role={r.code} className="px-2 py-2 text-center text-xs font-medium text-ink-700">{r.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.features.map((f) => (
                  <tr key={f.key} className="border-b border-paddy-100/60 align-top" data-testid="fa-row" data-feature={f.key}>
                    <th scope="row" className="sticky left-0 z-10 bg-white py-3 pr-4 text-left font-normal">
                      <span className="block font-medium text-ink-900">{f.label}</span>
                      <span className="block max-w-xs text-xs text-ink-500">{f.description}</span>
                    </th>
                    {data.roles.map((r) => {
                      const has = r.held.includes(f.key); const on = !(draft[r.code] ?? []).includes(f.key);
                      return (
                        <td key={r.code} className="px-2 py-3 text-center">
                          {has
                            ? <input type="checkbox" checked={on} onChange={() => toggle(r.code, f.key)} aria-label={`${r.name}: ${f.label}`} data-testid="fa-cell" data-role={r.code} data-feature={f.key} className="h-5 w-5 accent-paddy-700" />
                            : <span title="This role was never given this feature" className="text-ink-500/50" aria-label={`${r.name}: not given ${f.label}`}>&ndash;</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={changed.length === 0 || saving} data-testid="fa-save" className="rounded-full bg-paddy-900 px-6 py-3 text-base font-medium text-rice-50 disabled:bg-ink-500/30">{saving ? 'Saving...' : changed.length > 0 ? `Save changes (${changed.length} ${changed.length === 1 ? 'role' : 'roles'})` : 'Save changes'}</button>
            {changed.length > 0 && <button type="button" onClick={() => { setDraft(Object.fromEntries(data.roles.map((r) => [r.code, r.denied]))); setNotice(null); }} data-testid="fa-undo" className="rounded-full border border-paddy-100 px-5 py-3 text-base font-medium text-paddy-900">Undo</button>}
            {notice && <p className="text-sm font-medium text-paddy-700" role="status" data-testid="fa-notice">{notice}</p>}
          </div>
        </>
      )}
    </section>
  );
}
