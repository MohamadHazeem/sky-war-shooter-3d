import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyWeather, DEFAULT_WEATHER } from '../src/render/Weather';
import { Atmos, atmosUniforms, skyGLSL } from '../src/render/Atmosphere';
import { NIGHT_SKY_GLSL } from '../src/render/NightSky';
import { lightConed, Searchlights } from '../src/render/Searchlights';
import { Ballistics } from '../src/world/Ballistics';
import { installSunRim } from '../src/render/SunRim';
import type { Engine } from '../src/core/Engine';

// Phase 11 goal 06: night and sunset polish (docs/phase11/06-night-sunset.md)
const engine = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), sun: new THREE.DirectionalLight(),
  hemi: new THREE.HemisphereLight(), post: { baseExposure: 1, grade: { lift: new THREE.Vector3() } },
  add() {}, refreshLighting() {} } as unknown as Engine;
afterEach(() => applyWeather(engine, DEFAULT_WEATHER));

describe('twilight and night sky state', () => {
  it('splits the horizon only for a low sun, and never at night', () => {
    applyWeather(engine, DEFAULT_WEATHER);
    expect(Atmos.twilight).toBe(0);
    expect(atmosUniforms.uNightSky.value).toBe(0);
    applyWeather(engine, { sunEl: 5, sunAz: 250, low: .5, high: .3, mood: 'dusk' });
    expect(Atmos.twilight).toBeGreaterThan(.9);
    expect(atmosUniforms.uTwilight.value).toBe(Atmos.twilight);
    applyWeather(engine, { sunEl: 5, sunAz: 250, low: .9, high: .95, mood: 'overcast' });
    expect(Atmos.twilight).toBeLessThan(.35);   // a grey deck hides the earth shadow
    applyWeather(engine, { sunEl: 26, sunAz: 140, low: .1, high: .1, mood: 'night' });
    expect(Atmos.twilight).toBe(0);
    expect(Atmos.night).toBe(1);
    expect(atmosUniforms.uNightSky.value).toBe(1);
  });
  it('declares the sky pieces the sky dome calls', () => {
    for (const fn of ['vec3 nightStars(', 'vec3 nightFires(', 'float moonFace(']) expect(NIGHT_SKY_GLSL).toContain(fn);
    expect(skyGLSL).toContain('uniform float uTwilight;');
    expect(skyGLSL).toContain('twilightHorizon(');
  });
  it('patches the lights chunk once for the low-sun rim', () => {
    installSunRim(); const once = THREE.ShaderChunk.lights_fragment_end;
    installSunRim();
    expect(THREE.ShaderChunk.lights_fragment_end).toBe(once);
    expect(once).toContain('directionalLights[ 0 ]');
  });
});

describe('searchlights', () => {
  it('cones a raider at once with the beam pointing nearest to him', () => {
    const lights = new Searchlights(new THREE.Scene());
    lights.setup([new THREE.Vector3(-800, 0, 0), new THREE.Vector3(800, 0, 0)], new THREE.Vector3(0, 0, -1));
    const raider = { pos: new THREE.Vector3(0, 5000, -1500), alive: true };
    lights.lock(raider);
    expect(lights.locks()).toBe(1);
    for (let i = 0; i < 60; i++) lights.update(.1, [raider]);
    expect(lights.coned.has(raider)).toBe(true);
    lights.clear();
  });
});

describe('night lights', () => {
  it('lights a coned raider once, from below on the beam axis', () => {
    const lights = new Searchlights(new THREE.Scene());
    lights.setup([new THREE.Vector3(-800, 0, 0), new THREE.Vector3(800, 0, 0)], new THREE.Vector3(0, 0, -1));
    const raider = { pos: new THREE.Vector3(0, 5000, -1500), alive: true };
    lights.lock(raider);
    for (let i = 0; i < 60; i++) lights.update(.1, [raider]);
    const calls: THREE.Vector3[] = [];
    lightConed(lights, { flashLight: (p) => { calls.push(p.clone()); } });
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].y).toBeLessThan(raider.pos.y);
    expect(calls[0].distanceTo(raider.pos)).toBeLessThan(20);
    lights.clear();
  });
  it('finds the burning tracer nearest the eye', () => {
    const b = new Ballistics(16);
    const eye = new THREE.Vector3();
    const out = new THREE.Vector3();
    expect(b.nearestTracer(eye, 40, out)).toBe(false);
    b.fire(new THREE.Vector3(30, 0, 0), new THREE.Vector3(0, 0, 800), 'axis', 1, true, [1, .5, .2], null, true);
    b.fire(new THREE.Vector3(10, 0, 0), new THREE.Vector3(0, 0, 800), 'axis', 1, true, [1, .5, .2], null, true);
    b.fire(new THREE.Vector3(2, 0, 0), new THREE.Vector3(0, 0, 800), 'axis', 1, false, [1, .5, .2], null, true);
    expect(b.nearestTracer(eye, 40, out)).toBe(true);
    expect(out.x).toBe(10);
  });
});
