import { weatherNow } from '../render/WeatherState';
import * as THREE from 'three';
import { leadPoint, steerTo, type WorldView } from './AI';
import type { Fighter } from './Aircraft';

// Basic fighter manoeuvres for Luftwaffe fighters that have picked a fight with the player's
// P-51 (EnemyPilot's 'dogfight' state delegates here while its target is the player's Mustang;
// fights with the AI escorts and every bomber attack stay in AI.ts).
//
// Each enemy type flies its own way:
//   Fw 190  rolling reversals and short energy climbs; occasionally zooms out of a hard turn
//   Bf 109  turn fighter: hangs in the turn, breaks into you, reverses into scissors
//   Me 262 / Me 163  slashers: a high-speed pass, short extension, wide turn back, again
//   Bf 110 / Ju 88 / Me 410 / He 111  heavies: lumbering, mild defensive turns that give the rear gunner a shot
//   Do 335  boom-and-zoom like the Fw 190 (fast, heavy in the turn)
// Shared moves: break turn when the Mustang is on its six (a warning call goes out), defensive
// spiral, head-on passes, climbing / unloading to regain energy, and leader + wingman pairs in
// which the wingman flies cover and goes for the Mustang when it gets behind his leader.
//
// Skill scales reaction time, how reliably a pilot notices a bandit on his six, how hard he
// pulls and how tight his gunnery is, so low-skill pilots can be bounced and beaten.

export type DogfightStyle = 'boomzoom' | 'turner' | 'slasher' | 'heavy';
export type BfmMode = 'engage' | 'pursue' | 'break' | 'scissors' | 'spiral' | 'extend' | 'zoom' | 'regain' | 'headon' | 'cover';
export type BfmCall = 'break' | 'scissors' | 'extend' | 'headon' | 'cover' | 'spiral' | 'zoom';

export interface StyleDef {
  pull: number;        // max stick pull in a turning fight
  turnTime: number;    // s of hard turning before going vertical / extending (Infinity = stays in it)
  fireRange: number;   // m: opens fire inside this
  extendTo: number;    // m of separation before coming back round
  engageTime: number;  // minimum s engaged before returning to bombers after losing contact
  detect: number;      // chance per decision (x skill) to notice a bandit closing on his six
}

export const STYLES: Record<DogfightStyle, StyleDef> = {
  boomzoom: { pull: 0.95, turnTime: 8, fireRange: 620, extendTo: 750, engageTime: 60, detect: 0.5 },
  turner: { pull: 1.0, turnTime: Infinity, fireRange: 520, extendTo: 900, engageTime: 70, detect: 0.55 },
  slasher: { pull: 0.75, turnTime: 2.5, fireRange: 720, extendTo: 1100, engageTime: 55, detect: 0.45 },
  heavy: { pull: 0.7, turnTime: 9, fireRange: 560, extendTo: 1100, engageTime: 35, detect: 0.35 },
};

export function styleOf(enemyType: string): DogfightStyle {
  switch (enemyType) {
    case 'bf109': return 'turner';
    case 'me262': case 'me163': return 'slasher';
    case 'bf110': case 'ju88': case 'me410': case 'he111': return 'heavy';
    default: return 'boomzoom';
  }
}

// HUD wording for the padlocked bandit (PilotController)
const LABELS: Record<BfmMode, string> = {
  engage: 'ENGAGING', pursue: 'ATTACKING', break: 'BREAKING', scissors: 'SCISSORS', spiral: 'SPIRALLING',
  extend: 'EXTENDING', zoom: 'CLIMBING', regain: 'UNLOADING', headon: 'HEAD-ON', cover: 'COVERING LEAD',
};

const DEFENSIVE = new Set<BfmMode>(['break', 'scissors', 'spiral', 'extend']);
const registry = new WeakMap<Fighter, DogfightAI>();

const _rel = new THREE.Vector3();
const _los = new THREE.Vector3();
const _f = new THREE.Vector3();
const _tf = new THREE.Vector3();
const _r = new THREE.Vector3();
const _d = new THREE.Vector3();
const _a = new THREE.Vector3();
const _h = new THREE.Vector3();
const _t = new THREE.Vector3();
const _rv = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const horiz = (v: THREE.Vector3, out: THREE.Vector3) => {
  out.set(v.x, 0, v.z);
  const l = out.length();
  return l > 1e-4 ? out.divideScalar(l) : out.set(0, 0, 1);
};

