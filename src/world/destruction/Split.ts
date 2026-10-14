import * as THREE from 'three';
import { classify, CORE, jointOf, kindSpec, layoutFrom, PART_COUNT, PART_NAMES, type Layout } from './Parts';
import { mulberry } from './FailureModel';

// Cuts a model's airframe into its structural parts, once per model kind, by triangle: every
// triangle goes to the part its centroid lies in (Parts.classify), so the torn edges follow the
// real mesh, ragged like torn skin. Each part keeps the source primitives' vertex buffers (shared
// BufferAttributes: one GPU copy) with an index of its own, plus a reversed-winding copy drawn in a
// dark material: the inside of the skin, seen through the hole where a part has come off.
// Explosions shatter a part further into shards (seeded clusters of its triangles).
//
// Hero models may name their parts instead (docs/phase10/09-parts-contract.md): meshes under a
// node `part_<name>` belong to that part whole; `joint_<name>` and `fuel_<name>` empties mark the
// joint and the tank.

export interface Sub {
  src: number;                 // index of the source primitive (sourceMeshes order)
  geo: THREE.BufferGeometry;   // the triangles
  inner: THREE.BufferGeometry; // the same, reversed: the inside of the skin
  toModel: THREE.Matrix4;      // source mesh -> model frame (unscaled)
}

// A piece's geometry, mass properties and aero plates (model frame, real metres and kg)
export interface Chunk {
  subs: Sub[];
  com: THREE.Vector3;
  area: number;        // skin area (m^2)
  mass: number;
  inertia: THREE.Vector3;   // principal moments about the centre of mass (body axes)
  ax: number; ay: number; az: number;   // projected areas along x, y, z (m^2)
  chord: number;       // fore-aft extent (m)
  size: number;        // bounding radius about the centre of mass (m)
  tris: number;
  u2: THREE.Vector3;   // per-unit-mass second moments about the model origin (sum x^2, y^2, z^2)
}

export interface PartData extends Chunk {
  joint: THREE.Vector3;    // where it meets its parent
  fuel: THREE.Vector3;     // its tank (the centre of mass when none is marked)
  shards: Chunk[];         // what it shatters into
}

export interface SplitModel {
  kind: string;
  layout: Layout;
  parts: PartData[];
  srcCount: number;
  hero: boolean;
  /** Named non-airframe nodes (pilot, glass, prop_N, ...) -> part. */
  nodePart: Map<string, number>;
  /** The part a model-frame point belongs to (hit location). */
  classify(x: number, y: number, z: number): number;
}

interface Tris {
  cx: Float32Array; cy: Float32Array; cz: Float32Array; area: Float32Array;
  nx: Float32Array; ny: Float32Array; nz: Float32Array;
  idx: ArrayLike<number> | null; count: number; toModel: THREE.Matrix4;
}
type Sel = (s: number, i: number) => boolean;

const SHARDS = [7, 3, 3, 5, 2, 5, 2];   // per part
const SKIP = /^(prop_|glass|pilot|cooling|eye_|muzzle_|interior|window_|crew|turret_|gun_)/;
const cache = new Map<string, SplitModel>();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();
const _m = new THREE.Matrix4(), _box = new THREE.Box3();

export function cachedSplit(kind: string) { return cache.get(kind) ?? null; }

/** The split of this model kind, made from `model` (any instance of the kind) on first use. */
export function splitOf(kind: string, model: THREE.Object3D): SplitModel {
  let s = cache.get(kind);
  if (!s) { s = build(kind, model); cache.set(kind, s); }
  return s;
}

/** Airframe meshes in a fixed traversal order (the same for every clone of a model). part >= 0:
 *  named by a part_<name> node (hero models). */
