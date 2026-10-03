'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleCheck, CircleHelp, RefreshCw, TriangleAlert } from 'lucide-react';
import { ApiError, insightsApi } from '@/lib/api-client';
import { CONFIDENCE_LABEL, KIND_LABEL, SEVERITY, STATUS, TAB_LABEL, type LocationKind, type Severity, type Watchlist, isWatchlist } from '@/lib/watchlist';
import type { OversightTab } from './OverviewPanel';

const PERIODS = [14, 30, 60, 90];
const KINDS: LocationKind[] = ['MILLING_CENTER', 'WAREHOUSE', 'FARM'];

function Pill({ on, onClick, children, count }: { on: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${on ? 'border-paddy-900 bg-paddy-900 text-rice-50' : 'border-paddy-100 bg-white text-ink-700 hover:bg-rice-50'}`}
    >
      {children}
      {count !== undefined && <span className={`ml-1.5 text-xs ${on ? 'text-paddy-100' : 'text-ink-500'}`}>{count}</span>}
    </button>
  );
}

/**
 * Where recent records look unusual compared with each place's own history.
 * It is a place to decide where to look first, never a verdict, and it says
 * so on the screen. Loads the first time the tab is opened.
 */
export function WatchlistPanel({ accessToken, active, goTab }: { accessToken: string; active: boolean; goTab: (t: OversightTab) => void }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Watchlist | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [kind, setKind] = useState<'ALL' | LocationKind>('ALL');
  const [severity, setSeverity] = useState<'ALL' | Severity>('ALL');

  const load = useCallback(async (d: number) => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await insightsApi.watchlist(accessToken, d);
      if (!isWatchlist(res)) throw new Error('unexpected reply');
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The watchlist could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (active && !started && accessToken) {
      setStarted(true);
      void load(days);
    }
  }, [active, started, accessToken, days, load]);

  const signals = (data?.signals ?? []).filter((s) => (kind === 'ALL' || s.locationKind === kind) && (severity === 'ALL' || s.severity === severity));
  const unjudged = data?.locations.filter((l) => l.status === 'NOT_ENOUGH_DATA').length ?? 0;
  const tile = (sev: Severity, n: number) => (
    <button
      key={sev}
      type="button"
      data-testid={`watch-tile-${sev.toLowerCase()}`}
      aria-pressed={severity === sev}
      onClick={() => setSeverity(severity === sev ? 'ALL' : sev)}
      className={`rounded-2xl border bg-white p-4 text-left transition hover:bg-rice-50 ${severity === sev ? 'ring-2 ring-paddy-900' : 'border-paddy-100'}`}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-ink-700"><span className={`h-2.5 w-2.5 rounded-full ${SEVERITY[sev].dot}`} aria-hidden="true" />{SEVERITY[sev].label}</span>
      <span className="mt-1 block font-display text-3xl font-medium text-paddy-900">{n}</span>
    </button>
  );

  return (
    <div className="space-y-6" data-testid="watchlist-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="font-display text-2xl font-medium text-paddy-900">Watchlist</h2>
          <p className="mt-1 text-sm text-ink-700">
            Each farm, warehouse and milling center is compared with <strong>its own earlier records</strong>: how much rice its paddy gave, how much power it used, how much paddy arrived, what was written down, and what was spent.
            What looks unusual is listed here with the numbers behind it.
          </p>
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            A flag means <strong>worth a look, not proof of wrongdoing</strong>. Harvest seasons, repairs and honest mistakes cause them too. Use this to decide where to look first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="watch-days" className="text-sm text-ink-500">Last</label>
          <select
            id="watch-days"
            value={days}
            onChange={(e) => { const n = Number(e.target.value); setDays(n); void load(n); }}
            className="rounded-lg border border-paddy-100 bg-white px-3 py-2 text-sm"
          >
            {PERIODS.map((p) => <option key={p} value={p}>{p} days</option>)}
          </select>
          <button type="button" onClick={() => void load(days)} disabled={loading} className="inline-flex items-center gap-1.5 rounded-full border border-paddy-100 bg-white px-3.5 py-2 text-sm font-medium text-ink-700 hover:bg-rice-50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {loading && !data && <p className="text-sm text-ink-500" role="status">Checking every farm, warehouse and milling center…</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tile('HIGH', data.summary.high)}
            {tile('MEDIUM', data.summary.medium)}
            {tile('LOW', data.summary.low)}
            <div className="rounded-2xl border border-paddy-100 bg-white p-4" data-testid="watch-tile-places">
              <span className="text-sm font-medium text-ink-700">Places to look into</span>
              <span className="mt-1 block font-display text-3xl font-medium text-paddy-900">{data.summary.placesToInvestigate}</span>
            </div>
          </div>
          <p className="text-xs text-ink-500">Checked {new Date(data.generatedAt).toLocaleString()} against the last {data.windowDays} days.</p>

          <section aria-labelledby="watch-places">
            <h3 id="watch-places" className="font-display text-lg font-medium text-paddy-900">Place by place</h3>
            <div className="mt-3 grid gap-4 lg:grid-cols-3">
              {KINDS.map((k) => {
                const places = data.locations.filter((l) => l.kind === k);
                return (
                  <div key={k} className="rounded-2xl border border-paddy-100 bg-white p-4">
                    <p className="text-sm font-semibold text-paddy-900">{KIND_LABEL[k].plural}</p>
                    {places.length === 0 ? <p className="mt-2 text-sm text-ink-500">None set up.</p> : (
                      <ul className="mt-2 divide-y divide-paddy-100">
                        {places.map((l) => (
                          <li key={l.id} data-testid="watch-place" data-status={l.status} className="py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-ink-900">{l.name}</span>
                              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS[l.status].chip}`}>{STATUS[l.status].label}</span>
                            </div>
                            <details className="mt-1">
                              <summary className="cursor-pointer text-xs text-ink-500">What was checked</summary>
                              <ul className="mt-1.5 space-y-1 text-xs text-ink-700">
                                {l.checked.map((c) => <li key={c} className="flex items-start gap-1.5"><CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />{c}</li>)}
                                {l.skipped.map((c) => <li key={c} className="flex items-start gap-1.5"><CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" aria-hidden="true" />Could not check: {c}</li>)}
                              </ul>
                            </details>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
            {unjudged > 0 && <p className="mt-2 text-xs text-ink-500">{unjudged} {unjudged === 1 ? 'place does' : 'places do'} not have enough approved records yet to be judged. That is not the same as being fine.</p>}
          </section>

          <section aria-labelledby="watch-flags">
            <h3 id="watch-flags" className="font-display text-lg font-medium text-paddy-900">What looks unusual</h3>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by kind of place">
              <Pill on={kind === 'ALL'} onClick={() => setKind('ALL')} count={data.signals.length}>All</Pill>
              {KINDS.map((k) => <Pill key={k} on={kind === k} onClick={() => setKind(k)} count={data.signals.filter((s) => s.locationKind === k).length}>{KIND_LABEL[k].plural}</Pill>)}
              {severity !== 'ALL' && <Pill on onClick={() => setSeverity('ALL')}>{SEVERITY[severity].label} (clear filter)</Pill>}
            </div>

            {signals.length === 0 ? (
              <p className="mt-4 flex items-start gap-2 rounded-2xl border border-paddy-100 bg-white p-5 text-sm text-ink-700" data-testid="watch-empty">
                <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                {data.signals.length === 0
                  ? `Nothing looks unusual in the last ${data.windowDays} days compared with each place's own history.${unjudged > 0 ? ' Some places could not be judged yet: see above.' : ''}`
                  : 'Nothing matches this filter.'}
              </p>
            ) : (
              <ul className="mt-4 space-y-4">
                {signals.map((s) => (
                  <li key={s.id} data-testid="watch-signal" data-severity={s.severity} data-code={s.code} className={`rounded-2xl border bg-white p-5 ${SEVERITY[s.severity].card}`}>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold ${SEVERITY[s.severity].chip}`}>
                        {s.severity === 'HIGH' && <TriangleAlert className="h-3 w-3" aria-hidden="true" />}{SEVERITY[s.severity].label}
                      </span>
                      <span className="text-ink-500">{KIND_LABEL[s.locationKind].singular}</span>
                      <span className="ml-auto text-ink-500">{CONFIDENCE_LABEL[s.confidence]}</span>
                    </div>
                    <h4 className="mt-2 font-display text-lg font-medium text-paddy-900">{s.title}</h4>
                    <p className="mt-1 text-sm text-ink-700">{s.detail}</p>
                    {(s.expected || s.actual) && (
                      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                        {s.expected && <div className="rounded-xl bg-rice-50 px-3 py-2"><dt className="text-xs font-medium text-ink-500">What its history predicts</dt><dd className="mt-0.5 text-sm font-medium text-ink-900">{s.expected}</dd></div>}
                        {s.actual && <div className="rounded-xl bg-rice-50 px-3 py-2"><dt className="text-xs font-medium text-ink-500">What was recorded</dt><dd className="mt-0.5 text-sm font-medium text-ink-900">{s.actual}</dd></div>}
                      </dl>
                    )}
                    {s.evidence.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Records behind this">
                        {s.evidence.map((e) => <li key={e} className="rounded-full border border-paddy-100 px-2.5 py-0.5 font-mono text-xs text-ink-700">{e}</li>)}
                      </ul>
                    )}
                    <p className="mt-3 rounded-lg bg-amber-50/70 px-3 py-2 text-sm text-ink-700"><span className="font-medium">What to check: </span>{s.whatToCheck}</p>
                    <button type="button" onClick={() => { goTab(s.tab); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="mt-3 text-sm font-medium text-paddy-900 underline underline-offset-2 hover:text-paddy-700">
                      Open the {TAB_LABEL[s.tab]} figures
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
