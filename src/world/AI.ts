import * as THREE from 'three';
import type { FlightModel } from './FlightModel';
import type { Aircraft, Bomber, Fighter } from './Aircraft';

const _l = new THREE.Vector3();
const _r = new THREE.Vector3();
const _qi = new THREE.Quaternion();
const _d = new THREE.Vector3();
const _t = new THREE.Vector3();

// "Instructor": converts a desired world direction into stick inputs (used by AI and
// by the player's mouse-aim flight mode).
export function steerTo(fm: FlightModel, dir: THREE.Vector3, gain = 1, maxPull = 1) {
  _qi.copy(fm.quat).invert();
  _l.copy(dir).normalize().applyQuaternion(_qi); // x left, y up, z fwd
  const off = Math.acos(THREE.MathUtils.clamp(_l.z, -1, 1));
  fm.right(_r);
  const bank = Math.asin(THREE.MathUtils.clamp(-_r.y, -1, 1)); // + = right wing down
  const inverted = fm.up(_t).y < 0;
  const rollErr = Math.atan2(-_l.x, _l.y);
  if (off < 0.18 && !inverted) {
    // Fine tracking: bank-to-turn proportional to lateral error, pitch onto the target,
    // rudder trims the last fraction of a degree.
    const ex = Math.atan2(-_l.x, _l.z);           // + = target to the right
    const ey = Math.atan2(_l.y, _l.z);            // + = target above the nose
    const bankTarget = THREE.MathUtils.clamp(ex * 14, -1.3, 1.3);
    const blend = THREE.MathUtils.smoothstep(off, 0.1, 0.18);
    const fineRoll = (bankTarget - bank) * 2.5;
    fm.roll = THREE.MathUtils.clamp(THREE.MathUtils.lerp(fineRoll, rollErr * 2.2, blend) * gain, -1, 1);
    // pull in the direction of the target as seen in the banked frame
    fm.pitch = THREE.MathUtils.clamp((ey * 9 + Math.abs(ex) * 2.5 * Math.cos(rollErr)) * gain, -0.6, maxPull);
    fm.yaw = THREE.MathUtils.clamp(-ex * 9, -1, 1);
    return off;
  }
  const levelErr = inverted ? (bank >= 0 ? Math.PI - bank : -Math.PI - bank) : -bank;
  const w = THREE.MathUtils.smoothstep(off, 0.012, 0.15);
  const rollCmd = THREE.MathUtils.lerp(levelErr * 1.2, rollErr * 2.2, w);
  fm.roll = THREE.MathUtils.clamp(rollCmd * gain, -1, 1);
  const align = Math.max(0, Math.cos(rollErr));
  let pitch = Math.abs(rollErr) < 1.2 ? maxPull * align + 0.15 : 0.15;
  if (_l.z < 0 && Math.abs(rollErr) < 0.6) pitch = maxPull;
  fm.pitch = THREE.MathUtils.clamp(pitch * gain, -0.6, maxPull);
  fm.yaw = THREE.MathUtils.clamp(Math.atan2(_l.x, Math.max(_l.z, 0.1)) * 4, -1, 1) * 0.2;
  return off;
}

// Lead pursuit: where to aim so bullets meet the target.
export function leadPoint(shooterPos: THREE.Vector3, shooterVel: THREE.Vector3, target: Aircraft, muzzle: number, out = new THREE.Vector3()) {
  const rel = _d.copy(target.pos).sub(shooterPos);
  const relV = _t.copy(target.vel).sub(shooterVel);
  let t = rel.length() / muzzle;
  for (let i = 0; i < 3; i++) {
    out.copy(target.pos).addScaledVector(relV, t);
    t = out.distanceTo(shooterPos) / muzzle;
  }
  // gravity drop compensation
  out.y += 0.5 * 9.81 * t * t;
  return out;
}

export type AttackType = 'headon' | 'stern' | 'beam' | 'high';

export interface WorldView {
  bombers(): Bomber[];
  fighters(team: 'allied' | 'axis'): Fighter[];
  formationForward: THREE.Vector3;
  formationCenter: THREE.Vector3;
  player: Aircraft | null;
  playerFighter: Fighter | null;
  time: number;
  dropTank(f: Fighter): void;
  difficulty: number; // 0.5 .. 1.5
  playerFocus: number;               // chance an attacker picks the player's bomber
  playerArc(): THREE.Vector3 | null; // world direction the player's gun position covers (gunner mode)
  playerGunPos(): THREE.Vector3 | null; // world position of the player's gun (gunner mode)
  playerStationId(): string | null;
}

