'use client';

import { useCallback, useState } from 'react';
import { ApiError, usersApi, type AppUser, type SupportCheck } from '@/lib/api-client';

const makePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('') + '#7';
};

/** The Administrator's help desk: find a person, see in plain words why they are stuck, and put it right. */
export function UserSupport({ accessToken }: { accessToken: string }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<AppUser[] | null>(null);
  const [check, setCheck] = useState<SupportCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'That did not work. Please try again.');
  const search = useCallback(async () => {
    setError(null); setNote(null); setCheck(null);
    try { setFound((await usersApi.search(accessToken, q.trim())).items); } catch (e) { fail(e); }
  }, [accessToken, q]);
  const open = async (id: string, keep = false) => {
    setError(null); if (!keep) { setNote(null); setFresh(null); } setBusy(true);
    try { setCheck(await usersApi.accessCheck(accessToken, id)); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const unlock = async () => {
    if (!check) return; setBusy(true); setError(null);
    try { await usersApi.unlock(accessToken, check.user.id); setNote('The account is unlocked.'); await open(check.user.id, true); } catch (e) { fail(e); setBusy(false); }
  };
  const reset = async () => {
    if (!check) return;
    if (!window.confirm(`Reset the password for ${check.user.name}? They will be signed out everywhere and must choose a new password.`)) return;
    const pw = makePassword(); setBusy(true); setError(null);
    try { await usersApi.resetPassword(accessToken, check.user.id, pw); setFresh(pw); setNote('The password is reset. Give them the temporary password below.'); await open(check.user.id, true); } catch (e) { fail(e); setBusy(false); }
  };

  return (
    <section data-testid="user-support" className="rounded-2xl border border-paddy-100 bg-white p-5">
      <h2 className="font-display text-xl text-paddy-900">User support</h2>
      <p className="mt-1 text-sm text-ink-500">Find a person who is stuck. You will see exactly why, and can unlock them or give them a new temporary password. Roles and places are changed on the Users page.</p>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" aria-label="Search for a person" data-testid="support-q" className="w-full max-w-sm rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
        <button type="submit" data-testid="support-search" className="rounded-lg bg-paddy-900 px-4 py-2 text-sm font-medium text-rice-50">Find</button>
      </form>
      {error && <p role="alert" data-testid="support-error" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {found && !check && (
        <ul className="mt-3 divide-y divide-paddy-100 rounded-xl border border-paddy-100" data-testid="support-results">
          {found.length === 0 && <li className="px-3 py-3 text-sm text-ink-500">Nobody matches.</li>}
          {found.map((u) => (
            <li key={u.id}><button type="button" onClick={() => void open(u.id)} data-testid="support-person" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-rice-50"><span>{u.firstName} {u.lastName} <span className="text-ink-500">{u.email}</span></span><span className="text-xs text-ink-500">{u.roles.map((r) => r.role.name).join(', ') || 'no role'}</span></button></li>
          ))}
        </ul>
      )}
      {check && (
        <div className="mt-4 space-y-4" data-testid="support-check">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm"><span className="font-medium text-paddy-900">{check.user.name}</span> <span className="text-ink-500">{check.user.email} - {check.user.status.toLowerCase()}{check.user.lastLoginAt ? `, last in ${check.user.lastLoginAt.slice(0, 10)}` : ', never signed in'}</span></p>
            <button type="button" onClick={() => { setCheck(null); setFresh(null); setNote(null); }} className="text-sm text-ink-500 underline">Back to the list</button>
          </div>
          {note && <p data-testid="support-note" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{note}</p>}
          {fresh && <p data-testid="support-temp" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">Temporary password (shown once): <code className="font-mono font-medium">{fresh}</code></p>}
          {check.problems.length === 0
            ? <p data-testid="support-ok" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Nothing is wrong with this account. If they still cannot do something, check their role and places on the Users page.</p>
            : <ul className="space-y-2" data-testid="support-problems">{check.problems.map((p) => <li key={p.code} data-code={p.code} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm"><p className="font-medium text-amber-900">{p.text}</p><p className="text-amber-800">{p.fix}</p></li>)}</ul>}
          <ul className="grid gap-2 sm:grid-cols-2">
            {check.roles.map((r) => <li key={r.code} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm"><p className="font-medium text-paddy-900">{r.name}</p><p className="text-ink-500">{r.permissionCount} permissions - {r.scopes.length === 0 ? 'no place assigned' : r.scopes.map((s) => s.type.toLowerCase().replace('_', ' ')).join(', ')}</p></li>)}
          </ul>
          <div className="flex flex-wrap gap-2">
            {check.problems.some((p) => p.code === 'LOCKED') && <button type="button" disabled={busy} onClick={() => void unlock()} data-testid="support-unlock" className="rounded-lg bg-paddy-900 px-4 py-2 text-sm font-medium text-rice-50 disabled:opacity-50">Unlock the account</button>}
            <button type="button" disabled={busy} onClick={() => void reset()} data-testid="support-reset" className="rounded-lg border border-paddy-900 px-4 py-2 text-sm font-medium text-paddy-900 disabled:opacity-50">Reset password</button>
          </div>
          {check.recentFailedSignIns.length > 0 && <p className="text-xs text-ink-500">Recent failed sign-ins: {check.recentFailedSignIns.map((f) => `${f.at.slice(0, 16).replace('T', ' ')} (${f.reason})`).join('; ')}</p>}
        </div>
      )}
    </section>
  );
}
