import { CHART } from './EuropeChart';
import type { Mission } from '../game/Missions';

export type Season = 'summer' | 'autumn' | 'winter';
export function terrainSeason(date: string): Season {
  if (/December|January|February/.test(date)) return 'winter';
  return /September|October|November/.test(date) ? 'autumn' : 'summer';
}
export interface GeoPoint { lon: number; lat: number }
export function terrainRoute(m: Pick<Mission, 'target'>): GeoPoint[] | null {
  const p = CHART.PLACES.find(p => m.target.includes(p.key));
  if (!p) return null;
  return p.home ? [p.from ?? CHART.BERLIN, p, p.eng ?? CHART.NORFOLK, CHART.BASE]
    : [CHART.BASE, p.eng ?? CHART.NORFOLK, ...(p.ip ? [p.ip] : []), p];
}

export function onEuropeanLand(lon: number, lat: number): boolean {
  for (const ring of [CHART.ENGLAND, CHART.MAINLAND]) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > lat) !== (b[1] > lat) && lon < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    if (inside) return true;
  }
  // Chart islands are ellipses, not a closed coastline polygon.
  return CHART.ISLANDS.some(p => ((lon - p[0]) / 0.045) ** 2 + ((lat - p[1]) / 0.018) ** 2 < 1);
}

/** Arc-length navigation along the briefing route, clamped to its end regions. Setup only.
 * Campaign geography is compressed along track to the scheduled bomb run; cross-track metres
 * remain metres. Baking this into a strip keeps coastlines fixed across floating-origin shifts. */
export function routePoint(route: GeoPoint[], progress: number, cross = 0): GeoPoint {
  const lengths = route.slice(1).map((p, i) => Math.hypot((p.lon - route[i].lon) * CHART.KX, p.lat - route[i].lat));
  let distance = Math.min(1, Math.max(0, progress)) * lengths.reduce((a, b) => a + b, 0), i = 0;
  while (i < lengths.length - 1 && distance > lengths[i]) distance -= lengths[i++];
  const a = route[i], b = route[i + 1], len = lengths[i] || 1;
  const east = (b.lon - a.lon) * CHART.KX / len, north = (b.lat - a.lat) / len;
  return { lon: a.lon + (b.lon - a.lon) * distance / len + north * cross / (111320 * CHART.KX),
    lat: a.lat + (b.lat - a.lat) * distance / len - east * cross / 111320 };
}

export const COAST_WIDTH = 256, COAST_HEIGHT = 512, CROSS_SPAN = 80000, ROUTE_PAD = 24000;
export function coastPixels(route: GeoPoint[], length: number): Uint8Array {
  const data = new Uint8Array(COAST_WIDTH * COAST_HEIGHT);
  const span = length + ROUTE_PAD * 2;
  for (let y = 0; y < COAST_HEIGHT; y++) {
    const progress = ((y + 0.5) / COAST_HEIGHT * span - ROUTE_PAD) / length;
    // Each scanline is affine across track: only two route evaluations per row.
    const a = routePoint(route, progress, -CROSS_SPAN / 2), b = routePoint(route, progress, CROSS_SPAN / 2);
    for (let x = 0; x < COAST_WIDTH; x++) {
      const t = (x + 0.5) / COAST_WIDTH;
      data[y * COAST_WIDTH + x] = onEuropeanLand(a.lon + (b.lon - a.lon) * t, a.lat + (b.lat - a.lat) * t) ? 255 : 0;
    }
  }
  return data;
}

// A single non-repeating regional atlas. Baked once, never in the frame loop. The
// 96 km extent covers the route and visible ground; clamped edges disappear in haze.
export const COVER_SIZE = 2048, COVER_SPAN = 96000;
const hash = (x: number, y: number) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const clamp = (v: number) => Math.max(0, Math.min(1, v));
function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let u = x - ix, v = y - iy;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  return (hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u) * (1 - v)
    + (hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u) * v;
}

/** Bake land-cover masks, then resolve to RGB albedo (scaled by 3) + snow coverage.
 * Filtering final colours avoids false palette bands at boundaries and in mips.
 * Metre-scale features use coverage so roads and rivers survive coarse mips. */
