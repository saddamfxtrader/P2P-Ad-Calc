/* Binance Spot Calculator — Service Worker (v8)
   - Offline app shell cache
   - Never cache Binance API responses
   - Cleanup old caches
*/
const CACHE = 'spot-shell-v8';
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

  // Never cache Binance API — live data must be fresh
  if (url.hostname.endsWith('binance.com')) {
    e.respondWith(fetch(req).catch(() => new Response('', {status:503})));
    return;
  }

  // Navigation: network-first, fallback cached shell
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

  // Same-origin GET: cache-first
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
