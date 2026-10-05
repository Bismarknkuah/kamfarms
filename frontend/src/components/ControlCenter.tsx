'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, MapPin } from 'lucide-react';
import { ApiError, type ControlCenterView, type MeResponse, controlCenterApi } from '@/lib/api-client';
import { visibleNavItems } from '@/lib/nav-items';

/** The roles that have a control center (the same list the server uses; the server is what actually refuses everyone else). */
export const CONTROL_CENTER_ROLES = ['MD', 'FARM_DIRECTOR', 'WAREHOUSE_MANAGER', 'WAREHOUSE_SUPERVISOR', 'OPERATIONS_MANAGER', 'FINANCE_DIRECTOR'];
export const hasControlCenter = (me: MeResponse) => me.roles.some((r) => CONTROL_CENTER_ROLES.includes(r.code));

const COPY: Record<string, { title: string; body: string }> = {
  FINANCE_DIRECTOR: { title: 'Finance control center', body: 'Decide what is waiting for the Finance Director: orders, customer payments and expenses.' },
  MD: { title: 'Managing Director\'s control center', body: 'Release approved orders, decide what only you can decide, and watch the whole company.' },
  FARM_DIRECTOR: { title: 'Farm Supervisor\'s control center', body: 'Approve what your farms send in, and run paddy requests and dispatch for your farms.' },
  WAREHOUSE_MANAGER: { title: 'Warehouse control center', body: 'Count in what arrives at your warehouse and prepare the orders assigned to it.' },
  WAREHOUSE_SUPERVISOR: { title: 'Warehouse control center', body: 'Move paddy requests along, assign orders to warehouses, and move paddy between warehouses.' },
  OPERATIONS_MANAGER: { title: 'Operations control center', body: 'Approve production, move mill requests along, and keep the mills supplied.' },
};
/** The pages each role runs its area from. Only the ones the person is offered in the menu are shown. */
const SHORTCUTS: Record<string, string[]> = {
  FINANCE_DIRECTOR: ['/finance', '/sales', '/expenses', '/reports', '/audit-log', '/analytics'],
  MD: ['/oversight', '/track-dispatch', '/analytics', '/finance', '/sales', '/warehouse-requests', '/reports', '/audit-log'],
  FARM_DIRECTOR: ['/paddy-entries', '/deliveries', '/track-dispatch', '/warehouse-requests', '/farms', '/office', '/reports'],
  WAREHOUSE_MANAGER: ['/shipments', '/track-dispatch', '/site-deliveries', '/warehouse-requests', '/sales', '/inventory', '/packaging'],
  WAREHOUSE_SUPERVISOR: ['/warehouse-requests', '/track-dispatch', '/site-deliveries', '/sales', '/shipments', '/warehouses', '/inventory', '/office'],
  OPERATIONS_MANAGER: ['/production', '/warehouse-requests', '/quality', '/packaging', '/inventory', '/reports'],
};

/**
 * A control center for the people who run part of the company: the work that is waiting for THEM, with real figures, and the pages they run it from.
 * The server decides what appears (from the person's role and the places they are responsible for), so this only shows what it is given.
 */
export function ControlCenter({ accessToken, me }: { accessToken: string; me: MeResponse }) {
  const [view, setView] = useState<ControlCenterView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => controlCenterApi.get(accessToken).then((v) => { if (live) { setView(v); setError(null); } }).catch((e: unknown) => { if (live) setError(e instanceof ApiError ? e.message : 'The control center could not be loaded.'); });
    load();
    const t = setInterval(load, 60000);
    return () => { live = false; clearInterval(t); };
  }, [accessToken]);

  const offered = new Map(visibleNavItems(me).map((i) => [i.href, i]));
  const copy = COPY[view?.role ?? me.roles.map((r) => r.code).find((c) => COPY[c]) ?? ''] ?? COPY.MD;
  const j = view?.jurisdiction;
  const places = j ? [...j.farms, ...j.warehouses, ...j.millingCenters].map((p) => p.name) : [];
  const shortcuts = (SHORTCUTS[view?.role ?? ''] ?? []).map((href) => offered.get(href)).filter((i): i is NonNullable<typeof i> => Boolean(i));

  return (
    <section className="space-y-5" data-testid="control-center" aria-label="Control center">
      <div>
        <p className="font-display text-base italic text-soil-500">Control center</p>
        <h2 className="font-display text-2xl font-medium text-paddy-900" data-testid="cc-title">{copy.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-500">{copy.body}</p>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="cc-error">{error}</p>}
      {!view && !error && <p className="text-sm text-ink-500" data-testid="cc-loading">Loading your control center...</p>}

      {view && j && (
        <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-paddy-100 bg-white px-4 py-3 text-sm text-ink-700" data-testid="cc-jurisdiction">
          <MapPin className="h-4 w-4 shrink-0 text-paddy-700" aria-hidden="true" />
          <span className="font-medium text-paddy-900">Your area:</span>
          {j.everything ? <span>the whole company (every farm, warehouse and milling center)</span>
            : places.length > 0 ? <span>{places.join(', ')}</span>
            : <span className="text-amber-800">no place has been given to you yet. Ask the Administrator to set it, and your figures will appear.</span>}
          <span className="basis-full text-xs text-ink-500">Everything here is limited to your area and to what your role may do.</span>
        </p>
      )}

      {view && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="cc-tiles">
          {view.tiles.map((t) => {
            const body = (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{t.label}</p>
                <p className={`mt-1 font-display text-3xl font-medium ${t.tone === 'warn' ? 'text-amber-800' : 'text-paddy-900'}`} data-testid="cc-count">{t.count.toLocaleString()}</p>
                <p className="mt-1 flex items-center justify-between gap-2 text-xs text-ink-500"><span>{t.hint}</span>{offered.has(t.href) && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-paddy-700" aria-hidden="true" />}</p>
              </>
            );
            const cls = `rounded-2xl border bg-white p-4 transition ${t.tone === 'warn' ? 'border-amber-300' : 'border-paddy-100'}`;
            return offered.has(t.href)
              ? <Link key={t.key} href={t.href} data-testid="cc-tile" data-key={t.key} data-tone={t.tone} className={`${cls} hover:border-paddy-500`}>{body}</Link>
              : <div key={t.key} data-testid="cc-tile" data-key={t.key} data-tone={t.tone} className={cls}>{body}</div>;
          })}
        </div>
      )}

      {shortcuts.length > 0 && (
        <div>
          <h3 className="font-display text-lg font-medium text-paddy-900">Run your area</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shortcuts.map((i) => (
              <Link key={i.href} href={i.href} data-testid="cc-control" className="rounded-2xl border border-paddy-100 bg-white p-4 transition hover:border-paddy-500 hover:shadow-sm">
                <span className="block font-semibold text-paddy-900">{i.label}</span>
                <span className="mt-0.5 block text-sm text-ink-500">{i.description}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
