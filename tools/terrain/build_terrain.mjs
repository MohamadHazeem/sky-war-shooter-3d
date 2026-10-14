// Builds the far-terrain tiles from the raw public data (tools/terrain/fetch_raw.mjs).
//   node tools/terrain/build_terrain.mjs <rawDir> [--only i_j,i_j]
// Writes public/terrain/t<i>_<j>.bin (one per 64 km tile), public/terrain/overview.bin and the
// generated src/world/TerrainIndex.ts. Formats: tools/terrain/README.md.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync, inflateSync } from 'node:zlib';
import sharp from 'sharp';
import { planTiles } from './plan.mjs';
import { CHART } from '../../src/world/EuropeChart.ts';
import { GRID, fromGrid, toGrid } from '../../src/world/TerrainGrid.ts';

const RAW = process.argv[2];
if (!RAW) { console.error('usage: node tools/terrain/build_terrain.mjs <rawDir> [--only i_j,...]'); process.exit(1); }
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;
const ROOT = resolve(import.meta.dirname, '../..');
const OUT = join(ROOT, 'public/terrain');
mkdirSync(OUT, { recursive: true });

const T = GRID.TILE;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- vector data (grid metres)
const ne = (f) => JSON.parse(readFileSync(join(RAW, 'ne', f + '.geojson'), 'utf8')).features;
const BBOX = { w: -1, s: 46.5, e: 17, n: 57 };
const inBox = (c) => c.some(([lon, lat]) => lon > BBOX.w && lon < BBOX.e && lat > BBOX.s && lat < BBOX.n);
const proj = (ring) => ring.map(([lon, lat]) => toGrid(lon, lat));
function polys(features) {
  const out = [];   // each: array of rings (grid metres)
  for (const f of features) {
    const g = f.geometry; if (!g) continue;
    const list = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const p of list) if (inBox(p[0])) out.push(p.map(proj));
  }
  return out;
}
function lines(features, props) {
  const out = [];
  for (const f of features) {
    const g = f.geometry; if (!g) continue;
    const list = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const l of list) if (inBox(l)) out.push({ pts: proj(l), ...props(f.properties) });
  }
  return out;
}
// 1943: the Zuiderzee polders of Flevoland were still open water (drained 1957-68).
const FLEVOLAND = [[5.07, 52.39], [5.12, 52.345], [5.25, 52.315], [5.42, 52.287], [5.55, 52.31], [5.58, 52.335], [5.66, 52.375],
  [5.76, 52.43], [5.83, 52.5], [5.82, 52.56], [5.75, 52.61], [5.6, 52.63], [5.46, 52.59], [5.41, 52.52], [5.33, 52.47],
  [5.22, 52.43], [5.12, 52.42]];
const LAND = polys([...ne('ne_10m_land'), ...ne('ne_10m_minor_islands')]);
const LAKES = [...polys([...ne('ne_10m_lakes'), ...ne('ne_10m_lakes_europe')]), [proj(FLEVOLAND)]];
// River half-widths (m): named main rivers of the 1940s routes, else by Natural Earth rank
const WIDTH = { Rhein: 170, Rhine: 170, Rhin: 170, Waal: 150, Nederrijn: 80, Lek: 90, IJssel: 50, Elbe: 150, Weser: 90, Ems: 45,
  Main: 60, Donau: 100, Danube: 100, Mosel: 60, Neckar: 40, Lippe: 20, Ruhr: 30, Saale: 30, Fulda: 25, Leine: 20, Aller: 25,
  Havel: 40, Spree: 25, Oder: 100, Maas: 75, Meuse: 75, Schelde: 100, Unstrut: 15, Werra: 20, Mulde: 25, Regnitz: 20, Naab: 20, Altmühl: 15, Vechte: 12, Vecht: 15 };