export function sourceMeshes(model: THREE.Object3D): { mesh: THREE.Mesh; part: number }[] {
  const out: { mesh: THREE.Mesh; part: number }[] = [];
  const named: [THREE.Object3D, number][] = [];
  model.traverse((o) => { const m = /^part_(\w+)$/.exec(o.name); const i = m ? PART_NAMES.indexOf(m[1] as any) : -1; if (i >= 0) named.push([o, i]); });
  if (named.length) {
    for (const [node, part] of named) node.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.destructionPiece) out.push({ mesh: o as THREE.Mesh, part }); });
    return out;
  }
  let airframe: THREE.Object3D | null = null;
  model.traverse((o) => { if (!airframe && o.name === 'airframe') airframe = o; });
  (airframe ?? model).traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.destructionPiece || m.geometry?.type === 'CircleGeometry' || !m.geometry?.getAttribute('position')) return;
    for (let p: THREE.Object3D | null = m; p && p !== model; p = p.parent) if (SKIP.test(p.name)) return;
    const mat = m.material as THREE.Material;
    if (!Array.isArray(m.material) && mat?.transparent) return;
    if (!airframe && m.parent !== model) return;   // placeholder models are flat; skip added props
    out.push({ mesh: m, part: -1 });
  });
  return out;
}

function chunk(): Chunk {
  return { subs: [], com: new THREE.Vector3(), area: 0, mass: 0, inertia: new THREE.Vector3(1, 1, 1), ax: 0, ay: 0, az: 0, chord: 1, size: 1, tris: 0, u2: new THREE.Vector3() };
}

/** Give a chunk its mass: inertia about its centre of mass from the skin's distribution. */
export function setMass(c: Chunk, mass: number) {
  c.mass = Math.max(mass, 1);
  const m = c.mass, x2 = c.u2.x - c.com.x * c.com.x, y2 = c.u2.y - c.com.y * c.com.y, z2 = c.u2.z - c.com.z * c.com.z;
  // floor: a flat panel still has some thickness
  const f = 0.02 * Math.max(c.size * c.size, 0.25);
  c.inertia.set(m * (Math.max(y2, f) + Math.max(z2, f)), m * (Math.max(x2, f) + Math.max(z2, f)), m * (Math.max(x2, f) + Math.max(y2, f)));
}

