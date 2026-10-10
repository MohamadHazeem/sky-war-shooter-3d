import * as THREE from 'three';
import type { Fighter } from './Aircraft';
import type { World } from './World';
import type { ParticleOpts, ParticleSystem } from '../render/Particles';
import { sound } from '../audio/Sound';
import { Atmos } from '../render/Atmosphere';

// How a shot-down enemy fighter dies. One of six endings is picked at random, weighted by
// what killed it (the zone that was shot away, or the last zone hit when the structure
// gave out), and the previous ending is made less likely so kills keep varying:
//
//   fireball    mid-air explosion: blown into four burning sections, two follow-up blasts
//   wing        a wing panel shears off; the fuselage autorotates down toward the stump
//   tail        the tail is shot away; the fuselage noses over into a vertical dive
//   engineFire  engine on fire: rolls over, dives trailing flame and black smoke, and
//               explodes a few seconds later or as it reaches the cloud deck
//   bailout     the canopy flies off, the pilot jumps, the empty fighter spirals away smoking
//   limp        cockpit hit: the fighter flies on dead for a moment, slowly drops a wing
//               and falls into a spin
//
// The first three replace the aircraft with Wrecks pieces at once. The last three keep the
// aircraft on its `falling` path (Fighter.update integrates gravity and the body-rate
// `spin`); the sequences here steer that spin and velocity every frame. Scoring is
// untouched: World.killAircraft credits the kill before calling startFighterDeath.
// All emitters are throttled to fixed ticks, thinned with distance and capped against the
// particle pools; the per-frame path allocates nothing.

export type DeathKind = 'fireball' | 'wing' | 'tail' | 'engineFire' | 'bailout' | 'limp';
type SeqKind = 'engineFire' | 'bailout' | 'limp';

const KINDS: DeathKind[] = ['fireball', 'wing', 'tail', 'engineFire', 'bailout', 'limp'];
// weights per cause, in KINDS order
const W_WING = [0.25, 0.75, 0, 0, 0, 0];
const W_TAIL = [0.2, 0, 0.8, 0, 0, 0];
const W_ENGINE = [0.25, 0, 0, 0.5, 0.25, 0];
const W_FIRE = [0.3, 0, 0, 0.55, 0.15, 0];
const W_COCKPIT = [0.2, 0, 0, 0, 0, 0.8];
const W_FUSELAGE = [0.3, 0.12, 0.15, 0.2, 0.15, 0.08];
const W_OTHER = [0.3, 0.1, 0.1, 0.2, 0.15, 0.15];
const REPEAT = 0.4;      // weight factor for the ending used last time

const MAX_SEQ = 8;       // concurrent scripted (non-instant) deaths; beyond this, instant ones only
const TICK = 0.05;       // s between emitter ticks (near)
const TICK_MID = 0.1;    // s beyond MID
const MID = 1200;        // m
const FAR = 2500;        // m: no trail emission beyond this
const SMOKE_HARD = 8200; // smoke pool (9000) fill above which trails stop
const GLOW_HARD = 4300;  // glow pool (5000)
const CHUTE_SCALE = 2.4; // enemy pilots' chutes drawn larger, like the 4.2x fighters

interface Seq {
  f: Fighter;
  w: World;
  kind: SeqKind;
  age: number;
  acc: number;
  dir: 1 | -1;      // roll / spin direction
  phase: number;    // engineFire: end of the roll-over; limp: start of the spin
  boomAt: number;   // engineFire: timed explosion (Infinity: wait for the cloud deck)
  jumpAt: number;   // bailout: pilot leaves
  canopy: boolean;  // bailout: canopy gone
  jumped: boolean;
}

interface Pending { t: number; chute: boolean; pos: THREE.Vector3; vel: THREE.Vector3; k: number; w: World }

const active: Seq[] = [];
const pending: Pending[] = [];
let owned = new WeakSet<Fighter>();
let last = -1;

// scratch
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _l = new THREE.Vector3();
const _fw = new THREE.Vector3();
const _h = new THREE.Vector3();
const _d = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _q = new THREE.Quaternion();
const R = () => Math.random() * 2 - 1;
const ENG = new THREE.Vector3(0, 0.3, 0.75);  // model-frame (unscaled) top of the cowling
const COCKPIT = new THREE.Vector3(0, 0.7, -1.3);

