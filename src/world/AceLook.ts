import * as THREE from 'three';
import type { Fighter } from './Aircraft';
import { EMBLEMS, type EmblemId } from '../game/Nemesis';

// Markings for the named Experten (game/Nemesis.ts) and the ace squadrons' coloured noses
// (game/SpecialEvents.ts):
//   paintNose   a coloured cowling ring behind the propeller (the old yellow-nose ring, any colour)
//   applyAceLook  his personal colour on the nose and a band round the rear fuselage, his emblem
//               and a row of victory bars on the fin, and bare-metal / primer patches over the
//               holes the player put in him last time (one per scar)
// Everything is fitted to the model itself (rays cast against the airframe in model space give the
// fuselage cross-section and the fin surface, so it follows the enlarged enemy scale and each
// model's shape), cached per airframe; textures and materials are cached per ace.

interface Fit { box: THREE.Box3; len: number; nose: { pos: THREE.Vector3; r: number; l: number } }
const fits = new Map<string, Fit>();

// per-airframe placement along the model (fractions of its length from the tail)
interface Tweak { bandZ: number; finZ: number; finY: number; finS: number }
const BASE: Tweak = { bandZ: 0.27, finZ: 0.075, finY: 0.11, finS: 0.085 };
const TWEAK: Record<string, Partial<Tweak>> = {
  bf109: { finZ: 0.07 },
  me262: { bandZ: 0.3, finZ: 0.05, finY: 0.065 },
  bf110: { bandZ: 0.24 },   // twin fins out on the tailplane: the centre-line fin ray misses, no fin panel
  do335: { bandZ: 0.33, finZ: 0.05 },
};
const tweak = (kind: string): Tweak => ({ ...BASE, ...(TWEAK[kind] ?? {}) });

// meshes of the airframe itself (not our markings, the props or the drop tank)
function hull(f: Fighter): THREE.Mesh[] {
  const skip = new Set<THREE.Object3D>();
  for (const p of f.props) p.node?.traverse((o) => skip.add(o));
  if (f.dropTank) f.dropTank.traverse((o) => skip.add(o));
  const out: THREE.Mesh[] = [];
  f.model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry && !skip.has(m) && !m.name.startsWith('ace') && m.name !== 'yellowNose' && m.visible) out.push(m);
  });
  return out;
}

function fitOf(f: Fighter): Fit {
  let fit = fits.get(f.kind);
  if (fit) return fit;
  const model = f.model;
  f.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const box = new THREE.Box3(), mb = new THREE.Box3(), m4 = new THREE.Matrix4();
  for (const mesh of hull(f)) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    mb.copy(mesh.geometry.boundingBox!).applyMatrix4(m4.multiplyMatrices(inv, mesh.matrixWorld));
    box.union(mb);
  }
  const len = Math.max(1e-3, box.max.z - box.min.z);
  const axis = new THREE.Vector3(0, (box.min.y + box.max.y) * 0.5, box.max.z - 0.05 * len);
  const prop = f.props[0]?.node;
  if (prop) { prop.getWorldPosition(axis); axis.applyMatrix4(inv); }
  fit = { box, len, nose: { pos: axis.clone().setZ(axis.z - 0.1 * len), r: 0.069 * len, l: 0.11 * len } };
  fits.set(f.kind, fit);
  return fit;
}

// Ray against the airframe in model space: the first surface point (model space) or null
const ray = new THREE.Raycaster();
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
function cast(f: Fighter, meshes: THREE.Mesh[], from: THREE.Vector3, dir: THREE.Vector3): THREE.Vector3 | null {
  const mw = f.model.matrixWorld;
  _o.copy(from).applyMatrix4(mw);
  _d.copy(from).add(dir).applyMatrix4(mw).sub(_o).normalize();
  ray.set(_o, _d);
  ray.far = Infinity;
  const hit = ray.intersectObjects(meshes, false)[0];
  return hit ? hit.point.clone().applyMatrix4(new THREE.Matrix4().copy(mw).invert()) : null;
}

