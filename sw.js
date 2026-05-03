/*
 * NurseChart EMR — Service Worker
 * Enables offline use, app installation, and fast load times.
 * Strategy: Cache-first for app shell assets, network-first for everything else.
 */

const CACHE_NAME = 'nursechart-v1';

// All files that make up the app shell — cached on install
const APP_SHELL = [
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // Google Fonts — cached when first fetched
];

/* ── INSTALL: pre-cache the app shell ── */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL);
    }).then(function() {
      // Take control immediately without waiting for old SW to die
      return self.skipWaiting();
    })
  );
});

/* ── ACTIVATE: clean up old caches ── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key)   { return caches.delete(key);  })
      );
    }).then(function() {
      // Claim all open clients so the new SW is active immediately
      return self.clients.claim();
    })
  );
});

/* ── FETCH: serve from cache, fall back to network ── */
self.addEventListener('fetch', function(event) {
  // Only handle GET requests for same-origin or Google Fonts
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isFont = url.hostname === 'fonts.googleapis.com' ||
                 url.hostname === 'fonts.gstatic.com';
  const isAppFile = url.origin === self.location.origin;

  if (!isAppFile && !isFont) return;

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;

      // Not in cache — fetch from network and cache it
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200) return response;

        var toCache = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, toCache);
        });

        return response;
      }).catch(function() {
        // Offline and not cached — return offline fallback for HTML
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
