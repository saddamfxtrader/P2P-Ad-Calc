/* PEPE Smart Trader - Service Worker (offline-first app shell)
   Strategy:
     - Cache same-origin static app shell (index.html, sw.js).
     - Do NOT cache Binance API (always network) so live prices stay fresh.
     - Fallback to cached index.html for navigation requests when offline.

   Cache bumped to v5 to ship the v8.3 logical cleanup.
*/
const CACHE = 'pepe-shell-v5';
const SHELL = ['./', './index.html', './sw.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

if (url.hostname.endsWith('mexc.com')) {
    e.respondWith(fetch(req).catch(() => new Response('', {status:503})));
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const cp = res.clone();
        caches.open(CACHE).then(c => c.put(req, cp)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (req.method === 'GET' && url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const cp = res.clone();
        caches.open(CACHE).then(c => c.put(req, cp)).catch(() => {});
        return res;
      }).catch(() => hit))
    );
    return;
  }
});
