import * as THREE from 'three';
import type { Bomber, HitZone } from './Aircraft';
import type { HitEvent } from './Ballistics';
import type { World } from './World';
import type { ParticleOpts, ParticleSystem } from '../render/Particles';
import { sound } from '../audio/Sound';
import { patchSurface, surfaceKey } from '../render/SurfaceDetail';

// Visible battle damage on the player's own B-17, seen from the gun positions:
//  - engines: oil smoke creeping back over the nacelle, a coughing engine, a feathered
//    (stopped) or windmilling prop once it dies, flames that spread along the wing while
//    the fire burns, scorch marks left behind
//  - bullet and cannon holes on the wings, nacelles, tail and rear fuselage: jagged dark
//    holes with bare-metal rims, seated on the real skin through a triangle grid
//  - big damage: a torn wingtip, a shot-up stabiliser or fin, flak holes you can see the
//    sky through (fragments discarded in the airframe shader with ragged, charred edges)
//  - fuel leaks: a white vapour stream from a holed wing tank
//  - airframe buzz (camera, via GunnerController) and crew radio calls
// Event work (hits, engine deaths) may allocate a little; the per-frame path does not.

const TICK = 0.05;          // s between emitter ticks
const FAR = 2500;           // m: no emission beyond this (pilot missions: the Sky Queen far off)
const SMOKE_HARD = 8200;    // smoke pool (9000) fill above which emitters stop
const SMOKE_SOFT = 6500;
const GLOW_HARD = 4300;     // glow pool (5000)
const MAX_DECALS = 96;
const MAX_LEAKS = 3;
const VOIDS = 8;            // see-through damage slots (shader uniforms)
const V_TIP_L = 0, V_TIP_R = 1, V_STAB_L = 2, V_STAB_R = 3, V_FIN = 4, V_FLAK = 5; // 5..7 flak

// Colours (no per-spawn tuples)
const C_OIL: [number, number, number] = [0.05, 0.045, 0.04];
const C_OIL1: [number, number, number] = [0.14, 0.13, 0.12];
const C_GREY: [number, number, number] = [0.42, 0.41, 0.4];
const C_GREY1: [number, number, number] = [0.6, 0.59, 0.58];
const C_COLUMN: [number, number, number] = [0.04, 0.035, 0.032];
const C_FLAME: [number, number, number] = [10, 4, 0.9];
const C_FLAME1: [number, number, number] = [2, 0.4, 0.05];
const C_LICK: [number, number, number] = [4.5, 1.7, 0.35];   // flames over the wing: dimmer than the nacelle fire
const C_LICK1: [number, number, number] = [1.2, 0.25, 0.04];
const C_POP: [number, number, number] = [16, 7, 1.6];
const C_FUEL: [number, number, number] = [0.72, 0.74, 0.77];
const C_FUEL1: [number, number, number] = [0.66, 0.68, 0.72];
const C_FLUFF: [number, number, number] = [0.72, 0.68, 0.56];   // insulation
const C_CHIP: [number, number, number] = [0.33, 0.36, 0.28];    // olive paint chips
const C_FRAG: [number, number, number] = [0.07, 0.065, 0.06];

// ---------- decals: jagged rim + hole, shared geometry and materials ----------
// MeshStandardMaterial, front side, no maps: the same shader program as the Effects
// debris and the DamageStages decals (pre-warmed), so a first hit never compiles.
function jaggedGeo(n: number, rMin: number, seed: number) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pos = [0, 0, 0], nrm = [0, 0, 1], idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * (Math.PI / n);
    const r = rMin + (1 - rMin) * rnd();
    pos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
    nrm.push(0, 0, 1);
    idx.push(0, 1 + i, 1 + ((i + 1) % n));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}
const RIM_GEOS = [11, 23, 37, 51].map((s) => jaggedGeo(9, 0.62, s * 7919));
const HOLE_GEOS = [13, 29, 41, 59].map((s) => jaggedGeo(8, 0.42, s * 104729));
const SCORCH_GEOS = [17, 31].map((s) => jaggedGeo(13, 0.5, s * 15485863));
const decalMat = (color: number, rough: number, metal: number, off = -2) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, polygonOffset: true, polygonOffsetFactor: off, polygonOffsetUnits: off });
const RIM_MAT = decalMat(0xa3a59c, 0.4, 0.75);
const HOLE_MAT = decalMat(0x090807, 1, 0, -3);
const SCORCH_MAT = decalMat(0x17130f, 0.95, 0.1, -1);
const EMBER_MAT = decalMat(0x0b0a09, 1, 0, -3);
EMBER_MAT.emissive.setRGB(1.8, 0.45, 0.06);

// ---------- see-through damage: discard airframe fragments inside ragged voids ----------
// One material for the player's airframe skin, shared across missions so its program is
// compiled once (menu formation / World.prewarm) and never mid-game. Each void is a
// rounded box (centre, radius, half extents, jag) in model space; its edge is broken up
// with value noise and charred, with a thin line of bare metal right at the tear.
const voidA = Array.from({ length: VOIDS }, () => new THREE.Vector4(0, 0, 0, -1e4));
const voidB = Array.from({ length: VOIDS }, () => new THREE.Vector4());
const voidUniforms = { uVoidA: { value: voidA }, uVoidB: { value: voidB } };
let voidMat: THREE.MeshStandardMaterial | null = null;
let voidSrc: THREE.Material | null = null;

