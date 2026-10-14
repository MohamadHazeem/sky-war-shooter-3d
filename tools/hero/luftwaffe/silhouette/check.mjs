#!/usr/bin/env node
// Silhouette gate: projects aircraft GLBs (top / front / side, orthographic) and compares them with the
// public-domain reference silhouettes extracted by extract.mjs.
//
//   node tools/hero/luftwaffe/silhouette/check.mjs [kind...] [--set label=dir ...] [--out dir] [--gate]
//
// Default sets: legacy = tools/convert_models/output/<kind>.glb (FlightGear), hero = public/models/<kind>.glb.
// Registration: one uniform scale per reference sheet, fixed by the captioned span (masks.json ppm); the
// model is only translated (integer search for best overlap). No per-view or non-uniform scaling.
// Both masks are opened by ~4 cm to drop wires, masts, pitots and gun barrels; propeller blades and gear
// are excluded (the drawings show spinners and retracted gear). Metrics: raw IoU and a boundary-tolerant
// IoU (mismatch within TOL metres of the other outline is ignored: drawing line weight and print error).
// Writes <out>/silhouette-<kind>.jpg (rows: views; columns: sets; blue = reference, red = model outline)
// and <out>/silhouette.json. --gate exits 1 if the 'hero' set falls under the thresholds.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { openMask, dilate, bbox, fillTri } from './mask.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../../../..');
export const TOL_M = 0.06;
export const GATE = { top: 0.88, side: 0.85, front: 0.75 };   // boundary-tolerant IoU, hero set

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const SKIP = /(_lod[12]$|^blades_|^gear_|^pilot|^crew|^interior|^eye_|^muzzle|prop_disc)/;

/** world-space triangles [x,y,z]*3 of the silhouette-relevant meshes (game frame: x left, y up, z nose) */
export async function triangles(path) {
  const doc = await io.read(path);
  const tris = [];
  const visit = (node, parentM, skip, prop) => {
    const name = node.getName() || '';
    const M = mul(parentM, node.getMatrix());
    const sk = skip || SKIP.test(name);
    // legacy FlightGear props are one mesh with blades: keep the spinner only (centroid near the axis)
    const pr = prop || (/^prop_\d$/.test(name) ? { M, inv: invRigid(M) } : null);
    const mesh = node.getMesh();
    if (mesh && !sk) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos || (prim.getMode() !== 4)) continue;
        const idx = prim.getIndices();
        const n = idx ? idx.getCount() : pos.getCount();
        const v = [0, 0, 0], P = [];
        for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); P.push(xf(M, v)); }
        for (let i = 0; i + 2 < n; i += 3) {
          const a = P[idx ? idx.getScalar(i) : i], b = P[idx ? idx.getScalar(i + 1) : i + 1], c = P[idx ? idx.getScalar(i + 2) : i + 2];
          if (pr && !/^spinner_/.test(name)) {
            const g = xf(pr.inv, [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]);
            if (Math.hypot(g[0], g[1]) > 0.42) continue;
          }
          tris.push(a, b, c);
        }
      }
    }
    for (const ch of node.listChildren()) visit(ch, M, sk, pr);
  };
  for (const sc of doc.getRoot().listScenes()) for (const n of sc.listChildren()) visit(n, ident(), false, null);
  return tris;
}
function ident() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function xf(m, v) {
  return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
}
function invRigid(m) {   // inverse of rotation*scale + translation (orthogonal axes)
  const s = [0, 1, 2].map(c => m[c * 4] ** 2 + m[c * 4 + 1] ** 2 + m[c * 4 + 2] ** 2);
  const o = ident();
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[c * 4 + r] = m[r * 4 + c] / s[r];
  const t = [m[12], m[13], m[14]];
  for (let r = 0; r < 3; r++) o[12 + r] = -(o[r] * t[0] + o[4 + r] * t[1] + o[8 + r] * t[2]);
  return o;
}

const PROJ = { top: p => [-p[0], -p[2]], front: p => [-p[0], -p[1]], side: p => [-p[2], -p[1]] };

export function rasterize(tris, view, ppm) {
  const pts = tris.map(PROJ[view]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = 4, w = Math.ceil((x1 - x0) * ppm) + 2 * pad, h = Math.ceil((y1 - y0) * ppm) + 2 * pad;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < pts.length; i += 3) {
    const P = i => [(pts[i][0] - x0) * ppm + pad, (pts[i][1] - y0) * ppm + pad];
    const [a, b, c] = [P(i), P(i + 1), P(i + 2)];
    fillTri(m, w, h, a[0], a[1], b[0], b[1], c[0], c[1]);
  }
  return { m, w, h };
}

