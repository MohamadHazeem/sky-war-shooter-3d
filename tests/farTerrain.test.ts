import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { CAMPAIGN } from '../src/game/Missions';
import { CHART } from '../src/world/EuropeChart';
import { coastMetres, terrainRegion, terrainRoute, terrainSeason, terrainView, trackLength, unpackOverview, unpackTile } from '../src/world/FarTerrainData';
import { GRID, MAX_TRACK, toGrid } from '../src/world/TerrainGrid';
import { TERRAIN_OVERVIEW, TERRAIN_PLACES, TERRAIN_TILES } from '../src/world/TerrainIndex';
import { farTerrainUniforms as u, setFarTerrain, targetRiverAxis } from '../src/render/FarTerrain';
import { Atmos } from '../src/render/Atmosphere';
import { smokeHeight } from '../src/render/TargetSmoke';
import type { World } from '../src/world/World';

const tile = (id: string) => unpackTile(new Uint8Array(gunzipSync(readFileSync(`public/terrain/t${id}.bin`))));
/** Lines-image byte (channel k) at a geographic point, nearest texel. */
function linesAt(lon: number, lat: number, k = 0) {
  const [x, y] = toGrid(lon, lat);
  const i = Math.floor(x / GRID.TILE), j = Math.floor(y / GRID.TILE);
  const [lines] = tile(`${i}_${j}`);
  const c = Math.floor((x - i * GRID.TILE) / GRID.TILE * GRID.LINES), r = Math.floor((y - j * GRID.TILE) / GRID.TILE * GRID.LINES);
  return lines.data[(r * GRID.LINES + c) * 4 + k];
}

