'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, type OverviewDays } from '@/lib/api-client';

/** Loads one analytics view for a time range. Keeps the last good answer on screen while a new range loads, and says plainly when it fails. */
export function useOverviewAnalytics<T>(load: (days: OverviewDays) => Promise<T>, initial: OverviewDays = 30) {
  const [days, setDays] = useState<OverviewDays>(initial);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const seq = useRef(0);

  const refresh = useCallback(() => {
    const mine = ++seq.current;
    setLoading(true);
    loadRef.current(days)
      .then((d) => { if (mine === seq.current) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (mine === seq.current) setError(e instanceof ApiError ? e.message : 'The analytics could not be loaded.'); })
      .finally(() => { if (mine === seq.current) setLoading(false); });
  }, [days]);

  useEffect(() => { refresh(); }, [refresh]);
  return { days, setDays, data, error, loading, refresh };
}
