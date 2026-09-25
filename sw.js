/* Service worker: permite usar la app sin conexión */
const CACHE = 'mi-cartera-v29';
const ASSETS = [
  './', 'index.html', 'css/styles.css', 'js/data.js', 'js/store.js', 'js/app.js', 'js/calculadora.js', 'js/vehicular.js', 'js/firebase-config.js', 'js/nube.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'data/tipo-cambio.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Red primero (para recibir actualizaciones), caché como respaldo.
   Se guarda sin parámetros (?v=...) para no llenar la caché con copias. */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const key = url.origin + url.pathname;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
        return res;
      })
      .catch(() => caches.match(key).then(r => r || caches.match('index.html')))
  );
});
