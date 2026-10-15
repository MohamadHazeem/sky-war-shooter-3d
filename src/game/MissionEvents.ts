import * as THREE from 'three';
import type { MidRound } from './MidRound';
import { Bomber, Fighter } from '../world/Aircraft';
import { EscortPilot } from '../world/AI';
import { sound } from '../audio/Sound';
import { tx } from '../i18n';
import { DEFAULT_WEATHER, Weather } from '../render/Weather';
import { SP_MAX_LOSSES } from './SetPieces';
import { brassGeometry, brassMaterial } from './Brass';
import { ejectPilot } from '../world/FighterDeath';
import {
  CHUTE_LINES, CHUTE_SPEAKER, EV_AFTER, EV_GAP, EvAction, EvContext, EvNeed, EvTone, MissionEventDef,
  EVENT_IDS, bombLeadIn, eventDef, eventDue, pickEvent,
} from './MissionEventLib';

// Runs the dynamic in-mission events (Phase 11 goal 28; the library and the director's rules are in
// MissionEventLib.ts). Owned by MidRound, which calls update() every frame of a live mission and
// holds its own objectives, random events and set pieces back while one plays (`busy`), so nothing
// overlaps. One event at a time: its beats fire in order (a radio line through World.callout, an
// action below), a banner names it, and at `dur` it ends and puts back what it changed (slots, a
// frozen gun, the jamming, scripted aircraft). Actions that last start an "actor": a closure made
// once when the action fires and ticked every frame (per-frame code uses scratch vectors only).
//
// Dev: sws.missionEvent('salute'), sws.missionEvent() lists them; sws.missionEvent('?') shows state.

const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _one = new THREE.Vector3();
const R = () => Math.random() * 2 - 1;
const smooth = (x: number) => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const NEAR_SCALE = 2.2;        // scripted enemy fighters close by: near true size (normal enemies are drawn larger)
const NEIGHBOUR = 480;         // m: a B-17 this close to the player's ship reads clearly
const TRACER: [number, number, number] = [10, 7, 3];
const STAGE_T = 4;             // s a staged B-17 takes to slide into the gun's view before the event proper
const ENGINE_FIRE_DEATH = 3;   // FighterDeath KINDS index of 'engineFire' (no bail-out roll: the pilot is already out)
const CROSS_FROM = 250, CROSS_SPEED = 46;   // m, m/s: the burning Fw 190 crossing the gun's view
const CROSS_FALL = 4.8;        // s after the pilot jumps that the empty fighter rolls over and goes down
const SINK_T = 9.5;            // s a bailing B-17 sinks out of the box on her own (chutes in view) before she spins in
const CHUTE_DRAG = 0.12;       // the bail-out's canopies shed forward speed slowly: they drift near her, countable
const CHAFF_GLINT = [22, 22, 24], CHAFF_DIM = [7, 7, 7.8], CHAFF_END = [0.6, 0.6, 0.7];   // foil flashing in the sun (HDR)
const BRASS_N = 72;            // falling casings (instanced, the waist pile's own geometry and material)
const BRASS_SIZE = 2.4;        // drawn larger than a real .50 case so the glint reads at a few metres

interface Actor { left: number; tick(dt: number): void; stop?(): void }

export class MissionEvents {
  active: MissionEventDef | null = null;
  t = 0;
  log: string[] = [];
  jammed = false;
  private prev = 0;
  private subject: Bomber | null = null;
  private subjectPos = new THREE.Vector3();
  private side = 1;
  private actors: Actor[] = [];
  private played: string[] = [];
  private count = 0;
  private lastAt = -1e9;
  private endedAt = -1e9;
  private gap = EV_GAP[0];
  private check = 0;
  private lastTone: EvTone | undefined;
  private chutes = 0;
  private chuteWord = 0;
  private slots = new Map<Bomber, THREE.Vector3>();     // original slots of the B-17s an event moved
  private frozen: string | null = null;
  private fighters: Fighter[] = [];                    // scripted aircraft to clean up
  private spawned: Fighter[] = [];                     // pinned attackers (unpinned at the end)
  private salute: Fighter | null = null;
  private joiner: Fighter | null = null;
  private crosser: Fighter | null = null;
  private bailT = -1;            // event time the crossing Fw 190's pilot jumped (-1: not yet)
  private peelAt = -1;
  private announced = false;
  private jamAcc = 0;
  private brassMesh: THREE.InstancedMesh | null = null;
  private brassPos = new Float32Array(BRASS_N * 3);
  private brassVel = new Float32Array(BRASS_N * 3);
  private brassRot = new Float32Array(BRASS_N * 3);
  private brassLife = new Float32Array(BRASS_N);
  /** radio lines this event has spoken (the shot harness waits for each subtitle) */
  said = 0;
  readonly banner;

  constructor(private c: MidRound, banner: { show(k: string, t: string, s: string, tone: string): void; setSub(s: string): void; hide(): void }) {
    this.banner = banner;
  }

  get world() { return this.c.world; }
  /** MidRound's own objectives / events / set pieces wait while this is true */
  get busy() { return !!this.active || this.world.time - this.endedAt < EV_AFTER; }

  reset() {
    this.stop();
    this.played = []; this.count = 0; this.lastAt = -1e9; this.endedAt = -1e9; this.check = 0;
    this.gap = EV_GAP[0] + Math.random() * (EV_GAP[1] - EV_GAP[0]);
    this.lastTone = undefined;
    this.log = [];
  }