// colours (no per-spawn tuples)
const C_FLAME: [number, number, number] = [10, 4, 0.9];
const C_FLAME1: [number, number, number] = [2, 0.4, 0.05];
const C_CORE: [number, number, number] = [16, 7, 1.6];
const C_COLUMN: [number, number, number] = [0.035, 0.03, 0.028];
const C_OIL1: [number, number, number] = [0.13, 0.12, 0.115];
const C_SMOKE: [number, number, number] = [0.2, 0.19, 0.18];
const C_SMOKE1: [number, number, number] = [0.32, 0.31, 0.3];
const C_GLYCOL: [number, number, number] = [0.85, 0.85, 0.84];
const C_GLINT: [number, number, number] = [38, 24, 9];
const C_GLINT1: [number, number, number] = [8, 2, 0.5];
const C_PUFF: [number, number, number] = [0.3, 0.28, 0.25];

const O: ParticleOpts = { pos: _p, life: 1, size0: 1, size1: 1, color0: C_SMOKE };
function emit(sys: ParticleSystem, pos: THREE.Vector3, vel: THREE.Vector3 | undefined, life: number, s0: number, s1: number,
  c0: [number, number, number], c1: [number, number, number] | undefined, a0: number, frame: number, drag: number, rise: number, lit: boolean, rotVel?: number) {
  O.pos = pos; O.vel = vel; O.life = life; O.size0 = s0; O.size1 = s1; O.color0 = c0; O.color1 = c1;
  O.alpha0 = a0; O.alpha1 = 0; O.frame = frame; O.drag = drag; O.rise = rise; O.lit = lit; O.rotVel = rotVel;
  sys.spawn(O);
}

// True while a scripted death owns this fighter's trails (World/DamageStages skip their
// generic falling fire for it).
export function deathOwned(f: Fighter) { return owned.has(f); }
// The scripted ending a downed fighter is flying ('bailout': the pilot jumps and lives), or null
// for the instant ones (fireball, wing or tail shot away). Read by game/NemesisRuntime.ts.
export function deathKindOf(f: Fighter): string | null { for (const s of active) if (s.f === f) return s.kind; return null; }

function pick(cause: string): DeathKind {
  const base = cause === 'wingL' || cause === 'wingR' ? W_WING : cause === 'tail' ? W_TAIL : cause === 'engine' ? W_ENGINE
    : cause === 'fire' ? W_FIRE : cause === 'cockpit' ? W_COCKPIT : cause === 'fuselage' ? W_FUSELAGE : W_OTHER;
  let sum = 0, live = 0;
  const w = _wts;
  for (let i = 0; i < KINDS.length; i++) {
    let x = base[i];
    if (i >= 3 && active.length >= MAX_SEQ) x = 0;
    if (x > 0) live++;
    w[i] = x;
  }
  if (live > 1 && last >= 0 && w[last] > 0) w[last] *= REPEAT;
  for (let i = 0; i < w.length; i++) sum += w[i];
  if (sum <= 0) return 'fireball';
  let r = Math.random() * sum;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0 && w[i] > 0) { last = i; return KINDS[i]; } }
  last = 0;
  return 'fireball';
}
const _wts = [0, 0, 0, 0, 0, 0];

function shake(w: World, pos: THREE.Vector3, k: number) {
  if (w.player) w.events.shake?.(Math.max(0, 1 - pos.distanceTo(w.player.pos) / 300) * k);
}
// Bf 110 / Ju 88 go up in a bigger, two-stage blast (Effects 'heavy')
const blastKind = (f: Fighter) => (f.enemyType === 'bf110' || f.enemyType === 'ju88' ? 'heavy' : 'fighter');
// the twins and the He 111 go up in a multi-stage boom (Sound.explode stages)
const blastSound = (f: Fighter) => (f.enemyType === 'bf110' || f.enemyType === 'ju88' || f.enemyType === 'he111' || f.enemyType === 'me410' ? 'heavy' : undefined);
function debrisSound(w: World, pos: THREE.Vector3) {
  if (w.player && pos.distanceTo(w.player.pos) < 500) sound.play('debris', pos, { gain: 0.7, ref: 40 });
}
function later(w: World, t: number, chute: boolean, pos: THREE.Vector3, vel: THREE.Vector3, k: number) {
  if (pending.length >= 24) return;
  pending.push({ t, chute, pos: pos.clone(), vel: vel.clone(), k, w });
}

