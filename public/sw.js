// AI Learning Buddy — Service Worker
// Strategi:
//  • Aset statis (JS/CSS/font/gambar)  → stale-while-revalidate (instan, anti-lemot).
//  • Navigasi/HTML                     → network-first (selalu segar, fallback cache).
//  • /api/* dan non-GET                → selalu langsung ke jaringan (jangan di-cache).
const CACHE_NAME = 'ai-buddy-shell-v2';
const CORE_ASSETS = ['/', '/buddy'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

function isStaticAsset(url) {
  return /\.(?:js|mjs|css|woff2?|ttf|otf|eot|png|jpg|jpeg|gif|svg|webp|ico)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Jangan ganggu API & WebSocket (data dinamis harus selalu segar).
  if (url.pathname.startsWith('/api/')) return;

  const isNavigation = request.mode === 'navigate' || request.destination === 'document';

  // 1) Aset statis same-origin → stale-while-revalidate (kembalikan cache dulu, perbarui di background).
  if (isStaticAsset(url) && url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((response) => {
              if (response && response.ok && response.type === 'basic') cache.put(request, response.clone());
              return response;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // 2) Navigasi/HTML → network-first (segar), fallback ke cache/shell saat offline.
  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => null);
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/buddy') || caches.match('/')))
    );
    return;
  }

  // 3) Lainnya → coba jaringan, fallback cache.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => null);
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
