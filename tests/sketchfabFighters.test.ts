import {describe, it, expect} from 'vitest';
import {Matrix4, MeshStandardMaterial, Ray, Vector3} from 'three';
import {tuneAircraftMaterial} from '../src/render/AircraftLook';
import {auditMaterial} from '../src/render/MaterialAudit';
import {NodeIO, getBounds} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {readdirSync, readFileSync} from 'node:fs';
import sharp from 'sharp';

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
    // Exterior cockpit lighting must not turn flying leather into glossy plastic.
    const leather = materials.find(m => m.getName() === 'crewLeather')!;
    expect(leather.getRoughnessFactor()).toBeGreaterThanOrEqual(.75);
    expect(leather.getMetallicFactor()).toBe(0);
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
  it('Fw 190 skin closes the reversed panel seen through in the banked waist pass', async () => {
    const doc = await io.read('public/models/fw190.glb');
    const wing = doc.getRoot().listNodes().find(n => n.getName() === 'part_wingR_lod0')!;
    // Model-space ray through the hole in the rejected 65 m capture. Backface
    // culling matters: the double-sided source hid this conversion defect.
    const ray = new Ray(new Vector3(-8.4070862, -4.8329314, 4.8295742),
      new Vector3(.71578345, .49519380, -.49237907).normalize());
    const wellRay = new Ray(new Vector3(-1.4, -2, .6), new Vector3(0, 1, 0));
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), hit = new Vector3();
    let closed = false, underside = Infinity;
    wing.traverse(node => {
      const matrix = new Matrix4().fromArray(node.getWorldMatrix());
      for (const p of node.getMesh()?.listPrimitives() ?? []) {
        const position = p.getAttribute('POSITION')!, indices = p.getIndices()!;
        for (let i = 0; i < indices.getCount(); i += 3) {
          a.fromArray(position.getElement(indices.getScalar(i), [])).applyMatrix4(matrix);
          b.fromArray(position.getElement(indices.getScalar(i + 1), [])).applyMatrix4(matrix);
          c.fromArray(position.getElement(indices.getScalar(i + 2), [])).applyMatrix4(matrix);
          if (ray.intersectTriangle(a, b, c, true, hit)) closed = true;
          if (wellRay.intersectTriangle(a, b, c, true, hit)) underside = Math.min(underside, hit.y);
        }
      }
    });
    expect(closed).toBe(true);
    // The retracted door covers the well, rather than exposing the upper skin
    // at y≈-.35 and the dark rear wall of the source's parked wheel cavity.
    expect(underside).toBeGreaterThan(-.75);
    expect(underside).toBeLessThan(-.5);
  });
  for (const kind of ['bf109', 'fw190']) {
    it(`${kind} retains dense grey mottle rather than pale whitewash`, async () => {
      const doc = await io.read(`public/models/${kind}.glb`);
      const skin = doc.getRoot().listMaterials().find(m => m.getName() === `hero_${kind}`)!;
      const {data, info} = await sharp(skin.getBaseColorTexture()!.getImage()!)
        .removeAlpha().raw().toBuffer({resolveWithObject: true});
      // Unmarked upper fin: avoid white bands, crosses and yellow tactical paint.
      // Measure shipped WebP texels through the mesh UVs, not painter constants.
      let samples = 0, pale = 0;
      for (const node of doc.getRoot().listNodes()) {
        let far = false;
        for (let n = node; n; n = n.getParentNode()!) if (/_lod[12]$/.test(n.getName())) far = true;
        if (far) continue;
        const matrix = new Matrix4().fromArray(node.getWorldMatrix());
        for (const p of node.getMesh()?.listPrimitives() ?? []) {
          const pos = p.getAttribute('POSITION')!, uv = p.getAttribute('TEXCOORD_0');
          if (!uv || p.getMaterial() !== skin) continue;
          for (let i = 0; i < pos.getCount(); i++) {
            const v = new Vector3().fromArray(pos.getElement(i, [])).applyMatrix4(matrix);
            if (Math.abs(v.x) > .14 || v.y < (kind === 'bf109' ? 1.2 : .65) || v.z > -4.8) continue;
            const [u, w] = uv.getElement(i, [0, 0]);
            const x = Math.max(0, Math.min(info.width - 1, Math.floor(u * info.width)));
            const y = Math.max(0, Math.min(info.height - 1, Math.floor(w * info.height)));
            const offset = (y * info.width + x) * info.channels;
            samples++;
            if ((data[offset] + data[offset + 1] + data[offset + 2]) / 765 > .65) pale++;
          }
        }
      }
      expect(samples).toBeGreaterThan(100);
      expect(pale / samples).toBeLessThan(.15);
    });
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