export class DogfightAI {
  // Radio hook (PilotOps turns these into callouts and HUD cues). side: which way he turns.
  static onCall: ((call: BfmCall, ai: DogfightAI, side: 'left' | 'right') => void) | null = null;
  static of(f: Fighter) { return registry.get(f); }
  // Leader + wingman: the wingman flies cover on his leader until the Mustang threatens him
  static pair(lead: DogfightAI, wing: DogfightAI) {
    lead.wingman = wing; wing.leader = lead;
    wing.mode = 'cover'; wing.modeT = 0;
  }

  mode: BfmMode = 'engage';
  modeT = 0;          // s in the current mode
  timer = 0;          // s engaged in total
  readonly style: DogfightStyle;
  readonly def: StyleDef;
  leader: DogfightAI | null = null;
  wingman: DogfightAI | null = null;
  side = 1;                     // committed turn direction (+1 = right)
  private decideT = 0;
  private aimErr = new THREE.Vector3();
  private aim = new THREE.Vector3();
  private burstT = 0;           // > 0: firing burst left; < 0: pause before the next one
  private turnT = 0;            // time spent pulling hard (bleeding energy)
  private lastContact = 0;     // s without a close fight or incoming fire
  private lastThreat = 99;      // s since the Mustang was last on his six
  private jink = 1;             // head-on: pull up (+1) or push under (-1)
  private engageFor: number;
  private reaction: number;
  private covering = false;     // wingman: going for the Mustang because it is on his leader
  private breakCd = 0;          // after a defensive move he needs a moment before the next one

  constructor(public me: Fighter, public skill = 1) {
    this.style = styleOf(me.enemyType);
    this.def = STYLES[this.style];
    this.reaction = THREE.MathUtils.clamp(0.8 - 0.32 * skill, 0.22, 0.65);
    this.engageFor = this.def.engageTime * (0.8 + Math.random() * 0.4);
    this.side = Math.random() < 0.5 ? -1 : 1;
    registry.set(me, this);
  }

  get label() { return LABELS[this.mode]; }
  get defensive() { return DEFENSIVE.has(this.mode); }

  // Dissolve the pairing (the fight is over or he went home)
  end() {
    if (this.leader?.wingman === this) this.leader.wingman = null;
    if (this.wingman?.leader === this) this.wingman.leader = null;
    this.leader = this.wingman = null;
  }

  private setMode(m: BfmMode, call?: BfmCall) {
    if (this.mode === m) return;
    if (DEFENSIVE.has(this.mode) && !DEFENSIVE.has(m)) this.breakCd = 2.2 + Math.random() * 2 / Math.max(0.6, this.skill);
    this.mode = m; this.modeT = 0;
    if (m !== 'pursue') this.turnT = 0;
    if (call) DogfightAI.onCall?.(call, this, this.side > 0 ? 'right' : 'left');
  }