export function terrainPixels(size = COVER_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4), metres = COVER_SPAN / size;
  const spacing = 430, count = Math.ceil(COVER_SPAN / spacing) + 8;
  const sx = new Float32Array(count * count), sy = new Float32Array(count * count);
  const tone = new Float32Array(count * count);
  for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) {
    const i = y * count + x;
    sx[i] = (x - 4 + hash(x, y) * 0.98) * spacing;
    sy[i] = (y - 4 + hash(x + 911, y) * 0.98) * spacing;
    tone[i] = hash(x + 317, y + 591);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const wx = (x + 0.5) * metres, wy = (y + 0.5) * metres;
    // Broad, non-periodic domain warp bends parcel boundaries and rotates local
    // groups. Jittered Voronoi sites give unequal areas, without rectangular tiles.
    const px = wx + (noise(wx / 2300, wy / 2300) - 0.5) * 1600;
    const py = wy + (noise(wx / 1900 + 71, wy / 1900) - 0.5) * 1300;
    const ix = Math.floor(px / spacing) + 4, iy = Math.floor(py / spacing) + 4;
    let d1 = Infinity, d2 = Infinity, seed = 0;
    for (let j = Math.max(0, iy - 2); j <= Math.min(count - 1, iy + 2); j++) {
      for (let k = Math.max(0, ix - 2); k <= Math.min(count - 1, ix + 2); k++) {
        const i = j * count + k, dx = px - sx[i], dy = py - sy[i], d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; seed = i; } else if (d < d2) d2 = d;
      }
    }
    const n = noise(wx / 1900 + 113, wy / 1900 + 47) * 0.6
      + noise(wx / 670, wy / 670 + 193) * 0.28 + noise(wx / 210, wy / 210) * 0.12;
    const forest = clamp((n - 0.54) * 9);
    const hedge = tone[seed] < 0.42 ? clamp(1 - (Math.sqrt(d2) - Math.sqrt(d1)) / 18) * 0.7 : 0;
    const p = (y * size + x) * 4;
    data[p] = Math.round(255 * clamp(0.06 + tone[seed] * 0.9 + (noise(wx / 95, wy / 95) - 0.5) * 0.045));
    data[p + 1] = Math.round(Math.max(forest, hedge) * 255);
  }
  // Coverage-aware segment painter; only walks each feature's small bounding box.
  const line = (ax: number, ay: number, bx: number, by: number, width: number, kind: 'road' | 'river' | 'meadow') => {
    const r = width + metres, dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
    for (let y = Math.max(0, Math.floor((Math.min(ay, by) - r) / metres)); y <= Math.min(size - 1, Math.ceil((Math.max(ay, by) + r) / metres)); y++) {
      for (let x = Math.max(0, Math.floor((Math.min(ax, bx) - r) / metres)); x <= Math.min(size - 1, Math.ceil((Math.max(ax, bx) + r) / metres)); x++) {
        const wx = (x + 0.5) * metres, wy = (y + 0.5) * metres;
        const t = clamp(((wx - ax) * dx + (wy - ay) * dy) / len2);
        const d = Math.hypot(wx - ax - dx * t, wy - ay - dy * t);
        const a = clamp((width - d) / metres + 0.5), p = (y * size + x) * 4;
        if (kind === 'river') data[p + 2] = Math.max(data[p + 2], Math.round(a * 255));
        else if (kind === 'meadow') {
          data[p] = Math.round(data[p] * (1 - a) + (68 + noise(wx / 250, wy / 250) * 24) * a);
          data[p + 1] = Math.round(data[p + 1] * (1 - a * 0.92));
        } else {
          data[p] = Math.round(data[p] * (1 - a) + 160 * a);
          data[p + 1] = Math.round(data[p + 1] * (1 - a));
          data[p + 3] = Math.max(data[p + 3], Math.round(a * 90));
        }
      }
    }
  };
  const riverX = (y: number, branch: number) => COVER_SPAN * (0.22 + branch * 0.31)
    + 2600 * Math.sin(y / 7400 + branch * 2) + 1100 * Math.sin(y / 2300 + branch) + 340 * Math.sin(y / 770);
  // Irregular valley floors with riparian woods; water is drawn after the roads.
  for (let b = 0; b < 2; b++) for (let y = 0; y < COVER_SPAN; y += 160) {
    line(riverX(y, b), y, riverX(y + 160, b), y + 160, 260 + 130 * noise(y / 570, b), 'meadow');
  }
  const towns: { x: number; y: number; seed: number }[] = [];
  const townCount = 16, townStep = COVER_SPAN / townCount;
  for (let y = 0; y < townCount; y++) for (let x = 0; x < townCount; x++) {
    const ty = (y + 0.15 + hash(x, y + 77) * 0.7) * townStep;
    let tx = (x + 0.15 + hash(x + 65, y) * 0.7) * townStep;
    // Several villages sit on a bank, where the road can cross the river.
    for (let b = 0; b < 2; b++) if (Math.abs(tx - riverX(ty, b)) < 1300) tx = riverX(ty, b) + 210;
    towns.push({ x: tx, y: ty, seed: x + y * townCount });
  }
  for (let i = 0; i < towns.length; i++) {
    const a = towns[i];
    for (const next of [i % townCount < townCount - 1 ? i + 1 : -1, i + townCount]) {
      const b = towns[next]; if (!b) continue;
      let px = a.x, py = a.y;
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      for (let k = 1; k <= 16; k++) {
        const t = k / 16, bend = Math.sin(t * Math.PI) * (hash(i, next) - 0.5) * 1300;
        const x = a.x + dx * t - dy / length * bend, y = a.y + dy * t + dx / length * bend;
        line(px, py, x, y, 15, 'road'); px = x; py = y;
      }
      // Long narrow village strips: different bearing/length for every connection,
      // staggered ends and occasional fallow gaps. No repeating regional grid.
      const ux = dx / length, uy = dy / length;
      for (let strip = 0; strip < 10; strip++) {
        const along = 180 + strip * (65 + hash(i, next) * 35), sign = strip % 2 ? 1 : -1;
        const reach = 250 + hash(strip + i, next) * 570;
        const cx = a.x + ux * along, cy = a.y + uy * along;
        const val = 0.08 + hash(i + strip, next + 411) * 0.86;
        const r = reach + 90;
        for (let y = Math.max(0, Math.floor((cy - r) / metres)); y <= Math.min(size - 1, Math.ceil((cy + r) / metres)); y++) {
          for (let x = Math.max(0, Math.floor((cx - r) / metres)); x <= Math.min(size - 1, Math.ceil((cx + r) / metres)); x++) {
            const rx = (x + 0.5) * metres - cx, ry = (y + 0.5) * metres - cy;
            const u = rx * ux + ry * uy, v = (-rx * uy + ry * ux) * sign;
            if (Math.abs(u) < 28 + hash(strip, i) * 18 && v > 90 && v < reach) {
              const p = (y * size + x) * 4; data[p] = Math.round(val * 255); data[p + 1] = 0;
            }
          }
        }
      }
      // Roof blocks branch along each approach with courtyards and gaps, instead
      // of a filled circular settlement mask. Dense centres occur at junctions.
      const reach = 0.09 + hash(i, next + 31) * 0.16;
      for (let k = 0; k < 90; k++) {
        const t = hash(i + k, next + 16) * reach;
        const bend = Math.sin(t * Math.PI) * (hash(i, next) - 0.5) * 1300;
        const offset = (hash(k + 91, i) - 0.5) * (130 + 480 * (1 - t / reach) ** 2);
        const cx = (a.x + dx * t - uy * (bend + offset)) / metres;
        const cy = (a.y + dy * t + ux * (bend + offset)) / metres;
        const radius = (24 + hash(k, i + 17) * 28) / metres;
        for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(size - 1, Math.ceil(cy + radius)); y++) {
          for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(size - 1, Math.ceil(cx + radius)); x++) {
            const coverage = clamp(radius + 0.5 - Math.max(Math.abs(x + 0.5 - cx), Math.abs(y + 0.5 - cy)));
            const p = (y * size + x) * 4;
            data[p + 3] = Math.max(data[p + 3], Math.round(coverage * 255));
            data[p + 1] = Math.round(data[p + 1] * (1 - coverage));
          }
        }
      }
    }
  }
  for (let b = 0; b < 2; b++) for (let y = 0; y < COVER_SPAN; y += 160) {
    line(riverX(y, b), y, riverX(y + 160, b), y + 160, 42 + b * 18, 'river');
  }
  // Resolve the temporary crop/woods/water/building masks before GPU filtering.
  // A crop identifier is categorical: interpolating it in a shader invents bands
  // of unrelated crops between neighbouring parcels and shifts distant mip colour.
  for (let p = 0; p < data.length; p += 4) {
    const crop = data[p] / 255, woods = data[p + 1] / 255 * 0.92;
    const water = data[p + 2] / 255, built = data[p + 3] / 255;
    let r: number, g: number, b: number;
    if (crop < 0.35) {
      const t = crop / 0.35; r = 0.105 + t * 0.07; g = 0.125 + t * 0.065; b = 0.089 + t * 0.045;
    } else if (crop < 0.55) {
      const t = (crop - 0.35) / 0.2; r = 0.13 + t * 0.05; g = 0.113 + t * 0.04; b = 0.09 + t * 0.035;
    } else if (crop < 0.8) {
      const t = (crop - 0.55) / 0.25; r = 0.205 + t * 0.05; g = 0.187 + t * 0.048; b = 0.14 + t * 0.04;
    } else {
      const t = (crop - 0.8) / 0.2; r = 0.28 + t * 0.04; g = 0.27 + t * 0.04; b = 0.22 + t * 0.03;
    }
    r += (0.052 - r) * woods; g += (0.073 - g) * woods; b += (0.054 - b) * woods;
    r += (0.10 + crop * 0.095 - r) * built;
    g += (0.105 + crop * 0.078 - g) * built;
    b += (0.10 + crop * 0.065 - b) * built;
    r += (0.025 - r) * water; g += (0.060 - g) * water; b += (0.085 - b) * water;
    data[p] = Math.round(r * 765); data[p + 1] = Math.round(g * 765); data[p + 2] = Math.round(b * 765);
    data[p + 3] = Math.round((1 - water) * (1 - woods * 0.82) * (1 - built * 0.72) * 255);
  }
  return data;
}
