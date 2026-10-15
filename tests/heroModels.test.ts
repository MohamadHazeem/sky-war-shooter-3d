import { describe, expect, it } from 'vitest';
import { statSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { HeroLOD, HERO_KINDS, HERO_LOD_DIST, animateControls, insidePlanes, setGear, syncHeroLod } from '../src/world/HeroLook';
import { ENEMY_VARIANTS } from '../src/world/EnemyTypes';

// Phase 10 goal 05: the Luftwaffe hero models (tools/hero/luftwaffe) and their runtime side.

const MODELS = join(import.meta.dirname, '..', 'public', 'models');

describe('hero model files (docs/phase10/hero-parts.md contract)', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  for (const kind of HERO_KINDS) {
    it(`${kind}: named parts, LODs, control surfaces, PBR set, size`, async () => {
      const file = join(MODELS, `${kind}.glb`);
      const doc = await io.read(file);
      const names = new Set(doc.getRoot().listNodes().map((n) => n.getName()).filter(Boolean));
      const need = ['airframe', 'part_fuselage', 'part_fuselage_lod0', 'part_fuselage_lod1', 'part_fuselage_lod2',
        'part_fuselage_aft', 'part_tail', 'part_wingL', 'part_wingLtip', 'part_wingR', 'part_wingRtip',
        'part_wingL_lod0', 'ctl_aileron_L_lod0', 'ctl_aileron_L', 'ctl_aileron_R', 'ctl_elevator_L', 'ctl_elevator_R',
        'ctl_flap_L', 'ctl_flap_R', 'glass', 'pilot', 'interior', 'eye_pilot'];
      for (const n of need) expect(names.has(n), `${kind} lacks ${n}`).toBe(true);
      expect([...names].some((n) => n.startsWith('ctl_rudder'))).toBe(true);
      // only the fuselage carries LOD1 / LOD2 (the whole airframe merged: one draw call)
      expect([...names].filter((n) => n.endsWith('_lod1'))).toEqual(['part_fuselage_lod1']);
      expect([...names].filter((n) => n.endsWith('_lod2'))).toEqual(['part_fuselage_lod2']);
      if (kind !== 'p47d' && kind !== 'spitfire9') for (const n of ['gear_left', 'gear_right']) expect(names.has(n)).toBe(true);
      if (kind === 'me262') {
        for (const n of ['fan_1', 'fan_2', 'exhaust_left', 'exhaust_right', 'part_engine1', 'part_engine2']) expect(names.has(n), n).toBe(true);
        expect(names.has('prop_1')).toBe(false);
      } else {
        for (const n of ['prop_1', 'spinner_1', 'blades_1']) expect(names.has(n), n).toBe(true);
      }
      if (kind === 'bf110' || kind === 'ju88') for (const n of ['prop_2', 'part_engine1', 'part_engine2', 'crew']) expect(names.has(n), n).toBe(true);
      if (kind === 'bf110') {
        expect(names.has('gun_rear')).toBe(true);
        const gun = doc.getRoot().listNodes().find((n) => n.getName() === 'gun_rear')!;
        expect(gun.listChildren().some((c) => c.getName() === 'muzzle_rear')).toBe(true);
      }
      if (kind === 'fw190') expect(names.has('cooling_fan')).toBe(true);
      const skin = doc.getRoot().listMaterials().find((m) => m.getName() === `hero_${kind}`)!;
      expect(skin.getBaseColorTexture()).toBeTruthy();
      expect(skin.getNormalTexture()).toBeTruthy();
      expect(skin.getMetallicRoughnessTexture()).toBe(skin.getOcclusionTexture());
      const glass = doc.getRoot().listMaterials().find((m) => m.getName() === `hero_${kind}_glass`)!;
      expect(glass.getAlphaMode()).toBe('BLEND');
      // budget: <= ~8 MB per type, ace livery and KTX2 maps included (lazy)
      const bytes = statSync(file).size + statSync(join(MODELS, `${kind}_ace.webp`)).size +
        ['base', 'normal', 'orm'].reduce((a, n) => a + statSync(join(MODELS, `${kind}_${n}.ktx2`)).size, 0);
      expect(bytes).toBeLessThan(8 * 1024 * 1024);
    });
  }
  it('KTX2 maps (UASTC + Zstandard, full mip chain) next to each model, WebP fallback embedded', async () => {
    for (const kind of HERO_KINDS) {
      for (const [name, size] of [['base', 2048], ['normal', 1024], ['orm', 1024]] as const) {
        const file = join(MODELS, `${kind}_${name}.ktx2`);
        expect(existsSync(file), file).toBe(true);
        // KTX2 header: identifier, vkFormat, typeSize, width, height, depth, layers, faces, levels, supercompression
        const b = readFileSync(file);
        expect(b.subarray(1, 7).toString()).toBe('KTX 20');
        const u32 = (o: number) => b.readUInt32LE(o);
        expect(u32(20)).toBe(size);
        expect(u32(40)).toBe(Math.log2(size) + 1);   // full mip chain
        expect(u32(44)).toBe(2);                      // Zstandard
        expect(u32(12)).toBe(0);                      // VK_FORMAT_UNDEFINED: Basis Universal payload
      }
      const doc = await io.read(join(MODELS, `${kind}.glb`));
      expect(doc.getRoot().listTextures().every((t) => t.getMimeType() === 'image/webp')).toBe(true);
    }
    expect(existsSync(join(MODELS, 'basis', 'basis_transcoder.wasm'))).toBe(true);
  });
  it('the old FlightGear-only types keep their models', () => {
    for (const k of ['he111', 'do335', 'me163', 'p51d', 'b17']) expect(existsSync(join(MODELS, `${k}.glb`))).toBe(true);
  });
});

