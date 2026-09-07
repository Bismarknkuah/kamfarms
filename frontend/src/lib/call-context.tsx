'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useCallManager, CallManagerState } from './use-call-manager';
import { authApi, MeResponse } from './api-client';

const CallContext = createContext<CallManagerState | null>(null);

// Deliberately mounted at the true root of the app (the root layout),
// not inside DashboardShell - a real bug caught by the actual
// production build (not just tsc): a page component calling useCall()
// at the top of its own function body executes before whatever JSX it
// later returns (including DashboardShell) ever mounts, so a provider
// nested inside DashboardShell can never be an ancestor of the page
// that's supposed to consume it. Being at the root layout means every
// page, including ones with no logged-in user yet (login,
// reset-password), is a true descendant.
//
// Deliberately does NOT reuse useCurrentUser() here - that hook
// redirects to /login whenever no token is found, which is correct
// for an actual protected page but would be a real bug here: this
// provider also mounts on /login itself (as part of the root layout),
// and would otherwise force a redirect-to-/login loop before anyone
// even gets a chance to log in. A silent, side-effect-free check
// instead: no token yet simply means no call connection yet, nothing
// more.
//
// Re-checks on every route change (not just once on mount) - the root
// layout does not remount between pages in the App Router, so without
// this, logging in and navigating away from /login would never
// re-read the token that login just stored.
export function CallProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('kam_roms_access_token') : null;
    if (!token) {
      setAccessToken(null);
      setMe(null);
      return;
    }
    setAccessToken(token);
    authApi.me(token).then(setMe).catch(() => setMe(null));
  }, [pathname]);

  const call = useCallManager(me, accessToken);
  return <CallContext.Provider value={call}>{children}</CallContext.Provider>;
}

export function useCall(): CallManagerState {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall() must be used within a CallProvider (the root layout already provides this).');
  return ctx;
}
