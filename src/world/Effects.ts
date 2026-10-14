import * as THREE from 'three';
import { disposeOwned, markOwned } from '../render/Dispose';
import { ParticleSystem, type ParticleOpts } from '../render/Particles';
import { chuteTexture } from '../render/ChuteTexture';
import { VolumeFX, shockLight, type Vol } from '../render/Explosions';
import { heatHaze } from '../render/HeatHaze';
import { cloudLights } from '../render/CloudLights';
import { weatherNow } from '../render/WeatherState';
import { Flares } from './Flares';

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const R = () => Math.random() * 2 - 1;

// Explosion classes, by what blew up. 'small' covers partial blasts (a wing shearing off,
// engine fires, explosive rounds, bomber secondaries); 'boss' is a warship (warshipBlast).
export type ExplosionKind = 'small' | 'fighter' | 'heavy' | 'boss';

interface Debris {
  mesh: THREE.Object3D; vel: THREE.Vector3; spin: THREE.Vector3; life: number; max: number;
  smoke: boolean; fire: boolean; acc: number; fAcc: number; active: boolean; pooled: boolean;
}
interface Chute { obj: THREE.Group; vel: THREE.Vector3; life: number; open: number; phase: number }
interface LightSlot { light: THREE.PointLight; life: number; max: number; intensity: number }
interface Pending { t: number; pos: THREE.Vector3; vel: THREE.Vector3; k: number; kind: 0 | 1 | 2; active: boolean }

const LIGHTS = 4;          // fixed combat-light count: lights never change the shader programs
const DEBRIS_POOL = 72;
const PENDING_MAX = 48;
const VOL_FAR = 4500;      // m: beyond this explosions are particles only
const VOL_MID = 1800;      // m: beyond this no sub-lobes, shock rings or debris
const SMOKE_HARD = 8300;   // smoke particle pool (9000) fill above which trails thin out

const C_FLAME0: [number, number, number] = [9, 3.6, 0.8];
const C_FLAME1: [number, number, number] = [1.6, 0.3, 0.05];
const C_TRAIL: [number, number, number] = [0.08, 0.075, 0.07];
const C_EMBER: [number, number, number] = [24, 11, 2.5];
const C_EMBER1: [number, number, number] = [6, 1.4, 0.2];
const C_FLASH: [number, number, number] = [32, 24, 13];
const C_HALO: [number, number, number] = [2.4, 1.3, 0.5];
const C_CLOUDGLOW: [number, number, number] = [0.5, 0.24, 0.07];
const C_DUST: [number, number, number] = [0.48, 0.41, 0.29];
const C_GUN_SMOKE: [number, number, number] = [0.55, 0.55, 0.55];
const C_WISP0: [number, number, number] = [0.11, 0.07, 0.045];
const C_WISP1: [number, number, number] = [0.085, 0.08, 0.075];
const C_TFIRE1: [number, number, number] = [2, 0.4, 0.05];
// scratch colours for jittered puffs (spawn copies them)
const _f0: [number, number, number] = [0, 0, 0];
const _f1: [number, number, number] = [0, 0, 0];

// Visual effects layer: volumetric fireballs and smoke balls, shock rings, combat light,
// smoke/fire/flash particles, burning debris, falling drop tanks, parachutes.
export class Effects {
  readonly smoke = new ParticleSystem(9000, false);
  readonly glow = new ParticleSystem(5000, true);
  readonly vol = new VolumeFX(128);
  readonly flares: Flares;   // parachute flares / target markers (night)
  // false: the older particle-only explosions (A/B comparisons, very weak GPUs)
  volumetric = true;
  private debris: Debris[] = [];
  private chutes: Chute[] = [];
  private lights: LightSlot[] = [];
  private figureGeo = new THREE.CapsuleGeometry(0.25, 1.0, 4, 8);
  private pending: Pending[] = [];
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
  // reusable particle options for the per-frame emitters (no allocation per spawn)
  private o: ParticleOpts = { pos: new THREE.Vector3(), life: 1, size0: 1, size1: 1, color0: [1, 1, 1] };