  // ---------------------------------------------------------------- per frame (MidRound.update)
  update(dt: number, boss: boolean, otherBusy: boolean) {
    const w = this.world;
    const e = this.active;
    if (e && this.bombIn() <= 0) { this.stop(); return; }   // the bomb run's lead-in has the stage now
    if (e) {
      this.prev = this.t; this.t += dt;
      if (!this.announced && this.t >= 0) this.announce(e);
      if (this.t >= 0) w.holdRadio(0.3);   // ambient crew chatter waits; urgent combat calls still get through
      for (const b of e.beats) if (this.prev < b.at && this.t >= b.at) this.beat(b.say, b.act, b.arg);
      for (let i = this.actors.length - 1; i >= 0; i--) {
        const a = this.actors[i];
        a.left -= dt;
        a.tick(dt);
        if (a.left <= 0) { a.stop?.(); this.actors.splice(i, 1); }
      }
      if (this.jammed) { this.jamAcc -= dt; if (this.jamAcc <= 0) { this.jamAcc = 1 + Math.random() * 1.4; sound.radioStatic(); } }
      if (this.subject?.alive) this.subjectPos.copy(this.subject.pos);
      if (this.t >= Math.min(7, e.dur - 0.5) && e.id !== 'bailout') this.banner.hide();
      if (this.t >= e.dur) this.finish();
      return;
    }
    this.check -= dt;
    if (this.check > 0) return;
    this.check = 1;
    const g = this.c.game, m = g.mission;
    if (!m || !w.player) return;
    const gate = {
      role: this.c.role, coop: !!g.coop.role, scripted: !!m.signature || m.midRound === false || !!m.tutorial,
      boss, busy: otherBusy, phase: m.round ? g.pacing.phase : 'none',
      missionT: w.time, roundT: this.c.roundT, roundLeft: this.c.roundLeft,
      sinceLast: w.time - this.lastAt, gap: this.gap, count: this.count,
    };
    if (!eventDue(gate)) return;
    const def = pickEvent(this.context(gate.phase), this.played, Math.random, this.lastTone);
    if (def) this.begin(def);
    else this.lastAt = w.time - this.gap + 10;   // nothing fits now: look again in 10 s
  }

  private context(phase: string): EvContext {
    const w = this.world, pl = w.player!;
    let near = 0;
    for (const f of w.activeEnemies()) if (f.pos.distanceTo(pl.pos) < 1200) near++;
    const others = this.c.aliveBombers().filter((b) => !b.scripted && !b.straggling);
    const have: Partial<Record<EvNeed, boolean>> = {
      neighbour: !!this.pickSubject(NEIGHBOUR) || !!this.c.setPieces.stage(),
      lossOk: w.stats.scriptedLost < SP_MAX_LOSSES && others.length >= 5 && (!!this.pickSubject(900) || !!this.c.setPieces.stage()),
      clearSky: this.clearSky(),
      box: others.length >= 4,
      aiGunner: !!this.freeStation(),
    };
    return { phase, near, roundLeft: this.c.roundLeft, bombIn: this.bombIn(), have };
  }

  /** s until the bomb run's lead-in (IP call, bombsight offer); events end well before it */
  private bombIn(): number {
    const g = this.c.game, m = g.mission;
    return bombLeadIn(this.world.time, m?.bombsAway, !!g.director?.bombsDropped, !!g.bombRun?.active || !!g.bombardier?.available);
  }

  // ---------------------------------------------------------------- start / end
  begin(def: MissionEventDef, forced = false): boolean {
    if (this.active) this.finish();
    const w = this.world;
    const needsSubject = def.needs.includes('neighbour') || def.needs.includes('lossOk')
      || def.beats.some((b) => b.act === 'tighten');
    // the subject: a B-17 in the gun's view, or the nearest one slid over into a free spot there first
    // (SetPieces.stage: the pilots closing up the box); the beats wait for it (t runs from -STAGE_T)
    let stageTo: THREE.Vector3 | null = null;
    this.subject = null;
    if (needsSubject) {
      const st = this.c.setPieces.stage();
      if (st) { this.subject = st.b; stageTo = st.slot; }
      else this.subject = this.pickSubject(def.needs.includes('lossOk') ? 900 : NEIGHBOUR);
      // closing up the box works without one in view (the ships behind close up all the same)
      if (!this.subject && !def.beats.some((b) => b.act === 'tighten')) return false;
    }
    if (this.subject) this.subjectPos.copy(this.subject.pos);
    const arc = w.playerArc(), pl = w.player;
    this.side = arc && pl ? (this.sideVec(_s).dot(arc) >= 0 ? 1 : -1) : 1;
    this.active = def;
    this.t = stageTo ? -STAGE_T : 0; this.prev = this.t - 1;
    this.announced = false;
    this.chutes = 0; this.chuteWord = Math.floor(Math.random() * CHUTE_LINES.length);
    this.peelAt = -1;
    this.said = 0;
    this.played.push(def.id);
    this.count++;
    this.lastAt = w.time;
    this.lastTone = def.tone;
    this.gap = EV_GAP[0] + Math.random() * (EV_GAP[1] - EV_GAP[0]);
    this.log.push(`${w.time.toFixed(0)}s event ${def.id}${forced ? ' (dev)' : ''} start`);
    if (stageTo && this.subject) this.stageActor(this.subject, stageTo);
    else {
      // the zero-time beats fire on this frame
      this.announce(def);
      for (const b of def.beats) if (b.at <= 0) this.beat(b.say, b.act, b.arg);
      this.prev = 0;
    }
    return true;
  }

  private announce(def: MissionEventDef) {
    this.announced = true;
    this.banner.show(tx('IN FLIGHT'), tx(def.title), def.id === 'bailout' ? tx('Chutes: {n}', { n: 0 }) : tx(def.sub), def.tone);
  }

  private stageActor(b: Bomber, to: THREE.Vector3) {
    const from = b.slot.clone();
    let t = 0;
    this.actors.push({ left: STAGE_T, tick: (dt) => { t += dt; if (b.alive) b.slot.lerpVectors(from, to, smooth(t / STAGE_T)); } });
  }

  private finish() {
    const e = this.active;
    if (!e) return;
    this.log.push(`${this.world.time.toFixed(0)}s event ${e.id} end`);
    this.cleanup();
    this.active = null;
    this.endedAt = this.world.time;
  }

  /** Mission over / quit / restart: everything put back, no lines */
  stop() {
    if (!this.active) { this.banner.hide(); return; }
    this.log.push(`${this.world.time.toFixed(0)}s event ${this.active.id} stopped`);
    this.cleanup();
    this.active = null;
  }

