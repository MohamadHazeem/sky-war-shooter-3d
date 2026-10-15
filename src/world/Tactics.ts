import { NIGHT_FIGHTER as NF, radarContact, schrageSolution, SCHRAGE_Y, SCHRAGE_Z } from './NewEnemyRules';
import * as THREE from 'three';
import { AIR_BOMB, PACK, STURM, sturmSlot, type PackTactic } from './LuftwaffeTactics';
import type { ParticleOpts } from '../render/Particles';
import { EnemyPilot, PilotOverride, steerTo, leadPoint, WorldView, AttackType } from './AI';
import { CRUISE, World } from './World';
import { Aircraft, Bomber, Fighter, type HitZone } from './Aircraft';
import { ENEMY_VARIANTS, EnemyType } from './EnemyTypes';
import { BK5_MUZZLE } from './EnemyDress';
import { formRaid } from './Raid';
import { schwarmChance, staggerDelay } from './PilotMind';
import { sound } from '../audio/Sound';

/**
 * Enemy tactics layer for the attacks on the bomber formation. It groups pilots and flies
 * them with shared waypoints and timing through EnemyPilot.override; when a manoeuvre is
 * over the pilots are handed back to their own state machine (EnemyPilot.engage / 'break' /
 * 'withdraw'). All waypoints are kept relative to the moving formation (or the target
 * bomber) and turned into world positions every frame, so floating-origin rebases are free.
 *
 *  Group tactics (picked for a director group now and then, see onGroup):
 *   companyFront  4–8 fighters in line abreast (or a tight schwarm) form up 6 km ahead and
 *                 high, run in head-on together, all firing at once, then break down
 *                 through the formation
 *   pincer        two pairs set up on opposite beams and turn in at the same moment
 *                 (gunner: one pair on each waist gun, so the player has to pick a seat)
 *  Per-type behaviour (individual fighters of a group):
 *   comet     Me 163: slashing climb from below and astern at huge speed, one pass, glide away
 *   jet       Me 262: repeated high-speed slashing passes from astern, never duels
 *   standoff  Ju 88 / Bf 110: racetrack at 800–1300 m, turning in to lob Wgr. 21 salvos
 *   topCover  Bf 109: circles high above the formation and dives on stragglers
 *   bigGun    Me 410: stand-off BK 5 (50 mm) cannon run from ~2 km: out to a station, a slow,
 *             steady line-up (telegraphed: radio, radar cue, gunner tip) that gives the gunners
 *             ~4 s to kill it, then two aimed shells, turn away, again (three runs); the shells
 *             are flown here (updateShells), each hit a heavy blow on one part of a bomber
 *   jet/high  Do 335: the Me 262's slashing passes, but diving from high astern
 *   raid      He 111: a formation flying a straight-and-level course past the box (Raid.ts)
 *  Special-event groups (SpecialEvents.ts): zerstorer (heavies in formation firing
 *  coordinated salvos) and the stand-off rocket barrage (standoff with endless salvos).
 *
 * Every tactic is telegraphed with a radio call (World.callout) and a radar cue
 * (radarCues, drawn by ui/Radar.ts). Nothing here allocates per frame.
 */

export type TacticKind = 'companyFront' | 'pincer' | 'comet' | 'jet' | 'standoff' | 'topCover' | 'zerstorer' | 'bigGun' | 'sturm' | 'airBomb' | 'nightFighter';

// ---------------------------------------------------------------- radar cues
export interface RadarCue { pos: THREE.Vector3; label: string; until: number; on: boolean }
// fixed pool, read by Radar.draw (cues with on && time < until)
export const radarCues: RadarCue[] = Array.from({ length: 8 }, () => ({ pos: new THREE.Vector3(), label: '', until: -1, on: false }));

function takeCue(label: string, until: number): RadarCue | null {
  const c = radarCues.find((q) => !q.on) ?? null;
  if (!c) return null;
  c.on = true; c.label = label; c.until = until;
  return c;
}
function freeCue(c: RadarCue | null) { if (c) { c.on = false; c.until = -1; } }

// ---------------------------------------------------------------- shared scratch
const UP = new THREE.Vector3(0, 1, 0);
const F = new THREE.Vector3(0, 0, 1);   // formation heading (horizontal)
const RT = new THREE.Vector3(-1, 0, 0); // right of the heading
const FV = new THREE.Vector3();         // formation velocity
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _la = new THREE.Vector3();
const _lb = new THREE.Vector3();
const _qi = new THREE.Quaternion();
const _sd = new THREE.Vector3();

// distance from point p to the segment a-b
function segDist(a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3) {
  _sd.copy(b).sub(a);
  const l2 = _sd.lengthSq();
  const t = l2 > 1e-9 ? THREE.MathUtils.clamp(((p.x - a.x) * _sd.x + (p.y - a.y) * _sd.y + (p.z - a.z) * _sd.z) / l2, 0, 1) : 0;
  const x = a.x + _sd.x * t - p.x, y = a.y + _sd.y * t - p.y, z = a.z + _sd.z * t - p.z;
  return Math.sqrt(x * x + y * y + z * z);
}

function frame(w: WorldView) {
  F.copy(w.formationForward).setY(0);
  if (F.lengthSq() < 1e-6) F.set(0, 0, 1);
  F.normalize();
  RT.crossVectors(F, UP).normalize();
  FV.copy(F).multiplyScalar(CRUISE);
}

// formation-frame offset (x right, y up, z forward) from base -> world
function fpos(base: THREE.Vector3, x: number, y: number, z: number, out: THREE.Vector3) {
  return out.copy(base).addScaledVector(RT, x).addScaledVector(UP, y).addScaledVector(F, z);
}
// horizontal unit direction at angle a from the heading (0 = ahead, +pi/2 = right)
function hdir(a: number, out: THREE.Vector3) { return out.copy(F).multiplyScalar(Math.cos(a)).addScaledVector(RT, Math.sin(a)); }

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- members
class Member implements PilotOverride {
  get steady() { return this.g.kind === 'sturm' || this.g.kind === 'airBomb' || this.g.kind === 'nightFighter'; }
  readonly slot = new THREE.Vector3();    // formation-frame offset from the group anchor
  readonly aimErr = new THREE.Vector3();
  readonly tubes: THREE.Object3D[] = [];  // Wgr. 21 tubes, kept for the reload
  target: Aircraft | null = null;
  phase = 0;
  t = 0;
  side = 1;
  ang = 0;          // stand-off: station bearing from the heading
  salvos = 0;
  reload = 0;
  shots = 0;        // big gun: shells fired this run
  released = false;
  constructor(readonly g: Group, readonly f: Fighter, readonly p: EnemyPilot) {}
  fly(_p: EnemyPilot, dt: number) { return this.g.fly(this, dt); }
  setAimError(w: WorldView, base: number) {
    this.aimErr.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      .multiplyScalar((base + Math.random() * base) / Math.max(0.4, this.p.skill) * w.enemyAimMult);
  }
}

// ---------------------------------------------------------------- group base
abstract class Group {
  readonly members: Member[] = [];
  t = 0;
  phase = 0;
  done = false;
  cue: RadarCue | null = null;
  cue2: RadarCue | null = null;
  constructor(readonly tx: Tactics, readonly kind: TacticKind) {}
  get w(): World { return this.tx.world; }

  add(f: Fighter): Member | null {
    const p = this.w.enemyPilot(f);
    if (!p || !f.alive) return null;
    // a fighter belongs to one tactic at a time
    const prev = this.tx.memberOf(f);
    if (prev) prev.g.drop(prev);
    const m = new Member(this, f, p);
    p.override = m;
    p.state = 'approach'; p.timer = 0;
    this.members.push(m);
    return m;
  }

  drop(m: Member) {
    if (m.p.override === m) m.p.override = null;
    m.released = true;
    const i = this.members.indexOf(m);
    if (i >= 0) this.members.splice(i, 1);
  }

  // Hand a pilot back to its own state machine
  release(m: Member, how: 'break' | 'engage' | 'withdraw' | 'keep', dir?: THREE.Vector3, target?: Aircraft | null, attack?: AttackType) {
    const p = m.p;
    if (p.override === m) p.override = null;
    m.released = true;
    p.timer = 0;
    p.me.gunAim = null;
    if (how === 'break') { p.state = 'break'; p.attackCount++; p.breakDir.copy(dir ?? m.f.forward(_a)); }
    else if (how === 'withdraw') { p.state = 'withdraw'; p.breakDir.copy(dir ?? _a.copy(m.f.pos).sub(this.w.formationCenter).setY(0).normalize().setY(-0.1).normalize()); }
    else if (how === 'engage') {
      const t = target ?? m.target ?? this.tx.pickTarget(m.f.pos);
      if (t) p.engage(this.w, t, attack, true); else p.state = 'approach';
    }
  }

  releaseAll(how: 'break' | 'engage' | 'withdraw') {
    for (const m of this.members) if (!m.released) this.release(m, how);
  }

  end() {
    for (const m of this.members) if (m.p.override === m) m.p.override = null;
    freeCue(this.cue); freeCue(this.cue2);
    this.cue = this.cue2 = null;
    this.done = true;
  }

  // drop members that died, left, withdrew or were taken over by someone else
  prune() {
    for (let i = this.members.length - 1; i >= 0; i--) {
      const m = this.members[i];
      if (m.released || !m.f.alive || m.f.remove || m.p.state === 'withdraw' || m.p.override !== m) {
        if (m.p.override === m) m.p.override = null;
        m.released = true;
        this.members.splice(i, 1);
      }
    }
  }

  active(): number { let n = 0; for (const m of this.members) if (!m.released) n++; return n; }

  update(dt: number) {
    this.t += dt;
    this.prune();
    for (const m of this.members) m.t += dt;
    this.step(dt);
    if (!this.members.length) this.end();
  }

  abstract step(dt: number): void;
  abstract fly(m: Member, dt: number): boolean;