// Goal 05b: the shapes come from the FlightGear models; every type must keep matching the public-domain
// US recognition three-views (tools/hero/luftwaffe/silhouette, boundary-tolerant IoU, translation-only
// registration at the captioned span).
describe('silhouette gate vs the public-domain three-views', async () => {
  // @ts-expect-error plain .mjs tool module
  const sil = await import('../tools/hero/luftwaffe/silhouette/check.mjs');
  for (const kind of ['bf109', 'fw190', 'me262', 'bf110', 'ju88']) {
    it(`${kind}: top / side / front outlines`, async () => {
      const r = await sil.measure(kind, join(MODELS, `${kind}.glb`));
      for (const view of ['top', 'side', 'front'] as const) {
        expect(r[view].tolerant, `${kind} ${view}`).toBeGreaterThanOrEqual(sil.GATE[view]);
      }
    }, 30000);
  }
});

function lodAt(dist: number, scale = 6, fov = 62) {
  const lod = new HeroLOD();
  const levels = HERO_LOD_DIST.map((d) => { const o = new THREE.Object3D(); lod.addLevel(o, d); return o; });
  const root = new THREE.Group();
  root.scale.setScalar(scale);
  root.add(lod);
  root.updateMatrixWorld(true);
  const cam = new THREE.PerspectiveCamera(fov, 1.6, 0.1, 10000);
  cam.position.set(0, 0, dist);
  cam.updateMatrixWorld(true);
  lod.update(cam);
  return levels.findIndex((o) => o.visible);
}

describe('HeroLOD', () => {
  it('picks the level from the on-screen size: distance over the model scale', () => {
    syncHeroLod('high');
    expect(lodAt(150)).toBe(0);            // the waist view at 150 m of a 6x fighter
    expect(lodAt(450)).toBe(1);            // the head-on wedge
    expect(lodAt(1500)).toBe(2);           // the distant swarm
    expect(lodAt(150, 1)).toBe(2);         // an unscaled aircraft is small at 150 m
  });
  it('zooming in (narrow FOV) keeps the detailed level', () => {
    syncHeroLod('high');
    expect(lodAt(450, 6, 62)).toBe(1);
    expect(lodAt(450, 6, 20)).toBe(0);
  });
  it('the Low preset pins every hero aircraft to the far level', () => {
    syncHeroLod('low');
    expect(lodAt(20)).toBe(2);
    syncHeroLod('high');
    expect(lodAt(20)).toBe(0);
  });
});

