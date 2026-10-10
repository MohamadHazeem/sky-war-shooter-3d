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
  time: number;
  dropTank(f: Fighter): void;
  difficulty: number; // 0.5 .. 1.5
}

// Luftwaffe fighter pilot: picks attack geometry against the bomber box, runs in,
// breaks away under the formation, extends, repeats. Turns to fight escorts if jumped.
export class EnemyPilot {
  state: 'approach' | 'setup' | 'attack' | 'break' | 'extend' | 'dogfight' | 'evade' | 'withdraw' = 'approach';
  attack: AttackType = 'headon';
  target: Aircraft | null = null;
  timer = 0;
  setupPoint = new THREE.Vector3();
  breakDir = new THREE.Vector3();
  skill: number;
  firedBurst = 0;
  private aim = new THREE.Vector3();
  calloutDone = false;
  attackCount = 0;
  private aimOffset = new THREE.Vector3();

  constructor(public me: Fighter, preferred?: AttackType, skill = 1) {
    this.skill = skill * (0.8 + Math.random() * 0.4);
    if (preferred) this.attack = preferred;
  }

  private pickTarget(w: WorldView) {
    const bs = w.bombers().filter((b) => b.alive);
    if (!bs.length) return null;
    // Prefer stragglers, then the player's bomber now and then, then random
    const strag = bs.filter((b) => b.straggling);
    if (strag.length && Math.random() < 0.45) return strag[Math.floor(Math.random() * strag.length)];
    const pl = bs.find((b) => b.isPlayer);
    if (pl && Math.random() < 0.4) return pl;
    return bs[Math.floor(Math.random() * bs.length)];
  }

  private computeSetup(w: WorldView) {
    const t = this.target!;
    const fwd = w.formationForward;
    const right = _r.set(0, 1, 0).cross(fwd).normalize().negate(); // right of formation (-X when fwd=+Z)
    const side = Math.random() < 0.5 ? 1 : -1;
    const p = this.setupPoint.copy(t.pos);
    switch (this.attack) {
      case 'headon': p.addScaledVector(fwd, 2600).addScaledVector(right, side * (150 + Math.random() * 300)).y += 250 + Math.random() * 250; break;
      case 'stern': p.addScaledVector(fwd, -1700).addScaledVector(right, side * 200).y += 150 + Math.random() * 200; break;
      case 'beam': p.addScaledVector(right, side * 1900).addScaledVector(fwd, 600).y += 450; break;
      case 'high': p.addScaledVector(fwd, -300).addScaledVector(right, side * 600).y += 1700; break;
    }
  }