export async function loadRef(kind, view) {
  const { data, info } = await sharp(join(HERE, `${kind}_${view}.png`)).greyscale().raw().toBuffer({ resolveWithObject: true });
  const m = new Uint8Array(info.width * info.height);
  for (let i = 0; i < m.length; i++) m[i] = data[i] < 128 ? 1 : 0;
  return { m, w: info.width, h: info.height };
}

/** place model mask (offset dx, dy) on a canvas the size of the reference + margin */
export function compare(ref, mod, r, tolPx) {
  const M = 40, W = Math.max(ref.w, mod.w) + 2 * M, H = Math.max(ref.h, mod.h) + 2 * M;
  const R = new Uint8Array(W * H);
  const rx = (W - ref.w) >> 1, ry = (H - ref.h) >> 1;
  for (let y = 0; y < ref.h; y++) for (let x = 0; x < ref.w; x++) R[(y + ry) * W + x + rx] = ref.m[y * ref.w + x];
  const Ro = openMask(R, W, H, r);
  const place = (dx, dy) => {
    const A = new Uint8Array(W * H);
    for (let y = 0; y < mod.h; y++) {
      const yy = y + dy; if (yy < 0 || yy >= H) continue;
      for (let x = 0; x < mod.w; x++) { const xx = x + dx; if (xx >= 0 && xx < W && mod.m[y * mod.w + x]) A[yy * W + xx] = 1; }
    }
    return A;
  };
  const Mo = (() => { const A = place((W - mod.w) >> 1, (H - mod.h) >> 1); return A; })();
  const Mopen = openMask(Mo, W, H, r);
  // translation search on the opened masks (centred start, coarse then fine)
  const iou = (A, dx, dy) => {
    let i = 0, u = 0;
    for (let y = 0; y < H; y++) {
      const sy = y - dy; const inY = sy >= 0 && sy < H;
      for (let x = 0; x < W; x++) {
        const sx = x - dx;
        const a = inY && sx >= 0 && sx < W ? A[sy * W + sx] : 0, b = Ro[y * W + x];
        if (a & b) i++; if (a | b) u++;
      }
    }
    return i / u;
  };
  let best = [0, 0, iou(Mopen, 0, 0)];
  for (const step of [8, 4, 2, 1]) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const [ax, ay] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const v = iou(Mopen, best[0] + ax, best[1] + ay);
        if (v > best[2]) { best = [best[0] + ax, best[1] + ay, v]; improved = true; }
      }
    }
  }
  const [dx, dy] = best;
  const A = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = x - dx, sy = y - dy;
    if (sx >= 0 && sy >= 0 && sx < W && sy < H) A[y * W + x] = Mopen[sy * W + sx];
  }
  const dR = dilate(Ro, W, H, tolPx), dA = dilate(A, W, H, tolPx);
  let inter = 0, uni = 0, bad = 0, onlyModel = 0, onlyRef = 0;
  for (let i = 0; i < W * H; i++) {
    const a = A[i], b = Ro[i];
    if (a & b) inter++; if (a | b) uni++;
    if (a && !b) onlyModel++; if (b && !a) onlyRef++;
    if ((a && !dR[i]) || (b && !dA[i])) bad++;
  }
  return { iou: inter / uni, tolerant: 1 - bad / uni, extraModel: onlyModel / uni, missing: onlyRef / uni, A, R: Ro, W, H };
}

function overlay({ A, R, W, H }) {
  const px = Buffer.alloc(W * H * 3);
  const edge = (m, i) => m[i] && (!m[i - 1] || !m[i + 1] || !m[i - W] || !m[i + W]);
  for (let i = 0; i < W * H; i++) {
    let c = [250, 250, 247];
    if (R[i]) c = [178, 204, 228];
    if (A[i] && !R[i]) c = [240, 196, 180];
    if (i > W && i < W * H - W && edge(A, i)) c = [200, 40, 30];
    px[i * 3] = c[0]; px[i * 3 + 1] = c[1]; px[i * 3 + 2] = c[2];
  }
  return { px, W, H };
}

export const MASKS = JSON.parse(readFileSync(join(HERE, 'masks.json'), 'utf8'));

/** tolerant / raw IoU per view of one GLB against the reference of 'kind' */
export async function measure(kind, path) {
  const ppm = MASKS[kind].ppm;
  const r = Math.max(2, Math.round(0.04 * ppm)), tolPx = Math.max(2, Math.round(TOL_M * ppm));
  const tris = await triangles(path);
  const out = {};
  for (const view of ['top', 'side', 'front']) {
    const c = compare(await loadRef(kind, view), rasterize(tris, view, ppm), r, tolPx);
    out[view] = { iou: c.iou, tolerant: c.tolerant, c };
  }
  return out;
}

