#!/usr/bin/env node
// Runs dist/sw.js in Node against a mock service-worker global (Cache Storage, events) and a
// real server, then checks: install precaches the shell and every model/audio file, offline
// requests are answered from the cache, and a second build only downloads changed files and
// drops the old caches.
//
//   npx vite build && npx vite preview --port 5193 &   (or any static server of dist/)
//   node tools/test_sw.mjs [dist] [http://127.0.0.1:5193/]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const dist = process.argv[2] ?? 'dist';
const base = process.argv[3] ?? 'http://127.0.0.1:5193/';
const src = readFileSync(join(dist, 'sw.js'), 'utf8');

// ---- Cache Storage mock (one shared store, like the browser's) ----
const store = new Map();
const keyOf = (r) => (typeof r === 'string' ? r : r.url);
class MockCache {
  constructor() { this.m = new Map(); }
  async match(r) { const v = this.m.get(keyOf(r)); return v ? v.clone() : undefined; }
  async put(r, res) { this.m.set(keyOf(r), await res.clone()); }
  async add(r) { const res = await env.fetch(r); if (!res.ok) throw new Error('add failed ' + keyOf(r)); await this.put(r, res); }
  async addAll(rs) { await Promise.all(rs.map((r) => this.add(r))); }
  async keys() { return [...this.m.keys()].map((url) => ({ url })); }
  async delete(r) { return this.m.delete(keyOf(r)); }
}
const caches = {
  async open(n) { if (!store.has(n)) store.set(n, new MockCache()); return store.get(n); },
  async keys() { return [...store.keys()]; },
  async delete(n) { return store.delete(n); },
  async match(r) { for (const c of store.values()) { const v = await c.match(r); if (v) return v; } },
};

// ---- network: counted, can go offline ----
const env = { online: true, fetches: 0 };
env.fetch = async (input, init) => {
  if (!env.online) throw new TypeError('Failed to fetch (offline)');
  env.fetches++;
  const url = typeof input === 'string' ? input : input.url;
  return fetch(url, { headers: init?.headers }); // Node's fetch has no HTTP cache: drop the cache mode
};

function boot(code) {
  const handlers = {};
  const self = {
    registration: { scope: base },
    addEventListener: (t, f) => { handlers[t] = f; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(code, { self, caches, fetch: (...a) => env.fetch(...a), URL, Request, Response, Promise, setTimeout, console, Set, Map, Object, JSON, Error });
  const run = async (type, extra = {}) => {
    let p = null, resp = null;
    handlers[type]({ ...extra, waitUntil: (x) => { p = x; }, respondWith: (x) => { resp = x; } });
    if (p) await p;
    return resp ? await resp : null;
  };
  return run;
}
const ev = (path, mode = 'cors') => ({ request: { url: new URL(path, base).href, method: 'GET', mode } });
const consts = (code) => ({
  shell: JSON.parse(code.match(/const SHELL = (\[.*?\]);/)[1]),
  media: JSON.parse(code.match(/const MEDIA = (\{.*?\});/)[1]),
});
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

// 1. first install
const { shell, media } = consts(src);
let run = boot(src);
let t0 = performance.now();
await run('install');
await run('activate');
const names = await caches.keys();
const shellCache = store.get(names.find((n) => n.startsWith('sws-shell-')));
check(shellCache && shellCache.m.size === shell.length, `install: ${shell.length} shell files cached`);
check(store.get('sws-media')?.m.size === Object.keys(media).length, `install: ${Object.keys(media).length} model/audio files cached (${env.fetches} requests, ${(performance.now() - t0).toFixed(0)} ms)`);

// 2. offline
env.online = false;
const js = shell.find((p) => p.startsWith('assets/') && p.endsWith('.js'));
for (const [p, mode] of [['./', 'navigate'], ['index.html', 'navigate'], [js, 'cors'], ['models/b17.glb', 'cors'], ['audio/manifest.json', 'cors'], ['audio/music_menu.mp3', 'cors'], [Object.keys(media).find((k) => k.startsWith('audio/voice/') && k.endsWith('.m4a')), 'cors']]) {
  const r = await run('fetch', ev(p, mode));
  const len = r ? (await r.arrayBuffer()).byteLength : 0;
  check(r && r.ok && len > 0, `offline: ${p} served from cache (${len} bytes)`);
}
env.online = true;

// 3. online: index.html network first, the rest from the cache without a request
env.fetches = 0;
await run('fetch', ev('./', 'navigate'));
await run('fetch', ev('models/b17.glb'));
await run('fetch', ev(js));
check(env.fetches === 1, `online: only the page itself went to the network (${env.fetches} request)`);

// 4. next deploy: one model changed, new bundle hash
const changed = 'models/fw190.glb';
const media2 = { ...media, [changed]: 'changed00000' };
const src2 = src.replace(/const VERSION = "[^"]*"/, 'const VERSION = "nextbuild000"').replace(/const MEDIA = \{.*?\};/, `const MEDIA = ${JSON.stringify(media2)};`);
env.fetches = 0;
run = boot(src2);
await run('install');
const shellFetches = shell.length;
check(env.fetches === shellFetches + 1, `update: downloaded ${env.fetches - shellFetches} media file(s) (the changed one) + ${shellFetches} shell files`);
await run('activate');
const after = await caches.keys();
check(after.filter((n) => n.startsWith('sws-shell-')).length === 1 && after.includes('sws-shell-nextbuild000'), `update: old shell cache deleted (${after.join(', ')})`);
check(store.get('sws-media').m.size === Object.keys(media2).length, 'update: stale media revision dropped');

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