const RIVERS = lines([...ne('ne_10m_rivers_lake_centerlines'), ...ne('ne_10m_rivers_europe')], (p) => {
  const name = p.name ?? '';
  const key = Object.keys(WIDTH).find((k) => name.includes(k));
  return { hw: key ? WIDTH[key] : p.scalerank <= 8 ? 45 : p.scalerank <= 10 ? 22 : 14, name };
});
const RAILS = lines(ne('ne_10m_railroads'), () => ({ hw: 4 }));
console.log('vectors', LAND.length, 'land', LAKES.length, 'lakes', RIVERS.length, 'rivers', RAILS.length, 'rails');

// Towns (GeoNames cities5000, CC BY 4.0): pop and a built-up radius for the 1940s
const CITIES = [];
for (const line of readFileSync(join(RAW, 'geonames', 'cities5000.txt'), 'utf8').split('\n')) {
  const f = line.split('\t'); if (f.length < 15) continue;
  const lat = +f[4], lon = +f[5], pop = +f[14];
  if (!(lon > BBOX.w && lon < BBOX.e && lat > BBOX.s && lat < BBOX.n) || pop < 5000) continue;
  const [x, y] = toGrid(lon, lat);
  CITIES.push({ x, y, pop, r: 280 * Math.sqrt(pop / 5000), name: f[1] });
}
console.log('towns', CITIES.length);

// ---------------------------------------------------------------- elevation (Terrarium z9)
const Z = 9, NZ = 2 ** Z;
const dem = new Map();
for (const f of readdirSync(join(RAW, 'terrarium'))) {
  const m = /^9_(\d+)_(\d+)\.png$/.exec(f); if (!m) continue;
  const { data } = await sharp(join(RAW, 'terrarium', f)).raw().toBuffer({ resolveWithObject: true });
  const h = new Float32Array(256 * 256);
  for (let i = 0; i < h.length; i++) h[i] = data[i * 3] * 256 + data[i * 3 + 1] + data[i * 3 + 2] / 256 - 32768;
  dem.set(`${m[1]}_${m[2]}`, h);
}
function demPx(px, py) {
  const tx = Math.floor(px / 256), ty = Math.floor(py / 256);
  const t = dem.get(`${tx}_${ty}`);
  return t ? t[(py - ty * 256) * 256 + (px - tx * 256)] : 0;
}
function elevation(lon, lat) {
  const r = lat * Math.PI / 180;
  const fx = (lon + 180) / 360 * NZ * 256 - 0.5;
  const fy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * NZ * 256 - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
  return (demPx(x0, y0) * (1 - u) + demPx(x0 + 1, y0) * u) * (1 - v) + (demPx(x0, y0 + 1) * (1 - u) + demPx(x0 + 1, y0 + 1) * u) * v;
}
console.log('dem tiles', dem.size);

// ---------------------------------------------------------------- land cover (WorldCover overview)
const wcMeta = new Map(), wcCache = new Map();
for (const f of readdirSync(join(RAW, 'wc'))) if (f.endsWith('.json')) wcMeta.set(f.slice(0, -5), JSON.parse(readFileSync(join(RAW, 'wc', f), 'utf8')));
function wcTile(name, k) {
  const key = name + k;
  let t = wcCache.get(key);
  if (!t) {
    t = new Uint8Array(inflateSync(readFileSync(join(RAW, 'wc', `${name}_${k}.bin`))));
    if (wcCache.size > 160) wcCache.delete(wcCache.keys().next().value);
    wcCache.set(key, t);
  }
  return t;
}
/** WorldCover class at a point (0 = no data) */
function landClass(lon, lat) {
  const la = Math.floor(lat / 3) * 3, lo = Math.floor(lon / 3) * 3;
  const name = `N${String(la).padStart(2, '0')}${lo < 0 ? 'W' : 'E'}${String(Math.abs(lo)).padStart(3, '0')}`;
  const m = wcMeta.get(name); if (!m) return 0;
  const col = Math.floor((lon - lo) / 3 * m.width), row = Math.floor((la + 3 - lat) / 3 * m.height);
  const across = Math.ceil(m.width / m.tile);
  const k = Math.floor(row / m.tile) * across + Math.floor(col / m.tile);
  return wcTile(name, k)[(row % m.tile) * m.tile + (col % m.tile)];
}

