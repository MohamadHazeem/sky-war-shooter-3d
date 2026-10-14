import { BULLET_DRAG, BULLET_GRAVITY, tracerBurn } from './Gunnery';
import { windDrift } from '../render/WeatherPresets';
import * as THREE from 'three';
import { weatherNow } from '../render/WeatherState';
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
  private age: Float32Array; private ttl: Float32Array; private dmg: Float32Array;
  private team: Uint8Array; private tracer: Uint8Array; private cannon: Uint8Array; private player: Uint8Array;
  private col: Float32Array;
  private owner: (Aircraft | null)[];
  readonly tracers: TracerRenderer;
  onHit?: (e: HitEvent) => void;
  // Near-miss callback for "bullets cracking past" audio
  onNearMiss?: (pos: THREE.Vector3, cannon: boolean) => void;
  listener = new THREE.Vector3();
  // Ground layer (low-level operations, GroundTargets.ts): asked about every round that hit no
  // aircraft this step, with the step's segment; returns true when the round struck a ground
  // target or the terrain (the round is then spent). null = no ground in play.
  ground: ((ax: number, ay: number, az: number, bx: number, by: number, bz: number, axis: boolean, damage: number, player: boolean, owner: Aircraft | null, cannon: boolean) => boolean) | null = null;

  constructor(max = 5000) {
    this.max = max;
    const F = () => new Float32Array(max);
    this.px = F(); this.py = F(); this.pz = F(); this.vx = F(); this.vy = F(); this.vz = F();
    this.age = F(); this.ttl = F(); this.dmg = F();
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
    this.age[i] = 0; this.ttl[i] = ttl; this.dmg[i] = damage;
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
    this.age[i] = this.age[j]; this.ttl[i] = this.ttl[j]; this.dmg[i] = this.dmg[j]; this.team[i] = this.team[j];
    this.tracer[i] = this.tracer[j]; this.cannon[i] = this.cannon[j]; this.player[i] = this.player[j];
    this.col[i * 3] = this.col[j * 3]; this.col[i * 3 + 1] = this.col[j * 3 + 1]; this.col[i * 3 + 2] = this.col[j * 3 + 2];
    this.owner[i] = this.owner[j]; this.owner[j] = null;
  }

  rebase(off: THREE.Vector3) {
    for (let i = 0; i < this.n; i++) { this.px[i] -= off.x; this.py[i] -= off.y; this.pz[i] -= off.z; }
  }

  playerHitScale = 1; // aim assist: the player's rounds count hits a little wider
  // ON FIRE (GameFeel): 0..1 makes the player's own tracers burn hotter, whiter and wider
  playerTracerHeat = 0;

  clear() { this.n = 0; this.owner.fill(null); }

  update(dt: number, aircraft: Aircraft[]) {
    const L = this.listener;
    const driftX = windDrift(weatherNow.windX, dt), driftZ = windDrift(weatherNow.windZ, dt);
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      this.ttl[i] -= dt;
      if (this.ttl[i] <= 0) { this.kill(i); continue; }
      const ax = this.px[i], ay = this.py[i], az = this.pz[i];
      this.vy[i] -= BULLET_GRAVITY * dt;
      this.vx[i] += driftX; this.vz[i] += driftZ;
      // light drag
      const dragK = Math.exp(-BULLET_DRAG * dt);
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
      if (this.ground && this.ground(ax, ay, az, bx, by, bz, team === 1, this.dmg[i], this.player[i] === 1, this.owner[i], this.cannon[i] === 1)) { this.kill(i); continue; }
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
    // hot tracers: brighter, shifted toward white-yellow, wider and a touch longer
    const ht = this.playerTracerHeat;
    const hg = 1 + 0.6 * ht, hw = 1 + 0.55 * ht, hl = 1 + 0.25 * ht;
    // night: the tracer compound burns against a black sky, brighter and wider for the bloom
    const nt = weatherNow.night, ng = 1 + 1.3 * nt, nw = 1 + 0.7 * nt;
    for (let i = 0; i < this.n; i++) {
      if (!this.tracer[i]) continue;
      const pl = this.player[i] === 1;
      const burn = this.cannon[i] ? 1 : tracerBurn(this.age[i]);
      if (burn <= 0) continue;
      // ground flak (axis rounds with no aircraft behind them, GroundTargets.ts): long, bright streaks
      const gf = this.team[i] === 1 && this.owner[i] === null;
      // A new round has not travelled a full streak yet. Extending its tail behind
      // the muzzle can cross the eye plane and fill a fixed-gun view with a white quad.
      const len = Math.min(this.age[i], gf ? 0.065 : (this.cannon[i] ? 0.03 : pl ? 0.045 : 0.034) * (pl ? hl : 1));
      const x = this.px[i], y = this.py[i], z = this.pz[i];
      // fade slightly as the tracer compound burns out
      // everyone else's tracers a little dimmer than the player's own
      const k = burn * Math.min(1, this.ttl[i] / 0.6) * (pl ? hg : gf ? 1 : 0.55) * ng;
      let r = this.col[i * 3] * k, g = this.col[i * 3 + 1] * k, b = this.col[i * 3 + 2] * k;
      if (pl && ht > 0) { g += r * 0.32 * ht; b += r * 0.08 * ht; }
      const wd = gf ? 0.4 : this.cannon[i] ? 0.3 : pl ? 0.17 : 0.09;
      tr.push(x - this.vx[i] * len, y - this.vy[i] * len, z - this.vz[i] * len, x, y, z, r, g, b, (pl ? wd * hw : wd) * nw);
    }
    tr.end(camera, screenH);
  }
}
