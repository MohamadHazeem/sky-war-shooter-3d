import {describe, it, expect} from 'vitest';
import {MeshStandardMaterial} from 'three';
import {tuneAircraftMaterial} from '../src/render/AircraftLook';
import {auditMaterial} from '../src/render/MaterialAudit';
import {NodeIO, getBounds} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {readdirSync, readFileSync} from 'node:fs';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder});
const inherited = /ww2_pilot_old|pilotWWII|pilot-b|germanpilotsuit|germanheadgear|pilotsuit-ger|headgear-ger|^pilot1$/i;
describe('original seated aircrew', () => {
  for (const dir of ['public/models', 'public/models/hero', 'tools/convert_models/output']) {
    for (const file of readdirSync(dir).filter(f => f.endsWith('.glb'))) {
      it(`${dir}/${file} contains no inherited pilot material or texture`, async () => {
        const d = await io.read(`${dir}/${file}`), r = d.getRoot();
        for (const p of [...r.listMaterials(), ...r.listTextures(), ...r.listNodes()]) expect(p.getName()).not.toMatch(inherited);
      });
    }
  }
  for (const [file, seats] of [['b17.glb', 4], ['hero/b17.glb', 4], ['p51d.glb', 1], ['do335.glb', 1], ['he111.glb', 1]] as const) {
    it(`${file} has original seated crew located at its eye markers`, async () => {
      const doc = await io.read(`public/models/${file}`);
      const nodes = doc.getRoot().listNodes();
      const own = nodes.filter(n => n.getExtras().crewSource === 'project:tools/hero/sketchfab/seated.py');
      expect(own).toHaveLength(1);
      const b = getBounds(own[0]);
      if (seats === 1) {
        expect(b.max[0] - b.min[0]).toBeLessThan(.7);
        expect(b.max[1] - b.min[1]).toBeLessThan(1.5);
      }
      for (const name of seats === 4 ? ['eye_pilot', 'eye_copilot', 'eye_bombardier', 'eye_tail'] : ['eye_pilot']) {
        const eye = nodes.find(n => n.getName() === name)!.getWorldMatrix().slice(12, 15);
        expect(eye.every((v, i) => v >= b.min[i] && v <= b.max[i])).toBe(true);
      }
      // Regression: transforming quantized normals previously collapsed every vertex
      // to +Z, making the inserted crew look unlit despite correct PBR materials.
      const leather = own[0].getMesh()!.listPrimitives().find(p => p.getMaterial()?.getName() === 'crewLeather')!;
      const normals = leather.getAttribute('NORMAL')!;
      const directions = new Set<string>();
      for (let i = 0; i < Math.min(500, normals.getCount()); i++) directions.add(normals.getElement(i, [0, 0, 0]).map(v => v.toFixed(2)).join(','));
      expect(directions.size).toBeGreaterThan(50);
      const triangles = own[0].getMesh()!.listPrimitives().reduce((n, p) => n + p.getIndices()!.getCount() / 3, 0);
      expect(triangles).toBeLessThanOrEqual(seats * 18000);
    });
  }
  it('seated crew has lit, smooth PBR surfaces for leather, cloth, skin and equipment', async () => {
    const doc = await io.read('public/models/seated-crew.glb');
    const materials = doc.getRoot().listMaterials();
    expect(materials.map(m => m.getName())).toEqual(expect.arrayContaining([
      'crewLeather', 'crewCloth', 'crewSkin', 'crewWebbing', 'crewRubber', 'crewMetal', 'crewLens',
    ]));
    for (const m of materials) {
      expect(m.getExtension('KHR_materials_unlit')).toBeNull();
      expect(m.getBaseColorFactor().slice(0, 3).some(c => c < .8)).toBe(true);
      const runtime = new MeshStandardMaterial({name: m.getName(), roughness: m.getRoughnessFactor(), metalness: m.getMetallicFactor()});
      expect(tuneAircraftMaterial(runtime, 'p51d')).toBe(false);
      auditMaterial(runtime);
      expect(runtime.roughness).toBe(m.getRoughnessFactor());
      expect(runtime.metalness).toBe(m.getMetallicFactor());
      runtime.dispose();
    }
    for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
      expect(p.getAttribute('NORMAL')?.getCount()).toBe(p.getAttribute('POSITION')?.getCount());
    }
  });
  it('credits and both locales identify the original crew', () => {
    expect(readFileSync('public/models/CREDITS.md', 'utf8')).not.toMatch(/Augras/);
    for (const locale of ['en', 'ar']) expect(readFileSync(`src/i18n/${locale}.ts`, 'utf8')).toContain('GRIP420');
  });
});


describe('Sketchfab fighter structural contract', () => {
  for (const kind of ['bf109', 'fw190']) {
    it(`${kind} keeps the close mesh within the live fighter triangle budget`, async () => {
      const doc = await io.read(`public/models/${kind}.glb`);
      let tris = 0;
      doc.getRoot().listScenes()[0].traverse(node => {
        for (let p = node; p; p = p.getParentNode()!) if (/_lod[12]$/.test(p.getName())) return;
        for (const p of node.getMesh()?.listPrimitives() ?? []) tris += p.getIndices()!.getCount() / 3;
      });
      expect(tris).toBeLessThanOrEqual(kind === 'fw190' ? 47000 : 48000);
    });
    it(`${kind} has real geometry for every control and all seven destruction parts`, async () => {
      const doc = await io.read(`public/models/${kind}.glb`);
      const nodes = doc.getRoot().listNodes();
      for (const name of ['core', 'nose', 'tail', 'wingL', 'wingR', 'wingLtip', 'wingRtip']) {
        const node = nodes.find(n => n.getName() === `part_${name}`);
        expect(node, name).toBeDefined();
        const box = getBounds(node!);
        expect(box.min.every(Number.isFinite), name).toBe(true);
        if (name !== 'core') expect(nodes.some(n => n.getName() === `joint_${name}`)).toBe(true);
      }
      for (const name of ['ctl_aileron_L', 'ctl_aileron_R', 'ctl_elevator_L', 'ctl_elevator_R', 'ctl_flap_L', 'ctl_flap_R', 'ctl_rudder']) {
        const node = nodes.find(n => n.getName() === name);
        expect(node, name).toBeDefined();
        const box = getBounds(node!);
        expect(box.min.every(Number.isFinite), `${kind} ${name} has geometry`).toBe(true);
        expect(Math.max(...box.max.map((v, i) => v - box.min[i])), name).toBeGreaterThan(.2);
      }
      const glass = getBounds(nodes.find(n => n.getName() === 'glass')!);
      const pilot = getBounds(nodes.find(n => n.getName() === 'pilot')!);
      expect(pilot.max[1], 'head stays inside canopy').toBeLessThan(glass.max[1] + .02);
    });
  }
});