describe('Europe beneath the formation', () => {
  it('selects spring, summer, harvest and snow without parsing a locale-dependent Date', () => {
    expect(terrainSeason('6 June 1944')).toBe('summer');
    expect(terrainSeason('11 April 1944')).toBe('spring');
    expect(terrainSeason('14 October 1943')).toBe('autumn');
    for (const month of ['December', 'January', 'February']) expect(terrainSeason(`1 ${month} 1944`)).toBe('winter');
    expect(terrainSeason('Somewhere over the Reich')).toBe('summer');
  });
  it('maps every campaign mission onto real ground; unknown operations have none', () => {
    for (const m of CAMPAIGN) {
      expect(terrainRoute(m)?.length).toBeGreaterThan(2);
      const v = terrainView(m)!;
      expect(v).toBeTruthy();
      // the whole 3×3 block of the mission is in the shipped tiles
      const region = terrainRegion(v, trackLength(m, 75, 23.25));
      expect(region.tiles.length).toBe(9);
      for (const t of region.tiles) expect(t.present, `${m.id} ${t.id}`).toBe(true);
    }
    expect(terrainView({ target: 'Endless waves' })).toBeNull();
    expect(terrainRoute({ target: 'Endless waves' })).toBeNull();
  });
  it('ships every tile a chart place can need, within the download budget', () => {
    for (const p of CHART.PLACES) for (const L of [4000, 12000, MAX_TRACK]) {
      for (const t of terrainRegion(TERRAIN_PLACES[p.key], L).tiles) expect(t.present, `${p.key} ${t.id}`).toBe(true);
    }
    const bytes = readdirSync('public/terrain').filter((f) => f.endsWith('.bin')).reduce((a, f) => a + statSync(`public/terrain/${f}`).size, 0);
    expect(bytes).toBeLessThan(20 * 1024 * 1024);
    expect(TERRAIN_TILES.length).toBeGreaterThan(50);
  });
  it('decodes tiles: real coast, sea and land where they belong', () => {
    const [lines, cover, relief] = tile(TERRAIN_TILES[0]);
    expect([lines.size, cover.size, relief.size]).toEqual([GRID.LINES, GRID.COVER, GRID.RELIEF]);
    expect(lines.data.length).toBe(GRID.LINES ** 2 * 4);
    expect(coastMetres(linesAt(7.0, 54.2))).toBeLessThan(-1000);        // North Sea off the Frisian islands
    expect(coastMetres(linesAt(8.0, 52.9))).toBeGreaterThan(1000);      // Oldenburg moorland
    expect(coastMetres(linesAt(10.4, 50.0))).toBeGreaterThan(1000);     // Franconia
    expect(coastMetres(linesAt(5.5, 52.45))).toBeLessThan(0);           // 1943: Flevoland still under water
    expect(coastMetres(linesAt(4.9, 52.37))).toBeGreaterThan(-100);     // Amsterdam
    const ov = unpackOverview(new Uint8Array(gunzipSync(readFileSync('public/terrain/overview.bin'))));
    expect([ov.w, ov.h]).toEqual([TERRAIN_OVERVIEW.w, TERRAIN_OVERVIEW.h]);
  });
  it('round-trips the row-delta tile format', () => {
    const size = 4, ch = 4, src = Uint8Array.from({ length: size * size * ch }, (_, i) => (i * 37 + 11) & 255);
    const planes: number[] = [];
    for (let k = 0; k < ch; k++) for (let r = 0; r < size; r++) { let prev = 0; for (let c = 0; c < size; c++) { const v = src[(r * size + c) * ch + k]; planes.push((v - prev) & 255); prev = v; } }
    const buf = Uint8Array.from([0x53, 0x57, 0x54, 0x31, size, 0, ch, ...planes]);
    expect(unpackTile(buf)[0].data).toEqual(src);
    expect(() => unpackTile(Uint8Array.from([1, 2, 3, 4]))).toThrow();
  });
  it('aligns the mission on the real map: aim point on the target, heading on the real bearing', () => {
    const world = { formationCenter: new THREE.Vector3(100, 7600, 400), formationForward: new THREE.Vector3(0.6, 0, 0.8), time: 2 } as World;
    const m = CAMPAIGN.find((m) => m.id === 'm2')!;   // Bremen
    Atmos.originOffset.set(0, 0, 20000);
    setFarTerrain(m, world, 75, 23.25);
    const focus = u.uFarFocus.value.clone(), view = TERRAIN_PLACES.Bremen;
    const L = trackLength(m, 75, 23.25);
    expect(focus.x).toBeCloseTo(100 + 0.6 * (L - 75 * 2), 3);
    expect(focus.y).toBeCloseTo(20400 + 0.8 * (L - 75 * 2), 3);
    // the heading maps onto the real final leg's bearing (true east, north)
    const e = u.uFarG.value.elements, east = e[0] * 0.6 + e[2] * 0.8, north = e[1] * 0.6 + e[3] * 0.8;
    expect(east).toBeCloseTo(Math.sin(view.bearing), 5);
    expect(north).toBeCloseTo(Math.cos(view.bearing), 5);
    // the focus sits at its own region uv, inside the block
    expect(u.uFarUV0.value.x).toBeGreaterThan(0.2); expect(u.uFarUV0.value.x).toBeLessThan(0.8);
    expect(targetRiverAxis()?.length()).toBeCloseTo(1, 5);   // the Weser
    // floating-origin shifts leave the ground where it was
    Atmos.originOffset.z += 10000; world.formationCenter.z -= 10000;
    setFarTerrain(m, world, 75, 23.25);
    expect(u.uFarFocus.value.distanceTo(focus)).toBeLessThan(1e-6);
    expect(u.uFarSeason.value).toBe(1);
    setFarTerrain(null, world, 75, 23.25);
    expect(u.uFarMapped.value).toBe(0);
    expect(targetRiverAxis()).toBeNull();
    Atmos.originOffset.set(0, 0, 0);
  });
  it('grows smoke from the impact to above the cloud deck', () => {
    expect(smokeHeight(-10)).toBe(80);
    expect(smokeHeight(30)).toBeLessThan(Atmos.lowBase);
    expect(smokeHeight(90)).toBeGreaterThan(Atmos.lowTop);
    expect(smokeHeight(600)).toBeLessThan(7600);
  });
});
