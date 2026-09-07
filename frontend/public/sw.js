// KAM-ROMS service worker.
//
// Scope, stated honestly: this makes the app installable (a real
// requirement most browsers check for before offering "Add to Home
// Screen") and caches the static app shell so the UI itself loads
// instantly on repeat visits. It does NOT cache API responses or
// attempt to fake offline access to live farm/warehouse/sales data —
// that would need a much more careful sync strategy (stale data shown
// as if current is worse than no data at all for an operations system
// people make real decisions from). Every API call still goes straight
// to the network, and fails honestly if there's no connection.

const CACHE_NAME = 'kam-roms-shell-v1';
const APP_SHELL = ['/', '/login', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {
      // A failed pre-cache shouldn't block installation — the app still
      // works, it just won't have this specific offline shell cached yet.
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never intercept API calls — always hit the real backend, always
  // fail honestly rather than serve stale operational data.
  if (request.url.includes('/api/')) return;

  // Static assets and pages: try the network first (so users always get
  // the latest deployed version when online), fall back to the cached
  // shell only when the network genuinely isn't available.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/login'))),
  );
});
