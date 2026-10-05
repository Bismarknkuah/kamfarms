import { useCallback, useEffect, useState } from 'react';
import { ApiError, type DispatchJourney, type DispatchTrackingView, type MoneyOverview, type MoneyPeriod, dispatchTrackingApi, financeCenterApi } from '@/lib/api-client';

/** The company's money for a period; keeps what is on screen while the next period loads, and refreshes by itself. */
export function useMoney(accessToken: string) {
  const [period, setPeriod] = useState<MoneyPeriod>('month');
  const [data, setData] = useState<MoneyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback((p: MoneyPeriod) => financeCenterApi.overview(accessToken, p)
    .then((v) => { setData(v); setError(null); })
    .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'The company\'s money could not be loaded.'))
    .finally(() => setLoading(false)), [accessToken]);
  useEffect(() => { setLoading(true); load(period); const t = setInterval(() => load(period), 90_000); return () => clearInterval(t); }, [period, load]);
  const refresh = () => { setLoading(true); load(period); };
  return { period, setPeriod, data, error, loading, refresh };
}

/** Every dispatch (trucks, paddy and rice transfers) with who has it and whether it is late. */
export function useDispatch(accessToken: string) {
  const [view, setView] = useState<DispatchTrackingView | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => dispatchTrackingApi.list(accessToken, 'all').then((v) => { if (live && v && Array.isArray(v.journeys)) setView(v); }).catch(() => {});
    load(); const t = setInterval(load, 60_000);
    return () => { live = false; clearInterval(t); };
  }, [accessToken]);
  return view;
}

export interface DispatchFacts { open: number; delivered: number; lateNow: DispatchJourney[]; waitingReview: number; onTimePct: number | null; deliveredLate: number }
/** What the dispatch list says in numbers. "On time" is the delivered ones that were not late. */
export function dispatchFacts(view: DispatchTrackingView | null): DispatchFacts | null {
  if (!view) return null;
  const done = view.journeys.filter((j) => j.status === 'DELIVERED');
  const late = done.filter((j) => j.late).length;
  return {
    open: view.journeys.filter((j) => j.status !== 'DELIVERED').length, delivered: done.length,
    lateNow: view.journeys.filter((j) => j.status !== 'DELIVERED' && j.late), waitingReview: view.counts.review ?? 0,
    onTimePct: done.length > 0 ? ((done.length - late) / done.length) * 100 : null, deliveredLate: late,
  };
}
