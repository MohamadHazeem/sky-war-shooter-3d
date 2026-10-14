import { CHART } from './EuropeChart';
import { GRID, regionBlock, toGrid, travel, type Geo } from './TerrainGrid';
import { TERRAIN_PLACES, TERRAIN_TILES, type TerrainPlace } from './TerrainIndex';
import type { Mission } from '../game/Missions';

// Europe from altitude (Phase 10 goal 04): which real ground a mission flies over, and the tile
// format of public/terrain/ (built offline by tools/terrain/build_terrain.mjs from public data).
// Pure data helpers; the GPU side is render/FarTerrain.ts.

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export function terrainSeason(date: string): Season {
  if (/December|January|February/.test(date)) return 'winter';
  if (/March|April|May/.test(date)) return 'spring';
  return /September|October|November/.test(date) ? 'autumn' : 'summer';
}
export const SEASON_INDEX: Record<Season, number> = { summer: 0, autumn: 1, winter: 2, spring: 3 };

export interface GeoPoint { lon: number; lat: number }
function placeFor(m: Pick<Mission, 'target'>) { return CHART.PLACES.find((p) => m.target.includes(p.key)) ?? null; }

/** The briefing route (chart order), or null for operations with no place on the chart. */
export function terrainRoute(m: Pick<Mission, 'target'>): GeoPoint[] | null {
  const p = placeFor(m);
  if (!p) return null;
  return p.home ? [p.from ?? CHART.BERLIN, p, p.eng ?? CHART.NORFOLK, CHART.BASE]
    : [CHART.BASE, p.eng ?? CHART.NORFOLK, ...(p.ip ? [p.ip] : []), p];
}

/** Where the mission sits on the real map: the focus (target or coast crossing, aligned on its
 *  river), the bearing flown there and the share of the ground track at which it is reached. */
export function terrainView(m: Pick<Mission, 'target'>): TerrainPlace | null {
  const p = placeFor(m);
  return p ? TERRAIN_PLACES[p.key] ?? null : null;
}

/** Ground track length (m) at true scale: up to the bomb impact, or 80% of the mission time. */
export function trackLength(m: Pick<Mission, 'bombsAway' | 'duration'>, cruise: number, fallLead: number): number {
  return cruise * (m.bombsAway ? m.bombsAway + fallLead : Math.max(60, Math.min(400, m.duration) * 0.8));
}

export interface Region { i0: number; j0: number; tiles: { i: number; j: number; id: string; present: boolean }[] }
/** The 3×3 tile block for a mission track of `length` metres. */
export function terrainRegion(view: TerrainPlace, length: number): Region {
  const focus: Geo = { lon: view.lon, lat: view.lat };
  const mid = travel(focus, view.bearing, (0.5 - view.at) * length);
  const [mx, my] = toGrid(mid.lon, mid.lat);
  const { i0, j0 } = regionBlock(mx, my);
  const tiles: Region['tiles'] = [];
  for (let j = j0; j < j0 + GRID.BLOCK; j++) for (let i = i0; i < i0 + GRID.BLOCK; i++) {
    const id = `${i}_${j}`;
    tiles.push({ i, j, id, present: TERRAIN_TILES.includes(id) });
  }
  return { i0, j0, tiles };
}

export interface TileImage { size: number; ch: number; data: Uint8Array }
/** Decodes an inflated tile ('SWT1': per image u16 size, u8 channels, then row-delta-coded planes)
 *  into interleaved RGBA images: lines, cover, relief. */
export function unpackTile(b: Uint8Array): TileImage[] {
  if (b[0] !== 0x53 || b[1] !== 0x57 || b[2] !== 0x54 || b[3] !== 0x31) throw new Error('not a terrain tile');
  const images: TileImage[] = [];
  let o = 4;
  while (o + 3 <= b.length) {
    const size = b[o] | (b[o + 1] << 8), ch = b[o + 2];
    o += 3;
    const data = new Uint8Array(size * size * ch);
    for (let k = 0; k < ch; k++) {
      for (let r = 0; r < size; r++) {
        let prev = 0;
        const row = o + r * size, dst = r * size * ch + k;
        for (let c = 0; c < size; c++) { prev = (prev + b[row + c]) & 255; data[dst + c * ch] = prev; }
      }
      o += size * size;
    }
    images.push({ size, ch, data });
  }
  return images;
}

/** Inflated overview ('SWO1', u16 width, u16 height, RGBA bytes). */
export function unpackOverview(b: Uint8Array): { w: number; h: number; data: Uint8Array } {
  if (b[0] !== 0x53 || b[1] !== 0x57 || b[2] !== 0x4f || b[3] !== 0x31) throw new Error('not a terrain overview');
  const w = b[4] | (b[5] << 8), h = b[6] | (b[7] << 8);
  return { w, h, data: b.subarray(8, 8 + w * h * 4) };
}

/** Coast signed distance (m, land positive) decoded from a lines byte. */
export const coastMetres = (v: number) => (v - 127.5) / 127.5 * GRID.COAST_RANGE;
