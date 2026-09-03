// Seva Pass service worker.
// - Navigations: network-first, falling back to the cached app shell (works offline).
// - Hashed static assets (Vite output, e.g. /assets/index-XXXX.js): cache-first — safe
//   because Vite gives each build's files a new hash, so a stale cache entry can never
//   shadow a new build's file.
// - Everything else (non-hashed files like icons, manifest): network-first, falling
//   back to cache. Cache-first here previously meant an already-installed service
//   worker could go on serving old assets indefinitely, because this file's own bytes
//   don't change between deploys (it isn't run through Vite's build), so browsers never
//   detected an update to install. CACHE_VERSION below exists to force that update: bump
//   it whenever the caching strategy itself changes.
// - API calls are never intercepted.
const CACHE_VERSION = 'v4';
const CACHE = `seva-pass-${CACHE_VERSION}`;
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

const isHashedAsset = (pathname) => /^\/assets\/.+-[A-Za-z0-9_-]{6,}\.(js|css)$/.test(pathname);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // never cache API responses

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Hashed build output: cache-first is safe and fast, the hash guarantees freshness.
  if (isHashedAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Everything else: network-first so a new deploy's icons/manifest/etc show up
  // immediately, with the cache only as an offline fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