function build(kind: string, model: THREE.Object3D): SplitModel {
  model.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const srcs = sourceMeshes(model);
  const hero = srcs.length > 0 && srcs[0].part >= 0;
  // triangle centroids, areas and normals in the model frame, and the model's extent
  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const tri: Tris[] = [];
  for (const { mesh } of srcs) {
    const geo = mesh.geometry, pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const toModel = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    const idx = geo.index ? geo.index.array : null;
    const count = Math.floor((idx ? idx.length : pos.count) / 3);
    const F = () => new Float32Array(count);
    const t: Tris = { cx: F(), cy: F(), cz: F(), area: F(), nx: F(), ny: F(), nz: F(), idx, count, toModel };
    for (let i = 0; i < count; i++) {
      _a.fromBufferAttribute(pos, idx ? idx[i * 3] : i * 3).applyMatrix4(toModel);
      _b.fromBufferAttribute(pos, idx ? idx[i * 3 + 1] : i * 3 + 1).applyMatrix4(toModel);
      _c.fromBufferAttribute(pos, idx ? idx[i * 3 + 2] : i * 3 + 2).applyMatrix4(toModel);
      for (const v of [_a, _b, _c]) { box.minX = Math.min(box.minX, v.x); box.maxX = Math.max(box.maxX, v.x); box.minZ = Math.min(box.minZ, v.z); box.maxZ = Math.max(box.maxZ, v.z); }
      t.cx[i] = (_a.x + _b.x + _c.x) / 3; t.cy[i] = (_a.y + _b.y + _c.y) / 3; t.cz[i] = (_a.z + _b.z + _c.z) / 3;
      _b.sub(_a); _c.sub(_a); _n.crossVectors(_b, _c);
      const a2 = _n.length();
      t.area[i] = a2 / 2;
      if (a2 > 0) { t.nx[i] = _n.x / a2; t.ny[i] = _n.y / a2; t.nz[i] = _n.z / a2; }
    }
    tri.push(t);
  }
  if (!Number.isFinite(box.minX)) { box.minX = -5; box.maxX = 5; box.minZ = -4; box.maxZ = 4; }
  const spec = kindSpec(kind);
  const layout = layoutFrom(spec.shares, box);

  // the part of every triangle
  const partOf = tri.map((t, s) => {
    const out = new Uint8Array(t.count);
    for (let i = 0; i < t.count; i++) out[i] = hero ? srcs[s].part : classify(t.cx[i], t.cy[i], t.cz[i], layout);
    return out;
  });
  let shareSum = 0;
  for (let p = 0; p < PART_COUNT; p++) shareSum += spec.massShare[p];
  const parts: PartData[] = [];
  for (let p = 0; p < PART_COUNT; p++) {
    const sel: Sel = (s, i) => partOf[s][i] === p;
    const c = Object.assign(chunk(), { joint: new THREE.Vector3(), fuel: new THREE.Vector3(), shards: [] as Chunk[] });
    measure(c, tri, sel);
    setMass(c, (spec.mass * spec.massShare[p]) / shareSum);
    makeGeo(c, srcs, tri, sel);
    jointOf(p, layout, c.com, c.joint);
    c.fuel.copy(c.com);
    parts.push(c);
  }
  // hero markers: joints and tanks
  model.traverse((o) => {
    const m = /^(joint|fuel)_(\w+)$/.exec(o.name);
    const p = m ? PART_NAMES.indexOf(m[2] as any) : -1;
    if (p < 0) return;
    const at = new THREE.Vector3().setFromMatrixPosition(_m.multiplyMatrices(inv, o.matrixWorld));
    (m![1] === 'joint' ? parts[p].joint : parts[p].fuel).copy(at);
  });
  // shards: each triangle of a part goes to the nearest of a few seeded seed triangles
  const rnd = mulberry(hash(kind));
  for (let p = 0; p < PART_COUNT; p++) {
    const part = parts[p];
    if (part.tris < 8) continue;
    const k = Math.min(SHARDS[p], Math.max(1, Math.floor(part.tris / 12)));
    const seeds: number[] = [];
    for (let j = 0; j < 400 && seeds.length < k * 3; j++) {
      const s = Math.floor(rnd() * tri.length), t = tri[s];
      if (!t.count) continue;
      const i = Math.floor(rnd() * t.count);
      if (partOf[s][i] === p) seeds.push(t.cx[i], t.cy[i], t.cz[i]);
    }
    const ns = seeds.length / 3;
    const owner = tri.map((t, s) => {
      const o = new Uint8Array(t.count).fill(255);
      for (let i = 0; i < t.count; i++) {
        if (partOf[s][i] !== p) continue;
        let best = 0, bd = Infinity;
        for (let j = 0; j < ns; j++) {
          const dx = t.cx[i] - seeds[j * 3], dy = t.cy[i] - seeds[j * 3 + 1], dz = t.cz[i] - seeds[j * 3 + 2];
          const d = dx * dx + dy * dy + dz * dz;
          if (d < bd) { bd = d; best = j; }
        }
        o[i] = best;
      }
      return o;
    });
    for (let j = 0; j < ns; j++) {
      const sel: Sel = (s, i) => owner[s][i] === j;
      const c = chunk();
      measure(c, tri, sel);
      if (!c.tris) continue;
      setMass(c, (part.mass * c.area) / Math.max(part.area, 1e-6));
      makeGeo(c, srcs, tri, sel);
      part.shards.push(c);
    }
  }
  // named nodes (pilot, glass, props, ...) -> part
  const nodePart = new Map<string, number>();
  for (const child of model.children) {
    if (!child.name || child.name === 'airframe' || /^(part|joint|fuel)_/.test(child.name)) continue;
    const bb = new THREE.Box3();
    child.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (!(o as THREE.Mesh).isMesh || !g) return;
      if (!g.boundingBox) g.computeBoundingBox();
      bb.union(_box.copy(g.boundingBox!).applyMatrix4(_m.multiplyMatrices(inv, o.matrixWorld)));
    });
    const at = bb.isEmpty() ? _a.setFromMatrixPosition(_m.multiplyMatrices(inv, child.matrixWorld)) : bb.getCenter(_a);
    nodePart.set(child.name, /^(pilot|glass|eye_|interior)/.test(child.name) ? CORE : classify(at.x, at.y, at.z, layout));
  }
  const boxes = parts.map((_, p) => {
    const b = new THREE.Box3();
    for (let s = 0; s < tri.length; s++) for (let i = 0; i < tri[s].count; i++) if (partOf[s][i] === p) b.expandByPoint(_a.set(tri[s].cx[i], tri[s].cy[i], tri[s].cz[i]));
    return b;
  });
  const heroClassify = (x: number, y: number, z: number) => {
    let best = -1, bv = Infinity;
    _c.set(x, y, z);
    for (let p = 0; p < PART_COUNT; p++) {
      const b = boxes[p];
      if (b.isEmpty() || b.distanceToPoint(_c) > 0.4) continue;
      const sz = b.getSize(_b), v = sz.x * sz.y * sz.z;
      if (v < bv) { bv = v; best = p; }
    }
    return best >= 0 ? best : classify(x, y, z, layout);
  };
  return { kind, layout, parts, srcCount: srcs.length, hero, nodePart, classify: hero ? heroClassify : (x, y, z) => classify(x, y, z, layout) };
}

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// Area, centroid, second moments and projected areas of the triangles a selector picks
function measure(c: Chunk, tri: Tris[], sel: Sel) {
  let A = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, xx = 0, yy = 0, zz = 0, n = 0, minZ = Infinity, maxZ = -Infinity;
  for (let s = 0; s < tri.length; s++) {
    const t = tri[s];
    let used = false;
    for (let i = 0; i < t.count; i++) {
      if (!sel(s, i)) continue;
      const a = t.area[i];
      used = true; n++;
      A += a; cx += t.cx[i] * a; cy += t.cy[i] * a; cz += t.cz[i] * a;
      xx += t.cx[i] * t.cx[i] * a; yy += t.cy[i] * t.cy[i] * a; zz += t.cz[i] * t.cz[i] * a;
      ax += Math.abs(t.nx[i]) * a; ay += Math.abs(t.ny[i]) * a; az += Math.abs(t.nz[i]) * a;
      minZ = Math.min(minZ, t.cz[i]); maxZ = Math.max(maxZ, t.cz[i]);
    }
    if (used) c.subs.push({ src: s, geo: null as unknown as THREE.BufferGeometry, inner: null as unknown as THREE.BufferGeometry, toModel: new THREE.Matrix4().copy(t.toModel) });
  }
  c.tris = n; c.area = A;
  if (A <= 0) return;
  c.com.set(cx / A, cy / A, cz / A);
  c.u2.set(xx / A, yy / A, zz / A);
  // a closed skin is seen from both sides: half its area projects onto each view
  c.ax = ax / 2; c.ay = ay / 2; c.az = az / 2;
  c.chord = Math.max(0.3, maxZ - minZ);
  c.size = Math.sqrt(Math.max(0.01, c.u2.x + c.u2.y + c.u2.z - c.com.lengthSq())) * 1.7;
}