  // ---- flying helpers ----
  // fly towards pos while matching vel (both world): a velocity command with a position term
  seek(m: Member, pos: THREE.Vector3, vel: THREE.Vector3, gain = 0.4, vmax = 240, vmin = 120) {
    const fm = m.f.fm;
    const want = _b.copy(pos).sub(m.f.pos).multiplyScalar(gain).add(vel);
    let len = want.length();
    if (len > vmax) { want.multiplyScalar(vmax / len); len = vmax; }
    if (len < vmin) { if (len < 1e-3) m.f.forward(want); want.setLength(vmin); len = vmin; }
    steerTo(fm, want, 1.15, 0.85);
    fm.throttle = THREE.MathUtils.clamp(0.55 + (len - fm.speed) * 0.04, 0.25, 1);
    if (m.f.dropTankAttached && m.f.pos.distanceTo(this.w.formationCenter) < 3800) this.w.dropTank(m.f);
  }

  // gun run on a target with lead; returns the range
  gunRun(m: Member, t: Aircraft, range: number, tol: number, out = _c) {
    leadPoint(m.f.pos, m.f.vel, t, 760, out).add(m.aimErr);
    const dir = _d.copy(out).sub(m.f.pos);
    const dist = dir.length();
    const err = steerTo(m.f.fm, dir, 1.2, 0.9);
    if (dist < range && err < tol) m.f.trigger = true;
    return dist;
  }

  closing(m: Member, t: Aircraft) {
    return _a.copy(m.f.vel).sub(t.vel).dot(_b.copy(t.pos).sub(m.f.pos)) > 0;
  }

  // Wgr. 21: nose on the target's intercept point (rocket ~320 m/s relative), launch inside the window
  rocketRun(m: Member, t: Aircraft, minR: number, maxR: number): 'fired' | 'close' | 'aiming' {
    const f = m.f;
    const rel = _a.copy(t.pos).sub(f.pos);
    const dist = rel.length();
    const tt = dist / 320;
    const aim = _b.copy(t.pos).addScaledVector(_c.copy(t.vel).sub(f.vel), tt).add(m.aimErr);
    aim.y += 0.22 * 9.81 * tt * tt;
    const err = steerTo(f.fm, _d.copy(aim).sub(f.pos), 1.1, 0.8);
    f.fm.throttle = 0.75;
    if (f.rockets > 0 && dist > minR && dist < maxR && err < 0.075) {
      m.tubes.length = 0;
      for (const tube of f.rocketTubes) m.tubes.push(tube);
      f.fireRockets = true;   // World.launchRockets fires them this frame
      m.salvos++;
      return 'fired';
    }
    return dist < minR ? 'close' : 'aiming';
  }

  // re-arm the Wgr. 21 tubes after a reload (the tube meshes are kept, not rebuilt)
  reloadTubes(m: Member, dt: number) {
    if (m.f.rockets > 0 || !m.tubes.length) return;
    m.reload -= dt;
    if (m.reload > 0) return;
    for (const tube of m.tubes) { m.f.model.add(tube); m.f.rocketTubes.push(tube); }
    m.f.rockets = m.tubes.length;
    m.tubes.length = 0;
  }

  // after a salvo: break off along the formation (a 90 degree turn, not a reversal), drifting
  // out a little and holding height, so the next turn-in is short
  breakAway(m: Member, t: Aircraft, out: THREE.Vector3) {
    const d = _d.copy(m.f.pos).sub(t.pos).setY(0).normalize();
    out.crossVectors(UP, d);
    if (out.dot(F) < 0) out.negate();
    return out.addScaledVector(d, 0.4).addScaledVector(UP, 0.12).normalize();
  }

  // the world position this member treats as "the formation" for its waypoints
  focusPos(m: Member): THREE.Vector3 { return (m.target && m.target.alive ? m.target.pos : this.w.formationCenter); }
}

// ---------------------------------------------------------------- company front
// Mass head-on attack. The group's anchor starts 6 km ahead and high and closes at 255 m/s
// relative to the formation (a 180 m/s run over the ground) with the fighters holding their
// slots; inside 2.3 km every fighter takes a bomber and they all fire together, then they
// break down through the formation.
class CompanyFront extends Group {
  dist = 6000;          // anchor distance ahead of the focus
  height = 600;
  lateral = 0;
  readonly anchor = new THREE.Vector3();
  constructor(tx: Tactics, readonly focus: Aircraft | null, readonly wedge = false) {
    super(tx, wedge ? 'sturm' : 'companyFront');
    if (wedge) { this.dist = STURM.distance; this.height = 0; }
  }

  private anchorPos(out: THREE.Vector3) {
    const base = this.focus && this.focus.alive ? this.focus.pos : this.w.formationCenter;
    return fpos(base, this.lateral, this.height, this.dist, out);
  }

  setup(schwarm: boolean) {
    const n = this.members.length;
    this.members.forEach((m, i) => {
      if (this.wedge) {
        sturmSlot(i, m.slot);
      } else if (schwarm && n <= 4) {
        // finger four, seen head-on: leader in front, wingmen stepped back (away from the bombers)
        const S: [number, number, number][] = [[0, 0, 0], [-75, -10, 45], [95, 6, 30], [170, -4, 70]];
        const s = S[i];
        m.slot.set(s[0] - 40, s[1], s[2]);
      } else {
        m.slot.set((i - (n - 1) / 2) * 95, rnd(-15, 15), rnd(0, 25));
      }
      m.setAimError(this.w, 6);
    });
  }

  // put everybody in their slots (spawn frame, before the first render)
  place() {
    frame(this.w);
    this.anchorPos(this.anchor);
    for (const m of this.members) {
      fpos(this.anchor, m.slot.x + (this.wedge ? 0 : rnd(-30, 30)), m.slot.y + (this.wedge ? 0 : rnd(-15, 15)), m.slot.z + (this.wedge ? 0 : rnd(-30, 30)), _a);
      this.tx.place(m.f, _a, _b.copy(F).negate(), 180);
    }
  }

  step(dt: number) {
    frame(this.w);
    if (this.phase === 0) {
      this.dist -= (this.wedge ? STURM.closing : 255) * dt;
      this.anchorPos(this.anchor);
      if (this.cue) this.cue.pos.copy(this.anchor);
      if (this.dist <= (this.wedge ? 1400 : 2300) || this.t > 20) this.beginRun();
    } else if (this.active() === 0 || this.t > 40) {
      this.releaseAll('engage');
      this.end();
    }
  }

  private beginRun() {
    this.phase = 1;
    freeCue(this.cue); this.cue = null;
    const bombers = this.w.bombers();
    const pl = this.w.playerBomber;
    let center: Member | null = null, cd = Infinity;
    for (const m of this.members) if (Math.abs(m.slot.x) < cd) { cd = Math.abs(m.slot.x); center = m; }
    for (const m of this.members) {
      m.t = 0;
      // each fighter takes the bomber nearest its own line of attack; gunner: the middle one has the player's ship
      fpos(this.anchor, m.slot.x, 0, 0, _a);
      let best: Bomber | null = null, bd = Infinity;
      for (const b of bombers) {
        if (!b.alive) continue;
        const d = Math.abs(_b.copy(b.pos).sub(_a).dot(RT)) + (b.isPlayer ? 60 : 0);
        if (d < bd) { bd = d; best = b; }
      }
      m.target = (m === center && pl?.alive && this.w.player === pl) ? pl : best;
      m.p.state = 'attack'; m.p.calloutDone = false;
    }
  }

