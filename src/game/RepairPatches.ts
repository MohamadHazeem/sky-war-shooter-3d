import * as THREE from 'three';
import { STATIONS } from '../world/B17Layout';
import { rng } from './SideRaids';

// The Tour's carried damage made visible (Tour.ts ShipState.patches / patchZones): riveted repair
// sheets over the old holes, on the Fortress's skin where she was actually hit (clustered on the
// zones that took the damage, clear of the national insignia and markings) and on the waist walls.
//
// - One procedural texture atlas (four sheets: weathered bare aluminium, zinc-chromate primer,
//   a field repaint in olive drab, sooty aluminium behind the exhausts) with a matching normal map:
//   lapped edges, a darker sealant line and grime, two rows of domed rivets, a seam, scuffs, and
//   dirt / exhaust streaking that trails aft (outside sheets are turned to the airflow).
// - Two materials: outside (tinted toward the ship's olive drab, low albedo, rough) and inside.
// - Fixed mesh pools; spots are seeded per airframe (they stay put all tour) and found once per
//   ship by casting rays at the ship's own model at mission start (~70 ms behind the fade).
// Warmed in World.prewarm (plain and batched under the warm-up Fortress); nothing is created in flight.
const MAX = 30, MAX_OUTSIDE = 40;
export const INSIDE_PER_PATCH = 0.4, OUTSIDE_PER_PATCH = 0.35;   // a slow ramp: the caps arrive late in the tour
const A = 1.08, B = 1.12, YC = 0.15;         // the waist section's ellipse (Viewmodels.buildWaistInterior)
const Z = new THREE.Vector3(0, 0, 1);
const FWD = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0);

/** Visible patch counts for a ship with `patches` patches. */
export const shownPatches = (patches: number) => ({
  inside: Math.max(0, Math.min(MAX, Math.floor(patches * INSIDE_PER_PATCH))),
  outside: Math.max(0, Math.min(MAX_OUTSIDE, Math.floor(patches * OUTSIDE_PER_PATCH))),
});

// ---------------- the sheets ----------------

type Sheet = 0 | 1 | 2 | 3;   // aluminium, zinc chromate, olive-drab repaint, sooty aluminium
const sheetGeo = (s: Sheet) => {
  const g = new THREE.PlaneGeometry(1, 1);
  const uv = g.getAttribute('uv');
  const u0 = (s % 2) * 0.5, v0 = s < 2 ? 0.5 : 0;   // canvas row 0 is the top (v 0.5..1)
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
  return g;
};
const GEOS = [sheetGeo(0), sheetGeo(1), sheetGeo(2), sheetGeo(3)];

const CELL = 256;
const SHEETS: { base: [string, string]; ink: string; rivet: string; glint: string; streak: number }[] = [
  { base: ['#7c807a', '#626660'], ink: '#363934', rivet: '#3c3f3a', glint: '#a9ada6', streak: 0.3 },    // weathered aluminium
  { base: ['#6c7150', '#555a3c'], ink: '#2f3322', rivet: '#353926', glint: '#959a76', streak: 0.25 },   // zinc chromate
  { base: ['#5a5c3d', '#46482f'], ink: '#26271a', rivet: '#2c2d1e', glint: '#7f8160', streak: 0.3 },    // olive-drab repaint
  { base: ['#6d706a', '#55584f'], ink: '#2b2d29', rivet: '#33352f', glint: '#9fa39b', streak: 0.62 },   // sooty aluminium
];

