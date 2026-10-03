'use client';

import { type ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Building2, CircleCheck, Database, FileDown, Globe, Server, ShieldCheck, SlidersHorizontal, TriangleAlert, Users } from 'lucide-react';
import { ApiError, type ApiInfo, type SystemOverview, healthApi, systemApi } from '@/lib/api-client';
import { FEATURE_LABELS, WEB_COMMIT, missingFeatures } from '@/lib/build-info';

const CONTROLS = [
  { href: '/users', icon: Users, title: 'People and accounts', body: 'Create accounts, set temporary passwords, assign roles and places, disable or unlock people.' },
  { href: '/roles', icon: ShieldCheck, title: 'Roles and permissions', body: 'Create new roles, copy existing ones, and decide exactly what each role may do.' },
  { href: '/organization', icon: Building2, title: 'Farms, warehouses and mills', body: 'Add or change the places the company works in.' },
  { href: '/master-data', icon: Database, title: 'Master data', body: 'Products, packaging sizes, paddy grades and the other lists used across the system.' },
  { href: '/settings', icon: SlidersHorizontal, title: 'System settings', body: 'Lockout policy, delivery tolerance, milling and machine checks, who is alerted, and the Watchlist limits.' },
  { href: '/site-editor', icon: Globe, title: 'Public homepage', body: 'Text, sales points, contact details, brand, the sign-in page and the rotating pictures and videos.' },
  { href: '/reports', icon: FileDown, title: 'Reports and downloads', body: 'Download any report as CSV, Excel or PDF.' },
  { href: '/audit-log', icon: Activity, title: 'Audit log', body: 'Who did what, and when, across the whole system.' },
  { href: '/admin', icon: Server, title: 'Backups, resets and notifications', body: 'Backups, controlled data resets, and the sender identity for notifications.' },
];

const n = (v: number | null | undefined) => (v === null || v === undefined ? 'n/a' : v.toLocaleString());