  fly(m: Member, _dt: number) {
    const f = m.f;
    if (this.phase === 0) {
      fpos(this.anchor, m.slot.x, m.slot.y, m.slot.z, _a);
      _c.copy(FV).addScaledVector(F, -(this.wedge ? STURM.closing : 255));
      this.seek(m, _a, _c, 0.6, 290, 150);
      return true;
    }
    const t = m.target;
    if (!t || !t.alive) { this.release(m, 'engage'); return false; }
    // converge from the line onto the targets over the last kilometre and a half
    const dist0 = f.pos.distanceTo(t.pos);
    const k = THREE.MathUtils.clamp((dist0 - 600) / 1500, 0, 1);
    leadPoint(f.pos, f.vel, t, 760, _c).add(m.aimErr).addScaledVector(RT, m.slot.x * 0.5 * k);
    const dir = _d.copy(_c).sub(f.pos);
    const dist = dir.length();
    const err = steerTo(f.fm, dir, 1.2, 0.9);
    f.fm.throttle = 0.9;
    if ((!this.wedge || this.t >= (STURM.distance - STURM.fireRange) / STURM.closing) && dist < 900 && err < 0.06 + (1 - Math.min(1, m.p.skill)) * 0.03) f.trigger = true;
    if (dist0 < 260 || (!this.closing(m, t) && dist0 < 700) || m.t > 16) {
      // split-S down through the formation
      const dn = _a.copy(f.forward(_b)).multiplyScalar(0.55).addScaledVector(UP, -0.85).addScaledVector(RT, m.slot.x >= 0 ? 0.25 : -0.25).normalize();
      this.release(m, 'break', dn);
      return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------- pincer
// Two pairs, mirrored on opposite beams, so they arrive at their set-up points together;
// released at the same moment, one pair on each side.
class Pincer extends Group {
  constructor(tx: Tactics, readonly focus: Aircraft) { super(tx, 'pincer'); }

  setup() {
    this.members.forEach((m, i) => {
      m.side = i % 2 === 0 ? 1 : -1;
      const wing = i >= 2;
      m.slot.set(m.side * (1500 + (wing ? 90 : 0)), 150 + (wing ? -20 : 0), 250 + (wing ? -70 : 0));
      m.target = this.focus;
    });
  }

  place() {
    frame(this.w);
    const base = this.focus.pos;
    for (const m of this.members) {
      fpos(base, m.side * (3400 + Math.abs(m.slot.x) - 1500), 250 + (m.slot.y - 150), 650 + (m.slot.z - 250), _a);
      fpos(base, m.slot.x, m.slot.y, m.slot.z, _b);
      this.tx.place(m.f, _a, _b.sub(_a).normalize(), 180);
    }
  }

  step() {
    frame(this.w);
    if (!this.focus.alive) { this.releaseAll('engage'); this.end(); return; }
    const base = this.focus.pos;
    if (this.cue) fpos(base, 1500, 150, 250, this.cue.pos);
    if (this.cue2) fpos(base, -1500, 150, 250, this.cue2.pos);
    if (this.phase === 0) {
      let ready = this.t > 16;
      for (const m of this.members) if (Math.abs(m.slot.x) < 1550 && m.f.pos.distanceTo(fpos(base, m.slot.x, m.slot.y, m.slot.z, _a)) < 380) ready = true;
      if (ready && this.t >= 8) this.go();
    }
  }

  private go() {
    this.phase = 1;
    const w = this.w;
    const gunner = this.focus === w.playerBomber && w.player === w.playerBomber;
    const sR = gunner ? this.waistFor(1) : null, sL = gunner ? this.waistFor(-1) : null;
    frame(w);
    for (const m of this.members) {
      if (m.released) continue;
      const p = m.p;
      if (gunner) {
        p.station = m.side > 0 ? sR : sL;
        this.release(m, 'engage', undefined, this.focus, 'beam');
      } else {
        this.release(m, 'engage', undefined, this.focus, 'beam');
        fpos(this.focus.pos, m.slot.x * 0.9, m.slot.y, m.slot.z, p.setupPoint);
      }
      p.calloutDone = false;
    }
    this.end();
  }

  // the waist gun whose window faces that side of the ship
  private waistFor(side: number): string {
    const l = this.w.stationArc('waistL'), r = this.w.stationArc('waistR');
    _a.copy(RT).multiplyScalar(side);
    if (!l || !r) return side > 0 ? 'waistR' : 'waistL';
    return l.dot(_a) > r.dot(_a) ? 'waistL' : 'waistR';
  }

  fly(m: Member) {
    const base = this.focus.pos;
    fpos(base, m.slot.x, m.slot.y, m.slot.z, _a);
    this.seek(m, _a, FV, 0.35, 230, 140);
    return true;
  }
}

// ---------------------------------------------------------------- Me 163 comet
class Comet extends Group {
  constructor(tx: Tactics) { super(tx, 'comet'); }

  place() {
    frame(this.w);
    for (const m of this.members) {
      m.target = m.target ?? this.tx.pickTarget(m.f.pos);
      const base = this.focusPos(m);
      m.side = Math.random() < 0.5 ? 1 : -1;
      fpos(base, m.side * rnd(150, 450), -rnd(950, 1150), -rnd(2500, 2800), _a);
      _a.y = Math.max(_a.y, 6350);
      this.tx.place(m.f, _a, _b.copy(F).addScaledVector(UP, 0.25).normalize(), 290); // already going flat out from its climb
      m.setAimError(this.w, 6);
    }
  }

  step() {
    frame(this.w);
    for (const m of this.members) if (this.cue && m.phase === 0) { this.cue.pos.copy(m.f.pos); break; }
  }

  fly(m: Member) {
    const f = m.f;
    if (m.phase === 0) {
      const t = m.target;
      if (!t || !t.alive) { m.target = this.tx.pickTarget(f.pos); if (!m.target) { this.release(m, 'withdraw'); return false; } return true; }
      m.p.state = 'approach';
      const dist = this.gunRun(m, t, 750, 0.07);
      f.fm.throttle = 1;
      if (dist < 1800 && !m.p.calloutDone) m.p.state = 'attack';
      if (dist < 170 || (!this.closing(m, t) && dist < 650) || m.t > 28) { m.phase = 1; m.t = 0; freeCue(this.cue); this.cue = null; }
      return true;
    }
    // The zoom burns the last of the compressed combat fuel, then glides home.
    steerTo(f.fm, _a.copy(F).addScaledVector(UP, 0.5).addScaledVector(RT, m.side * 0.3), 1.2, 0.9);
    f.fm.throttle = 1;
    if (m.t > 2.2) { f.rocketFuel = 0; f.fm.throttle = 0; this.release(m, 'withdraw', _a.copy(F).addScaledVector(RT, m.side * 0.4).normalize().setY(-0.22).normalize()); return false; }
    return true;
  }
}

// Ju 88 G: radar intercept, settle beneath the bomber, fire the fixed oblique mount.
class NightFighter extends Group {
  constructor(tx: Tactics) { super(tx, 'nightFighter'); }
  place() {
    frame(this.w);
    for (const m of this.members) {
      m.target = this.tx.pickTarget(m.f.pos);
      fpos(this.focusPos(m), 100, -NF.height, -1100, _a);
      this.tx.place(m.f, _a, F, 145);
    }
  }
  step() { frame(this.w); }
  fly(m: Member, dt: number) {
    const f = m.f, t = m.target;
    f.trigger = false; f.obliqueTrigger = false; f.gunAim = null;
    if (!t?.alive || m.t > 75 || m.salvos >= NF.maxBursts) {
      this.release(m, 'withdraw'); return false;
    }
    const range = _c.copy(t.pos).sub(f.pos).length();
    const dot = range > 0 ? _c.multiplyScalar(1 / range).dot(f.forward(_d)) : 0;
    // A lock is acquired ahead; once under the ship its radio return is tracked overhead.
    if (m.phase === 0) {
      m.ang = radarContact(range, dot) ? m.ang + dt : 0;
      fpos(t.pos, 0, -NF.height, -NF.aft, _a);
      this.seek(m, _a, t.vel, .3, 175, 75);
      if (m.ang >= NF.lockTime) { m.phase = 1; m.reload = NF.warningTime; }
      return true;
    }
    if (range > NF.radarRange) { m.phase = 0; m.ang = 0; return true; }
    // Use target-relative offsets, so rebases and bomber manoeuvres remain coherent.
    fpos(t.pos, 0, -NF.height, -NF.aft, _a);
    this.seek(m, _a, t.vel, .22, 160, 65);
    m.p.state = 'attack';
    m.reload = Math.max(0, m.reload - dt);
    // Lead from the actual mount muzzle, including inherited aircraft velocity.
    f.localToWorld(_a.set(0, 1.7, -2.665).multiplyScalar(f.model.scale.x), _a);
    leadPoint(_a, f.vel, t, 700, _c);
    const above = _c.y - _a.y;
    const r = _c.sub(_a).length();
    const aligned = r > 0 && schrageSolution(r, _c.multiplyScalar(1 / r).dot(_d.set(0, SCHRAGE_Y, SCHRAGE_Z).applyQuaternion(f.quat)), above);
    if (m.reload <= 0 && aligned) {
      f.obliqueTrigger = true; m.shots += dt;
      if (m.shots >= NF.burst) { f.obliqueTrigger = false; m.shots = 0; m.salvos++; m.reload = NF.cooldown; }
    }
    if (this.cue) this.cue.pos.copy(f.pos);
    return true;
  }
}

// ---------------------------------------------------------------- Me 262 jet
class Jet extends Group {
  // high: the Do 335 version, set up high astern and dive through (a piston, it needs the height)
  constructor(tx: Tactics, readonly high = false, readonly low = false) { super(tx, 'jet'); }

  place() {
    frame(this.w);
    for (const m of this.members) {
      m.target = m.target ?? this.tx.pickTarget(m.f.pos);
      m.side = Math.random() < 0.5 ? 1 : -1;
      if (this.high) fpos(this.focusPos(m), m.side * rnd(300, 700), rnd(1300, 1700), -rnd(2600, 3200), _a);
      else fpos(this.focusPos(m), m.side * rnd(300, 700), (this.low ? -1 : 1) * rnd(200, 450), -rnd(3600, 4200), _a);
      this.tx.place(m.f, _a, F, this.high ? 235 : 255);
      m.setAimError(this.w, 6);
    }
  }

  step() {
    frame(this.w);
    if (this.cue) { const m = this.members[0]; if (m) this.cue.pos.copy(m.f.pos); if (this.t > 14) { freeCue(this.cue); this.cue = null; } }
  }

  fly(m: Member) {
    const f = m.f, p = m.p;
    if (!m.target || !m.target.alive) m.target = this.tx.pickTarget(f.pos);
    const t = m.target;
    if (!t) { this.release(m, 'withdraw'); return false; }
    switch (m.phase) {
      case 0: { // extend astern
        p.state = 'approach';
        fpos(t.pos, m.side * 350, this.high ? 1300 : this.low ? -250 : 250, this.high ? -1800 : -2300, _a);
        this.seek(m, _a, FV, 0.3, 330, 170);
        f.fm.throttle = Math.max(f.fm.throttle, 0.8);
        if (m.t >= 6 && (f.pos.distanceTo(_a) < 450 || m.t > 16)) { m.phase = 1; m.t = 0; p.state = 'attack'; p.calloutDone = false; m.setAimError(this.w, 6); }
        break;
      }
      case 1: { // slashing pass at full power, no duel
        const dist = this.gunRun(m, t, 800, 0.05);
        f.fm.throttle = 1;
        if (dist < 200 || (!this.closing(m, t) && dist < 600) || m.t > 13) { m.phase = 2; m.t = 0; p.state = 'approach'; p.attackCount++; }
        break;
      }
      case 2: // zoom away past the formation
        steerTo(f.fm, _a.copy(F).addScaledVector(UP, 0.45).addScaledVector(RT, m.side * 0.35), 1.2, 0.9);
        f.fm.throttle = 1;
        if (m.t > 2.5) { m.phase = 3; m.t = 0; }
        break;
      case 3: // wide, high and ahead, then back round astern for the next pass
        fpos(t.pos, m.side * 1300, this.high ? 1500 : 650, this.high ? 1500 : 2000, _a);
        this.seek(m, _a, FV, 0.3, 330, 170);
        f.fm.throttle = 1;
        if (f.pos.distanceTo(_a) < 600 || m.t > 10) { m.phase = 0; m.t = 0; if (Math.random() < 0.3) m.target = this.tx.pickTarget(f.pos); }
        break;
    }
    return true;
  }
}

// ---------------------------------------------------------------- heavies: stand-off rockets
// Racetrack at the stand-off range: out to a station on a bearing from the formation, turn
// in, lob a salvo inside the window, turn away, reload (tubes re-armed), again.
class Standoff extends Group {
  radius = 1500;
  minR = 820;
  maxR = 1300;
  salvoMax = 3;
  reloadTime = 8;
  constructor(tx: Tactics, kind: TacticKind = 'standoff') { super(tx, kind); }

  setupMember(m: Member, ang: number) {
    m.ang = ang;
    m.target = m.target ?? this.tx.pickTarget(m.f.pos);
    if (m.f.rockets <= 0 && !m.f.rocketTubes.length) this.tx.arm(m.f);
    m.setAimError(this.w, 7);
  }

  place(dist = 3000) {
    frame(this.w);
    for (const m of this.members) {
      hdir(m.ang, _b);
      _a.copy(this.focusPos(m)).addScaledVector(_b, dist);
      _a.y += rnd(100, 300);
      this.tx.place(m.f, _a, _b.negate(), 170);
    }
  }

  step(dt: number) {
    frame(this.w);
    for (const m of this.members) this.reloadTubes(m, dt);
    if (this.cue) {
      const m = this.members[0];
      if (m) this.cue.pos.copy(m.f.pos);
    }
  }

  stationPos(m: Member, out: THREE.Vector3) {
    hdir(m.ang, out).multiplyScalar(this.radius).add(this.focusPos(m));
    out.y += 180;
    return out;
  }

  fly(m: Member, _dt: number) {
    const f = m.f;
    if (!m.target || !m.target.alive) { m.target = this.tx.pickTarget(f.pos); if (!m.target) { this.release(m, 'withdraw'); return false; } }
    const t = m.target;
    switch (m.phase) {
      case 0: { // out to the station
        this.stationPos(m, _a);
        this.seek(m, _a, FV, 0.3, 210, 130);
        if (f.rockets > 0 && (f.pos.distanceTo(_a) < 380 || m.t > 18)) { m.phase = 1; m.t = 0; }
        else if (m.t > 30) { m.phase = 1; m.t = 0; }
        break;
      }
      case 1: { // turn in and lob the salvo
        const r = f.rockets > 0 ? this.rocketRun(m, t, this.minR, this.maxR) : 'close';
        if (r === 'fired') { m.reload = this.reloadTime; m.phase = 2; m.t = 0; m.setAimError(this.w, 7); }
        else if (r === 'close' || m.t > 12) { m.phase = 2; m.t = 0; }
        break;
      }
      case 2: { // turn away
        this.breakAway(m, t, _a);
        steerTo(f.fm, _a, 1.1, 0.8);
        f.fm.throttle = 1;
        if (m.t > 3.5) {
          m.phase = 0; m.t = 0;
          if (m.salvos >= this.salvoMax) { this.release(m, 'engage', undefined, t, 'beam'); return false; }
        }
        break;
      }
    }
    return true;
  }
}

// ---------------------------------------------------------------- Zerstörer formation
// Heavies in echelon close from a quarter, turn in together at the stand-off range for a
// coordinated salvo, turn away, regroup, reload and do it again; then they press home.
class Zerstorer extends Standoff {
  anchorDist = 3600;
  ang0 = 0;
  salvoRounds = 2;
  salvosDone = 0;
  private phaseT = 0;
  readonly anchor = new THREE.Vector3();
  constructor(tx: Tactics, readonly focus: Aircraft | null) { super(tx, 'zerstorer'); this.radius = 1650; this.maxR = 1450; this.minR = 850; }

  private base() { return this.focus && this.focus.alive ? this.focus.pos : this.w.formationCenter; }

  setup(ang0: number) {
    this.ang0 = ang0;
    this.members.forEach((m, i) => {
      this.setupMember(m, ang0);
      // echelon: stepped back and out from the leader, across the line of approach
      m.slot.set((i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * 85, -Math.ceil(i / 2) * 12, Math.ceil(i / 2) * 55);
      m.target = this.focus && this.focus.alive && Math.random() < 0.6 ? this.focus : this.tx.pickTarget(m.f.pos);
    });
  }

  private anchorPos(out: THREE.Vector3) {
    hdir(this.ang0, out).multiplyScalar(this.anchorDist).add(this.base());
    out.y += 220;
    return out;
  }

  // slot in the approach frame: x across, y up, z back along the approach line (away from the bombers)
  private slotPos(m: Member, out: THREE.Vector3) {
    hdir(this.ang0, _d);                    // outward bearing
    _c.crossVectors(_d, UP).normalize();    // across
    return out.copy(this.anchor).addScaledVector(_c, m.slot.x).addScaledVector(UP, m.slot.y).addScaledVector(_d, m.slot.z);
  }

  place() {
    frame(this.w);
    this.anchorPos(this.anchor);
    hdir(this.ang0, _b).negate();
    for (const m of this.members) { this.slotPos(m, _a); this.tx.place(m.f, _a, _b, 170); }
  }

  step(dt: number) {
    frame(this.w);
    this.phaseT += dt;
    for (const m of this.members) this.reloadTubes(m, dt);
    switch (this.phase) {
      case 0: // closing in formation
        this.anchorDist = Math.max(this.radius, this.anchorDist - 120 * dt);
        if (this.anchorDist <= this.radius + 1 || this.phaseT > 22) this.next(1);
        break;
      case 1: { // coordinated salvo: wait until everybody has fired or turned away
        let busy = false;
        for (const m of this.members) if (m.phase === 1) busy = true;
        if (!busy || this.phaseT > 16) { this.salvosDone++; this.next(2); }
        break;
      }
      case 2: // turn away, then regroup on the station and reload
        if (this.phaseT > 4) this.next(3);
        break;
      case 3: {
        this.anchorDist = this.radius + 250;
        let loaded = true, far = 0;
        for (const m of this.members) {
          if (m.f.rockets <= 0) loaded = false;
          far = Math.max(far, m.f.pos.distanceTo(this.focusPos(m)));
        }
        if (this.salvosDone >= this.salvoRounds) { this.releaseAll('engage'); this.end(); return; }
        // back out at the stand-off range, re-armed: turn in again
        if ((loaded && far > this.radius - 100 && this.phaseT > 5) || this.phaseT > 18) this.next(1);
        break;
      }
    }
    this.anchorPos(this.anchor);
    if (this.cue) this.cue.pos.copy(this.anchor);
  }

  private next(phase: number) {
    this.phase = phase; this.phaseT = 0;
    for (const m of this.members) {
      m.t = 0;
      if (phase === 1) { m.phase = 1; m.p.state = 'attack'; m.p.calloutDone = false; if (!m.target || !m.target.alive) m.target = this.tx.pickTarget(m.f.pos); }
      else if (phase === 3) { m.phase = 0; m.p.state = 'approach'; }
    }
    if (phase === 3 && this.members.length) {
      // the station follows the group round the box: bearing of the members' centre
      _a.set(0, 0, 0);
      for (const m of this.members) _a.add(m.f.pos);
      _a.divideScalar(this.members.length).sub(this.base());
      this.ang0 = Math.atan2(_a.dot(RT), _a.dot(F));
    }
    if (phase === 1) this.tx.call('zsalvo', 'Tail', 'They\'re turning in — rockets!', 10);
  }

  fly(m: Member, _dt: number) {
    const f = m.f;
    if (this.phase === 0 || this.phase === 3) {
      this.slotPos(m, _a);
      _c.copy(FV);
      if (this.phase === 0) _c.addScaledVector(hdir(this.ang0, _d), -120);
      this.seek(m, _a, _c, 0.45, 230, 130);
      return true;
    }
    if (!m.target || !m.target.alive) m.target = this.tx.pickTarget(f.pos);
    const t = m.target;
    if (!t) { this.release(m, 'withdraw'); return false; }
    if (m.phase === 1) {
      const r = f.rockets > 0 ? this.rocketRun(m, t, this.minR, this.maxR) : 'close';
      if (r === 'fired') { m.reload = this.reloadTime; m.phase = 2; m.t = 0; m.setAimError(this.w, 7); }
      else if (r === 'close' || m.t > 15) { m.phase = 2; m.t = 0; }
      return true;
    }
    // turn away (phase 2 of the member)
    this.breakAway(m, t, _a);
    steerTo(f.fm, _a, 1.1, 0.8);
    f.fm.throttle = 1;
    m.p.state = 'approach';
    return true;
  }
}

// ---------------------------------------------------------------- Me 410: BK 5 stand-off cannon
// Out to a station ~1.75 km from the target bomber, turn in, a slow and steady line-up (the
// gunners' chance: telegraphed by radio, radar cue and a gunner tip), two aimed 50 mm shells,
// turn away, again. After `runs` runs the Me 410 presses home like any heavy.
export const BK5 = { speed: 640, damage: 110, splash: 40, hitPad: 1.4, aimTime: 3.8, tol: 0.05, minR: 800, maxR: 1200, station: 1800, shots: 2, gap: 1.6, runs: 3 };

class BigGun extends Group {
  constructor(tx: Tactics) { super(tx, 'bigGun'); }

  setupMember(m: Member, ang: number) {
    m.ang = ang;
    m.target = m.target ?? this.tx.pickTarget(m.f.pos);
    m.setAimError(this.w, 2.5);
  }

  place(dist = 3200) {
    frame(this.w);
    for (const m of this.members) {
      hdir(m.ang, _b);
      _a.copy(this.focusPos(m)).addScaledVector(_b, dist);
      _a.y += rnd(100, 300);
      this.tx.place(m.f, _a, _b.negate(), 170);
    }
  }

  step() {
    frame(this.w);
    // the radar cue follows whoever is lining up
    if (this.cue) {
      const m = this.members.find((x) => x.phase === 1 || x.phase === 2);
      if (m) this.cue.pos.copy(m.f.pos);
    }
  }

  private stationPos(m: Member, out: THREE.Vector3) {
    hdir(m.ang, out).multiplyScalar(BK5.station).add(this.focusPos(m));
    out.y += 150;
    return out;
  }

  // nose onto the shell's intercept point (slow, steady); returns the aim error (rad)
  private lay(m: Member, t: Aircraft) {
    const f = m.f;
    const muzzle = f.localToWorld(_c.copy(BK5_MUZZLE).multiplyScalar(f.model.scale.x), _c);
    leadPoint(muzzle, f.vel, t, BK5.speed, _a).add(m.aimErr);
    const err = steerTo(f.fm, _d.copy(_a).sub(muzzle), 1.0, 0.6);
    f.fm.throttle = 0.55;
    return err;
  }

  fly(m: Member, dt: number) {
    const f = m.f, p = m.p;
    if (!m.target || !m.target.alive) { m.target = this.tx.pickTarget(f.pos); if (!m.target) { this.release(m, 'withdraw'); return false; } }
    const t = m.target;
    p.state = 'approach';   // no generic "fighters, clock" call: this attack has its own
    switch (m.phase) {
      case 0: { // out to the station
        this.stationPos(m, _a);
        this.seek(m, _a, FV, 0.3, 210, 130);
        if (f.pos.distanceTo(_a) < 450 || m.t > 24) { m.phase = 1; m.t = 0; m.shots = 0; m.setAimError(this.w, 2.5); this.tx.bigGunWarning(this, m); }
        break;
      }
      case 1: { // lining up: nose on the target, slow and steady
        const err = this.lay(m, t);
        const dist = f.pos.distanceTo(t.pos);
        if (dist < BK5.minR) { m.phase = 3; m.t = 0; break; }
        if (m.t > BK5.aimTime && err < BK5.tol && dist < BK5.maxR) { this.tx.fireShell(f, t, m); m.shots = 1; m.reload = BK5.gap; m.phase = 2; m.t = 0; }
        else if (m.t > BK5.aimTime + 7) { m.phase = 3; m.t = 0; }
        break;
      }
      case 2: { // the second shell, then away
        const err = this.lay(m, t);
        m.reload -= dt;
        if (m.shots < BK5.shots && m.reload <= 0 && err < BK5.tol && f.pos.distanceTo(t.pos) >= BK5.minR && f.pos.distanceTo(t.pos) <= BK5.maxR) { this.tx.fireShell(f, t, m); m.shots++; m.reload = BK5.gap; }
        if (m.shots >= BK5.shots ? m.reload < BK5.gap - 0.7 : m.t > 6) { m.phase = 3; m.t = 0; m.salvos++; }
        break;
      }
      case 3: { // turn away, then out again
        this.breakAway(m, t, _a);
        steerTo(f.fm, _a, 1.1, 0.8);
        f.fm.throttle = 1;
        if (m.t > 4) {
          m.phase = 0; m.t = 0;
          if (m.salvos >= BK5.runs) { this.release(m, 'engage', undefined, t, 'beam'); return false; }
          m.ang = Math.sign(m.ang || 1) * THREE.MathUtils.clamp(Math.abs(m.ang) + (Math.random() - 0.5) * 0.8, 1.4, 2.7);
        }
        break;
      }
    }
    return true;
  }
}

interface Shell { pos: THREE.Vector3; vel: THREE.Vector3; age: number; life: number; owner: Fighter; on: boolean }

// High, level Bf 109s approach twelve o'clock, then release timed bombs ahead of the moving box.
class AirBombers extends Group {
  constructor(tx: Tactics, readonly focus: Aircraft) { super(tx, 'airBomb'); }
  place() {
    frame(this.w);
    this.members.forEach((m, i) => {
      m.target = this.focus; m.slot.set((i - 1) * 90, AIR_BOMB.height, 3200);
      fpos(this.focus.pos, m.slot.x, m.slot.y, m.slot.z, _a);
      this.tx.place(m.f, _a, _b.copy(F).negate(), 180);
    });
  }
  step() {
    frame(this.w);
    if (!this.focus.alive) { this.releaseAll('withdraw'); this.end(); return; }
    if (this.cue) this.cue.pos.copy(this.members[0]?.f.pos ?? this.focus.pos);
    if (this.t > 28) { this.releaseAll('engage'); this.end(); }
  }
  fly(m: Member) {
    fpos(this.focus.pos, m.slot.x, m.slot.y, -1500, _a);
    this.seek(m, _a, _c.copy(F).multiplyScalar(-180), 0.1, 200, 150);
    if (this.t >= AIR_BOMB.warning && m.shots === 0) {
      // Drop only when the ballistic fuse point is near the box, never home in after release.
      _b.copy(m.f.pos).addScaledVector(m.f.vel, AIR_BOMB.fuse);
      _c.copy(this.focus.pos).addScaledVector(this.focus.vel, AIR_BOMB.fuse);
      _b.y -= 0.5 * 9.81 * AIR_BOMB.fuse ** 2 + 72 * AIR_BOMB.fuse;
      if (_b.distanceTo(_c) < 140) {
        this.tx.dropAirBomb(m.f); m.shots++;
        this.release(m, 'break', _a.copy(F).addScaledVector(UP, 0.6));
        return false;
      }
    }
    return true;
  }
}
interface AirBomb { pos: THREE.Vector3; vel: THREE.Vector3; age: number; on: boolean; owner: Fighter }

// ---------------------------------------------------------------- Bf 109 top cover
class TopCover extends Group {
  private perchT = rnd(9, 16);
  constructor(tx: Tactics) { super(tx, 'topCover'); }

  private center(out: THREE.Vector3) { return fpos(this.w.formationCenter, 0, 1400, -300, out); }

  place() {
    frame(this.w);
    this.center(_c);
    for (const m of this.members) {
      m.side = Math.random() < 0.5 ? 1 : -1;
      fpos(_c, m.side * rnd(300, 600), rnd(-100, 100), -rnd(1500, 1900), _a);
      this.tx.place(m.f, _a, F, 190);
    }
  }

  step() {
    frame(this.w);
    if (this.cue) this.center(this.cue.pos);
    if (this.phase !== 0) return;
    // a bomber dropping out of formation is what they wait for
    let prey: Bomber | null = null;
    for (const a of this.w.aircraft) if (a instanceof Bomber && a.alive && !a.remove && a.straggling) { prey = a; break; }
    if (prey || this.t > this.perchT) this.dive(prey);
  }

  private dive(prey: Bomber | null) {
    this.phase = 1;
    const w = this.w;
    let t: Aircraft | null = prey;
    if (!t) {
      // the weakest ship in the box; gunner missions: often the player's
      let best: Bomber | null = null, bi = Infinity;
      for (const b of w.bombers()) if (b.alive && b.integrity < bi) { bi = b.integrity; best = b; }
      t = w.playerBomber?.alive && w.player === w.playerBomber && Math.random() < 0.5 ? w.playerBomber : best;
    }
    const pf = w.playerFighter;
    for (const m of this.members) {
      if (m.released) continue;
      if (pf?.alive && Math.random() < 0.35 && pf.pos.distanceTo(m.f.pos) < 3000) {
        this.release(m, 'keep'); m.p.target = pf; m.p.state = 'dogfight'; m.p.timer = 0;
      } else if (t) this.release(m, 'engage', undefined, t, 'high');
      else this.release(m, 'engage');
      m.p.calloutDone = false;
    }
    const name = t instanceof Bomber && !t.isPlayer ? t.name : null;
    if (prey && name) this.tx.call('tcdive', 'Tail', `109s diving on ${name}! She's out of formation — they're going for her!`, 20);
    else this.tx.call('tcdive', 'Top Turret', 'Here come the 109s — straight down out of the sun!', 20);
    this.end();
  }

  fly(m: Member) {
    // circle on the perch, moving with the formation
    this.center(_c);
    const rel = _a.copy(m.f.pos).sub(_c);
    const th = Math.atan2(rel.dot(RT), rel.dot(F)) + 0.75 * m.side;
    _b.copy(_c).addScaledVector(F, Math.cos(th) * 650).addScaledVector(RT, Math.sin(th) * 650);
    this.seek(m, _b, FV, 0.5, 210, 140);
    return true;
  }
}

// ---------------------------------------------------------------- the layer
export interface GroupContext {
  tier: number;          // difficulty tier (Game.spawnWave)
  station?: string;      // gunner: the director assigned this group to a gun position
  skill?: number;
}

export class Tactics {
  readonly groups: Group[] = [];
  private readonly learned = new Set<PackTactic>();
  private readonly bombs: AirBomb[] = Array.from({ length: 12 }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, on: false, owner: null as unknown as Fighter }));
  private readonly bombGlow: ParticleOpts = { pos: new THREE.Vector3(), life: 0.12, size0: 9, size1: 4, color0: [12, 7, 2], frame: 1 };
  private readonly bombPoint = new THREE.Vector3();
  groupCd = 25;           // s before the next group tactic may be picked
  lesson: ((text: string) => void) | null = null;
  hint: ((html: string) => void) | null = null;   // gunner tip (UI.tip), set by SpecialEvents
  log: string[] = [];
  private tubeGeo: THREE.BufferGeometry | null = null;
  private tubeMat: THREE.Material | null = null;
  // BK 5 shells in flight (a fixed pool: no allocation per shot)
  private shells: Shell[] = Array.from({ length: 12 }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, life: 0, owner: null as unknown as Fighter, on: false }));
  private lining = new WeakSet<Fighter>();   // Me 410s lining up the big gun: a kill now gets a cheer

