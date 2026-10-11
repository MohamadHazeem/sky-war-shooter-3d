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

// Repeatable 16 km land-cover tile: crop, forest, river, village masks. No canvas or assets.
// Periodic warping keeps both the river and woods continuous at tile edges. Mips are the LOD.
const hash = (x: number, y: number) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
export function terrainPixels(size = 512): Uint8Array {
  const data = new Uint8Array(size * size * 4), pi = Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const px = u * 48 + 0.7 * Math.sin(v * pi * 3), py = v * 40 + 0.4 * Math.sin(u * pi * 2);
    const ix = (Math.floor(px) + 48) % 48, iy = (Math.floor(py) + 40) % 40;
    const crop = hash(ix, iy), edge = Math.min(px - Math.floor(px), py - Math.floor(py));
    const woods = Math.sin(u * pi * 3 + Math.sin(v * pi * 2)) + Math.cos(v * pi * 4 + Math.cos(u * pi * 3));
    const river = Math.abs(u - (0.48 + 0.09 * Math.sin(v * pi) + 0.026 * Math.sin(v * pi * 3)));
    const tx = u * 5, ty = v * 5, town = hash(Math.floor(tx), Math.floor(ty));
    const dx = tx % 1 - 0.5, dy = ty % 1 - 0.5;
    const roof = hash(Math.floor(u * 320), Math.floor(v * 320));
    const built = town > 0.45 && dx * dx + dy * dy < (0.006 + town * 0.012) * (0.7 + roof * 0.6);
    const p = (y * size + x) * 4;
    data[p] = Math.round((0.2 + crop * 0.8) * (edge < 0.07 ? 0.55 : 1) * 255);
    data[p + 1] = Math.round(Math.min(1, Math.max(0, (woods - 0.65) * 2.5)) * 255);
    data[p + 2] = river < 0.004 ? 255 : 0;
    if (built) data[p] = Math.round(roof * 255);
    data[p + 3] = built ? (roof < 0.25 ? 125 : 230) : 0;
  }
  return data;
}
