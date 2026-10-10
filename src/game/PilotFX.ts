import * as THREE from 'three';
import type { World } from '../world/World';
import type { Fighter, Gun } from '../world/Aircraft';
import type { HitEvent } from '../world/Ballistics';
import { markOwned } from '../render/Dispose';
import { sound } from '../audio/Sound';

// The Mustang's six wing guns, felt: flame tongues and smoke at the wing muzzles, spent
// casings and belt links tumbling out of the ejection chutes under the wings, bright sparks
// where the rounds strike, a heavier layer of gun noise, and a firing "kick" that the
// PilotController turns into a gentle camera shake.

const MAX = 320;                 // casing + link instances
const CASE_LIFE = 1.9;
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const R = () => Math.random() * 2 - 1;

interface Casing { pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; life: number; link: boolean }

export class PilotFX {
  private casingMesh: THREE.InstancedMesh;
  private linkMesh: THREE.InstancedMesh;
  private parts: Casing[] = [];
  private lastCount: number[] = [];
  private plane: Fighter | null = null;
  private prevOnHit: ((e: HitEvent) => void) | undefined;
  private soundAcc = 0;
  private flashSide = 0;
  kick = 0;          // 0..1 firing intensity (camera shake / vibration)
  shotsPerSec = 0;
  casingScale = 2.6; // drawn larger than life so they read in the chase view