let atlas: { map: THREE.Texture; normal: THREE.Texture } | null = null;
function buildAtlas() {
  if (atlas || typeof document === 'undefined') return atlas;
  const W = CELL * 2;
  const color = document.createElement('canvas'), height = document.createElement('canvas');
  color.width = color.height = height.width = height.height = W;
  const c = color.getContext('2d'), h = height.getContext('2d');
  if (!c || !h) return null;
  h.fillStyle = 'rgb(128,128,128)'; h.fillRect(0, 0, W, W);
  SHEETS.forEach((sh, i) => {
    const x0 = (i % 2) * CELL, y0 = Math.floor(i / 2) * CELL, r = rng(9001 + i * 77);
    c.save(); c.beginPath(); c.rect(x0, y0, CELL, CELL); c.clip();
    const g = c.createLinearGradient(x0, y0, x0 + CELL * 0.6, y0 + CELL);
    g.addColorStop(0, sh.base[0]); g.addColorStop(1, sh.base[1]);
    c.fillStyle = g; c.fillRect(x0, y0, CELL, CELL);
    // mottling, scuffs and rolling marks
    for (let k = 0; k < 900; k++) {
      c.globalAlpha = 0.04 + r() * 0.07; c.fillStyle = r() < 0.5 ? '#000' : '#fff';
      c.fillRect(x0 + r() * CELL, y0 + r() * CELL, 1 + r() * 4, 1 + r() * 3);
    }
    c.globalAlpha = 0.1; c.strokeStyle = sh.ink; c.lineWidth = 1;
    for (let k = 0; k < 14; k++) { const y = y0 + r() * CELL; c.beginPath(); c.moveTo(x0 + 14, y); c.lineTo(x0 + CELL - 14, y + (r() - 0.5) * 10); c.stroke(); }
    // dirt and exhaust streaking trailing aft (down the canvas)
    const sg = c.createLinearGradient(0, y0 + CELL * 0.25, 0, y0 + CELL);
    sg.addColorStop(0, 'rgba(18,16,12,0)'); sg.addColorStop(1, `rgba(18,16,12,${sh.streak})`);
    c.globalAlpha = 1; c.fillStyle = sg; c.fillRect(x0, y0, CELL, CELL);
    for (let k = 0; k < 7 + sh.streak * 20; k++) {
      const x = x0 + 20 + r() * (CELL - 40), y = y0 + 20 + r() * CELL * 0.5, len = 40 + r() * 160;
      const lg = c.createLinearGradient(0, y, 0, y + len);
      lg.addColorStop(0, `rgba(20,18,14,${0.18 + sh.streak * 0.4})`); lg.addColorStop(1, 'rgba(20,18,14,0)');
      c.fillStyle = lg; c.fillRect(x, y, 2 + r() * 5, len);
    }
    // a lap seam across the sheet (two of the four)
    const seam = i === 0 || i === 2 ? y0 + 96 + Math.floor(r() * 50) : -1;
    if (seam > 0) { c.fillStyle = sh.ink; c.globalAlpha = 0.55; c.fillRect(x0 + 12, seam, CELL - 24, 2); c.globalAlpha = 1; }
    // the lapped edge: grime and sealant collect in a dark outline, fading inwards (fake AO)
    for (let k = 0; k < 14; k++) { c.globalAlpha = 0.07 * (1 - k / 14) + 0.02; c.strokeStyle = '#100f0b'; c.lineWidth = 2; c.strokeRect(x0 + 1 + k, y0 + 1 + k, CELL - 2 - 2 * k, CELL - 2 - 2 * k); }
    c.globalAlpha = 0.9; c.strokeStyle = sh.ink; c.lineWidth = 4; c.strokeRect(x0 + 2, y0 + 2, CELL - 4, CELL - 4);
    // two rows of domed rivets round the edge (and along the seam)
    const rivet = (x: number, y: number) => {
      c.globalAlpha = 1; c.fillStyle = sh.rivet; c.beginPath(); c.arc(x, y, 3.4, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.85; c.fillStyle = sh.glint; c.beginPath(); c.arc(x - 1, y - 1, 1.3, 0, Math.PI * 2); c.fill();
      const hg = h.createRadialGradient(x, y, 0, x, y, 4); hg.addColorStop(0, 'rgb(230,230,230)'); hg.addColorStop(1, 'rgba(128,128,128,0)');
      h.fillStyle = hg; h.beginPath(); h.arc(x, y, 4, 0, Math.PI * 2); h.fill();
    };
    for (const inset of [13, 25]) for (let t = inset; t <= CELL - inset; t += 14) {
      rivet(x0 + t, y0 + inset); rivet(x0 + t, y0 + CELL - inset); rivet(x0 + inset, y0 + t); rivet(x0 + CELL - inset, y0 + t);
    }
    if (seam > 0) for (let t = 30; t <= CELL - 30; t += 14) rivet(x0 + t, seam - 6);
    c.restore();
    // height: the sheet stands proud of the skin, its edge bevelled down; the seam a shallow step
    for (let k = 0; k < 8; k++) { const v = 96 + k * 4; h.strokeStyle = `rgb(${v},${v},${v})`; h.lineWidth = 1; h.strokeRect(x0 + 0.5 + k, y0 + 0.5 + k, CELL - 1 - 2 * k, CELL - 1 - 2 * k); }
    if (seam > 0) { h.fillStyle = 'rgb(112,112,112)'; h.fillRect(x0 + 12, seam, CELL - 24, 2); }
  });
  // height -> tangent-space normal map
  const hd = h.getImageData(0, 0, W, W).data, nd = new ImageData(W, W), o = nd.data;
  const at = (x: number, y: number) => hd[(Math.min(W - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 3, dy = (at(x, y + 1) - at(x, y - 1)) * 3;
    const l = Math.hypot(dx, dy, 1), j = (y * W + x) * 4;
    o[j] = (-dx / l * 0.5 + 0.5) * 255; o[j + 1] = (dy / l * 0.5 + 0.5) * 255; o[j + 2] = (1 / l * 0.5 + 0.5) * 255; o[j + 3] = 255;
  }
  h.putImageData(nd, 0, 0);
  const map = new THREE.CanvasTexture(color); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const normal = new THREE.CanvasTexture(height); normal.colorSpace = THREE.NoColorSpace; normal.anisotropy = 4;
  atlas = { map, normal };
  return atlas;
}

let materials: { inside: THREE.MeshStandardMaterial; outside: THREE.MeshStandardMaterial } | null = null;
function patchMaterials() {
  if (materials) return materials;
  const t = buildAtlas();
  const common = { map: t?.map ?? null, normalMap: t?.normal ?? null, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  // inside: lit by the dim waist; outside: toward the ship's olive drab, low albedo, matt
  const inside = new THREE.MeshStandardMaterial({ ...common, color: new THREE.Color(1, 1, 0.97), roughness: 0.6, metalness: 0.3, normalScale: new THREE.Vector2(0.8, 0.8) });
  const outside = new THREE.MeshStandardMaterial({ ...common, color: new THREE.Color(0.6, 0.64, 0.5), roughness: 0.8, metalness: 0.12, normalScale: new THREE.Vector2(1, 1) });
  inside.name = 'tourRepairPatch'; outside.name = 'tourRepairPatchOutside';
  materials = { inside, outside };
  return materials;
}

// ---------------- where she was hit ----------------

type Kind = 'flat' | 'body';
interface Spot { p: THREE.Vector3; n: THREE.Vector3; kind: Kind }   // bomber frame (+z nose, +x left)
const ZONE_FALLBACK = ['fuselageMid', 'fuselageAft', 'wingL', 'wingR', 'tail', 'fuselageFwd'];

/** A ray at the skin near a hit zone: origin and direction in the bomber frame, and what it lands on. */
function zoneRay(zone: string, r: () => number, o: THREE.Vector3, d: THREE.Vector3): Kind {
  const s = r() < 0.5 ? 1 : -1, down = () => d.set(0, -1, 0), side = (x: number) => { o.x = x * 7; d.set(-x, 0, 0); };
  const eng = /^engine(\d)$/.exec(zone);
  if (eng) { const ex = [6.5, 3, -3, -6.5][+eng[1] - 1]; o.set(ex + (r() - 0.5) * 1.6, 7, 2.6 - r() * 3.4); down(); return 'flat'; }
  switch (zone) {
    case 'wingL': case 'wingR': o.set((zone === 'wingL' ? 1 : -1) * (2.6 + r() * 5.4), 7, 1.4 - r() * 3); down(); return 'flat';
    case 'wingLtip': case 'wingRtip': o.set((zone === 'wingLtip' ? 1 : -1) * (8.4 + r() * 3.4), 7, 0.6 - r() * 2.2); down(); return 'flat';
    case 'tail':
      if (r() < 0.6) { o.set(s * (1.2 + r() * 4), 7, -13.6 - r() * 1.6); down(); return 'flat'; }
      o.set(0, 1.9 + r() * 2.2, -13.4 - r() * 2); side(s); return 'body';
    default: {
      const z = zone === 'nose' ? 3.8 + r() * 2.2 : zone === 'cockpit' ? 1.6 + r() * 1.8 : zone === 'fuselageFwd' ? -2.4 + r() * 3.4
        : zone === 'fuselageMid' ? -6.4 + r() * 4 : -11.2 + r() * 4.2;
      if (r() < 0.45) { o.set((r() - 0.5) * 0.8, 7, z); down(); }
      else { o.set(0, -0.35 + r() * 1.25, z); side(s); }
      return 'body';
    }
  }
}

// Markings live in the skin texture: sample it so no patch covers an insignia, letters or nose art
const texels = new WeakMap<THREE.Texture, { d: Uint8ClampedArray; w: number; h: number } | null>();
function skinIsPlain(tex: THREE.Texture | null | undefined, uv: THREE.Vector2 | undefined): boolean {
  if (!tex || !uv || typeof document === 'undefined') return true;
  let px = texels.get(tex);
  if (px === undefined) {
    px = null;
    const img = tex.image as CanvasImageSource & { width?: number; height?: number } | undefined;
    try {
      if (img && img.width && img.height) {
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const g = cv.getContext('2d', { willReadFrequently: true });
        if (g) { g.drawImage(img, 0, 0); px = { d: g.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height }; }
      }
    } catch { px = null; }
    texels.set(tex, px);
  }
  if (!px) return true;
  const q = new THREE.Vector2();
  for (const [du, dv] of [[0, 0], [0.014, 0], [-0.014, 0], [0, 0.014], [0, -0.014]]) {
    q.set(uv.x + du, uv.y + dv); tex.transformUv(q);
    const x = Math.min(px.w - 1, Math.max(0, Math.floor(q.x * px.w))), y = Math.min(px.h - 1, Math.max(0, Math.floor(q.y * px.h)));
    const j = (y * px.w + x) * 4, r = px.d[j], g = px.d[j + 1], b = px.d[j + 2];
    if ((0.3 * r + 0.59 * g + 0.11 * b) > 105 || b > Math.max(r, g) + 12 || (r > g + 25 && r > 90)) return false;   // white, blue, yellow/red paint
  }
  return true;
}

// ---------------- the patches ----------------

export class RepairPatches {
  readonly group = new THREE.Group();      // inside, on the waist walls
  readonly outside = new THREE.Group();    // on the Fortress's skin
  private meshes: THREE.Mesh[] = [];
  private skin: THREE.Mesh[] = [];
  private n = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private spots = new Map<string, Spot | null>();   // `${seed}:${zone}:${j}`: found once per airframe
  private spotsSeed = -1;

  constructor() {
    const mats = patchMaterials();
    this.group.name = 'tourRepairPatches';
    this.outside.name = 'tourRepairPatchesOutside';
    for (let i = 0; i < MAX; i++) {
      const m = new THREE.Mesh(GEOS[0], mats.inside);
      m.visible = false; m.castShadow = false; m.receiveShadow = true;
      this.group.add(m); this.meshes.push(m);
    }
    for (let i = 0; i < MAX_OUTSIDE; i++) {
      const m = new THREE.Mesh(GEOS[0], mats.outside);
      m.visible = false; m.castShadow = false; m.receiveShadow = true;
      this.outside.add(m); this.skin.push(m);
    }
  }

  /** Inside: `count` patches (capped) at their seeded spots on the waist walls, most round the gun windows. */
  set(count: number, seed: number) {
    const wl = STATIONS.waistL.pivot, wr = STATIONS.waistR.pivot;
    const zc = (wl.z + wr.z) / 2, z0 = zc - 2.9, z1 = zc + 2.9;
    const shown = Math.max(0, Math.min(MAX, Math.floor(count)));
    for (let i = 0; i < MAX; i++) {
      const m = this.meshes[i];
      m.visible = i < shown;
      if (!m.visible) continue;
      const r = rng((Math.imul(seed >>> 0, 2654435761) + i * 7919) >>> 0);
      let t = 0, z = zc;
      const nearGun = r() < 0.6;
      for (let k = 0; k < 12; k++) {
        const right = r() < 0.5;
        const tt = nearGun ? -0.55 + r() * 1.5 : -0.95 + r() * 2.15;
        t = right ? Math.PI - tt : tt;
        z = nearGun ? (right ? wr.z : wl.z) + (r() - 0.5) * 2.2 : z0 + r() * (z1 - z0);
        const y = Math.sin(tt) * B;
        const winZ = right ? wr.z : wl.z;
        if (!(y > -0.16 && y < 0.62 && Math.abs(z - winZ) < 0.55)) break;
      }
      const p = m.position.set(Math.cos(t) * A, YC + Math.sin(t) * B, z);
      this.n.set(p.x / (A * A), (p.y - YC) / (B * B), 0).normalize();
      p.addScaledVector(this.n, -0.012);
      m.quaternion.setFromUnitVectors(Z, this.n.negate());
      m.rotateZ((r() - 0.5) * 0.5);
      const w = 0.12 + r() * 0.18;
      m.scale.set(w, w * (0.55 + r() * 0.9), 1);
      m.geometry = GEOS[r() < 0.6 ? 0 : 1];
    }
  }

  /**
   * Outside: `count` patches (capped) on the skin, shared out over the zones that took the hits
   * (`zones`: patches per hit zone, Tour.ts ShipState.patchZones), each cluster round its zone.
   */
  setOutside(root: THREE.Object3D, model: THREE.Object3D, count: number, seed: number, zones: Record<string, number> = {}) {
    if (seed !== this.spotsSeed) { this.spots.clear(); this.spotsSeed = seed; }
    const shown = Math.max(0, Math.min(MAX_OUTSIDE, Math.floor(count)));
    // share the shown patches out over the zones (largest remainder), the most-hit zones first
    let entries = Object.entries(zones).filter(([, n]) => n > 0);
    if (!entries.length) entries = ZONE_FALLBACK.map((z) => [z, 1]);
    const total = entries.reduce((a, [, n]) => a + n, 0);
    const quota = entries.map(([z, n]) => ({ z, q: (n / total) * shown })).map((e) => ({ ...e, k: Math.floor(e.q) }));
    let left = shown - quota.reduce((a, e) => a + e.k, 0);
    for (const e of [...quota].sort((a, b) => (b.q - b.k) - (a.q - a.k))) { if (left <= 0) break; e.k++; left--; }
    const list: Spot[] = [];
    for (const { z, k } of quota.sort((a, b) => a.z.localeCompare(b.z))) {
      let found = 0;
      for (let j = 0; found < k && j < k * 4 + 4; j++) {
        const s = this.spotFor(root, model, seed, z, j);
        if (s) { list.push(s); found++; }
      }
    }
    for (let i = 0; i < MAX_OUTSIDE; i++) {
      const m = this.skin[i], s = list[i];
      m.visible = !!s;
      if (!s) continue;
      const r = rng((Math.imul(seed >>> 0, 40503) + Math.round(s.p.x * 97 + s.p.z * 131) * 104729) >>> 0);
      m.position.copy(s.p).addScaledVector(s.n, 0.008 + i * 0.0005);   // overlapping sheets never z-fight
      // turned to the airflow: the sheet's streaks trail aft, with a slight skew
      const y = this.n.copy(FWD).addScaledVector(s.n, -FWD.dot(s.n));
      if (y.lengthSq() < 1e-3) y.copy(UP).addScaledVector(s.n, -UP.dot(s.n));
      y.normalize();
      const x = new THREE.Vector3().crossVectors(y, s.n);
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, s.n));
      m.rotateZ((r() - 0.5) * 0.3);
      const big = s.kind === 'flat' ? 1 : 0.6;   // the fuselage is curved: smaller sheets stay on the skin
      const w = (0.2 + r() * 0.4) * big;
      m.scale.set(w, w * (0.45 + r() * 1.0), 1);
      const v = r();
      m.geometry = GEOS[v < 0.45 ? 2 : v < 0.75 ? 0 : v < 0.88 ? 1 : 3];
    }
    this.outside.removeFromParent();
    root.add(this.outside);
  }

  private spotFor(root: THREE.Object3D, model: THREE.Object3D, seed: number, zone: string, j: number): Spot | null {
    const key = `${zone}:${j}`;
    if (this.spots.has(key)) return this.spots.get(key)!;
    root.updateMatrixWorld(true);
    const r = rng((Math.imul(seed >>> 0, 2246822519) ^ (j * 3266489917) ^ [...zone].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261)) >>> 0);
    const o = new THREE.Vector3(), d = new THREE.Vector3();
    const kind = zoneRay(zone, r, o, d);
    this.ray.set(o.applyMatrix4(root.matrixWorld), d.transformDirection(root.matrixWorld));
    this.ray.far = 12;
    let spot: Spot | null = null;
    const hit = this.ray.intersectObject(model, true).find((h) => {
      const mesh = h.object as THREE.Mesh, mat = mesh.material as THREE.Material | THREE.Material[];
      const m0 = (Array.isArray(mat) ? mat[0] : mat) as THREE.MeshStandardMaterial | undefined;
      return !!h.face && mesh.isMesh && !!m0 && !m0.transparent && /skin/i.test(m0.name);
    });
    if (hit?.face) {
      const mat = (hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
      const m0 = Array.isArray(mat) ? mat[0] : mat;
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (n.dot(this.ray.ray.direction) < -0.3 && skinIsPlain(m0.map, hit.uv)) {
        const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
        spot = { p: hit.point.clone().applyMatrix4(inv), n: n.transformDirection(inv), kind };
      }
    }
    this.spots.set(key, spot);
    return spot;
  }

  attach(parent: THREE.Object3D | null) {
    this.group.removeFromParent();
    if (parent) parent.add(this.group);
    else this.outside.removeFromParent();
  }
}

/** World.prewarm: both materials, plain and batched under the warm-up Fortress. */
export function warmRepairPatches(scene: THREE.Scene, at: THREE.Vector3, holder?: THREE.Object3D) {
  const mats = patchMaterials();
  const meshes: THREE.Mesh[] = [];
  for (const mat of [mats.inside, mats.outside]) {
    const m = new THREE.Mesh(GEOS[0], mat);
    m.position.copy(at); m.frustumCulled = false; scene.add(m); meshes.push(m);
    if (holder) { const h = new THREE.Mesh(GEOS[0], mat); h.position.set(0, 1.4, -4); h.frustumCulled = false; holder.add(h); meshes.push(h); }
  }
  return () => { for (const m of meshes) m.removeFromParent(); };
}
