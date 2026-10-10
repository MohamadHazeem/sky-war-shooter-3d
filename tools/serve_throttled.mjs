#!/usr/bin/env node
// Static server with a simulated network (text gzipped), to measure the time to the menu on a slow connection.
// All responses share one bandwidth budget (like a single access link) and each request waits
// one round trip before its first byte. Honours the Cache-Control rules of public/_headers
// roughly enough for repeat-visit tests (assets immutable, the rest no-cache + ETag).
//
//   node tools/serve_throttled.mjs [dir=dist] [--port 5193] [--mbps 10] [--rtt 60]
//
// Presets worth trying: --mbps 10 --rtt 60 (average broadband / 4G), --mbps 1.6 --rtt 150 (fast 3G).
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, extname, resolve, normalize } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const dir = resolve(args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) ?? 'dist');
const port = Number(opt('port', 5193));
const bytesPerMs = (Number(opt('mbps', 10)) * 1e6) / 8 / 1000;
const rtt = Number(opt('rtt', 60));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.m4a': 'audio/mp4', '.webmanifest': 'application/manifest+json', '.md': 'text/markdown',
};

// shared link: a byte budget that refills at the configured rate
let budget = 0, last = performance.now();
const waiters = [];
function refill() {
  const now = performance.now();
  budget = Math.min(budget + (now - last) * bytesPerMs, 64 * 1024);
  last = now;
  while (waiters.length && budget >= waiters[0].n) { const w = waiters.shift(); budget -= w.n; w.go(); }
  if (waiters.length) setTimeout(refill, 2);
}
const take = (n) => new Promise((go) => { waiters.push({ n, go }); if (waiters.length === 1) setTimeout(refill, 0); });

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(dir, path));
  if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  const st = statSync(file);
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const cache = path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  await new Promise((r) => setTimeout(r, rtt));
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': cache }); res.end(); return; }
  // text is gzipped, like the CDN does
  let body = readFileSync(file);
  const headers = { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', ETag: etag, 'Cache-Control': cache };
  if (/\.(js|css|html|json|svg|webmanifest|md)$/.test(file) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
    body = gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  for (let o = 0; o < body.length; o += 16384) {
    const chunk = body.subarray(o, o + 16384);
    await take(chunk.length);
    if (!res.write(chunk)) await new Promise((r) => res.once('drain', r));
  }
  res.end();
}).listen(port, '127.0.0.1', () => console.log(`serving ${dir} on http://127.0.0.1:${port} at ${opt('mbps', 10)} Mbit/s, ${rtt} ms RTT`));