function makeVoidMat(src: THREE.MeshStandardMaterial) {
  const m = src.clone();
  m.name = 'GD-L-damage';
  m.customProgramCacheKey = () => 'sws-player-voids-1' + surfaceKey(m);   // + panel lines / weathering (SurfaceDetail.ts)
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uVoidA = voidUniforms.uVoidA;
    sh.uniforms.uVoidB = voidUniforms.uVoidB;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVoidP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVoidP = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vVoidP;
uniform vec4 uVoidA[${VOIDS}];
uniform vec4 uVoidB[${VOIDS}];
float vChar = 0.0;
float vBare = 0.0;
float vHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(vHash(i), vHash(i + vec3(1, 0, 0)), f.x), mix(vHash(i + vec3(0, 1, 0)), vHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(vHash(i + vec3(0, 0, 1)), vHash(i + vec3(1, 0, 1)), f.x), mix(vHash(i + vec3(0, 1, 1)), vHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{
  float sd = 1e3; float jag = 0.0;
  for (int i = 0; i < ${VOIDS}; i++) {
    vec4 a = uVoidA[i]; vec4 b = uVoidB[i];
    vec3 q = abs(vVoidP - a.xyz) - b.xyz;
    float d = length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - a.w;
    if (d < sd) { sd = d; jag = b.w; }
  }
  if (sd < 0.9) {
    float n = vNoise(vVoidP * 4.0) * 0.6 + vNoise(vVoidP * 11.0) * 0.4;
    float e = sd + jag * (n - 0.5) * 2.0;
    if (e < 0.0) discard;
    vChar = 1.0 - smoothstep(0.0, 0.06 + 0.3 * n, e);
    vBare = 1.0 - smoothstep(0.0, 0.025, e);
  }
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.022, 0.019, 0.016), vChar * 0.94);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.5, 0.48), vBare);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.85, vBare);`);
    patchSurface(sh, m);   // after ours, so the charred void edges land on top of the detail
  };
  return m;
}

// ---------- the skin: airframe triangles bucketed on two 2D grids ----------
// Vertical rays (wings, stabilisers, nacelles) use the XZ grid, sideways rays (fin, rear
// fuselage) the YZ grid. Built once from the shared B-17 geometry (~34k triangles).
class SkinGrid {
  private tri: Float32Array;
  private readonly cs = 0.5;
  private readonly x0 = -16.5; private readonly y0 = -2; private readonly z0 = -17;
  private nx: number; private ny: number; private nz: number;
  private xzStart: Uint32Array; private xzIdx: Uint32Array;
  private yzStart: Uint32Array; private yzIdx: Uint32Array;

  constructor(meshes: THREE.Mesh[], root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const m = new THREE.Matrix4(), v = new THREE.Vector3();
    let count = 0;
    for (const me of meshes) count += (me.geometry.index ? me.geometry.index.count : me.geometry.attributes.position.count) / 3;
    this.tri = new Float32Array(count * 9);
    let t = 0;
    for (const me of meshes) {
      m.multiplyMatrices(inv, me.matrixWorld);
      const p = me.geometry.attributes.position, ix = me.geometry.index;
      const n = ix ? ix.count : p.count;
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(p, ix ? ix.getX(i) : i).applyMatrix4(m);
        this.tri[t++] = v.x; this.tri[t++] = v.y; this.tri[t++] = v.z;
      }
    }
    this.nx = Math.ceil(33 / this.cs); this.ny = Math.ceil(8 / this.cs); this.nz = Math.ceil(24 / this.cs);
    [this.xzStart, this.xzIdx] = this.bucket(0, this.x0, this.nx);
    [this.yzStart, this.yzIdx] = this.bucket(1, this.y0, this.ny);
  }

  // CSR buckets over (axis a, z): a = 0 -> x, a = 1 -> y
  private bucket(a: number, a0: number, na: number): [Uint32Array, Uint32Array] {
    const T = this.tri, cs = this.cs, z0 = this.z0, nz = this.nz, nt = T.length / 9;
    const cells = na * nz;
    const counts = new Uint32Array(cells + 1);
    let idx: Uint32Array | null = null, fill: Uint32Array | null = null;
    // pass 0 counts the triangles per cell, pass 1 fills the lists
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < nt; k++) {
        const o = k * 9;
        const amin = Math.min(T[o + a], T[o + 3 + a], T[o + 6 + a]), amax = Math.max(T[o + a], T[o + 3 + a], T[o + 6 + a]);
        const zmin = Math.min(T[o + 2], T[o + 5], T[o + 8]), zmax = Math.max(T[o + 2], T[o + 5], T[o + 8]);
        const i0 = Math.max(0, Math.floor((amin - a0) / cs)), i1 = Math.min(na - 1, Math.floor((amax - a0) / cs));
        const j0 = Math.max(0, Math.floor((zmin - z0) / cs)), j1 = Math.min(nz - 1, Math.floor((zmax - z0) / cs));
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          if (pass === 0) counts[i * nz + j + 1]++;
          else idx![fill![i * nz + j]++] = k;
        }
      }
      if (pass === 0) {
        for (let c = 0; c < cells; c++) counts[c + 1] += counts[c];
        fill = counts.slice(0, cells);
        idx = new Uint32Array(counts[cells]);
      }
    }
    return [counts, idx!];
  }

  // Outermost skin point along a ray parallel to `axis` (1 = y: vertical, 0 = x: sideways)
  // through (u, z) where u is the other in-plane coordinate (x for vertical rays, y for
  // sideways). `max` picks the top (or +x side) surface. Returns false on a miss.
  cast(axis: 0 | 1, u: number, z: number, max: boolean, outP: THREE.Vector3, outN: THREE.Vector3): boolean {
    const vertical = axis === 1;
    const a = vertical ? 0 : 1;              // in-plane axis bucketed with z
    const a0 = vertical ? this.x0 : this.y0, na = vertical ? this.nx : this.ny;
    const i = Math.floor((u - a0) / this.cs), j = Math.floor((z - this.z0) / this.cs);
    if (i < 0 || j < 0 || i >= na || j >= this.nz) return false;
    const start = vertical ? this.xzStart : this.yzStart, list = vertical ? this.xzIdx : this.yzIdx;
    const c = i * this.nz + j;
    const T = this.tri;
    let best = max ? -1e9 : 1e9, bk = -1;
    for (let q = start[c]; q < start[c + 1]; q++) {
      const o = list[q] * 9;
      const ax = T[o + a], az = T[o + 2], bx = T[o + 3 + a], bz = T[o + 5], cx = T[o + 6 + a], cz = T[o + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (d > -1e-12 && d < 1e-12) continue;
      const l1 = ((bz - cz) * (u - cx) + (cx - bx) * (z - cz)) / d;
      const l2 = ((cz - az) * (u - cx) + (ax - cx) * (z - cz)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-5 || l2 < -1e-5 || l3 < -1e-5) continue;
      const h = l1 * T[o + axis] + l2 * T[o + 3 + axis] + l3 * T[o + 6 + axis];
      if (max ? h > best : h < best) { best = h; bk = o; }
    }
    if (bk < 0) return false;
    if (vertical) outP.set(u, best, z); else outP.set(best, u, z);
    const o = bk;
    _e1.set(T[o + 3] - T[o], T[o + 4] - T[o + 1], T[o + 5] - T[o + 2]);
    _e2.set(T[o + 6] - T[o], T[o + 7] - T[o + 1], T[o + 8] - T[o + 2]);
    outN.crossVectors(_e1, _e2).normalize();
    if ((outN.getComponent(axis) > 0) !== max) outN.negate();
    return true;
  }
}

const grids = new Map<string, SkinGrid>();

// ---------- scratch ----------
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _w = new THREE.Vector3();
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _l = new THREE.Vector3();
const _n2 = new THREE.Vector3();
const _f = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);
const R = () => Math.random() * 2 - 1;
const O: ParticleOpts = { pos: _w, life: 1, size0: 1, size1: 1, color0: C_GREY };

function emit(sys: ParticleSystem, pos: THREE.Vector3, vel: THREE.Vector3 | undefined, life: number, s0: number, s1: number,
  c0: [number, number, number], c1: [number, number, number] | undefined, a0: number, a1: number,
  frame: number, drag: number, rise: number, lit: boolean, rotVel?: number) {
  O.pos = pos; O.vel = vel; O.life = life; O.size0 = s0; O.size1 = s1; O.color0 = c0; O.color1 = c1;
  O.alpha0 = a0; O.alpha1 = a1; O.frame = frame; O.drag = drag; O.rise = rise; O.lit = lit; O.rotVel = rotVel;
  sys.spawn(O);
}

interface Decal { rim: THREE.Mesh; hole: THREE.Mesh; x: number }
interface Leak { p: THREE.Vector3; t: number; left: boolean }
interface Eng {
  zone: HitZone;
  x: number;               // nacelle x (model frame)
  smoke: THREE.Vector3;    // nacelle rear, on top of the wing
  exhaust: THREE.Vector3;  // behind the cowling, outboard
  fire: THREE.Vector3[];   // wing top samples behind the nacelle, nearest first
  fireDist: Float32Array;
  dead: boolean;
  deadT: number;
  feathered: boolean;
  fateCalled: boolean;
  spin: number;            // prop rate while dead (rad/s)
  angle: number;
  burnT: number;           // seconds the fire has been burning (spread)
  smoulder: number;        // s of smoke left after the fire went out
  scorches: number;
  spreadCalled: boolean;
  oilCalled: boolean;
  cough: number;
}

export class PlayerBomberDamage {
  lastHeavy = false;     // last hit on the player's ship was a cannon/flak hit (GunnerController)
  buzz = 0;              // 0..1 airframe vibration for the camera, already scaled by reducedShake
  reducedShake = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private raw = 0;
  private b: Bomber | null = null;
  private grid: SkinGrid | null = null;
  private skinMeshes: THREE.Mesh[] = [];
  private skinOrig: THREE.Material[] = [];
  private decals: Decal[] = [];
  private nextDecal = 0;
  private eng: Eng[] = [];
  private leaks: Leak[] = [];
  private acc = 0;
  private lightT = 0;
  private lastDecalT = -1;
  private flakVoids = 0;
  private stage = { tipL: 0, tipR: 0, tail: 0 };
  private calls = new Set<string>();
  private tailZone: HitZone | null = null;
  private tipZones: (HitZone | null)[] = [null, null];

  constructor(private world: World) {
    for (let i = 0; i < MAX_DECALS; i++) {
      const rim = new THREE.Mesh(RIM_GEOS[i % RIM_GEOS.length], RIM_MAT);
      const hole = new THREE.Mesh(HOLE_GEOS[(i * 3) % HOLE_GEOS.length], HOLE_MAT);
      rim.add(hole);
      rim.visible = false;
      rim.castShadow = hole.castShadow = false;
      rim.matrixAutoUpdate = hole.matrixAutoUpdate = false;
      this.decals.push({ rim, hole, x: 0 });
    }
  }

  // ---------- lifecycle ----------
  private attach(b: Bomber) {
    this.detach();
    this.b = b;
    // airframe skin meshes (GD-L: skin, engine: nacelles)
    const meshes: THREE.Mesh[] = [];
    const af = b.model.getObjectByName('airframe');
    af?.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    if (!meshes.length) return; // placeholder model: no visible damage
    const key = meshes.map((m) => m.geometry.uuid).join();
    let g = grids.get(key);
    if (!g) grids.set(key, g = new SkinGrid(meshes, b.model));
    this.grid = g;
    // the skin material: swapped for the shared void-capable clone
    for (const m of meshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (Array.isArray(mat) || !mat.isMeshStandardMaterial || mat.name === 'engine') continue;
      if (!voidMat || voidSrc !== mat) { voidMat = makeVoidMat(mat); voidSrc = mat; }
      this.skinMeshes.push(m); this.skinOrig.push(mat);
      m.material = voidMat;
    }
    for (let i = 0; i < VOIDS; i++) { voidA[i].set(0, 0, 0, -1e4); voidB[i].set(0, 0, 0, 0); }
    this.flakVoids = 0;
    this.stage.tipL = this.stage.tipR = this.stage.tail = 0;
    this.calls.clear();
    this.tailZone = b.zone('tail') ?? null;
    this.tipZones[0] = b.zone('wingLtip') ?? null;
    this.tipZones[1] = b.zone('wingRtip') ?? null;
    // engines: emitter points found on the skin once
    this.eng = [];
    for (const z of b.zones) {
      if (z.engine === undefined) continue;
      const x = z.offset.x, s = Math.sign(x);
      const smoke = new THREE.Vector3(x, z.offset.y + 0.6, 0.4);
      if (g.cast(1, x, 0.4, true, _p, _n)) smoke.copy(_p).addScaledVector(_n, 0.12);
      const fire: THREE.Vector3[] = [], dist: number[] = [];
      for (let k = 0; k < 64 && fire.length < 36; k++) {
        const fx = x + R() * 4.2, fz = -2.4 + Math.random() * 3.6;
        if (Math.abs(fx) < 1.6 || Math.abs(fx) > 14.5 || Math.sign(fx) !== s) continue;
        if (!g.cast(1, fx, fz, true, _p, _n) || _p.y < -1.2 || _p.y > 1.8 || _n.y < 0.5) continue;
        fire.push(_p.clone().addScaledVector(_n, 0.15));
        dist.push(Math.hypot(fx - x, (fz - 0.6) * 0.8));
      }
      const order = fire.map((_, k) => k).sort((p, q) => dist[p] - dist[q]);
      this.eng[z.engine] = {
        zone: z, x, smoke, exhaust: new THREE.Vector3(x + s * 0.55, z.offset.y + 0.05, z.offset.z - 0.2),
        fire: order.map((k) => fire[k]), fireDist: Float32Array.from(order.map((k) => dist[k])),
        dead: b.engineDead[z.engine], deadT: 99, feathered: true, fateCalled: true,
        spin: b.engineDead[z.engine] ? 0 : 70, angle: Math.random() * 6, burnT: 0, smoulder: 0, scorches: 0,
        spreadCalled: false, oilCalled: false, cough: 1 + Math.random(),
      };
    }
  }

  private detach() {
    for (const d of this.decals) { d.rim.removeFromParent(); d.rim.visible = false; d.hole.material = HOLE_MAT; d.rim.material = RIM_MAT; }
    this.nextDecal = 0;
    // give the old ship its plain skin back (if it is still about)
    this.skinMeshes.forEach((m, i) => { m.material = this.skinOrig[i]; });
    this.skinMeshes = []; this.skinOrig = [];
    this.leaks.length = 0;
    this.eng = [];
    this.b = null; this.grid = null;
    this.raw = this.buzz = 0;
  }

  reset() { this.detach(); }

  // Compile-warm the decal and skin materials: temporary meshes at `at`; returns cleanup.
  warmup(scene: THREE.Scene, at: THREE.Vector3): () => void {
    if (this.world.playerBomber && this.b !== this.world.playerBomber) this.attach(this.world.playerBomber);
    const objs: THREE.Object3D[] = [RIM_MAT, HOLE_MAT, SCORCH_MAT, EMBER_MAT].map((m) => new THREE.Mesh(RIM_GEOS[0], m));
    if (voidMat) objs.push(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), voidMat));
    objs.forEach((o, i) => { o.position.copy(at); o.position.x += i * 1.5; scene.add(o); });
    return () => objs.forEach((o) => { scene.remove(o); if (o instanceof THREE.Mesh && o.geometry.type === 'BoxGeometry') o.geometry.dispose(); });
  }

  // ---------- hits ----------
  // Called from World.onHit for every hit on the player's bomber (before the hit events).
  onHit(e: HitEvent) {
    this.lastHeavy = e.cannon;
    const b = this.b, g = this.grid;
    if (!b || !g || e.target !== b) return;
    const name = e.zone.name;
    if (name === 'nose' || name === 'cockpit' || name === 'fuselageFwd' || name === 'fuselageMid') return; // out of sight: the interior shows these
    const t = this.world.time;
    const big = e.cannon && (!e.shooter || e.damage > 8);
    if (!e.cannon && t - this.lastDecalT < 0.05) return; // sustained fire: cap the decal rate
    this.lastDecalT = t;
    // bullet direction in the model frame (flak: none)
    const flak = e.bulletVel.lengthSq() < 1;
    _qi.copy(b.quat).invert();
    if (flak) _d.set(R(), Math.random() < 0.5 ? -1 : 1, R()).normalize();
    else _d.copy(e.bulletVel).sub(b.vel).applyQuaternion(_qi).normalize();
    b.worldToLocal(e.point, _l);
    const zo = e.zone.offset;
    const lateral = name === 'fuselageAft' || (name === 'tail' && Math.abs(_l.x) < 0.9 && _l.y > 0.9);
    const axis: 0 | 1 = lateral ? 0 : 1;
    const entryMax = lateral ? _d.x < 0 : _d.y < 0; // moving down -> enters through the top
    // the zone sphere is fatter than the skin: walk the point in toward the zone centre until it lands
    let hit = false;
    for (let k = 0; k < 4 && !hit; k++) {
      const f = k / 3;
      _v.lerpVectors(_l, zo, f);
      if (k) { _v.x += R() * 0.3 * (1 - f); _v.z += R() * 0.3 * (1 - f); }
      hit = g.cast(axis, lateral ? _v.y : _v.x, _v.z, entryMax, _p, _n);
    }
    if (!hit) return;
    const wing = name.startsWith('wing') || name.startsWith('engine');
    if (big && wing && this.flakVoids < VOIDS - V_FLAK) {
      // flak/rocket: a hole you can see the sky through, ragged and charred
      const r = 0.2 + Math.random() * 0.18;
      this.setVoid(V_FLAK + this.flakVoids++, _p, r, 0, 0, 0, 0.16);
      this.clearDecalsNear(_p, r + 0.15);
      this.ringOfHoles(axis, _p, r, entryMax);
      this.world.effects.spawnDebris(e.point, b.vel, 3, false);
    } else {
      const r = e.cannon ? 0.16 + Math.random() * 0.12 : 0.06 + Math.random() * 0.035;
      this.placeDecal(_p, _n, r, e.cannon ? 0.7 : 0.58);
      // exit hole on the far side, petalled outward (wings and stabilisers: thin skin)
      if (!lateral && g.cast(axis, _p.x + _d.x * 0.15, _p.z + _d.z * 0.15, !entryMax, _w, _n)) this.placeDecal(_w, _n, r * 1.35, 0.5);
    }
    // radio: first hits in a wing / the tail
    if (wing) {
      const left = _p.x > 0;
      this.say(left ? 'whL' : 'whR', 'Top Turret', `We're taking hits in the ${left ? 'left' : 'right'} wing!`, 1);
    } else if (name === 'tail') this.say('whT', 'Tail', 'Tail\'s getting chewed up back here!', 1);
    // holed wing tank: fuel vapour
    if (/^wing/.test(name) && this.leaks.length < MAX_LEAKS && Math.random() < (e.cannon ? 0.3 : 0.025)) this.startLeak(_p.x, _p.z);
  }

  private setVoid(i: number, c: THREE.Vector3, r: number, hx: number, hy: number, hz: number, jag: number) {
    voidA[i].set(c.x, c.y, c.z, r);
    voidB[i].set(hx, hy, hz, jag);
  }

  private ringOfHoles(axis: 0 | 1, c: THREE.Vector3, r: number, max: boolean) {
    const g = this.grid!;
    const n = 3 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, d = r + 0.15 + Math.random() * 0.5;
      const u = (axis === 1 ? c.x : c.y) + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (g.cast(axis, u, z, max, _w, _n2)) this.placeDecal(_w, _n2, 0.05 + Math.random() * 0.06, 0.6);
    }
  }

  private placeDecal(p: THREE.Vector3, n: THREE.Vector3, r: number, holeK: number, scorch = false) {
    const b = this.b!;
    const d = this.decals[this.nextDecal];
    this.nextDecal = (this.nextDecal + 1) % MAX_DECALS;
    const rim = d.rim;
    if (rim.parent !== b.model) b.model.add(rim);
    rim.visible = true;
    rim.material = scorch ? SCORCH_MAT : RIM_MAT;
    rim.geometry = scorch ? SCORCH_GEOS[Math.floor(Math.random() * 2)] : RIM_GEOS[Math.floor(Math.random() * RIM_GEOS.length)];
    rim.position.copy(p).addScaledVector(n, scorch ? 0.008 : 0.012);
    rim.quaternion.setFromUnitVectors(_z, n).multiply(_q.setFromAxisAngle(_z, Math.random() * Math.PI * 2));
    rim.scale.set(r * (1 + Math.random() * 0.45), r, 1);
    rim.updateMatrix();
    d.hole.visible = !scorch;
    d.hole.material = HOLE_MAT;
    d.hole.position.set(0, 0, 0.004);
    d.hole.rotation.z = Math.random() * Math.PI;
    d.hole.scale.set(holeK, holeK * (0.75 + Math.random() * 0.4), 1);
    d.hole.updateMatrix();
    d.x = p.x;
  }

  private clearDecalsNear(c: THREE.Vector3, r: number) {
    for (const d of this.decals) if (d.rim.visible && d.rim.position.distanceTo(c) < r) d.rim.visible = false;
  }

  private startLeak(x: number, z: number) {
    const left = x > 0;
    let side = 0;
    for (const l of this.leaks) if (l.left === left) side++;
    if (side >= 2) return;
    const lx = Math.sign(x || 1) * THREE.MathUtils.clamp(Math.abs(x), 2.2, 12.5);
    // underside, toward the trailing edge where the tank vents
    if (!this.grid!.cast(1, lx, Math.min(z, 0.2), false, _w, _n)) return;
    this.leaks.push({ p: _w.clone().addScaledVector(_n, 0.05), t: 0, left });
    this.say(left ? 'fuelL' : 'fuelR', 'Ball Turret', `Ball turret to pilot: we're streaming fuel from the ${left ? 'left' : 'right'} wing tank!`, 2);
  }

  // Wind-blown flecks inside the fuselage after a hit: insulation, paint chips, dust.
  // `pos` and `inward` are world space. Event-only.
  interiorDebris(pos: THREE.Vector3, inward: THREE.Vector3, n: number) {
    const b = this.b;
    if (!b) return;
    const fx = this.world.effects;
    if (fx.smoke.count > SMOKE_HARD) return;
    b.forward(_f);
    for (let i = 0; i < n; i++) {
      // carried along with the ship, blown in through the hole and swirled aft
      _v.copy(b.vel).addScaledVector(inward, 1.5 + Math.random() * 3).addScaledVector(_f, -0.6 - Math.random() * 1.6);
      _v.x += R() * 0.9; _v.y += R() * 0.9; _v.z += R() * 0.9;
      const k = Math.random();
      emit(fx.smoke, pos, _v, 0.9 + Math.random() * 1.4, 0.02 + Math.random() * 0.035, 0.015, k < 0.45 ? C_FLUFF : k < 0.75 ? C_CHIP : C_FRAG,
        undefined, 1, 0.5, 0, 0, -1.5, true, (Math.random() - 0.5) * 14);
    }
    // a puff of dust and paint
    _v.copy(b.vel).addScaledVector(inward, 1.2);
    emit(fx.smoke, pos, _v, 1.1, 0.08, 0.6, C_CHIP, undefined, 0.45, 0, 0, 0, 0, true);
  }

  // ---------- per frame ----------
  // Called from World.update, after the aircraft have moved (props already spun).
  update(dt: number) {
    const w = this.world, pb = w.playerBomber;
    if (pb !== this.b) { if (pb && !pb.remove) this.attach(pb); else this.detach(); }
    const b = this.b;
    if (!b || b.remove || !this.grid || dt <= 0) return;
    const t = w.time;

    // engines: deaths, props, fire timers
    let windmills = 0, burning = 0;
    for (let i = 0; i < this.eng.length; i++) {
      const e = this.eng[i];
      if (!e) continue;
      if (b.engineDead[i] && !e.dead) this.engineDied(e, i);
      if (e.dead) {
        e.deadT += dt;
        if (!e.fateCalled && e.deadT > 2.6 && b.alive) {
          e.fateCalled = true;
          if (e.feathered) this.say('feath' + i, 'Pilot', `Number ${i + 1} feathered. Watch your fuel, engineer.`, 2);
          else this.say('wmill' + i, 'Pilot', `Number ${i + 1} won't feather — she's windmilling! Hang on, she's going to shake!`, 2);
        }
        // prop: spins down to a stop (feathered) or keeps windmilling in the slipstream
        const target = e.feathered ? 0 : b.alive ? 7.5 : 4;
        e.spin += (target - e.spin) * (1 - Math.exp(-dt / (e.feathered ? 0.9 : 1.6)));
        e.angle += e.spin * dt;
        const p = b.props[i];
        if (p) {
          p.node.quaternion.copy(p.base).multiply(_q.setFromAxisAngle(_z, e.angle));
          p.disc.visible = e.spin > 20;
        }
        if (!e.feathered) windmills++;
      }
      if (e.zone.burning) {
        e.burnT = Math.min(40, e.burnT + dt);
        e.smoulder = 7;
        burning++;
        // a leak on the same wing feeds the fire
        for (const l of this.leaks) if (l.left === e.x > 0 && Math.abs(l.p.x - e.x) < 4.5) e.burnT += dt * 0.6;
        if (!e.spreadCalled && e.burnT > 6 && b.alive) {
          e.spreadCalled = true;
          this.say('spread' + i, 'Top Turret', `Fire's spreading along the ${e.x > 0 ? 'left' : 'right'} wing! Hit it again!`, 2);
        }
        // scorch marks left by the spreading fire
        const marks = e.burnT > 1.5 ? 1 + Math.floor(e.burnT / 3.5) : 0;
        if (marks > e.scorches && e.scorches < 8 && e.fire.length) {
          e.scorches++;
          const k = Math.floor(Math.random() * this.reach(e));
          _p.copy(e.fire[k]).addScaledVector(_l.set(0, -1, 0), 0.15);
          this.placeDecal(_p, _n.set(0, 1, 0), 0.5 + Math.random() * 0.5, 0, true);
          // holes inside the burning patch glow like embers
          for (const d of this.decals) if (d.rim.visible && d.hole.visible && d.rim.position.distanceTo(_p) < 1.4) d.hole.material = EMBER_MAT;
        }
      } else {
        e.burnT = Math.max(0, e.burnT - dt * 2);
        e.smoulder = Math.max(0, e.smoulder - dt);
      }
      if (!e.oilCalled && !e.dead && e.zone.hp < e.zone.maxHp * 0.5 && b.alive) {
        e.oilCalled = true;
        this.say('oil' + i, 'Top Turret', `Number ${i + 1}'s throwing oil! She's smoking bad!`, 2);
      }
    }

    // embers glow while a fire burns, and cool once it is out
    let heat = 0;
    for (const e of this.eng) if (e) heat = Math.max(heat, e.zone.burning ? 1 : e.smoulder / 7);
    EMBER_MAT.emissiveIntensity = heat * (0.7 + 0.3 * Math.sin(t * 23) * Math.sin(t * 7.3));

    // big damage: wingtips, stabilisers, fin
    this.bigDamage(b);

    // fuel leaks age (a self-sealing tank slowly closes, or the tank runs dry)
    for (let i = this.leaks.length - 1; i >= 0; i--) if ((this.leaks[i].t += dt) > 150) this.leaks.splice(i, 1);

    // airframe buzz: dead engines, a windmilling prop, a shot-up tail
    const tail = this.tailZone;
    const tailDmg = tail ? 1 - Math.max(0, tail.hp) / tail.maxHp : 0;
    const target = Math.min(1, b.enginesOut * 0.27 + windmills * 0.2 + Math.max(0, tailDmg - 0.4) * 0.5 + (burning ? 0.08 : 0));
    this.raw += (target - this.raw) * (1 - Math.exp(-dt * 1.5));
    this.buzz = this.raw * (this.reducedShake ? 0.25 : 1);

    // emitters
    const dist = w.listener ? b.pos.distanceTo(w.listener) : 0;
    if (dist > FAR) return;
    this.acc += dt;
    if (this.acc < TICK) return;
    const step = this.acc;
    this.acc = 0;
    this.emitAll(b, step, dist);
  }

  // How many fire samples the flames have reached on this engine's wing
  private reach(e: Eng) {
    const r = 0.8 + e.burnT * 0.3;
    let k = 0;
    while (k < e.fireDist.length && e.fireDist[k] < r) k++;
    return Math.max(1, k);
  }

  private engineDied(e: Eng, i: number) {
    const b = this.b!;
    e.dead = true;
    e.deadT = 0;
    e.feathered = Math.random() < 0.7;
    e.fateCalled = !b.alive;
    e.spin = 70;
    // the engine seizes: a cough of flame and a gout of black oil smoke
    const fx = this.world.effects;
    b.localToWorld(e.exhaust, _w);
    emit(fx.glow, _w, b.vel, 0.3, 1.2, 3, C_POP, C_FLAME1, 1, 0, 2, 0, 0, false, 2);
    _v.copy(b.vel).multiplyScalar(0.8);
    for (let k = 0; k < 6; k++) {
      _n.set(R(), R() + 0.4, R()).multiplyScalar(3).add(_v);
      emit(fx.smoke, _w, _n, 3.5, 0.8, 5, C_OIL, C_OIL1, 0.9, 0, 0, 0.8, 0.3, true);
    }
    if (this.world.player === b) sound.engineFail(i);
  }

  private bigDamage(b: Bomber) {
    const g = this.grid!;
    for (let side = 0; side < 2; side++) {
      const left = side === 0;
      const z = this.tipZones[side];
      if (!z) continue;
      const f = Math.max(0, z.hp) / z.maxHp, s = left ? 1 : -1;
      const st = left ? this.stage.tipL : this.stage.tipR;
      const want = z.hp <= 0 ? 2 : f < 0.4 ? 1 : 0;
      if (want <= st) continue;
      if (left) this.stage.tipL = want; else this.stage.tipR = want;
      const slot = left ? V_TIP_L : V_TIP_R;
      if (want === 1) {
        // a bite out of the trailing edge near the tip
        if (!g.cast(1, s * 13.6, -1.4, true, _p, _n)) _p.set(s * 13.6, 0.9, -1.4);
        this.setVoid(slot, _p, 0.75, 0, 0, 0, 0.3);
        this.clearDecalsNear(_p, 1.1);
      } else {
        // the tip is gone outboard of ~13.3 m: a box over the end of the wing, torn edge
        _p.set(s * 15.6, 1, -0.6);
        this.setVoid(slot, _p, 0, 2.3, 2.5, 4, 0.42);
        for (const d of this.decals) if (d.rim.visible && d.x * s > 12.9) d.rim.visible = false;
        b.localToWorld(_l.set(s * 13.6, 0.8, -0.6), _w);
        this.world.effects.spawnDebris(_w, b.vel, 7, false);
        this.world.effects.sparks(_w, b.vel, true);
        this.say(left ? 'tipL' : 'tipR', 'Top Turret', `The ${left ? 'left' : 'right'} wingtip's gone — shot clean off!`, 2);
      }
    }
    const tail = this.tailZone;
    if (!tail) return;
    const f = Math.max(0, tail.hp) / tail.maxHp;
    const want = f < 0.25 ? 2 : f < 0.5 ? 1 : 0;
    if (want <= this.stage.tail) return;
    const first = this.stage.tail === 0;
    this.stage.tail = want;
    const side = Math.random() < 0.5 ? 1 : -1;
    const bite = (slot: number, s: number) => {
      // ragged bite out of the stabiliser / elevator trailing edge
      let found = false;
      for (let z = -16.4; z < -13 && !found; z += 0.25) found = g.cast(1, s * 4.2, z, true, _p, _n);
      if (!found) _p.set(s * 4.2, 1.2, -15.6);
      _p.z += 0.35;
      this.setVoid(slot, _p, 0.62, 0.3, 0, 0.15, 0.26);
      this.clearDecalsNear(_p, 1);
      b.localToWorld(_p, _w);
      this.world.effects.spawnDebris(_w, b.vel, 4, false);
    };
    if (first) bite(side > 0 ? V_STAB_L : V_STAB_R, side);
    if (want === 2) {
      bite(side > 0 ? V_STAB_R : V_STAB_L, -side);
      // the top of the fin shot away
      _p.set(0, 4.45, -14.9);
      this.setVoid(V_FIN, _p, 0.55, 0, 0.1, 0.25, 0.22);
      this.clearDecalsNear(_p, 0.9);
    }
    this.say('stab' + want, 'Tail', want === 1 ? 'Tail to pilot: the stabiliser\'s shot to pieces back here!' : 'Tail\'s half gone! The fin\'s shot up — rudder\'s hanging by a thread!', 2);
  }

  private say(key: string, who: string, text: string, priority: number) {
    if (this.calls.has(key) || !this.b?.alive || this.world.player !== this.b) return;
    this.calls.add(key);
    this.world.callout('pbd' + key, who, text, 30, priority);
  }

  private emitAll(b: Bomber, step: number, dist: number) {
    const fx = this.world.effects;
    const smokeOk = fx.smoke.count < SMOKE_HARD && (fx.smoke.count < SMOKE_SOFT || Math.random() < 0.5);
    const glowOk = fx.glow.count < GLOW_HARD;
    const near = dist < 400;
    this.lightT -= step;
    for (let i = 0; i < this.eng.length; i++) {
      const e = this.eng[i];
      if (!e) continue;
      const dmg = 1 - Math.max(0, e.zone.hp) / e.zone.maxHp;
      b.localToWorld(e.smoke, _w);
      // oil smoke creeping back over the nacelle: carried with the ship, then left behind
      _v.copy(b.vel).multiplyScalar(0.96);
      _v.y += 0.4;
      if (smokeOk && near) {
        if (!e.dead && dmg > 0.3 && Math.random() < 0.35 + dmg * 0.6) {
          emit(fx.smoke, _w, _v, 1.8, 0.35, 2.6 * (0.5 + dmg), C_OIL, C_OIL1, 0.25 + 0.5 * dmg, 0, 0, 0.35, 0.2, true);
        } else if (e.dead && (e.deadT < 12 || !e.feathered) && Math.random() < (e.deadT < 12 ? 0.7 - e.deadT * 0.04 : 0.3)) {
          // a dead engine keeps bleeding oil for a while; a windmilling one never quite stops
          emit(fx.smoke, _w, _v, 1.6, 0.3, 2.2, e.deadT < 12 ? C_OIL : C_GREY, C_GREY1, 0.45, 0, 0, 0.35, 0.2, true);
        }
      }
      // coughing engine: flame pops out of the stacks, a fat black puff
      if (!e.dead && dmg > 0.6) {
        e.cough -= step;
        if (e.cough <= 0) {
          e.cough = 0.5 + Math.random() * 1.3;
          b.localToWorld(e.exhaust, _p);
          if (glowOk) emit(fx.glow, _p, b.vel, 0.12, 0.6, 1.4, C_POP, C_FLAME1, 1, 0, 2, 0, 0, false, 2);
          if (smokeOk) for (let k = 0; k < 3; k++) {
            _n.set(R(), R(), R()).multiplyScalar(1.5).add(_v);
            emit(fx.smoke, _p, _n, 2.5, 0.5, 3, C_OIL, C_OIL1, 0.8, 0, 0, 0.6, 0.3, true);
          }
        }
      }
      if (e.zone.burning) {
        // flames licking back off the nacelle...
        if (glowOk) {
          _p.copy(_w); _p.x += R() * 0.3; _p.y += Math.random() * 0.2;
          _n.copy(b.vel).multiplyScalar(0.9); _n.y += 1;
          emit(fx.glow, _p, _n, 0.22 + Math.random() * 0.15, 0.6 + Math.random() * 0.4, 0.2, C_LICK, C_LICK1, 0.9, 0, 2, 0, 0, false, 3);
        }
        // ...and spreading over the wing while nobody puts it out
        if (e.fire.length) {
          const reach = this.reach(e);
          const n = 1 + Math.min(3, Math.floor(reach / 7));
          for (let k = 0; k < n; k++) {
            b.localToWorld(e.fire[Math.floor(Math.random() * reach)], _p);
            _n.copy(b.vel).multiplyScalar(0.93); _n.y += 1.2;
            if (glowOk) emit(fx.glow, _p, _n, 0.25 + Math.random() * 0.2, 0.35 + Math.random() * 0.45, 0.12, C_LICK, C_LICK1, 0.85, 0, 2, 0, 0, false, 3);
            if (smokeOk && Math.random() < 0.35) {
              _n.copy(b.vel).multiplyScalar(0.55);
              emit(fx.smoke, _p, _n, 4, 0.8, 6, C_COLUMN, C_OIL1, 0.75, 0, 0, 0.6, 0.3, true);
            }
          }
        }
        // the fire lights up the wing and the gunner's window
        if (this.lightT <= 0 && near) {
          this.lightT = 0.14;
          b.localToWorld(_l.copy(e.smoke).setY(e.smoke.y + 0.8), _p);
          fx.flashLight(_p, 90 + Math.random() * 70 + e.burnT * 3, 0.17, 0xff7a30);
        }
      } else if (e.smoulder > 0 && smokeOk && Math.random() < e.smoulder / 7) {
        emit(fx.smoke, _w, _v, 2.5, 0.4, 3, C_GREY, C_GREY1, 0.4, 0, 0, 0.4, 0.3, true);
      }
    }
    // fuel vapour: a thin white stream from each holed tank
    if (smokeOk) for (const l of this.leaks) {
      const rate = Math.exp(-l.t / 90);
      b.localToWorld(l.p, _w);
      // fast-moving and thin, so the puffs string out into a ribbon behind the wing
      for (let k = 0; k < 4; k++) {
        if (Math.random() > 0.4 + 0.6 * rate) continue;
        _v.copy(b.vel).multiplyScalar(0.55 + Math.random() * 0.1);
        _v.x += R() * 0.4; _v.y += -0.8 + R() * 0.4; _v.z += R() * 0.4;
        _p.copy(_w).addScaledVector(b.vel, -Math.random() * step); // spread over the tick: no gaps
        emit(fx.smoke, _p, _v, 1.1 + Math.random() * 0.5, 0.1, 0.9 + 0.5 * rate, C_FUEL, C_FUEL1, 0.22 * (0.4 + 0.6 * rate), 0, 0, 0.5, 0, true);
      }
    }
  }
}
