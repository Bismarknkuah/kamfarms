'use client';

import { useEffect, useState } from 'react';
import { canDo } from './access';
import { useRouter } from 'next/navigation';
import { authApi, MeResponse, ApiError } from './api-client';

/**
 * Shared session-check + /auth/me fetch, used by every authenticated
 * page. Previously duplicated (with slightly different bugs) across
 * dashboard/page.tsx and farms/page.tsx - one real implementation now.
 *
 * IMPORTANT: `accessToken` becomes available a render cycle *before*
 * `me` does - the token is read synchronously from sessionStorage, but
 * `me` only arrives once the async `/auth/me` call resolves. A real bug
 * shipped from this exact gap: any `useEffect` that calls
 * `hasPermission(...)` to decide whether to fetch something, but only
 * depends on `[accessToken]`, will evaluate `hasPermission` while `me`
 * is still null - permanently short-circuiting the fetch, even for
 * users who do hold the permission, since the effect never re-runs once
 * `me` populates. If an effect's fetch decision depends on
 * `hasPermission`, its dependency array must include `me`, not just
 * `accessToken`. Effects that only need `accessToken` itself (most list
 * pages, which don't gate on a permission before fetching) are
 * unaffected and don't need this.
 */
const TOKEN_KEY = 'kam_roms_access_token';

/**
 * The last person we loaded, kept while the website stays open. Without it every page began with "no user yet" and showed a bare full-screen
 * "Loading..." (no menu, no top bar) until /auth/me came back, so every click, and every jump from the search box, blanked the whole screen.
 * With it a page opens straight away with the menu in place, and /auth/me still runs in the background to bring anything that changed up to date.
 * It is used only for the SAME sign-in (the token must match), never for the next person who signs in on this screen.
 */
let remembered: { token: string; me: MeResponse } | null = null;
const rememberedFor = (token: string | null) => (remembered && token && remembered.token === token ? remembered : null);
const readToken = () => (typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null);

export function useCurrentUser() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(() => rememberedFor(readToken())?.me ?? null);
  const [accessToken, setAccessToken] = useState<string | null>(() => (rememberedFor(readToken()) ? readToken() : null));
  const [loading, setLoading] = useState(() => !rememberedFor(readToken()));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = readToken();
    if (!token) {
      remembered = null;
      router.replace('/login');
      return;
    }
    setAccessToken(token);
    authApi
      .me(token)
      .then((m) => { remembered = { token, me: m }; setMe(m); })
      .catch((err: unknown) => {
        remembered = null;
        setError(err instanceof ApiError ? err.message : 'Your session has expired. Please sign in again.');
        router.replace('/login');
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The System Administrator may do everything (see lib/access.ts); everyone else only what the server listed.
  const hasPermission = (code: string | string[]) => canDo(me, code);

  return { me, accessToken, loading, error, hasPermission };
}