const _y = new THREE.Vector3(0, 1, 0);
const _u = new THREE.Vector3();
const _c = new THREE.Vector3();
const _p = new THREE.Vector3();

// Luftwaffe fighter pilot. Attacks on the player's bomber are flown *through the
// gunner's field of fire*: the fighter sets up 1.3–1.8 km out in the direction the
// player's gun covers, runs in firing, passes close across the sight, loops back out
// to a new set-up point nearby and comes again. Damaged pilots limp away (still
// catchable). Jumped by escorts, they turn to fight or evade.
export class EnemyPilot {
  state: 'approach' | 'attack' | 'duel' | 'break' | 'dogfight' | 'evade' | 'withdraw' = 'approach';
  attack: AttackType = 'headon';
  target: Aircraft | null = null;
  timer = 0;
  setupPoint = new THREE.Vector3();
  breakDir = new THREE.Vector3();
  skill: number;
  private aim = new THREE.Vector3();
  calloutDone = false;
  attackCount = 0;
  private aimOffset = new THREE.Vector3();
  private fromArc = false;
  private passOffset = new THREE.Vector3();
  // duel: an elliptical weave held in the gunner's arc, in the bomber's moving frame
  private duelA = new THREE.Vector3();   // outward from the gun
  private duelS = new THREE.Vector3();   // sideways across the arc
  private duelU = new THREE.Vector3();   // up, across the arc
  private duelPhase = 0;
  private duelRate = 0.4;
  private duelLen = 12;
  private duelStation: string | null = null;

  constructor(public me: Fighter, preferred?: AttackType, skill = 1) {
    this.skill = skill * (0.8 + Math.random() * 0.4);
    if (preferred) this.attack = preferred;
  }

  private pickTarget(w: WorldView) {
    const bs = w.bombers().filter((b) => b.alive);
    if (!bs.length) return null;
    const pl = bs.find((b) => b.isPlayer);
    if (pl && Math.random() < w.playerFocus) return pl;
    const strag = bs.filter((b) => b.straggling);
    if (strag.length && Math.random() < 0.4) return strag[Math.floor(Math.random() * strag.length)];
    return bs[Math.floor(Math.random() * bs.length)];
  }

  private computeSetup(w: WorldView, near = false) {
    const t = this.target!;
    const fwd = w.formationForward;
    const arc = t.isPlayer ? w.playerArc() : null;
    const p = this.setupPoint.copy(t.pos);
    this.fromArc = !!arc;
    if (arc) {
      // come in through the player's window / turret arc
      const d = _d.copy(arc).applyAxisAngle(_y, (Math.random() - 0.5) * 0.9);
      d.y += -0.12 + Math.random() * 0.4;
      d.normalize();
      p.addScaledVector(d, (near ? 800 : 1250) + Math.random() * (near ? 200 : 350));
      return;
    }
    const right = _r.set(0, 1, 0).cross(fwd).normalize().negate();
    const side = Math.random() < 0.5 ? 1 : -1;
    switch (this.attack) {
      case 'headon': p.addScaledVector(fwd, 2300).addScaledVector(right, side * (150 + Math.random() * 300)).y += 250 + Math.random() * 250; break;
      case 'stern': p.addScaledVector(fwd, -1500).addScaledVector(right, side * 200).y += 150 + Math.random() * 200; break;
      case 'beam': p.addScaledVector(right, side * 1600).addScaledVector(fwd, 500).y += 400; break;
      case 'high': p.addScaledVector(fwd, -300).addScaledVector(right, side * 600).y += 1500; break;
    }
  }

  private beginAttack() {
    this.state = 'attack'; this.timer = 0; this.calloutDone = false;
    // every firing pass has its own aiming error; better pilots are tighter
    this.aimOffset.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((this.fromArc ? 9 + Math.random() * 16 : 4 + Math.random() * 10) / this.skill);
    this.passOffset.set(Math.random() - 0.5, 0.4 + Math.random() * 0.4, Math.random() - 0.5).normalize().multiplyScalar(30 + Math.random() * 25);
  }