// ---------------------------------------------------------------- rasterising helpers
/** Even-odd fill of polygons into a mask (1 byte per pixel, OR), pixel centres at x0 + (c+.5)*px. */
function fillPolys(mask, W, H, x0, y0, px, polyList, value = 1) {
  const rowsLo = y0, rowsHi = y0 + H * px;
  for (const rings of polyList) {
    // bucket edges by the rows they cross
    const edges = [];
    let minX = Infinity, maxX = -Infinity;
    for (const ring of rings) for (let k = 0, n = ring.length; k < n; k++) {
      const a = ring[k], b = ring[(k + 1) % n];
      if (a[1] === b[1]) continue;
      const lo = Math.min(a[1], b[1]), hi = Math.max(a[1], b[1]);
      if (hi < rowsLo || lo > rowsHi) continue;
      edges.push(a, b);
      minX = Math.min(minX, a[0], b[0]); maxX = Math.max(maxX, a[0], b[0]);
    }
    if (!edges.length || minX > x0 + W * px) continue;
    const buckets = Array.from({ length: H }, () => []);
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e], b = edges[e + 1];
      const r0 = Math.max(0, Math.ceil((Math.min(a[1], b[1]) - y0) / px - 0.5)), r1 = Math.min(H - 1, Math.floor((Math.max(a[1], b[1]) - y0) / px - 0.5));
      for (let r = r0; r <= r1; r++) buckets[r].push(e);
    }
    for (let r = 0; r < H; r++) {
      const y = y0 + (r + 0.5) * px, xs = [];
      for (const e of buckets[r]) {
        const a = edges[e], b = edges[e + 1];
        if ((a[1] > y) === (b[1] > y)) continue;
        xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - x0) / px - 0.5)), c1 = Math.min(W - 1, Math.floor((xs[k + 1] - x0) / px - 0.5));
        for (let c = c0; c <= c1; c++) mask[r * W + c] = value;
      }
    }
  }
}
/** Squared Euclidean distance transform (Felzenszwalb), in pixels², to pixels where f == 0. */
function edt(f, W, H) {
  const INF = 1e20, d = new Float64Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = f[i] ? INF : 0;
  const n = Math.max(W, H), z = new Float64Array(n + 1), v = new Int32Array(n), g = new Float64Array(n), out = new Float64Array(n);
  const pass = (len, get, set) => {
    for (let q = 0; q < len; q++) g[q] = get(q);
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s;
      while (true) { const p = v[k]; s = ((g[q] + q * q) - (g[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k] && k > 0) k--; else break; }
      if (s <= z[k]) { v[0] = q; z[0] = -INF; z[1] = INF; k = 0; continue; }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const p = v[k]; out[q] = (q - p) * (q - p) + g[p]; }
    for (let q = 0; q < len; q++) set(q, out[q]);
  };
  for (let x = 0; x < W; x++) pass(H, (q) => d[q * W + x], (q, val) => { d[q * W + x] = val; });
  for (let y = 0; y < H; y++) pass(W, (q) => d[y * W + q], (q, val) => { d[y * W + q] = val; });
  return d;
}
/** Signed side distance of polylines onto texel centres: keeps the nearest feature per texel. */
function sideField(list, W, H, x0, y0, px, range) {
  const side = new Float32Array(W * H).fill(range), dist = new Float32Array(W * H).fill(Infinity), hw = new Float32Array(W * H);
  const reach = range + px;
  for (const f of list) {
    const P = f.pts;
    for (let k = 0; k + 1 < P.length; k++) {
      const [ax, ay] = P[k], [bx, by] = P[k + 1];
      if (Math.max(ax, bx) < x0 - reach || Math.min(ax, bx) > x0 + W * px + reach || Math.max(ay, by) < y0 - reach || Math.min(ay, by) > y0 + H * px + reach) continue;
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1, len = Math.sqrt(len2);
      const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - x0) / px)), c1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx) + reach - x0) / px));
      const r0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - y0) / px)), r1 = Math.min(H - 1, Math.ceil((Math.max(ay, by) + reach - y0) / px));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const x = x0 + (c + 0.5) * px, y = y0 + (r + 0.5) * px;
        const t = clamp(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1);
        const ex = x - ax - dx * t, ey = y - ay - dy * t, d = Math.hypot(ex, ey);
        const i = r * W + c;
        if (d < dist[i]) {
          dist[i] = d;
          const s = Math.sign(dx * ey - dy * ex) || 1;
          side[i] = clamp(s * d, -range, range);
          hw[i] = f.hw;
        }
      }
    }
  }
  return { side, dist, hw };
}
const byte = (v) => clamp(Math.round(v), 0, 255);