  constructor(readonly world: World) {}

  reset() {
    for (const g of this.groups) g.end();
    this.groups.length = 0;
    for (const c of radarCues) freeCue(c);
    for (const s of this.shells) s.on = false;
    for (const b of this.bombs) b.on = false;
    this.groupCd = 25;
    this.log = [];
  }

  update(dt: number) {
    this.groupCd -= dt;
    const time = this.world.time;
    this.updateShells(dt);
    this.updateAirBombs(dt);
    for (const g of this.groups) {
      if (g.done || g.kind !== 'bigGun') continue;
      // shot down while lining up the big gun: the crew cheers
      for (const m of g.members) {
        if (m.phase === 1 && m.f.alive) this.lining.add(m.f);
        else if (!m.f.alive && this.lining.has(m.f)) { this.lining.delete(m.f); this.call('bk5down', this.gunner() ? 'Top Turret' : 'Big Friend', 'Got the Me 410 before he could fire!', 10); }
        else this.lining.delete(m.f);
      }
    }
    for (const g of this.groups) if (!g.done) g.update(dt);
    for (let i = this.groups.length - 1; i >= 0; i--) if (this.groups[i].done) this.groups.splice(i, 1);
    for (const c of radarCues) if (c.on && time > c.until) freeCue(c);
  }