describe('control surfaces', () => {
  function fake() {
    const model = new THREE.Group();
    model.userData.hero = 'bf109';
    const mk = (n: string) => { const o = new THREE.Object3D(); o.name = n; model.add(o); return o; };
    const nodes = { aL: mk('ctl_aileron_L'), aR: mk('ctl_aileron_R'), el: mk('ctl_elevator_L'), ru: mk('ctl_rudder'), fl: mk('ctl_flap_L') };
    const f = { model, alive: true, fm: { roll: 0, pitch: 0, yaw: 0 } } as any;
    return { f, nodes };
  }
  const angle = (o: THREE.Object3D) => 2 * Math.atan2(o.quaternion.x, o.quaternion.w);
  it('ailerons deflect opposite, elevators with pitch, rudder against yaw, flaps stay', () => {
    const { f, nodes } = fake();
    f.fm.roll = 1; f.fm.pitch = 1; f.fm.yaw = 1;
    for (let i = 0; i < 120; i++) animateControls(f, 1 / 60);
    expect(angle(nodes.aL)).toBeLessThan(-0.25);    // right roll: left aileron trailing edge down
    expect(angle(nodes.aR)).toBeGreaterThan(0.25);  // right aileron up
    expect(angle(nodes.el)).toBeGreaterThan(0.3);   // nose up: elevator trailing edge up
    expect(angle(nodes.ru)).toBeLessThan(-0.3);     // nose left: rudder trailing edge left
    expect(angle(nodes.fl)).toBe(0);
  });
  it('does nothing for the old models or a dead aircraft', () => {
    const { f, nodes } = fake();
    f.model.userData.hero = undefined;
    f.fm.roll = 1;
    animateControls(f, 1);
    expect(angle(nodes.aL)).toBe(0);
    const g = fake();
    g.f.alive = false; g.f.fm.roll = 1;
    animateControls(g.f, 1);
    expect(angle(g.nodes.aL)).toBe(0);
  });
});

describe('break-up regions (Wrecks.cut with named parts)', () => {
  const P = (x: number, y: number, z: number, d: number) => new THREE.Plane(new THREE.Vector3(x, y, z), d);
  const W = 1.05, T = -4.3;
  it('every part centre falls in exactly one blow-up piece', () => {
    const pieces = [[P(1, 0, 0, -W)], [P(-1, 0, 0, -W)], [P(0, 0, -1, T), P(-1, 0, 0, W), P(1, 0, 0, W)], [P(0, 0, 1, -T), P(-1, 0, 0, W), P(1, 0, 0, W)]];
    const centres = [new THREE.Vector3(2.4, -0.3, -0.5), new THREE.Vector3(-2.4, -0.3, -0.5), new THREE.Vector3(0, 0.6, -5.3), new THREE.Vector3(0, 0, 0.5),
      new THREE.Vector3(0, 0.1, -3.8), new THREE.Vector3(2.35, -0.2, 0.2)];
    for (const c of centres) expect(pieces.filter((pl) => insidePlanes(c, pl)).length).toBe(1);
  });
  it('a twin loses its engine with the wing', () => {
    const wing = [P(1, 0, 0, -W)], body = [P(-1, 0, 0, W)];
    const engine = new THREE.Vector3(2.35, -0.2, 0.2);
    expect(insidePlanes(engine, wing)).toBe(true);
    expect(insidePlanes(engine, body)).toBe(false);
  });
});

describe('undercarriage', () => {
  it('setGear lowers the gear of a hero model (parked) and leaves other models alone', () => {
    const hero = new THREE.Group(); hero.userData.hero = 'fw190';
    const old = new THREE.Group();
    for (const m of [hero, old]) for (const n of ['gear_left', 'gear_right', 'gear_tail']) { const o = new THREE.Object3D(); o.name = n; o.visible = false; m.add(o); }
    setGear(hero, true); setGear(old, true);
    expect(hero.children.every((c) => c.visible)).toBe(true);
    expect(old.children.every((c) => !c.visible)).toBe(true);
  });
});

describe('enemy variants', () => {
  it('prop discs match the hero propellers', () => {
    expect(ENEMY_VARIANTS.bf109.propRadius).toBe(1.5);
    expect(ENEMY_VARIANTS.fw190.propRadius).toBe(1.65);
    expect(ENEMY_VARIANTS.bf110.propRadius).toBe(1.55);
    expect(ENEMY_VARIANTS.ju88.propRadius).toBe(1.72);
  });
});
