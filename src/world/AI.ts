import { weatherNow } from '../render/WeatherState';
import * as THREE from 'three';
import type { FlightModel } from './FlightModel';
import type { Aircraft, Bomber, Fighter, HitZone } from './Aircraft';
import { DogfightAI } from './DogfightAI';
import type { StationId } from './B17Layout';
import { STATION_CREW } from './Crew';
import {
  AI_CALLS, AI_STATS, EVADE_COOLDOWN, SIGNATURES, STATION_OF, WEAK_CALL,
  chooseApproach, decisionQuality, energyPlan, envelope, envelopeThrottle, evasionThreshold, limpThrottle,
  pickEvasion, randomPersonality, reactionTime, updatePressure, wingSlot, woundedChoice,
  type Envelope, type EnergyMove, type Evasion, type Persona, type Rng, type Signature, type TargetState,
} from './PilotMind';

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
  bombRunHold?: boolean;
  bombers(): Bomber[];
  fighters(team: 'allied' | 'axis'): Fighter[];
  formationForward: THREE.Vector3;
  formationCenter: THREE.Vector3;
  player: Aircraft | null;
  playerFighter: Fighter | null;
  remoteFighter?: Fighter | null;
  time: number;
  dropTank(f: Fighter): void;
  difficulty: number; // 0.5 .. 1.5
  playerFocus: number;               // chance an attacker picks the player's bomber
  playerArc(): THREE.Vector3 | null; // world direction the player's gun position covers (gunner mode)
  playerGunPos(): THREE.Vector3 | null; // world position of the player's gun (gunner mode)
  playerStationId(): string | null;
  stationArc(id: string): THREE.Vector3 | null;    // a gun position's direction on the player's ship
  stationGunPos(id: string): THREE.Vector3 | null;
  enemyAimMult: number;              // perk: >1 spoils the attackers' aim
  // Enemy AI 2.0 (optional so small test hosts can leave them out; World has all three)
  crew?: { readonly wounded: ReadonlySet<string> };   // the player's own crew: a wounded gunner's sector is weak
  callout?(key: string, speaker: string, text: string, cooldown?: number, priority?: number): void;
}

// Rotte / Schwarm: a wingman flies a slot on his leader and starts his run `delay` s after him
export interface WingLink { leader: EnemyPilot; i: number; delay: number }

// What a pilot knows about a bomber when he picks his attack (PilotMind.chooseApproach);
// one shared object, refilled per decision (no allocation)
const TS: TargetState = { straggler: false, engineOut: [0, 0], weak: {} };
const GUNS: StationId[] = ['waistL', 'waistR', 'top', 'ball', 'tail'];
function targetState(b: Bomber, w: WorldView, own: boolean): TargetState {
  TS.straggler = b.straggling;
  TS.engineOut[0] = (b.engineDead[0] ? 1 : 0) + (b.engineDead[1] ? 1 : 0);   // engines 1-2: left wing
  TS.engineOut[1] = (b.engineDead[2] ? 1 : 0) + (b.engineDead[3] ? 1 : 0);
  for (const s of GUNS) TS.weak[s] = own && w.crew?.wounded.has(STATION_CREW[s]) ? 0.8 : 0;
  // a shot-up tail or fuselage around a gun position: that gun is firing less
  for (const z of b.zones) {
    if (z.hp > z.maxHp * 0.4) continue;
    if (z.name === 'tail') TS.weak.tail = Math.max(TS.weak.tail!, 0.5);
    else if (z.name === 'fuselageMid') { TS.weak.waistL = Math.max(TS.weak.waistL!, 0.4); TS.weak.waistR = Math.max(TS.weak.waistR!, 0.4); }
    else if (z.name === 'fuselageFwd') TS.weak.top = Math.max(TS.weak.top!, 0.4);
  }
  // the player's own gun is never the weak one: he is on it
  const cur = own ? w.playerStationId() : null;
  if (cur) TS.weak[cur as StationId] = 0;
  return TS;
}

// Tactics layer hook (Tactics.ts): while a pilot has an override, the tactic flies it with
// shared waypoints and timing (group attacks, per-type behaviour). fly() returns true when it
// has flown the aircraft this frame, false to let the normal state machine fly it. Dropped
// when the pilot withdraws; skipped while it is dogfighting / evading escorts.
// steady: never breaks off to dogfight / evade a fighter on its tail (bomber raids, Raid.ts).
export interface PilotOverride { fly(p: EnemyPilot, dt: number, w: WorldView): boolean; steady?: boolean }