// Called from World.killAircraft for an axis fighter, after it has been marked dead and
// credited. `cause` is the zone that was shot away / last hit ('engine', 'cockpit',
// 'fuselage', 'tail', 'wingL', 'wingR') or 'fire'.
export function startFighterDeath(f: Fighter, cause: string, w: World) {
  const fx = w.effects;
  const sc = f.model.scale.x;
  const kind = pick(cause);

  if (kind === 'fireball') {
    w.wrecks.break(f, 'blowup');
    f.remove = true;
    fx.explosion(f.pos, f.vel, 1.5, blastKind(f));
    // fuel tanks and ammunition going up a beat later: two more blasts in the cloud of wreckage
    for (let i = 0; i < 2; i++) {
      const t = i === 0 ? 0.15 + Math.random() * 0.15 : 0.4 + Math.random() * 0.3;
      _p.set(R(), R() * 0.6, R()).multiplyScalar(2.2 * sc).add(f.pos);
      later(w, t, false, _p, f.vel, 0.55 + Math.random() * 0.2);
    }
    sound.play('explosion', f.pos, { gain: 1.6, ref: 160, reverb: 0.75, size: blastSound(f) });
    shake(w, f.pos, 1);
    debrisSound(w, f.pos);
    return;
  }

  if (kind === 'wing' || kind === 'tail') {
    const side = cause === 'wingL' ? 1 : cause === 'wingR' ? -1 : Math.random() < 0.5 ? 1 : -1;
    const brk = kind === 'tail' ? 'tail' : side > 0 ? 'wingL' : 'wingR';
    if (kind === 'tail') _l.set(0, 0.2, -4.3 * sc);
    else _l.set(1.05 * sc * side, -0.2, 0);
    f.localToWorld(_l, _p);
    w.wrecks.break(f, brk);
    f.remove = true;
    fx.explosion(_p, f.vel, 0.5);
    fx.sparks(_p, f.vel, true);
    fx.spawnDebris(_p, f.vel, 5, false);
    sound.play('explosion', f.pos, { gain: 1.0, ref: 100, reverb: 0.6 });
    shake(w, f.pos, 0.7);
    debrisSound(w, f.pos);
    if (Math.random() < 0.35) later(w, 1.5 + Math.random() * 1.5, true, f.pos, f.vel, 1);
    return;
  }

  // scripted: the aircraft stays whole on its falling path
  owned.add(f);
  f.spin.set(0, 0, 0);
  const s: Seq = {
    f, w, kind, age: 0, acc: 0, dir: Math.random() < 0.5 ? 1 : -1, phase: 0, boomAt: Infinity, jumpAt: 0, canopy: false, jumped: false,
  };
  if (kind === 'engineFire') {
    s.phase = 0.9 + Math.random() * 0.4;
    s.boomAt = Math.random() < 0.7 ? 3.2 + Math.random() * 2.3 : Infinity;
    const eng = f.zone('engine');
    if (eng) eng.burning = true;
    f.localToWorld(_l.copy(ENG).multiplyScalar(sc), _p);
    fx.explosion(_p, f.vel, 0.4);
    fx.spawnDebris(_p, f.vel, 4, true);
    sound.play('explosion', _p, { gain: 0.7, ref: 80, reverb: 0.5 });
    shake(w, _p, 0.4);
  } else if (kind === 'bailout') {
    s.jumpAt = 0.8 + Math.random() * 0.5;
    f.localToWorld(_l.copy(ENG).multiplyScalar(sc), _p);
    fx.sparks(_p, f.vel, true);
    fx.spawnDebris(_p, f.vel, 3, false);
    for (let i = 0; i < 4; i++) {
      _v.set(R(), R(), R()).multiplyScalar(8).add(f.vel);
      emit(fx.smoke, _p, _v, 2.2, 1.5 * sc / 2.4, 7 * sc / 2.4, C_PUFF, undefined, 0.8, 0, 1.5, 0, true);
    }
    sound.play('hitHeavy', _p, { gain: 1.0, ref: 80 });
  } else {
    // cockpit hit: perspex blown out, the pilot slumps
    s.phase = 3.2 + Math.random() * 1.2;
    f.localToWorld(_l.copy(COCKPIT).multiplyScalar(sc), _p);
    glassBurst(f, fx, _p, 8);
    fx.sparks(_p, f.vel, true);
    sound.play('glass', _p, { gain: 0.9, ref: 70 });
    sound.play('hitHeavy', _p, { gain: 0.8, ref: 70 });
  }
  active.push(s);
}