  constructor(private scene: THREE.Scene) {
    scene.add(this.smoke.mesh, this.glow.mesh, this.vol.mesh);
    const g = new THREE.SphereGeometry(3.4, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42);
    this.chuteGeo = g;
    for (let i = 0; i < LIGHTS; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 45, 2);
      l.userData.noRebase = true;
      scene.add(l);
      this.lights.push({ light: l, life: 0, max: 1, intensity: 0 });
    }
    // debris meshes live in the scene, hidden, and are reused
    for (let i = 0; i < DEBRIS_POOL; i++) {
      const m = new THREE.Mesh(this.debrisGeo[i % this.debrisGeo.length], this.debrisMat[(i >> 2) % this.debrisMat.length]);
      m.castShadow = true;
      m.visible = false;
      scene.add(m);
      this.debris.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, max: 1, smoke: false, fire: false, acc: 0, fAcc: 0, active: false, pooled: true });
    }
    for (let i = 0; i < PENDING_MAX; i++) this.pending.push({ t: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), k: 1, kind: 0, active: false });
    this.flares = new Flares(this.glow, (pos, intensity, range, color) => this.steadyLight(pos, intensity, range, color));
  }

  // Fill the shared options object for one particle
  private emit(sys: ParticleSystem, pos: THREE.Vector3, vel: THREE.Vector3 | undefined, life: number, s0: number, s1: number,
    c0: [number, number, number], c1: [number, number, number] | undefined, a0: number, a1: number, frame: number, drag: number, rise: number, lit: boolean, rotVel?: number, age = 0) {
    const o = this.o;
    o.pos = pos; o.vel = vel; o.life = life; o.size0 = s0; o.size1 = s1; o.color0 = c0; o.color1 = c1;
    o.alpha0 = a0; o.alpha1 = a1; o.frame = frame; o.drag = drag; o.rise = rise; o.lit = lit; o.rotVel = rotVel; o.age = age;
    sys.spawn(o);
  }

  // ---------------- combat light ----------------
  // A pool of LIGHTS point lights that never leaves the scene (intensity 0 when idle), so
  // the light count, and with it every lit shader program, stays constant. A new flash
  // takes a free light, or replaces the one contributing least to what the camera sees.
  flashLight(pos: THREE.Vector3, intensity: number, life: number, color = 0xffaa55, range = 45) {
    const cam = this.vol.camPos, seen = this.vol.hasCam;
    const weight = (p: THREE.Vector3, r: number) => (seen ? 1 / (1 + p.distanceToSquared(cam) / (r * r)) : 1);
    let pick: LightSlot | null = null, low = Infinity;
    for (let i = 0; i < LIGHTS; i++) {
      const s = this.lights[i];
      if (i === LIGHTS - 1 && this.steadyFrames > 0) continue;   // held by a flare
      if (s.life <= 0) { pick = s; low = -1; break; }
      const k = s.life / s.max;
      const v = s.intensity * k * k * weight(s.light.position, s.light.distance);
      if (v < low) { low = v; pick = s; }
    }
    if (!pick || (low >= 0 && low > intensity * weight(pos, range))) return;
    pick.light.color.set(color);
    pick.light.position.copy(pos);
    pick.light.distance = range;
    pick.light.intensity = intensity;
    pick.intensity = intensity;
    pick.life = pick.max = life;
  }

  // A steady light this frame (the nearest burning flare): takes the pool's last slot while it is
  // refreshed every frame, so the light count never changes
  private steadyFrames = 0;
  steadyLight(pos: THREE.Vector3, intensity: number, range: number, color: number) {
    const s = this.lights[LIGHTS - 1];
    s.life = 0;
    s.light.position.copy(pos);
    s.light.intensity = intensity;
    s.light.distance = range;
    s.light.color.setHex(color);
    this.steadyFrames = 2;
  }

  // Guns firing right by the camera (the player's own): the glass catches the flash, and at
  // night the flash lights the cockpit / turret around it
  private nearMuzzle(pos: THREE.Vector3, k: number) {
    weatherNow.muzzle = Math.min(1, weatherNow.muzzle + 0.45 * k);
    if (weatherNow.dark > 0.3) this.flashLight(pos, 70 * k * weatherNow.dark, 0.05, 0xffa860, 9);
  }

  // The player's own muzzle: short, dim flame tongues ahead of the muzzle, so the
  // ring sight is never washed out
  playerMuzzle(pos: THREE.Vector3, dir: THREE.Vector3, vel: THREE.Vector3) {
    _p.copy(pos).addScaledVector(dir, 0.25);
    this.glow.spawn({ pos: _p, vel, life: 0.03, size0: 0.16, size1: 0.26, color0: [7, 4, 1.5], alpha0: 1, alpha1: 0, frame: 2, rotVel: 0 });
    this.nearMuzzle(pos, 1);
  }

  muzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3, scale = 1, vel?: THREE.Vector3) {
    if (this.vol.hasCam && pos.distanceToSquared(this.vol.camPos) < 400) this.nearMuzzle(pos, 0.8);
    this.glow.spawn({ pos, vel, life: 0.05, size0: 0.55 * scale, size1: 0.9 * scale, color0: [40, 26, 10], alpha0: 1, alpha1: 0, frame: 1 });
    _p.copy(pos).addScaledVector(dir, 0.35 * scale);
    this.glow.spawn({ pos: _p, vel, life: 0.04, size0: 0.4 * scale, size1: 0.7 * scale, color0: [30, 16, 4], alpha0: 1, alpha1: 0, frame: 1 });
    // heavy guns (enemy cannon, bomber turrets, warship batteries) flicker light on what is near
    if (scale >= 1.4) this.flashLight(pos, 45 * scale * scale, 0.06, 0xffb060, 14 * scale);
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
    this.flashLight(pos, 260, 0.07, 0xffb366, 40);
  }

  gunSmoke(pos: THREE.Vector3, vel: THREE.Vector3) {
    this.emit(this.smoke, pos, vel, 0.9, 0.3, 1.6, C_GUN_SMOKE, undefined, 0.16, 0, 0, 2.5, 0, true);
  }

  groundDust(pos: THREE.Vector3) {
    _v.set(R() * 3, 0.6, R() * 3); _p.copy(pos); _p.x += R() * 9; _p.z += R() * 9; _p.y = 0.3;
    this.emit(this.smoke, _p, _v, 2.8, 1.2, 7, C_DUST, undefined, 0.42, 0, 0, 1.3, 0.2, true);
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
      this.flashLight(pos, 900, 0.12, 0xffaa55, 70);
    } else {
      this.smoke.spawn({ pos, vel, life: 0.6, size0: 0.3, size1: 1.6, color0: [0.35, 0.33, 0.3], alpha0: 0.5, alpha1: 0, drag: 2, lit: true });
    }
  }

  // Continuous trail from a damaged engine: level 0..1 (white glycol -> gray -> black oil smoke), fire adds flames.
  // Callers emit every ~0.05-0.07 s; span is the time since the last call. The puffs are spread back
  // along the path flown since then (stratified jitter, varied size and brightness), each one already
  // as old as it would be had it been emitted there, so a fast aircraft or wreck leaves a continuous
  // ribbon of flame and smoke rather than a row of evenly spaced beads (dotted orange lines at night).
  // from: where the emitter was at the last call, when the caller knows (a tumbling wreck's emitter
  // swings round its centre, so its path is not a straight line along vel).
  trail(pos: THREE.Vector3, vel: THREE.Vector3, level: number, fire: boolean, scale = 1, span = 0.06, from?: THREE.Vector3) {
    const far = this.vol.hasCam ? pos.distanceTo(this.vol.camPos) : 0;
    // the puffs drift with a quarter of the emitter's velocity: relative to them it moved 3/4 of it
    let back = vel.length() * 0.75 * span;
    // a from point that is far off the path (floating-origin shift, first call) is ignored
    const seg = from ? pos.distanceTo(from) : 0;
    if (from && seg > back * 3 + 20) from = undefined;
    else if (from) back = Math.max(back, seg * 0.75);
    _v.copy(vel).multiplyScalar(0.25);
    if (fire) {
      const s0 = 1.9 * scale;
      // flame puffs about a third of their size apart along that path (far away two do: sub-pixel
      // gaps); the denser they are, the fainter each one, so the ribbon keeps its brightness
      const n = far < 2500 ? Math.min(18, Math.max(2, Math.ceil(back / (s0 * 0.3)))) : 2;
      const thin = Math.min(1, Math.max(0.55, back / n / (s0 * 0.5)));
      for (let i = 0; i < n; i++) {
        const t = ((i + Math.random()) / n) * span;
        this.trailAt(pos, vel, t, span, from);
        const k = 0.75 + Math.random() * 0.5, hot = 0.7 + Math.random() * 0.45;
        _f0[0] = 10 * hot; _f0[1] = 4 * hot; _f0[2] = 0.9 * hot;
        this.emit(this.glow, _p, _v, 0.35 + Math.random() * 0.25, s0 * k, 0.9 * scale * k, _f0, C_TFIRE1, (0.75 + Math.random() * 0.25) * thin, 0, 2, 0, 0, false, 3, t);
      }
    }
    const dark = Math.min(1, level * 1.3);
    const c = 0.75 - dark * 0.68;
    if (fire) { _f1[0] = 0.07; _f1[1] = 0.065; _f1[2] = 0.06; } else { _f1[0] = c; _f1[1] = c; _f1[2] = c * 0.98; }
    // near the camera two smoke puffs per call, so the young (still small) trail head is continuous too
    const ns = far < 900 && this.smoke.count < 6000 ? 2 : 1;
    for (let i = 0; i < ns; i++) {
      const t = ns > 1 ? ((i + Math.random()) / ns) * span : 0;
      this.trailAt(pos, vel, t, span, from);
      const k = 0.85 + Math.random() * 0.3;
      this.emit(this.smoke, _p, _v, 5 + level * 6, (1.2 + level * 1.5) * scale * k, (6 + level * 10) * scale * k, _f1, undefined,
        (0.25 + level * 0.55) * (ns > 1 ? 0.72 : 1) * (0.85 + Math.random() * 0.3), 0, 0, 0.6, 0.4, true, undefined, t);
    }
  }

  // _p = where a trail puff emitted t s ago is now: on the emitter's path then (straight back along
  // vel, or between from and pos), plus the quarter of vel it has drifted since
  private trailAt(pos: THREE.Vector3, vel: THREE.Vector3, t: number, span: number, from?: THREE.Vector3) {
    if (from) _p.lerpVectors(pos, from, Math.min(1, t / Math.max(span, 1e-4))).addScaledVector(vel, 0.25 * t);
    else _p.copy(pos).addScaledVector(vel, -0.75 * t);
  }

  // Size of explosions relative to the aircraft (the enemies are drawn enlarged)
  explosionScale = 1;

  private later(t: number, pos: THREE.Vector3, vel: THREE.Vector3, k: number, kind: 0 | 1 | 2) {
    for (const p of this.pending) {
      if (p.active) continue;
      p.active = true; p.t = t; p.pos.copy(pos); p.vel.copy(vel); p.k = k; p.kind = kind;
      return;
    }
  }

  // ---------------- volumetric pieces ----------------
  // Rolling fireball: hot (white-yellow) at birth, cooling through orange and dark red to
  // black smoke within ~1.2 s while it swells and breaks up, then fading.
  private fireball(pos: THREE.Vector3, vel: THREE.Vector3, r: number, heat = 1.35, tau = 0.38, delay = 0, life = 3.2): Vol | null {
    const s = this.vol.alloc(3);
    if (!s) return null;
    s.pos.copy(pos); s.vel.copy(vel);
    s.delay = delay; s.life = life;
    s.r0 = r * 0.55; s.r1 = r * 1.5; s.growTau = 0.16; s.growth = r * 0.07;
    s.heat0 = heat; s.tau = tau; s.grey = 0.06; s.dens = 1.5;
    s.billow0 = 0.7; s.billow1 = 1.2; s.drag = 2.2; s.rise = r * 0.05;
    s.fadeIn = 0.03; s.fadeOut = 0.55;
    return s;
  }

  // Lingering smoke ball: drifts with the wind and climbs a little, lit by the sun
  private smokeBall(pos: THREE.Vector3, vel: THREE.Vector3, r: number, life: number, grey = 0.085, delay = 0.25, warm = 0.3): Vol | null {
    const s = this.vol.alloc(1);
    if (!s) return null;
    s.pos.copy(pos); s.vel.copy(vel).multiplyScalar(0.5);
    s.delay = delay; s.life = life;
    s.r0 = r * 0.7; s.r1 = r * 1.9; s.growTau = 2.2; s.growth = r * 0.035;
    s.heat0 = warm; s.tau = 0.5; s.grey = grey; s.dens = 1.1;
    s.billow0 = 1.0; s.billow1 = 1.35; s.drag = 0.8; s.rise = 0.25 + r * 0.02; s.windK = 1;
    s.fadeIn = 0.6; s.fadeOut = 0.55;
    return s;
  }

  // Shockwave: a thin shell racing out, bright only along its rim
  private shock(pos: THREE.Vector3, vel: THREE.Vector3, r: number, life = 0.42, bright = 1) {
    const s = this.vol.alloc(2);
    if (!s) return;
    s.type = 1;
    s.pos.copy(pos); s.vel.copy(vel); s.drag = 0.5;
    s.life = life; s.r0 = r * 0.25; s.r1 = r; s.growTau = life * 0.35;
    s.heat0 = bright; s.fadeIn = 0.01; s.fadeOut = 0;
  }

  // Shared body of every volumetric blast. r = fireball radius (m).
  private blast(pos: THREE.Vector3, vel: THREE.Vector3, r: number, lobes: number, shock: number, smokeBalls: number, smokeLife: number,
    embers: number, light: number, range: number, glowSprite: boolean, smokeDelay = 0.25) {
    const dist = this.vol.camDist(pos);
    const mid = dist > VOL_MID;
    if (mid) { lobes = Math.min(lobes, 1); embers = Math.ceil(embers / 3); if (r < 25) shock = 0; }
    if (this.vol.free < 24) { lobes = Math.min(lobes, 1); smokeBalls = Math.min(smokeBalls, 1); }
    // flash: a white-hot core for a few frames and a broad warm halo
    this.emit(this.glow, pos, vel, 0.09, r * 1.1, r * 2.4, C_FLASH, undefined, 1, 0, 1, 0, 0, false, 0);
    this.emit(this.glow, pos, vel, 0.16, r * 1.8, r * 3.2, C_HALO, undefined, 0.7, 0, 1, 0, 0, false, 0);
    if (glowSprite) this.emit(this.glow, pos, vel, 0.75, r * 6, r * 9, C_CLOUDGLOW, undefined, 0.8, 0, 1, 0, 0, false, 0);
    this.flashLight(pos, light, 0.5, 0xff8a3a, range);
    cloudLights.flash(pos, 1.0, 0.48, 0.18, 3, 120 + r * 10, 0.7);   // the cloud around it glows (night)
    this.fireball(pos, vel, r);
    for (let i = 0; i < lobes; i++) {
      _d.set(R(), R() * 0.7, R()).normalize();
      _p.copy(pos).addScaledVector(_d, r * (0.35 + Math.random() * 0.35));
      _v.copy(vel).addScaledVector(_d, r * (0.9 + Math.random() * 1.1));
      const f = this.fireball(_p, _v, r * (0.45 + Math.random() * 0.25), 1.05 + Math.random() * 0.3, 0.28 + Math.random() * 0.2, Math.random() * 0.12, 2.4 + Math.random() * 0.8);
      if (f) f.drag = 2.8;
    }
    if (shock > 0) this.shock(pos, vel, r * shock);
    for (let i = 0; i < smokeBalls; i++) {
      _d.set(R(), R() * 0.5 + 0.2, R()).normalize();
      _p.copy(pos).addScaledVector(_d, i === 0 ? 0 : r * 0.6);
      this.smokeBall(_p, vel, r * (i === 0 ? 1 : 0.75), smokeLife * (0.8 + Math.random() * 0.4), 0.075 + Math.random() * 0.03, smokeDelay + i * 0.15);
    }
    // burning fragments arcing away
    for (let i = 0; i < embers; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar((30 + Math.random() * 70) * Math.sqrt(r / 5)).add(vel);
      this.emit(this.glow, pos, _v, 0.7 + Math.random() * 1.1, 0.5 * Math.sqrt(r / 5), 0.12, C_EMBER, C_EMBER1, 1, 0, 1, 1.4, -9, false);
    }
    // a few soft particle wisps around the ball so its edge never reads as a hard sphere
    if (!mid) {
      for (let i = 0; i < 4; i++) {
        _v.set(R(), R(), R()).normalize().multiplyScalar(r * (0.3 + Math.random() * 0.6)).add(_p.copy(vel).multiplyScalar(0.6));
        this.emit(this.smoke, pos, _v, 6 + Math.random() * 4, r * 0.6, r * (2 + Math.random()), C_WISP0, C_WISP1, 0.5, 0, 0, 1.2, 0.4, true);
      }
    }
  }

  explosion(pos: THREE.Vector3, vel: THREE.Vector3, scale = 1, kind?: ExplosionKind) {
    if (!this.volumetric) { this.legacyExplosion(pos, vel, scale); return; }
    const k = scale * this.explosionScale;
    kind ??= scale < 0.6 ? 'small' : 'fighter';
    if (kind === 'boss') { this.warshipBlast(pos, vel, k / 2); return; }
    const dist = this.vol.camDist(pos);
    if (dist > VOL_FAR) { this.farBlast(pos, vel, k); return; }
    if (dist < 900) heatHaze.emit(pos, (kind === 'heavy' ? 26 : 18) * k, 1, 0.5); // shock ripple (HeatHaze.ts)
    const near = dist < VOL_MID;
    if (kind === 'heavy') {
      // Bf 110 / Ju 88: two engines and a full fuel load, a bigger ball and a second stage
      const r = 6.3 * k;
      this.blast(pos, vel, r, 5, 3.8, 3, 16, Math.round(36 * scale), 10000 * k, 160 + 60 * k, true);
      if (near) this.spawnDebris(pos, vel, Math.round(14 * scale), true);
      _v.set(R(), R() * 0.5, R()).normalize().multiplyScalar(r * 0.8);
      this.later(0.2 + Math.random() * 0.12, _p.copy(pos).add(_v), vel, k * 0.6, 0);
      _v.set(R(), R() * 0.5, R()).normalize().multiplyScalar(r * 0.9);
      this.later(0.45 + Math.random() * 0.25, _p.copy(pos).add(_v), vel, k * 0.45, 0);
    } else if (kind === 'fighter') {
      const r = 5 * k;
      this.blast(pos, vel, r, 3, 3.3, 2, 13, Math.round(26 * scale), 6000 * k, 120 + 50 * k, false);
      if (near) this.spawnDebris(pos, vel, Math.floor(12 * scale), true);
      // fuel and ammunition cooking off a moment later: two or three smaller pops
      const n = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        _v.set(R(), R() * 0.6, R()).normalize().multiplyScalar((4 + Math.random() * 6) * k);
        this.later(0.12 + Math.random() * 0.55, _p.copy(pos).add(_v), vel, k * (0.35 + Math.random() * 0.2), 0);
      }
    } else {
      const r = 4.4 * k;
      this.blast(pos, vel, r, k > 1 ? 1 : 0, k > 1.2 ? 3.5 : 0, 1, 9, Math.round(18 * scale), 5000 * k, 70 + 40 * k, false);
      if (near) this.spawnDebris(pos, vel, Math.floor(12 * scale), true);
    }
  }

  // Far away: a flash, a fireball sprite and a smoke puff are all that read at this range
  private farBlast(pos: THREE.Vector3, vel: THREE.Vector3, k: number) {
    cloudLights.flash(pos, 1.0, 0.48, 0.18, 2.6, 120 + k * 40, 0.6);
    this.emit(this.glow, pos, vel, 0.12, 8 * k, 16 * k, C_FLASH, undefined, 1, 0, 1, 0, 0, false, 0);
    this.emit(this.glow, pos, vel, 0.8, 9 * k, 15 * k, C_FLAME0, C_FLAME1, 0.95, 0, 2, 0, 0, false, 0.6);
    for (let i = 0; i < 3; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar(4 * k).add(vel);
      this.emit(this.smoke, pos, _v, 10 + Math.random() * 5, 6 * k, 22 * k, C_WISP0, C_WISP1, 0.9, 0, 0, 1, 0.4, true);
    }
  }

  // Cook-off pop a beat after the main blast
  private pop(pos: THREE.Vector3, vel: THREE.Vector3, k: number) {
    if (!this.volumetric) { this.legacyPop(pos, vel, k); return; }
    if (this.vol.camDist(pos) > VOL_FAR) { this.farBlast(pos, vel, k * 0.7); return; }
    const r = 4.2 * k;
    this.flashLight(pos, 3500 * k, 0.25, 0xff9944, 60 + 40 * k);
    this.emit(this.glow, pos, vel, 0.08, r * 1.2, r * 2.2, C_FLASH, undefined, 1, 0, 1, 0, 0, false, 0);
    this.fireball(pos, vel, r, 1.2, 0.3, 0, 2.4);
    this.smokeBall(pos, vel, r * 0.9, 9 + Math.random() * 3, 0.08, 0.2);
  }

  // Warship-sized blast (k ~1..5): a huge multi-stage fireball, shockwave, a rolling smoke
  // cloud and secondary explosions marching out from the first one
  warshipBlast(pos: THREE.Vector3, vel: THREE.Vector3, k: number) {
    if (!this.volumetric) { this.legacyWarshipBlast(pos, vel, k); return; }
    const r = 13 * k;
    if (this.vol.camDist(pos) < 2500) heatHaze.emit(pos, 2.4 * r, 1, 0.7);
    const lobes = Math.min(7, 3 + Math.floor(k));
    this.blast(pos, vel, r, lobes, k >= 2.5 ? 4 : 3, k >= 3 ? 3 : 2, 22, 24, 9000 * k, 300 + 120 * k, true, 0.7);
    this.spawnDebris(pos, vel, Math.round(12 * Math.min(1, 0.4 + k * 0.2)), true);
    if (k >= 3) {
      const n = 3 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        _v.set(R(), R() * 0.5, R()).normalize().multiplyScalar(r * (0.9 + Math.random() * 0.6));
        this.later(0.15 + i * 0.22 + Math.random() * 0.15, _p.copy(pos).add(_v), vel, k * 0.5, 2);
      }
    }
  }

  // Secondary blast of a warship stage
  private stage(pos: THREE.Vector3, vel: THREE.Vector3, k: number) {
    const r = 13 * k;
    this.blast(pos, vel, r, 2, 0, 1, 18, 10, 6000 * k, 200 + 100 * k, false, 0.6);
  }

  // Flak burst: a brief orange core inside a dark, swelling puff, a spray of fast glowing
  // fragments, and sometimes a smaller second burst a moment later.
  flak(pos: THREE.Vector3) {
    this.flakBurst(pos, 1, true);
    if (Math.random() < 0.3) {
      _v.set(R(), R() * 0.5 + 0.2, R()).normalize().multiplyScalar(8 + Math.random() * 8);
      this.later(0.2 + Math.random() * 0.35, _p.copy(pos).add(_v), _d.set(0, 0, 0), 0.55 + Math.random() * 0.25, 1);
    }
  }

  private flakBurst(pos: THREE.Vector3, scale: number, core: boolean) {
    // a brief orange glow inside the cloud it bursts in or near (CloudLights; dark skies only)
    cloudLights.flash(pos, 1.0, 0.55, 0.22, 3 * scale, 150 * scale, 0.35);
    if (!this.volumetric || this.vol.camDist(pos) > VOL_FAR) { this.legacyFlakBurst(pos, scale, core); return; }
    this.flashLight(pos, 2600 * scale, 0.16, 0xffaa66, 110);
    if (core) this.glow.spawn({ pos, life: 0.1, size0: 5, size1: 11, color0: [40, 22, 8], alpha0: 1, alpha1: 0, frame: 1 });
    // fragment spray: hot streaks thrown out fast, bent down by gravity and slowed by drag
    const nF = Math.round((8 + Math.random() * 7) * scale);
    for (let i = 0; i < nF; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar((40 + Math.random() * 60) * scale);
      const hot = 0.6 + Math.random() * 0.6;
      this.glow.spawn({ pos, vel: _v, life: 0.12 + Math.random() * 0.2, size0: 0.22 * scale, size1: 0.04, color0: [30 * hot, 18 * hot, 6 * hot], color1: [8, 2, 0.5], alpha0: 1, alpha1: 0, frame: 1, drag: 2.5, rise: -9 });
    }
    this.shock(pos, _d.set(0, 0, 0), 22 * scale, 0.3, 0.6);
    // the puff itself: near-black, a short-lived orange heart, then a slow drifting cloud
    const g = 0.015 + Math.random() * 0.035;
    const s = this.vol.alloc(1.5);
    if (s) {
      s.pos.copy(pos); s.vel.set(R(), R() * 0.5 + 0.5, R()).multiplyScalar(2.5);
      s.life = 10 + Math.random() * 5;
      s.r0 = 3 * scale; s.r1 = 8 * scale; s.growTau = 0.45; s.growth = 0.12 * scale;
      s.heat0 = 0.95; s.tau = 0.075; s.grey = g; s.dens = 1.7;
      s.billow0 = 0.8; s.billow1 = 1.25; s.drag = 1.2; s.rise = 0.25; s.windK = 1;
      s.fadeIn = 0.03; s.fadeOut = 0.5;
    }
    // 2-3 smaller lumps around it, so the burst is never a perfect ball
    const nP = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < nP; i++) {
      _v.set(R(), R() * 0.6 + 0.2, R()).normalize().multiplyScalar(4 + Math.random() * 2.5);
      const q = this.vol.alloc(1.2);
      if (!q) break;
      q.pos.copy(pos).addScaledVector(_v, scale);
      q.vel.set(R(), R() * 0.6, R()).multiplyScalar((3 + Math.random() * 4) * scale);
      q.delay = Math.random() * 0.05;
      q.life = 7 + Math.random() * 4;
      q.r0 = 2 * scale; q.r1 = (4.5 + Math.random() * 2.5) * scale; q.growTau = 0.5; q.growth = 0.1 * scale;
      q.heat0 = 0.5; q.tau = 0.06; q.grey = g + 0.02; q.dens = 1.4;
      q.billow0 = 0.9; q.billow1 = 1.3; q.drag = 1.6; q.rise = 0.2; q.windK = 1;
      q.fadeIn = 0.05; q.fadeOut = 0.5;
    }
  }

  // toward: an extra velocity added to every piece (set pieces throw debris through the formation)
  spawnDebris(pos: THREE.Vector3, vel: THREE.Vector3, count: number, burning: boolean, toward?: THREE.Vector3, panelScale = 1) {
    const sz = Math.sqrt(this.explosionScale);
    for (let i = 0; i < count; i++) {
      let d: Debris | null = null;
      for (const x of this.debris) if (x.pooled && !x.active) { d = x; break; }
      if (!d) {
        // pool exhausted: reuse the piece closest to the end of its fall
        for (const x of this.debris) if (x.pooled && (!d || x.life < d.life)) d = x;
        if (!d) return;
      }
      d.active = true;
      d.mesh.visible = true;
      d.mesh.position.copy(pos);
      d.mesh.scale.setScalar((0.6 + Math.random() * 1.4) * sz * panelScale);
      d.vel.set(R(), R() + 0.3, R()).multiplyScalar(15 + Math.random() * 30).add(vel);
      if (toward) d.vel.addScaledVector(toward, 0.75 + Math.random() * 0.5);
      d.spin.set(R(), R(), R()).multiplyScalar(8);
      d.life = d.max = 6 + Math.random() * 4;
      d.fire = burning && Math.random() < 0.35;
      d.smoke = d.fire || (burning && Math.random() < 0.45);
      d.acc = Math.random() * 0.04;
      d.fAcc = 0;
    }
  }

  // Jettisoned drop tank (the yellow 300 l tanks the Fw 190s drop before attacking)
  dropTank(obj: THREE.Object3D, vel: THREE.Vector3) {
    this.scene.add(obj);
    this.debris.push({ mesh: obj, vel: vel.clone().add(new THREE.Vector3(0, -3, 0)), spin: new THREE.Vector3(0.6, 0.1, 0.2), life: 14, max: 14, smoke: false, fire: false, acc: 0, fAcc: 0, active: true, pooled: false });
  }

  // scale > 1 draws the chute (and its jumper) larger, like the 4.2x enemy fighters, so a
  // bail-out still reads at combat range
  parachute(pos: THREE.Vector3, vel: THREE.Vector3, scale = 1) {
    const obj = new THREE.Group();
    obj.scale.setScalar(scale);
    const canopy = new THREE.Mesh(this.chuteGeo, this.chuteMat);
    canopy.position.y = 5.5;
    canopy.scale.setScalar(0.01);
    const body = new THREE.Mesh(this.figureGeo, this.figureMat);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      pts.push(new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(Math.cos(a) * 3.2, 5.5 + 0.9, Math.sin(a) * 3.2));
    }
    const lines = new THREE.LineSegments(markOwned(new THREE.BufferGeometry().setFromPoints(pts)), this.lineMat);
    lines.visible = false;
    obj.add(canopy, body, lines);
    obj.position.copy(pos);
    this.scene.add(obj);
    this.chutes.push({ obj, vel: vel.clone(), life: 60, open: -1.5 - Math.random() * 1.5, phase: Math.random() * Math.PI * 2 });
  }

  // Objects using every material this layer can spawn, for shader pre-compilation.
  // (The volume, particle and light objects are permanent scene members, so a compile of
  // the scene already covers them.)
  warmupObjects(): THREE.Object3D[] {
    const objs: THREE.Object3D[] = this.debrisGeo.map((g, i) => new THREE.Mesh(g, this.debrisMat[i % this.debrisMat.length]));
    objs.push(new THREE.Mesh(this.chuteGeo, this.chuteMat), new THREE.Mesh(this.chuteGeo, this.figureMat));
    objs.push(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), this.lineMat));
    return objs;
  }

  rebase(off: THREE.Vector3) {
    this.smoke.rebase(off);
    this.glow.rebase(off);
    this.vol.rebase(off);
    this.flares.rebase(off);
    cloudLights.rebase(off);
    for (const l of this.lights) l.light.position.sub(off);
    for (const p of this.pending) if (p.active) p.pos.sub(off);
  }

  update(dt: number) {
    this.smoke.update(dt);
    this.glow.update(dt);
    for (const p of this.pending) {
      if (!p.active) continue;
      p.t -= dt;
      p.pos.addScaledVector(p.vel, dt * 0.6);
      if (p.t > 0) continue;
      p.active = false;
      if (p.kind === 0) this.pop(p.pos, p.vel, p.k);
      else if (p.kind === 1) this.flakBurst(p.pos, p.k, false);
      else this.stage(p.pos, p.vel, p.k);
    }
    this.vol.update(dt);
    this.flares.update(dt, this.vol.hasCam ? this.vol.camPos : null);
    weatherNow.muzzle = weatherNow.muzzle > 1e-3 ? weatherNow.muzzle * Math.exp(-dt * 22) : 0;
    if (this.steadyFrames > 0 && --this.steadyFrames === 0) this.lights[LIGHTS - 1].light.intensity = 0;
    for (const s of this.lights) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const k = Math.max(0, s.life / s.max);
      s.light.intensity = s.life > 0 ? s.intensity * k * k : 0;
    }
    const cam = this.vol.camPos, seen = this.vol.hasCam;
    let ext = 0;
    for (const d of this.debris) {
      if (!d.active) continue;
      d.life -= dt;
      d.vel.y -= 9.81 * dt;
      d.vel.multiplyScalar(Math.exp(-0.25 * dt));
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt; d.mesh.rotation.z += d.spin.z * dt;
      if (d.smoke) {
        // Burning pieces leave a continuous trail. Each puff is placed where the piece was at its
        // (jittered) emission time inside this frame, on the segment flown since the last frame,
        // with varied size and density: emitted at the frame's end position, a fast fragment drew
        // evenly spaced beads (dotted orange lines at night). Thinner far away.
        const far = seen ? d.mesh.position.distanceTo(cam) : 0;
        const tick = far > 1500 ? 0.1 : 0.04;
        const burn = d.life / d.max;
        const sc = d.mesh.scale.x;
        const off = far > 3000 || this.smoke.count > SMOKE_HARD;
        d.acc += dt;
        while (d.acc >= tick) {
          d.acc -= tick * (0.6 + Math.random() * 0.8);
          if (off) continue;
          // d.acc is now how long ago (within this frame) the puff was due
          const ago = Math.min(Math.max(d.acc, 0), dt);
          _p.copy(d.mesh.position).addScaledVector(d.vel, -ago);
          const k = 0.8 + Math.random() * 0.4;
          this.emit(this.smoke, _p, undefined, 2.2 + burn * 1.6, 0.5 * sc * k, (2.2 + burn * 2.5) * sc * k, C_TRAIL, undefined, (0.35 + burn * 0.3) * (0.8 + Math.random() * 0.4), 0, 0, 0, 0.5, true, undefined, ago);
        }
        if (d.fire && burn > 0.35 && !off) {
          // flames: spaced by distance, about 0.3 of a flame's size apart along the segment
          const size = 1.1 * sc;
          const gap = size * 0.3;
          const speed = d.vel.length();
          const seg = speed * dt;
          d.fAcc += seg;
          let n = 0;
          while (d.fAcc >= gap && n < 12) {
            d.fAcc -= gap * (0.7 + Math.random() * 0.6);
            n++;
            // d.fAcc is now the distance back from the frame's end position
            const ago = Math.min(seg, Math.max(0, d.fAcc)) / Math.max(1e-3, speed);
            _p.copy(d.mesh.position).addScaledVector(d.vel, -ago);
            const k = 0.75 + Math.random() * 0.5;
            this.emit(this.glow, _p, undefined, 0.16 + Math.random() * 0.12, size * k, 0.35 * sc * k, C_FLAME0, C_FLAME1, 0.7 + Math.random() * 0.3, 0, 2, 0, 0, false, 4, ago);
          }
          if (n === 12) d.fAcc = 0;
        }
      }
      if (d.life <= 0) {
        d.active = false;
        if (d.pooled) d.mesh.visible = false;
        else { this.scene.remove(d.mesh); continue; }
      }
      if (!d.pooled) this.debris[DEBRIS_POOL + ext++] = d;
    }
    this.debris.length = DEBRIS_POOL + ext;
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
      if (c.life <= 0) { this.scene.remove(c.obj); disposeOwned(c.obj); }
    }
    if (this.chutes.some((c) => c.life <= 0)) this.chutes = this.chutes.filter((c) => c.life > 0);
  }

  clear() {
    this.smoke.clear(); this.glow.clear(); this.vol.clear();
    for (const d of this.debris) {
      d.active = false;
      if (d.pooled) d.mesh.visible = false; else this.scene.remove(d.mesh);
    }
    this.debris.length = DEBRIS_POOL;
    for (const c of this.chutes) { this.scene.remove(c.obj); disposeOwned(c.obj); }
    this.chutes = [];
    for (const p of this.pending) p.active = false;
    for (const s of this.lights) { s.life = 0; s.light.intensity = 0; }
    this.steadyFrames = 0;
    this.flares.clear();
    cloudLights.clear();
  }

  // ---------------- particle-only explosions (volumetric = false, and far LOD) ----------------
  private legacyExplosion(pos: THREE.Vector3, vel: THREE.Vector3, scale = 1) {
    const k = scale * this.explosionScale;
    this.flashLight(pos, 900 * k, 0.45, 0xff8a3a);
    this.glow.spawn({ pos, vel, life: 0.11, size0: 7 * k, size1: 18 * k, color0: [16, 9, 3.2], alpha0: 1, alpha1: 0, frame: 1 });
    this.glow.spawn({ pos, vel, life: 0.35, size0: 4 * k, size1: 40 * k, color0: [1.1, 0.9, 0.75], alpha0: 0.28 * shockLight(), alpha1: 0, frame: 3, rotVel: 0 });
    this.glow.spawn({ pos, vel, life: 0.7, size0: 9 * k, size1: 14 * k, color0: [9, 3.6, 0.9], color1: [1.4, 0.3, 0.05], alpha0: 0.95, alpha1: 0, frame: 2, rotVel: 0.6 });
    for (let i = 0; i < 24 * scale; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar((4 + Math.random() * 13) * k).add(vel);
      _p.copy(pos).addScaledVector(_v, 0.02);
      const hot = Math.random();
      this.glow.spawn({ pos: _p, vel: _v, life: 0.8 + Math.random() * 1.0, size0: (3.5 + Math.random() * 4) * k, size1: (10 + Math.random() * 9) * k,
        color0: [7 + hot * 5, 2.4 + hot * 1.8, 0.5], color1: [0.9, 0.18, 0.04], alpha0: 1, alpha1: 0, frame: 2, drag: 2.2, rise: -1.5, rotVel: (Math.random() - 0.5) * 3 });
    }
    for (let i = 0; i < 20 * scale; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar((3 + Math.random() * 10) * k).add(_p.copy(vel).multiplyScalar(0.7));
      this.smoke.spawn({ pos, vel: _v, life: 9 + Math.random() * 6, size0: 6 * k, size1: (20 + Math.random() * 16) * k, color0: [0.11, 0.065, 0.04], color1: [0.085, 0.08, 0.075], alpha0: 0.92, alpha1: 0, drag: 1.0, rise: 0.4, lit: true });
    }
    for (let i = 0; i < 30 * scale; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar((30 + Math.random() * 70) * Math.sqrt(k));
      this.glow.spawn({ pos, vel: _v.add(vel), life: 0.7 + Math.random() * 1.1, size0: 0.5 * Math.sqrt(k), size1: 0.12, color0: [24, 11, 2.5], alpha0: 1, alpha1: 0, frame: 1, drag: 1.4, rise: -9 });
    }
    this.spawnDebris(pos, vel, Math.floor(12 * scale), true);
    if (scale >= 0.8) {
      const n = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        _v.set(R(), R() * 0.6, R()).normalize().multiplyScalar((4 + Math.random() * 6) * k);
        this.later(0.12 + Math.random() * 0.55, _p.copy(pos).add(_v), vel, k * (0.35 + Math.random() * 0.2), 0);
      }
    }
  }

  private legacyPop(pos: THREE.Vector3, vel: THREE.Vector3, k: number) {
    this.flashLight(pos, 400 * k, 0.2, 0xff9944);
    for (let i = 0; i < 8; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar((3 + Math.random() * 8) * k).add(vel);
      this.glow.spawn({ pos, vel: _v, life: 0.5 + Math.random() * 0.5, size0: 3 * k, size1: 9 * k, color0: [9, 3.4, 0.7], color1: [1, 0.2, 0.04], alpha0: 1, alpha1: 0, frame: 2, drag: 2.5, rotVel: 1.5 });
    }
    for (let i = 0; i < 4; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar(4 * k).add(vel);
      this.smoke.spawn({ pos, vel: _v, life: 6 + Math.random() * 4, size0: 4 * k, size1: 14 * k, color0: [0.1, 0.06, 0.04], color1: [0.085, 0.08, 0.075], alpha0: 0.8, alpha1: 0, drag: 1.2, rise: 0.3, lit: true });
    }
  }

  // The original BossBattle.bigBlast look (particles only)
  private legacyWarshipBlast(pos: THREE.Vector3, vel: THREE.Vector3, k: number) {
    this.legacyExplosion(pos, vel, Math.min(1, 0.4 + k * 0.2));
    this.flashLight(pos, 1400 * k, 0.4, 0xff8a3a);
    for (let i = 0; i < 10; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar((6 + Math.random() * 14) * k).add(vel);
      this.glow.spawn({ pos, vel: _v, life: 0.9 + Math.random() * 0.9, size0: (8 + Math.random() * 8) * k, size1: (22 + Math.random() * 14) * k, color0: [9, 3.6, 0.8], color1: [1.2, 0.25, 0.04], alpha0: 1, alpha1: 0, frame: 2, drag: 2, rise: -1 });
    }
    for (let i = 0; i < 8; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar((4 + Math.random() * 9) * k).add(_p.copy(vel).multiplyScalar(0.6));
      this.smoke.spawn({ pos, vel: _v, life: 12 + Math.random() * 8, size0: 12 * k, size1: (40 + Math.random() * 25) * k, color0: [0.1, 0.07, 0.05], color1: [0.085, 0.08, 0.075], alpha0: 0.9, alpha1: 0, drag: 1, rise: 0.5, lit: true });
    }
  }

  private legacyFlakBurst(pos: THREE.Vector3, scale: number, core: boolean) {
    this.flashLight(pos, 700 * scale, 0.15, 0xffaa66);
    if (core) this.glow.spawn({ pos, life: 0.12, size0: 6, size1: 14, color0: [40, 22, 8], alpha0: 1, alpha1: 0, frame: 1 });
    this.glow.spawn({ pos, life: 0.35, size0: 5 * scale, size1: 10 * scale, color0: [9, 3.5, 0.8], alpha0: 1, alpha1: 0, frame: 2, rotVel: 2 });
    this.glow.spawn({ pos, life: 0.3, size0: 3 * scale, size1: 40 * scale, color0: [3, 2.6, 2.2], alpha0: 0.7 * shockLight(), alpha1: 0, frame: 3, rotVel: 0 });
    const nF = Math.round((8 + Math.random() * 7) * scale);
    for (let i = 0; i < nF; i++) {
      _v.set(R(), R(), R()).normalize().multiplyScalar((40 + Math.random() * 60) * scale);
      const hot = 0.6 + Math.random() * 0.6;
      this.glow.spawn({ pos, vel: _v, life: 0.12 + Math.random() * 0.2, size0: 0.22 * scale, size1: 0.04, color0: [30 * hot, 18 * hot, 6 * hot], color1: [8, 2, 0.5], alpha0: 1, alpha1: 0, frame: 1, drag: 2.5, rise: -9 });
    }
    const nP = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < nP; i++) {
      _v.set(R() * 4, R() * 1.5 + 1, R() * 4);
      _p.copy(pos).addScaledVector(_v, scale);
      const k = 0.7 + Math.random() * 0.7;
      const g = 0.015 + Math.random() * 0.07;
      _v.set(R(), R() * 0.6, R()).multiplyScalar((5 + Math.random() * 6) * scale);
      this.smoke.spawn({ pos: _p, vel: _v, life: 12 + Math.random() * 10, size0: 4.5 * k * scale, size1: (13 + Math.random() * 9) * k * scale,
        color0: [g, g, g], color1: [g + 0.06, g + 0.06, g + 0.06], alpha0: 0.85 + Math.random() * 0.15, alpha1: 0, drag: 1.6, rise: 0.2, lit: true });
    }
  }
}
