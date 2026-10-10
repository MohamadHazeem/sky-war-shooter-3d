import * as THREE from 'three';
import { sound } from '../audio/Sound';

// Spent .50 cal brass, all instanced. Casings fly from the ejection port, tumble, bounce
// and roll off the curved skin onto the waist walkway, where they settle into a pile that
// grows through a long fight (capped: the oldest casings are recycled). At the turrets and
// the tail they simply drop away out of sight. No allocation per shot or per frame.
//
// Coordinates are bomber-local (the flying pool sits on the bomber root, the pile on the
// waist interior, which is at the bomber origin).

const FLY_CAP = 96;
export const PILE_CAP = 900;
const R = 0.0105;                               // casing radius
const A = 1.08, B = 1.12, YC = 0.15;            // fuselage section (buildWaistInterior)
const FLOOR_TOP = YC - B * 0.78 + 0.015;        // top of the walkway planks
const WALK = 0.64;                              // half width of the walkway
const CELL = 0.045;                             // pile grid
const MAX_LAYER = 5;

let geo: THREE.CylinderGeometry | null = null;
let mat: THREE.MeshStandardMaterial | null = null;
export function brassGeometry() { geo ??= new THREE.CylinderGeometry(R, R, 0.099, 8); return geo; }
export function brassMaterial() { mat ??= new THREE.MeshStandardMaterial({ color: 0xc48a3c, roughness: 0.3, metalness: 1 }); return mat; }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

export class Brass {
  readonly flying: THREE.InstancedMesh;
  readonly pile: THREE.InstancedMesh;
  // flying casings, packed 0..n-1
  private n = 0;
  private pos = new Float32Array(FLY_CAP * 3);
  private vel = new Float32Array(FLY_CAP * 3);
  private rot = new Float32Array(FLY_CAP * 3);
  private life = new Float32Array(FLY_CAP);
  private toPile = new Uint8Array(FLY_CAP);
  private bounces = new Uint8Array(FLY_CAP);
  // pile ring buffer
  private pileN = 0;
  private pileHead = 0;
  private pileCell = new Int32Array(PILE_CAP);
  private heights: Uint8Array;
  private nx: number; private nz: number; private z0: number;
  private clink = 0;

  // zMin/zMax: walkway extent of the waist section
  constructor(zMin: number, zMax: number) {
    this.flying = new THREE.InstancedMesh(brassGeometry(), brassMaterial(), FLY_CAP);
    this.flying.count = 0;
    this.flying.frustumCulled = false;
    this.flying.castShadow = true;
    this.flying.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flying.name = 'brassFlying';
    this.pile = new THREE.InstancedMesh(brassGeometry(), brassMaterial(), PILE_CAP);
    this.pile.count = 0;
    this.pile.frustumCulled = false;
    this.pile.receiveShadow = true;
    this.pile.name = 'brassPile';
    this.z0 = zMin;
    this.nx = Math.ceil((2 * WALK) / CELL);
    this.nz = Math.ceil((zMax - zMin) / CELL);
    this.heights = new Uint8Array(this.nx * this.nz);
  }

  get pileCount() { return this.pileN; }

  // p, v: bomber-local; pile = the casing lands on the waist walkway and stays
  eject(p: THREE.Vector3, v: THREE.Vector3, pile: boolean) {
    if (this.n >= FLY_CAP) this.settle(0); // oldest in flight drops straight onto the pile
    const i = this.n++, k = i * 3;
    this.pos[k] = p.x; this.pos[k + 1] = p.y; this.pos[k + 2] = p.z;
    this.vel[k] = v.x; this.vel[k + 1] = v.y; this.vel[k + 2] = v.z;
    this.rot[k] = Math.random() * 6.28; this.rot[k + 1] = Math.random() * 6.28; this.rot[k + 2] = Math.random() * 6.28;
    this.life[i] = pile ? 3 : 1.2;
    this.toPile[i] = pile ? 1 : 0;
    this.bounces[i] = 0;
  }