  // One step of the fight against t. Returns false when he disengages (back to the bombers).
  update(dt: number, w: WorldView, t: Fighter): boolean {
    const me = this.me, fm = me.fm;
    me.trigger = false;
    if (!me.alive || !t.alive) return false;
    this.timer += dt; this.modeT += dt; this.decideT -= dt; this.lastThreat += dt;
    if (!DEFENSIVE.has(this.mode)) this.breakCd = Math.max(0, this.breakCd - dt);
    if (this.leader && !this.leader.me.alive) this.leader = null;

    // ---- geometry ----
    const rel = _rel.copy(t.pos).sub(me.pos);
    const dist = Math.max(1, rel.length());
    const los = _los.copy(rel).divideScalar(dist);
    const fwd = me.forward(_f);
    const tf = t.forward(_tf);
    const right = fm.right(_r);
    const myAim = fwd.dot(los);        // 1: my nose is on him
    const threat = -tf.dot(los);        // 1: his nose is on me
    const behindHim = tf.dot(los);      // 1: I'm sitting on his six
    const lat = los.dot(right);         // + he is to my right

    const threatened = dist < 1200 && threat > 0.82 && myAim < 0.25;
    leadPoint(me.pos, me.vel, t, 760, this.aim).add(this.aimErr);
    if (threatened) this.lastThreat = 0;
    const underFire = dist < 1400 && t.trigger && threat > 0.97;
    this.lastContact = dist < 900 || threatened || underFire ? 0 : this.lastContact + dt;
    // Don't abandon a live turning fight when a lifetime timer expires. Once the
    // Mustang leaves, resume the bomber mission rather than chase it indefinitely.
    if (this.timer > this.engageFor && this.lastContact > 8 && !this.leader) return false;

    if (this.decideT <= 0) {
      this.decideT = this.reaction * (0.7 + Math.random() * 0.6);
      this.decide(w, t, dist, myAim, threat, behindHim, lat, threatened);
    }

    // ---- fly the mode ----
    const pull = this.def.pull * THREE.MathUtils.clamp(0.75 + 0.2 * this.skill, 0.8, 1);
    let dir: THREE.Vector3;
    let throttle = 1;
    let gain = 1.3;
    switch (this.mode) {
      case 'cover': {
        const L = this.leader?.me;
        if (!L) { dir = _d.copy(rel); break; }
        // loose deuce: 230 m behind and 170 m to the side of the leader, a little high
        const lf = L.forward(_a);
        const lr = L.fm.right(_h);
        const slot = _t.copy(L.pos).addScaledVector(lf, -230).addScaledVector(lr, 170 * this.side).addScaledVector(UP, 30);
        dir = _d.copy(slot).addScaledVector(L.vel, 1.2).sub(me.pos);
        const along = _rv.copy(slot).sub(me.pos).dot(fwd);
        throttle = THREE.MathUtils.clamp(0.75 + along / 500, 0.35, 1);
        gain = 1;
        break;
      }
      case 'break': {
        // max-rate turn into the attacker, nose a touch low to hold speed
        dir = _d.copy(right).multiplyScalar(this.side).addScaledVector(fwd, 0.2).addScaledVector(UP, -0.1);
        gain = 1.5;
        break;
      }
      case 'scissors': {
        // reverse into him every time he crosses; slow down so he flies out in front
        if (Math.abs(lat) > 0.12 && Math.sign(lat) !== this.side) this.side = Math.sign(lat);
        const behind = _t.copy(t.pos).addScaledVector(tf, -120).sub(me.pos).normalize();
        dir = _d.copy(right).multiplyScalar(this.side * 0.8).add(behind);
        throttle = 0.4;
        gain = 1.5;
        break;
      }
      case 'spiral': {
        // descending defensive spiral: tight, nose low, power back so he overshoots
        horiz(fwd, _h);
        dir = _d.copy(_h).applyAxisAngle(UP, -this.side * 1.1).addScaledVector(UP, me.pos.y < 6400 ? -0.1 : -0.55);
        throttle = 0.55;
        gain = 1.5;
        break;
      }
      case 'extend': {
        // unload and run: away from him, slightly downhill for speed
        const away = horiz(_t.copy(me.pos).sub(t.pos), _a);
        horiz(fwd, _h);
        const k = this.style === 'slasher' ? 0.25 : 0.5;
        const down = me.pos.y < 6400 ? 0.02 : this.style === 'slasher' ? -0.06 : -0.18;
        dir = _d.copy(_h).multiplyScalar(1 - k).addScaledVector(away, k).normalize().addScaledVector(UP, down);
        gain = 0.9;
        break;
      }
      case 'zoom': {
        // climb back to an energy advantage, turning gently back toward the fight
        horiz(fwd, _h);
        const toT = horiz(rel, _a);
        if (this.style === 'slasher') dir = _d.copy(toT).addScaledVector(UP, 0.06);
        else dir = _d.copy(_h).lerp(toT, 0.55).normalize().addScaledVector(UP, 0.4);
        gain = 1;
        break;
      }
      case 'regain': {
        horiz(fwd, _h);
        dir = _d.copy(_h).addScaledVector(UP, -0.28);
        gain = 0.9;
        break;
      }
      case 'headon': {
        dir = _d.copy(this.aim).sub(me.pos);
        // break off the collision at the last moment: over or under him
        if (dist < 190 && myAim > 0.5) dir = _d.copy(fwd).addScaledVector(UP, this.jink * 0.9);
        break;
      }
      default: { // engage, pursue
        dir = _d.copy(this.aim).sub(me.pos);
        const closure = -_rv.copy(t.vel).sub(me.vel).dot(los);
        // lag pursuit when closing fast at short range: aim behind him rather than overshoot
        if (dist < 380 && closure > 55 && this.style !== 'slasher') dir = _d.copy(t.pos).addScaledVector(tf, -90).sub(me.pos);
        if (this.style === 'turner' && dist < 280 && closure > 25) throttle = 0.6;
        if (this.style === 'heavy') throttle = 1;
        if (fm.gLoad > 3.2) this.turnT += dt; else this.turnT = Math.max(0, this.turnT - dt * 0.5);
        break;
      }
    }
    // never fly into him
    if (dist < 95 && _rv.copy(t.vel).sub(me.vel).dot(los) < 0) dir = _d.copy(fwd).addScaledVector(UP, me.pos.y >= t.pos.y ? 1 : -1);
    // energy management: ease the pull when slow (defensive moves still pull everything)
    const ease = this.defensive ? 1 : THREE.MathUtils.clamp((fm.speed - 60) / 60, 0.6, 1);
    const maxPull = this.mode === 'cover' || this.mode === 'extend' || this.mode === 'regain' ? 0.7 : pull * ease;
    steerTo(fm, dir, gain, maxPull);
    fm.throttle = throttle;

    // gunnery is judged on the lead point, whatever the flight path is doing
    const aimErr = fwd.angleTo(_a.copy(this.aim).sub(me.pos));
    this.guns(dt, w, dist, aimErr);
    return true;
  }