// Perspex blown out of the cockpit: the canopy glass disappears in a spray of glints
function glassBurst(f: Fighter, fx: World['effects'], at: THREE.Vector3, n: number) {
  const glass = f.model.getObjectByName('glass');
  if (glass) glass.visible = false;
  if (fx.glow.count >= GLOW_HARD) return;
  const k = f.model.scale.x / 2.4;
  for (let i = 0; i < n; i++) {
    _v.set(R(), R() + 0.8, R()).normalize().multiplyScalar(12 + Math.random() * 18).add(f.vel);
    emit(fx.glow, at, _v, 0.5 + Math.random() * 0.4, 0.4 * k, 0.15 * k, C_GLINT, C_GLINT1, 0.7, 1, 1.2, -9, false);
  }
}

// Body-rate spin (Fighter.update applies it in the aircraft frame) that turns the nose
// toward a dive of nose.y = diveY on the current heading, plus a roll about the nose and
// a yaw about the world vertical.
function steer(f: Fighter, diveY: number, pitchRate: number, roll: number, yawW: number) {
  f.forward(_fw);
  _h.set(_fw.x, 0, _fw.z);
  const hl = _h.length();
  if (hl < 1e-3) _h.set(1, 0, 0); else _h.divideScalar(hl);
  _d.copy(_h).multiplyScalar(Math.sqrt(Math.max(0, 1 - diveY * diveY)));
  _d.y = diveY;
  _ax.crossVectors(_fw, _d);
  const s = _ax.length();
  const ang = Math.atan2(s, _fw.dot(_d));
  const rate = Math.min(pitchRate, ang * 2.5);
  if (s > 1e-5) _ax.multiplyScalar(rate / s); else _ax.set(0, 0, 0);
  _ax.y += yawW;
  _ax.applyQuaternion(_q.copy(f.quat).invert());
  f.spin.set(_ax.x, _ax.y, _ax.z + roll);
}

// The flight path bends after the nose (follow, 1/s); speed eases toward cruise, faster nose-down
function fly(f: Fighter, dt: number, follow: number, cruise: number) {
  f.forward(_fw);
  const sp = f.vel.length();
  const target = cruise + 110 * Math.max(0, -_fw.y);
  const ns = sp + (target - sp) * (1 - Math.exp(-0.6 * dt));
  if (sp > 1e-3) f.vel.multiplyScalar(ns / sp);
  _v.copy(_fw).multiplyScalar(ns);
  f.vel.lerp(_v, 1 - Math.exp(-follow * dt));
}

function boom(s: Seq) {
  const { f, w } = s;
  w.wrecks.break(f, 'blowup');
  w.effects.explosion(f.pos, f.vel, 1.3, blastKind(f));
  sound.play('explosion', f.pos, { gain: 1.5, ref: 150, reverb: 0.75, size: blastSound(f) });
  shake(w, f.pos, 0.9);
  debrisSound(w, f.pos);
  f.remove = true;
}