// Index buffers (and reversed copies) for the triangles a selector picks, per source primitive
function makeGeo(c: Chunk, srcs: { mesh: THREE.Mesh }[], tri: Tris[], sel: Sel) {
  for (const sub of c.subs) {
    const t = tri[sub.src], src = srcs[sub.src].mesh.geometry;
    const pos = src.getAttribute('position') as THREE.BufferAttribute;
    let n = 0;
    for (let i = 0; i < t.count; i++) if (sel(sub.src, i)) n++;
    const big = pos.count > 65535;
    const a = big ? new Uint32Array(n * 3) : new Uint16Array(n * 3);
    const r = big ? new Uint32Array(n * 3) : new Uint16Array(n * 3);
    const bb = new THREE.Box3();
    let k = 0;
    for (let i = 0; i < t.count; i++) {
      if (!sel(sub.src, i)) continue;
      const i0 = t.idx ? t.idx[i * 3] : i * 3, i1 = t.idx ? t.idx[i * 3 + 1] : i * 3 + 1, i2 = t.idx ? t.idx[i * 3 + 2] : i * 3 + 2;
      a[k] = i0; a[k + 1] = i1; a[k + 2] = i2;
      r[k] = i0; r[k + 1] = i2; r[k + 2] = i1;
      bb.expandByPoint(_a.fromBufferAttribute(pos, i0)).expandByPoint(_a.fromBufferAttribute(pos, i1)).expandByPoint(_a.fromBufferAttribute(pos, i2));
      k += 3;
    }
    const make = (index: Uint16Array | Uint32Array) => {
      const g = new THREE.BufferGeometry();
      for (const name of Object.keys(src.attributes)) g.setAttribute(name, src.getAttribute(name));
      g.setIndex(new THREE.BufferAttribute(index, 1));
      g.boundingBox = bb.clone();
      g.boundingSphere = bb.getBoundingSphere(new THREE.Sphere());
      return g;
    };
    sub.geo = make(a);
    sub.inner = make(r);
  }
}
