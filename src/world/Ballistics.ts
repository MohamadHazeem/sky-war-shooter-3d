import * as THREE from 'three';
import type { Aircraft, HitZone } from './Aircraft';
import { TracerRenderer } from '../render/Particles';

export interface HitEvent {
  target: Aircraft;
  zone: HitZone;
  point: THREE.Vector3;
  damage: number;
  cannon: boolean;
  shooter: Aircraft | null;
  bulletVel: THREE.Vector3;
  playerShot: boolean;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _la = new THREE.Vector3();
const _lb = new THREE.Vector3();
const _qi = new THREE.Quaternion();
const _hit = new THREE.Vector3();

// Ray-segment vs sphere: returns t in [0,1] of first intersection or -1.
export function segSphere(ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number, r: number): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const fx = ax - cx, fy = ay - cy, fz = az - cz;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const c = fx * fx + fy * fy + fz * fz - r * r;
  if (c < 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-9) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

export class Ballistics {
  readonly max: number;
  n = 0;
  private px: Float32Array; private py: Float32Array; private pz: Float32Array;
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  private ttl: Float32Array; private dmg: Float32Array;
  private team: Uint8Array; private tracer: Uint8Array; private cannon: Uint8Array; private player: Uint8Array;
  private col: Float32Array;
  private owner: (Aircraft | null)[];
  readonly tracers: TracerRenderer;
  onHit?: (e: HitEvent) => void;
  // Near-miss callback for "bullets cracking past" audio
  onNearMiss?: (pos: THREE.Vector3, cannon: boolean) => void;
  listener = new THREE.Vector3();

  constructor(max = 5000) {
    this.max = max;
    const F = () => new Float32Array(max);
    this.px = F(); this.py = F(); this.pz = F(); this.vx = F(); this.vy = F(); this.vz = F();
    this.ttl = F(); this.dmg = F();
    this.team = new Uint8Array(max); this.tracer = new Uint8Array(max); this.cannon = new Uint8Array(max);
    this.player = new Uint8Array(max);
    this.col = new Float32Array(max * 3);
    this.owner = new Array(max).fill(null);
    this.tracers = new TracerRenderer(max);
  }

  fire(pos: THREE.Vector3, vel: THREE.Vector3, team: 'allied' | 'axis', damage: number, tracer: boolean,
    color: [number, number, number], owner: Aircraft | null, cannon = false, player = false, ttl = 2.6) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.px[i] = pos.x; this.py[i] = pos.y; this.pz[i] = pos.z;
    this.vx[i] = vel.x; this.vy[i] = vel.y; this.vz[i] = vel.z;
    this.ttl[i] = ttl; this.dmg[i] = damage;
    this.team[i] = team === 'allied' ? 0 : 1;
    this.tracer[i] = tracer ? 1 : 0;
    this.cannon[i] = cannon ? 1 : 0;
    this.player[i] = player ? 1 : 0;
    this.col[i * 3] = color[0]; this.col[i * 3 + 1] = color[1]; this.col[i * 3 + 2] = color[2];
    this.owner[i] = owner;
  }

  private kill(i: number) {
    const j = --this.n;
    if (i === j) { this.owner[j] = null; return; }
    this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
    this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
    this.ttl[i] = this.ttl[j]; this.dmg[i] = this.dmg[j]; this.team[i] = this.team[j];
    this.tracer[i] = this.tracer[j]; this.cannon[i] = this.cannon[j]; this.player[i] = this.player[j];
    this.col[i * 3] = this.col[j * 3]; this.col[i * 3 + 1] = this.col[j * 3 + 1]; this.col[i * 3 + 2] = this.col[j * 3 + 2];
    this.owner[i] = this.owner[j]; this.owner[j] = null;
  }

  rebase(off: THREE.Vector3) {
    for (let i = 0; i < this.n; i++) { this.px[i] -= off.x; this.py[i] -= off.y; this.pz[i] -= off.z; }
  }

  playerHitScale = 1; // aim assist: the player's rounds count hits a little wider

  clear() { this.n = 0; this.owner.fill(null); }