// The fuselage cross-section at model z: centre height and half sizes (null when the rays miss)
interface Section { cy: number; hy: number; hx: number; top: number }
function section(f: Fighter, meshes: THREE.Mesh[], z: number): Section | null {
  const { box } = fitOf(f);
  const top = cast(f, meshes, new THREE.Vector3(0, box.max.y + 1, z), new THREE.Vector3(0, -1, 0));
  const bot = cast(f, meshes, new THREE.Vector3(0, box.min.y - 1, z), new THREE.Vector3(0, 1, 0));
  if (!top || !bot || top.y <= bot.y) return null;
  const cy = (top.y + bot.y) / 2;
  const r = cast(f, meshes, new THREE.Vector3(box.max.x + 1, cy, z), new THREE.Vector3(-1, 0, 0));
  const l = cast(f, meshes, new THREE.Vector3(box.min.x - 1, cy, z), new THREE.Vector3(1, 0, 0));
  if (!r || !l || r.x <= l.x) return null;
  return { cy, hy: (top.y - bot.y) / 2, hx: (r.x - l.x) / 2, top: top.y };
}
const sections = new Map<string, Section | null>();

// ---------------- shared resources ----------------

let ringGeo: THREE.BufferGeometry | null = null;
let bandGeo: THREE.BufferGeometry | null = null;
let planeGeo: THREE.BufferGeometry | null = null;
let patchGeo: THREE.BufferGeometry | null = null;
const solid = new Map<string, THREE.MeshStandardMaterial>();
function solidMat(hex: string | number, rough = 0.5, metal = 0.15) {
  const key = `${hex}:${rough}:${metal}`;
  let m = solid.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    solid.set(key, m);
  }
  return m;
}

// A coloured cowling ring behind the propeller (JG 2 / JG 26 style yellow nose, or an ace's colour)
export function paintNose(f: Fighter, color: string | number = 0xf2c418) {
  ringGeo ??= new THREE.CylinderGeometry(1, 1.08, 1, 24, 1, true).rotateX(Math.PI / 2);
  const fit = fitOf(f).nose;
  const ring = new THREE.Mesh(ringGeo, solidMat(color, 0.45, 0.15));
  ring.position.copy(fit.pos);
  ring.scale.set(fit.r, fit.r, fit.l);
  ring.name = 'yellowNose';
  f.model.add(ring);
  return ring;
}

