/* 俺家的猫厕所 — service worker.
 *
 * Network-first for every same-origin GET, falling back to the cache when the
 * network fails or takes longer than NETWORK_TIMEOUT_MS. Every successful
 * same-origin response is written to the cache, so art added to assets/ later
 * works offline once it has been loaded online.
 *
 * All paths are relative to this file, so the app works from a subdirectory.
 * Bump VERSION when the precache list changes (any byte change to this file
 * also makes browsers install the new worker).
 */
'use strict';

const VERSION = 'v5';
const CACHE_PREFIX = 'cats-toilet-';
const CACHE = CACHE_PREFIX + VERSION;
const NETWORK_TIMEOUT_MS = 3000;

// App shell: must all succeed for the worker to install.
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'css/social.css',
  'js/cats.js',
  'js/game.js',
  'js/api.js',
  'js/account.js',
  'js/plaza.js',
  'manifest.webmanifest',
  'assets/fonts/ZCOOLKuaiLe-Regular.ttf',
  'assets/fonts/Fredoka.ttf',
];

// Game art and icons. Cached best-effort, so a renamed/removed file does not
// block installing a new worker (it is just reported as a warning).
const ART = [
  'assets/room-bg.jpg',
  'assets/bag.png',
  'assets/scoop.png',
  'assets/box-0.png',
  'assets/box-1.png',
  'assets/box-2.png',
  'assets/box-3.png',
  'assets/cats/domestic-orange/sit.png',
  'assets/cats/domestic-orange/squat.png',
  'assets/cats/domestic-orange/sleep.png',
  'assets/cats/domestic-orange/happy.png',
  'assets/cats/domestic-orange/walk-1.png',
  'assets/cats/domestic-orange/walk-2.png',
  'assets/cats/domestic-orange/walk-3.png',
  'assets/cats/domestic-orange/walk-4.png',
  'assets/poop-1.png',
  'assets/poop-2.png',
  'assets/cats/domestic-orange/eat.png',
  'assets/cats/domestic-orange/loaf.png',
  'assets/cats/domestic-orange/groom.png',
  'assets/cats/domestic-orange/yawn.png',
  'assets/tree.png',
  'assets/bed.png',
  'assets/bowl-full.png',
  'assets/bowl-empty.png',
  'assets/rug.png',
  'assets/lamp.png',
  'assets/picture.png',
  'assets/freshener.png',
  'assets/wall-mask.png',
  'assets/plaza-bg.jpg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
];

// Source material that is served by the dev server but is not part of the app,
// and the live API (never answer it from a cache; the event stream must not be
// buffered into one).
const NEVER_CACHE = ['assets/raw/', 'design/', 'tools/', 'api/'].map((p) => new URL(p, self.location).pathname);

// `cache: 'reload'` bypasses the HTTP cache so a fresh install gets fresh files.
const fresh = (url) => new Request(new URL(url, self.location), { cache: 'reload' });

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map(fresh));
    await Promise.all(ART.map((url) => cache.add(fresh(url)).catch((err) => {
      console.warn('[sw] could not precache', url, err);
    })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE)
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((p) => url.pathname.startsWith(p))) return;
  if (req.headers.has('range')) return; // partial responses cannot be cached
  event.respondWith(networkFirst(event));
});

async function networkFirst(event) {
  const req = event.request;
  // Revalidate with the server instead of trusting the HTTP cache, so a
  // stale build is never shown while online.
  const network = fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok && res.status === 200 && res.type === 'basic') {
      const copy = res.clone();
      event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}));
    }
    return res;
  });
  // keep the worker alive until the network settles, even if the cache answered first
  event.waitUntil(network.then(() => {}, () => {}));

  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(resolve, NETWORK_TIMEOUT_MS); });
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    // Network is slow: answer from the cache if we can, otherwise keep waiting.
    const cached = await fromCache(req);
    return cached || await network;
  } catch (err) {
    const cached = await fromCache(req);
    if (cached) return cached;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fromCache(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  if (req.mode === 'navigate') {
    // e.g. index.html?foo or a URL variant we have not seen: serve the shell
    return (await cache.match(req, { ignoreSearch: true }))
      || (await cache.match(new URL('./', self.location).href))
      || (await cache.match(new URL('index.html', self.location).href));
  }
  return undefined;
}
