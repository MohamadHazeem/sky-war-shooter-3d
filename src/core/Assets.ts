// Byte loader for the game's static assets (models/, audio/): one fetch per file, shared by
// whoever needs it first, with real byte progress and a simple priority queue.
// - NOW requests start immediately (what the menu waits for).
// - Background requests run a few at a time in priority order, so the heavy optional assets
//   never compete with the essentials; asking for a queued file again with a higher
//   priority moves it up (e.g. Sound decoding a sample before the prefetch reached it).
// - take() hands the bytes over and drops them from memory (they are decoded or parsed
//   once; a later take() fetches again, from the HTTP / service-worker cache).
// Sizes come from the build (vite.config.ts scans public/ into __ASSET_SIZES__), so the
// progress bar is exact even when the response has no Content-Length.

export const NOW = 0;
const MAX_BACKGROUND = 4;

interface Entry {
  path: string;
  prio: number;
  started: boolean;
  done: boolean;
  failed: boolean;
  loaded: number;
  total: number;
  buf: ArrayBuffer | null;
  promise: Promise<ArrayBuffer>;
  start: () => void;
}

const SIZES: Record<string, number> = typeof __ASSET_SIZES__ !== 'undefined' ? __ASSET_SIZES__ : {};
const entries = new Map<string, Entry>();
let running = 0;

export const assetUrl = (path: string) => import.meta.env.BASE_URL + path;
export const assetSize = (path: string) => SIZES[path] ?? 0;

async function download(e: Entry): Promise<ArrayBuffer> {
  const r = await fetch(assetUrl(e.path));
  if (!r.ok) throw new Error(`${e.path}: HTTP ${r.status}`);
  const len = Number(r.headers.get('content-length')) || 0;
  if (!e.total) e.total = len;
  if (!r.body) { const b = await r.arrayBuffer(); e.loaded = b.byteLength; return b; }
  const reader = r.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    n += value.byteLength;
    e.loaded = n;
  }
  if (parts.length === 1 && parts[0].byteOffset === 0 && parts[0].byteLength === parts[0].buffer.byteLength) return parts[0].buffer as ArrayBuffer;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out.buffer;
}

function create(path: string, prio: number): Entry {
  let resolve!: (b: ArrayBuffer) => void, reject!: (err: unknown) => void;
  const e: Entry = {
    path, prio, started: false, done: false, failed: false, loaded: 0, total: SIZES[path] ?? 0, buf: null,
    promise: new Promise<ArrayBuffer>((res, rej) => { resolve = res; reject = rej; }),
    start: () => {
      if (e.started) return;
      e.started = true;
      if (e.prio > NOW) running++;
      download(e).then((b) => {
        e.buf = b; e.done = true; e.loaded = e.total = b.byteLength; resolve(b);
      }, (err) => {
        e.done = e.failed = true; e.loaded = e.total; reject(err);
      }).finally(() => { if (e.prio > NOW) running--; pump(); });
    },
  };
  e.promise.catch(() => { /* reported by the consumer */ });
  entries.set(path, e);
  return e;
}

function pump() {
  if (running >= MAX_BACKGROUND) return;
  const waiting = [...entries.values()].filter((e) => !e.started).sort((a, b) => a.prio - b.prio);
  for (const e of waiting) {
    if (running >= MAX_BACKGROUND) break;
    e.start();
  }
}

// Start (or reprioritise) a download. prio NOW starts it at once, higher numbers wait their turn.
export function request(path: string, prio = NOW): Promise<ArrayBuffer> {
  let e = entries.get(path);
  if (e && e.done && !e.buf && !e.failed) { entries.delete(path); e = undefined; } // taken earlier: fetch again
  if (!e) e = create(path, prio);
  else if (!e.started && prio < e.prio) e.prio = prio;
  if (e.prio === NOW) e.start();
  else pump();
  return e.promise;
}

// The bytes, handed over: the loader forgets them once they are taken.
export async function take(path: string, prio = NOW): Promise<ArrayBuffer> {
  const b = await request(path, prio);
  const e = entries.get(path);
  if (e && e.buf === b) e.buf = null;
  return b;
}

// A small JSON file (manifests), parsed once and shared
const jsons = new Map<string, Promise<any>>();
export function json<T = any>(path: string, prio = NOW): Promise<T> {
  let p = jsons.get(path);
  if (!p) {
    p = request(path, prio).then((b) => JSON.parse(new TextDecoder().decode(b)));
    p.catch(() => jsons.delete(path)); // retry on the next call
    jsons.set(path, p);
  }
  return p;
}

export function isLoaded(path: string) { return !!entries.get(path)?.done; }

// Combined byte progress of a set of files (0..1); files not requested yet count as 0 loaded.
export function progress(paths: readonly string[]) {
  let loaded = 0, total = 0;
  for (const p of paths) {
    const e = entries.get(p);
    const t = e?.total || SIZES[p] || 50_000;
    total += t;
    loaded += e ? (e.done ? t : Math.min(e.loaded, t)) : 0;
  }
  return { loaded, total, f: total ? loaded / total : 1 };
}