  private decide(w: WorldView, t: Fighter, dist: number, myAim: number, threat: number, behindHim: number, lat: number, threatened: boolean) {
    const me = this.me, fm = me.fm;
    const m = this.mode;
    const speed = fm.speed;

    // wingman: fly cover until the Mustang gets onto the leader, then go for it
    if (this.leader && !threatened) {
      const L = this.leader.me;
      const toL = _a.copy(L.pos).sub(t.pos);
      const dL = toL.length();
      const onLead = dL < 1000 && t.forward(_h).dot(toL.divideScalar(Math.max(dL, 1))) > 0.9;
      if (onLead && !this.covering) { this.covering = true; this.setMode('pursue', 'cover'); return; }
      if (!onLead && this.covering && this.modeT > 6) { this.covering = false; this.setMode('cover'); return; }
      // a gift: the Mustang crossing in front of the wingman
      if (m === 'cover' && myAim > 0.92 && dist < 700) { this.setMode('pursue'); return; }
      if (m === 'cover') return;
    }

    // Bound the extension even when the Mustang is still following. Previously the
    // threatened branch could skip the turn-back and keep opening the separation.
    if (m === 'extend' && (dist > this.def.extendTo || this.modeT > (this.style === 'slasher' ? 5.5 : 3))) {
      this.setMode('zoom'); return;
    }

    if ((m === 'break' && this.modeT > 4.5) || (m === 'spiral' && this.modeT > 4)) {
      this.setMode(dist < 650 ? 'scissors' : 'pursue', dist < 650 ? 'scissors' : undefined); return;
    }
    if (m === 'scissors' && this.modeT > 6) { this.setMode('pursue'); return; }

    if (threatened && m !== 'zoom' && m !== 'regain') {
      // low-skill pilots don't always see him coming: a free shot for the player
      const responding = DEFENSIVE.has(m) && !(m === 'extend' && dist < 450 && this.style !== 'slasher');
      // a bandit at long range or dead astern in the blind spot is easier to miss
      const see = this.def.detect * this.skill * (dist < 650 ? 1 : 0.45) * (threat > 0.985 && myAim < -0.97 ? 0.6 : 1);
      if (!responding && this.breakCd <= 0 && Math.random() < see + (m === 'headon' ? 0.5 : 0)) {
        this.side = Math.abs(lat) > 0.05 ? Math.sign(lat) : (Math.random() < 0.5 ? -1 : 1);
        if (this.style === 'slasher' && speed > 150) this.setMode('extend', 'extend');
        else if (this.style === 'boomzoom' && speed > 175 && me.pos.y > 6600 && Math.random() < 0.2) this.setMode('zoom', 'zoom');
        else if (this.style !== 'heavy' && me.pos.y > 6900 && Math.random() < 0.2) this.setMode('spiral', 'spiral');
        else this.setMode('break', 'break');
        return;
      }
      return;
    }

    // he overshot the break: reverse into the scissors (turners) or take the snap shot
    if (m === 'break' && myAim > 0.2 && dist < 480) {
      if (this.style === 'turner' || this.style === 'heavy') this.setMode('scissors', 'scissors');
      else if (this.style === 'slasher') this.setMode('extend');
      else this.setMode('pursue');
      return;
    }
    if ((m === 'break' || m === 'spiral') && this.lastThreat > 1.4) {
      this.setMode(this.style === 'slasher' ? 'extend' : 'pursue');
      return;
    }
    if (m === 'scissors' && behindHim > 0.5 && myAim > 0.7) {
      this.setMode('pursue');
      return;
    }

    // neutral, noses on each other: a head-on pass
    if (threat > 0.88 && myAim > 0.88 && dist < 1700 && m !== 'headon' && !DEFENSIVE.has(m)) {
      this.jink = me.pos.y >= t.pos.y ? 1 : -1;
      this.setMode('headon', 'headon');
      return;
    }
    if (m === 'headon') {
      if ((myAim < 0 && dist > 140) || this.modeT > 9) this.setMode(this.style === 'slasher' ? 'extend' : this.style === 'boomzoom' && speed > 170 && Math.random() < 0.3 ? 'zoom' : 'pursue');
      return;
    }

    // out of energy: unload to get speed back
    if (speed < 85 && m !== 'regain') { this.setMode('regain'); return; }
    if (m === 'regain') { if (speed > 125 || this.modeT > 4) this.setMode('pursue'); return; }

    if (m === 'zoom') {
      // Jets need time to complete their wider reversal, but steer directly back
      // at the Mustang; a shallow chase turn just creates another long orbit.
      const above = me.pos.y - t.pos.y;
      if ((this.style !== 'slasher' && above > 320 && this.modeT > 2) || speed < 125 || this.modeT > (this.style === 'slasher' ? 16 : 4.5) || (this.style === 'slasher' && myAim > 0.7)) this.setMode('pursue');
      return;
    }
    if (m === 'engage') {
      // Focke-Wulfs want height before they commit; everyone else goes straight in
      if (this.style === 'boomzoom' && me.pos.y < t.pos.y + 150 && dist > 1200) this.setMode('zoom');
      else this.setMode('pursue');
      return;
    }
    if (m === 'pursue') {
      const solution = dist < this.def.fireRange && myAim > 0.97;
      if (this.style === 'boomzoom' && this.turnT > this.def.turnTime && !solution) { this.setMode('zoom', 'zoom'); return; }
      if (this.style === 'heavy' && this.turnT > this.def.turnTime && !solution) { this.setMode('regain'); return; }
      if (this.style === 'slasher' && this.modeT > 1.5 && (dist < 230 || (myAim < 0.4 && dist < 800) || this.turnT > this.def.turnTime)) { this.setMode('extend', 'extend'); return; }
      // a long turning fight wears a pilot down: he loses sight or unloads to get his speed
      // back for a moment, and the Mustang gets its shot (sooner against the less skilled)
      if (this.turnT > 7 + 6 * this.skill && myAim < 0.9 && Math.random() < 0.35) { this.turnT = 0; this.setMode('regain'); return; }
    }
    if (m === 'cover') this.setMode('pursue');
  }