  /** An Me 410 lining up its BK 5 right now (achievements: Big Gun Spotter). */
  liningUp(f: Fighter) { return this.lining.has(f); }

  memberOf(f: Fighter): Member | null {
    const p = this.world.enemyPilot(f);
    return p && p.override instanceof Member ? p.override : null;
  }

  busy(kind: TacticKind) { return this.groups.some((g) => g.kind === kind && !g.done); }

  // ---- helpers shared with the groups ----
  call(key: string, speaker: string, text: string, cooldown = 20) { this.world.callout('tac_' + key, speaker, text, cooldown, 3); }

  cueAt(g: Group, label: string, seconds: number, second = false) {
    const c = takeCue(label, this.world.time + seconds);
    if (second) g.cue2 = c; else g.cue = c;
    return c;
  }

  // Move a fighter that was spawned this frame (not yet drawn) onto its start point
  place(f: Fighter, pos: THREE.Vector3, dir: THREE.Vector3, speed: number) {
    f.root.position.copy(pos);
    _d.copy(dir).normalize();
    f.root.quaternion.setFromUnitVectors(_z, _d);
    f.fm.vel.copy(_d).multiplyScalar(speed);
    f.fm.omega.set(0, 0, 0);
    f.vel.copy(f.fm.vel);
  }

