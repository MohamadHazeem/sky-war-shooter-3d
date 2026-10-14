import * as THREE from 'three';
import type { EscapeEntry } from './B17DamageRules';
import { bailOutCanopy } from './BailOutCanopy';
import type { Engine } from '../core/Engine';
import type { Input } from '../core/Input';
import type { UI } from '../ui/UI';
import type { World } from '../world/World';
import type { Bomber } from '../world/Aircraft';
import type { GunnerController } from './GunnerController';
import type { ParticleOpts } from '../render/Particles';
import { STATIONS } from '../world/B17Layout';
import { sound } from '../audio/Sound';

// The gunner's B-17 is going down: a ~7.6 s sequence before the debrief.
//  1. At the gun (0 - CUT): the ship rolls over and the horizon tilts, smoke and fire pour
//     into the compartment, the alarm bell rings, the crew start going out of the hatches.
//  2. The jump (CUT): a fade through black, the camera leaves the gun position.
//  3. Under the chute (CUT - TOTAL): third person, free fall, the canopy snaps open, then the
//     burning bomber falls away from you while the crew's chutes blossom around it.
// Space / Enter / Esc skips to the debrief. Driven from Game.updateBailOut (ending state),
// so it freezes with the game. The per-frame path does not allocate.

export const BAIL_TOTAL = 7.6;   // s, the whole sequence (Game's ending timer)
const CUT = 3.1;                 // s, the jump
const FADE = 0.35;               // s, fade to black before the jump (and back after it)
const OPEN = 1.05;               // s after the jump the canopy opens
const SKIP_AFTER = 0.6;          // s before a key can skip (no accidental skip while firing)
const BELL_STRIKES = 5, BELL_GAP = 0.62;

const TICK = 0.035;

const C_SMOKE: [number, number, number] = [0.06, 0.055, 0.05];
const C_SMOKE1: [number, number, number] = [0.13, 0.12, 0.11];
const C_FLAME: [number, number, number] = [10, 4, 0.9];
const C_FLAME1: [number, number, number] = [2, 0.4, 0.05];

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);
const _x = new THREE.Vector3(1, 0, 0);
const _yUp = new THREE.Vector3(0, 1, 0);
const R = () => Math.random() * 2 - 1;
const O: ParticleOpts = { pos: _p, life: 1, size0: 1, size1: 1, color0: C_SMOKE };
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export interface BailFrame { jolt: number; flash: number; done: boolean }

let styled = false;
function cineDom(on: boolean) {
  if (!styled) {
    styled = true;
    const st = document.createElement('style');
    st.textContent = `
#swsCine { position: fixed; inset: 0; pointer-events: none; z-index: 7; opacity: 0; transition: opacity .5s; }
#swsCine::before, #swsCine::after { content: ''; position: absolute; left: 0; right: 0; height: 9vh; background: #000; }
#swsCine::before { top: 0; } #swsCine::after { bottom: 0; }
body.sws-cine #swsCine { opacity: 1; }
body.sws-cine #hudCanvas, body.sws-cine #hud > :not(#subs):not(#banner):not(#tip) { opacity: 0 !important; transition: opacity .4s; }`;
    document.head.appendChild(st);
    const d = document.createElement('div');
    d.id = 'swsCine';
    document.body.appendChild(d);
  }
  document.body.classList.toggle('sws-cine', on);
}

export class BailOutCinematic {
  private t = -1;
  private canopy = bailOutCanopy();
  private out: BailFrame = { jolt: 0, flash: 0, done: false };
  private engine: Engine | null = null;
  private world: World | null = null;
  private gunner: GunnerController | null = null;
  private ui: UI | null = null;
  private b: Bomber | null = null;
  private rollDir = 1;
  private bell = 0;
  private crew = 0;
  private manifest: EscapeEntry[] = [];
  private acc = 0;
  private lightT = 0;
  private sparkT = 0.5;
  private outside = false;
  private opened = false;
  private side = 1;
  private camVel = new THREE.Vector3();
  private lookQ = new THREE.Quaternion(); // smoothed look at the bomber, before the sway is added
  private stationId = 'waistL';
  private hint = false;

  get active() { return this.t >= 0; }

