import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAMPAIGN } from '../src/game/Missions';
import { CHART } from '../src/world/EuropeChart';
import { coastPixels, COAST_WIDTH, COAST_HEIGHT, CROSS_SPAN, ROUTE_PAD, onEuropeanLand, routePoint, terrainPixels, terrainRoute, terrainSeason } from '../src/world/FarTerrainData';
import { farTerrainUniforms as u, setFarTerrain } from '../src/render/FarTerrain';
import { Atmos } from '../src/render/Atmosphere';
import { smokeHeight } from '../src/render/TargetSmoke';
import type { World } from '../src/world/World';

describe('Europe beneath the formation', () => {
  it('selects summer, harvest and snow without parsing a locale-dependent Date', () => {
    expect(terrainSeason('6 June 1944')).toBe('summer');
    expect(terrainSeason('14 October 1943')).toBe('autumn');
    for (const month of ['December', 'January', 'February']) expect(terrainSeason(`1 ${month} 1944`)).toBe('winter');
    expect(terrainSeason('Somewhere over the Reich')).toBe('summer');
  });
  it('uses the briefing coast polygons and islands', () => {
    expect(onEuropeanLand(CHART.BASE.lon, CHART.BASE.lat)).toBe(true);
    expect(onEuropeanLand(13.4, 52.52)).toBe(true);
    expect(onEuropeanLand(3, 54)).toBe(false);
    expect(onEuropeanLand(5.35, 53.4)).toBe(true);
  });
  it('maps every campaign mission; unknown operations have a safe fallback', () => {
    for (const m of CAMPAIGN) expect(terrainRoute(m)?.length).toBeGreaterThan(2);
    expect(terrainRoute({ target: 'Endless waves' })).toBeNull();
  });
  it('follows outbound and homeward legs in chart order', () => {
    const out = terrainRoute({ target: 'Berlin' })!;
    expect(routePoint(out, 0)).toEqual(CHART.BASE);
    expect(routePoint(out, 1).lon).toBeCloseTo(13.4);
    expect(routePoint(out, 3)).toEqual(routePoint(out, 1)); // no artificial ocean beyond the chart
    expect(routePoint(out, -1)).toEqual(CHART.BASE);
    const home = terrainRoute({ target: 'Return leg — over the Channel' })!;
    expect(routePoint(home, 0)).toEqual(CHART.FRANKFURT);
    expect(routePoint(home, 1).lon).toBeCloseTo(CHART.BASE.lon);
    expect(routePoint(home, 0.5, 20000)).not.toEqual(routePoint(home, 0.5));
  });
  it('bakes a sea crossing between English and continental land at scheduled route progress', () => {
    const route = terrainRoute({ target: 'Berlin' })!, length = 30000;
    const pixels = coastPixels(route, length);
    const at = (progress: number) => {
      const y = Math.floor((length * progress + ROUTE_PAD) / (length + ROUTE_PAD * 2) * COAST_HEIGHT);
      return pixels[y * COAST_WIDTH + COAST_WIDTH / 2];
    };
    expect(pixels.length).toBe(COAST_WIDTH * COAST_HEIGHT);
    expect(at(0)).toBe(255);
    expect(at(0.3)).toBe(0);
    expect(at(1)).toBe(255);
    expect(CROSS_SPAN).toBeGreaterThan(50000);
  });
  it('generates deterministic land cover with fields, forests, water and settlements', () => {
    const a = terrainPixels(128), b = terrainPixels(128);
    expect(a).toEqual(b);
    for (let channel = 0; channel < 4; channel++) {
      const values = a.filter((_, i) => i % 4 === channel);
      expect(Math.max(...values)).toBeGreaterThan(100);
      expect(Math.min(...values)).toBeLessThan(80);
    }
  });
  it('anchors terrain to absolute coordinates across origin shifts and clears mission state', () => {
    const world = { formationCenter: new THREE.Vector3(100, 7600, 400), formationForward: new THREE.Vector3(0, 0, 1), time: 2 } as World;
    const m = CAMPAIGN.find(m => m.id === 'm3')!;
    Atmos.originOffset.set(0, 0, 20000);
    setFarTerrain(m, world, 100, 23.25);
    const anchor = u.uFarRoute.value.clone();
    expect(u.uFarLength.value).toBe((m.bombsAway! + 23.25) * 100);
    expect(u.uFarSeason.value).toBe(2);
    Atmos.originOffset.z += 10000; world.formationCenter.z -= 10000;
    setFarTerrain(m, world, 100, 23.25);
    expect(u.uFarRoute.value).toEqual(anchor);
    setFarTerrain(null, world, 100, 23.25);
    expect(u.uFarMapped.value).toBe(0);
    expect(u.uFarSeason.value).toBe(0);
    Atmos.originOffset.set(0, 0, 0);
  });
  it('grows smoke from the impact to above the cloud deck', () => {
    expect(smokeHeight(-10)).toBe(80);
    expect(smokeHeight(30)).toBeLessThan(Atmos.lowBase);
    expect(smokeHeight(90)).toBeGreaterThan(Atmos.lowTop);
    expect(smokeHeight(600)).toBeLessThan(7600);
  });
});
