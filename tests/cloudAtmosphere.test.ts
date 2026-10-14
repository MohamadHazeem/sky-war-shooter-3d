import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { opticalDepth, createAtmosphereLut, LUT_H, LUT_W } from '../src/render/AtmosphereLut';
import { Atmos } from '../src/render/Atmosphere';
import { applyWeather, DEFAULT_WEATHER, updateWeather } from '../src/render/Weather';
import { weatherNow } from '../src/render/WeatherState';
import { rainTarget } from '../src/game/GlassFx';
import type { Engine } from '../src/core/Engine';

const engine = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), sun: new THREE.DirectionalLight(),
  hemi: new THREE.HemisphereLight(), post: { baseExposure: 1, grade: { lift: new THREE.Vector3() } },
  add() {}, refreshLighting() {} } as unknown as Engine;
afterEach(() => { applyWeather(engine, DEFAULT_WEATHER); weatherNow.cloudInside = 0; weatherNow.effects = true; });

describe('spherical atmospheric optical depth', () => {
  it('matches the analytic vertical exponential column', () => {
    expect(opticalDepth(0, 1, 'rayleigh', 1024)).toBeCloseTo(8, 3);
    expect(opticalDepth(8, 1, 'rayleigh', 1024)).toBeCloseTo(8 / Math.E, 3);
    expect(opticalDepth(0, 1, 'mie', 1024)).toBeCloseTo(1.2, 3);
  });
  it('has a finite curved horizon, longer paths at grazing angles, and less air at altitude', () => {
    for (const kind of ['rayleigh', 'mie'] as const) {
      expect(opticalDepth(0, 0, kind)).toBeGreaterThan(opticalDepth(0, .2, kind));
      expect(opticalDepth(0, .2, kind)).toBeGreaterThan(opticalDepth(0, 1, kind));
      expect(opticalDepth(12, 1, kind)).toBeLessThan(opticalDepth(6, 1, kind));
      expect(opticalDepth(0, -1, kind)).toBe(0);
      expect(opticalDepth(7.6, -1, kind)).toBeGreaterThan(0);
    }
  });
  it('bakes a finite, nonnegative, bounded texture without an external asset', () => {
    const tex = createAtmosphereLut();
    expect(tex.image.width).toBe(LUT_W); expect(tex.image.height).toBe(LUT_H);
    for (const n of tex.image.data!) { expect(Number.isFinite(n)).toBe(true); expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThan(1000); }
    tex.dispose();
  });
});

describe('cloud weather coupling', () => {
  it('selects flat overcast and convective storm, interpolating fronts without a type pop', () => {
    applyWeather(engine, { ...DEFAULT_WEATHER, front: { at: 0, to: 'overcast', duration: 10 } });
    expect(Atmos.stratus).toBe(0);
    updateWeather(engine, 5, new THREE.Vector3(0, 0, 1));
    expect(Atmos.stratus).toBeCloseTo(.45);
    updateWeather(engine, 5, new THREE.Vector3(0, 0, 1));
    expect(Atmos.stratus).toBeCloseTo(.9);
    applyWeather(engine, { ...DEFAULT_WEATHER, preset: 'thunderstorm' });
    expect(Atmos.towers).toBe(1);
  });
  it('adds cloud condensation without altering rain gameplay, respecting the visual switch', () => {
    weatherNow.rain = 0; weatherNow.cloudInside = .8;
    expect(rainTarget(0)).toBeCloseTo(.52);
    expect(weatherNow.rain).toBe(0);
    weatherNow.rain = .9;
    expect(rainTarget(0)).toBe(.9);
    weatherNow.effects = false;
    expect(rainTarget(0)).toBe(0);
  });
});