  private beginDuel(w: WorldView, gp: THREE.Vector3) {
    const arc = w.playerArc();
    if (!arc) return;
    this.state = 'duel'; this.timer = 0; this.attackCount++;
    this.duelStation = w.playerStationId();
    this.duelA.copy(arc).normalize();
    this.duelS.crossVectors(this.duelA, _y);
    if (this.duelS.lengthSq() < 1e-4) this.duelS.crossVectors(this.duelA, w.formationForward);
    this.duelS.normalize();
    this.duelU.crossVectors(this.duelS, this.duelA).normalize();
    // start the weave where the fighter already is, turning the way it is already going
    const rel = _u.copy(this.me.pos).sub(gp);
    this.duelPhase = Math.atan2(rel.dot(this.duelS) / 240, (rel.dot(this.duelA) - 400) / 170);
    const side = _t.copy(this.me.vel).sub(this.target!.vel).dot(this.duelS);
    this.duelRate = (side >= 0 ? 1 : -1) * (0.34 + Math.random() * 0.1);
    this.duelLen = 10 + Math.random() * 6 * this.skill;
    // weaving spoils their aim: the duel is a fight, not an execution
    this.aimOffset.multiplyScalar(2.2);
  }

  private endDuel(t: Aircraft | null) {
    this.state = 'break'; this.timer = 0;
    this.me.gunAim = null;
    const away = t ? _r.copy(this.me.pos).sub(t.pos).normalize() : this.me.forward(_r);
    this.breakDir.copy(away).add(_t.set(0, (Math.random() - 0.4) * 0.6, 0)).normalize();
  }