  start(engine: Engine, world: World, gunner: GunnerController, ui: UI, manifest: readonly EscapeEntry[]) {
    this.engine = engine; this.world = world; this.gunner = gunner; this.ui = ui;
    this.b = world.playerBomber;
    this.manifest = manifest.filter(m => m.escaped && !m.player).sort((a, b) => a.at - b.at);
    this.t = 0;
    this.bell = 0; this.crew = 0; this.acc = 0; this.lightT = 0; this.sparkT = 0.5;
    this.outside = false; this.opened = false; this.hint = false;
    this.stationId = gunner.station;
    this.side = STATIONS[gunner.station].pivot.x >= 0 ? 1 : -1;
    // roll toward the wing with the dead engines (asymmetric thrust), otherwise at random
    const b = this.b;
    const leftDead = b ? (b.engineDead[0] ? 1 : 0) + (b.engineDead[1] ? 1 : 0) : 0;
    const rightDead = b ? (b.engineDead[2] ? 1 : 0) + (b.engineDead[3] ? 1 : 0) : 0;
    // positive roll (about +Z) drops the right wing (-X); a dead left wing drops the left
    this.rollDir = leftDead > rightDead ? -1 : rightDead > leftDead ? 1 : Math.random() < 0.5 ? -1 : 1;
    cineDom(false);
    sound.alarmBell(BELL_STRIKES, BELL_GAP);
  }

  stop() {
    if (this.t < 0) return;
    this.t = -1;
    this.canopy.removeFromParent(); this.canopy.visible = false;
    cineDom(false);
    this.ui?.fadeTo(0);
  }

  // Advance the sequence; call after the gunner has placed the camera for this frame.
  update(dt: number, input: Input): BailFrame {
    const o = this.out;
    o.jolt = 0; o.flash = 0; o.done = false;
    if (this.t < 0 || !this.engine || !this.world) { o.done = true; return o; }
    const prev = this.t;
    this.t += dt;
    const t = this.t;
    if (t > SKIP_AFTER && !this.hint) { this.hint = true; this.ui?.tip('<kbd>Space</kbd> skip', 2600); }
    if (t > SKIP_AFTER && (input.hit('Space') || input.hit('Enter') || input.hit('Escape'))) { this.stop(); o.done = true; return o; }
    if (t >= BAIL_TOTAL) { this.stop(); o.done = true; return o; }

    const b = this.b && !this.b.remove ? this.b : null;
    // alarm strikes jolt the camera and flash red
    if (this.bell < BELL_STRIKES && t >= this.bell * BELL_GAP) { this.bell++; o.jolt = 0.4; o.flash = 0.55; }
    // crew going out of the hatches
    while (this.crew < this.manifest.length && t >= this.manifest[this.crew].at) { this.crew++; if (b) this.releaseChute(b); }

    if (b) {
      // the ship rolls over, nose dropping, faster as it goes
      b.spin.set(0.05 + t * 0.012, 0.02 * this.rollDir, this.rollDir * Math.min(0.62, 0.1 + t * 0.11));
    }

    if (!this.outside) {
      this.inside(dt, b, t, o);
      // fade through black into the jump
      if (t > CUT - FADE) this.ui?.fadeTo(Math.min(1, (t - (CUT - FADE)) / FADE));
      if (t >= CUT && prev < CUT) this.jump(b);
    }
    if (this.outside) this.under(dt, b, t - CUT, o);
    return o;
  }

