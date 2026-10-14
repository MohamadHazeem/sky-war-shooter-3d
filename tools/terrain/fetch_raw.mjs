// Downloads the public source data for the far terrain into a scratch directory OUTSIDE the repo
// (nothing here is committed; tools/terrain/build_terrain.mjs turns it into public/terrain/).
//   node tools/terrain/fetch_raw.mjs <rawDir>
// Sources and licences: tools/terrain/README.md.
//  - Natural Earth 10m (public domain): land, minor islands, lakes, rivers, railroads
//  - GeoNames cities5000 (CC BY 4.0): towns
//  - Terrain Tiles / Terrarium z9 (AWS Open Data; SRTM, EU-DEM, GMTED, ETOPO1 ...): elevation
//  - ESA WorldCover 2021 v200 (CC BY 4.0): land cover, read from the COGs' 4500 px overview by HTTP range requests
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { planTiles, tileBounds } from './plan.mjs';
import { readIfds } from './tiff.mjs';

const RAW = process.argv[2];
if (!RAW) { console.error('usage: node tools/terrain/fetch_raw.mjs <rawDir>'); process.exit(1); }
for (const d of ['ne', 'geonames', 'terrarium', 'wc']) mkdirSync(join(RAW, d), { recursive: true });

async function get(url, file, headers = {}) {
  if (existsSync(file)) return readFileSync(file);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { headers });
      if (r.status === 404 || r.status === 403) return null;
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync(file, buf);
      return buf;
    } catch (e) { if (attempt === 3) throw e; await new Promise((res) => setTimeout(res, 1000 * (attempt + 1))); }
  }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
for (const f of ['ne_10m_land', 'ne_10m_minor_islands', 'ne_10m_lakes', 'ne_10m_lakes_europe', 'ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe', 'ne_10m_railroads']) {
  await get(`${NE}${f}.geojson`, join(RAW, 'ne', `${f}.geojson`));
}
console.log('natural earth ok');

if (!existsSync(join(RAW, 'geonames', 'cities5000.txt'))) {
  await get('https://download.geonames.org/export/dump/cities5000.zip', join(RAW, 'geonames', 'cities5000.zip'));
  execFileSync('unzip', ['-o', '-q', join(RAW, 'geonames', 'cities5000.zip'), '-d', join(RAW, 'geonames')]);
}
console.log('geonames ok');

// Terrarium z9 tiles over every planned tile (+ 2 km margin)
const { tiles } = planTiles();
const z = 9, n = 2 ** z;
const tx = (lon) => Math.floor((lon + 180) / 360 * n);
const ty = (lat) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); };
const dem = new Set();
for (const t of tiles) {
  const b = tileBounds(t.i, t.j, 2000);
  for (let y = ty(b.north); y <= ty(b.south); y++) for (let x = tx(b.west); x <= tx(b.east); x++) dem.add(`${x}_${y}`);
}
await pool([...dem], 8, async (k) => {
  const [x, y] = k.split('_');
  await get(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, join(RAW, 'terrarium', `${z}_${x}_${y}.png`));
});
console.log('terrarium ok', dem.size);

// WorldCover: per 3° file, the IFD that is 4500 px wide (≈ 74 m N-S), all of its internal tiles
const wcFiles = new Set();
for (const t of tiles) {
  const b = tileBounds(t.i, t.j, 2000);
  for (let lat = Math.floor(b.south / 3) * 3; lat < b.north; lat += 3) for (let lon = Math.floor(b.west / 3) * 3; lon < b.east; lon += 3) {
    wcFiles.add(`N${String(lat).padStart(2, '0')}${lon < 0 ? 'W' : 'E'}${String(Math.abs(lon)).padStart(3, '0')}`);
  }
}
const WC = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_';
await pool([...wcFiles], 3, async (name) => {
  const url = `${WC}${name}_Map.tif`;
  const head = await get(url, join(RAW, 'wc', `${name}.head`), { Range: 'bytes=0-262143' });
  if (!head) { console.log('worldcover: no file', name); return; }
  const ifd = readIfds(head).find((d) => d.width === 4500);
  if (!ifd) throw new Error('no 4500 px overview in ' + name);
  const parts = [];
  for (let k = 0; k < ifd.offsets.length; k++) {
    const buf = await get(url, join(RAW, 'wc', `${name}_${k}.bin`), { Range: `bytes=${ifd.offsets[k]}-${ifd.offsets[k] + ifd.counts[k] - 1}` });
    parts.push(buf.length);
  }
  writeFileSync(join(RAW, 'wc', `${name}.json`), JSON.stringify({ width: ifd.width, height: ifd.height, tile: ifd.tile, n: ifd.offsets.length }));
  console.log('worldcover', name, parts.length, 'tiles');
});
console.log('worldcover ok');