  update(dt: number, w: WorldView) {
    const me = this.me;
    const fm = me.fm;
    me.trigger = false;
    const keepAim = me.gunAim;
    me.gunAim = null;
    this.timer += dt;
    if (!me.alive) return;
    if (me.structureFrac < 0.3 && this.state !== 'withdraw') { this.state = 'withdraw'; this.timer = 0; this.breakDir.copy(me.forward(_t)).setY(-0.15).normalize(); }

    // Jumped by an escort (allied fighter close behind)?
    if (this.state !== 'withdraw' && this.state !== 'evade' && this.state !== 'dogfight') {
      for (const a of w.fighters('allied')) {
        if (!a.alive) continue;
        const toMe = _d.copy(me.pos).sub(a.pos);
        const dist = toMe.length();
        if (dist < 600 && a.forward(_t).dot(toMe.normalize()) > 0.92 && Math.random() < 0.02) {
          this.state = Math.random() < 0.5 * this.skill ? 'dogfight' : 'evade';
          this.target = a; this.timer = 0;
          this.breakDir.set(Math.random() - 0.5, -0.3, Math.random() - 0.5).normalize();
          break;
        }
      }
    }

    switch (this.state) {
      case 'approach': {
        // escort missions: a share of the Fw 190s come for the player's Mustang
        if (!this.target && w.playerFighter?.alive && Math.random() < 0.4) {
          this.target = w.playerFighter; this.state = 'dogfight'; this.timer = 0; break;
        }
        if (!this.target || !this.target.alive || this.target.team !== 'allied' || !(this.target as any).zones) { this.target = this.pickTarget(w); if (!this.target) return; this.computeSetup(w); }
        const d = me.pos.distanceTo(w.formationCenter);
        if (me.dropTankAttached && d < 4000) w.dropTank(me);
        // keep the set-up point moving with the formation
        this.setupPoint.addScaledVector(w.formationForward, 75 * dt);
        steerTo(fm, _d.copy(this.setupPoint).sub(me.pos), 1.1, 0.9);
        fm.throttle = 1;
        let ready = me.pos.distanceTo(this.setupPoint) < 450 || this.timer > 16;
        // arc attacks: start the run as soon as the fighter is out in the gunner's arc
        if (this.fromArc && !ready && this.timer > 1.5) {
          const arc = w.playerArc(), gp = w.playerGunPos();
          if (arc && gp) {
            const rel = _u.copy(me.pos).sub(gp);
            const dist = rel.length();
            if (dist > 650 && dist < 1900 && rel.normalize().angleTo(arc) < 0.6) ready = true;
          }
        }
        if (ready) this.beginAttack();
        break;
      }
      case 'attack': {
        const t = this.target;
        if (!t || !t.alive) { this.state = 'approach'; this.target = null; this.timer = 0; break; }
        leadPoint(me.pos, me.vel, t, 760, this.aim).add(this.aimOffset);
        const gp0 = this.fromArc ? w.playerGunPos() : null;
        if (gp0) this.aim.add(_u.copy(gp0).sub(t.pos));
        const aimDir = _d.copy(this.aim).sub(me.pos);
        const dist = aimDir.length();
        aimDir.divideScalar(Math.max(dist, 1));
        let err: number;
        const gunPos0 = this.fromArc ? w.playerGunPos() : null;
        // aim the run to pass close by the gun position, not through it
        const gunPos = gunPos0 ? _p.copy(gunPos0).add(this.passOffset) : null;
        if (gunPos) {
          // constant-bearing collision course on the gunner's position: the fighter stays
          // in the window and grows in the sight; blend into gun lead for the last 500 m
          const u = _u.copy(gunPos).sub(me.pos);
          const du = u.length();
          u.divideScalar(Math.max(du, 1));
          const speed = Math.max(fm.speed, 110);
          const tu = t.vel.dot(u);
          const c = -tu + Math.sqrt(Math.max(0, tu * tu - t.vel.lengthSq() + speed * speed));
          const coll = _c.copy(t.vel).addScaledVector(u, c).normalize();
          steerTo(fm, coll, 1.2, 0.9);
          // guns are laid on the gun position with lead, independent of the crab angle
          me.gunAim = keepAim ?? new THREE.Vector3();
          me.gunAim.copy(aimDir);
          err = 0.02;
        } else {
          err = steerTo(fm, aimDir, 1.2, 0.9);
        }
        // a slower, steadier run when coming at the player's gun: more time in the sight
        fm.throttle = this.fromArc ? 0.5 : this.attack === 'headon' ? 0.85 : 1;
        const range = 700 + 150 * this.skill;
        const window = gunPos0 ? me.pos.distanceTo(gunPos0) : dist;
        if (dist < range && window > (gunPos0 ? 220 : 0) && err < 0.05 + (1 - this.skill) * 0.03) me.trigger = true;
        if (me.rockets > 0 && dist < 1250 && dist > 800 && err < 0.06) me.fireRockets = true;
        const closing = _t.copy(me.vel).sub(t.vel).dot(_r.copy(t.pos).sub(me.pos)) > 0;
        const realDist = gunPos0 ? me.pos.distanceTo(gunPos0) : dist;
        if (gunPos0 && realDist < 560) { this.beginDuel(w, gunPos0); break; }
        if (realDist < (this.fromArc ? 150 : 160) || (!closing && dist < 400) || this.timer > 22) {
          this.state = 'break'; this.timer = 0; this.attackCount++;
          me.gunAim = null;
          // break across the line of sight so the fighter flashes past the gunner
          const los = _r.copy(t.pos).sub(me.pos).normalize();
          this.breakDir.crossVectors(los, _y).normalize().multiplyScalar(Math.random() < 0.5 ? 1 : -1);
          this.breakDir.addScaledVector(los, 0.5).add(_t.set(0, (Math.random() - 0.6) * 0.8, 0)).normalize();
        }
        break;
      }
      case 'duel': {
        const t = this.target;
        const gp = w.playerGunPos(), arc = w.playerArc();
        // the gunner changed position (or the target is gone): break off and set up again
        if (!t || !t.alive || !gp || !arc || w.playerStationId() !== this.duelStation || this.timer > this.duelLen) { this.endDuel(t); break; }
        this.duelPhase += this.duelRate * dt;
        const ph = this.duelPhase;
        const A = 240, B = 170, R0 = 400, C = 70;
        // target point on the weave and its velocity relative to the bomber
        const P = _p.copy(gp).addScaledVector(this.duelA, R0 + B * Math.cos(ph)).addScaledVector(this.duelS, A * Math.sin(ph)).addScaledVector(this.duelU, C * Math.sin(2 * ph));
        const dv = _c.copy(this.duelA).multiplyScalar(-B * Math.sin(ph)).addScaledVector(this.duelS, A * Math.cos(ph)).addScaledVector(this.duelU, 2 * C * Math.cos(2 * ph)).multiplyScalar(this.duelRate);
        const want = dv.add(t.vel).addScaledVector(_u.copy(P).sub(me.pos), 0.7);
        if (want.length() > 210) want.setLength(210);
        steerTo(fm, want, 1.3, 1);
        fm.throttle = THREE.MathUtils.clamp(0.55 + (want.length() - fm.speed) * 0.04, 0.25, 1);
        // bursts at the gun position whenever the nose comes round onto it
        const toGun = _u.copy(gp).sub(me.pos);
        const dg = toGun.length();
        toGun.divideScalar(Math.max(dg, 1));
        if (dg < 820 && me.forward(_t).dot(toGun) > 0.8 && (this.timer % 3.0) < 0.9) {
          leadPoint(me.pos, me.vel, t, 760, this.aim).add(this.aimOffset).add(_r.copy(gp).sub(t.pos));
          me.gunAim = keepAim ?? new THREE.Vector3();
          me.gunAim.copy(this.aim).sub(me.pos).normalize();
          me.trigger = true;
        }
        break;
      }
      case 'break': {
        steerTo(fm, this.breakDir, 1.3, 1);
        fm.throttle = 1;
        if (this.timer > 2.0) {
          // loop back for another pass, mostly on the same bomber
          if (!this.target || !this.target.alive || Math.random() < 0.3) this.target = this.pickTarget(w);
          if (this.target) {
            const types: AttackType[] = ['headon', 'stern', 'beam', 'high'];
            this.attack = types[Math.floor(Math.random() * types.length)];
            this.computeSetup(w, true);
          }
          this.state = 'approach'; this.timer = 0;
        }
        break;
      }
      case 'evade': {
        if (Math.floor(this.timer / 2.2) % 2 === 1) _d.copy(this.breakDir).multiply(_t.set(-1, 1, -1));
        else _d.copy(this.breakDir);
        steerTo(fm, _d, 1.4, 1);
        fm.throttle = 1;
        if (this.timer > 6) { this.state = 'approach'; this.target = null; this.timer = 0; }
        break;
      }
      case 'dogfight': {
        const t = this.target;
        if (!t || !t.alive || this.timer > 40) { this.state = 'approach'; this.target = null; this.timer = 0; break; }
        if (Math.floor(this.timer / 3) !== Math.floor((this.timer - dt) / 3)) this.aimOffset.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((6 + Math.random() * 12) / this.skill);
        leadPoint(me.pos, me.vel, t, 760, this.aim).add(this.aimOffset);
        const dir = _d.copy(this.aim).sub(me.pos);
        const dist = dir.length();
        const err = steerTo(fm, dir, 1.3, 1);
        fm.throttle = 1;
        if (dist < 550 && err < 0.04 * this.skill + 0.02) me.trigger = true;
        break;
      }
      case 'withdraw': {
        // trailing smoke, limping away: still a target for a determined gunner
        steerTo(fm, this.breakDir, 0.6, 0.4);
        fm.throttle = 0.55;
        break;
      }
    }

    // Stay above the cloud deck
    if (me.pos.y < 5600 && this.state !== 'withdraw') {
      const k = THREE.MathUtils.clamp((5600 - me.pos.y) / 1000, 0, 1);
      if (k > 0.3) steerTo(fm, _d.copy(me.forward(_t)).setY(0).normalize().add(_r.set(0, 0.5 + k, 0)), 1.2, 1);
    }
    if (me.pos.y < 4600) steerTo(fm, _d.copy(me.forward(_t)).setY(0).normalize().add(_r.set(0, 0.8, 0)), 1.2, 1);
  }
}