const _y = new THREE.Vector3(0, 1, 0);
const _u = new THREE.Vector3();
const _c = new THREE.Vector3();
const _p = new THREE.Vector3();
const _slot = { x: 0, y: 0, z: 0 };

// Luftwaffe fighter pilot. Attacks on the player's bomber are flown *through the
// gunner's field of fire*: the fighter sets up 1.3–1.8 km out in the direction the
// player's gun covers, runs in firing, passes close across the sight, loops back out
// to a new set-up point nearby and comes again. Damaged pilots limp away (still
// catchable). Jumped by escorts, they turn to fight or evade.
//
// Enemy AI 2.0 (PilotMind.ts) on top: every pilot has a persona (aggressive / cunning /
// cautious, and for aces a signature move) and a decision quality from the difficulty. After a
// pass he manages his energy (extend, zoom, dive, re-attack); he picks the attack geometry from
// the target's weaknesses (a wounded gunner, a straggler, a dead engine); he jinks, breaks or
// split-Ss when the player's rounds come close; wingmen of a Rotte / Schwarm follow their leader
// and start their runs staggered behind his; hit hard, he limps home or presses on.
export class EnemyPilot {
  state: 'approach' | 'attack' | 'duel' | 'break' | 'recover' | 'splitS' | 'dogfight' | 'evade' | 'withdraw' = 'approach';
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
  // gunner missions: a fixed gun position on the player's ship to attack (null = whichever
  // one the player is manning), so attacks come from every quarter and switching seats pays
  station: string | null = null;
  override: PilotOverride | null = null;
  // P-51 missions: share of new fighters that go straight for the player's Mustang (PilotOps sets it)
  dogfightChance = 0.4;
  // basic fighter manoeuvres while fighting the player's Mustang (DogfightAI.ts)
  bfm: DogfightAI | null = null;
  // ---- Enemy AI 2.0 ----
  persona: Persona;
  rng: Rng = Math.random;                // decisions (tests pass a seeded one)
  readonly env: Envelope;
  private qv = -1;
  pressure = 0;                          // the player's rounds passing close (PilotMind.updatePressure)
  private nearSeen = 0;
  private hitSeen = -99;
  private evadeCd = 0;
  private evadeArm = -1;
  private evaded = false;                // one evasion per firing pass
  evasion: Evasion | null = null;        // 'jink' while it lasts (break / split-S change the state)
  private evadeT = 0;
  recover: EnergyMove | null = null;
  private recoverMax = 3;
  private pressed = false;
  wing: WingLink | null = null;
  runT = 0;                              // s since this firing run began (wingmen stagger on it)
  private baseStation: string | null | undefined = undefined;
  private vBias = 0;
  private sidePref = 0;
  private low = false;
  private sigRun: Signature | null = null;   // signature move armed for this pass
  private sigPlan = false;                   // low six planned for the next run
  private sigShown = false;              // the crew has seen his signature move this mission
  private sigCalled = false;
  private sigDir = 1;
  private quick = false;                 // wingover: straight back in on the same gun
  lastPick = '';
  onSignature: ((p: EnemyPilot, s: Signature) => void) | null = null;
  private readonly engineZone: HitZone | null;
  private arcOf(w: WorldView) { return this.station ? w.stationArc(this.station) : w.playerArc(); }
  private gunOf(w: WorldView) { return this.station ? w.stationGunPos(this.station) : w.playerGunPos(); }

  constructor(public me: Fighter, preferred?: AttackType, skill = 1) {
    this.skill = skill * (0.8 + Math.random() * 0.4);
    if (preferred) this.attack = preferred;
    this.env = envelope(me.enemyType);
    this.persona = { personality: randomPersonality(me.enemyType, Math.random), signature: null, ace: false, q: -1 };
    this.engineZone = me.zones?.find((z) => z.engine !== undefined) ?? null;
  }

  /** Decision quality 0..1 (PilotMind.decisionQuality), from the difficulty, his skill and rank. */
  quality(w: WorldView) {
    if (this.qv < 0) this.qv = this.persona.q >= 0 ? this.persona.q : decisionQuality(w.difficulty, this.skill, this.persona.ace);
    return this.qv;
  }
  setPersona(p: Persona) { this.persona = p; this.qv = -1; }

