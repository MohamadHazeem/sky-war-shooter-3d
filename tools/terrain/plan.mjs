// Which 64 km tiles the game needs: the 4×4 block around every possible mission track of every
import { pathToFileURL } from 'node:url';
// chart place (src/world/TerrainGrid.ts placeView), for track lengths up to MAX_TRACK.
import { CHART } from '../../src/world/EuropeChart.ts';
import { GRID, MAX_TRACK, fromGrid, placeView, regionBlock, toGrid, travel } from '../../src/world/TerrainGrid.ts';

export function planTiles() {
  const tiles = new Map();   // "i_j" -> { i, j }
  const views = {};
  for (const p of CHART.PLACES) {
    const v = placeView(p, CHART.NORFOLK);
    views[p.key] = v;
    for (let L = 4000; L <= MAX_TRACK; L += 1000) {
      // the track runs from focus - at*L to focus + (1-at)*L along the bearing
      const mid = travel(v.focus, v.bearing, (0.5 - v.at) * L);
      const [mx, my] = toGrid(mid.lon, mid.lat);
      const { i0, j0 } = regionBlock(mx, my);
      for (let j = j0; j < j0 + GRID.BLOCK; j++) for (let i = i0; i < i0 + GRID.BLOCK; i++) tiles.set(`${i}_${j}`, { i, j });
    }
  }
  return { tiles: [...tiles.values()].sort((a, b) => a.j - b.j || a.i - b.i), views };
}

/** Geographic bounds of a tile (degrees), with a margin in metres. */
export function tileBounds(i, j, margin = 0) {
  const a = fromGrid(i * GRID.TILE - margin, j * GRID.TILE - margin);
  const b = fromGrid((i + 1) * GRID.TILE + margin, (j + 1) * GRID.TILE + margin);
  return { west: a.lon, south: a.lat, east: b.lon, north: b.lat };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { tiles } = planTiles();
  const b = tiles.reduce((acc, t) => { const q = tileBounds(t.i, t.j); return { w: Math.min(acc.w, q.west), s: Math.min(acc.s, q.south), e: Math.max(acc.e, q.east), n: Math.max(acc.n, q.north) }; }, { w: 999, s: 999, e: -999, n: -999 });
  console.log(tiles.length, 'tiles', JSON.stringify(b));
  const is = tiles.map((t) => t.i), js = tiles.map((t) => t.j);
  for (let j = Math.max(...js); j >= Math.min(...js); j--) {
    let row = '';
    for (let i = Math.min(...is); i <= Math.max(...is); i++) row += tiles.some((t) => t.i === i && t.j === j) ? '#' : '.';
    console.log(String(j).padStart(3), row);
  }
}