  private cleanup() {
    for (const a of this.actors) a.stop?.();
    this.actors.length = 0;
    // B-17s moved by the event slide straight back (they are a few metres off at most by now)
    for (const [b, s] of this.slots) b.slot.copy(s);
    this.slots.clear();
    if (this.frozen) { this.world.frozenStations.delete(this.frozen); this.frozen = null; }
    this.jammed = false;
    for (const f of this.fighters) if (f.alive && !f.remove) f.remove = true;
    this.fighters.length = 0;
    this.c.unpin(this.spawned);
    this.spawned.length = 0;
    this.salute = this.joiner = this.crosser = null;
    this.subject = null;
    this.banner.hide();
    this.markStation(null);
  }

  // ---------------------------------------------------------------- beats
  private beat(say: [string, string] | undefined, act: EvAction | undefined, arg?: number) {
    if (act) this.act(act, arg ?? 0);
    if (say) {
      this.world.callout('ev28_' + say[1].length + '_' + say[0], say[0], say[1], 0, 3);
      this.said++;
    }
  }

  private act(a: EvAction, arg: number) {
    const w = this.world, b = this.subject, pl = w.player;
    if (!pl) return;
    switch (a) {
      case 'slide': if (b) this.slide(b, true); break;
      case 'slideBack': if (b) this.slide(b, false); break;
      case 'burn': if (b) this.trailActor(b, arg || 3, () => b.localToWorld(_a.set(this.side * 3.2, -0.6, 0.8)), 1, true, 1.5); break;
      case 'smoke': if (b) this.trailActor(b, arg || 6, () => b.localToWorld(_a.set(-this.side * 7.6, 0.2, 1.6)), 0.7, false, 1.2); break;
      case 'explode': if (b?.alive) this.explode(b); break;
      case 'fall': if (b?.alive) this.fall(b); break;
      case 'chute': this.chute(); break;
      case 'countChutes': this.world.callout('ev28_count', CHUTE_SPEAKER, CHUTE_LINES[THREE.MathUtils.clamp(this.chutes - 4, 0, CHUTE_LINES.length - 1)], 0, 3); this.said++; break;
      case 'cookoff': if (b) this.cookoff(b, arg || 6); break;
      case 'boxes': if (b?.alive) {
        b.localToWorld(_a.set(this.side * 1.4, 0.3, -7));
        w.effects.spawnDebris(_a, b.vel, 5, false, _b.copy(this.sideVec(_c)).multiplyScalar(this.side * 12), 0.35);
      } break;
      case 'flare': if (b?.alive) this.flare(b); break;
      case 'tracers': if (b?.alive) this.tracers(b); break;
      case 'brass': if (b) this.brass(b, arg || 5); break;
      case 'jam': this.jammed = true; this.jamAcc = 0; break;
      case 'unjam': this.jammed = false; break;
      case 'cabinFire': this.cabinFire(); break;
      case 'freeze': { const s = this.freeStation(); if (s) { this.frozen = s; w.frozenStations.add(s); this.markStation(s); } break; }
      case 'unfreeze': if (this.frozen) { w.frozenStations.delete(this.frozen); this.frozen = null; this.markStation(null); } break;
      case 'salute': this.saluteActor(); break;
      case 'peel': this.peelAt = this.t; break;
      case 'join': this.joinActor(); break;
      case 'release': this.release(); break;
      case 'limper': this.limperActor(); break;
      case 'crosser': this.crosserActor(); break;
      case 'bail': this.bail(); break;
      case 'flak': this.flak(arg); break;
      case 'evade': w.evade(b ? Math.sign(pl.pos.x - b.pos.x) || 1 : -this.side); break;
      case 'shake': w.events.shake?.(arg || 0.4); w.buffet(arg || 0.4); break;
      case 'yellowNoses': this.spawned.push(...this.c.spawnAttackers(pl, 3, { from: 'front', type: 'fw190', attack: 'headon' })); break;
      case 'sunBandits': this.spawned.push(...this.c.spawnAttackers(pl, 2, { from: 'any', type: 'bf109', attack: 'high' })); break;
      case 'chaff': this.chaff(arg || 6); break;
      case 'weather': this.weather(); break;
      case 'tighten': this.tighten(true); break;
      case 'loosen': this.tighten(false); break;
      case 'drama': if (b) this.drama(); break;
    }
  }

  // ---------------------------------------------------------------- helpers
  /** Horizontal unit vector to the formation's side (the salute / join side is this times `side`) */
  private sideVec(out: THREE.Vector3) { return out.copy(UP).cross(this.world.formationForward).setY(0).normalize(); }

  private pickSubject(maxDist: number): Bomber | null {
    const pl = this.world.player;
    if (!pl) return null;
    const marked = this.c.markedAircraft();
    return this.c.bomberInView((b) => !b.scripted && !b.falling && !marked.includes(b) && b.pos.distanceTo(pl.pos) < maxDist);
  }

  private freeStation(): string | null {
    const w = this.world;
    if (!w.playerBomber) return null;
    const own = w.playerStation?.id;
    for (const s of ['waistL', 'waistR']) {
      if (s === own || w.remoteStations.has(s) || w.crew.wounded.has(s as never)) continue;
      return s;
    }
    return null;
  }

  /** The quiet gun on the station bar (HUD detail Full): struck through until he's back on it */
  private markStation(s: string | null) {
    if (typeof document === 'undefined') return;
    document.querySelectorAll<HTMLElement>('#hStations span').forEach((el) => el.classList.toggle('ev-frozen', el.dataset.s === s));
  }

  private clearSky(): boolean {
    const g = this.c.game, m = g.mission;
    if (!m || m.weather?.front) return false;
    const now = this.currentWeather();
    if (now.front || (now.mood && now.mood !== 'clear') || (now.preset && now.preset !== 'clear')) return false;
    return g.weatherNow.k === 0 && g.weatherNow.lightning < 0.5;
  }

