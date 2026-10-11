// Tiny local endpoint that writes screenshots posted by the dev build (src/dev/gallery.ts)
// into tools/gallery/. Usage: node tools/gallery/save-server.mjs [port=5219]
// POST /save?file=before/waist.png with a data:image/png;base64,... body.
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname);
const port = Number(process.argv[2] ?? 5219);

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', '*'); res.end(); return; }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const file = url.searchParams.get('file') ?? '';
  if (req.method !== 'POST' || url.pathname !== '/save' || !/^[a-z0-9_-]+(\/[a-z0-9_-]+)*\.(png|jpg)$/i.test(file)) {
    res.statusCode = 400; res.end('bad request'); return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    const m = /^data:image\/(png|jpeg);base64,(.*)$/s.exec(body);
    if (!m) { res.statusCode = 400; res.end('expected a data URL'); return; }
    const out = join(ROOT, file);
    mkdirSync(dirname(out), { recursive: true });
    // the browser's PNG encoder is fast, not small: recompress losslessly (about 1/3 the size)
    // .jpg targets (visual-qa/): a small JPEG, max 800 px wide
    const img = sharp(Buffer.from(m[2], 'base64'));
    const enc = /\.jpg$/i.test(file)
      ? img.resize({ width: 800, withoutEnlargement: true }).jpeg({ quality: 74, mozjpeg: true })
      : img.png({ compressionLevel: 9, effort: 10, adaptiveFiltering: true });
    enc.toBuffer().then((buf) => {
      writeFileSync(out, buf);
      res.end(`${file} ${buf.length} bytes`);
    }, (e) => { res.statusCode = 500; res.end(String(e)); });
  });
}).listen(port, '127.0.0.1', () => console.log(`gallery save server on http://localhost:${port}`));