function Tile({ href, label, value, note, tone = 'plain' }: { href: string; label: string; value: ReactNode; note?: ReactNode; tone?: 'plain' | 'warn' }) {
  return (
    <Link href={href} className={`rounded-2xl border bg-white p-4 transition hover:border-paddy-500 ${tone === 'warn' ? 'border-amber-300' : 'border-paddy-100'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 font-display text-3xl font-medium text-paddy-900">{value}</p>
      {note && <p className="mt-1 text-xs text-ink-500">{note}</p>}
    </Link>
  );
}

/**
 * The System Administrator's control center: the state of the whole system at a glance, and a way into everything
 * they manage. It also says plainly when the server (API) is older than this website, which is otherwise only
 * visible as pages that quietly fail.
 */
export function AdminControlCenter({ accessToken }: { accessToken: string }) {
  const [info, setInfo] = useState<ApiInfo | 'down' | null>(null);
  const [o, setO] = useState<SystemOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    healthApi.info().then((i) => live && setInfo(i)).catch(() => live && setInfo('down'));
    systemApi.overview(accessToken).then((v) => live && setO(v)).catch((e: unknown) => live && setOverviewError(e instanceof ApiError && e.status === 404 ? 'old-server' : 'The control center figures could not be loaded just now.'));
    return () => { live = false; };
  }, [accessToken]);

  const missing = info && info !== 'down' ? missingFeatures(info.features) : [];
  const roles = o?.people.roles ?? [];

  return (
    <section className="mb-6 space-y-5" data-testid="admin-control-center" aria-label="Control center">
      <div>
        <p className="font-display text-base italic text-soil-500">Control center</p>
        <h2 className="font-display text-2xl font-medium text-paddy-900">Everything you run, in one place</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-500">You can run the whole system from here without a developer: people, roles, places, lists, rules and limits, the public homepage, reports and backups.</p>
      </div>

      {info === 'down' && (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="server-down">The server did not answer. If this lasts more than a minute, check that the API is running on Railway.</p>
      )}
      {missing.length > 0 && (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-950" data-testid="server-behind">
          <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="h-4 w-4" aria-hidden="true" /> Your server is older than your website</p>
          <p className="mt-1">The website you are using is newer than the server (API) it talks to, so these parts will not work yet:</p>
          <ul className="mt-2 list-disc pl-5">{missing.map((f) => <li key={f}>{FEATURE_LABELS[f] ?? f}</li>)}</ul>
          <p className="mt-2">Open Railway, then your API service, then <strong>Deployments</strong>. If the newest deployment says <em>Failed</em>, open its build log and send it to your developer. If it is old, open <strong>Settings</strong> and check the source is the <code>main</code> branch of your repository with automatic deploys switched on.</p>
        </div>
      )}
      {overviewError && overviewError !== 'old-server' && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{overviewError}</p>}

      <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="system-status">
        {info && info !== 'down' && (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${missing.length === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
            {missing.length === 0 && <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />} Server {info.version ? `version ${info.version}` : 'is an older version'}{info.commit ? ` (${info.commit})` : ''}
          </span>
        )}
        {o && <span className={`rounded-full px-3 py-1 font-medium ${o.api.databaseOk ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>Database {o.api.databaseOk ? `reachable (${o.api.databaseMs} ms)` : 'NOT reachable'}</span>}
        <span className="rounded-full bg-ink-500/10 px-3 py-1 text-ink-700">Website build {WEB_COMMIT || 'local'}</span>
      </div>

      {o && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Tile href="/users" label="People" value={n(o.people.total)} note={`${n(o.people.active)} active, ${n(o.people.disabled)} disabled`} />
            <Tile href="/users" label="Locked out now" value={n(o.people.lockedNow)} note="Unlock them from People" tone={(o.people.lockedNow ?? 0) > 0 ? 'warn' : 'plain'} />
            <Tile href="/users" label="On a temporary password" value={n(o.people.mustChangePassword)} note={`${n(o.people.neverSignedIn)} never signed in`} tone={(o.people.neverSignedIn ?? 0) > 0 ? 'warn' : 'plain'} />
            <Tile href="/organization" label="Farms" value={n(o.organization.farms)} note={`${n(o.organization.warehouses)} warehouses, ${n(o.organization.millingCenters)} milling centers`} />
            <Tile href="/roles" label="Roles" value={n(o.access.roles)} note={`${n(o.access.permissions)} permissions in the system`} />
            <Tile href="/admin" label="Open reset requests" value={n(o.pending.resetRequests)} note="Waiting for a decision or to be carried out" tone={(o.pending.resetRequests ?? 0) > 0 ? 'warn' : 'plain'} />
            <Tile href="/audit-log" label="Actions in 24 hours" value={n(o.activity.last24h)} note={`${n(o.activity.last7d)} in 7 days`} />
            <Tile href="/settings" label="Settings changed" value={n(o.settings.changedFromDefault)} note={`of ${n(o.settings.total)} you can adjust`} />
            <Tile href="/site-editor" label="Public homepage" value={o.homepage.saved ? `v${o.homepage.version}` : 'Original'} note={`${n(o.homepage.files)} uploaded files`} />
            <Tile href="/organization" label="Machines" value={n(o.organization.machines)} note={`${n(o.organization.customers)} customers`} />
          </div>

          {roles.length > 0 && (
            <div className="rounded-2xl border border-paddy-100 bg-white p-5">
              <h3 className="font-display text-lg font-medium text-paddy-900">Who holds which role</h3>
              <ul className="mt-3 flex flex-wrap gap-2" data-testid="role-members">
                {roles.map((r) => (
                  <li key={r.code}><Link href="/roles" className="inline-flex items-center gap-2 rounded-full border border-paddy-100 bg-rice-50 px-3 py-1.5 text-sm text-ink-900 hover:border-paddy-500">{r.name}<span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.members === 0 ? 'bg-amber-100 text-amber-900' : 'bg-paddy-100 text-paddy-900'}`}>{r.members}</span></Link></li>
                ))}
              </ul>
            </div>
          )}

          {(o.activity.recent ?? []).length > 0 && (
            <div className="rounded-2xl border border-paddy-100 bg-white p-5">
              <h3 className="font-display text-lg font-medium text-paddy-900">Latest activity</h3>
              <ul className="mt-3 space-y-1.5">
                {(o.activity.recent ?? []).map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-lg bg-rice-50 px-3 py-2 text-sm"><span className="min-w-0 truncate text-ink-900"><span className="font-medium">{a.who}</span><span className="text-ink-500"> · {a.action} · {a.entity}</span></span><span className="shrink-0 text-xs text-ink-500">{new Date(a.at).toLocaleString()}</span></li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div>
        <h3 className="font-display text-lg font-medium text-paddy-900">Manage</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {CONTROLS.map((c) => (
            <Link key={c.href} href={c.href} data-testid="control-link" className="group flex gap-4 rounded-2xl border border-paddy-100 bg-white p-4 transition hover:border-paddy-500 hover:shadow-sm">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-paddy-900 text-husk-300"><c.icon className="h-5 w-5" aria-hidden="true" /></span>
              <span><span className="block font-semibold text-paddy-900">{c.title}</span><span className="mt-0.5 block text-sm text-ink-500">{c.body}</span></span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
