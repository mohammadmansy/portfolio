/* ============================================================
   Stack — service worker
   Offline-first app shell: the whole game is local, so once it
   has been seen once it never needs the network again.

   Bump CACHE on every release that changes any core asset.
   ============================================================ */

const CACHE = 'stack-v1';

const CORE = [
  './',
  './index.html',
  './css/game.css',
  './manifest.webmanifest',
  './js/config.js',
  './js/storage.js',
  './js/audio.js',
  './js/input.js',
  './js/renderer.js',
  './js/game.js',
  './js/ui.js',
  './js/main.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // add() would abort the whole install if a single URL failed;
      // tolerate individual misses so one bad asset never costs offline play.
      .then((cache) => Promise.all(CORE.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
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
  const request = event.request;

  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Navigations resolve to the cached shell when the network is gone.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./')))
    );
    return;
  }

  // Everything else is cache-first, refreshed behind the scenes so a
  // new release is picked up on the next launch without a hard reload.
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);

      return hit || network;
    })
  );
});
