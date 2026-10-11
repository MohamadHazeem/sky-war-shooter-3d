import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WEATHER_PRESETS, blendConditions, precipitationCount, spottingAlpha, windDrift, type WeatherPreset } from '../src/render/WeatherPresets';
import { applyWeather, DEFAULT_WEATHER, frontTarget, presetWeather, updateWeather, weatherRestart } from '../src/render/Weather';
import { weatherNow } from '../src/render/WeatherState';
import { Atmos, atmosUniforms } from '../src/render/Atmosphere';
import { Ballistics } from '../src/world/Ballistics';
import { BOMB_FALL, impactPattern } from '../src/game/BombingMath';
import { customWeather, MOODS, sanitizeConfig } from '../src/game/CustomBattle';
import type { Engine } from '../src/core/Engine';

const engine = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), sun: new THREE.DirectionalLight(),
  hemi: new THREE.HemisphereLight(), post: { baseExposure: 1, grade: { lift: new THREE.Vector3() } },
  add() {}, refreshLighting() {} } as unknown as Engine;
afterEach(() => { applyWeather(engine, DEFAULT_WEATHER); weatherNow.effects = true; });

describe('weather conditions and transitions', () => {
  it('offers every condition in Custom Battle without changing time of day', () => {
    for (const name of Object.keys(WEATHER_PRESETS) as WeatherPreset[]) {
      expect(MOODS).toContain(name);
      expect(sanitizeConfig({ mood: name }).mood).toBe(name);
      expect(customWeather(name, 14).sunEl).toBe(14);
      const night = presetWeather(name, { ...DEFAULT_WEATHER, mood: 'night', sunEl: 9 });
      applyWeather(engine, night);
      expect(weatherNow.night).toBe(1);
      expect(weatherNow.preset).toBe(name);
      expect(weatherNow.rain).toBe(WEATHER_PRESETS[name].rain);
      for (const v of Object.values(WEATHER_PRESETS[name])) expect(Number.isFinite(v)).toBe(true);
      expect(weatherNow.spotting).toBeGreaterThanOrEqual(.8);
      expect(weatherNow.aimError).toBeLessThanOrEqual(1.2);
      expect(weatherNow.traverse).toBeGreaterThanOrEqual(.9);
    }
  });
  it('smoothly blends rain, snow, fog, wind and penalties; clears and restarts', () => {
    const base = { ...presetWeather('heavyRain'), front: { at: 5, to: 'overcast' as const, preset: 'snow' as const, duration: 10 } };
    applyWeather(engine, base);
    updateWeather(engine, 10, new THREE.Vector3(0, 0, 1));
    expect(weatherNow.rain).toBeCloseTo(.5);
    expect(weatherNow.snow).toBeCloseTo(.5);
    expect(weatherNow.traverse).toBeCloseTo(.95);
    expect(atmosUniforms.uWeatherFog.value).toBe(weatherNow.fog);
    updateWeather(engine, 5, new THREE.Vector3(0, 0, 1));
    expect(weatherNow.preset).toBe('snow');
    weatherRestart(); updateWeather(engine, 0, new THREE.Vector3(0, 0, 1));
    expect(weatherNow.rain).toBe(1); expect(weatherNow.snow).toBe(0);
    applyWeather(engine, frontTarget(base, { at: 0, to: 'clear' }));
    expect(weatherNow.fog).toBe(0); expect(weatherNow.traverse).toBe(1);
    expect(weatherNow.lightning).toBe(0);
  });
  it('restarts the front clock even before the weather begins changing', () => {
    const base = { ...DEFAULT_WEATHER, front: { at: 20, to: 'overcast' as const, preset: 'snow' as const, duration: 10 } };
    const forward = new THREE.Vector3(0, 0, 1);
    applyWeather(engine, base); updateWeather(engine, 18, forward);
    weatherRestart(); updateWeather(engine, 5, forward);
    expect(weatherNow.snow).toBe(0);
    updateWeather(engine, 20, forward);
    expect(weatherNow.snow).toBeCloseTo(.5);
  });
  it('caps and resolves optional wind speed / direction in world axes', () => {
    applyWeather(engine, { ...presetWeather('snow'), wind: { speed: 100, direction: 90 } });
    expect(Atmos.wind.x).toBeCloseTo(12); expect(Atmos.wind.z).toBeCloseTo(0);
    applyWeather(engine, { ...DEFAULT_WEATHER, wind: { speed: NaN, direction: Infinity } });
    expect(Atmos.wind.length()).toBe(0);
  });
  it('clamps blending and scales cosmetic counts independently of gameplay', () => {
    const out = { ...WEATHER_PRESETS.clear };
    blendConditions(out, WEATHER_PRESETS.clear, WEATHER_PRESETS.snow, 2);
    expect(out).toEqual(WEATHER_PRESETS.snow);
    applyWeather(engine, presetWeather('fog')); weatherNow.effects = false;
    expect(weatherNow.spotting).toBe(.8);
    expect(precipitationCount('high', false)).toBe(0);
    expect(precipitationCount('low', true)).toBe(160);
    expect(precipitationCount('high', true)).toBe(960);
  });
});

describe('fair visibility and wind', () => {
  it('keeps nearby markers legible, hides distant ones and fades continuously', () => {
    expect(spottingAlpha(100, 2800, .8)).toBe(1);
    expect(spottingAlpha(2240, 2800, .8)).toBe(0);
    expect(spottingAlpha(2240 * .925, 2800, .8)).toBeCloseTo(.5);
    let previous = 1;
    for (let d = 0; d <= 3000; d += 10) {
      const next = spottingAlpha(d, 2800, .8);
      expect(next).toBeLessThanOrEqual(previous); previous = next;
    }
  });
  it('drifts bullets gently, symmetrically, and consistently at 30/120 Hz', () => {
    function bullet(wind: number, hz: number) {
      weatherNow.windX = wind; weatherNow.windZ = 0;
      const b = new Ballistics(4);
      b.fire(new THREE.Vector3(), new THREE.Vector3(0, 0, 800), 'axis', 1, false, [1, 1, 1], null);
      for (let i = 0; i < hz; i++) b.update(1 / hz, []);
      const x = (b as unknown as { px: Float32Array }).px[0];
      b.tracers.mesh.geometry.dispose(); (b.tracers.mesh.material as THREE.Material).dispose();
      return x;
    }
    expect(windDrift(10, .5)).toBeCloseTo(.6);
    expect(windDrift(-10, .5)).toBeCloseTo(-.6);
    expect(bullet(0, 60)).toBe(0);
    const right = bullet(12, 60);
    expect(right).toBeGreaterThan(0); expect(right).toBeLessThan(1);
    expect(bullet(-12, 60)).toBeCloseTo(-right, 5);
    expect(Math.abs(bullet(12, 30) - bullet(12, 120))).toBeLessThan(.025);
  });
  it('uses the same crosswind in bomb scoring as the fall visual', () => {
    const solution = { x: 0, z: 0, forwardX: 0, forwardZ: 1, speed: 100, windX: 0, windZ: 0, joltX: 0, joltZ: 0 };
    const calm = impactPattern(solution, 1)[0];
    const windy = impactPattern({ ...solution, windX: 10, windZ: -4 }, 1)[0];
    expect(windy.x - calm.x).toBe(10 * BOMB_FALL);
    expect(windy.z - calm.z).toBe(-4 * BOMB_FALL);
  });
});