  update(dt: number, aircraft: Aircraft[]) {
    const L = this.listener;
    let i = 0;
    while (i < this.n) {
      this.ttl[i] -= dt;
      if (this.ttl[i] <= 0) { this.kill(i); continue; }
      const ax = this.px[i], ay = this.py[i], az = this.pz[i];
      this.vy[i] -= 9.81 * dt;
      // light drag
      const dragK = Math.exp(-0.12 * dt);
      this.vx[i] *= dragK; this.vy[i] *= dragK; this.vz[i] *= dragK;
      const bx = ax + this.vx[i] * dt, by = ay + this.vy[i] * dt, bz = az + this.vz[i] * dt;
      let hitT = 2, hitAc: Aircraft | null = null, hitZone: HitZone | null = null;
      const team = this.team[i];
      const hs = this.player[i] === 1 ? this.playerHitScale : 1;
      for (const ac of aircraft) {
        if (ac.remove || ac === this.owner[i]) continue;
        if ((ac.team === 'allied' ? 0 : 1) === team) continue;
        const p = ac.root.position;
        // Bullets move relative to the target during the frame; test in target frame
        const t0 = segSphere(ax, ay, az, bx, by, bz, p.x, p.y, p.z, ac.radius * hs + 2);
        if (t0 < 0) continue;
        _qi.copy(ac.root.quaternion).invert();
        // Relative motion: aircraft were updated first, so at the segment start the target
        // was at p - vel*dt and at the end it is at p.
        _la.set(ax - p.x + ac.vel.x * dt, ay - p.y + ac.vel.y * dt, az - p.z + ac.vel.z * dt).applyQuaternion(_qi);
        _lb.set(bx - p.x, by - p.y, bz - p.z).applyQuaternion(_qi);
        for (const z of ac.zones) {
          const t = segSphere(_la.x, _la.y, _la.z, _lb.x, _lb.y, _lb.z, z.offset.x, z.offset.y, z.offset.z, z.radius * hs);
          if (t >= 0 && t < hitT) { hitT = t; hitAc = ac; hitZone = z; }
        }
      }
      if (hitAc && hitZone) {
        _hit.set(ax + (bx - ax) * hitT, ay + (by - ay) * hitT, az + (bz - az) * hitT);
        this.onHit?.({
          target: hitAc, zone: hitZone, point: _hit.clone(), damage: this.dmg[i], cannon: this.cannon[i] === 1,
          shooter: this.owner[i], bulletVel: new THREE.Vector3(this.vx[i], this.vy[i], this.vz[i]),
          playerShot: this.player[i] === 1,
        });
        this.kill(i);
        continue;
      }
      // near-miss crack (enemy rounds passing close to the listener)
      if (team === 1 && this.onNearMiss) {
        const t = segSphere(ax, ay, az, bx, by, bz, L.x, L.y, L.z, 6);
        if (t >= 0) this.onNearMiss(_b.set(bx, by, bz), this.cannon[i] === 1);
      }
      this.px[i] = bx; this.py[i] = by; this.pz[i] = bz;
      i++;
    }
  }

  renderTracers(camera: THREE.PerspectiveCamera, screenH: number) {
    const tr = this.tracers;
    tr.begin();
    for (let i = 0; i < this.n; i++) {
      if (!this.tracer[i]) continue;
      const len = this.cannon[i] ? 0.03 : this.player[i] ? 0.045 : 0.034;
      const x = this.px[i], y = this.py[i], z = this.pz[i];
      // fade slightly as the tracer compound burns out
      // everyone else's tracers a little dimmer than the player's own
      const k = Math.min(1, this.ttl[i] / 0.6) * (this.player[i] ? 1 : 0.55);
      tr.push(x - this.vx[i] * len, y - this.vy[i] * len, z - this.vz[i] * len, x, y, z,
        this.col[i * 3] * k, this.col[i * 3 + 1] * k, this.col[i * 3 + 2] * k, this.cannon[i] ? 0.3 : this.player[i] ? 0.17 : 0.09);
    }
    tr.end(camera, screenH);
  }
}
