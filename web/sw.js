/* Service worker: l'app funziona anche senza connessione. */
var CACHE = 'airsoft-conflict-v28';
var FILES = [
  './', 'index.html', 'app.css', 'app.js', 'db.js', 'qr.js', 'vendor/jsQR.js', 'utm.js', 'mappe.js', 'fazioni.js', 'pcs.js', 'dmz.js', 'mortaio.js', 'config.js', 'manifest.webmanifest',
  'img/logo.png', 'img/icon-192.png', 'img/icon-512.png', 'img/icon-maskable-512.png', 'img/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // font Google: salvati in cache al primo uso
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' ||
      (url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0)) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; });
        return hit || net;
      });
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // pagine di servizio dell'accesso Google (/__/auth/...): mai intercettate né salvate
  if (url.pathname.indexOf('/__/') === 0) return;
  // file dell'app: rete prima (così gli aggiornamenti arrivano), cache se offline
  // sempre verificata col server (no-cache), così pagina e script restano della stessa versione
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) { return hit || caches.match('index.html'); });
  }));
});