// ---------------------------------------------------------------- one tile
const FINE = 62.5, MARGIN = 2000, FW = Math.round((T + 2 * MARGIN) / FINE);   // 1088
function buildTile(i, j) {
  const fx0 = i * T - MARGIN, fy0 = j * T - MARGIN;
  // fine land classes and land mask
  const ne = new Uint8Array(FW * FW), lake = new Uint8Array(FW * FW);
  fillPolys(ne, FW, FW, fx0, fy0, FINE, LAND);
  fillPolys(lake, FW, FW, fx0, fy0, FINE, LAKES);
  const cls = new Uint8Array(FW * FW), land = new Uint8Array(FW * FW), flat = new Uint8Array(FW * FW);
  let wcAny = 0;
  for (let r = 0; r < FW; r++) for (let c = 0; c < FW; c++) {
    const k = r * FW + c;
    const g = fromGrid(fx0 + (c + 0.5) * FINE, fy0 + (r + 0.5) * FINE);
    const lc = landClass(g.lon, g.lat);
    const n = ne[k] && !lake[k];
    cls[k] = lc;
    if (lc) wcAny++;
    let l;
    if (!lc) l = n;
    else if (lc === 80) l = 0;
    else if (!n && lc === 60) { l = 0; flat[k] = 1; }          // tidal flats outside the coastline
    else l = 1;
    if (inFlevoland(g)) l = 0;
    land[k] = l ? 1 : 0;
  }
  // signed coast distance (m), land positive, on the fine grid
  const toWater = edt(land, FW, FW);
  const inv = new Uint8Array(FW * FW); for (let k = 0; k < inv.length; k++) inv[k] = land[k] ? 0 : 1;
  const toLand = edt(inv, FW, FW);
  const sdf = new Float32Array(FW * FW);
  for (let k = 0; k < sdf.length; k++) sdf[k] = land[k] ? (Math.sqrt(toWater[k]) - 0.5) * FINE : -(Math.sqrt(toLand[k]) - 0.5) * FINE;

  // lines image: 512², 125 m texels (2×2 fine pixels each)
  const L = GRID.LINES, px = T / L, off = MARGIN / FINE;
  const lines = new Uint8Array(L * L * 4);
  const lx0 = i * T, ly0 = j * T;
  const rivers = sideField(RIVERS, L, L, lx0, ly0, px, GRID.SIDE_RANGE);
  const rails = sideField(RAILS, L, L, lx0, ly0, px, GRID.SIDE_RANGE);
  for (let r = 0; r < L; r++) for (let c = 0; c < L; c++) {
    const fc = off + c * 2, fr = off + r * 2;
    const a = fr * FW + fc;
    const coast = (sdf[a] + sdf[a + 1] + sdf[a + FW] + sdf[a + FW + 1]) / 4;
    const p = (r * L + c) * 4, k = r * L + c;
    lines[p] = byte(127.5 + coast / GRID.COAST_RANGE * 127.5);
    lines[p + 1] = byte(127.5 + rivers.side[k] / GRID.SIDE_RANGE * 127.5);
    if (coast > 0) {
      // a mapped river: its half-width near the line, unless the land cover already shows open
      // water there (wide rivers come from WorldCover, at their true position)
      const near = rivers.dist[k] < rivers.hw[k] + 400 && coast > Math.min(900, 250 + rivers.hw[k] * 4);
      lines[p + 2] = near ? byte(rivers.hw[k] / 2) : 0;
    } else {
      // water: shallowness from the bathymetry, tidal flats fully shallow
      const g = fromGrid(lx0 + (c + 0.5) * px, ly0 + (r + 0.5) * px);
      const depth = -elevation(g.lon, g.lat);
      const fl = (flat[a] + flat[a + 1] + flat[a + FW] + flat[a + FW + 1]) / 4;
      lines[p + 2] = byte(255 * Math.max(fl, clamp(1 - depth / 14, 0, 1) * 0.85));
    }
    lines[p + 3] = byte(127.5 + rails.side[k] / GRID.SIDE_RANGE * 127.5);
  }

  // cover image: 256², 250 m texels (4×4 fine pixels each): towns, woods, meadows, heath
  const C = GRID.COVER, cpx = T / C;
  const cover = new Uint8Array(C * C * 4);
  const near = CITIES.filter((t) => t.x > lx0 - 3 * t.r - 3000 && t.x < lx0 + T + 3 * t.r + 3000 && t.y > ly0 - 3 * t.r - 3000 && t.y < ly0 + T + 3 * t.r + 3000);
  for (let r = 0; r < C; r++) for (let c = 0; c < C; c++) {
    let forest = 0, grass = 0, heath = 0, built = 0, landN = 0, nodata = 0;
    for (let v = 0; v < 4; v++) for (let u = 0; u < 4; u++) {
      const k = (off + r * 4 + v) * FW + off + c * 4 + u;
      if (!land[k]) continue;
      landN++;
      const lc = cls[k];
      if (lc === 10) forest++; else if (lc === 30 || lc === 90) grass++; else if (lc === 20 || lc === 60 || lc === 100) heath++; else if (lc === 50) built++; else if (!lc) nodata++;
    }
    const n = Math.max(1, landN);
    const x = lx0 + (c + 0.5) * cpx, y = ly0 + (r + 0.5) * cpx;
    let core = 0, hist = 0;
    for (const t of near) {
      const d = Math.hypot(x - t.x, y - t.y);
      core = Math.max(core, Math.exp(-((d / t.r) ** 2)) * Math.min(1, 0.55 + t.pop / 60000));
      hist = Math.max(hist, smooth(2.2 * t.r, 0.9 * t.r, d));
    }
    const b = built / n;
    const urban = Math.max(core, b * (hist > 0 ? 0.55 + 0.45 * hist : 0.55) * (hist > 0.05 ? 1 : 0.8));
    const p = (r * C + c) * 4;
    cover[p] = byte(urban * 255);
    cover[p + 1] = byte((forest + nodata * 0.18) / n * 255);
    cover[p + 2] = byte((grass + nodata * 0.25) / n * 255);
    cover[p + 3] = byte(heath / n * 255);
  }

  // relief image: 128², 500 m texels: slopes (true metres), elevation, lowland
  const R = GRID.RELIEF, rpx = T / R;
  const elev = new Float32Array((R + 2) * (R + 2));
  for (let r = -1; r <= R; r++) for (let c = -1; c <= R; c++) {
    let s = 0;
    for (let v = 0; v < 4; v++) for (let u = 0; u < 4; u++) {
      const g = fromGrid(lx0 + (c + (u + 0.5) / 4) * rpx, ly0 + (r + (v + 0.5) / 4) * rpx);
      s += elevation(g.lon, g.lat);
    }
    elev[(r + 1) * (R + 2) + c + 1] = s / 16;
  }
  const relief = new Uint8Array(R * R * 4);
  for (let r = 0; r < R; r++) for (let c = 0; c < R; c++) {
    const e = (dc, dr) => elev[(r + 1 + dr) * (R + 2) + c + 1 + dc];
    const g = fromGrid(lx0 + (c + 0.5) * rpx, ly0 + (r + 0.5) * rpx);
    const ex = 2 * rpx * Math.cos(g.lat * Math.PI / 180) / GRID.KX;   // true metres across two texels east-west
    const sx = (e(1, 0) - e(-1, 0)) / ex, sy = (e(0, 1) - e(0, -1)) / (2 * rpx);
    const h = Math.max(0, e(0, 0));
    // land share of this texel from the fine mask (slopes over the sea are bathymetry: flat)
    let ln = 0;
    for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) ln += land[(off + r * 8 + v) * FW + off + c * 8 + u];
    ln /= 64;
    const p = (r * R + c) * 4;
    relief[p] = byte(127.5 + clamp(sx * ln / GRID.SLOPE_RANGE, -1, 1) * 127.5);
    relief[p + 1] = byte(127.5 + clamp(sy * ln / GRID.SLOPE_RANGE, -1, 1) * 127.5);
    relief[p + 2] = byte(Math.sqrt(clamp(h / GRID.ELEV_MAX, 0, 1)) * 255);
    relief[p + 3] = byte(smooth(3.5, 0.3, e(0, 0)) * ln * 255);
  }
  return { lines, cover, relief, sdf, wc: wcAny / (FW * FW), riversField: rivers };
}
function inFlevoland(g) {
  if (g.lon < 5.05 || g.lon > 5.9 || g.lat < 52.27 || g.lat > 52.64) return false;
  let inside = false;
  for (let a = 0, b = FLEVOLAND.length - 1; a < FLEVOLAND.length; b = a++) {
    const [x1, y1] = FLEVOLAND[a], [x2, y2] = FLEVOLAND[b];
    if ((y1 > g.lat) !== (y2 > g.lat) && g.lon < (x2 - x1) * (g.lat - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

/** Planes, each row delta coded (byte-wise, mod 256), then gzip. Header: 'SWT1', then per image
 *  u16 size and u8 channels. */
function pack(images) {
  const parts = [Buffer.from('SWT1')];
  for (const { data, size, ch } of images) {
    const head = Buffer.alloc(3); head.writeUInt16LE(size, 0); head[2] = ch; parts.push(head);
    const plane = Buffer.alloc(size * size);
    for (let k = 0; k < ch; k++) {
      for (let r = 0; r < size; r++) {
        let prev = 0;
        for (let c = 0; c < size; c++) { const v = data[(r * size + c) * ch + k]; plane[r * size + c] = (v - prev) & 255; prev = v; }
      }
      parts.push(Buffer.from(plane));
    }
  }
  return gzipSync(Buffer.concat(parts), { level: 9 });
}

// ---------------------------------------------------------------- run
const { tiles, views } = planTiles();
let total = 0;
const built = [];
const fields = new Map();   // tiles holding a place focus: kept for the place alignment below
const focusTiles = new Map();
for (const [key, v] of Object.entries(views)) {
  const [gx, gy] = toGrid(v.focus.lon, v.focus.lat);
  focusTiles.set(key, `${Math.floor(gx / T)}_${Math.floor(gy / T)}`);
}
const t0 = Date.now();
for (const t of tiles) {
  const id = `${t.i}_${t.j}`;
  if (ONLY && !ONLY.has(id)) { if (existsSync(join(OUT, `t${id}.bin`))) built.push(id); continue; }
  const tile = buildTile(t.i, t.j);
  const buf = pack([{ data: tile.lines, size: GRID.LINES, ch: 4 }, { data: tile.cover, size: GRID.COVER, ch: 4 }, { data: tile.relief, size: GRID.RELIEF, ch: 4 }]);
  writeFileSync(join(OUT, `t${id}.bin`), buf);
  total += buf.length;
  built.push(id);
  if ([...focusTiles.values()].includes(id)) fields.set(id, tile);
  if (process.env.TERRAIN_PNG) {
    // debug previews (north up): the lines and cover images as RGB(A) PNGs
    for (const [name, data, size] of [['lines', tile.lines, GRID.LINES], ['cover', tile.cover, GRID.COVER], ['relief', tile.relief, GRID.RELIEF]]) {
      const flip = Buffer.alloc(size * size * 3);
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) for (let k = 0; k < 3; k++) flip[((size - 1 - r) * size + c) * 3 + k] = data[(r * size + c) * 4 + (name === 'lines' && k === 2 ? 3 : k)];
      await sharp(flip, { raw: { width: size, height: size, channels: 3 } }).png().toFile(join(process.env.TERRAIN_PNG, `${id}-${name}.png`));
    }
  }
  console.log(`tile ${id} ${(buf.length / 1024).toFixed(0)} KB wc ${(tile.wc * 100).toFixed(0)}% (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
console.log('tiles total', (total / 1048576).toFixed(2), 'MB');

// Place alignment: the city's river (TargetGround's docks, works and bridges follow it) sits on
// the nearest real water within 2.5 km of the town centre. Angle: the water's run, radians from
// east toward north (grid frame).
const places = {};
for (const [key, v] of Object.entries(views)) {
  const id = focusTiles.get(key), tile = fields.get(id);
  const [gx, gy] = toGrid(v.focus.lon, v.focus.lat);
  const out = { lon: +v.focus.lon.toFixed(5), lat: +v.focus.lat.toFixed(5), bearing: +v.bearing.toFixed(5), at: v.at, river: 0, riverAngle: 0 };
  if (tile) {
    const [i, j] = id.split('_').map(Number);
    const L = GRID.LINES, px = T / L;
    let best = null;
    const coastAt = (c, r) => (tile.lines[(clamp(r, 0, L - 1) * L + clamp(c, 0, L - 1)) * 4] - 127.5) / 127.5 * GRID.COAST_RANGE;
    for (let r = 0; r < L; r++) for (let c = 0; c < L; c++) {
      const x = i * T + (c + 0.5) * px, y = j * T + (r + 0.5) * px, d = Math.hypot(x - gx, y - gy);
      const p = (r * L + c) * 4;
      const riv = tile.lines[p + 2] > 0 && Math.abs((tile.lines[p + 1] - 127.5) / 127.5 * GRID.SIDE_RANGE) < px;
      const kind = riv ? 1 : 2;
      if (d > (riv ? 2500 : 4000) || (best && d + (kind === 1 ? 0 : 1500) >= best.d + (best.kind === 1 ? 0 : 1500))) continue;
      if (!riv) {
        // a shore of a sizeable water body (harbour, estuary, fjord), not a pond
        if (Math.abs(coastAt(c, r)) > px * 0.75) continue;
        let deep = 0;
        for (let v = -6; v <= 6; v += 2) for (let u = -6; u <= 6; u += 2) deep = Math.min(deep, coastAt(c + u, r + v));
        if (deep > -300) continue;
      }
      best = { d, x, y, c, r, kind };
    }
    if (best && v.at === 1) {
      const p = fromGrid(best.x, best.y);
      // run of the water: perpendicular to the gradient of the field it was found in
      const L4 = (cc, rr, ch) => tile.lines[(clamp(rr, 0, L - 1) * L + clamp(cc, 0, L - 1)) * 4 + ch];
      const ch = best.kind === 1 ? 1 : 0;
      const gxv = L4(best.c + 2, best.r, ch) - L4(best.c - 2, best.r, ch), gyv = L4(best.c, best.r + 2, ch) - L4(best.c, best.r - 2, ch);
      out.lon = +p.lon.toFixed(5); out.lat = +p.lat.toFixed(5);
      out.river = best.kind;
      out.riverAngle = +Math.atan2(gxv, -gyv).toFixed(4);
    }
  }
  places[key] = out;
}

// Overview: the whole tile grid at 2 km, R land share, G woods, B towns, A elevation
const is = tiles.map((t) => t.i), js = tiles.map((t) => t.j);
const oi0 = Math.min(...is), oj0 = Math.min(...js), ow = (Math.max(...is) - oi0 + 1) * T / GRID.OVERVIEW, oh = (Math.max(...js) - oj0 + 1) * T / GRID.OVERVIEW;
{
  const S = 4, sub = GRID.OVERVIEW / S, W = ow * S, H = oh * S;
  const ne = new Uint8Array(W * H), lake = new Uint8Array(W * H);
  fillPolys(ne, W, H, oi0 * T, oj0 * T, sub, LAND);
  fillPolys(lake, W, H, oi0 * T, oj0 * T, sub, LAKES);
  const data = new Uint8Array(ow * oh * 4);
  const towns = new Float32Array(ow * oh);
  for (const t of CITIES) {
    const R = Math.ceil(2 * t.r / GRID.OVERVIEW) + 1, cx = Math.floor((t.x - oi0 * T) / GRID.OVERVIEW), cy = Math.floor((t.y - oj0 * T) / GRID.OVERVIEW);
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (x < 0 || y < 0 || x >= ow || y >= oh) continue;
      const d = Math.hypot(oi0 * T + (x + 0.5) * GRID.OVERVIEW - t.x, oj0 * T + (y + 0.5) * GRID.OVERVIEW - t.y);
      towns[y * ow + x] = Math.max(towns[y * ow + x], Math.exp(-((d / t.r) ** 2)) * Math.min(1, (t.r / GRID.OVERVIEW) ** 2 * 3));
    }
  }
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    let ln = 0, fo = 0, n = 0;
    for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
      const k = (y * S + v) * W + x * S + u;
      const g = fromGrid(oi0 * T + (x * S + u + 0.5) * sub, oj0 * T + (y * S + v + 0.5) * sub);
      const lc = landClass(g.lon, g.lat);
      const l = lc ? lc !== 80 && (ne[k] || lc !== 60) : ne[k] && !lake[k];
      if (!l || inFlevoland(g)) continue;
      ln++; if (lc === 10) fo++; else if (!lc) fo += 0.18; n++;
    }
    const g = fromGrid(oi0 * T + (x + 0.5) * GRID.OVERVIEW, oj0 * T + (y + 0.5) * GRID.OVERVIEW);
    const p = (y * ow + x) * 4;
    data[p] = byte(ln / (S * S) * 255);
    data[p + 1] = byte(n ? fo / n * 255 : 0);
    data[p + 2] = byte(towns[y * ow + x] * 255);
    data[p + 3] = byte(Math.sqrt(clamp(elevation(g.lon, g.lat) / GRID.ELEV_MAX, 0, 1)) * 255);
  }
  // non-square: stored as two dims in the header (width in the u16, height after the channels)
  const buf = gzipSync(Buffer.concat([Buffer.from('SWO1'), Buffer.from(new Uint16Array([ow, oh]).buffer), Buffer.from(data)]), { level: 9 });
  writeFileSync(join(OUT, 'overview.bin'), buf);
  console.log('overview', ow, oh, (buf.length / 1024).toFixed(0), 'KB');
}

const ts = `// Generated by tools/terrain/build_terrain.mjs: do not edit by hand.
// Tiles present in public/terrain/, the overview's placement (tile units) and, per chart place,
// the focus the mission is aligned on (the target's river or shore when one is within 2.5 km)
// with the water's run (radians from east toward north, grid frame; river 1 = river, 2 = shore).
export const TERRAIN_TILES: readonly string[] = ${JSON.stringify(built.sort())};
export const TERRAIN_OVERVIEW = ${JSON.stringify({ i0: oi0, j0: oj0, w: ow, h: oh })} as const;
export interface TerrainPlace { lon: number; lat: number; bearing: number; at: number; river: number; riverAngle: number }
export const TERRAIN_PLACES: Record<string, TerrainPlace> = ${JSON.stringify(places, null, 2)};
`;
writeFileSync(join(ROOT, 'src/world/TerrainIndex.ts'), ts);
console.log('index written', Object.keys(places).length, 'places');
