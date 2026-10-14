// Writes the effects captures posted by src/dev/fxShots.ts into docs/phase10/shots/06/ as small
// JPEGs (max 960 px wide). Usage: node tools/fx/shot-server.mjs [port=5316]
// POST /save?file=before/explosion.jpg with a data:image/...;base64,... body.
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..', '..', 'docs', 'phase10', 'shots', '06');
const port = Number(process.argv[2] ?? 5316);

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', '*'); res.end(); return; }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const file = url.searchParams.get('file') ?? '';
  if (req.method !== 'POST' || url.pathname !== '/save' || !/^[a-z0-9_-]+(\/[a-z0-9_-]+)*\.jpg$/i.test(file)) {
    res.statusCode = 400; res.end('bad request'); return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const m = /^data:image\/(png|jpeg);base64,(.*)$/s.exec(Buffer.concat(chunks).toString('utf8'));
    if (!m) { res.statusCode = 400; res.end('expected a data URL'); return; }
    const out = join(ROOT, file);
    mkdirSync(dirname(out), { recursive: true });
    sharp(Buffer.from(m[2], 'base64')).resize({ width: 960, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer()
      .then((buf) => { writeFileSync(out, buf); res.end(`${file} ${buf.length} bytes`); }, (e) => { res.statusCode = 500; res.end(String(e)); });
  });
}).listen(port, '127.0.0.1', () => console.log(`fx shot server on http://localhost:${port} -> ${ROOT}`));
