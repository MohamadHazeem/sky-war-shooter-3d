import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync, statSync } from 'node:fs';
import { recolour, solveTwoBone } from '../src/game/CrewActor';
import { lookOf } from '../src/game/CrewFigure';
import { skinUv } from '../src/game/InteriorKit';
import { interiorHigh } from '../src/game/InteriorAssets';
import { SunShafts } from '../src/game/InteriorFx';
import { STATIONS } from '../src/world/B17Layout';
import { WAIST_WINDOWS } from '../src/audio/Cabin';

// B-17 interior 2.0 (Phase 10 goal 07)

// the JSON chunk of a .glb
function gltfJson(path: string) {
  const b = readFileSync(path);
  const len = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
}

describe('interior 2.0 assets', () => {
  it('ships the crewman with his rig, LOD, vest, first-person arm and every clip', () => {
    const j = gltfJson('public/models/crew.glb');
    const nodes = j.nodes.map((n: { name?: string }) => n.name);
    for (const n of ['crewBody', 'crewBodyLod', 'crewFlakVest', 'fpArm', 'hips', 'upperarm.L', 'hand.R', 'foot.L']) expect(nodes).toContain(n);
    expect(j.animations.map((a: { name: string }) => a.name).sort()).toEqual(['down', 'fire', 'help', 'hit', 'idle', 'kneel', 'sit']);
    expect(j.skins.length).toBeGreaterThan(0);
    expect(j.extensionsUsed).toContain('EXT_meshopt_compression');
  });
  it('ships the kit with its four parts and materials', () => {
    const j = gltfJson('public/models/b17_interior.glb');
    const nodes = j.nodes.map((n: { name?: string }) => n.name);
    for (const n of ['kitWaist', 'kitRadio', 'kitBay', 'kitBombs']) expect(nodes).toContain(n);
    const mats = j.materials.map((m: { name: string }) => m.name);
    for (const m of ['kitPaint', 'kitMetal', 'kitGlow', 'kitSky']) expect(mats).toContain(m);
  });
  it('stays well inside the ~15 MB budget', () => {
    const total = statSync('public/models/crew.glb').size + statSync('public/models/b17_interior.glb').size;
    expect(total).toBeLessThan(2 * 1024 * 1024);
  });
  it('keeps Low on the procedural interior', () => {
    expect(interiorHigh('low')).toBe(false);
    for (const q of ['medium', 'high', 'ultra'] as const) expect(interiorHigh(q)).toBe(true);
  });
});

describe('B-17G staggered waist windows', () => {
  it('puts the left window forward and the right aft, the gunners well apart', () => {
    const l = STATIONS.waistL.pivot, r = STATIONS.waistR.pivot;
    expect(l.z).toBeGreaterThan(r.z + 1.2);
    // each gunner stands ~0.74 m in from his pivot: the two men are ~1.4 m apart
    const a = new THREE.Vector3(l.x - 0.74, 0, l.z), b = new THREE.Vector3(r.x + 0.74, 0, r.z);
    expect(a.distanceTo(b)).toBeGreaterThan(1.3);
    expect(WAIST_WINDOWS[0][2]).toBe(l.z); expect(WAIST_WINDOWS[1][2]).toBe(r.z);
    expect((l.z + r.z) / 2).toBeCloseTo(-7.44, 5);    // the compartment (and its kit) stays centred
  });
});

describe('crew rig helpers', () => {
  it('recolours only the painted jacket / fleece / trouser regions for a look', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.2, 0.11, 0.055, 0.62, 0.55, 0.42, 0.55, 0.38, 0.03]), 3));
    const look = lookOf(null, true);   // rookie: olive jacket
    const out = recolour(g, look).getAttribute('color');
    expect(out.getX(0)).toBeCloseTo(look.jacket.r, 4);
    expect(out.getY(1)).toBeCloseTo(look.collar.g, 4);
    expect(out.getX(2)).toBeCloseTo(0.55, 4);      // the Mae West stays yellow
    expect(g.getAttribute('color').getX(0)).toBeCloseTo(0.2, 4);   // the source is untouched
  });
  it('solves two-bone IK onto a reachable target and bends toward the pole', () => {
    const a = new THREE.Vector3(0, 1.4, 0), t = new THREE.Vector3(0.1, 1.0, 0.35), mid = new THREE.Vector3(), end = new THREE.Vector3();
    solveTwoBone(a, t, 0.29, 0.27, new THREE.Vector3(0, -1, 0), mid, end);
    expect(end.distanceTo(t)).toBeLessThan(1e-6);
    expect(mid.distanceTo(a)).toBeCloseTo(0.29, 5);
    expect(mid.distanceTo(end)).toBeCloseTo(0.27, 5);
    // out of reach: the arm straightens toward it
    solveTwoBone(a, new THREE.Vector3(0, 0, 0), 0.29, 0.27, new THREE.Vector3(1, 0, 0), mid, end);
    expect(end.distanceTo(a)).toBeCloseTo(0.558, 3);
  });
});

describe('interior skin and shafts', () => {
  it('maps the skin so a rivet line falls on the first former and stringer', () => {
    const g = new THREE.BufferGeometry();
    const yFloor = 0.15 - 1.12 * 0.78 + 0.015, t0 = Math.asin((yFloor - 0.15) / 1.12) + 0.1;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([1.08 * Math.cos(t0), 0.15 + 1.12 * Math.sin(t0), -7.44 - 3.2 + 0.25]), 3));
    skinUv(g);
    const uv = g.getAttribute('uv'), col = g.getAttribute('color');
    expect(uv.getX(0)).toBeCloseTo(0, 5);
    expect(uv.getY(0)).toBeCloseTo(0, 5);
    expect(col.getX(0)).toBeGreaterThan(0.3); expect(col.getX(0)).toBeLessThanOrEqual(1);
  });
  it('builds a closed shaft volume whose planes contain the beam', () => {
    const sh = new SunShafts(-7.44, -7.44);
    sh.setVolumetric(true);
    const sun = new THREE.Vector3(1, 0.4, 0.2).normalize();     // sun on the left: the left window's shaft
    sh.update(sun, 0, 1, 1 / 60);
    const mesh = sh.group.children.find((m) => m.visible) as THREE.Mesh;
    expect(mesh).toBeTruthy();
    const mat = mesh.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uPlanes).toBeTruthy();
    const planes = mat.uniforms.uPlanes.value as THREE.Vector4[];
    // a point a metre into the cabin along the beam from the window centre is inside every plane
    const p = new THREE.Vector3(1.0, 0.4, -7.44).addScaledVector(sun, -1);
    for (const pl of planes) expect(pl.x * p.x + pl.y * p.y + pl.z * p.z).toBeLessThanOrEqual(pl.w + 1e-6);
    // and a point beside the window is outside one of the side planes
    const q = new THREE.Vector3(1.0, 0.4, -6.4).addScaledVector(sun, -1);
    expect(planes.some((pl) => pl.x * q.x + pl.y * q.y + pl.z * q.z > pl.w)).toBe(true);
    expect((mesh.geometry.getIndex()!.count)).toBe(36);
  });
});