  private currentWeather(): Weather {
    const key: string = (this.c.game as any).weatherKey ?? '';
    try { return key ? JSON.parse(key) as Weather : (this.c.game.mission?.weather ?? DEFAULT_WEATHER); }
    catch { return DEFAULT_WEATHER; }
  }

  private trailActor(b: Bomber, secs: number, at: () => THREE.Vector3, level: number, fire: boolean, scale: number) {
    let acc = 0;
    const last = new THREE.Vector3();
    let first = true;
    this.actors.push({ left: secs, tick: (dt) => {
      if (b.remove) return;
      acc += dt;
      if (acc < 0.05) return;
      const p = at();
      this.world.effects.trail(p, b.vel, level, fire, scale, acc, first ? undefined : last);
      last.copy(p); first = false; acc = 0;
    } });
  }

  private slide(b: Bomber, toward: boolean) {
    const pb = this.world.playerBomber;
    if (!pb || !b.alive) return;
    if (!this.slots.has(b)) this.slots.set(b, b.slot.clone());
    const home = this.slots.get(b)!;
    const from = b.slot.clone();
    const to = home.clone();
    if (toward) {
      // in at the gun's side: 48 m out and stepped up or down (a B-17 spans 32 m: close, never touching)
      const arc = this.world.playerArc(), F = this.world.formationForward;
      const d = _a.copy(home).sub(pb.slot);
      if (arc && Math.hypot(arc.x, arc.z) > 0.2) {
        const fwd = THREE.MathUtils.clamp(d.dot(F), -12, 12), up = (d.y < 0 ? -1 : 1) * THREE.MathUtils.clamp(Math.abs(d.y), 7, 10);
        to.copy(pb.slot).addScaledVector(_b.set(arc.x, 0, arc.z).normalize(), 48).addScaledVector(F, fwd).addScaledVector(UP, up);
      } else {
        const len = d.length();
        to.copy(pb.slot).addScaledVector(d.divideScalar(Math.max(1, len)), Math.max(48, len * 0.5));
      }
    }
    const dur = toward ? 2.3 : 4;
    let t = 0;
    this.actors.push({ left: dur, tick: (dt) => {
      t += dt;
      if (b.alive) b.slot.lerpVectors(from, to, smooth(t / dur));
      if (toward && t > 1.6 && t - dt <= 1.6) sound.play('whoosh', b.pos, { gain: 1.4, ref: 60, delay: false });
    } });
  }

  private explode(b: Bomber) {
    const w = this.world;
    const center = _a.copy(b.pos);
    w.scriptedLoss(b, true);
    w.destruction.explode(b);
    w.effects.warshipBlast(center, b.vel, 1);
    w.effects.explosion(center, b.vel, 1.1, 'heavy');
    w.effects.spawnDebris(center, b.vel, 14, true);
    sound.play('explosion', center, { gain: 2, ref: 260, reverb: 0.9 });
    this.c.game.feel.blastFlash(0.25 * Math.max(0, 1 - center.distanceTo(w.player!.pos) / 900));
  }

  // She is hit and falls out of the box, but slowly at first: wings nearly level, two engines
  // burning, sinking and dropping back a few metres a second, so she stays in the gun's view while
  // her crew get out. Then a wing drops and she spins in.
  private fall(b: Bomber) {
    const w = this.world;
    w.scriptedLoss(b, true);
    b.gliding = true;                 // Bomber.update: sinks at 6 m/s
    b.vel.multiplyScalar(0.965);      // and drops back slowly
    const roll = Math.random() < 0.5 ? -1 : 1;
    b.spin.set(0, 0, roll * 0.035);
    let n = 0;
    for (const z of b.zones) if (z.engine !== undefined && n < 2) { z.burning = true; n++; }
    w.effects.explosion(b.localToWorld(_a.set(-7, 0, 1.5)), b.vel, 0.5, 'small');
    sound.play('explosion', b.pos, { gain: 1.2, ref: 200, reverb: 0.7 });
    this.trailActor(b, SINK_T + 4, () => b.localToWorld(_a.set(roll * 5.2, -0.2, 1.8)), 1, true, 1.6);
    let t = 0;
    this.actors.push({ left: SINK_T, tick: (dt) => {
      t += dt;
      b.spin.z = roll * (0.035 + 0.01 * Math.sin(t * 0.8));   // fighting the controls
    }, stop: () => {
      if (b.remove) return;
      b.gliding = false;
      b.vel.multiplyScalar(0.9);
      b.spin.set(R() * 0.04, R() * 0.04, roll * (0.14 + Math.random() * 0.1));
    } });
  }

  private chute() {
    const b = this.subject;
    if (!b || b.remove || this.chutes >= 4 + this.chuteWord) return;   // four to six of the ten get out
    const w = this.world;
    // out of the waist door and the bomb bay; the canopies drift near her (CHUTE_DRAG) to be counted
    const p = b.localToWorld(_a.set(R() * 0.6, -1.4, -4 + R() * 3));
    if (w.effects.parachute(p, _b.copy(b.vel).multiplyScalar(0.97), 1.8, CHUTE_DRAG)) {
      this.chutes++;
      this.banner.setSub(tx('Chutes: {n}', { n: this.chutes }));
    }
  }

  private cookoff(b: Bomber, secs: number) {
    let next = 0;
    this.actors.push({ left: secs, tick: (dt) => {
      if (!b.alive) return;
      next -= dt;
      if (next > 0) return;
      next = 0.06 + Math.random() * 0.22;
      const p = b.localToWorld(_a.set(this.side * (0.9 + Math.random() * 0.6), 0.2 + R() * 0.5, -7 + R() * 1.5));
      this.world.effects.sparks(p, b.vel, Math.random() < 0.5);
      if (Math.random() < 0.3) this.world.effects.explosion(p, b.vel, 0.16 + Math.random() * 0.1, 'small');
      if (Math.random() < 0.5) sound.play('crack', p, { gain: 0.5, ref: 80 });
    } });
    this.trailActor(b, secs, () => b.localToWorld(_a.set(this.side * 1.2, 0.4, -7)), 0.5, false, 0.8);
  }