  constructor(private world: World) {
    const brass = markOwned(new THREE.MeshStandardMaterial({ color: 0xd2a94e, metalness: 0.9, roughness: 0.32, emissive: 0x2a1c06 }));
    const steel = markOwned(new THREE.MeshStandardMaterial({ color: 0x3b3a36, metalness: 0.7, roughness: 0.5 }));
    // .50 BMG case: 99 mm long, 20 mm across
    this.casingMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.01, 0.0105, 0.099, 6).rotateX(Math.PI / 2), brass, MAX);
    this.linkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.006, 0.022), steel, MAX);
    for (const m of [this.casingMesh, this.linkMesh]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      world.scene.add(m);
    }
  }

  attach(plane: Fighter) {
    this.plane = plane;
    this.lastCount = plane.guns.map((g) => g.count);
    this.parts = [];
    // player hits get an extra spark burst on top of World's own impact effects
    if (!this.prevOnHit) {
      this.prevOnHit = this.world.ballistics.onHit;
      const prev = this.prevOnHit;
      this.world.ballistics.onHit = (e) => { prev?.(e); if (e.playerShot && this.plane) this.hitSpark(e); };
    }
  }

  detach() {
    if (this.prevOnHit) { this.world.ballistics.onHit = this.prevOnHit; this.prevOnHit = undefined; }
    this.plane = null;
    this.parts = [];
    this.casingMesh.count = this.linkMesh.count = 0;
  }

  // Strike sparks scaled with distance from the camera, so a hit at 400 m still reads
  private hitSpark(e: HitEvent) {
    const fx = this.world.effects;
    const cam = this.world.listener;
    const d = cam ? cam.distanceTo(e.point) : 200;
    const k = THREE.MathUtils.clamp(0.6 + d / 260, 0.6, 3.2);
    const fwd = _v.copy(e.bulletVel).sub(e.target.vel).normalize();
    for (let i = 0; i < 5; i++) {
      // sparks spray mostly onward and sideways from the strike
      _p.copy(fwd).multiplyScalar(-0.4 + Math.random()).add(_s.set(R(), R(), R()).multiplyScalar(0.9)).normalize()
        .multiplyScalar(30 + Math.random() * 50).add(e.target.vel);
      fx.glow.spawn({ pos: e.point, vel: _p, life: 0.18 + Math.random() * 0.22, size0: 0.22 * k, size1: 0.05 * k, color0: [40, 30, 14], color1: [10, 3, 0.6], alpha0: 1, alpha1: 0, frame: 1, drag: 2.5, rise: -9 });
    }
    fx.glow.spawn({ pos: e.point, vel: e.target.vel, life: 0.05, size0: 1.1 * k, size1: 1.8 * k, color0: [45, 36, 22], alpha0: 1, alpha1: 0, frame: 1 });
  }

  update(dt: number, view: 'cockpit' | 'chase', camPos: THREE.Vector3) {
    const p = this.plane;
    let shots = 0;
    if (p && p.alive) {
      const fx = this.world.effects;
      for (let i = 0; i < p.guns.length; i++) {
        const g: Gun = p.guns[i];
        const n = g.count - (this.lastCount[i] ?? g.count);
        this.lastCount[i] = g.count;
        if (n <= 0) continue;
        shots += n;
        const muzzle = p.localToWorld(g.offset, new THREE.Vector3());
        const dir = _v.copy(g.dir).applyQuaternion(p.quat);
        // flame tongue + star at the muzzle, alternating guns so the wing flickers
        if ((this.flashSide++ + i) % 2 === 0) {
          const big = view === 'cockpit' ? 0.75 : 1.1;
          fx.glow.spawn({ pos: _p.copy(muzzle).addScaledVector(dir, 0.35), vel: p.vel, life: 0.035, size0: 0.35 * big, size1: 0.7 * big, color0: [32, 20, 7], alpha0: 1, alpha1: 0, frame: 1 });
          fx.glow.spawn({ pos: _p.copy(muzzle).addScaledVector(dir, 0.9), vel: p.vel, life: 0.03, size0: 0.22 * big, size1: 0.45 * big, color0: [24, 12, 3], alpha0: 0.9, alpha1: 0, frame: 2, rotVel: 0 });
        }
        if (Math.random() < 0.18 * n) fx.gunSmoke(muzzle, _p.copy(p.vel).multiplyScalar(0.92));
        // casings and links out of the chutes under the wing, just aft of the guns
        for (let k = 0; k < n; k++) {
          const chute = p.localToWorld(_p.set(g.offset.x * 0.98, g.offset.y - 0.12, g.offset.z - 0.5));
          this.spawnCasing(chute, p, false);
          if (k % 2 === 0) this.spawnCasing(chute, p, true);
        }
      }
      // wing guns light the wing up now and then
      if (shots > 0 && Math.random() < dt * 9) {
        const g = p.guns[Math.floor(Math.random() * p.guns.length)];
        fx.flashLight(p.localToWorld(g.offset, new THREE.Vector3()), view === 'cockpit' ? 18 : 30, 0.05);
      }
      // extra report: the outboard guns' rattle layered under Sound.playerGun's cadence
      if (shots > 0) {
        this.soundAcc += dt;
        if (this.soundAcc > 0.075) {
          this.soundAcc = 0;
          sound.play('m2far', null, { gain: view === 'cockpit' ? 0.22 : 0.3, rate: 0.85 + Math.random() * 0.15, delay: false });
        }
      }
    }
    this.shotsPerSec += ((dt > 0 ? shots / dt : 0) - this.shotsPerSec) * Math.min(1, dt * 10);
    const target = THREE.MathUtils.clamp(this.shotsPerSec / 60, 0, 1);
    this.kick += (target - this.kick) * Math.min(1, dt * (target > this.kick ? 25 : 8));
    this.updateCasings(dt, camPos);
  }

  private spawnCasing(at: THREE.Vector3, p: Fighter, link: boolean) {
    if (this.parts.length >= MAX * 2) this.parts.shift();
    // positions are kept in the meshes' local frame, so floating-origin rebases carry them along
    const mesh = link ? this.linkMesh : this.casingMesh;
    const pos = at.clone().sub(mesh.position);
    const down = _s.set(0, -1, 0).applyQuaternion(p.quat);
    const vel = p.vel.clone().addScaledVector(down, 4 + Math.random() * 3).add(_v.set(R(), R(), R()).multiplyScalar(1.2));
    this.parts.push({ pos, vel, rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6), spin: new THREE.Vector3(R() * 30, R() * 30, R() * 30), life: CASE_LIFE * (0.7 + Math.random() * 0.3), link });
  }

  private updateCasings(dt: number, camPos: THREE.Vector3) {
    let nc = 0, nl = 0;
    const sc = this.casingScale;
    for (const c of this.parts) {
      c.life -= dt;
      if (c.life <= 0) continue;
      // tiny and draggy: they stop dead in the slipstream and fall away behind the wing
      c.vel.multiplyScalar(Math.exp(-dt * 2.2));
      c.vel.y -= 9.81 * dt;
      c.pos.addScaledVector(c.vel, dt);
      c.rot.x += c.spin.x * dt; c.rot.y += c.spin.y * dt; c.rot.z += c.spin.z * dt;
      const mesh = c.link ? this.linkMesh : this.casingMesh;
      // grow with distance a little so they don't vanish into single pixels
      const d = _p.copy(c.pos).add(mesh.position).distanceTo(camPos);
      const k = sc * THREE.MathUtils.clamp(d / 12, 1, 3);
      _m.compose(c.pos, _q.setFromEuler(_e.copy(c.rot)), _s.setScalar(k));
      if (c.link) { if (nl < MAX) this.linkMesh.setMatrixAt(nl++, _m); }
      else if (nc < MAX) this.casingMesh.setMatrixAt(nc++, _m);
    }
    this.parts = this.parts.filter((c) => c.life > 0);
    this.casingMesh.count = nc; this.linkMesh.count = nl;
    if (nc) this.casingMesh.instanceMatrix.needsUpdate = true;
    if (nl) this.linkMesh.instanceMatrix.needsUpdate = true;
  }
}
