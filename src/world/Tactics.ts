import * as THREE from 'three';
import { EnemyPilot, PilotOverride, steerTo, leadPoint, WorldView, AttackType } from './AI';
import { CRUISE, World } from './World';
import { Aircraft, Bomber, Fighter } from './Aircraft';
import { ENEMY_VARIANTS, EnemyType } from './EnemyTypes';

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
 *  Special-event groups (SpecialEvents.ts): zerstorer (heavies in formation firing
 *  coordinated salvos) and the stand-off rocket barrage (standoff with endless salvos).
 *
 * Every tactic is telegraphed with a radio call (World.callout) and a radar cue
 * (radarCues, drawn by ui/Radar.ts). Nothing here allocates per frame.
 */

export type TacticKind = 'companyFront' | 'pincer' | 'comet' | 'jet' | 'standoff' | 'topCover' | 'zerstorer';

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
  constructor(tx: Tactics, readonly focus: Aircraft | null) { super(tx, 'companyFront'); }

  private anchorPos(out: THREE.Vector3) {
    const base = this.focus && this.focus.alive ? this.focus.pos : this.w.formationCenter;
    return fpos(base, this.lateral, this.height, this.dist, out);
  }

  setup(schwarm: boolean) {
    const n = this.members.length;
    this.members.forEach((m, i) => {
      if (schwarm && n <= 4) {
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
      fpos(this.anchor, m.slot.x + rnd(-30, 30), m.slot.y + rnd(-15, 15), m.slot.z + rnd(-30, 30), _a);
      this.tx.place(m.f, _a, _b.copy(F).negate(), 180);
    }
  }

  step(dt: number) {
    frame(this.w);
    if (this.phase === 0) {
      this.dist -= 255 * dt;
      this.anchorPos(this.anchor);
      if (this.cue) this.cue.pos.copy(this.anchor);
      if (this.dist <= 2300 || this.t > 20) this.beginRun();
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
      _c.copy(FV).addScaledVector(F, -255);
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
    if (dist < 900 && err < 0.06 + (1 - Math.min(1, m.p.skill)) * 0.03) f.trigger = true;
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
      if (ready) this.go();
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
    // zoom past, then the fuel is gone: a long glide away, ahead and down
    steerTo(f.fm, _a.copy(F).addScaledVector(UP, 0.5).addScaledVector(RT, m.side * 0.3), 1.2, 0.9);
    f.fm.throttle = 1;
    if (m.t > 2.2) { this.release(m, 'withdraw', _a.copy(F).addScaledVector(RT, m.side * 0.4).normalize().setY(-0.22).normalize()); return false; }
    return true;
  }
}

// ---------------------------------------------------------------- Me 262 jet
class Jet extends Group {
  constructor(tx: Tactics) { super(tx, 'jet'); }

  place() {
    frame(this.w);
    for (const m of this.members) {
      m.target = m.target ?? this.tx.pickTarget(m.f.pos);
      m.side = Math.random() < 0.5 ? 1 : -1;
      fpos(this.focusPos(m), m.side * rnd(300, 700), rnd(200, 450), -rnd(3600, 4200), _a);
      this.tx.place(m.f, _a, F, 255);
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
        fpos(t.pos, m.side * 350, 250, -2300, _a);
        this.seek(m, _a, FV, 0.3, 330, 170);
        f.fm.throttle = Math.max(f.fm.throttle, 0.8);
        if (f.pos.distanceTo(_a) < 450 || m.t > 16) { m.phase = 1; m.t = 0; p.state = 'attack'; p.calloutDone = false; m.setAimError(this.w, 6); }
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
        fpos(t.pos, m.side * 1300, 650, 2000, _a);
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
  groupCd = 25;           // s before the next group tactic may be picked
  hint: ((html: string) => void) | null = null;   // gunner tip (UI.tip), set by SpecialEvents
  log: string[] = [];
  private tubeGeo: THREE.BufferGeometry | null = null;
  private tubeMat: THREE.Material | null = null;

  constructor(readonly world: World) {}

  reset() {
    for (const g of this.groups) g.end();
    this.groups.length = 0;
    for (const c of radarCues) freeCue(c);
    this.groupCd = 25;
    this.log = [];
  }

  update(dt: number) {
    this.groupCd -= dt;
    const time = this.world.time;
    for (const g of this.groups) if (!g.done) g.update(dt);
    for (let i = this.groups.length - 1; i >= 0; i--) if (this.groups[i].done) this.groups.splice(i, 1);
    for (const c of radarCues) if (c.on && time > c.until) freeCue(c);
  }

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

  pincer(fs: Fighter[], focus?: Aircraft | null): Group | null {
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
    this.call('pincer', 'Pilot', 'Two pairs splitting up — one each side! Three o\'clock and nine o\'clock, they\'re going to hit us together!', 25);
    if (this.gunner()) this.hint?.('Pincer from <b>BOTH BEAMS</b> — pick a waist gun: <kbd>1</kbd> left · <kbd>2</kbd> right');
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

  jet(f: Fighter): Group | null {
    const g = new Jet(this);
    if (!g.add(f)) return null;
    g.place();
    this.groups.push(g);
    this.cueAt(g, 'JET', 16);
    this.call('jet', 'Tail', 'Jet coming up from six o\'clock! Never seen anything that fast!', 25);
    this.log.push(`${this.world.time.toFixed(0)}s jet`);
    return g;
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
    this.perType(ctx.station ? fs.filter((f) => !w.enemyPilot(f)?.station) : fs, skill);
  }

  private perType(fs: Fighter[], _skill: number) {
    const w = this.world;
    const cover: Fighter[] = [];
    for (const f of fs) {
      if (!f.alive || this.memberOf(f)) continue;
      const t = f.enemyType as EnemyType;
      if (t === 'me163') this.comet(f);
      else if (t === 'me262') this.jet(f);
      else if ((t === 'ju88' || t === 'bf110') && Math.random() < 0.6 && !this.busy('zerstorer')) this.standoff([f], { place: 2600 });
      else if (t === 'bf109' && !w.enemyPilot(f)?.station) cover.push(f);
    }
    if (cover.length && Math.random() < 0.45 && !this.busy('topCover')) this.topCover(cover.slice(0, 2));
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
    switch (kind) {
      case 'companyFront': return this.companyFront(this.spawn('fw190', 6)) ? 'company front x6' : 'failed';
      case 'schwarm': return this.companyFront(this.spawn('fw190', 4), { schwarm: true }) ? 'schwarm head-on x4' : 'failed';
      case 'pincer': return this.pincer(this.spawn('fw190', 4)) ? 'pincer x4' : 'failed';
      case 'comet': return this.comet(this.spawn('me163', 1)[0]) ? 'Me 163 comet' : 'failed';
      case 'jet': return this.jet(this.spawn('me262', 1)[0]) ? 'Me 262 slashing passes' : 'failed';
      case 'standoff': return this.standoff(this.spawn(Math.random() < 0.5 ? 'ju88' : 'bf110', 2, 1.1, true), { place: 2600 }) ? 'stand-off rockets x2' : 'failed';
      case 'topCover': return this.topCover(this.spawn('bf109', 2)) ? 'Bf 109 top cover x2' : 'failed';
      case 'zerstorer': return this.zerstorer(this.spawn('bf110', 4, 1.1, true)) ? 'Zerstörer formation x4' : 'failed';
    }
    return `unknown tactic ${kind}`;
  }
}
