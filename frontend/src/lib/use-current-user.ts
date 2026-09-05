'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, MeResponse, ApiError } from './api-client';

/**
 * Shared session-check + /auth/me fetch, used by every authenticated
 * page. Previously duplicated (with slightly different bugs) across
 * dashboard/page.tsx and farms/page.tsx — one real implementation now.
 *
 * IMPORTANT: `accessToken` becomes available a render cycle *before*
 * `me` does — the token is read synchronously from sessionStorage, but
 * `me` only arrives once the async `/auth/me` call resolves. A real bug
 * shipped from this exact gap: any `useEffect` that calls
 * `hasPermission(...)` to decide whether to fetch something, but only
 * depends on `[accessToken]`, will evaluate `hasPermission` while `me`
 * is still null — permanently short-circuiting the fetch, even for
 * users who do hold the permission, since the effect never re-runs once
 * `me` populates. If an effect's fetch decision depends on
 * `hasPermission`, its dependency array must include `me`, not just
 * `accessToken`. Effects that only need `accessToken` itself (most list
 * pages, which don't gate on a permission before fetching) are
 * unaffected and don't need this.
 */
export function useCurrentUser() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('kam_roms_access_token') : null;
    if (!token) {
      router.replace('/login');
      return;
    }
    setAccessToken(token);
    authApi
      .me(token)
      .then(setMe)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Your session has expired. Please sign in again.');
        router.replace('/login');
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasPermission = (code: string | string[]) => {
    const codes = Array.isArray(code) ? code : [code];
    return codes.some((c) => me?.permissions.includes(c) ?? false);
  };

  return { me, accessToken, loading, error, hasPermission };
}
