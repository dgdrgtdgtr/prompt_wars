/**
 * EcoTrace Service Worker
 * Caches all static assets for offline use and faster repeat loads.
 * Strategy: Cache First for assets, Network First for API calls.
 */

const CACHE_NAME = 'ecotrace-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/src/styles.css',
  '/src/app.js',
];

// Install: pre-cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for static, network-first for API
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Always go network-first for API calls
  if (request.url.includes('api.anthropic.com') || request.url.includes('fonts.googleapis.com')) {
    event.respondWith(
      fetch(request).catch(() => new Response('Network unavailable', { status: 503 }))
    );
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const toCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, toCache));
        return response;
      });
    })
  );
});
