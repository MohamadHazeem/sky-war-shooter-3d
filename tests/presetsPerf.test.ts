import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SkyCache } from '../src/render/SkyCache';

function sky() {
  const source = new THREE.ShaderMaterial({ vertexShader: 'void main(){}', fragmentShader: 'void main(){}',
    uniforms: { uGroundXZ: { value: new THREE.Vector2() } }, side: THREE.BackSide });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 4), source);
  return { source, dome, cache: new SkyCache(dome) };
}

describe('separate distant-background resolution', () => {
  it('keeps Low on the direct shader and shares live terrain uniforms on the cached path', () => {
    const { source, dome, cache } = sky();
    let draws = 0, target: THREE.WebGLRenderTarget | null = null, size: number[] = [];
    const renderer = { shadowMap: { autoUpdate: true }, autoClear: false, getRenderTarget: () => target,
      setRenderTarget: (rt: THREE.WebGLRenderTarget | null) => { target = rt; },
      render: () => { draws++; size = [target!.width, target!.height]; },
    } as unknown as THREE.WebGLRenderer;
    const camera = new THREE.PerspectiveCamera();
    cache.renderBackground(renderer, camera);
    expect(draws).toBe(0); expect(dome.material).toBe(source);
    cache.scale = .5; cache.setSize(1919, 1079); cache.renderBackground(renderer, camera);
    expect(size).toEqual([960, 540]); expect(draws).toBe(1);
    expect(dome.material.uniforms.uGroundXZ).toBe(source.uniforms.uGroundXZ);
    expect(dome.material.uniforms.uScreen.value.toArray()).toEqual([1919, 1079]);
    expect(target).toBeNull(); expect(renderer.shadowMap.autoUpdate).toBe(true); expect(renderer.autoClear).toBe(false);
    cache.scale = 1; cache.renderBackground(renderer, camera);
    expect(dome.material).toBe(source); expect(draws).toBe(1);
  });
  it('restores the caller render state when background submission fails', () => {
    const { cache } = sky(); cache.scale = .5;
    const original = new THREE.WebGLRenderTarget(8, 8); let target = original;
    const renderer = { shadowMap: { autoUpdate: true }, autoClear: false, getRenderTarget: () => target,
      setRenderTarget: (rt: THREE.WebGLRenderTarget) => { target = rt; }, render: () => { throw Error('lost context'); },
    } as unknown as THREE.WebGLRenderer;
    expect(() => cache.renderBackground(renderer, new THREE.Camera())).toThrow('lost context');
    expect(target).toBe(original); expect(renderer.shadowMap.autoUpdate).toBe(true); expect(renderer.autoClear).toBe(false);
  });
});


import { Engine, QUALITY } from '../src/core/Engine';
import { deviceTiers } from '../src/render/QualityPick';
import { FilmLook } from '../src/render/FilmLook';
import { presetFilmLook } from '../src/render/FilmParams';

describe('preset defaults and recovery', () => {
  it('starts weak devices on the cheap path while unknown hardware still gets measured', () => {
    const desktop = { touch: false, shortSide: 1080, reducedData: false };
    expect(deviceTiers({ ...desktop, cores: 4 })).toEqual({ start: 'low', cap: 'medium' });
    expect(deviceTiers({ ...desktop, cores: 16, memoryGB: 4 })).toEqual({ start: 'low', cap: 'medium' });
    expect(deviceTiers({ ...desktop, cores: 0, memoryGB: 0 })).toEqual({ start: 'high', cap: 'ultra' });
  });
  it('defaults Cinematic to film and preserves explicit Off/period stocks through tier changes', () => {
    expect(presetFilmLook('cinematic')).toBe('film');
    expect(presetFilmLook('high')).toBe('off');
    const film = new FilmLook(true);
    film.setPreset('cinematic'); expect(film.lookName).toBe('film');
    film.setPreset('high'); expect(film.lookName).toBe('off');
    film.setLook('off'); film.setPreset('cinematic'); expect(film.lookName).toBe('off');
    film.setLook('kodachrome'); film.setPreset('low'); expect(film.lookName).toBe('kodachrome');
    expect(film.resolve(true).objectBlur).toBe(0);
  });
  it('clears stale DRS ceilings after an automatic pick without losing its measured scale', () => {
    const engine = Object.assign(Object.create(Engine.prototype), { renderScale: .55, refreshHz: 120,
      drsHold: 8, drsCeil: .6, drsCeilT: 30, drsUp: 3, hiGiveUp: true, hiMiss: 2 });
    engine.resetDynamicResolution(.8);
    expect(engine.renderScale).toBe(.8); expect(engine.drsCeil).toBe(1); expect(engine.drsCeilT).toBe(0);
    expect(engine.drsHold).toBe(0); expect(engine.hiGiveUp).toBe(false); expect(engine.targetMs).toBeCloseTo(1000/120);
  });
  it('retains the Low renderer and full-resolution foreground on High+', () => {
    expect(QUALITY.low.skyScale).toBe(1); expect(QUALITY.low.temporal).toBe(false);
    expect(QUALITY.low.cloudTemporal).toBe(false); expect(QUALITY.low.haze).toBe(false);
    expect(QUALITY.high.pixels).toBeGreaterThanOrEqual(1920*1080);
    expect(QUALITY.medium.skyScale).toBe(.5); expect(QUALITY.high.skyScale).toBe(.5);
    expect(QUALITY.cinematic.aoSlices).toBeGreaterThan(QUALITY.high.aoSlices);
  });
});

it('warms film velocity against HDR and restores scene/target after compile failure', () => {
  const film = new FilmLook(true), scene = new THREE.Scene();
  const original = new THREE.WebGLRenderTarget(8, 8);
  let target = original, disposed = false;
  const renderer = { getRenderTarget: () => target,
    setRenderTarget: (rt: THREE.WebGLRenderTarget) => { target = rt; }, render: () => {},
    compile: () => {
      expect(target).not.toBe(original); expect(target.texture.type).toBe(THREE.HalfFloatType);
      expect(scene.children).toHaveLength(1);
      target.addEventListener('dispose', () => { disposed = true; });
      throw Error('context lost');
    },
  } as unknown as THREE.WebGLRenderer;
  expect(() => film.prewarm(renderer, scene, new THREE.Camera())).toThrow('context lost');
  expect(target).toBe(original); expect(scene.children).toHaveLength(0); expect(disposed).toBe(true);
});
