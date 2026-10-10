import * as THREE from 'three';
import { ParticleSystem } from '../render/Particles';
import { chuteTexture } from '../render/ChuteTexture';

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const R = () => Math.random() * 2 - 1;

interface Debris { mesh: THREE.Object3D; vel: THREE.Vector3; spin: THREE.Vector3; life: number; smoke: boolean; fire: boolean }
interface Chute { obj: THREE.Group; vel: THREE.Vector3; life: number; open: number; phase: number }
interface Light { light: THREE.PointLight; life: number; max: number; intensity: number }

// Visual effects layer: smoke/fire/flash particles, debris, falling drop tanks, parachutes.
export class Effects {
  readonly smoke = new ParticleSystem(9000, false);
  readonly glow = new ParticleSystem(5000, true);
  private debris: Debris[] = [];
  private chutes: Chute[] = [];
  private lights: Light[] = [];
  private lightPool: THREE.PointLight[] = [];
  private debrisGeo = [
    new THREE.BoxGeometry(0.9, 0.05, 0.5),
    new THREE.BoxGeometry(0.4, 0.04, 1.2),
    new THREE.TetrahedronGeometry(0.4),
    new THREE.BoxGeometry(0.25, 0.25, 0.6),
  ];
  private debrisMat = [
    new THREE.MeshStandardMaterial({ color: 0x4d5048, roughness: 0.8, metalness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.9, metalness: 0.2 }),
    new THREE.MeshStandardMaterial({ color: 0x8a8d86, roughness: 0.5, metalness: 0.6 }),
  ];
  private chuteGeo: THREE.BufferGeometry;
  private chuteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: chuteTexture(), roughness: 0.9, side: THREE.DoubleSide });
  private figureMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2a, roughness: 0.9 });
  private lineMat = new THREE.LineBasicMaterial({ color: 0x777777 });

  constructor(private scene: THREE.Scene) {
    scene.add(this.smoke.mesh, this.glow.mesh);
    const g = new THREE.SphereGeometry(3.4, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42);
    this.chuteGeo = g;
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 45, 2);
      l.userData.noRebase = true;
      l.userData.free = true;
      this.lightPool.push(l);
      scene.add(l);
    }
  }

  flashLight(pos: THREE.Vector3, intensity: number, life: number, color = 0xffaa55) {
    const l = this.lightPool.find((x) => x.userData.free) ?? this.lights.sort((a, b) => a.life - b.life)[0]?.light;
    if (!l) return;
    l.userData.free = false;
    l.color.set(color);
    l.position.copy(pos);
    l.intensity = intensity;
    this.lights = this.lights.filter((x) => x.light !== l);
    this.lights.push({ light: l, life, max: life, intensity });
  }

  // The player's own muzzle: short, dim flame tongues ahead of the muzzle, so the
  // ring sight is never washed out
  playerMuzzle(pos: THREE.Vector3, dir: THREE.Vector3, vel: THREE.Vector3) {
    _p.copy(pos).addScaledVector(dir, 0.25);
    this.glow.spawn({ pos: _p, vel, life: 0.03, size0: 0.16, size1: 0.26, color0: [7, 4, 1.5], alpha0: 1, alpha1: 0, frame: 2, rotVel: 0 });
  }

  muzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3, scale = 1, vel?: THREE.Vector3) {
    this.glow.spawn({ pos, vel, life: 0.05, size0: 0.55 * scale, size1: 0.9 * scale, color0: [40, 26, 10], alpha0: 1, alpha1: 0, frame: 1 });
    _p.copy(pos).addScaledVector(dir, 0.35 * scale);
    this.glow.spawn({ pos: _p, vel, life: 0.04, size0: 0.4 * scale, size1: 0.7 * scale, color0: [30, 16, 4], alpha0: 1, alpha1: 0, frame: 1 });
  }

  // Bright strike flash so the player sees their rounds connect, even at range
  hitFlash(pos: THREE.Vector3, vel: THREE.Vector3) {
    this.glow.spawn({ pos, vel, life: 0.09, size0: 2.6, size1: 3.6, color0: [40, 26, 10], alpha0: 1, alpha1: 0, frame: 1 });
    for (let i = 0; i < 4; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar(25 + Math.random() * 35).add(vel);
      this.glow.spawn({ pos, vel: _v, life: 0.25 + Math.random() * 0.2, size0: 0.35, size1: 0.1, color0: [30, 18, 6], alpha0: 1, alpha1: 0, frame: 1, drag: 2, rise: -9 });
    }
    // Grey-brown paint and skin puffs plus a tiny dark fragment or two, so each hit
    // reads as material breaking off the airframe. Smoke layer is normal-blended,
    // which keeps the fragments dark instead of additive-invisible.
    const puffs = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < puffs; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar(6 + Math.random() * 10).add(vel);
      this.smoke.spawn({ pos, vel: _v, life: 0.8, size0: 0.4, size1: 2.2, color0: [0.6, 0.55, 0.46], alpha0: 0.7, alpha1: 0, drag: 2.5, lit: true });
    }
    const frags = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < frags; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar(18 + Math.random() * 22).add(vel);
      this.smoke.spawn({ pos, vel: _v, life: 0.5 + Math.random() * 0.3, size0: 0.22, size1: 0.08, color0: [0.07, 0.065, 0.06], alpha0: 1, alpha1: 0.2, drag: 1.2, rise: -9 });
    }
  }

  gunSmoke(pos: THREE.Vector3, vel: THREE.Vector3) {
    this.smoke.spawn({ pos, vel, life: 0.9, size0: 0.3, size1: 1.6, color0: [0.55, 0.55, 0.55], alpha0: 0.16, alpha1: 0, drag: 2.5, lit: true });
  }

  sparks(pos: THREE.Vector3, vel: THREE.Vector3, heavy = false) {
    const n = heavy ? 10 : 5;
    for (let i = 0; i < n; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar(20 + Math.random() * 40).add(vel);
      this.glow.spawn({ pos, vel: _v, life: 0.15 + Math.random() * 0.2, size0: 0.18, size1: 0.05, color0: [30, 18, 6], color1: [8, 2, 0.5], alpha0: 1, alpha1: 0, frame: 1, drag: 3, rise: -9 });
    }
    this.glow.spawn({ pos, vel, life: 0.07, size0: heavy ? 2.5 : 1.0, size1: heavy ? 3.5 : 1.5, color0: [25, 16, 7], alpha0: 1, alpha1: 0, frame: 1 });
    if (heavy) {
      this.smoke.spawn({ pos, vel, life: 1.5, size0: 1, size1: 6, color0: [0.12, 0.11, 0.1], alpha0: 0.75, alpha1: 0, drag: 1.2, lit: true });
      this.flashLight(pos, 150, 0.1);
    } else {
      this.smoke.spawn({ pos, vel, life: 0.6, size0: 0.3, size1: 1.6, color0: [0.35, 0.33, 0.3], alpha0: 0.5, alpha1: 0, drag: 2, lit: true });
    }
  }

  // Continuous trail from a damaged engine: level 0..1 (white glycol -> gray -> black oil smoke), fire adds flames
  trail(pos: THREE.Vector3, vel: THREE.Vector3, level: number, fire: boolean, scale = 1) {
    _v.copy(vel).multiplyScalar(0.25);
    if (fire) {
      for (let i = 0; i < 2; i++) {
        _p.copy(pos).addScaledVector(vel, -Math.random() * 0.03);
        this.glow.spawn({ pos: _p, vel: _v, life: 0.35 + Math.random() * 0.25, size0: 1.9 * scale, size1: 0.7 * scale, color0: [10, 4, 0.9], color1: [2, 0.4, 0.05], alpha0: 1, alpha1: 0, frame: 2, rotVel: 3 });
      }
    }
    const dark = Math.min(1, level * 1.3);
    const c = 0.75 - dark * 0.68;
    this.smoke.spawn({
      pos, vel: _v, life: 5 + level * 6, size0: (1.2 + level * 1.5) * scale, size1: (6 + level * 10) * scale,
      color0: fire ? [0.07, 0.065, 0.06] : [c, c, c * 0.98], alpha0: 0.25 + level * 0.55, alpha1: 0, drag: 0.6, rise: 0.4, lit: true,
    });
  }

  explosion(pos: THREE.Vector3, vel: THREE.Vector3, scale = 1) {
    this.flashLight(pos, 900 * scale, 0.4, 0xff9944);
    // white-hot flash and an expanding shockwave
    this.glow.spawn({ pos, vel, life: 0.14, size0: 10 * scale, size1: 22 * scale, color0: [40, 28, 14], alpha0: 1, alpha1: 0, frame: 1 });
    this.glow.spawn({ pos, vel, life: 0.3, size0: 4 * scale, size1: 45 * scale, color0: [1.2, 1.05, 0.9], alpha0: 0.45, alpha1: 0, frame: 3, rotVel: 0 });
    // rolling fireball
    for (let i = 0; i < 22 * scale; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar((5 + Math.random() * 16) * scale).add(vel);
      _p.copy(pos).addScaledVector(_v, 0.02);
      const hot = Math.random();
      this.glow.spawn({ pos: _p, vel: _v, life: 0.5 + Math.random() * 0.8, size0: (3 + Math.random() * 4) * scale, size1: (8 + Math.random() * 7) * scale,
        color0: [9 + hot * 7, 3.6 + hot * 2.5, 0.8], color1: [1.6, 0.35, 0.06], alpha0: 1, alpha1: 0, frame: 2, drag: 2.5, rotVel: (Math.random() - 0.5) * 3 });
    }
    // black smoke, lit dirty orange underneath for a moment
    for (let i = 0; i < 18 * scale; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar((4 + Math.random() * 12) * scale).add(_p.copy(vel).multiplyScalar(0.7));
      this.smoke.spawn({ pos, vel: _v, life: 8 + Math.random() * 6, size0: 6.5 * scale, size1: (18 + Math.random() * 14) * scale, color0: [0.14, 0.08, 0.05], color1: [0.2, 0.19, 0.18], alpha0: 0.92, alpha1: 0, drag: 1.0, rise: 0.3, lit: true });
    }
    // burning fragments arcing away, each trailing sparks
    for (let i = 0; i < 30 * scale; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar(30 + Math.random() * 70);
      this.glow.spawn({ pos, vel: _v.add(vel), life: 0.6 + Math.random() * 1.0, size0: 0.5, size1: 0.12, color0: [28, 13, 3], alpha0: 1, alpha1: 0, frame: 1, drag: 1.4, rise: -9 });
    }
    this.spawnDebris(pos, vel, Math.floor(12 * scale), true);
  }

  flak(pos: THREE.Vector3) {
    this.flashLight(pos, 700, 0.15, 0xffaa66);
    this.glow.spawn({ pos, life: 0.12, size0: 6, size1: 14, color0: [40, 22, 8], alpha0: 1, alpha1: 0, frame: 1 });
    this.glow.spawn({ pos, life: 0.35, size0: 5, size1: 10, color0: [9, 3.5, 0.8], alpha0: 1, alpha1: 0, frame: 2, rotVel: 2 });
    this.glow.spawn({ pos, life: 0.3, size0: 3, size1: 40, color0: [3, 2.6, 2.2], alpha0: 0.7, alpha1: 0, frame: 3, rotVel: 0 });
    for (let i = 0; i < 9; i++) {
      _v.set(R(), R() * 0.6, R()).multiplyScalar(5 + Math.random() * 6);
      _p.copy(pos).addScaledVector(_v, 0.3);
      this.smoke.spawn({ pos: _p, vel: _v, life: 14 + Math.random() * 8, size0: 5, size1: 16 + Math.random() * 6, color0: [0.03, 0.03, 0.03], color1: [0.12, 0.12, 0.12], alpha0: 0.95, alpha1: 0, drag: 1.6, rise: 0.2, lit: true });
    }
  }

  spawnDebris(pos: THREE.Vector3, vel: THREE.Vector3, count: number, burning: boolean) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.debrisGeo[i % this.debrisGeo.length], this.debrisMat[i % this.debrisMat.length]);
      m.position.copy(pos);
      m.scale.setScalar(0.6 + Math.random() * 1.4);
      m.castShadow = true;
      this.scene.add(m);
      this.debris.push({
        mesh: m,
        vel: new THREE.Vector3(R(), R() + 0.3, R()).multiplyScalar(15 + Math.random() * 30).add(vel),
        spin: new THREE.Vector3(R(), R(), R()).multiplyScalar(8),
        life: 6 + Math.random() * 4, smoke: burning && Math.random() < 0.4, fire: burning && Math.random() < 0.25,
      });
    }
  }

  // Jettisoned drop tank (the yellow 300 l tanks the Fw 190s drop before attacking)
  dropTank(obj: THREE.Object3D, vel: THREE.Vector3) {
    this.scene.add(obj);
    this.debris.push({ mesh: obj, vel: vel.clone().add(new THREE.Vector3(0, -3, 0)), spin: new THREE.Vector3(0.6, 0.1, 0.2), life: 14, smoke: false, fire: false });
  }

  parachute(pos: THREE.Vector3, vel: THREE.Vector3) {
    const obj = new THREE.Group();
    const canopy = new THREE.Mesh(this.chuteGeo, this.chuteMat);
    canopy.position.y = 5.5;
    canopy.scale.setScalar(0.01);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.0, 4, 8), this.figureMat);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      pts.push(new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(Math.cos(a) * 3.2, 5.5 + 0.9, Math.sin(a) * 3.2));
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), this.lineMat);
    lines.visible = false;
    obj.add(canopy, body, lines);
    obj.position.copy(pos);
    this.scene.add(obj);
    this.chutes.push({ obj, vel: vel.clone(), life: 60, open: -1.5 - Math.random() * 1.5, phase: Math.random() * Math.PI * 2 });
  }

  // Objects using every material this layer can spawn, for shader pre-compilation
  warmupObjects(): THREE.Object3D[] {
    const objs: THREE.Object3D[] = this.debrisGeo.map((g, i) => new THREE.Mesh(g, this.debrisMat[i % this.debrisMat.length]));
    objs.push(new THREE.Mesh(this.chuteGeo, this.chuteMat), new THREE.Mesh(this.chuteGeo, this.figureMat));
    objs.push(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), this.lineMat));
    return objs;
  }

  rebase(off: THREE.Vector3) {
    this.smoke.rebase(off);
    this.glow.rebase(off);
    for (const l of this.lights) l.light.position.sub(off);
  }

  update(dt: number) {
    this.smoke.update(dt);
    this.glow.update(dt);
    for (const l of this.lights) {
      l.life -= dt;
      l.light.intensity = Math.max(0, l.intensity * (l.life / l.max));
      if (l.life <= 0) { l.light.intensity = 0; l.light.userData.free = true; }
    }
    this.lights = this.lights.filter((l) => l.life > 0);
    for (const d of this.debris) {
      d.life -= dt;
      d.vel.y -= 9.81 * dt;
      d.vel.multiplyScalar(Math.exp(-0.25 * dt));
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt; d.mesh.rotation.z += d.spin.z * dt;
      if (d.smoke && Math.random() < 0.5) this.smoke.spawn({ pos: d.mesh.position, life: 3, size0: 0.6, size1: 3, color0: [0.1, 0.1, 0.1], alpha0: 0.5, alpha1: 0, lit: true });
      if (d.fire && Math.random() < 0.6) this.glow.spawn({ pos: d.mesh.position, life: 0.3, size0: 1.2, size1: 0.4, color0: [9, 3.6, 0.8], alpha0: 1, alpha1: 0, frame: 2, rotVel: 4 });
      if (d.life <= 0) this.scene.remove(d.mesh);
    }
    this.debris = this.debris.filter((d) => d.life > 0);
    for (const c of this.chutes) {
      c.life -= dt;
      c.open += dt;
      const canopy = c.obj.children[0];
      if (c.open > 0) {
        const s = Math.min(1, c.open / 1.2);
        // slow, slightly out-of-phase breathing of the open canopy (+/-2.5%)
        const breath = 1 + 0.025 * Math.sin(c.open * 1.7 + c.phase);
        canopy.scale.set(s * breath, s * breath * (0.8 + 0.2 * Math.sin(c.open * 2)), s * breath);
        c.obj.children[2].visible = s > 0.5;
        // decelerate to ~6 m/s descent, drift with the wind
        c.vel.multiplyScalar(Math.exp(-2.2 * dt));
        c.vel.y += (-6 - c.vel.y) * Math.min(1, dt * 2);
        c.obj.rotation.z = Math.sin(c.open * 0.9) * 0.08;
      } else {
        c.vel.y -= 9.81 * dt;
        c.vel.multiplyScalar(Math.exp(-0.4 * dt));
      }
      c.obj.position.addScaledVector(c.vel, dt);
      if (c.life <= 0) this.scene.remove(c.obj);
    }
    this.chutes = this.chutes.filter((c) => c.life > 0);
  }

  clear() {
    this.smoke.clear(); this.glow.clear();
    for (const d of this.debris) this.scene.remove(d.mesh);
    for (const c of this.chutes) this.scene.remove(c.obj);
    this.debris = []; this.chutes = [];
    for (const l of this.lights) { l.light.intensity = 0; l.light.userData.free = true; }
    this.lights = [];
  }
}