// fin panel: the emblem over a row of victory bars (one bar per 5 victories, max 30 bars)
const finTex = new Map<string, THREE.Texture>();
function finTexture(color: string, emblem: EmblemId, victories: number): THREE.Texture | null {
  const key = `${color}:${emblem}:${Math.floor(victories / 5)}`;
  const hit = finTex.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  g.clearRect(0, 0, 128, 128);
  // emblem on a disc of his colour
  g.fillStyle = color;
  g.beginPath(); g.arc(64, 42, 38, 0, Math.PI * 2); g.fill();
  g.lineWidth = 4; g.strokeStyle = 'rgba(15,15,12,0.9)'; g.stroke();
  g.save();
  g.translate(64 - 26, 42 - 26); g.scale(52 / 64, 52 / 64);
  const p = new Path2D(EMBLEMS[emblem].d);
  const dark = color === '#1d1d1d';
  g.fillStyle = dark ? '#efefe8' : '#141410';
  g.fill(p, 'evenodd');
  g.restore();
  // victory bars: white, in rows of ten
  const bars = Math.min(30, Math.max(1, Math.floor(victories / 5)));
  g.fillStyle = '#f4f1e6'; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 1.5;
  for (let i = 0; i < bars; i++) {
    const row = Math.floor(i / 10), col = i % 10;
    const x = 12 + col * 10.6, y = 88 + row * 13;
    g.fillRect(x, y, 6, 10); g.strokeRect(x, y, 6, 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (finTex.size > 24) { for (const v of finTex.values()) v.dispose(); finTex.clear(); }
  finTex.set(key, t);
  return t;
}
const finMats = new Map<THREE.Texture, THREE.MeshStandardMaterial>();
function finMat(t: THREE.Texture) {
  let m = finMats.get(t);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.35, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    finMats.set(t, m);
  }
  return m;
}

export interface AceLookSpec { color: string; emblem: EmblemId; victories: number; scars: number; seed?: number }

// The ace's own markings on his aircraft. Returns the meshes added (named 'ace*').
export function applyAceLook(f: Fighter, s: AceLookSpec): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const fit = fitOf(f), tw = tweak(f.kind), L = fit.len, box = fit.box;
  const meshes = hull(f);
  // nose ring on single-engine piston fighters
  if ((f.enemyType === 'fw190' || f.enemyType === 'bf109' || f.enemyType === 'do335') && f.props.length) out.push(paintNose(f, s.color));
  // band round the rear fuselage (the Reich-defence unit band, in his colour), sized from the
  // fuselage cross-section there
  const bz = box.min.z + tw.bandZ * L;
  const key = `${f.kind}:band`;
  if (!sections.has(key)) sections.set(key, section(f, meshes, bz));
  const sec = sections.get(key);
  if (sec) {
    bandGeo ??= new THREE.CylinderGeometry(1, 1, 1, 28, 1, true).rotateX(Math.PI / 2);
    const band = new THREE.Mesh(bandGeo, solidMat(s.color, 0.5, 0.1));
    band.position.set(0, sec.cy, bz);
    band.scale.set(sec.hx * 1.07 + 0.002 * L, sec.hy * 1.07 + 0.002 * L, 0.035 * L);
    band.name = 'aceBand';
    f.model.add(band); out.push(band);
  }
  // fin panel: emblem and victory bars on both sides of a centre-line fin (none on twin fins)
  const tex = finTexture(s.color, s.emblem, s.victories);
  if (tex) {
    const fz = box.min.z + tw.finZ * L;
    const top = cast(f, meshes, new THREE.Vector3(0, box.max.y + 1, fz), new THREE.Vector3(0, -1, 0));
    const fy = top ? top.y - tw.finY * L : NaN;
    for (const side of [1, -1]) {
      const hit = top ? cast(f, meshes, new THREE.Vector3(side * (Math.abs(box.max.x) + 1), fy, fz), new THREE.Vector3(-side, 0, 0)) : null;
      if (!hit || Math.abs(hit.x) > 0.04 * L) continue;   // missed, or hit something that is not a thin fin
      planeGeo ??= new THREE.PlaneGeometry(1, 1);
      const p = new THREE.Mesh(planeGeo, finMat(tex));
      p.position.set(hit.x + side * 0.004 * L, fy, fz);
      p.rotation.y = side * Math.PI / 2;
      p.scale.setScalar(tw.finS * L);
      p.name = 'aceFin';
      f.model.add(p); out.push(p);
    }
  }
  // patches over last time's holes: bare aluminium and green primer on the fuselage sides
  if (s.scars > 0) {
    patchGeo ??= new THREE.BoxGeometry(1, 1, 1);
    let r = (s.seed ?? 7) >>> 0;
    const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
    const n = Math.min(10, 2 + s.scars * 2);
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const z = box.min.z + (0.18 + rnd() * 0.22) * L;      // the rear fuselage, between the band and the wing
      const sz = section(f, meshes, z);
      if (!sz) continue;
      const y = sz.cy + (rnd() - 0.4) * sz.hy * 0.9;
      const hit = cast(f, meshes, new THREE.Vector3(side * (Math.abs(box.max.x) + 1), y, z), new THREE.Vector3(-side, 0, 0));
      if (!hit || Math.abs(hit.x) > sz.hx * 1.3) continue;
      const m = new THREE.Mesh(patchGeo, rnd() < 0.55 ? solidMat('#b9bdbf', 0.32, 0.85) : solidMat('#5d6440', 0.8, 0.05));
      m.position.set(hit.x, y, z);
      m.rotation.set(0, 0, (rnd() - 0.5) * 0.5);
      m.scale.set(0.006 * L, (0.014 + rnd() * 0.012) * L, (0.02 + rnd() * 0.018) * L);
      m.name = 'acePatch';
      f.model.add(m); out.push(m);
    }
  }
  return out;
}
