// Service worker for Sky War Shooter 3D. vite.config.ts (pwaPlugin) fills in the three
// constants below at build time and writes the result to dist/sw.js.
//
// Caches
// - shell-<VERSION>: index.html, the hashed JS/CSS bundles, manifest and icons of this build.
//   A new build gets a new cache; the old one is deleted when the new worker activates.
// - media: models and audio (voice clips too), keyed by file revision (content hash), shared
//   by every build so a deploy only downloads the files that actually changed.
// - fonts: Google Fonts CSS and font files (stale-while-revalidate).
// Strategies
// - Navigations / index.html: network first (fresh deploys show at once), cache when offline.
// - Hashed assets, models, audio: cache first.
// The page registers the worker after its first full load, so the install mostly copies
// files out of the HTTP cache instead of downloading them a second time.
const VERSION = '__VERSION__';
const SHELL = __SHELL__;   // [path]
const MEDIA = __MEDIA__;   // { path: revision }

const SHELL_CACHE = `sws-shell-${VERSION}`;
const MEDIA_CACHE = 'sws-media';
const FONT_CACHE = 'sws-fonts';
const SCOPE = new URL(self.registration.scope);
const rel = (url) => (url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname) ? url.pathname.slice(SCOPE.pathname.length) : null);
const abs = (path) => new URL(path, SCOPE).href;
const mediaKey = (path) => `${abs(path)}?rev=${MEDIA[path]}`;
const SHELL_SET = new Set(SHELL);

async function precacheMedia() {
  const cache = await caches.open(MEDIA_CACHE);
  const have = new Set((await cache.keys()).map((r) => r.url));
  const todo = Object.keys(MEDIA).filter((p) => !have.has(mediaKey(p)));
  // a few at a time; revalidate with the server (the files are not content-hashed by name)
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const p = todo[i++];
      try {
        const r = await fetch(abs(p), { cache: 'no-cache' });
        if (r.ok) await cache.put(mediaKey(p), r);
      } catch { /* offline or gone: fetched again on use */ }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL.map((p) => new Request(abs(p), { cache: 'no-cache' })));
    await precacheMedia();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('sws-shell-') && k !== SHELL_CACHE) await caches.delete(k);
    // drop media revisions this build no longer uses
    const media = await caches.open(MEDIA_CACHE);
    const keep = new Set(Object.keys(MEDIA).map(mediaKey));
    for (const r of await media.keys()) if (!keep.has(r.url)) await media.delete(r);
    await self.clients.claim();
  })());
});

// Network first, but a connection that answers nothing for 3 s gets the cached page
async function networkFirst(request) {
  const shell = await caches.open(SHELL_CACHE);
  const net = fetch(request).then(async (r) => {
    if (r.ok && r.type === 'basic') await shell.put(abs('index.html'), r.clone());
    return r;
  });
  net.catch(() => {});
  const cached = () => shell.match(abs('index.html'));
  try {
    return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))]);
  } catch (e) {
    const hit = await cached();
    if (hit) return hit;
    return net;
  }
}

async function cacheFirstShell(request, path) {
  const shell = await caches.open(SHELL_CACHE);
  const hit = await shell.match(abs(path));
  if (hit) return hit;
  const r = await fetch(request);
  if (r.ok) await shell.put(abs(path), r.clone());
  return r;
}

async function cacheFirstMedia(path) {
  const media = await caches.open(MEDIA_CACHE);
  const key = mediaKey(path);
  const hit = await media.match(key);
  if (hit) return hit;
  const r = await fetch(abs(path), { cache: 'no-cache' });
  if (r.ok) await media.put(key, r.clone());
  return r;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(request);
  const net = fetch(request).then((r) => { if (r.ok || r.type === 'opaque') cache.put(request, r.clone()); return r; }).catch(() => hit);
  return hit ?? net;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  const path = rel(url);
  if (path === null) return;
  if (request.mode === 'navigate' || path === '' || path === 'index.html') { event.respondWith(networkFirst(request)); return; }
  if (path in MEDIA) { event.respondWith(cacheFirstMedia(path)); return; }
  if (SHELL_SET.has(path)) { event.respondWith(cacheFirstShell(request, path)); return; }
});