// Allied escort pilot (P-51 wingmen)
export class EscortPilot {
  target: Fighter | null = null;
  timer = 0;
  private aim = new THREE.Vector3();
  constructor(public me: Fighter, public slot: THREE.Vector3) {}

  update(dt: number, w: WorldView) {
    const me = this.me, fm = me.fm;
    me.trigger = false;
    if (!me.alive) return;
    this.timer += dt;
    if (!this.target || !this.target.alive || this.timer > 25) {
      this.timer = 0;
      let best: Fighter | null = null, bd = 3500;
      for (const e of w.fighters('axis')) {
        if (!e.alive) continue;
        const d = e.pos.distanceTo(me.pos);
        if (d < bd) { bd = d; best = e; }
      }
      this.target = best;
    }
    if (this.target) {
      leadPoint(me.pos, me.vel, this.target, 880, this.aim);
      const dir = _d.copy(this.aim).sub(me.pos);
      const dist = dir.length();
      const err = steerTo(fm, dir, 1.2, 1);
      fm.throttle = 1;
      if (dist < 500 && err < 0.035) me.trigger = true;
    } else {
      // return to escort station above the formation
      const p = _t.copy(w.formationCenter).add(this.slot);
      const dir = _d.copy(p).sub(me.pos);
      if (dir.length() < 300) dir.copy(w.formationForward).multiplyScalar(500).add(dir);
      steerTo(fm, dir, 0.8, 0.5);
      fm.throttle = THREE.MathUtils.clamp(0.55 + (dir.length() - 300) / 3000, 0.45, 1);
    }
    if (me.pos.y < 4600) steerTo(fm, _d.copy(me.forward(_t)).setY(0).normalize().add(_r.set(0, 0.8, 0)), 1.2, 1);
  }
}
