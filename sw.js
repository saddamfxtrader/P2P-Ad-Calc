/* Binance Spot Calculator — Service Worker
   Strategy:
   - App shell (HTML/JS/CSS) → network-first with cache fallback
   - Binance API → never cached, always network (live data must be fresh)
   - Old cache versions safely purged on activate
*/
const CACHE = 'spot-calc-shell-v2';
const SHELL = ['./', './index.html', './sw.js'];
const SHELL_TIMEOUT = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Binance API: network only, short timeout, no cache
  if (url.hostname.endsWith('binance.com')) {
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(req, { cache: 'no-store' });
          return res;
        } catch (err) {
          // graceful offline response
          return new Response(
            JSON.stringify({ error: 'offline' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
      })()
    );
    return;
  }

  // Navigation: network-first, fallback to cached shell
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        try {
          const res = await Promise.race([
            fetch(req),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), SHELL_TIMEOUT))
          ]);
          const cp = res.clone();
          caches.open(CACHE).then(c => c.put(req, cp)).catch(()=>{});
          return res;
        } catch (err) {
          const hit = await caches.match(req);
          if (hit) return hit;
          return (await caches.match('./index.html')) ||
                 new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Other same-origin GETs: cache-first, refresh in background
  if (req.method === 'GET' && url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit => {
        const network = fetch(req).then(res => {
          if (res && res.ok) {
            const cp = res.clone();
            caches.open(CACHE).then(c => c.put(req, cp)).catch(()=>{});
          }
          return res;
        }).catch(()=>hit);
        return hit || network;
      })
    );
    return;
  }

  // Default: pass-through
});