  update(dt: number) {
    dt = Math.min(dt, 0.05);
    this.clink -= dt;
    let i = 0;
    while (i < this.n) {
      const k = i * 3;
      const P = this.pos, V = this.vel;
      this.life[i] -= dt;
      V[k + 1] -= 9.81 * dt;
      P[k] += V[k] * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt;
      const spin = this.bounces[i] ? 4 : 15;
      this.rot[k] += spin * dt; this.rot[k + 2] += spin * 0.6 * dt;
      if (this.toPile[i]) {
        const x = P[k];
        // walkway planks, or the curved skin beside them (casings roll back toward the middle)
        const ax = Math.min(Math.abs(x), A * 0.98);
        const skin = YC - B * Math.sqrt(1 - (ax / A) ** 2) + R;
        const floor = Math.abs(x) <= WALK ? FLOOR_TOP + R : Math.max(FLOOR_TOP + R, skin);
        if (Math.abs(x) > WALK) V[k] -= Math.sign(x) * 3 * dt;
        if (Math.abs(x) > A * 0.95) { P[k] = Math.sign(x) * A * 0.95; V[k] *= -0.3; }
        if (P[k + 1] < floor) {
          P[k + 1] = floor;
          if (V[k + 1] < -0.4) {
            V[k + 1] *= -0.28; V[k] *= 0.55; V[k + 2] *= 0.55;
            this.bounces[i]++;
            if (this.clink <= 0 && Math.random() < 0.25) { this.clink = 0.05; sound.brass(Math.abs(x) <= WALK); }   // on the walkway heap: a duller chink
          } else { V[k + 1] = 0; V[k] *= 1 - Math.min(1, 6 * dt); V[k + 2] *= 1 - Math.min(1, 6 * dt); }
          if (Math.abs(x) <= WALK && (this.bounces[i] >= 3 || Math.hypot(V[k], V[k + 1], V[k + 2]) < 0.15)) { this.settle(i); continue; }
        }
        if (this.life[i] <= 0) { this.settle(i); continue; }
      } else {
        if (P[k + 1] < -0.85) { P[k + 1] = -0.85; V[k + 1] *= -0.3; V[k] *= 0.5; V[k + 2] *= 0.5; if (Math.random() < 0.2) sound.brass(false, 1.1); }
        if (this.life[i] <= 0) { this.kill(i); continue; }
      }
      _e.set(this.rot[k], this.rot[k + 1], this.rot[k + 2]);
      _m.compose(_p.set(P[k], P[k + 1], P[k + 2]), _q.setFromEuler(_e), _s.setScalar(1));
      this.flying.setMatrixAt(i, _m);
      i++;
    }
    this.flying.count = this.n;
    this.flying.instanceMatrix.needsUpdate = true;
  }

  // Swap-remove flying casing i
  private kill(i: number) {
    const last = --this.n;
    if (i === last) return;
    const k = i * 3, l = last * 3;
    for (let j = 0; j < 3; j++) { this.pos[k + j] = this.pos[l + j]; this.vel[k + j] = this.vel[l + j]; this.rot[k + j] = this.rot[l + j]; }
    this.life[i] = this.life[last]; this.toPile[i] = this.toPile[last]; this.bounces[i] = this.bounces[last];
  }

  // Lay casing i on the pile (a heap: each grid cell stacks a few layers, then spills over)
  private settle(i: number) {
    const k = i * 3;
    if (!this.toPile[i]) { this.kill(i); return; }
    let ix = Math.floor((THREE.MathUtils.clamp(this.pos[k], -WALK + 0.01, WALK - 0.01) + WALK) / CELL);
    let iz = Math.floor((this.pos[k + 2] - this.z0) / CELL);
    if (iz < 0 || iz >= this.nz) { this.kill(i); return; }
    ix = THREE.MathUtils.clamp(ix, 0, this.nx - 1);
    let c = iz * this.nx + ix;
    // spill: a full cell sends the casing rolling off to the lowest neighbour
    for (let tries = 0; tries < 4 && this.heights[c] >= MAX_LAYER; tries++) {
      let best = c;
      for (const [dx, dz] of NEIGHBOURS) {
        const x = ix + dx, z = iz + dz;
        if (x < 0 || z < 0 || x >= this.nx || z >= this.nz) continue;
        const cc = z * this.nx + x;
        if (this.heights[cc] < this.heights[best]) best = cc;
      }
      if (best === c) break;
      c = best; ix = c % this.nx; iz = Math.floor(c / this.nx);
    }
    // recycle the oldest casing once the pile is full
    let slot: number;
    if (this.pileN < PILE_CAP) slot = this.pileN++;
    else { slot = this.pileHead; this.pileHead = (this.pileHead + 1) % PILE_CAP; const old = this.pileCell[slot]; if (this.heights[old] > 0) this.heights[old]--; }
    const layer = Math.min(this.heights[c], MAX_LAYER);
    if (this.heights[c] < 255) this.heights[c]++;
    this.pileCell[slot] = c;
    // lying on its side, random heading; higher layers sit tilted on the ones below
    const x = -WALK + (ix + 0.2 + Math.random() * 0.6) * CELL;
    const z = this.z0 + (iz + 0.2 + Math.random() * 0.6) * CELL;
    const tilt = layer ? (Math.random() * 2 - 1) * 0.35 : (Math.random() * 2 - 1) * 0.05;
    _e.set(tilt, Math.random() * Math.PI * 2, Math.PI / 2, 'YXZ');
    _m.compose(_p.set(x, FLOOR_TOP + R + layer * R * 1.5, z), _q.setFromEuler(_e), _s.setScalar(1));
    this.pile.setMatrixAt(slot, _m);
    this.pile.count = this.pileN;
    this.pile.instanceMatrix.needsUpdate = true;
    this.kill(i);
  }

  dispose() {
    this.flying.removeFromParent();
    this.pile.removeFromParent();
    this.flying.dispose();
    this.pile.dispose();
  }
}

const NEIGHBOURS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