  // ---------- 1. at the gun ----------
  private inside(dt: number, b: Bomber | null, t: number, o: BailFrame) {
    const cam = this.engine!.camera;
    const k = smooth(0, CUT, t);
    // the horizon tilts further than the ship alone shows: the gunner is thrown about
    cam.rotateZ(-this.rollDir * 0.16 * k + Math.sin(t * 2.3) * 0.03 * k);
    cam.rotateX(Math.sin(t * 1.7 + 0.5) * 0.025 * k);
    o.flash = Math.max(o.flash, 0.22 + 0.18 * Math.sin(t * 9) * k);
    if (!b) return;
    const fx = this.world!.effects;
    this.acc += dt;
    if (this.acc < TICK) return;
    const step = this.acc;
    this.acc = 0;
    cam.getWorldDirection(_f);
    _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const smokeOk = fx.smoke.count < 8000, glowOk = fx.glow.count < 4400;
    // smoke rolling through the compartment, thicker as the fire takes hold: puffs in view,
    // drifting aft with the draught from the open windows and rising
    const nSmoke = 1 + Math.floor(k * 4);
    if (smokeOk) for (let i = 0; i < nSmoke; i++) {
      const d = 0.6 + Math.random() * 2.2;
      _p.copy(cam.position).addScaledVector(_f, d).addScaledVector(_r, R() * 0.9 * d * 0.6).addScaledVector(_u, R() * 0.5 * d * 0.5);
      O.pos = _p;
      O.vel = this.flow(b, 1.2 + Math.random() * 2.5);
      O.life = 1 + Math.random() * 0.8; O.size0 = 0.25 + k * 0.3; O.size1 = 1.3 + k * 1.6;
      O.color0 = C_SMOKE; O.color1 = C_SMOKE1; O.alpha0 = 0.3 + 0.45 * k; O.alpha1 = 0;
      O.frame = 0; O.drag = 0; O.rise = 0.6; O.lit = true; O.rotVel = R() * 0.8;
      fx.smoke.spawn(O);
    }
    // the fire: forward in the compartment (bomb bay / radio room), flames licking along
    // the floor into view once it has taken hold
    const src = this.fireSource(b, _p);
    if (glowOk) for (let i = 0; i < 2; i++) {
      _r.set(R() * 0.5, Math.random() * 0.3, R() * 0.5);
      O.pos = _r.add(src);
      O.vel = this.flow(b, 1 + Math.random());
      O.life = 0.25 + Math.random() * 0.2; O.size0 = 0.5 + Math.random() * 0.5; O.size1 = 0.2;
      O.color0 = C_FLAME; O.color1 = C_FLAME1; O.alpha0 = 1; O.alpha1 = 0;
      O.frame = 2; O.drag = 0; O.rise = 1.5; O.lit = false; O.rotVel = 3;
      fx.glow.spawn(O);
    }
    if (glowOk && t > 1.3 && Math.random() < 0.3 + 0.5 * k) {
      // a tongue of flame low in the picture
      _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
      _p.copy(cam.position).addScaledVector(_f, 1.4 + Math.random() * 1.2).addScaledVector(_r, R() * 0.8).addScaledVector(_u, -0.55 - Math.random() * 0.3);
      O.pos = _p; O.vel = this.flow(b, 0.6);
      O.life = 0.3 + Math.random() * 0.2; O.size0 = 0.3 + Math.random() * 0.35; O.size1 = 0.12;
      O.color0 = C_FLAME; O.color1 = C_FLAME1; O.alpha0 = 0.9; O.alpha1 = 0;
      O.frame = 2; O.drag = 0; O.rise = 2; O.lit = false; O.rotVel = 4;
      fx.glow.spawn(O);
    }
    // firelight flickering on the compartment walls
    this.lightT -= step;
    if (this.lightT <= 0) {
      this.lightT = 0.09;
      this.fireSource(b, _p);
      fx.flashLight(_p, 20 + 35 * k + Math.random() * 25, 0.13, 0xff7a30);
    }
    // sparks from torn wiring and wind-blown debris
    this.sparkT -= step;
    if (this.sparkT <= 0) {
      this.sparkT = 0.35 + Math.random() * 0.5;
      _p.copy(cam.position).addScaledVector(_f, 1.2 + Math.random() * 1.5).addScaledVector(_u, R() * 0.4);
      fx.sparks(_p, b.vel, false);
      _r.copy(_f).negate();
      this.world!.bomberDamage.interiorDebris(_p, _r, 4);
    }
  }

  // Airflow inside the ship: its own velocity, aft and slightly up, plus a swirl (scratch)
  private flowV = new THREE.Vector3();
  private flow(b: Bomber, aft: number) {
    b.forward(this.flowV);
    this.flowV.multiplyScalar(-aft).add(b.vel);
    this.flowV.x += R() * 0.6; this.flowV.y += R() * 0.6 + 0.3; this.flowV.z += R() * 0.6;
    return this.flowV;
  }