  update(dt: number, w: WorldView) {
    const me = this.me;
    const fm = me.fm;
    me.trigger = false;
    this.timer += dt;
    if (!me.alive) return;
    const hp = me.integrity;
    if (hp < 0.35 && this.state !== 'withdraw') { this.state = 'withdraw'; this.timer = 0; }

    // Being chased by an escort? (allied fighter close behind)
    if (this.state !== 'withdraw' && this.state !== 'evade' && this.state !== 'dogfight') {
      for (const a of w.fighters('allied')) {
        if (!a.alive) continue;
        const toMe = _d.copy(me.pos).sub(a.pos);
        const dist = toMe.length();
        if (dist < 700 && a.forward(_t).dot(toMe.normalize()) > 0.9) {
          this.state = Math.random() < 0.5 * this.skill ? 'dogfight' : 'evade';
          this.target = a; this.timer = 0;
          this.breakDir.set(Math.random() - 0.5, -0.4, Math.random() - 0.5).normalize();
          break;
        }
      }
    }

    switch (this.state) {
      case 'approach': {
        if (!this.target || !this.target.alive) { this.target = this.pickTarget(w); if (!this.target) return; this.computeSetup(w); }
        const d = me.pos.distanceTo(w.formationCenter);
        if (me.dropTankAttached && d < 4500) w.dropTank(me);
        steerTo(fm, _d.copy(this.setupPoint).sub(me.pos), 1, 0.6);
        fm.throttle = 1;
        if (me.pos.distanceTo(this.setupPoint) < 500 || this.timer > 40) {
          this.state = 'attack'; this.timer = 0;
          // Every firing pass has its own aiming error; better pilots are tighter
          this.aimOffset.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((4 + Math.random() * 10) / this.skill);
        }
        // keep setup point moving with the formation
        this.setupPoint.addScaledVector(w.formationForward, 75 * dt);
        break;
      }
      case 'attack': {
        const t = this.target;
        if (!t || !t.alive) { this.state = 'extend'; this.timer = 0; break; }
        leadPoint(me.pos, me.vel, t, 760, this.aim).add(this.aimOffset);
        // aim slightly at the cockpit/engines of the bomber
        const aimDir = _d.copy(this.aim).sub(me.pos);
        const dist = aimDir.length();
        const err = steerTo(fm, aimDir, 1.2, 0.9);
        fm.throttle = this.attack === 'headon' ? 0.85 : 1;
        const range = 650 + 150 * this.skill;
        if (dist < range && err < 0.05 + (1 - this.skill) * 0.03) me.trigger = true;
        // Wgr. 21 rockets are lobbed into the formation from ~1 km, before closing in
        if (me.rockets > 0 && dist < 1250 && dist > 800 && err < 0.06) me.fireRockets = true;
        const breakDist = this.attack === 'headon' ? 220 : 160;
        if (dist < breakDist || this.timer > 30) {
          this.state = 'break'; this.timer = 0; this.attackCount++;
          const fwd = me.forward(_t);
          // Break away: dive under (or over) the bomber and roll off to the side
          this.breakDir.copy(fwd).add(_r.set(Math.random() - 0.5, this.attack === 'high' ? -1.2 : -0.7, Math.random() - 0.5)).normalize();
        }
        break;
      }
      case 'break': {
        steerTo(fm, this.breakDir, 1.3, 1);
        fm.throttle = 1;
        if (this.timer > 3.5) { this.state = 'extend'; this.timer = 0; }
        break;
      }
      case 'extend': {
        const away = _d.copy(me.pos).sub(w.formationCenter);
        const dist = away.length();
        away.y = Math.min(away.y, 0) * 0.2 + 0.25 * dist * 0.1;
        steerTo(fm, away.normalize().add(_t.set(0, 0.25, 0)), 0.9, 0.7);
        fm.throttle = 1;
        if (dist > 2600 || this.timer > 18) {
          const types: AttackType[] = ['headon', 'stern', 'beam', 'high'];
          this.attack = types[Math.floor(Math.random() * types.length)];
          this.target = this.pickTarget(w);
          if (this.target) this.computeSetup(w);
          this.state = 'approach'; this.timer = 0; this.calloutDone = false;
        }
        break;
      }
      case 'evade': {
        // hard break turn, reversal every couple of seconds
        if (Math.floor(this.timer / 2.2) % 2 === 1) _d.copy(this.breakDir).multiply(_t.set(-1, 1, -1));
        else _d.copy(this.breakDir);
        steerTo(fm, _d, 1.4, 1);
        fm.throttle = 1;
        if (this.timer > 7) { this.state = 'extend'; this.timer = 0; }
        break;
      }
      case 'dogfight': {
        const t = this.target;
        if (!t || !t.alive || this.timer > 35) { this.state = 'extend'; this.timer = 0; break; }
        leadPoint(me.pos, me.vel, t, 760, this.aim);
        const dir = _d.copy(this.aim).sub(me.pos);
        const dist = dir.length();
        const err = steerTo(fm, dir, 1.3, 1);
        fm.throttle = 1;
        if (dist < 600 && err < 0.04 * this.skill + 0.02) me.trigger = true;
        break;
      }
      case 'withdraw': {
        _d.copy(me.pos).sub(w.formationCenter).setY(0).normalize();
        _d.y = -0.35;
        steerTo(fm, _d, 0.8, 0.6);
        fm.throttle = 0.9;
        break;
      }
    }

    // Stay above the cloud deck: blend in a climb as the fighter gets low
    if (me.pos.y < 5600 && this.state !== 'withdraw') {
      const k = THREE.MathUtils.clamp((5600 - me.pos.y) / 1000, 0, 1);
      if (k > 0.3) steerTo(fm, _d.copy(me.forward(_t)).setY(0).normalize().add(_r.set(0, 0.5 + k, 0)), 1.2, 1);
    }
    if (me.pos.y < 4600) {
      steerTo(fm, _d.copy(me.forward(_t)).setY(0).normalize().add(_r.set(0, 0.8, 0)), 1.2, 1);
    }
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
