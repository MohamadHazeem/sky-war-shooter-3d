#!/usr/bin/env node
// Extracts the front / top / side reference silhouettes from the public-domain recognition three-views
// listed in refs.json:  node tools/hero/luftwaffe/silhouette/extract.mjs [kind...]
// Page scans are downloaded once from the Internet Archive into tools/hero/luftwaffe/out/refs/ (not
// committed); the binary masks + their scale go to tools/hero/luftwaffe/silhouette/<kind>_<view>.png and
// masks.json (committed). Fully automatic: ink threshold -> the three largest blobs in the crop
// (ordered top to bottom = front, top, side) -> morphological close (white panel lines drawn on the
// silhouettes) -> hole fill. Scale: pixels per metre from the top view's width and the captioned span.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { components, closeMask, fillHoles, bbox } from './mask.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, '../out/refs');
const refs = JSON.parse(readFileSync(join(HERE, 'refs.json'), 'utf8'));
const kinds = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(refs).filter(k => !k.startsWith('_'));
mkdirSync(CACHE, { recursive: true });
const outMeta = existsSync(join(HERE, 'masks.json')) ? JSON.parse(readFileSync(join(HERE, 'masks.json'), 'utf8')) : {};

for (const kind of kinds) {
  const r = refs[kind];
  const file = join(CACHE, `${r.archive}_n${r.page}.jpg`);
  if (!existsSync(file)) {
    const url = `https://archive.org/download/${r.archive}/page/n${r.page}_w1600.jpg`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const [x0, y0, x1, y1] = r.crop;
  const W = x1 - x0, H = y1 - y0;
  const { data } = await sharp(file).extract({ left: x0, top: y0, width: W, height: H }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const ink = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) ink[i] = data[i] < r.ink ? 1 : 0;
  for (const y of r.split ?? []) ink.fill(0, (y - y0) * W, (y - y0 + 2) * W);   // views that touch on the page
  // white panel lines split a silhouette into pieces: close them first; page rules touch the crop border
  const closed = closeMask(ink, W, H, 4);
  const blobs = components(closed, W, H)
    .filter(c => c.x0 > 0 && c.y0 > 0 && c.x1 < W - 1 && c.y1 < H - 1 && c.area > 0.08 * (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1))
    .sort((a, b) => b.area - a.area).slice(0, 3).sort((a, b) => a.y0 - b.y0);
  if (blobs.length < 3) throw new Error(`${kind}: found ${blobs.length} blobs`);
  const views = {};
  ['front', 'top', 'side'].forEach((view, i) => {
    const b = blobs[i];
    // the blob plus everything inked inside its box that touches it after closing (canopy frames, wheels)
    const pad = 6, bw = b.x1 - b.x0 + 1 + 2 * pad, bh = b.y1 - b.y0 + 1 + 2 * pad;
    let m = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const sx = b.x0 - pad + x, sy = b.y0 - pad + y;
      if (sx >= 0 && sy >= 0 && sx < W && sy < H && b.label[sy * W + sx]) m[y * bw + x] = 1;
    }
    m = fillHoles(m, bw, bh);
    views[view] = { mask: m, w: bw, h: bh };
  });
  const tb = bbox(views.top.mask, views.top.w, views.top.h);
  const ppm = (tb.x1 - tb.x0 + 1) / r.span_m;
  const meta = { ppm: +ppm.toFixed(3), source: r.url, publication: r.publication, title: r.title, span_m: r.span_m, length_m: r.length_m,
    topLengthCheck_m: +((tb.y1 - tb.y0 + 1) / ppm).toFixed(3), views: {} };
  for (const [view, v] of Object.entries(views)) {
    const rgb = Buffer.alloc(v.w * v.h);
    for (let i = 0; i < v.w * v.h; i++) rgb[i] = v.mask[i] ? 0 : 255;
    await sharp(rgb, { raw: { width: v.w, height: v.h, channels: 1 } }).png({ palette: true, colours: 2 }).toFile(join(HERE, `${kind}_${view}.png`));
    const b = bbox(v.mask, v.w, v.h);
    meta.views[view] = { w: v.w, h: v.h, width_m: +((b.x1 - b.x0 + 1) / ppm).toFixed(3), height_m: +((b.y1 - b.y0 + 1) / ppm).toFixed(3) };
  }
  outMeta[kind] = meta;
  console.log(kind, JSON.stringify(meta));
}
writeFileSync(join(HERE, 'masks.json'), JSON.stringify(outMeta, null, 1) + '\n');