// Per frame, from World.update (after the aircraft have moved)
export function updateFighterDeath(dt: number) {
  // delayed blasts and parachutes
  let n = 0;
  for (const e of pending) {
    e.t -= dt;
    e.pos.addScaledVector(e.vel, dt * (e.chute ? 0.8 : 0.6));
    if (e.chute) e.pos.y -= 4.2 * dt * Math.max(0, 2 - e.t);
    if (e.t > 0) { pending[n++] = e; continue; }
    if (e.chute) e.w.effects.parachute(e.pos, _v.copy(e.vel).multiplyScalar(0.3), CHUTE_SCALE);
    else {
      e.w.effects.explosion(e.pos, e.vel, e.k);
      e.w.effects.sparks(e.pos, e.vel, true);
      sound.play('explosion', e.pos, { gain: 0.9, ref: 110, reverb: 0.6 });
    }
  }
  pending.length = n;

  n = 0;
  for (const s of active) {
    const f = s.f;
    if (f.remove || !f.root.parent) { owned.delete(f); continue; }
    s.age += dt;
    const t = s.age;
    if (s.kind === 'engineFire') {
      if (t < s.phase) { steer(f, -0.25, 0.35, 2.9 * s.dir, 0); fly(f, dt, 1, 150); }
      else { steer(f, -0.85, 1.1, 0.5 * s.dir, 0); fly(f, dt, 1.4, 150); }
      const cloud = t > 1.2 && f.pos.y < Atmos.lowTop + 60; // just before it vanishes into the deck
      if (t >= s.boomAt || cloud || t > 12) { boom(s); owned.delete(f); continue; }
    } else if (s.kind === 'bailout') {
      if (t < s.jumpAt + 0.3) { steer(f, -0.05, 0.2, 0, 0); fly(f, dt, 1.2, 140); }
      else { steer(f, -0.45, 0.5, 0.9 * s.dir, 0.35 * s.dir); fly(f, dt, 1, 120); }
      if (!s.canopy && t > 0.3) {
        s.canopy = true;
        f.localToWorld(_l.copy(COCKPIT).multiplyScalar(f.model.scale.x), _p);
        glassBurst(f, s.w.effects, _p, 6);
        s.w.effects.spawnDebris(_p, f.vel, 2, false); // the canopy frame tumbling away
      }
      if (!s.jumped && t > s.jumpAt) {
        s.jumped = true;
        const sc = f.model.scale.x;
        f.localToWorld(_l.copy(COCKPIT).multiplyScalar(sc), _p);
        _p.addScaledVector(f.up(_v), 1.2 * sc);
        _v.multiplyScalar(7).addScaledVector(f.vel, 0.35);
        _v.y += 4;
        s.w.effects.parachute(_p, _v, CHUTE_SCALE);
      }
    } else {
      if (t < 0.7) { f.spin.set(0, 0, 0); fly(f, dt, 1.5, 150); }
      else if (t < s.phase) {
        const r = Math.min(1, (t - 0.7) / (s.phase - 0.7));
        steer(f, -0.3, 0.18, s.dir * (0.1 + 0.6 * r), 0);
        fly(f, dt, 1.2, 130);
      } else {
        const r = Math.min(1, (t - s.phase) / 1.5);
        steer(f, -0.7, 0.8, s.dir * 1.2 * r, s.dir * 2.2 * r);
        fly(f, dt, 1.2 - 0.85 * r, 70);
      }
    }
    trails(s, dt);
    active[n++] = s;
  }
  active.length = n;
}

// Continuous trails per ending, on fixed ticks, thinned with range and capped by pool fill
function trails(s: Seq, dt: number) {
  const f = s.f, fx = s.w.effects;
  const L = s.w.listener;
  const dist = L ? f.pos.distanceTo(L) : 0;
  if (dist > FAR) return;
  s.acc += dt;
  if (s.acc < (dist > MID ? TICK_MID : TICK)) return;
  s.acc = 0;
  const sc = f.model.scale.x, k = sc / 2.4;
  const smokeOk = fx.smoke.count < SMOKE_HARD, glowOk = fx.glow.count < GLOW_HARD;
  f.localToWorld(_l.copy(ENG).multiplyScalar(sc), _p);
  _v.copy(f.vel).multiplyScalar(0.25);
  if (s.kind === 'engineFire') {
    // a long tongue of flame streaming back off the cowling, and a dense black column
    if (glowOk) {
      for (let i = 0; i < 3; i++) {
        _d.copy(_p).addScaledVector(f.vel, -Math.random() * 0.04);
        _d.x += R() * 0.5 * k; _d.y += R() * 0.4 * k; _d.z += R() * 0.5 * k;
        emit(fx.glow, _d, _v, 0.5 + Math.random() * 0.35, 2.8 * k, 0.9 * k, i ? C_FLAME : C_CORE, C_FLAME1, 1, 2, 0, 0, false, 3);
      }
    }
    if (smokeOk) emit(fx.smoke, _p, _v, 10, 2.6 * k, 16 * k, C_COLUMN, C_OIL1, 0.92, 0, 0.6, 0.3, true);
  } else if (s.kind === 'bailout') {
    // pilotless, engine wrecked: a steady grey-black smoke trail, no fire
    if (smokeOk) emit(fx.smoke, _p, _v, 8, 1.8 * k, 12 * k, C_SMOKE, C_SMOKE1, 0.75, 0, 0.6, 0.35, true);
  } else if (smokeOk) {
    // limp: a thin white stream of glycol from the holed radiator, thickening as it spins
    const a = Math.min(1, s.age / 3);
    emit(fx.smoke, _p, _v, 5, 0.9 * k, (5 + 4 * a) * k, C_GLYCOL, undefined, 0.35 + 0.2 * a, 0, 0.8, 0.4, true);
  }
}

// Floating-origin shift: pending blast/parachute positions are plain world vectors
export function rebaseFighterDeath(off: THREE.Vector3) {
  for (const e of pending) e.pos.sub(off);
}

// World reset
export function clearFighterDeath() {
  active.length = 0;
  pending.length = 0;
  owned = new WeakSet();
  last = -1;
}
