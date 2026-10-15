import { describe, it, expect, vi } from 'vitest';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import sharp from 'sharp';
import { FLIP_KINDS, FlipbookFX, loadFlipbooks, registerFlipMaterial } from '../src/render/Flipbooks';
import { SmokeRibbons } from '../src/render/SmokeRibbons';
import { Sparks } from '../src/render/Sparks';
import { VolumeFX } from '../src/render/Explosions';

const ROOT = resolve(import.meta.dirname, '..');

describe('Effects 2.0 flipbook atlases', () => {
  it('binds atlases when a distant-effect material registers after loading completed', async () => {
    vi.stubGlobal('fetch', async () => new Response(new Blob(['fixture'])));
    vi.stubGlobal('createImageBitmap', async () => ({ width: 4, height: 4 }));
    try {
      expect(await loadFlipbooks()).toBe(true);
      const material = new THREE.ShaderMaterial({ uniforms: { tA: { value: null }, uFlipOn: { value: 0 } } });
      registerFlipMaterial(material);
      expect(material.uniforms.uFlipOn.value).toBe(1);
      expect(material.uniforms.tA.value.image.width).toBe(4);
      expect(material.uniforms.tB.value.image.width).toBe(4);
    } finally { vi.unstubAllGlobals(); }
  });

  it('lists the effects in the order the bake script packs them', () => {
    const py = readFileSync(resolve(ROOT, 'tools/fx/bake_flipbooks.py'), 'utf8');
    const block = py.slice(py.indexOf('EFFECTS = {'), py.indexOf('\n}\n', py.indexOf('EFFECTS = {')));
    const names = [...block.matchAll(/^ {4}'([a-z]+)': dict\(/gm)].map((m) => m[1]);
    expect(names).toEqual(FLIP_KINDS);
  });

  it('ships 256 px close frames and compact diffuse frames in matched atlases', async () => {
    const layout = JSON.parse(readFileSync(resolve(ROOT, 'public/fx/manifest.json'), 'utf8'));
    expect(layout.frameSizes).toEqual({ explosion: 256, fireball: 128, flak: 256, fire: 128, smoke: 128, wisp: 128 });
    for (const name of ['fx_a.webp', 'fx_b.webp']) {
      const meta = await sharp(resolve(ROOT, 'public/fx', name)).metadata();
      expect([meta.width, meta.height]).toEqual([4096, 3072]);
      expect(meta.hasAlpha).toBe(true);
    }
  });

  it('retains nonempty wispy opacity and directional self-shadow detail in every effect', async () => {
    for (let kind = 0; kind < FLIP_KINDS.length; kind++) {
      // Frame 16: all six simulations have emitted, including the short engine flame.
      const size = kind === 0 || kind === 2 ? 256 : 128;
      const frame = sharp(resolve(ROOT, 'public/fx/fx_a.webp')).extract({
        left: kind === 0 || kind === 2 ? kind * 1024 : (kind < 2 ? 0 : kind - 2) * 1024,
        top: (kind === 0 || kind === 2 ? 0 : 2048) + size * 2, width: size, height: size,
      });
      const pixels = await frame.raw().toBuffer();
      const stats = await sharp(pixels, { raw: { width: size, height: size, channels: 4 } }).stats();
      expect(stats.channels[3].mean).toBeGreaterThan(1);
      expect(stats.channels[3].mean).toBeLessThan(254);
      expect(stats.channels[3].max).toBeGreaterThan(32);
      let low = 255, high = 0, directional = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > stats.channels[3].max * 0.6) {
        low = Math.min(low, pixels[i]); high = Math.max(high, pixels[i]);
        directional = Math.max(directional, Math.abs(pixels[i] - pixels[i + 1]));
      }
      // Inspect the densest gas (including translucent flame/vapour), excluding the
      // transparent black border: a flat billboard
      // cannot pass simply by having contrast between the image and its empty margin.
      expect(high - low, FLIP_KINDS[kind]).toBeGreaterThan(20);
      expect(directional, FLIP_KINDS[kind]).toBeGreaterThan(12);
    }
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
  it('does not upload full backing buffers for empty or expired effect pools', () => {
    const flip = new FlipbookFX(4), ribbon = new SmokeRibbons(2), sparks = new Sparks(4), volume = new VolumeFX(4);
    for (const [effect, mesh] of [[flip, flip.mesh], [ribbon, ribbon.mesh], [sparks, sparks.tr.mesh], [volume, volume.mesh]] as const) {
      const versions = () => Object.values(mesh.geometry.attributes).map(a => (a as THREE.BufferAttribute).version);
      const before = versions();
      effect.update(0.1);
      expect(versions()).toEqual(before);
    }
    const pos = new THREE.Vector3();
    flip.spawn({ kind: 'smoke', pos, life: 0.01, size0: 1, size1: 2, albedo: [0.1, 0.1, 0.1] });
    const a = flip.mesh.geometry.getAttribute('iA') as THREE.BufferAttribute;
    flip.update(0.02);
    expect(a.version).toBe(0);
    flip.spawn({ kind: 'smoke', pos, life: 1, size0: 1, size1: 2, albedo: [0.1, 0.1, 0.1] });
    flip.update(0.1);
    expect(a.version).toBe(1);
    expect(a.updateRanges).toEqual([{ start: 0, count: 4 }]);
  });

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

  it('keeps delayed fire dark, fades emission with opacity, and survives pool compaction/rebase', () => {
    const fx = new FlipbookFX(4);
    const pos = new THREE.Vector3(100, 50, 20);
    fx.spawn({ kind: 'smoke', pos, life: 0.1, size0: 1, size1: 2, albedo: [0.1, 0.1, 0.1] });
    fx.spawn({ kind: 'fire', pos, flow: new THREE.Vector3(0, 0, -80), life: 1, delay: 0.3, fadeIn: 0.2, heat: 2, tau: 100,
      size0: 1, size1: 2, albedo: [0.1, 0.1, 0.1] });
    fx.update(0.2); // first slot dies: the delayed flame must carry its timing into slot zero
    const b = fx.mesh.geometry.getAttribute('iB');
    expect(fx.count).toBe(1);
    expect(b.getZ(0)).toBe(0);
    expect(b.getW(0)).toBe(0);
    fx.rebase(new THREE.Vector3(90, 40, 10));
    fx.update(0.2);
    expect(fx.mesh.geometry.getAttribute('iA').getX(0)).toBe(10);
    expect(fx.mesh.geometry.getAttribute('iD').getZ(0)).toBe(-80);
    expect((fx.mesh.geometry.getAttribute('iD') as THREE.BufferAttribute).updateRanges[0].count).toBe(3);
    expect(b.getZ(0)).toBeCloseTo(0.5, 5);
    expect(b.getW(0)).toBeCloseTo(Math.exp(-0.1 / 100), 5);
    fx.update(0.8);
    expect(b.getZ(0)).toBeLessThan(0.4);
    expect(b.getW(0)).toBeLessThan(0.8);
    fx.update(0.2);
    expect(fx.count).toBe(0);
  });

  it('expands flak promptly while retaining a lingering smoke lifetime', () => {
    const fx = new FlipbookFX(1);
    fx.spawn({ kind: 'flak', pos: new THREE.Vector3(), life: 20, size0: 20, size1: 40, albedo: [0.03, 0.03, 0.03], heat: 2.4, tau: 0.17 });
    fx.update(0.1);
    const early = fx.mesh.geometry.getAttribute('iA').getW(0);
    const heat = fx.mesh.geometry.getAttribute('iB').getW(0);
    fx.update(0.9);
    expect(fx.mesh.geometry.getAttribute('iA').getW(0)).toBeGreaterThan(early + 8);
    expect(fx.mesh.geometry.getAttribute('iB').getW(0)).toBeLessThan(heat * 0.01);
    fx.update(7);
    expect(fx.count).toBe(1);
    expect(fx.mesh.geometry.getAttribute('iB').getZ(0)).toBeGreaterThan(0.5);
  });

  it('tracks a camera cut without requiring a rendered frame', () => {
    const fx = new FlipbookFX(4), camera = new THREE.PerspectiveCamera();
    camera.position.set(50, 7000, 10);
    camera.rotation.z = Math.PI / 2;
    fx.setCamera(camera);
    expect(fx.camPos.toArray()).toEqual([50, 7000, 10]);
    expect(fx.angleOf(new THREE.Vector3(0, 1, 0))).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('turns its up axis along a direction seen from the camera', () => {
    const fx = new FlipbookFX(4);
    // camera at the identity orientation: screen right = +X, up = +Y
    expect(fx.angleOf(new THREE.Vector3(0, 1, 0))).toBeCloseTo(0, 6);
    expect(fx.angleOf(new THREE.Vector3(-1, 0, 0))).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('SmokeRibbons', () => {
  it('keeps crossing debris trails separate from each other and engine smoke', () => {
    const r = new SmokeRibbons(4), pos = new THREE.Vector3(), vel = new THREE.Vector3(1, 0, 0);
    const a = {}, b = {};
    for (let i = 0; i < 10; i++) {
      r.feed(pos, vel, 1, 0.1, 0.5, a);
      r.feed(pos, vel, 1, 0.1, 0.5, b);
      r.feed(pos, vel, 1, 0.1, 0.5);
      r.update(0.05);
    }
    expect(r.active).toBe(3);
    r.rebase(new THREE.Vector3(100, 0, 0));
    pos.x -= 100;
    r.feed(pos, vel, 1, 0.1, 0.5, a);
    expect(r.active).toBe(3);
    r.clear();
    expect(r.active).toBe(0);
  });

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
