import * as THREE from 'three';
import { STATIONS } from '../world/B17Layout';
import { rng } from './SideRaids';

// The Tour's carried damage, seen from the waist: riveted aluminium repair patches over the old
// holes in the fuselage skin (Tour.ts ShipState.patches). One shared material and geometry, a
// fixed pool of meshes and seeded spots (patch i sits in the same place every mission, so the
// skin fills up over the tour). Warmed in World.prewarm; nothing is created during a mission.
const MAX = 30;
const MAX_OUTSIDE = 40;
const A = 1.08, B = 1.12, YC = 0.15;         // the waist section's ellipse (Viewmodels.buildWaistInterior)
const sheetGeo = (u0: number) => {
  const g = new THREE.PlaneGeometry(1, 1);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * 0.5);
  return g;
};
const GEO = sheetGeo(0);        // bare aluminium
const GEO_PRIMER = sheetGeo(0.5); // a sheet in zinc-chromate primer
const Z = new THREE.Vector3(0, 0, 1);

let material: THREE.MeshStandardMaterial | null = null;
function patchMaterial(): THREE.MeshStandardMaterial {
  if (material) return material;
  let map: THREE.Texture | null = null;
  if (typeof document !== 'undefined') {
    // two sheets side by side: bare aluminium (left) and a sheet in zinc-chromate primer (right)
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    if (g) {
      const sheet = (x0: number, a: string, b: string, scuff: string, edge: string, rivet: string, glint: string) => {
        const grad = g.createLinearGradient(x0, 0, x0 + 128, 128);
        grad.addColorStop(0, a); grad.addColorStop(1, b);
        g.fillStyle = grad; g.fillRect(x0, 0, 128, 128);
        // rolling marks and scuffs on the fresh sheet
        g.globalAlpha = 0.22; g.strokeStyle = scuff; g.lineWidth = 1;
        for (let i = 0; i < 22; i++) { const y = (i * 37) % 128; g.beginPath(); g.moveTo(x0 + 10, y); g.lineTo(x0 + 118, (y + 9) % 128); g.stroke(); }
        g.globalAlpha = 1;
        // the lapped edge, darker where the sealant and grime collect
        g.strokeStyle = edge; g.lineWidth = 8; g.strokeRect(x0 + 4, 4, 120, 120);
        // two rows of rivet heads round the edge
        for (let i = 0; i < 9; i++) {
          const t = 15 + i * 12.25;
          for (const [x, y] of [[t, 14], [t, 114], [14, t], [114, t]]) {
            g.fillStyle = rivet; g.beginPath(); g.arc(x0 + x, y, 3, 0, Math.PI * 2); g.fill();
            g.fillStyle = glint; g.beginPath(); g.arc(x0 + x - 0.8, y - 0.8, 1, 0, Math.PI * 2); g.fill();
          }
        }
      };
      sheet(0, '#8f948c', '#767a72', '#4a4d47', '#3c3e39', '#3a3c37', '#b8bcb4');
      sheet(128, '#7c8550', '#646c3e', '#3e4425', '#353a20', '#33381f', '#a1aa72');
      map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
    }
  }
  material = new THREE.MeshStandardMaterial({
    map, color: new THREE.Color(1, 1, 1), roughness: 0.62, metalness: 0.3,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  material.name = 'tourRepairPatch';
  return material;
}

interface Spot { p: THREE.Vector3; n: THREE.Vector3; flat: boolean }   // bomber frame; flat = wing or tailplane

export class RepairPatches {
  readonly group = new THREE.Group();      // inside, on the waist walls
  readonly outside = new THREE.Group();    // on the Fortress's skin: wings, fuselage, tailplane
  private meshes: THREE.Mesh[] = [];
  private skin: THREE.Mesh[] = [];
  private n = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private spots = new Map<string, Spot[]>();   // per ship: found once

  constructor() {
    this.group.name = 'tourRepairPatches';
    this.outside.name = 'tourRepairPatchesOutside';
    for (let i = 0; i < MAX; i++) {
      const m = new THREE.Mesh(GEO, patchMaterial());
      m.visible = false; m.castShadow = false; m.receiveShadow = true;
      this.group.add(m); this.meshes.push(m);
    }
    for (let i = 0; i < MAX_OUTSIDE; i++) {
      const m = new THREE.Mesh(GEO, patchMaterial());
      m.visible = false; m.castShadow = false; m.receiveShadow = true;
      this.outside.add(m); this.skin.push(m);
    }
  }

  /** Show `count` patches (capped) at their seeded spots on the waist walls. */
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
      // most damage collects round the gun windows, where the fighters aim; the rest anywhere
      const nearGun = r() < 0.6;
      for (let k = 0; k < 12; k++) {
        const right = r() < 0.5;
        const tt = nearGun ? -0.55 + r() * 1.5 : -0.95 + r() * 2.15;   // round the window / below it to the upper wall
        t = right ? Math.PI - tt : tt;
        z = nearGun ? (right ? wr.z : wl.z) + (r() - 0.5) * 2.2 : z0 + r() * (z1 - z0);
        const y = Math.sin(tt) * B;
        const winZ = right ? wr.z : wl.z;
        const inWindow = y > -0.16 && y < 0.62 && Math.abs(z - winZ) < 0.55;
        if (!inWindow) break;
      }
      const p = m.position.set(Math.cos(t) * A, YC + Math.sin(t) * B, z);
      this.n.set(p.x / (A * A), (p.y - YC) / (B * B), 0).normalize();
      p.addScaledVector(this.n, -0.012);
      m.quaternion.setFromUnitVectors(Z, this.n.negate());
      m.rotateZ((r() - 0.5) * 0.5);
      m.scale.set(0.13 + r() * 0.17, 0.1 + r() * 0.13, 1);
      m.geometry = r() < 0.35 ? GEO_PRIMER : GEO;
    }
  }

  /**
   * Outside: `count` patches (capped) on the skin of the Fortress, at seeded spots found by
   * casting rays at its own model once per ship (mission start, behind the fade). Seen from the
   * top and ball turrets, the tail and every outside camera.
   */
  setOutside(root: THREE.Object3D, model: THREE.Object3D, count: number, seed: number) {
    const key = String(seed);
    let spots = this.spots.get(key);
    if (!spots) { spots = this.findSpots(root, model, seed); this.spots.clear(); this.spots.set(key, spots); }
    const shown = Math.max(0, Math.min(MAX_OUTSIDE, Math.floor(count * 0.8), spots.length));
    for (let i = 0; i < MAX_OUTSIDE; i++) {
      const m = this.skin[i];
      m.visible = i < shown;
      if (!m.visible) continue;
      const s = spots[i], r = rng((Math.imul(seed >>> 0, 40503) + i * 104729) >>> 0);
      m.position.copy(s.p).addScaledVector(s.n, 0.012);
      m.quaternion.setFromUnitVectors(Z, s.n);
      m.rotateZ((r() - 0.5) * 0.6);
      const k = s.flat ? 1 : 0.55;   // the fuselage is curved: smaller sheets stay on the skin
      m.scale.set((0.24 + r() * 0.34) * k, (0.18 + r() * 0.26) * k, 1);
      m.geometry = r() < 0.15 ? GEO_PRIMER : GEO;
    }
    this.outside.removeFromParent();
    root.add(this.outside);
  }

  private findSpots(root: THREE.Object3D, model: THREE.Object3D, seed: number) {
    root.updateMatrixWorld(true);
    const out: Spot[] = [];
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const o = new THREE.Vector3(), d = new THREE.Vector3();
    const r = rng((seed >>> 0) ^ 0x5eed);
    for (let k = 0; k < MAX_OUTSIDE * 3 && out.length < MAX_OUTSIDE; k++) {
      const u = r(), side = r() < 0.5 ? 1 : -1;
      // wings (upper skin), fuselage top, fuselage sides, belly, tailplane (bomber frame: +z nose, +x left)
      if (u < 0.36) { o.set(side * (2.4 + r() * 8.6), 7, 1.6 - r() * 3.6); d.set(0, -1, 0); }
      else if (u < 0.62) { o.set((r() - 0.5) * 0.9, 7, 2.2 - r() * 14); d.set(0, -1, 0); }
      else if (u < 0.82) { o.set(side * 7, 0.1 + (r() - 0.5) * 1.3, -0.5 - r() * 11.5); d.set(-side, 0, 0); }
      else if (u < 0.92) { o.set((r() - 0.5) * 0.9, -7, 1.5 - r() * 12); d.set(0, 1, 0); }
      else { o.set(side * (1.2 + r() * 4.2), 7, -13.8 - r() * 1.6); d.set(0, -1, 0); }
      this.ray.set(o.applyMatrix4(root.matrixWorld), d.transformDirection(root.matrixWorld));
      this.ray.far = 12;
      const hit = this.ray.intersectObject(model, true).find((h) => {
        const mesh = h.object as THREE.Mesh, mat = mesh.material as THREE.Material | THREE.Material[];
        const m0 = Array.isArray(mat) ? mat[0] : mat;
        return !!h.face && mesh.isMesh && !m0?.transparent;
      });
      if (!hit || !hit.face) continue;
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (n.dot(this.ray.ray.direction) > -0.25) continue;   // grazing, or a back face
      out.push({ p: hit.point.clone().applyMatrix4(inv), n: n.transformDirection(inv), flat: u < 0.36 || u >= 0.92 });
    }
    return out;
  }

  attach(parent: THREE.Object3D | null) {
    this.group.removeFromParent();
    if (parent) parent.add(this.group);
    else this.outside.removeFromParent();
  }
}

/** World.prewarm: the plain program, and the aircraft-batched one under the warm-up Fortress. */
export function warmRepairPatches(scene: THREE.Scene, at: THREE.Vector3, holder?: THREE.Object3D) {
  const m = new THREE.Mesh(GEO, patchMaterial());
  m.position.copy(at); m.frustumCulled = false; scene.add(m);
  const h = holder ? new THREE.Mesh(GEO, patchMaterial()) : null;
  if (h && holder) { h.position.set(0, 1.4, -4); h.frustumCulled = false; holder.add(h); }
  return () => { m.removeFromParent(); h?.removeFromParent(); };
}