  // Where the fire burns, relative to the gun position (model frame -> world, into out)
  private fireSource(b: Bomber, out: THREE.Vector3) {
    const st = STATIONS[this.stationId as keyof typeof STATIONS];
    const dz = st.id === 'tail' ? 3.2 : st.id === 'top' ? -2.4 : st.id === 'ball' ? 1.6 : 2.6;
    out.set(st.pivot.x * 0.3, st.id === 'top' ? 0.2 : -0.35, st.pivot.z + dz);
    return b.localToWorld(out, out);
  }

  private releaseChute(b: Bomber) {
    // crew leave through the waist, bomb bay and tail hatches: scattered along the fuselage
    const exit = new THREE.Vector3(R() * 3.5, -1.2 + Math.random() * 0.8, -5 + Math.random() * 7);
    this.world!.effects.parachute(b.localToWorld(exit), b.vel.clone().multiplyScalar(0.5));
  }

  // ---------- 2. the jump ----------
  private jump(b: Bomber | null) {
    this.outside = true;
    this.gunner?.detach(); // the gun position is left behind; the ship's own model shows again
    cineDom(true);
    const eng = this.engine!, cam = eng.camera;
    eng.post.dofStrength = 0;
    eng.post.noBlurDist = 1e6;
    if (cam.parent !== eng.scene) eng.scene.add(cam);
    this.lookQ.copy(cam.quaternion);
    if (b) {
      // out of the hatch on the gunner's side, below and behind the waist
      b.localToWorld(_p.set(this.side * 3.5, -5, -9), cam.position);
      this.camVel.copy(b.vel).multiplyScalar(0.6);
      this.camVel.y -= 3;
      this.lookAt(b, 1);
    }
    sound.play('whoosh', null, { gain: 1.1, rate: 0.8 });
  }

  // ---------- 3. under the chute ----------
  private under(dt: number, b: Bomber | null, u: number, o: BailFrame) {
    const eng = this.engine!, cam = eng.camera;
    // fade back in from the black of the jump
    if (u < FADE + 0.1) this.ui?.fadeTo(Math.max(0, 1 - u / FADE));
    if (u >= OPEN) { if (this.canopy.parent !== cam) cam.add(this.canopy); this.canopy.visible = true; }
    // free fall, then the canopy snaps open and the descent settles to ~6 m/s
    if (u < OPEN) {
      this.camVel.y -= 9.81 * dt;
      this.camVel.multiplyScalar(Math.exp(-0.45 * dt));
    } else {
      if (!this.opened) { this.opened = true; o.jolt = 0.8; sound.play('whoosh', null, { gain: 0.6, rate: 1.3 }); }
      const k = 1 - Math.exp(-2.4 * dt);
      this.camVel.x += (2 - this.camVel.x) * k;
      this.camVel.y += (-6 - this.camVel.y) * k;
      this.camVel.z += (0 - this.camVel.z) * k;
    }
    cam.position.addScaledVector(this.camVel, dt);
    if (b) this.lookAt(b, 1 - Math.exp(-dt * (u < 0.2 ? 30 : 5)));
    // tumbling in free fall, a slow pendulum under the canopy
    const swing = u < OPEN ? 0.32 * Math.sin(u * 5.3) * (1 - u / OPEN) : 0.08 * Math.sin((u - OPEN) * 1.4) * Math.exp(-(u - OPEN) * 0.25);
    cam.quaternion.copy(this.lookQ).multiply(_qz.setFromAxisAngle(_z, swing));
    cam.quaternion.multiply(_qz.setFromAxisAngle(_x, u < OPEN ? 0.12 * Math.sin(u * 4.1) : 0.03 * Math.sin((u - OPEN) * 1.1)));
    // a documentary zoom keeps the falling ship large in frame
    cam.fov = 64 - 30 * smooth(0.4, 4.2, u);
    cam.updateProjectionMatrix();
    eng.post.dofStrength = 0;
    eng.post.noBlurDist = 1e6;
  }

  // Turn the camera toward the bomber (k = 0..1 blend)
  private lookAt(b: Bomber, k: number) {
    const cam = this.engine!.camera;
    _p.copy(b.pos).addScaledVector(b.vel, 0.12);
    _m.lookAt(cam.position, _p, _yUp);
    _q.setFromRotationMatrix(_m);
    if (k >= 1) this.lookQ.copy(_q); else this.lookQ.slerp(_q, k);
    cam.quaternion.copy(this.lookQ);
  }
}