  // Fit two Wgr. 21 tubes to a heavy that was spawned without them
  arm(f: Fighter) {
    if (!this.tubeGeo) {
      this.tubeGeo = new THREE.CylinderGeometry(0.11, 0.11, 1.3, 10).rotateX(Math.PI / 2);
      this.tubeMat = new THREE.MeshStandardMaterial({ color: 0x3a3c33, roughness: 0.6, metalness: 0.4 });
    }
    for (const x of [1.9, -1.9]) {
      const tube = new THREE.Mesh(this.tubeGeo, this.tubeMat!);
      tube.position.set(x, -0.62, -0.1);
      f.model.add(tube);
      f.rocketTubes.push(tube);
    }
    f.rockets = f.rocketTubes.length;
  }

  // Who to attack: gunner missions mostly the player's ship (World.playerFocus), stragglers, else the nearest
  pickTarget(from?: THREE.Vector3): Bomber | null {
    const w = this.world;
    const pl = w.playerBomber;
    if (pl?.alive && w.player === pl && Math.random() < w.playerFocus) return pl;
    let best: Bomber | null = null, bd = Infinity;
    for (const b of w.bombers()) {
      if (!b.alive) continue;
      const d = (from ? b.pos.distanceTo(from) : 0) - (b.straggling ? 800 : 0) + Math.random() * 400;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  private focusBomber(): Bomber | null {
    const w = this.world;
    if (w.playerBomber?.alive && w.player === w.playerBomber) return w.playerBomber;
    const pf = w.playerFighter;
    let best: Bomber | null = null, bd = Infinity;
    for (const b of w.bombers()) {
      if (!b.alive) continue;
      const d = pf ? b.pos.distanceTo(pf.pos) : b.pos.distanceTo(w.formationCenter);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  private topUp(fs: Fighter[], n: number, type: EnemyType, skill: number) {
    const w = this.world;
    while (fs.length < n) {
      _a.copy(w.formationCenter); _a.y += 500; _a.x += 2500;
      fs.push(w.spawnEnemy(_a, 'headon', skill, false, false, type));
    }
    return fs;
  }

  private gunner() { const w = this.world; return !!w.playerBomber && w.player === w.playerBomber; }

  /** Explicit director lesson; existing jet, pincer and BK 5 machinery is reused. */
  launchPack(id: PackTactic, count: number = PACK[id].count): Group | null {
    let g: Group | null = null;
    const focus = this.focusBomber();
    if (!focus) return null;
    if (id === 'sturm') {
      const wedge = new CompanyFront(this, focus, true);
      for (const f of this.spawn('fw190', Math.max(6, Math.min(12, count)))) {
        f.maxStructure *= STURM.armour; f.structure = f.maxStructure;
        for (const z of f.zones) { z.maxHp *= STURM.armour; z.hp = z.maxHp; }
        wedge.add(f);
      }
      wedge.setup(false); wedge.place(); this.groups.push(wedge); g = wedge;
    } else if (id === 'airBomb') {
      const bombers = new AirBombers(this, focus);
      for (const f of this.spawn('bf109', 3)) bombers.add(f);
      bombers.place(); this.groups.push(bombers); g = bombers;
    } else if (id === 'hornisse') {
      g = this.bigGun(this.spawn('me410', 2), { focus, place: 1900, quiet: true });
    } else if (id === 'multiAxis') {
      g = this.pincer(this.spawn('fw190', 4), focus, true);
    } else {
      for (const [i, f] of this.spawn('me262', 2).entries()) {
        g = this.jet(f, { low: i === 0, quiet: true });
        if (g) for (const m of g.members) m.target = focus;
      }
    }
    if (!g) return null;
    const def = PACK[id];
    if (!g.cue) this.cueAt(g, def.cue, 28)?.pos.copy(g.members[0].f.pos);
    this.call(id, def.speaker, def.radio, 0);
    this.teach(id);
    this.groupCd = 45;
    this.log.push(`${this.world.time.toFixed(1)}s pack ${id}`);
    return g;
  }

  private teach(id: PackTactic) {
    if (!this.gunner() || this.learned.has(id)) return;
    this.learned.add(id);
    (this.lesson ?? this.hint)?.(PACK[id].tip);
  }

  dropAirBomb(f: Fighter) {
    const b = this.bombs.find(b => !b.on);
    if (!b) return;
    b.on = true; b.age = 0; b.owner = f;
    b.pos.copy(f.pos).sub(this.world.formationCenter);
    b.vel.copy(f.vel).addScaledVector(F, -CRUISE); b.vel.y -= 72;
    this.world.effects.flashLight(f.pos, 900, 0.15);
  }

  private updateAirBombs(dt: number) {
    const w = this.world;
    for (const b of this.bombs) {
      if (!b.on) continue;
      const step = Math.min(dt, AIR_BOMB.fuse - b.age);
      b.pos.addScaledVector(b.vel, step); b.pos.y -= 0.5 * 9.81 * step * step;
      b.vel.y -= 9.81 * step; b.age += step;
      this.bombPoint.copy(w.formationCenter).add(b.pos);
      this.bombGlow.pos.copy(this.bombPoint); w.effects.glow.spawn(this.bombGlow);
      if (b.age < AIR_BOMB.fuse - 1e-6) continue;
      b.on = false;
      w.effects.explosion(this.bombPoint, _a.set(0, 0, 0), 0.8);
      for (const a of w.aircraft) {
        if (!a.alive || a.remove || a.team !== 'allied') continue;
        const dist = a.pos.distanceTo(this.bombPoint);
        if (dist > AIR_BOMB.radius) continue;
        const zone = a.zone('fuselage') ?? a.zones[0];
        if (zone) w.ballistics.onHit?.({ target: a, zone, point: this.bombPoint, damage: AIR_BOMB.damage * (1 - dist / AIR_BOMB.radius), cannon: true, shooter: b.owner, bulletVel: b.vel, playerShot: false });
      }
    }
  }

  // ---------------- group tactics ----------------
  companyFront(fs: Fighter[], opts: { schwarm?: boolean; telegraph?: boolean; focus?: Aircraft | null } = {}): Group | null {
    const g = new CompanyFront(this, opts.focus !== undefined ? opts.focus : this.focusBomber());
    for (const f of fs) g.add(f);
    if (!g.members.length) return null;
    g.setup(!!opts.schwarm || g.members.length <= 4 && Math.random() < 0.5);
    g.place();
    this.groups.push(g);
    this.cueAt(g, g.members.length > 4 ? 'HEAD-ON ×' + g.members.length : 'HEAD-ON', 22);
    if (opts.telegraph !== false) {
      this.call('cf', 'Navigator', g.members.length > 4 ? 'They\'re forming up for a head-on pass! Twelve o\'clock high — a whole line of them!' : 'Schwarm forming up dead ahead, twelve o\'clock high! Head-on pass coming!', 25);
      if (this.gunner()) this.hint?.('Head-on attack forming at <b>12 O\'CLOCK HIGH</b> — take the <b>TOP TURRET</b> <kbd>3</kbd>');
    }
    this.log.push(`${this.world.time.toFixed(0)}s companyFront x${g.members.length}`);
    return g;
  }

  pincer(fs: Fighter[], focus?: Aircraft | null, quiet = false): Group | null {
    const t = focus ?? this.focusBomber();
    if (!t) return null;
    const g = new Pincer(this, t);
    for (const f of fs.slice(0, 4)) g.add(f);
    if (g.members.length < 2) { g.end(); return null; }
    g.setup();
    g.place();
    this.groups.push(g);
    this.cueAt(g, 'PINCER', 20); this.cueAt(g, 'PINCER', 20, true);
    frame(this.world);
    if (!quiet) this.teach('multiAxis');
    if (!quiet) this.call('pincer', 'Pilot', 'Two pairs splitting up — one each side! Three o\'clock and nine o\'clock, they\'re going to hit us together!', 25);
    if (!quiet && this.gunner()) this.hint?.('Pincer from <b>BOTH BEAMS</b> — pick a waist gun: <kbd>1</kbd> left · <kbd>2</kbd> right');
    this.log.push(`${this.world.time.toFixed(0)}s pincer x${g.members.length}`);
    return g;
  }

  // ---------------- per-type behaviour ----------------
  comet(f: Fighter): Group | null {
    const g = new Comet(this);
    if (!g.add(f)) return null;
    g.place();
    this.groups.push(g);
    this.cueAt(g, 'KOMET', 14);
    this.call('comet', 'Ball Turret', 'Komet! Rocket fighter climbing up from six o\'clock low — he\'s fast!', 25);
    if (this.gunner()) this.hint?.('Me 163 climbing from <b>6 O\'CLOCK LOW</b> — <b>BALL</b> <kbd>4</kbd> or <b>TAIL</b> <kbd>5</kbd>');
    this.log.push(`${this.world.time.toFixed(0)}s comet`);
    return g;
  }

  nightFighter(f: Fighter): Group | null {
    const g = new NightFighter(this);
    if (!g.add(f)) return null;
    g.place(); this.groups.push(g);
    this.cueAt(g, 'NIGHT FIGHTER', 75);
    this.call('nightBelow', 'Ball Turret', 'Night fighter below us! Watch his upward cannon!', 25);
    if (this.gunner()) this.hint?.('Ju 88 G below — use the BALL turret before its upward cannon lines up.');
    this.log.push(`${this.world.time.toFixed(0)}s nightFighter`);
    return g;
  }

  jet(f: Fighter, opts: { high?: boolean; low?: boolean; quiet?: boolean } = {}): Group | null {
    const g = new Jet(this, !!opts.high, !!opts.low);
    if (!g.add(f)) return null;
    g.place();
    this.groups.push(g);
    if (opts.high) {
      this.cueAt(g, 'PFEIL', 16);
      this.call('pfeil', 'Tail', 'Do 335 diving on us from high astern — he\'s as fast as a jet!', 25);
    } else if (!opts.quiet) {
      this.teach('jetSlash');
      this.cueAt(g, 'JET', 16);
      this.call('jet', 'Tail', 'Jet coming up from six o\'clock! Never seen anything that fast!', 25);
    }
    this.log.push(`${this.world.time.toFixed(0)}s ${opts.high ? 'pfeil' : 'jet'}`);
    return g;
  }

  // Me 410s: the BK 5 stand-off cannon run (BigGun)
  bigGun(fs: Fighter[], opts: { focus?: Aircraft | null; place?: number; quiet?: boolean } = {}): Group | null {
    const g = new BigGun(this);
    const side = Math.random() < 0.5 ? 1 : -1;
    fs.forEach((f, i) => {
      const m = g.add(f);
      if (!m) return;
      if (opts.focus !== undefined) m.target = opts.focus;
      // beam to rear quarter: a slow closure, a long steady line-up
      g.setupMember(m, side * rnd(1.6, 2.5) + i * 0.3 * side);
    });
    if (!g.members.length) return null;
    if (opts.place) g.place(opts.place);
    this.groups.push(g);
    if (!opts.quiet) this.teach('hornisse');
    if (!opts.quiet) this.call('bk5spot', this.gunner() ? 'Navigator' : 'Big Friend', 'Me 410 hanging back out of range — he\'s carrying a fifty-millimetre cannon!', 40);
    this.log.push(`${this.world.time.toFixed(0)}s bigGun x${g.members.length}`);
    return g;
  }

  // Telegraph a BK 5 line-up: radio, radar cue, gunner tip with the clock position
  bigGunWarning(g: Group, m: Member) {
    const w = this.world;
    this.call('bk5', this.gunner() ? 'Navigator' : 'Big Friend', 'Me 410 lining up with the big gun!', 8);
    freeCue(g.cue);
    g.cue = null;
    this.cueAt(g, 'BIG GUN', BK5.aimTime + 4)?.pos.copy(m.f.pos);
    if (this.gunner() && w.player) this.hint?.(`Me 410 lining up at <b>${w.clockPosition(w.player, m.f.pos).toUpperCase()}</b> — kill him before he fires the <b>50 mm</b>`);
  }

  // One BK 5 shell from an Me 410 at its target: the big muzzle flash and smoke puff are the
  // gunners' last warning at two kilometres
  fireShell(f: Fighter, t: Aircraft, m: Member) {
    const w = this.world;
    const s = this.shells.find((x) => !x.on);
    const muzzle = f.localToWorld(_c.copy(BK5_MUZZLE).multiplyScalar(f.model.scale.x), _c);
    leadPoint(muzzle, f.vel, t, BK5.speed, _a).add(m.aimErr);
    const dir = _d.copy(_a).sub(muzzle).normalize();
    if (s) {
      s.on = true; s.age = 0; s.owner = f;
      s.pos.copy(muzzle);
      s.vel.copy(dir).multiplyScalar(BK5.speed).add(f.vel);
      s.life = muzzle.distanceTo(t.pos) / BK5.speed + 0.9;
    }
    const fx = w.effects;
    // sized for the enlarged enemy airframes (World.ENEMY_SCALE): a puff that reads at 2 km
    const k = f.model.scale.x;
    fx.muzzleFlash(muzzle, dir, 5 * k, f.vel);
    fx.flashLight(muzzle, 1500, 0.15);
    for (let i = 0; i < 5; i++) {
      _b.copy(dir).multiplyScalar(6 + i * 7).add(f.vel).add(_a.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(8));
      fx.smoke.spawn({ pos: muzzle, vel: _b, life: 2.4 + Math.random(), size0: 1.6 * k, size1: (8 + i * 1.5) * k, color0: [0.66, 0.64, 0.6], alpha0: 0.6, alpha1: 0, drag: 1.4, lit: true });
    }
    sound.play('bk5', muzzle, { gain: 1.6 });   // 50 mm thump, arrives distance / 343 m/s later
    f.fm.vel.addScaledVector(f.forward(_b), -4);   // the recoil checks him
    if (m.shots === 0) this.call('bk5fire', this.gunner() ? 'Pilot' : 'Big Friend', 'He\'s firing the big gun! Kill him before he reloads!', 12);
    m.setAimError(w, 2.5);
  }

  private updateShells(dt: number) {
    const w = this.world;
    for (const s of this.shells) {
      if (!s.on) continue;
      s.age += dt;
      _a.copy(s.pos);
      s.vel.y -= 9.81 * dt;
      s.pos.addScaledVector(s.vel, dt);
      // a bright tracer and a faint smoke wisp
      w.effects.glow.spawn({ pos: s.pos, life: 0.08, size0: 4.5, size1: 2, color0: [16, 9, 3], alpha0: 1, alpha1: 0, frame: 1 });
      if (Math.random() < 0.6) w.effects.smoke.spawn({ pos: s.pos, life: 1.4, size0: 1.2, size1: 6, color0: [0.7, 0.7, 0.68], alpha0: 0.25, alpha1: 0, drag: 1.5, lit: true });
      // contact: the swept segment against every allied aircraft's hit zones (padded: 50 mm HE)
      let hit: Aircraft | null = null, zone: HitZone | null = null, best = Infinity;
      for (const a of w.aircraft) {
        if (!a.alive || a.remove || a.team !== 'allied') continue;
        if (segDist(_a, s.pos, a.pos) > a.radius + 12) continue;
        _qi.copy(a.quat).invert();
        // relative motion: the target already moved this frame
        _la.copy(_a).sub(a.pos).addScaledVector(a.vel, dt).applyQuaternion(_qi);
        _lb.copy(s.pos).sub(a.pos).applyQuaternion(_qi);
        for (const z of a.zones) {
          const d = segDist(_la, _lb, z.offset) - z.radius - BK5.hitPad;
          if (d < 0 && d < best) { best = d; hit = a; zone = z; }
        }
      }
      if (hit && zone) {
        s.on = false;
        const point = hit.localToWorld(zone.offset, new THREE.Vector3());
        w.effects.explosion(point, hit.vel, 0.3);
        sound.play('explosion', point, { gain: 1.5, ref: 150, reverb: 0.6 });
        const ev = { target: hit, zone, point, damage: BK5.damage, cannon: true, shooter: s.owner, bulletVel: s.vel.clone(), playerShot: false };
        w.ballistics.onHit?.(ev);
        // blast: the next nearest part takes a share
        let z2: HitZone | null = null, d2 = 4.5;
        for (const z of hit.zones) { if (z === zone) continue; const d = z.offset.distanceTo(zone.offset) - z.radius; if (d < d2) { d2 = d; z2 = z; } }
        if (z2 && hit.alive) w.ballistics.onHit?.({ ...ev, zone: z2, point: hit.localToWorld(z2.offset, new THREE.Vector3()), damage: BK5.splash });
        continue;
      }
      if (s.age > s.life) {
        // self-destruct burst past the target
        s.on = false;
        w.effects.sparks(s.pos, _b.set(0, 0, 0), true);
        w.effects.smoke.spawn({ pos: s.pos, life: 3, size0: 2, size1: 9, color0: [0.15, 0.14, 0.13], alpha0: 0.7, alpha1: 0, drag: 1, lit: true });
      }
    }
  }

  standoff(fs: Fighter[], opts: { telegraph?: boolean; angles?: number[]; radius?: number; minR?: number; maxR?: number; salvoMax?: number; reload?: number; place?: number; focus?: Aircraft | null } = {}): Standoff | null {
    const g = new Standoff(this);
    if (opts.radius) g.radius = opts.radius;
    if (opts.minR) g.minR = opts.minR;
    if (opts.maxR) g.maxR = opts.maxR;
    if (opts.salvoMax !== undefined) g.salvoMax = opts.salvoMax;
    if (opts.reload) g.reloadTime = opts.reload;
    const side = Math.random() < 0.5 ? 1 : -1;
    fs.forEach((f, i) => {
      const m = g.add(f);
      if (!m) return;
      if (opts.focus !== undefined) m.target = opts.focus;
      g.setupMember(m, opts.angles?.[i] ?? side * rnd(0.9, 2.2));
    });
    if (!g.members.length) return null;
    if (opts.place) g.place(opts.place);
    this.groups.push(g);
    if (opts.telegraph !== false) {
      this.cueAt(g, 'ROCKETS', 18);
      const v = ENEMY_VARIANTS[(fs[0].enemyType || 'bf110') as EnemyType];
      this.call('standoff', 'Navigator', `${v.label} hanging back out of range — he's got rocket tubes! He'll lob them in from a kilometre!`, 30);
    }
    this.log.push(`${this.world.time.toFixed(0)}s standoff x${g.members.length}`);
    return g;
  }

  zerstorer(fs: Fighter[], opts: { ang?: number; salvos?: number } = {}): Group | null {
    const focus = this.focusBomber();
    const g = new Zerstorer(this, focus);
    for (const f of fs) g.add(f);
    if (!g.members.length) return null;
    g.salvoRounds = opts.salvos ?? 2;
    const ang = opts.ang ?? (Math.random() < 0.5 ? 1 : -1) * rnd(0.6, 2.4);
    g.setup(ang);
    g.place();
    this.groups.push(g);
    this.cueAt(g, 'ZERSTÖRER', 60);
    if (this.world.player) {
      hdir(ang, _a).multiplyScalar(2000).add(this.world.formationCenter);
      const clock = this.world.clockPosition(this.world.player, _a);
      this.call('zerstorer', 'Navigator', `Zerstörers! Twin-engine destroyers forming up at ${clock} — they're carrying rockets!`, 30);
      if (this.gunner()) {
        const right = Math.sin(ang) > 0;
        this.hint?.(`Zerstörer formation on the <b>${right ? 'RIGHT' : 'LEFT'}</b> — <kbd>${right ? 2 : 1}</kbd> ${right ? 'right' : 'left'} waist · break them up before they fire`);
      }
    }
    this.log.push(`${this.world.time.toFixed(0)}s zerstorer x${g.members.length}`);
    return g;
  }

  topCover(fs: Fighter[]): Group | null {
    const g = new TopCover(this);
    for (const f of fs) g.add(f);
    if (!g.members.length) return null;
    g.place();
    this.groups.push(g);
    this.cueAt(g, 'TOP COVER', 14);
    this.call('topcover', 'Top Turret', '109s staying up high — top cover. They\'ll pounce on anybody who drops out of formation!', 30);
    this.log.push(`${this.world.time.toFixed(0)}s topCover x${g.members.length}`);
    return g;
  }

  // ---------------- director hook ----------------
  // A group the director has just spawned (this frame, before it is drawn): maybe fly it as
  // a group tactic, otherwise give each fighter its type's behaviour.
  onGroup(fs: Fighter[], ctx: GroupContext) {
    if (!fs.length) return;
    const w = this.world;
    const skill = ctx.skill ?? 1;
    // group tactics: rare, never for a group sent at a particular gun position
    if (!ctx.station && ctx.tier >= 1 && this.groupCd <= 0 && w.bombers().some((b) => b.alive)) {
      const r = Math.random();
      const pCF = 0.14 + 0.02 * Math.min(4, ctx.tier), pP = 0.14;
      if (r < pCF) {
        const pistons = fs.filter((f) => f.enemyType === 'fw190' || f.enemyType === 'bf109');
        const n = Math.min(8, 4 + Math.floor(Math.random() * 3) + (ctx.tier >= 3 ? 1 : 0) + (ctx.tier >= 5 ? 1 : 0));
        this.topUp(pistons, n, 'fw190', skill);
        if (this.companyFront(pistons)) { this.groupCd = 45; this.perType(fs.filter((f) => !pistons.includes(f)), skill); return; }
      } else if (r < pCF + pP) {
        const pistons = fs.filter((f) => f.enemyType === 'fw190' || f.enemyType === 'bf109' || f.enemyType === 'bf110').slice(0, 4);
        this.topUp(pistons, 4, Math.random() < 0.5 ? 'fw190' : 'bf109', skill);
        if (this.pincer(pistons)) { this.groupCd = 45; this.perType(fs.filter((f) => !pistons.includes(f)), skill); return; }
      }
    }
    // gunner groups sent at a gun position keep their arc attacks
    this.perType(ctx.station ? fs.filter((f) => !w.enemyPilot(f)?.station || f.enemyType === 'me163' || f.enemyType === 'me410' || f.enemyType === 'ju88g') : fs, skill);
    this.formSchwarme(fs);
  }

  // Enemy AI 2.0: single-engine fighters left to themselves fly as Rotten (pairs) or Schwärme
  // (fours): wingmen hold a slot on the leader and start their runs staggered behind his
  // (EnemyPilot.wing). Better units (decision quality) do it more often and keep it tighter.
  private formSchwarme(fs: Fighter[]) {
    const w = this.world;
    const free: EnemyPilot[] = [];
    for (const f of fs) {
      const p = w.enemyPilot(f);
      if (f.alive && p && !p.override && !p.wing && (f.enemyType === 'fw190' || f.enemyType === 'bf109')) free.push(p);
    }
    if (free.length < 2) return;
    const q = free[0].quality(w);
    if (Math.random() >= schwarmChance(q)) return;
    const size = free.length >= 4 && q > 0.5 ? 4 : 2;
    let leader = free[0];
    for (let i = 0; i < free.length; i++) {
      const k = i % size;
      if (k === 0) { leader = free[i]; continue; }
      free[i].wing = { leader, i: k, delay: staggerDelay(k, q) };
      free[i].station = leader.station;
    }
    this.log.push(`${w.time.toFixed(0)}s schwarm x${free.length} (${size}s, q ${q.toFixed(2)})`);
  }

  private perType(fs: Fighter[], _skill: number) {
    const w = this.world;
    const cover: Fighter[] = [], raiders: Fighter[] = [];
    for (const f of fs) {
      if (!f.alive || this.memberOf(f) || w.enemyPilot(f)?.override) continue;
      const t = f.enemyType as EnemyType;
      if (t === 'me163') this.comet(f);
      else if (t === 'ju88g') this.nightFighter(f);
      else if (t === 'me410') this.bigGun([f], { place: 3000 });
      else if (t === 'do335') this.jet(f, { high: true });
      else if (t === 'he111') raiders.push(f);
      else if (t === 'me262') this.jet(f);
      else if ((t === 'ju88' || t === 'bf110') && Math.random() < 0.6 && !this.busy('zerstorer')) this.standoff([f], { place: 2600 });
      else if (t === 'bf109' && !w.enemyPilot(f)?.station) cover.push(f);
    }
    if (cover.length && Math.random() < 0.45 && !this.busy('topCover')) this.topCover(cover.slice(0, 2));
    if (raiders.length) this.raidPass(raiders);
  }

  // He 111s sent by the director (custom battles): a formation crossing the box on a
  // reciprocal course, 900 m out to one side (Raid.ts)
  raidPass(fs: Fighter[]) {
    if (!fs.length) return null;
    const w = this.world;
    frame(w);
    const side = Math.random() < 0.5 ? 1 : -1;
    fpos(w.formationCenter, side * rnd(800, 1100), rnd(-150, 250), rnd(3800, 4600), _a);
    const raid = formRaid(w, fs, _a, _b.copy(F).negate());
    this.log.push(`${w.time.toFixed(0)}s raid x${fs.length}`);
    return raid;
  }

  // dev / special events: spawn a fresh group for a tactic near the formation
  spawn(type: EnemyType, n: number, skill = 1.1, rockets = false): Fighter[] {
    const w = this.world;
    const out: Fighter[] = [];
    for (let i = 0; i < n; i++) {
      _a.copy(w.formationCenter); _a.y += 500; _a.x += 2500 + i * 60;
      out.push(w.spawnEnemy(_a, 'headon', skill, false, rockets, type));
    }
    return out;
  }

  // dev hook: fly one tactic now
  dev(kind: TacticKind | string): string {
    if (kind in PACK) return this.launchPack(kind as PackTactic) ? kind : 'failed';
    switch (kind) {
      case 'companyFront': return this.companyFront(this.spawn('fw190', 6)) ? 'company front x6' : 'failed';
      case 'schwarm': return this.companyFront(this.spawn('fw190', 4), { schwarm: true }) ? 'schwarm head-on x4' : 'failed';
      case 'pincer': return this.pincer(this.spawn('fw190', 4)) ? 'pincer x4' : 'failed';
      case 'nightFighter': return this.nightFighter(this.spawn('ju88g', 1)[0]) ? 'Ju 88 G underside intercept' : 'failed';
      case 'comet': return this.comet(this.spawn('me163', 1)[0]) ? 'Me 163 comet' : 'failed';
      case 'jet': return this.jet(this.spawn('me262', 1)[0]) ? 'Me 262 slashing passes' : 'failed';
      case 'standoff': return this.standoff(this.spawn(Math.random() < 0.5 ? 'ju88' : 'bf110', 2, 1.1, true), { place: 2600 }) ? 'stand-off rockets x2' : 'failed';
      case 'topCover': return this.topCover(this.spawn('bf109', 2)) ? 'Bf 109 top cover x2' : 'failed';
      case 'zerstorer': return this.zerstorer(this.spawn('bf110', 4, 1.1, true)) ? 'Zerstörer formation x4' : 'failed';
      case 'bigGun': return this.bigGun(this.spawn('me410', 1, 1.1), { place: 3000 }) ? 'Me 410 BK 5 stand-off run' : 'failed';
      case 'pfeil': return this.jet(this.spawn('do335', 1)[0], { high: true }) ? 'Do 335 diving passes' : 'failed';
      case 'raid': return this.raidPass(this.spawn('he111', 6)) ? 'He 111 raid x6' : 'failed';
    }
    return `unknown tactic ${kind}`;
  }
}
