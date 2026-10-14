// The real-geography grid shared by the offline terrain builder (tools/terrain/build_terrain.mjs)
// and the runtime (FarTerrainData.ts / render/FarTerrain.ts). No imports: the Node build tool
// loads this file directly (type stripping).
//
// Grid metres: a fixed equirectangular projection, x east / y north of (LON0, LAT0), with the
// east-west scale of 52°N. Each tile is 64 km square: a 512² "lines" image (coast, river and
// rail distance fields, 125 m texels), a 256² "cover" image (towns and land cover, 250 m) and a
// 128² "relief" image (slopes and elevation, 500 m). A mission loads the 3×3 block of tiles
// around its flight path and shows it at true scale; a coarse overview carries the coastline
// out to the horizon.
export const GRID = {
  LON0: -4, LAT0: 47,
  KX: Math.cos((52 * Math.PI) / 180),
  DEG: 111320,          // metres per degree of latitude
  TILE: 64000,          // tile size, grid metres
  LINES: 512,           // lines image size (125 m texels)
  COVER: 256,           // cover image size (250 m texels)
  RELIEF: 128,          // relief image size (500 m texels)
  BLOCK: 3,             // tiles per side of a mission region
  OVERVIEW: 2000,       // overview texel size (m)
  COAST_RANGE: 2000,    // coast signed distance: ±metres over the byte range
  SIDE_RANGE: 600,      // river / rail signed side distance: ±metres over the byte range
  SLOPE_RANGE: 0.35,    // terrain slope (m/m) over ±127
  ELEV_MAX: 1500,       // elevation byte scale: metres = (v/255)² * ELEV_MAX
} as const;

export interface Geo { lon: number; lat: number }

export function toGrid(lon: number, lat: number): [number, number] {
  return [(lon - GRID.LON0) * GRID.DEG * GRID.KX, (lat - GRID.LAT0) * GRID.DEG];
}
export function fromGrid(x: number, y: number): Geo {
  return { lon: GRID.LON0 + x / (GRID.DEG * GRID.KX), lat: GRID.LAT0 + y / GRID.DEG };
}

/** Initial great-circle bearing (radians clockwise from north) from a to b; fine at these ranges. */
export function bearing(a: Geo, b: Geo): number {
  const k = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.atan2((b.lon - a.lon) * k, b.lat - a.lat);
}

/** Point `metres` from p along bearing `brg` (local flat-earth step). */
export function travel(p: Geo, brg: number, metres: number): Geo {
  return { lon: p.lon + Math.sin(brg) * metres / (GRID.DEG * Math.cos(p.lat * Math.PI / 180)), lat: p.lat + Math.cos(brg) * metres / GRID.DEG };
}

/** The 3×3 tile block centred on the tile under the path midpoint (grid metres): every point
 *  of a ≤ 26 km track keeps ≥ 50 km of detailed ground around it. */
export function regionBlock(midX: number, midY: number): { i0: number; j0: number } {
  return { i0: Math.floor(midX / GRID.TILE) - 1, j0: Math.floor(midY / GRID.TILE) - 1 };
}

/** How a mission sits on the map. `focus` is reached `at` the given share of the mission's
 *  ground track (1 = its end: the bomb impact point, or the escort's objective). */
export interface GroundView { focus: Geo; bearing: number; at: number }

/** Longest ground track a mission flies at true scale (m): 320 s at 75 m/s, plus the bomb fall. */
export const MAX_TRACK = 26000;

interface PlaceLike extends Geo { key: string; eng?: Geo; ip?: Geo; home?: boolean; from?: Geo }
// Homeward legs: the coast the formation crosses on the way out over the sea
const HOME_COAST: Record<string, Geo> = { Netherlands: { lon: 4.63, lat: 52.62 }, Channel: { lon: 2.35, lat: 51.05 } };

/** Outbound: the target at the end of the track, approached on the real final leg (from the
 *  continental coast point or the English crossing). Homeward: the coast crossing just past
 *  mid-mission, on the leg toward the English coast. */
export function placeView(p: PlaceLike, norfolk: Geo): GroundView {
  const eng = p.eng ?? norfolk;
  if (p.home) return { focus: HOME_COAST[p.key] ?? { lon: p.lon, lat: p.lat }, bearing: bearing(p, eng), at: 0.55 };
  return { focus: { lon: p.lon, lat: p.lat }, bearing: bearing(p.ip ?? eng, p), at: 1 };
}
