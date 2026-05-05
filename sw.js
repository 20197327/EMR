/*
 * NurseChart EMR — Service Worker v3
 * Strategy: Network-first for app files (always get latest),
 * cache as fallback for offline use.
 */

const CACHE_NAME = 'nursechart-v3';

const APP_SHELL = [
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

/* ── INSTALL: pre-cache app shell ── */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* ── ACTIVATE: delete ALL old caches ── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          /* Delete every cache that isn't the current one */
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ── FETCH: network-first, cache as offline fallback ── */
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isFont = url.hostname === 'fonts.googleapis.com' ||
                 url.hostname === 'fonts.gstatic.com';
  const isAppFile = url.origin === self.location.origin;

  if (!isAppFile && !isFont) return;

  event.respondWith(
    /* Always try network first */
    fetch(event.request).then(function(response) {
      if (response && response.status === 200) {
        /* Update cache with fresh copy */
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, copy);
        });
      }
      return response;
    }).catch(function() {
      /* Offline — serve from cache */
      return caches.match(event.request).then(function(cached) {
        return cached || (
          event.request.destination === 'document'
            ? caches.match('./index.html')
            : null
        );
      });
    })
  );
});