  // Bursts on the boresight when the lead solution is good; aim error re-rolled every burst
  private guns(dt: number, w: WorldView, dist: number, err: number) {
    const me = this.me;
    me.gunAim = null;
    const attacking = this.mode === 'pursue' || this.mode === 'headon' || this.mode === 'engage' || this.mode === 'scissors';
    // snap shots too, not only perfect solutions: close in, a deflection burst as the nose swings through
    const cone = 0.045 + 0.03 * THREE.MathUtils.clamp(1.4 - this.skill, 0, 1) + (dist < 420 ? 0.05 * this.skill : 0);
    const range = this.mode === 'headon' ? (dist < 760 * weatherNow.spotting && dist > 200) : dist < this.def.fireRange * weatherNow.spotting;
    if (this.burstT < 0) { this.burstT = Math.min(0, this.burstT + dt); return; }
    if (this.burstT > 0) {
      this.burstT -= dt;
      if (attacking && range && err < cone * 2.2) { me.trigger = true; this.layGuns(); }
      if (this.burstT <= 0) this.burstT = -(0.35 + Math.random() * 0.6) / Math.max(0.6, this.skill);
      return;
    }
    if (attacking && range && err < cone) {
      this.burstT = 0.45 + Math.random() * 0.6 * this.skill;
      // angular aim error: a good pilot puts a fair share of a burst into the Mustang
      this.aimErr.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
        .multiplyScalar(dist * (0.001 + Math.random() * 0.007) / this.skill * w.enemyAimMult * weatherNow.aimError);
      me.trigger = true;
      this.layGuns();
    }
  }

  // With the nose about on, the burst goes where he is aiming (lead point + this burst's error):
  // the error, set by skill, decides how much of it hits
  private layGuns() {
    const me = this.me;
    me.gunAim = this.gunDir.copy(this.aim).sub(me.pos).normalize();
  }
  private gunDir = new THREE.Vector3();
}
