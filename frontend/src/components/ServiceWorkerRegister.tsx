'use client';

import { useEffect } from 'react';

/** Registers the service worker once, silently — no UI, no user-facing
 * behavior. Runs in every page via the root layout since it's cheap and
 * idempotent (the browser no-ops a re-registration of the same script). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability/offline shell is a nice-to-have — a failed
      // registration should never break the app itself.
    });
  }, []);

  return null;
}
