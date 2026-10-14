import { describe, it, expect } from 'vitest';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { FLIP_KINDS, FlipbookFX } from '../src/render/Flipbooks';
import { SmokeRibbons } from '../src/render/SmokeRibbons';
import { Sparks } from '../src/render/Sparks';

const ROOT = resolve(import.meta.dirname, '..');

describe('Effects 2.0 flipbook atlases', () => {
  it('lists the effects in the order the bake script packs them', () => {
    const py = readFileSync(resolve(ROOT, 'tools/fx/bake_flipbooks.py'), 'utf8');
    const block = py.slice(py.indexOf('EFFECTS = {'), py.indexOf('\n}\n', py.indexOf('EFFECTS = {')));
    const names = [...block.matchAll(/^ {4}'([a-z]+)': dict\(/gm)].map((m) => m[1]);
    expect(names).toEqual(FLIP_KINDS);
  });

  it('ships both packed atlases, within the download budget', () => {
    let total = 0;
    for (const f of ['fx_a.webp', 'fx_b.webp']) {
      const p = resolve(ROOT, 'public/fx', f);
      expect(existsSync(p)).toBe(true);
      total += statSync(p).size;
    }
    expect(total).toBeLessThan(12 * 1024 * 1024);
  });
});

describe('FlipbookFX pool', () => {
  it('spawns, ages out and never exceeds its pool', () => {
    const fx = new FlipbookFX(8);
    const pos = new THREE.Vector3(0, 100, 0);
    for (let i = 0; i < 12; i++) fx.spawn({ kind: i % 2 ? 'smoke' : 'flak', pos, life: 1 + i * 0.1, size0: 10, size1: 20, albedo: [0.05, 0.05, 0.05] });
    expect(fx.count).toBe(8);
    fx.update(0.5);
    expect(fx.count).toBe(8);
    fx.update(2);
    expect(fx.count).toBe(0);
  });

  it('turns its up axis along a direction seen from the camera', () => {
    const fx = new FlipbookFX(4);
    // camera at the identity orientation: screen right = +X, up = +Y
    expect(fx.angleOf(new THREE.Vector3(0, 1, 0))).toBeCloseTo(0, 6);
    expect(fx.angleOf(new THREE.Vector3(-1, 0, 0))).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('SmokeRibbons', () => {
  it('continues one ribbon along an emitter path and starts another for a second emitter', () => {
    const r = new SmokeRibbons(6);
    const vel = new THREE.Vector3(0, 0, 75);
    const a = new THREE.Vector3(0, 7000, 0), b = new THREE.Vector3(300, 7000, 0);
    for (let i = 0; i < 40; i++) {
      r.feed(a, vel, 1, 0.1, 0.8);
      r.feed(b, vel, 1, 0.8, 0.5);
      r.update(0.05);
      a.addScaledVector(vel, 0.05);
      b.addScaledVector(vel, 0.05);
    }
    expect(r.active).toBe(2);
    // nothing fed for longer than a trail lives: both retire
    for (let i = 0; i < 220; i++) r.update(0.05);
    expect(r.active).toBe(0);
  });
});

describe('Sparks', () => {
  it('fall, cool and expire', () => {
    const s = new Sparks(4);
    for (let i = 0; i < 6; i++) s.spawn(new THREE.Vector3(), new THREE.Vector3(30, 0, 0), 0.3, 0.1, [30, 18, 6], [8, 2, 0.5]);
    expect(s.count).toBe(4);
    s.update(0.2);
    expect(s.count).toBe(4);
    s.update(0.2);
    expect(s.count).toBe(0);
  });
});
