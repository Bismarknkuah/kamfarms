'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { insightsApi } from '@/lib/api-client';
import { SEVERITY, isWatchlist, type Watchlist } from '@/lib/watchlist';

/**
 * The watchlist's headline for the MD and CEO dashboard. Self-contained: it
 * fetches for itself, shows nothing while loading or if the person is not
 * permitted, and a failure here can never disturb the rest of the dashboard.
 */
export function WatchlistCard({ accessToken }: { accessToken: string | null | undefined }) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'hidden' } | { kind: 'error' } | { kind: 'ok'; data: Watchlist }>({ kind: 'loading' });

  useEffect(() => {
    if (!accessToken) return;
    let live = true;
    insightsApi
      .watchlist(accessToken, 30)
      .then((d) => { if (live) setState(isWatchlist(d) ? { kind: 'ok', data: d } : { kind: 'error' }); })
      .catch((e: unknown) => { if (live) setState((e as { status?: number }).status === 403 ? { kind: 'hidden' } : { kind: 'error' }); });
    return () => { live = false; };
  }, [accessToken]);

  if (state.kind === 'loading' || state.kind === 'hidden') return null;
  if (state.kind === 'error') return <p className="mb-4 rounded-xl bg-rice-50 px-4 py-3 text-sm text-ink-500" data-testid="watchlist-card-error">The watchlist could not be loaded just now.</p>;

  const { summary, signals, locations, windowDays } = state.data;
  const top = signals.filter((s) => s.severity !== 'LOW').slice(0, 3);
  const unjudged = locations.filter((l) => l.status === 'NOT_ENOUGH_DATA').length;
  return (
    <section className="mb-4 rounded-2xl border border-paddy-100 bg-white p-5" data-testid="watchlist-card" aria-labelledby="watchlist-card-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="watchlist-card-title" className="font-display text-lg font-medium text-paddy-900">Watchlist</h2>
          <p className="text-sm text-ink-500">What looks unusual at your farms, warehouses and milling centers, compared with each place&rsquo;s own history over the last {windowDays} days.</p>
        </div>
        <Link href="/oversight?tab=watchlist" className="shrink-0 rounded-full bg-paddy-900 px-4 py-2 text-sm font-medium text-rice-50 transition hover:bg-paddy-700">Open the Watchlist</Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <span className={`rounded-full px-3 py-1 font-medium ${SEVERITY.HIGH.chip}`} data-testid="watchlist-card-high">{summary.high} to look into</span>
        <span className={`rounded-full px-3 py-1 font-medium ${SEVERITY.MEDIUM.chip}`} data-testid="watchlist-card-medium">{summary.medium} to keep an eye on</span>
        {summary.low > 0 && <span className={`rounded-full px-3 py-1 font-medium ${SEVERITY.LOW.chip}`}>{summary.low} for information</span>}
      </div>
      {top.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {top.map((s) => (
            <li key={s.id} className="flex items-start gap-2 text-sm text-ink-700" data-testid="watchlist-card-item">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY[s.severity].dot}`} aria-hidden="true" />{s.title}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-700">Nothing looks unusual right now.{unjudged > 0 ? ` ${unjudged} ${unjudged === 1 ? 'place does' : 'places do'} not have enough records to be judged yet.` : ''}</p>
      )}
      <p className="mt-3 text-xs text-ink-500">A flag means worth a look, not proof.</p>
    </section>
  );
}