async function main() {
const args = process.argv.slice(2);
const sets = [];
let out = join(REPO, 'docs/phase10/shots/05b');
let gate = false;
const kinds = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--set') { const [l, d] = args[++i].split('='); sets.push([l, d]); }
  else if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--gate') gate = true;
  else kinds.push(args[i]);
}
if (!sets.length) sets.push(['legacy', join(REPO, 'tools/convert_models/output')], ['hero', join(REPO, 'public/models')]);
const masks = MASKS;
if (!kinds.length) kinds.push(...Object.keys(masks));
mkdirSync(out, { recursive: true });

const report = existsSync(join(out, 'silhouette.json')) ? JSON.parse(readFileSync(join(out, 'silhouette.json'), 'utf8')) : {};
report._method = { references: 'tools/hero/luftwaffe/silhouette/refs.json', scale: 'uniform per sheet from captioned span', registration: 'translation only',
  open_m: 0.04, tolerance_m: TOL_M, gate: GATE };
let fail = false;
for (const kind of kinds) {
  const meta = masks[kind];
  const ppm = meta.ppm;
  const r = Math.max(2, Math.round(0.04 * ppm)), tolPx = Math.max(2, Math.round(TOL_M * ppm));
  report[kind] = { reference: meta.source, publication: meta.publication, ppm };
  const tiles = [];
  for (const [label, dir] of sets) {
    const path = join(dir, `${kind}.glb`);
    if (!existsSync(path)) continue;
    let tris = await triangles(path);
    // experiments: SIL_WARP="sx,sz,x0" scales x outboard of |x| = x0 by sx and every z by sz
    if (process.env.SIL_WARP && label === 'warp') {
      const [sx, sz, x0] = process.env.SIL_WARP.split(',').map(Number);
      tris = tris.map(p => [Math.sign(p[0]) * (Math.abs(p[0]) <= x0 ? Math.abs(p[0]) : x0 + (Math.abs(p[0]) - x0) * sx), p[1], p[2] * sz]);
    }
    const res = { file: path.replace(REPO + '/', '') };
    const col = [];
    for (const view of ['top', 'side', 'front']) {
      const ref = await loadRef(kind, view);
      const mod = rasterize(tris, view, ppm);
      const c = compare(ref, mod, r, tolPx);
      res[view] = { iou: +c.iou.toFixed(4), tolerant: +c.tolerant.toFixed(4), extra: +c.extraModel.toFixed(4), missing: +c.missing.toFixed(4) };
      col.push({ view, c });
    }
    report[kind][label] = res;
    tiles.push({ label, col, res });
    console.log(kind.padEnd(6), label.padEnd(8), ['top', 'side', 'front'].map(v => `${v} ${res[v].iou.toFixed(3)}/${res[v].tolerant.toFixed(3)}`).join('  '));
    if (gate && label === 'hero') for (const v of ['top', 'side', 'front']) if (res[v].tolerant < GATE[v]) { fail = true; console.log(`  GATE FAIL ${kind} ${v}`); }
  }
  // sheet: columns = sets, rows = views
  const cw = 520, rh = { top: 460, side: 170, front: 150 }, head = 26;
  const comps = [];
  let y = 0;
  const totalH = head + Object.values(rh).reduce((a, b) => a + b + head, 0);
  for (const view of ['top', 'side', 'front']) {
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i].col.find(c => c.view === view).c;
      const o = overlay(t);
      const img = await sharp(o.px, { raw: { width: o.W, height: o.H, channels: 3 } }).resize(cw - 10, rh[view], { fit: 'contain', background: '#fafaf7' }).png().toBuffer();
      const s = tiles[i].res[view];
      const txt = `${kind} ${tiles[i].label} - ${view}: IoU ${s.iou.toFixed(3)}, tolerant ${s.tolerant.toFixed(3)}`;
      const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${head}"><text x="6" y="18" font-family="Helvetica" font-size="15" fill="#223">${txt}</text></svg>`);
      comps.push({ input: svg, left: i * cw, top: y }, { input: img, left: i * cw + 5, top: y + head });
    }
    y += head + rh[view];
  }
  await sharp({ create: { width: cw * tiles.length, height: totalH - head, channels: 3, background: '#fafaf7' } })
    .composite(comps).jpeg({ quality: 82 }).toFile(join(out, `silhouette-${kind}.jpg`));
}
writeFileSync(join(out, 'silhouette.json'), JSON.stringify(report, null, 1) + '\n');
if (fail) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