  private flare(b: Bomber) {
    const w = this.world;
    const pos = b.localToWorld(new THREE.Vector3(0, 1.6, 3));
    const vel = new THREE.Vector3().copy(b.vel).addScaledVector(UP, 32).addScaledVector(this.sideVec(_a), -this.side * 10);
    w.effects.flashLight(pos, 600, 0.4, 0xff3020, 120);
    sound.play('click', pos, { gain: 0.8, rate: 0.6, ref: 40 });
    let acc = 0;
    const last = new THREE.Vector3().copy(pos);
    this.actors.push({ left: 3.2, tick: (dt) => {
      if (dt <= 0) return;
      vel.y -= 9.8 * dt * 0.6;
      pos.addScaledVector(vel, dt);
      // the burning head (one short-lived glow a frame, so only the head shows) and a smoke ribbon
      w.effects.glow.spawn({ pos, vel, life: dt * 1.5, size0: 7, size1: 6, color0: [24, 1, 0.4], alpha0: 1, alpha1: 0.8, frame: 1 });
      acc += dt;
      if (acc < 0.05) return;
      w.effects.trail(pos, vel, 0.15, false, 0.55, acc, last);
      last.copy(pos); acc = 0;
    } });
  }

  private tracers(b: Bomber) {
    const w = this.world, pl = w.player!;
    let t = 0, cd = 0;
    this.actors.push({ left: 2.4, tick: (dt) => {
      t += dt; cd -= dt;
      if (!b.alive || (t > 0.9 && t < 1.4)) return;
      while (cd <= 0) {
        cd += 1 / 13;
        const muzzle = b.localToWorld(_a.set(0, 2.3, 1.15));
        const aim = _b.copy(pl.pos).addScaledVector(UP, 24 + R() * 4).addScaledVector(w.formationForward, R() * 8).sub(muzzle).normalize();
        w.ballistics.fire(muzzle.addScaledVector(aim, 2), aim.multiplyScalar(860).add(b.vel), 'allied', 0, true, TRACER, b);
        if (Math.random() < 0.3) w.effects.muzzleFlash(muzzle, aim.normalize(), 0.8, b.vel);
      }
      if (Math.random() < dt * 6) sound.play('m2far', b.pos, { gain: 0.5, ref: 60 });
    } });
  }