  private gunner(w: WorldView) { return !!w.playerStationId(); }
  private call(w: WorldView, key: string, speaker: string, text: string, cd: number, priority = 1) {
    if (this.gunner(w)) w.callout?.(key, speaker, text, cd, priority);
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

  // Choose this pass's attack geometry from the target's weaknesses (PilotMind.chooseApproach)
  private plan(w: WorldView) {
    this.sidePref = 0; this.low = false; this.vBias = 0;
    if (this.baseStation === undefined) this.baseStation = this.station;
    const t = this.target as Bomber | null;
    if (!t || !t.alive || !('straggling' in t)) return;   // bombers only
    const own = t.isPlayer && this.gunner(w);
    const ts = targetState(t, w, own);
    const pick = chooseApproach(ts, { role: this.env.role, personality: this.persona.personality, q: this.quality(w) }, this.rng);
    let ap = pick.approach;
    this.lastPick = `${ap}:${pick.reason}`;
    const lowSix = this.persona.signature === 'lowSix' && this.rng() < 0.7;
    if (lowSix) ap = 'low';
    this.sigPlan = lowSix;
    if (own) {
      const st = STATION_OF[ap], cur = w.playerStationId();
      if (lowSix) { this.station = 'tail'; this.vBias = -0.3; return; }
      if (pick.reason === 'deadGun' && st !== cur && (ts.weak[st] ?? 0) >= 0.5) {
        // the silent gun's sector: the crew calls it so the player can change seats
        this.station = st; AI_STATS.weakGun++;
        this.call(w, 'ai_weak_' + st.toLowerCase(), 'Navigator', WEAK_CALL[st], 20);
        return;
      }
      this.station = this.baseStation ?? null;
      this.vBias = ap === 'high' ? 0.25 : ap === 'low' ? -0.2 : 0;
      return;
    }
    if (pick.reason === 'straggler') AI_STATS.straggler++;
    else if (pick.reason === 'engine') AI_STATS.engine++;
    else if (pick.reason === 'deadGun') AI_STATS.weakGun++;
    this.attack = ap === 'beamL' || ap === 'beamR' ? 'beam' : ap === 'low' ? 'stern' : ap;
    this.sidePref = ap === 'beamL' ? -1 : ap === 'beamR' ? 1 : 0;
    this.low = ap === 'low';
  }

  private computeSetup(w: WorldView, near = false) {
    const t = this.target!;
    const fwd = w.formationForward;
    const arc = t.isPlayer ? this.arcOf(w) : null;
    const p = this.setupPoint.copy(t.pos);
    this.fromArc = !!arc;
    if (arc) {
      // come in through the player's window / turret arc
      const d = _d.copy(arc).applyAxisAngle(_y, (Math.random() - 0.5) * 0.9);
      d.y += -0.12 + Math.random() * 0.4 + this.vBias;
      d.normalize();
      p.addScaledVector(d, (near ? 520 : 900) + Math.random() * (near ? 150 : 250));
      return;
    }
    const right = _r.set(0, 1, 0).cross(fwd).normalize().negate();
    const side = this.sidePref || (Math.random() < 0.5 ? 1 : -1);
    // A nearby player escort keeps the bomber pass compact. Gunner arcs and distant
    // interceptions retain their old setup; jets still get room for a slashing pass.
    const escorted = w.playerFighter?.alive && w.playerFighter.pos.distanceToSquared(t.pos) < 3500 * 3500;
    const slasher = this.me.enemyType === 'me262' || this.me.enemyType === 'me163';
    const scale = escorted ? (slasher ? 0.65 : 0.45) : 1;
    switch (this.attack) {
      case 'headon': p.addScaledVector(fwd, 2300).addScaledVector(right, side * (150 + Math.random() * 300)).y += 250 + Math.random() * 250; break;
      case 'stern': p.addScaledVector(fwd, -1500).addScaledVector(right, side * 200).y += this.low ? -(250 + Math.random() * 150) : 150 + Math.random() * 200; break;
      case 'beam': p.addScaledVector(right, side * 1600).addScaledVector(fwd, 500).y += 400; break;
      case 'high': p.addScaledVector(fwd, -300).addScaledVector(right, side * 600).y += 1500; break;
    }
    p.sub(t.pos).multiplyScalar(scale).add(t.pos);
  }

  // Send the pilot at a target now (tactics hand-back): a fresh set-up for the run
  engage(w: WorldView, t: Aircraft, attack?: AttackType, near = true) {
    this.target = t; if (attack) this.attack = attack;
    this.state = 'approach'; this.timer = 0; this.recover = null;
    this.sidePref = 0; this.low = false;
    this.computeSetup(w, near);
  }

  private beginAttack(w: WorldView) {
    this.state = 'attack'; this.timer = 0; this.calloutDone = false; this.runT = 0;
    this.evaded = false; this.evasion = null; this.quick = false;
    // every firing pass has its own aiming error; better pilots are tighter
    this.aimOffset.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((this.fromArc ? 9 + Math.random() * 16 : 4 + Math.random() * 10) / this.skill * w.enemyAimMult * weatherNow.aimError);
    this.passOffset.set(Math.random() - 0.5, 0.4 + Math.random() * 0.4, Math.random() - 0.5).normalize().multiplyScalar(30 + Math.random() * 25);
    // an ace flies his signature move on most passes: the low-six approach planned for this
    // run, a corkscrew run, or a clean slashing pass (no duel) ending in his split-S / zoom / wingover
    const sig = this.persona.signature;
    this.sigRun = null; this.sigCalled = false;
    if (this.sigPlan) { this.sigPlan = false; this.signature(w, 'lowSix'); }
    else if (sig && sig !== 'lowSix' && this.rng() < 0.7) { this.sigRun = sig; this.sigDir = this.rng() < 0.5 ? 1 : -1; }
  }

  private beginDuel(w: WorldView, gp: THREE.Vector3) {
    const arc = this.arcOf(w);
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
    this.duelPhase = Math.atan2(rel.dot(this.duelS) / 200, (rel.dot(this.duelA) - 300) / 140);
    const side = _t.copy(this.me.vel).sub(this.target!.vel).dot(this.duelS);
    this.duelRate = (side >= 0 ? 1 : -1) * (0.34 + Math.random() * 0.1);
    this.duelLen = 14 + Math.random() * 8 * this.skill;
    // weaving spoils their aim: the duel is a fight, not an execution
    this.aimOffset.multiplyScalar(2.2);
  }

  private endDuel(w: WorldView, t: Aircraft | null) {
    this.state = 'break'; this.timer = 0;
    this.me.gunAim = null;
    const away = t ? _r.copy(this.me.pos).sub(t.pos).normalize() : this.me.forward(_r);
    this.breakDir.copy(away).add(_t.set(0, (Math.random() - 0.4) * 0.6, 0)).normalize();
    this.passEnd(w);
  }

  // A firing pass is over (state is 'break'): an ace may fly his signature move out of it
  private passEnd(w: WorldView) {
    const sig = this.sigRun;
    this.sigRun = null;
    if (!sig || sig === 'corkscrew' || sig === 'lowSix') return;
    if (sig === 'splitS') { if (this.me.pos.y > 6900) { this.enterSplitS(); this.signature(w, sig); } return; }
    if (sig === 'zoom') { this.state = 'recover'; this.recover = 'zoom'; this.recoverMax = 6; this.timer = 0; this.signature(w, sig); return; }
    // wingover: a short, hard reversal and straight back in on the same gun
    this.quick = true;
    this.breakDir.copy(this.me.forward(_t)).negate().setY(0.25).normalize();
    this.signature(w, sig);
  }

  private signature(w: WorldView, s: Signature) {
    AI_STATS.signature++;
    const known = !!this.persona.known || this.sigShown;
    this.sigShown = true;
    const line = SIGNATURES[s][known ? 'know' : 'learn'];
    this.call(w, `ai_sig_${known ? 'k' : 'l'}_${s.toLowerCase()}`, line[0], line[1], 12, 2);
    this.onSignature?.(this, s);
  }

  private enterSplitS() {
    this.state = 'splitS'; this.timer = 0; this.me.gunAim = null;
    this.breakDir.copy(this.me.forward(_t)).setY(0);
    if (this.breakDir.lengthSq() < 1e-4) this.breakDir.set(0, 0, 1);
    this.breakDir.normalize().negate();   // he comes out of it going the other way, lower
  }

  // After a pass: the next target and geometry, then the energy decision (PilotMind.energyPlan)
  private afterPass(w: WorldView) {
    const me = this.me;
    if (!this.target || !this.target.alive || Math.random() < 0.3) this.target = this.pickTarget(w);
    this.state = 'approach'; this.timer = 0; this.recover = null;
    if (this.target) {
      const types: AttackType[] = ['headon', 'stern', 'beam', 'high'];
      this.attack = types[Math.floor(Math.random() * types.length)];
      this.plan(w);
      this.computeSetup(w, true);
    }
    if (this.quick) return;   // wingover: straight back in (beginAttack clears it)
    const t = this.target;
    const mv = energyPlan(this.env, { alt: me.pos.y, speed: me.fm.speed }, t ? { alt: t.pos.y, speed: t.vel.length() } : { alt: w.formationCenter.y, speed: 75 }, this.quality(w), this.persona.personality);
    AI_STATS[mv]++;
    if (mv === 'extend' || mv === 'zoom') { this.state = 'recover'; this.recover = mv; this.recoverMax = this.fromArc ? 3 : 6; }
  }

  private endRecover(w: WorldView) {
    this.state = 'approach'; this.timer = 0; this.recover = null;
    if (this.target?.alive) this.computeSetup(w, true);
  }

  // Rounds from the player's gun passing close: jink, break or split-S (after a reaction time)
  private senseFire(dt: number, w: WorldView) {
    const me = this.me;
    const near = me.fireNear - this.nearSeen;
    this.nearSeen = me.fireNear;
    const hit = me.lastPlayerHit > this.hitSeen;
    if (hit) this.hitSeen = me.lastPlayerHit;
    // each round is counted on ~4 frames as it passes (Ballistics): ~1 per round
    this.pressure = updatePressure(this.pressure, near * 0.25, hit, dt);
    this.evadeCd -= dt;
    if (this.evasion) {
      this.evadeT += dt;
      if (this.evadeT > 2.6 || (this.state !== 'attack' && this.state !== 'duel')) this.evasion = null;
      return;
    }
    const q = this.quality(w);
    if (this.override || this.evaded || this.evadeCd > 0 || (this.state !== 'attack' && this.state !== 'duel') || !this.target
      || this.pressure < evasionThreshold(this.persona.personality, q)) { this.evadeArm = -1; return; }
    if (this.evadeArm < 0) { this.evadeArm = reactionTime(q); return; }
    this.evadeArm -= dt;
    if (this.evadeArm > 0) return;
    this.evadeArm = -1;
    const gp = this.gunOf(w) ?? w.player?.pos ?? this.target.pos;
    const kind = pickEvasion({ personality: this.persona.personality, q, alt: me.pos.y, floor: 5600, speed: me.fm.speed, env: this.env, dist: me.pos.distanceTo(gp) }, this.rng);
    this.evaded = true; this.evadeCd = EVADE_COOLDOWN; this.evadeT = 0;
    AI_STATS[kind]++;
    if (kind === 'jink') { this.evasion = 'jink'; return; }
    me.gunAim = null; this.attackCount++;
    if (kind === 'break') {
      // hard turn out of the line of fire, nose low
      this.state = 'break'; this.timer = 0;
      const los = _r.copy(me.pos).sub(gp).normalize();
      this.breakDir.crossVectors(los, _y).normalize();
      if (this.breakDir.dot(me.forward(_t)) < 0) this.breakDir.negate();
      this.breakDir.addScaledVector(los, 0.6).add(_t.set(0, -0.25, 0)).normalize();
    } else this.enterSplitS();
    this.call(w, 'ai_broke', AI_CALLS.broke[0], AI_CALLS.broke[1], 25);
  }

  // Hit hard: limp home, or (aggressive) press on for one more pass first
  private checkWounds(w: WorldView) {
    if (this.state === 'withdraw') return;
    const h = this.me.structureFrac;
    const e = this.engineZone ? Math.max(0, this.engineZone.hp) / this.engineZone.maxHp : 1;
    if (h >= 0.45 && (e >= 0.2 || h >= 0.75)) return;
    const c = woundedChoice(h, h < 0.75 ? e : 1, this.persona.personality, this.pressed);
    if (c === 'fight') return;
    if (c === 'press') {
      this.pressed = true; AI_STATS.press++;
      if (this.target?.isPlayer) this.call(w, 'ai_press', AI_CALLS.press[0], AI_CALLS.press[1], 25);
      return;
    }
    this.state = 'withdraw'; this.timer = 0; this.wing = null; this.evasion = null;
    // home: away from the bombers and down, without a hard turn
    this.breakDir.copy(this.me.pos).sub(w.formationCenter).setY(0).normalize().multiplyScalar(0.7).addScaledVector(this.me.forward(_t).setY(0).normalize(), 0.3).setY(-0.15).normalize();
    AI_STATS.limp++;
    if (this.me.pos.distanceTo(w.formationCenter) < 2500) this.call(w, 'ai_limp', AI_CALLS.limp[0], AI_CALLS.limp[1], 30);
  }

  // Wingman: hold the slot on the leader and start the run `delay` s after his (true: flown)
  private flyWing(w: WorldView): boolean {
    const link = this.wing!, L = link.leader, me = this.me, fm = me.fm;
    if (!L.me.alive || L.me.remove || L.state === 'withdraw' || L.state === 'dogfight' || L.state === 'evade' || L.override || !L.target?.alive) { this.wing = null; return false; }
    if (L.state !== 'approach' && L.state !== 'attack' && L.state !== 'duel') return false;
    this.target = L.target; this.attack = L.attack; this.station = L.station; this.fromArc = L.fromArc;
    const s = wingSlot(link.i, _slot);
    const lf = L.me.forward(_t).setY(0);
    if (lf.lengthSq() < 1e-4) lf.copy(w.formationForward);
    lf.normalize();
    const rt = _c.crossVectors(lf, _y).normalize();
    const pos = _p.copy(L.me.pos).addScaledVector(rt, s.x).addScaledVector(_y, s.y).addScaledVector(lf, s.z);
    const want = _u.copy(pos).sub(me.pos).multiplyScalar(0.5).add(L.me.vel);
    if (want.length() > 260) want.setLength(260);
    steerTo(fm, want, 1.1, 0.9);
    fm.throttle = THREE.MathUtils.clamp(0.6 + (want.length() - fm.speed) * 0.03, 0.3, 1);
    if (me.dropTankAttached && me.pos.distanceTo(w.formationCenter) < 4000) w.dropTank(me);
    if (((L.state === 'attack' || L.state === 'duel') && L.runT >= link.delay) || this.timer > 25) {
      this.setupPoint.copy(L.setupPoint);
      this.beginAttack(w);
      if (link.i === 1) { AI_STATS.schwarm++; if (L.target?.isPlayer) this.call(w, 'ai_pair', AI_CALLS.pair[0], AI_CALLS.pair[1], 30, 2); }
    }
    return true;
  }

  update(dt: number, w: WorldView) {
    const me = this.me;
    const fm = me.fm;
    me.trigger = false;
    if (w.bombRunHold && this.state !== 'withdraw') {
      this.state = 'approach'; this.timer = 0; this.target = null; me.gunAim = null; this.recover = null; this.evasion = null;
      const side = me.pos.x >= w.formationCenter.x ? 1 : -1;
      _d.copy(w.formationCenter).addScaledVector(w.formationForward, -1400);
      _d.x += side * 2600; _d.y += 450;
      steerTo(fm, _d.sub(me.pos), 1.1, .9); fm.throttle = .7;
      return;
    }
    const keepAim = me.gunAim;
    me.gunAim = null;
    this.timer += dt;
    this.runT += dt;
    if (!me.alive) return;
    this.checkWounds(w);
    if (this.state === 'withdraw') this.override = null;

    // Jumped by an escort (allied fighter close behind)?
    if (this.state !== 'withdraw' && this.state !== 'evade' && this.state !== 'dogfight' && !this.override?.steady) {
      for (const a of w.fighters('allied')) {
        if (!a.alive) continue;
        const toMe = _d.copy(me.pos).sub(a.pos);
        const dist = toMe.length();
        const bearing = a.forward(_t).dot(toMe.divideScalar(Math.max(1, dist)));
        const player = a === w.playerFighter || a === w.remoteFighter;
        const onTail = dist < 1200 && bearing > 0.92 && me.forward(_t).dot(toMe) > 0.25;
        const underFire = (dist < 1400 && a.trigger && bearing > 0.97)
          || (dist < 1600 && w.time - me.lastPlayerHit < 2);
        // Time-based detection: shooting draws attention even across the nose. The
        // selected bandit fights back; merely flying near the box doesn't distract it.
        const jumped = player ? (onTail || underFire) && Math.random() < 1 - Math.exp(-dt * this.skill * (underFire ? 4 : 1.6))
          : dist < 600 && bearing > 0.92 && Math.random() < 0.02;
        if (jumped) {
          this.state = player || Math.random() < 0.5 * this.skill ? 'dogfight' : 'evade';
          this.target = a; this.timer = 0; this.wing = null; this.recover = null; this.evasion = null;
          this.breakDir.set(Math.random() - 0.5, -0.3, Math.random() - 0.5).normalize();
          break;
        }
      }
    }
    this.senseFire(dt, w);

    const flown = this.override && this.state !== 'dogfight' && this.state !== 'evade' ? this.override.fly(this, dt, w) : false;
    if (!flown) switch (this.state) {
      case 'approach': {
        if (this.wing && this.flyWing(w)) break;
        // escort missions: a share of the Fw 190s come for the player's Mustang
        if (!this.target && (w.playerFighter?.alive || w.remoteFighter?.alive) && Math.random() < this.dogfightChance) {
          this.target = w.remoteFighter?.alive && (!w.playerFighter?.alive || Math.random() < .5) ? w.remoteFighter : w.playerFighter; this.state = 'dogfight'; this.timer = 0; break;
        }
        if (!this.target || !this.target.alive || this.target.team !== 'allied' || !(this.target as any).zones) { this.target = this.pickTarget(w); if (!this.target) return; this.plan(w); this.computeSetup(w); }
        const d = me.pos.distanceTo(w.formationCenter);
        if (me.dropTankAttached && d < 4000) w.dropTank(me);
        // keep the set-up point moving with the formation
        this.setupPoint.addScaledVector(w.formationForward, 75 * dt);
        steerTo(fm, _d.copy(this.setupPoint).sub(me.pos), 1.1, 0.9);
        fm.throttle = envelopeThrottle(this.env, fm.speed, 1);
        let ready = me.pos.distanceTo(this.setupPoint) < 300 || this.timer > 12;
        // arc attacks: start the run as soon as the fighter is out in the gunner's arc
        if (this.fromArc && !ready && this.timer > (this.quick ? 0.4 : 1.5)) {
          const arc = this.arcOf(w), gp = this.gunOf(w);
          if (arc && gp) {
            const rel = _u.copy(me.pos).sub(gp);
            const dist = rel.length();
            if (dist > 480 && dist < 1600 && rel.normalize().angleTo(arc) < 0.7) ready = true;
          }
        }
        if (ready) this.beginAttack(w);
        break;
      }
      case 'attack': {
        const t = this.target;
        if (!t || !t.alive) { this.state = 'approach'; this.target = null; this.timer = 0; break; }
        leadPoint(me.pos, me.vel, t, 760, this.aim).add(this.aimOffset);
        const gp0 = this.fromArc ? this.gunOf(w) : null;
        if (gp0) this.aim.add(_u.copy(gp0).sub(t.pos));
        const aimDir = _d.copy(this.aim).sub(me.pos);
        const dist = aimDir.length();
        aimDir.divideScalar(Math.max(dist, 1));
        let err: number;
        const gunPos0 = this.fromArc ? this.gunOf(w) : null;
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
        fm.throttle = envelopeThrottle(this.env, fm.speed, this.fromArc ? 0.5 : this.attack === 'headon' ? 0.85 : 1);
        const range = (700 + 150 * this.skill) * weatherNow.spotting;
        const window = gunPos0 ? me.pos.distanceTo(gunPos0) : dist;
        if (dist < range && window > (gunPos0 ? 220 : 0) && err < 0.05 + (1 - this.skill) * 0.03) me.trigger = true;
        if (me.rockets > 0 && dist < 1250 && dist > 800 && err < 0.06) me.fireRockets = true;
        // an ace's corkscrew: rolling through the run, firing only when the wings come level
        if (this.sigRun === 'corkscrew' && dist < 1300) {
          if (this.runT % 2.2 < 1.2) { fm.roll = this.sigDir; me.trigger = false; }
          if (!this.sigCalled) { this.sigCalled = true; this.signature(w, 'corkscrew'); }
        }
        const closing = _t.copy(me.vel).sub(t.vel).dot(_r.copy(t.pos).sub(me.pos)) > 0;
        const realDist = gunPos0 ? me.pos.distanceTo(gunPos0) : dist;
        if (gunPos0 && realDist < 750 && !this.sigRun) { this.beginDuel(w, gunPos0); break; }
        if (realDist < (this.fromArc ? 150 : 160) || (!closing && dist < 400) || this.timer > 22) {
          this.state = 'break'; this.timer = 0; this.attackCount++;
          me.gunAim = null;
          // break across the line of sight so the fighter flashes past the gunner
          const los = _r.copy(t.pos).sub(me.pos).normalize();
          this.breakDir.crossVectors(los, _y).normalize().multiplyScalar(Math.random() < 0.5 ? 1 : -1);
          this.breakDir.addScaledVector(los, 0.5).add(_t.set(0, (Math.random() - 0.6) * 0.8, 0)).normalize();
          this.passEnd(w);
        }
        break;
      }
      case 'duel': {
        const t = this.target;
        const gp = this.gunOf(w), arc = this.arcOf(w);
        // the gunner changed position (or the target is gone): break off and set up again
        if (!t || !t.alive || !gp || !arc || (!this.station && w.playerStationId() !== this.duelStation) || this.timer > this.duelLen) { this.endDuel(w, t); break; }
        this.duelPhase += this.duelRate * dt;
        const ph = this.duelPhase;
        const A = 200, B = 140, R0 = 300, C = 60;
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
        fm.throttle = envelopeThrottle(this.env, fm.speed, 1);
        if (this.timer > (this.quick ? 0.7 : this.fromArc ? 1.3 : 2.0)) this.afterPass(w);
        break;
      }
      case 'recover': {
        // energy: extend (unload, nose a touch low, full power, away from the bomber) or zoom
        // (trade the speed of the pass for a perch above the box)
        const t = this.target;
        const h = _d.copy(me.forward(_t)).setY(0);
        if (h.lengthSq() < 1e-4) h.copy(w.formationForward);
        h.normalize();
        if (this.recover === 'zoom') {
          h.y = 1.3;
          steerTo(fm, h, 1.2, 1);
          fm.throttle = 1;
          if (fm.speed < this.env.vCorner * 0.9 || (t && me.pos.y > t.pos.y + 1100) || this.timer > this.recoverMax) this.endRecover(w);
        } else {
          // straight on, unloaded: no turning (a turn bleeds the energy he is trying to build)
          h.y = -0.25;   // unload, nose ~14 degrees low: gravity helps the engine
          steerTo(fm, h, 1, 0.6);
          fm.throttle = envelopeThrottle(this.env, fm.speed, 1);
          if ((fm.speed > this.env.vCorner * 1.05 && this.timer > 1) || this.timer > this.recoverMax) this.endRecover(w);
        }
        break;
      }
      case 'splitS': {
        // half roll and pull through: steering at a point below and behind rolls him inverted
        // and pulls the nose down through the vertical; he comes out the other way, lower
        if (this.timer < 1.3) _d.copy(this.breakDir).multiplyScalar(0.45).setY(-1);
        else _d.copy(this.breakDir).setY(-0.15);
        steerTo(fm, _d, 1.3, 1);
        fm.throttle = envelopeThrottle(this.env, fm.speed, this.timer < 1.3 ? 0.5 : 1);
        if (this.timer > 3) this.afterPass(w);
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
        // against the player's Mustang: real BFM (DogfightAI); done -> back to the bombers
        if (t && (t === w.playerFighter || t === w.remoteFighter) && t.alive) {
          this.bfm ??= new DogfightAI(me, this.skill);
          if (!this.bfm.update(dt, w, t as Fighter)) {
            this.bfm.end(); this.bfm = null;
            this.state = 'approach'; this.timer = 0;
            this.target = this.pickTarget(w);
            if (this.target) { this.plan(w); this.computeSetup(w); }
          }
          break;
        }
        if (!t || !t.alive || this.timer > 40) { this.state = 'approach'; this.target = null; this.timer = 0; break; }
        if (Math.floor(this.timer / 3) !== Math.floor((this.timer - dt) / 3)) this.aimOffset.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((6 + Math.random() * 12) / this.skill * w.enemyAimMult * weatherNow.aimError);
        leadPoint(me.pos, me.vel, t, 760, this.aim).add(this.aimOffset);
        const dir = _d.copy(this.aim).sub(me.pos);
        const dist = dir.length();
        const err = steerTo(fm, dir, 1.3, 1);
        fm.throttle = 1;
        if (dist < 550 * weatherNow.spotting && err < 0.04 * this.skill + 0.02) me.trigger = true;
        break;
      }
      case 'withdraw': {
        // limping home: trailing smoke, power down with the engine, a damaged airframe that
        // wallows; still a target for a determined gunner
        const e = this.engineZone ? Math.max(0, this.engineZone.hp) / this.engineZone.maxHp : 1;
        steerTo(fm, this.breakDir, 0.6, 0.4);
        fm.roll = THREE.MathUtils.clamp(fm.roll + Math.sin(this.timer * 2.1) * 0.25 * (1 - e), -1, 1);
        fm.throttle = Math.min(0.55, limpThrottle(e));
        break;
      }
    }

    // jinking: rolling the wings from side to side through the run; he can't hold his aim
    if (this.evasion === 'jink' && !flown && (this.state === 'attack' || this.state === 'duel')) {
      const s = Math.sin(this.evadeT * 7);
      fm.roll = THREE.MathUtils.clamp(fm.roll + s * 0.9, -1, 1);
      fm.yaw = THREE.MathUtils.clamp(fm.yaw - s * 0.4, -1, 1);
      if (Math.abs(s) > 0.35) me.trigger = false;
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
