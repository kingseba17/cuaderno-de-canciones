// Service worker: guarda la app en el teléfono para que funcione sin internet.
// Solo guarda el CÓDIGO de la app. Tus letras y audios viven en IndexedDB, no aquí.
//
// Al publicar cambios: sube VERSION (y APP_VERSION en js/version.js). La app avisará
// "Hay una versión nueva" y se actualiza con un toque.

const VERSION = '1.1.0';
const CACHE = `cuaderno-${VERSION}`;

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'data/rhyme-index.json',
  'icons/icon-32.png',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'js/app.js',
  'js/backup.js',
  'js/db.js',
  'js/dictionary.js',
  'js/export.js',
  'js/ideas-flow.js',
  'js/ideas.js',
  'js/metrics.js',
  'js/songs.js',
  'js/ui.js',
  'js/version.js',
  'js/audio/deck.js',
  'js/audio/notes.js',
  'js/audio/player.js',
  'js/audio/record-flow.js',
  'js/audio/recorder.js',
  'js/rhyme/loader.js',
  'js/rhyme/panel.js',
  'js/rhyme/phonetics.js',
  'js/rhyme/search.js',
  'js/views/editor.js',
  'js/views/ideas.js',
  'js/views/print.js',
  'js/views/rhymes.js',
  'js/views/settings.js',
  'js/views/songs.js',
];

// En el computador (localhost) primero se pide a la red, para ver siempre los cambios al programar.
const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('cuaderno-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isPage = req.mode === 'navigate';
  event.respondWith(DEV ? networkFirst(req, isPage) : cacheFirst(req, isPage));
});

async function cacheFirst(req, isPage) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(isPage ? 'index.html' : req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && !isPage) cache.put(req, res.clone());
    return res;
  } catch {
    return (isPage && (await cache.match('index.html'))) || Response.error();
  }
}

async function networkFirst(req, isPage) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(isPage ? 'index.html' : req, res.clone());
    return res;
  } catch {
    return (await cache.match(isPage ? 'index.html' : req, { ignoreSearch: true })) || Response.error();
  }
}