  // Spent .50 cal casings from the ship above come down right past the player's gun window: small
  // brass cases (the waist pile's instanced mesh and material, so nothing new compiles), tumbling
  // and glinting. Simulated relative to the gun, so they fall past it whatever the ship does (and a
  // floating-origin rebase can't touch them); the subject trails a little gun smoke as her gunners fire.
  private brass(b: Bomber, secs: number) {
    const w = this.world;
    const mesh = this.brassMesh ??= (() => {
      const m = new THREE.InstancedMesh(brassGeometry(), brassMaterial(), BRASS_N);
      m.name = 'eventBrass'; m.frustumCulled = false; m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return m;
    })();
    if (!mesh.parent) w.scene.add(mesh);
    const P = this.brassPos, V = this.brassVel, A = this.brassRot, L = this.brassLife;
    L.fill(0);
    let acc = 0, t = 0;
    _one.setScalar(BRASS_SIZE);
    this.actors.push({ left: secs + 1.5, tick: (dt) => {
      t += dt;
      const arc = w.playerArc(), gun = w.playerGunPos();
      if (!arc || !gun || dt <= 0) return;
      // new casings for `secs`, a dozen or so a second, out in front of the window and above it
      acc += t < secs ? dt * 14 : 0;
      for (let i = 0; i < BRASS_N && acc >= 1; i++) {
        if (L[i] > 0) continue;
        acc -= 1;
        const o = _a.copy(arc).multiplyScalar(2.2 + Math.random() * 6).addScaledVector(UP, 4.5 + Math.random() * 3).addScaledVector(w.formationForward, R() * 3.5);
        P[i * 3] = o.x; P[i * 3 + 1] = o.y; P[i * 3 + 2] = o.z;
        const v = _b.copy(w.formationForward).multiplyScalar(-2 - Math.random() * 3).addScaledVector(UP, -9 - Math.random() * 4).addScaledVector(arc, R() * 0.8);
        V[i * 3] = v.x; V[i * 3 + 1] = v.y; V[i * 3 + 2] = v.z;
        A[i * 3] = Math.random() * 6; A[i * 3 + 1] = Math.random() * 6; A[i * 3 + 2] = Math.random() * 6;
        L[i] = 1.6;
      }
      if (acc > 1) acc = 1;
      let n = 0;
      for (let i = 0; i < BRASS_N; i++) {
        if (L[i] <= 0) continue;
        L[i] -= dt;
        if (L[i] <= 0) continue;
        V[i * 3 + 1] -= 9.81 * dt * 0.4;
        P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
        A[i * 3] += dt * 11; A[i * 3 + 1] += dt * 7; A[i * 3 + 2] += dt * 9;   // tumbling: the glint flickers
        _c.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).add(gun);
        _q.setFromEuler(_e.set(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]));
        mesh.setMatrixAt(n++, _m.compose(_c, _q, _one));
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (t < secs && b.alive && Math.random() < dt * 4) w.effects.gunSmoke(b.localToWorld(_c.set(0, 2.3, 1.15)), b.vel);
    }, stop: () => { mesh.count = 0; } });
  }

  private cabinFire() {
    const w = this.world, pb = w.playerBomber;
    if (!pb) return;
    const p = pb.localToWorld(_a.set(R() * 0.3, 0.5, -3.2));
    w.effects.flashLight(p, 260, 0.6, 0xff8a3a, 14);
    w.effects.sparks(p, pb.vel, true);
    sound.play('crack', p, { gain: 0.7, ref: 8 });
    this.c.game.feel.blastFlash(0.3);
    // what the gunner sees of it: the fire flashing out of the window beside his gun, sparks
    // spraying past it and thick smoke pouring out and streaming aft. Everything flies with the
    // ship (no drag) and is spawned relative to the gun window, so it stays in the gun's view.
    const arc0 = w.playerArc(), gun0 = w.playerGunPos();
    if (arc0 && gun0) {
      const q = _b.copy(gun0).addScaledVector(arc0, 1.1).addScaledVector(w.formationForward, 0.9);
      w.effects.flashLight(q, 240, 0.5, 0xff7a2a, 8);
      for (let i = 0; i < 3; i++) w.effects.sparks(q, _c.copy(pb.vel).addScaledVector(arc0, 6), true);
    }
    let acc = 0, age = 0;
    const v = new THREE.Vector3();
    this.actors.push({ left: 3, tick: (dt) => {
      acc += dt; age += dt;
      if (acc < 0.03) return;
      acc = 0;
      const arc = w.playerArc(), gun = w.playerGunPos();
      if (!arc || !gun) return;
      const fwd = w.formationForward;
      const q = _a.copy(gun).addScaledVector(arc, 1.0 + Math.random() * 0.6).addScaledVector(fwd, 0.7 + Math.random() * 0.8).addScaledVector(UP, R() * 0.3);
      v.copy(pb.vel).addScaledVector(arc, 2 + Math.random() * 2).addScaledVector(fwd, -4 - Math.random() * 4).addScaledVector(UP, 0.5);
      // flame licks out of the window for the first second and a half
      if (age < 1.5) {
        for (let i = 0; i < 3; i++) {
          _c.set(R(), R(), R()).multiplyScalar(0.15).add(q);
          w.effects.glow.spawn({ pos: _c, vel: v, life: 0.18 + Math.random() * 0.2, size0: 0.14 + Math.random() * 0.14, size1: 0.05, color0: [16, 7, 1.6], color1: [4, 0.9, 0.12], alpha0: 1, alpha1: 0, frame: 1 });
        }
        if (Math.random() < 0.5) w.effects.sparks(q, v);
      }
      // its light flickering on the gun and the wing
      if (age < 2.2) w.effects.flashLight(q, 60 + Math.random() * 90, 0.06, 0xff7a2a, 7);
      // dense, dark smoke rolling out past the gun
      for (let i = 0; i < 2; i++) {
        const dark = Math.random() * 0.05;
        _c.set(R(), R(), R()).multiplyScalar(0.25).add(q);
        w.effects.smoke.spawn({ pos: _c, vel: v, life: 0.8 + Math.random() * 0.6, size0: 0.3, size1: 1.0 + Math.random() * 0.5, color0: [0.04 + dark, 0.037 + dark, 0.034 + dark], alpha0: 1, alpha1: 0, lit: true });
      }
    } });
  }

  // ---- scripted aircraft (flown on a path relative to the player's ship, like SetPieces' Mustangs)
  private fly(f: Fighter, along: number, lat: number, up: number, roll: number, dt: number, last: THREE.Vector3) {
    const w = this.world, pl = w.player!;
    this.sideVec(_s);
    f.root.position.copy(pl.pos).addScaledVector(w.formationForward, along).addScaledVector(_s, lat * this.side).addScaledVector(UP, up);
    if (dt > 0 && last.lengthSq() > 0) {
      f.vel.copy(f.root.position).sub(last).divideScalar(dt);
      f.fm.vel.copy(f.vel);
      f.fm.throttle = 1;
      _q.setFromUnitVectors(Z, _c.copy(f.vel).normalize());
      f.root.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(Z, roll));
    }
    last.copy(f.root.position);
  }

  private scripted(f: Fighter, scale?: number) {
    this.world.clearPilot(f);
    f.trigger = false;
    if (scale) f.model.scale.setScalar(scale);
    this.fighters.push(f);
    return f;
  }

  private smokeFrom(f: Fighter, level: number, fire: boolean, acc: { t: number; last: THREE.Vector3 }, dt: number, scale = 0.8) {
    acc.t += dt;
    if (acc.t < 0.05) return;
    const p = f.localToWorld(_a.set(0, 0, 1.2));
    this.world.effects.trail(p, f.vel, level, fire, scale, acc.t, acc.last.lengthSq() ? acc.last : undefined);
    acc.last.copy(p); acc.t = 0;
  }

  private saluteActor() {
    const w = this.world, pl = w.player!;
    const f = this.scripted(w.spawnEnemy(pl.pos.clone().addScaledVector(w.formationForward, -240), 'stern', 1, false, false, 'bf109'), NEAR_SCALE);
    (f as { team: string }).team = 'allied';   // no longer a fighting aircraft: the guns (AI and the player's) leave him be
    f.noMarker = true;                         // ...but no friendly chevron either: he's still a Bf 109
    f.guns.length = 0;
    this.salute = f;
    const last = new THREE.Vector3(), sm = { t: 0, last: new THREE.Vector3() };
    let t = 0;
    this.actors.push({ left: 30, tick: (dt) => {
      if (!f.alive || f.remove) return;
      t += dt;
      const k = smooth(t / 6.5);
      let along = THREE.MathUtils.lerp(-240, -6, k) + Math.sin(t * 0.7) * 1.5;
      let lat = THREE.MathUtils.lerp(80, 40, k), up = THREE.MathUtils.lerp(28, 5, k) + Math.sin(t * 0.9) * 0.8;
      // the wing waggle (his salute), then he peels off and away below
      let roll = t > 9 && t < 11.5 ? 0.38 * Math.sin((t - 9) * 7.5) : 0.04 * Math.sin(t * 1.3);
      if (this.peelAt >= 0) {
        const u = this.t - this.peelAt;
        lat += 7 * u * u; up -= 4 * u * u; along += 4 * u;
        roll += -this.side * THREE.MathUtils.clamp(u * 0.8, 0, 0.9);
      }
      this.fly(f, along, lat, up, roll, dt, last);
      this.smokeFrom(f, 0.85, false, sm, dt);
    } });
  }

  private joinActor() {
    const w = this.world, pl = w.player!;
    const f = this.scripted(w.spawnEscort(pl.pos.clone().addScaledVector(w.formationForward, -260).addScaledVector(UP, 30), new THREE.Vector3()));
    this.joiner = f;
    const last = new THREE.Vector3();
    let t = 0;
    this.actors.push({ left: 30, tick: (dt) => {
      if (!f.alive || f.remove || this.joiner !== f) return;
      t += dt;
      const k = smooth(t / 7);
      const along = THREE.MathUtils.lerp(-260, 4, k) + Math.sin(t * 0.6) * 2;
      const lat = THREE.MathUtils.lerp(95, 52, k), up = THREE.MathUtils.lerp(30, 9, k) + Math.sin(t * 0.8);
      const roll = t > 8 && t < 10 ? 0.3 * Math.sin((t - 8) * 6.3) : -this.side * 0.12 * (1 - k);
      this.fly(f, along, lat, up, roll, dt, last);
    } });
  }

  // the Mustang takes up escort duty: the normal escort AI flies and fights it from here on
  private release() {
    const f = this.joiner;
    if (!f || !f.alive || f.remove) return;
    const i = this.fighters.indexOf(f);
    if (i >= 0) this.fighters.splice(i, 1);
    (this.world as unknown as { pilots: Map<Fighter, unknown> }).pilots.set(f, new EscortPilot(f, new THREE.Vector3(this.side * 220, 320, 120)));
    this.joiner = null;
  }

  private limperActor() {
    const w = this.world, pl = w.player!;
    const f = this.scripted(w.spawnEscort(pl.pos.clone().addScaledVector(w.formationForward, 115), new THREE.Vector3()));
    for (const g of f.guns) g.damage = 0;
    const last = new THREE.Vector3(), sm = { t: 0, last: new THREE.Vector3() };
    let t = 0;
    this.actors.push({ left: 30, tick: (dt) => {
      if (!f.alive || f.remove) return;
      t += dt;
      let along = 115 - 22 * t, lat = 78 + Math.sin(t * 0.5) * 3, up = 30 - 1.2 * t;
      let roll = t > 2 && t < 4.5 ? 0.42 * Math.sin((t - 2) * 6.5) : 0.05 * Math.sin(t * 2);
      if (t > 8) { const u = t - 8; lat += 6 * u * u; up -= 3 * u * u; roll += -this.side * Math.min(0.8, u * 0.6); }
      this.fly(f, along, lat, up, roll, dt, last);
      this.smokeFrom(f, 0, false, sm, dt);   // white coolant
    } });
  }

  private crosserActor() {
    const w = this.world;
    const arc = w.playerArc(), gun = w.playerGunPos();
    if (!arc || !gun) return;
    const dir = new THREE.Vector3().copy(arc).setY(THREE.MathUtils.clamp(arc.y, -0.25, 0.2)).normalize();
    const across = new THREE.Vector3().copy(UP).cross(dir).normalize();
    const start = _a.copy(gun).addScaledVector(dir, 230).addScaledVector(across, -CROSS_FROM);
    const f = this.scripted(w.spawnEnemy(start.clone(), 'beam', 1, false, false, 'fw190'), 3.2);
    f.guns.length = 0;
    (f as { team: string }).team = 'allied';   // no threat any more: the crew's guns leave him be (axis again for his fall)
    f.noMarker = true;
    this.crosser = f;
    this.bailT = -1;
    const last = new THREE.Vector3(), sm = { t: 0, last: new THREE.Vector3() };
    let t = 0;
    this.actors.push({ left: 30, tick: (dt) => {
      if (!f.alive || f.remove || this.crosser !== f) return;
      t += dt;
      // slow across the gun's view, sinking, the engine on fire; the empty fighter carries on a
      // while after the pilot is out (his chute opens beside it), then rolls over and goes down
      if (this.bailT >= 0 && this.t - this.bailT > CROSS_FALL) { this.crosserDown(f); return; }
      const g = w.playerGunPos() ?? w.formationCenter;
      f.root.position.copy(g).addScaledVector(dir, 230 - 5 * t).addScaledVector(across, -CROSS_FROM + CROSS_SPEED * t).addScaledVector(UP, 22 - 3.5 * t);
      if (dt > 0 && last.lengthSq() > 0) {
        f.vel.copy(f.root.position).sub(last).divideScalar(dt);
        f.fm.vel.copy(f.vel);
        _q.setFromUnitVectors(Z, _c.copy(f.vel).normalize());
        f.root.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(Z, 0.35 * Math.sin(t * 1.8)));
      }
      last.copy(f.root.position);
      this.smokeFrom(f, 0.75, true, sm, dt, 2.2);
      // and the fire itself: a tongue of flame streaming back off the cowling (FighterDeath's engine fire)
      if (sm.t === 0) {
        const sc = f.model.scale.x, k = sc / 2.4;
        const p = f.localToWorld(_a.set(0, 0.3 * sc, 0.75 * sc));
        _b.copy(f.vel).multiplyScalar(0.25);
        for (let i = 0; i < 4; i++) {
          _c.copy(p).addScaledVector(f.vel, -Math.random() * 0.04);
          _c.x += R() * 0.5 * k; _c.y += R() * 0.4 * k; _c.z += R() * 0.5 * k;
          w.effects.glow.spawn({ pos: _c, vel: _b, life: 0.55 + Math.random() * 0.4, size0: 4.6 * k, size1: 1.4 * k, color0: i ? [12, 4.6, 1] : [18, 8, 1.8], color1: [2.4, 0.5, 0.06], alpha0: 1, alpha1: 0, frame: 2, rotVel: 3 });
        }
      }
    } });
  }

  // the pilot is out: canopy off, he jumps and his chute opens beside the burning fighter
  private bail() {
    const w = this.world, f = this.crosser;
    if (!f || !f.alive) return;
    this.bailT = this.t;
    ejectPilot(f, w, 0.05, _c.copy(w.player?.vel ?? f.vel).multiplyScalar(0.98));
  }

  // FighterDeath's engine-fire ending: flames and a black column as the empty fighter rolls over and
  // dives away. Nobody shot him (the crew held fire): no kill in the feed, no credit
  private crosserDown(f: Fighter) {
    const w = this.world;
    this.crosser = null;
    const i = this.fighters.indexOf(f);
    if (i >= 0) this.fighters.splice(i, 1);   // the world owns the falling wreck from here
    (f as { team: string }).team = 'axis';
    w.destruction.forceDeath(f, ENGINE_FIRE_DEATH);
    const kill = w.events.kill;
    w.events.kill = undefined;
    try { w.killAircraft(f, false, 'engine'); } finally { w.events.kill = kill; }
  }

  private flak(step: number) {
    const w = this.world, pl = w.player!;
    const arc = w.playerArc();
    const dir = _b.copy(arc ?? w.formationForward).setY(0);
    if (dir.lengthSq() < 1e-4) dir.copy(w.formationForward);
    dir.normalize();
    const d = [430, 300, 185, 80][THREE.MathUtils.clamp(step, 0, 3)];
    const p = _a.copy(pl.pos).addScaledVector(dir, d).addScaledVector(w.formationForward, R() * 30).addScaledVector(UP, R() * 25 - 10);
    w.effects.flak(p);
    sound.flakBurst(p);
    if (step >= 3) { w.effects.spawnDebris(p, pl.vel, 4, false, _c.copy(pl.pos).sub(p).multiplyScalar(0.3), 0.4); this.c.game.feel.blastFlash(0.2); }
  }

  private chaff(secs: number) {
    const w = this.world;
    let acc = 0;
    const drift = new THREE.Vector3();
    this.actors.push({ left: secs, tick: (dt) => {
      acc += dt;
      if (acc < 0.03) return;
      acc = 0;
      const arc = w.playerArc(), gun = w.playerGunPos();
      if (!arc || !gun) return;
      // foil strips fluttering down: they fall behind the formation and flash as they turn to the sun.
      // Each glint is a short stretched streak (Sparks: tumbling strips, all at odd angles); a few
      // faint specks are the strips edge-on between flashes
      drift.copy(w.player?.vel ?? w.formationForward).multiplyScalar(0.82).addScaledVector(UP, -6);
      for (let i = 0; i < 9; i++) {
        const p = _a.copy(gun).addScaledVector(arc, 70 + Math.random() * 170).add(_b.set(R() * 60, R() * 30 + 22, R() * 60));
        const bright = Math.random() < 0.4;
        _c.set(R(), R(), R()).normalize().multiplyScalar(18 + Math.random() * 22).add(drift);
        w.effects.sparkFx.spawn(p, _c, 0.12 + Math.random() * 0.22, bright ? 0.16 : 0.1, bright ? CHAFF_GLINT : CHAFF_DIM, CHAFF_END, 0.4, 2);
      }
      for (let i = 0; i < 3; i++) {
        const p = _a.copy(gun).addScaledVector(arc, 70 + Math.random() * 170).add(_b.set(R() * 60, R() * 30 + 22, R() * 60));
        w.effects.glow.spawn({ pos: p, vel: drift, life: 1.2 + Math.random() * 1.2, size0: 0.35, size1: 0.2, color0: [2.6, 2.6, 2.9], color1: [1, 1, 1.1], alpha0: 1, alpha1: 0, frame: 1, drag: 0.3, rise: -2 });
      }
    } });
  }

  private weather() {
    const g = this.c.game, w = this.world;
    const now = this.currentWeather();
    // the wall shows on the horizon at once (Weather.ts: in sight from 95 s before the front), about
    // 20 km out and closing; the front itself arrives 40 s later
    const next: Weather = { ...now, front: { at: 40, to: 'storm', preset: 'thunderstorm', duration: 45 } };
    // this event calls the wall itself: skip World's own "storm front" line for a while
    (w as unknown as { lastCallout: Map<string, number> }).lastCallout.set('wx_front', w.time);
    g.setWeather(next);
  }

  private tighten(on: boolean) {
    const pb = this.world.playerBomber;
    if (!pb) return;
    if (on) {
      const list = this.c.aliveBombers().filter((b) => !b.scripted && !b.straggling && !b.falling)
        .sort((x, y) => x.slot.distanceToSquared(pb.slot) - y.slot.distanceToSquared(pb.slot)).slice(0, 5);
      if (this.subject && !list.includes(this.subject)) list.push(this.subject);   // the ship in the gun's view
      for (const b of list) if (!this.slots.has(b)) this.slots.set(b, b.slot.clone());
    }
    for (const [b, home] of this.slots) {
      const from = b.slot.clone(), to = home.clone();
      if (on) {
        const d = _a.copy(home).sub(pb.slot), len = d.length();
        to.copy(pb.slot).addScaledVector(d.divideScalar(Math.max(1, len)), Math.max(55, len * 0.6));
      }
      let t = 0;
      this.actors.push({ left: 5, tick: (dt) => { t += dt; if (b.alive) b.slot.lerpVectors(from, to, smooth(t / 5)); } });
    }
  }

  private drama() {
    const b = this.subject, e = this.active;
    if (!b || !e) return;
    const last = this.subjectPos;
    this.c.dramaCam((out) => { if (!b.remove) last.copy(b.pos); out.copy(last); return true; }, 3.2, tx(e.title), tx(e.sub));
  }

  // ---------------------------------------------------------------- dev
  dev(id?: string): string {
    if (!id) return EVENT_IDS.join(', ');
    if (id === '?') return JSON.stringify({ active: this.active?.id ?? null, t: +this.t.toFixed(1), count: this.count, played: this.played, log: this.log.slice(-8) });
    const def = eventDef(id);
    if (!def) return `unknown event ${id}; try ${EVENT_IDS.join(', ')}`;
    if (this.c.game.state !== 'playing') return 'not playing';
    if (this.c.role !== 'gunner') return 'events are staged for the gunner';
    return this.begin(def, true) ? `event ${id} started` : `event ${id} not available now (needs ${def.needs.join(', ')})`;
  }
}

