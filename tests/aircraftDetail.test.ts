import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { weatherNow } from '../src/render/WeatherState';
import { emitTurboGlow } from '../src/world/TurboGlow';
import type { Bomber } from '../src/world/Aircraft';
import type { ParticleOpts } from '../src/render/Particles';
const night = weatherNow.night;
afterEach(() => { weatherNow.night = night; });
describe('B-17 turbo wastegate glow', () => {
  const bomber = () => ({ alive: true, remove: false, engineDead: [false, false, false, false],
    localToWorld(p: THREE.Vector3, out: THREE.Vector3) { return out.copy(p).addScalar(100); },
  }) as unknown as Bomber;
  it('stays off in daylight and follows all four nacelles at night', () => {
    const positions: number[][] = [], records: ParticleOpts[] = [];
    const glow = { spawn(p: ParticleOpts) { positions.push(p.pos.toArray()); records.push(p); } };
    const b = bomber();
    weatherNow.night = 0; emitTurboGlow(b, glow); expect(positions).toHaveLength(0);
    weatherNow.night = 1; emitTurboGlow(b, glow); expect(positions).toHaveLength(8);
    expect(positions[0]).toEqual([105.955, 99.0377, 101.095]);
    expect(positions[6][0]).toBeCloseTo(92.905);
    expect(new Set(records).size).toBe(1); // Persistent spawn record, copied by ParticleSystem.
  });
  it('extinguishes failed engines and dead/removed aircraft', () => {
    let count = 0; const glow = { spawn() { count++; } }, b = bomber();
    weatherNow.night = 1; b.engineDead[1] = b.engineDead[3] = true;
    emitTurboGlow(b, glow); expect(count).toBe(4);
    b.alive = false; emitTurboGlow(b, glow); expect(count).toBe(4);
    b.alive = true; b.remove = true; emitTurboGlow(b, glow); expect(count).toBe(4);
  });
});

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

it('ships artifact-bound detail maps and readable clearcoat glass', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const report = JSON.parse(readFileSync('docs/phase11/shots/01/bakes.json', 'utf8'));
  for (const kind of ['b17', 'bf109', 'fw190', 'me262', 'bf110', 'ju88']) {
    const file = `public/models/${kind === 'b17' ? 'hero/b17' : kind}.glb`;
    expect(report[kind].artifactSha256).toBe(createHash('sha256').update(readFileSync(file)).digest('hex'));
    if (kind !== 'b17') {
      expect(report[kind].retainedSource).toBe('683275db');
      const live = JSON.parse(readFileSync('docs/phase11/shots/01/live-assets.json', 'utf8'));
      for (const map of ['base.ktx2', 'normal.ktx2', 'orm.ktx2', 'ace.webp']) {
        const path = `models/${kind}_${map}`;
        const expected = live.files.find((f: { path: string }) => f.path === path).liveSha256;
        expect(createHash('sha256').update(readFileSync(`public/${path}`)).digest('hex')).toBe(expected);
      }
    }
    else expect(report[kind].reliefVertices).toBeGreaterThan(1_000_000);
    expect(report[kind].bakeSize).toBe(1024);
    const normalKtx = kind === 'b17' ? 'public/models/hero/normal.ktx2' : `public/models/${kind}_normal.ktx2`;
    expect(report[kind].normalKtx2Sha256).toBe(createHash('sha256').update(readFileSync(normalKtx)).digest('hex'));
    const doc = await io.read(file);
    const glass = doc.getRoot().listMaterials().find(m => m.getName() === (kind === 'b17' ? 'hero_glass' : `hero_${kind}_glass`))!;
    expect(glass.getExtension('KHR_materials_clearcoat')).toBeTruthy();
    expect(glass.getBaseColorFactor()[3]).toBeGreaterThan(.03);
    expect(glass.getBaseColorFactor()[3]).toBeLessThan(.12);
    expect(Math.max(...glass.getBaseColorFactor().slice(0,3))).toBeLessThan(.2);
    expect(glass.getExtension('KHR_materials_transmission')).toBeNull();
    const normal = kind === 'b17' ? readFileSync('public/models/hero/normal.webp') : doc.getRoot().listMaterials().find(m => m.getName() === `hero_${kind}`)!.getNormalTexture()!.getImage()!;
    if (kind === 'b17') expect(report[kind].normalWebpSha256).toBe(createHash('sha256').update(normal).digest('hex'));
    const {data, info} = await sharp(normal).removeAlpha().raw().toBuffer({resolveWithObject:true});
    expect([info.width, info.height]).toEqual([1024, 1024]);
    let valid = 0, relief = 0, unit = 0;
    for (let i = 0; i < data.length; i += 3) {
      if (data[i + 2] < 190) continue; // Unused atlas space and steep creases.
      const x = data[i] / 127.5 - 1, y = data[i + 1] / 127.5 - 1, z = data[i + 2] / 127.5 - 1;
      valid++;
      if (x * x + y * y > .0003) relief++;
      if (Math.abs(Math.hypot(x,y,z) - 1) < .12) unit++;
    }
    expect(valid).toBeGreaterThan(100_000);
    // Only the B-17 ships new normals. Fighter maps are locked byte-for-byte
    // to the approved live baseline above, including its sparse relief.
    if (kind === 'b17') expect(relief / valid).toBeGreaterThan(.025);
    expect(unit / valid).toBeGreaterThan(.9); // Reject colour-space or tangent-normal corruption.
  }
}, 30000);
