import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { UI } from '../ui/UI';
import type { Game } from './Game';
import type { Mission } from './Missions';
import { Bomber } from '../world/Aircraft';
import { Airbase, DEPART, LINEUP_S, HOLD_S, SURFACE_Y, MAIN_CONTACT, THREE_POINT, TOWER, makeGear, afToLocal, type Gear, type Vehicle } from '../world/Airbase';
import { CamSnapshot, ModelReveal, cineLens } from './CineShared';
import { Atmos } from '../render/Atmosphere';
import { applyWeather, DEFAULT_WEATHER, type Weather } from '../render/Weather';
import { targetUniforms } from '../render/TargetGround';
import { cloudTargetUniforms } from '../render/Clouds';
import type { ParticleOpts } from '../render/Particles';
import { sound, type FighterSound } from '../audio/Sound';
import { voice } from '../audio/Voice';
import { INTERPHONE_LEAD_S } from '../audio/Interphone';
import { FieldSounds, type CrewVehicle } from '../audio/Field';
import { dressPlayerBomber, withName } from './Customize';
import { tx } from '../i18n';

// Mission bookends (Phase 5 goal 23): short, skippable cinematics around a B-17 gunner campaign
// mission, at the 401st Bomb Group's base at Deenethorpe (Airbase.ts).
//
// Take-off (~24 s, before the mission): dawn on the field. A Fortress rolls past a low camera on
// the runway edge and lifts off; from the watch office balcony the Sky Queen (the player's name
// and nose art from Customize) turns onto the runway as the ship ahead of her rolls; a tracking
// shot beside her take-off roll, lift-off and gear up; she climbs out through the top of the
// cloud deck; and slides into her slot in the formation above it, fading into the normal mission
// start. Radio: the tower's clearance, the pilot's "Tail wheel locked… full power".
//
// Landing (~21 s, after a successful mission, before the debrief): the formation lets down
// through the cloud, runs in over the field and peels off; the Sky Queen lands. Badly damaged
// (PlayerBomberDamage state: engines out, a wingtip shot off, the tail in pieces, wounded crew):
// red flares from the cockpit, a rough landing with a bounce and a swerve, or (worse) a belly
// landing in a shower of sparks and dust, and the fire tender, crash truck and ambulances racing
// out. The real player bomber is flown here (its holes, dead props and smoke), then put back.
// A failed mission keeps the bail-out sequence (BailOutCinematic.ts).
//
// Space / Esc / Enter / click / tap skips. Settings "Takeoff & landing scenes" (settings.bookends,
// undefined = on). Only for missions started from the briefing (so dev tools, the autoplay
// regressions and a pause-menu restart go straight in); sws.autoplay sets `auto`.
//
// Game hooks (one line each): prepare() when the briefing opens (builds the base behind it and
// compiles its shaders asynchronously), takeoff() at the top of startMission, frame() early in
// Game.frame (while it returns true the bookend owns the frame: no world update, no controllers),
// landing() at the top of showDebrief. The base is built once per session and detached from the
// scene whenever no bookend is playing.

export const BOOKEND_RADIO = {
  clear: ['Tower', 'Deenethorpe tower to Sky Queen: you are cleared for take-off. Good hunting.'],
  tailwheel: ['Pilot', 'Tail wheel locked… full power.'],
  flying: ['Co-Pilot', 'Ninety… one-ten… she\'s flying! Gear up.'],
  climb: ['Pilot', 'Pilot to crew: climbing through the overcast. We form up on top.'],
  letdown: ['Pilot', 'Pilot to crew: letting down through the overcast. We\'re nearly home.'],
  land: ['Tower', 'Sky Queen, you are number one to land. Welcome home.'],
  flares: ['Pilot', 'Wounded aboard — firing red flares!'],
  crashCrew: ['Tower', 'Crash crew, stand by! Ambulances to the runway!'],
  belly: ['Pilot', 'The gear won\'t come down — brace for a belly landing!'],
  out: ['Co-Pilot', 'We\'re down! Everybody out — move!'],
  home: ['Co-Pilot', 'Home in one piece. Nice work, everybody.'],
} as const satisfies Record<string, readonly [string, string]>;
type RadioKey = keyof typeof BOOKEND_RADIO;

export const BOOKEND_TEXT = {
  tag: 'DEENETHORPE · STATION 128',
  takeoff: '401ST BOMB GROUP · TAKE-OFF',
  landing: '401ST BOMB GROUP · RETURN TO BASE',
  skip: 'CLICK TO SKIP',
} as const;

export const TAKEOFF_LEN = 24.5;
export const LANDING_LEN = 21;
const SKIP_AFTER = 0.6;          // s before a key can skip (the click that started it must not)
const SKIP_FADE = 0.3;
const DAWN: Weather = { sunEl: 6, sunAz: 100, low: 0.7, high: 0.3, contrails: true, mood: 'clear' };
const DUSK: Weather = { sunEl: 4, sunAz: 255, low: 0.55, high: 0.4, contrails: true, mood: 'dusk' };

// take-off
const GAP = 48;                  // m between ships in the taxi queue
const LEAD = 14;                 // s before its release a ship is cleared onto the runway
const CLEAR = 34;                // m a ship keeps behind the one ahead
const VLO = 46;                  // m/s lift-off
// landing
const V_APP = 48;                // m/s on final
const T_TD = 3.6;                // s into the touchdown shot
const A_TD = -640;               // touchdown point (airfield a)
const CRUISE = 72;

type Phase = 'off' | 'parked' | 'taxi' | 'roll' | 'air';
interface Actor {
  b: Bomber; gear: Gear;
  phase: Phase; rank: number; release: number; acc: number;
  s: number; v: number; alt: number; vy: number; pitch: number; yaw: number; airT: number;
  rpm: number; dustT: number; gearK: number;
  wpos: THREE.Vector3; wvel: THREE.Vector3;
}
interface Flare { p: THREE.Vector3; v: THREE.Vector3; life: number; lightT: number }

const UP = new THREE.Vector3(0, 1, 0);
const DIR = afToLocal(1, 0, new THREE.Vector3());     // along runway 05 (local = world directions)
const LEFT = afToLocal(0, 1, new THREE.Vector3());
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _c = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();
const _qt = new THREE.Quaternion();
const _2 = new THREE.Vector2();
const _2d = new THREE.Vector2();
const _vp = new THREE.Vector3();
const _vv = new THREE.Vector3();
const R = () => Math.random() * 2 - 1;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
// root height above the surface with the main wheels on it, at a pitch (nose up +)
const wheelsY = (pitch: number) => SURFACE_Y - MAIN_CONTACT.y * Math.cos(pitch) - MAIN_CONTACT.z * Math.sin(pitch);
const BELLY_Y = 1.72;
// Rough height of the low deck's cumulus tops (Clouds.ts: a cell's top follows its coverage)
const cloudTops = () => Atmos.lowBase + (Atmos.lowTop - Atmos.lowBase) * Math.min(1, Atmos.lowCoverage * 1.05);

const C_DUST: [number, number, number] = [0.6, 0.54, 0.43];
const C_DUST1: [number, number, number] = [0.66, 0.6, 0.5];
const C_TYRE: [number, number, number] = [0.7, 0.7, 0.68];
const C_FLARE: [number, number, number] = [12, 1.1, 0.5];
const C_FLARE1: [number, number, number] = [4, 0.2, 0.1];
const C_FSMOKE: [number, number, number] = [0.8, 0.55, 0.55];

const CSS = `
#bkCine { position: fixed; inset: 0; pointer-events: none; z-index: 12; }
#bkCine .bar { position: absolute; left: 0; right: 0; height: 10.5vh; background: #000; }
#bkCine .bar.t { top: 0; } #bkCine .bar.b { bottom: 0; }
#bkCine .tag, #bkCine .cap, #bkCine .hint { position: absolute; white-space: nowrap; opacity: 0; transition: opacity .6s; }
#bkCine .tag { left: 4vw; top: 3.6vh; font: 600 11px/1 "IBM Plex Mono", "IBM Plex Sans Arabic", monospace; letter-spacing: 3px; color: #d9573f; }
#bkCine .cap { left: 4vw; bottom: 3.4vh; font: 600 17px/1 Oswald, "Arial Narrow", "Noto Kufi Arabic", sans-serif; letter-spacing: 4px; color: #f1e6c8; }
#bkCine .hint { right: 4vw; bottom: 3.6vh; font: 11px/1 "IBM Plex Mono", "IBM Plex Sans Arabic", monospace; letter-spacing: 2px; color: rgba(255,255,255,.55); opacity: 1; }
#bkCine .show { opacity: 1; }
#bkCine .sub { position: absolute; left: 50%; bottom: 12.5vh; transform: translateX(-50%); text-align: center; max-width: 64vw; }
#bkCine .sub .line { display: inline-block; background: rgba(0,0,0,0.55); color: #fff; font-family: 'Oswald', sans-serif; font-size: clamp(14px, 1.25vw, 19px); padding: 3px 12px; letter-spacing: 0.3px; }
#bkCine .sub .who { color: #c8b98a; margin-right: 8px; font-size: 0.75em; letter-spacing: 2px; text-transform: uppercase; }
#bkCine .fd { position: absolute; inset: 0; background: #000; opacity: 1; }
html[dir=rtl] #bkCine .tag, html[dir=rtl] #bkCine .cap, html[dir=rtl] #bkCine .hint { letter-spacing: 0; }
html[dir=rtl] #bkCine .sub .who { margin-right: 0; margin-left: 8px; }
`;

export class Bookends {
  /** Dev autoplay: never play (cleared when a briefing opens). */
  auto = false;
  /** Dev / tests: -1 = from the damage, 0 normal landing, 1 rough, 2 belly. */
  forceSeverity = -1;
  /** Last sequence log (dev). */
  log: string[] = [];
  private base: Airbase | null = null;
  private cast: Actor[] = [];
  private landGear: Gear | null = null;
  private seq: 'none' | 'takeoff' | 'landing' = 'none';
  private t = 0;
  private st = 0;
  private shot = -1;
  private sev: 0 | 1 | 2 = 0;
  private armed: Mission | null = null;
  private landFor: Mission | null = null;
  private resumeFor: Mission | null = null;
  private landedFor: Mission | null = null;
  private mission: Mission | null = null;
  private onDone: (() => void) | null = null;
  private skipReq = false;
  private skipAt = -1;
  private snap = new CamSnapshot();
  private reveal = new ModelReveal();
  private hidden: { el: HTMLElement; v: string }[] = [];
  private worldVis: { o: THREE.Object3D; v: boolean }[] = [];
  private weatherSaved: Weather | null = null;
  private said = new Set<string>();
  private voices: FighterSound[] = [];
  // airfield sounds: tyres, belly scrape, Very pistol, crash-crew bells (audio/Field.ts; silent without sound)
  private field = new FieldSounds();
  private flares: Flare[] = [];
  private look = new THREE.Vector3();
  private lookInit = false;
  private compiled = false;
  private building = false;
  // landing: the player's ship and its state before we borrowed it
  private pb: Bomber | null = null;
  private pbPos = new THREE.Vector3();
  private pbQuat = new THREE.Quaternion();
  private pbVel = new THREE.Vector3();
  private pbSpin = new THREE.Vector3();
  private sq = { a: 0, b: 0, y: 0, v: 0, vy: 0, yaw: 0, pitch: 0, roll: 0, down: false, bounced: false, stopped: false, sparkT: 0, dustT: 0, gearK: 1, rpm: 0.75 };
  private stopA = 0;
  private stopB = 0;
  private tgtSaved: { w: number; gap: THREE.Vector4; glow: THREE.Vector4 } | null = null;
  // DOM
  private root: HTMLElement | null = null;
  private els: Record<'tag' | 'cap' | 'hint' | 'sub' | 'fd', HTMLElement> | null = null;
  private fade = -1;
  private subT = 0;
  private readonly O: ParticleOpts = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 1, size0: 1, size1: 1, color0: C_DUST };

  constructor(private engine: Engine, private ui: UI, private game: Game) {}

  get active() { return this.seq !== 'none'; }
  get phase() { return this.seq; }
  get time() { return this.t; }

  /** Bookends apply to B-17 gunner campaign missions (not the gunnery school, not co-op). */
  applies(m: Mission): boolean {
    return this.game.settings.bookends !== false && m.role === 'gunner' && !!m.number && !m.tutorial && Number.isFinite(m.duration) && !this.game.coop.role;
  }

  // ---------------- hooks ----------------

  /** Briefing opened for m: arm the take-off, build the base behind the sheet and prewarm it. */
  prepare(m: Mission) {
    this.auto = false;
    this.armed = this.applies(m) ? m : null;
    if (this.armed) this.field.prepare();   // synthesise the airfield sounds behind the briefing
    if (!this.armed || this.compiled || this.building) return;
    this.building = true;
    setTimeout(() => {
      this.building = false;
      if (this.seq === 'none' && this.game.state === 'briefing') this.ensure(true);
    }, 300);
  }

  /** Top of Game.startMission: true while the take-off plays (it calls resume() when done). */
  takeoff(m: Mission, resume: () => void): boolean {
    if (this.resumeFor === m) { this.resumeFor = null; this.landFor = m; return false; }
    if (this.seq !== 'none') this.abort();
    const ok = this.armed === m && !this.auto && this.applies(m);
    this.armed = null;
    if (!ok) { if (this.auto || this.landFor !== m) this.landFor = null; return false; }
    this.mission = m;
    this.onDone = resume;
    try { this.startTakeoff(); } catch (err) { console.warn('bookends: take-off failed', err); this.cleanup(); return false; }
    return true;
  }

  /** Top of Game.showDebrief on a success: true while the landing plays (done() when over). */
  landing(m: Mission, done: () => void): boolean {
    if (this.seq === 'landing') return true;
    if (this.landedFor === m) { this.landedFor = null; return false; }
    if (this.seq !== 'none' || this.landFor !== m || this.auto || !this.applies(m)) return false;
    const pb = this.game.world.playerBomber;
    if (!pb || !pb.alive || pb.remove) return false;
    this.mission = m;
    this.onDone = done;
    try { this.startLanding(pb); } catch (err) { console.warn('bookends: landing failed', err); this.cleanup(); return false; }
    return true;
  }

  /** Early in Game.frame: true while a bookend owns the frame. */
  frame(dt: number): boolean {
    if (this.seq === 'none') return false;
    const g = this.game;
    if ((this.seq === 'takeoff' && g.state !== 'briefing') || (this.seq === 'landing' && g.state !== 'ending')) { this.abort(); return false; }
    const e = this.engine;
    const real = Math.min(0.05, e.timeScale > 0 ? dt / e.timeScale : dt);
    if (real <= 0) return true;
    this.t += real;
    if (this.skipReq && this.skipAt < 0 && this.t > SKIP_AFTER) { this.skipAt = this.t; voice.stop(); sound.stopSpeech(); }
    this.skipReq = false;
    const len = this.seq === 'takeoff' ? TAKEOFF_LEN : LANDING_LEN;
    if (this.t >= len || (this.skipAt >= 0 && this.t - this.skipAt >= SKIP_FADE)) { this.finish(); return true; }
    if (this.seq === 'takeoff') this.updateTakeoff(real); else this.updateLanding(real);
    if (this.skipAt >= 0) this.setFade(Math.max(this.fade, (this.t - this.skipAt) / SKIP_FADE));
    g.world.effects.update(real);
    this.updateFlares(real);
    this.base?.update(this.t);
    for (const a of this.cast) if (a.b.root.visible && a.phase !== 'off') a.b.updateProps(real, a.rpm);
    sound.setListener(e.camera);
    sound.updateFighterVoices(this.voices);
    sound.updateWind(real);
    g.world.listener = e.camera.position;
    if (this.subT > 0 && (this.subT -= real) <= 0 && this.els) this.els.sub.innerHTML = '';
    return true;
  }

  // ---------------- build ----------------

  private ensure(compile: boolean) {
    if (!this.base) {
      const t0 = performance.now();
      this.base = new Airbase(this.engine.quality);
      // ten Fortresses: the Sky Queen, four in the take-off queue, five on their hardstands
      for (let i = 0; i < 10; i++) {
        const b = new Bomber();
        b.name = i === 0 ? 'Sky Queen' : `B-17 ${i}`;
        const gear = makeGear();
        b.model.add(gear.group);
        b.root.visible = false;
        this.base.group.add(b.root);
        this.cast.push({ b, gear, phase: 'off', rank: 0, release: 0, acc: 3.2, s: 0, v: 0, alt: 0, vy: 0, pitch: 0, yaw: 0, airT: 0, rpm: 0, dustT: 0, gearK: 0, wpos: new THREE.Vector3(), wvel: new THREE.Vector3() });
      }
      this.landGear = makeGear();
      this.note(`built in ${Math.round(performance.now() - t0)} ms (ground ${this.base.stats.ms} ms, ${this.base.stats.trees} trees, ${this.base.stats.houses} houses)`);
    }
    if (compile && !this.compiled) this.compile();
  }

  // Compile every program the base needs without stalling (KHR_parallel_shader_compile)
  private compile() {
    const base = this.base!, e = this.engine;
    this.compiled = true;
    const hiddenNow: THREE.Object3D[] = [];
    base.group.traverse((o) => { if (!o.visible) { hiddenNow.push(o); o.visible = true; } });
    base.group.add(this.landGear!.group);
    // (a sequence that started meanwhile owns the visibility of its ships; beacons stay off)
    const done = () => {
      for (const o of hiddenNow) if (this.seq === 'none' || o.userData.bkBeacon) o.visible = false;
      if (!this.pb) this.landGear!.group.removeFromParent();
    };
    try {
      e.renderer.compileAsync(base.group, e.camera, e.scene).then(() => this.note('shaders compiled')).catch(() => {}).finally(done);
    } catch { done(); }
  }

  // ---------------- take-off ----------------

  private startTakeoff() {
    this.ensure(!this.compiled);
    this.field.prepare();
    const e = this.engine, w = this.game.world, base = this.base!;
    this.begin('takeoff');
    this.ui.hideAll();
    this.hideWorld(null);
    w.effects.clear();
    w.contrails.clear();
    this.weatherSaved = this.currentWeather();
    const mood = this.mission?.weather?.mood;
    applyWeather(e, mood === 'night' || mood === 'dusk' ? DUSK : DAWN);
    base.group.position.set(0, 0, 0);
    base.show(e.scene, true);
    base.resetVehicles();
    dressPlayerBomber(this.cast[0].b);
    // the queue (story time -12): A lined up, B holding short, the Sky Queen, C and D behind
    const q = [this.cast[1], this.cast[2], this.cast[0], this.cast[3], this.cast[4]];
    const rel = [-10, 2, 11.5, 60, 80];
    const s0 = [LINEUP_S, LINEUP_S - 30, HOLD_S - 10, HOLD_S - 10 - GAP, HOLD_S - 10 - 2 * GAP];
    q.forEach((a, i) => {
      Object.assign(a, { phase: 'taxi' as Phase, rank: i, release: rel[i], acc: a === this.cast[0] ? 4.2 : 3.2, v: 0, alt: 0, vy: 0, airT: 0, gearK: 0, dustT: Math.random() * 0.1, rpm: 0.34 });
      a.s = s0[i];
      a.pitch = THREE_POINT;
      DEPART.at(a.s, _2, _2d);
      a.yaw = Math.atan2(_2d.x, _2d.y);
      a.b.root.visible = true;
      a.gear.set(0);
    });
    this.parkRest(5);
    this.st = -12;
    this.simTakeoff(0);
    for (const a of this.cast) this.poseActor(a);
    this.overlay(true, BOOKEND_TEXT.takeoff);
    this.setFade(1);
  }

  private parkRest(from: number) {
    const base = this.base!;
    // the hardstands nearest the tower and the departure route
    const ref = afToLocal(-560, 300, new THREE.Vector3());
    const stands = base.stands.slice().sort((x, y) => Math.hypot(x.x - ref.x, x.z - ref.z) - Math.hypot(y.x - ref.x, y.z - ref.z));
    for (let i = from; i < this.cast.length; i++) {
      const a = this.cast[i], s = stands[(i - from) % stands.length];
      a.phase = 'parked'; a.rpm = 0; a.v = 0; a.alt = 0; a.pitch = THREE_POINT; a.gear.set(0);
      a.b.root.visible = true;
      this.place(a.b, s.x, wheelsY(THREE_POINT) - 0.03, s.z, s.yaw, THREE_POINT, 0);
    }
  }

  private queue(): Actor[] { return [this.cast[1], this.cast[2], this.cast[0], this.cast[3], this.cast[4]]; }

  // Advance the take-off queue to story time `to` (substeps, so a cut can jump ahead)
  private simTakeoff(to: number) {
    const q = this.queue();
    while (this.st < to - 1e-6) {
      const dt = Math.min(1 / 30, to - this.st);
      this.st += dt;
      for (let i = 0; i < q.length; i++) this.stepActor(q[i], i ? q[i - 1] : null, dt);
    }
  }

  private stepActor(a: Actor, prev: Actor | null, dt: number) {
    if (a.phase === 'taxi') {
      let target = this.st >= a.release - LEAD ? LINEUP_S : HOLD_S;
      if (prev && prev.phase !== 'off' && prev.phase !== 'parked') target = Math.min(target, prev.s - (prev.phase === 'taxi' && a.s < HOLD_S ? GAP : CLEAR));
      const vmax = a.s > HOLD_S - 25 ? 5.5 : 6.5;
      const vdes = Math.min(vmax, Math.sqrt(2 * 1.2 * Math.max(0, target - a.s)));
      a.v += THREE.MathUtils.clamp(vdes - a.v, -2 * dt, 1.4 * dt);
      a.s = Math.min(a.s + a.v * dt, Math.max(a.s, target));
      if (a.s >= target - 0.01 && vdes < 0.05) a.v = 0;
      a.rpm = a.v > 0.3 ? 0.4 : 0.32;
      // lined up: brakes on, the engines run up in the last seconds before she is released
      if (a.s >= LINEUP_S - 2 && a.v < 0.3) a.rpm = 0.32 + 0.5 * smooth(a.release - 3.5, a.release - 0.3, this.st);
      a.pitch = THREE_POINT;
      if (this.st >= a.release && a.s >= LINEUP_S - 2) { a.phase = 'roll'; this.note(`${a.b.name} rolls at ${this.st.toFixed(1)}`); }
    } else if (a.phase === 'roll') {
      a.v += a.acc * dt;
      a.s += a.v * dt;
      a.rpm = 1;
      a.pitch = THREE_POINT * (1 - smooth(14, 30, a.v)) + 0.07 * smooth(VLO - 9, VLO, a.v);
      if (a.v >= VLO) { a.phase = 'air'; a.airT = 0; a.vy = 0.5; }
    } else if (a.phase === 'air') {
      a.airT += dt;
      a.v = Math.min(62, a.v + 1.2 * dt);
      a.s += a.v * dt;
      a.vy += (6 - a.vy) * (1 - Math.exp(-1.1 * dt));
      a.alt += a.vy * dt;
      a.pitch += (0.11 - a.pitch) * (1 - Math.exp(-1.5 * dt));
      a.gearK = Math.min(1, Math.max(0, (a.airT - 2.5) / 3));
    }
    if (a.phase === 'taxi' || a.phase === 'roll' || a.phase === 'air') {
      DEPART.at(a.s + 4, _2, _2d);
      const want = Math.atan2(_2d.x, _2d.y);
      const d = wrap(want - a.yaw);
      a.yaw = wrap(a.yaw + THREE.MathUtils.clamp(d, -0.9 * dt, 0.9 * dt));
    }
  }

  private poseActor(a: Actor) {
    if (a.phase !== 'taxi' && a.phase !== 'roll' && a.phase !== 'air') return;
    DEPART.at(a.s, _2);
    this.place(a.b, _2.x, wheelsY(a.pitch) + a.alt, _2.y, a.yaw, a.pitch, 0);
    a.gear.set(a.gearK);
  }

  private place(b: Bomber, x: number, y: number, z: number, yaw: number, pitch: number, roll: number) {
    b.root.position.set(x, y, z);
    _e.set(-pitch, yaw, roll);
    b.root.quaternion.setFromEuler(_e);
    b.root.updateMatrixWorld(true);
  }

  private updateTakeoff(dt: number) {
    const t = this.t, e = this.engine, cam = e.camera;
    const shot = t < 5 ? 0 : t < 10 ? 1 : t < 17 ? 2 : t < 21 ? 3 : 4;
    const off = shot <= 2 ? [0, 2, 8.5][shot] : null;
    const cut = shot !== this.shot;
    if (cut) { this.shot = shot; this.lookInit = false; e.post.resetHistory(); this.note(`shot ${shot + 1} at ${t.toFixed(2)}`); }
    if (off !== null) this.simTakeoff(t + off);
    const A = this.cast[1], B = this.cast[2], SQ = this.cast[0];
    if (shot <= 2) for (const a of this.queue()) this.poseActor(a);
    const g = this.base!.group.position;
    // fade in at the start, a dip to black into the cloud
    this.setFade(t < 0.9 ? 1 - t / 0.9 : shot === 3 && t - 17 < 0.35 ? 1 - (t - 17) / 0.35 : t > TAKEOFF_LEN - 1.2 ? (t - (TAKEOFF_LEN - 1.2)) / 1.2 : 0);
    this.caption(t > 0.6 && t < 4.6);
    if (shot === 0) {
      // low on the runway edge: A thunders past and lifts off
      afToLocal(-645 + t * 1.2, -40, cam.position, 1.35).add(g);
      this.aim(_p.copy(A.b.root.position).add(g).addScaledVector(UP, 1.5), dt, 5);
      cineLens(e, 40);
    } else if (shot === 1) {
      // the watch office balcony: the Sky Queen turns onto the runway as B rolls
      afToLocal(TOWER.a - 3, TOWER.b - 6.8, cam.position, 5.35).add(g);
      _q.copy(SQ.b.root.position).add(g).addScaledVector(UP, 1.2);
      _w.copy(B.b.root.position).add(g);
      _p.copy(_q).lerp(_w, 0.1 * smooth(5, 9, t));
      this.aim(_p, dt, 3);
      cineLens(e, 13 - 2 * smooth(5, 10, t));
    } else if (shot === 2) {
      // tracking beside the take-off roll; she pulls ahead and lifts off
      const u = t - 10;
      const sqA = this.afA(SQ.b.root.position);
      if (cut) this.camA = sqA - 14;
      this.camA += (30 + u * 1.5) * dt;
      afToLocal(this.camA, 26 - u * 0.6, cam.position, 2.1 + u * 0.45).add(g);
      cam.position.y += Math.sin(t * 23) * 0.025 + Math.sin(t * 17) * 0.02;   // a truck on the grass
      this.aim(_p.copy(SQ.b.root.position).add(g).addScaledVector(UP, 1), dt, 7);
      cineLens(e, 50 - 10 * smooth(0, 7, u));
    } else if (shot === 3) {
      this.climbShot(t - 17, dt, cut);
    } else {
      this.formationShot(t - 21, dt, cut);
    }
    if (shot <= 2) this.groundFx(dt);
    // radio
    this.say('clear', t >= 5.3);
    this.say('tailwheel', t >= 8.6);
    this.say('flying', t >= 13.6);
    this.say('climb', t >= 17.6);
    // engines: the nearest few Fortresses at full power or ticking over
    this.voices.length = 0;
    if (shot <= 2) for (let i = 0; i < 5; i++) this.engineVoice(this.queue()[i], 990 + i);
    else this.engineVoice(SQ, 990);
  }

  private camA = 0;
  private mbSaved = -1;
  private afA(p: THREE.Vector3) { return p.x * DIR.x + p.z * DIR.z; }

  // Shot 4: the Sky Queen alone, climbing out of the top of the cloud deck into the sun
  private climbShot(u: number, dt: number, cut: boolean) {
    const e = this.engine, cam = e.camera, g = this.base!.group.position, SQ = this.cast[0];
    if (cut) for (const a of this.cast) a.b.root.visible = a === SQ;
    const y = cloudTops() - 420 + 420 * smooth(0, 4, u) + 20 * u;
    afToLocal(9000 + CRUISE * u, 0, _p, y);
    SQ.gearK = 1; SQ.gear.set(1); SQ.rpm = 1; SQ.phase = 'air';
    this.place(SQ.b, _p.x, _p.y, _p.z, Math.atan2(DIR.x, DIR.z), 0.16 - 0.06 * smooth(2, 4, u), Math.sin(u * 0.7) * 0.05);
    cam.position.copy(_p).addScaledVector(DIR, -44 + u * 2).addScaledVector(LEFT, 15).addScaledVector(UP, -4 + u * 0.6).add(g);
    this.aim(_q.copy(_p).add(g).addScaledVector(DIR, 6), dt, 60, cut);
    cineLens(e, 48);
    SQ.v = CRUISE; SQ.vy = 90;
  }

  // Shot 5: above the cloud, the formation; she slides up into her slot
  private formationShot(u: number, dt: number, cut: boolean) {
    const e = this.engine, cam = e.camera, g = this.base!.group.position;
    const y = cloudTops() + 700;
    afToLocal(13000 + CRUISE * u, 0, _c, y);
    const slots = FORMATION;
    const yaw = Math.atan2(DIR.x, DIR.z);
    this.cast.forEach((a, i) => {
      a.b.root.visible = true; a.phase = 'air'; a.rpm = 1; a.gear.set(1);
      const s = slots[i];
      _p.copy(_c).addScaledVector(LEFT, s[0]).addScaledVector(UP, s[1]).addScaledVector(DIR, s[2]);
      const ph = i * 1.7;
      _p.x += Math.sin(u * 0.6 + ph) * 1.2; _p.y += Math.sin(u * 0.9 + ph) * 0.8;
      let pitch = Math.sin(u * 0.5 + ph) * 0.01, roll = Math.sin(u * 0.4 + ph) * 0.02;
      if (i === 0) {
        const k = 1 - smooth(0, 3.2, u);
        _p.addScaledVector(LEFT, -22 * k).addScaledVector(UP, -38 * k).addScaledVector(DIR, -25 * k);
        pitch += 0.06 * k; roll += -0.08 * k * Math.sin(u * 1.4 + 0.5);
      }
      this.place(a.b, _p.x, _p.y, _p.z, yaw, pitch, roll);
      a.v = CRUISE;
    });
    const sq = this.cast[0].b.root.position;
    // from behind and above the Sky Queen's shoulder, looking up the box past her
    cam.position.copy(sq).addScaledVector(DIR, -78 + u * 3).addScaledVector(LEFT, 18).addScaledVector(UP, 14 - u).add(g);
    this.aim(_q.copy(sq).lerp(_c, 0.45).add(g).addScaledVector(DIR, 20), dt, 6, cut);
    cineLens(e, 52);
  }

  // Prop wash and wheel dust behind the ships on the ground
  private groundFx(dt: number) {
    const fx = this.game.world.effects, O = this.O;
    if (fx.smoke.count > 7000) return;
    for (const a of this.queue()) {
      if (a.phase === 'air' && a.alt > 8) continue;
      const strong = a.phase === 'roll' || (a.phase === 'air' && a.alt < 8);
      if (!strong && a.v < 2) continue;
      a.dustT -= dt;
      if (a.dustT > 0) continue;
      a.dustT = strong ? 0.035 : 0.25;
      const b = a.b;
      for (const x of strong ? [6.5, 3.0, -3.0, -6.5] : [3.0, -3.0]) {
        b.root.localToWorld(_p.set(x + R() * 0.8, 0, -3 - Math.random() * 3));
        _p.y = 0.6 + Math.random() * 0.6 - a.alt * 0.5;
        if (_p.y < 0.3) _p.y = 0.3;
        b.root.getWorldDirection(_w).negate().setY(0).normalize();
        (O.vel as THREE.Vector3).copy(_w).multiplyScalar((strong ? 14 : 5) + Math.random() * 6).add(_v.set(R() * 3, 0.6 + Math.random(), R() * 3));
        O.pos = _p; O.life = strong ? 1.6 + Math.random() : 1.2; O.size0 = strong ? 1.6 : 0.8; O.size1 = strong ? 9 + Math.random() * 5 : 4;
        O.color0 = C_DUST; O.color1 = C_DUST1; O.alpha0 = strong ? 0.2 : 0.1; O.alpha1 = 0; O.frame = 0; O.drag = 1.4; O.rise = 0.5; O.lit = true; O.rotVel = R() * 0.6;
        fx.smoke.spawn(O);
      }
    }
  }

  // ---------------- landing ----------------

  private startLanding(pb: Bomber) {
    this.ensure(!this.compiled);
    this.field.prepare();
    const e = this.engine, w = this.game.world, base = this.base!;
    this.begin('landing');
    e.timeScale = 1;
    this.sev = this.severity(pb);
    this.note(`landing, severity ${this.sev} (engines out ${pb.enginesOut}, integrity ${pb.integrity.toFixed(2)})`);
    this.pb = pb;
    this.pbPos.copy(pb.root.position); this.pbQuat.copy(pb.root.quaternion); this.pbVel.copy(pb.vel); this.pbSpin.copy(pb.spin);
    this.hideWorld(pb);
    w.effects.clear();
    // the bombing target's ground and cloud effects must not show here
    this.tgtSaved = { w: targetUniforms.uTgt.value.w, gap: cloudTargetUniforms.uGap.value.clone(), glow: cloudTargetUniforms.uGlow.value.clone() };
    targetUniforms.uTgt.value.w = 0; cloudTargetUniforms.uGap.value.set(0, 0, 0, 0); cloudTargetUniforms.uGlow.value.set(0, 0, 1, 0);
    this.reveal.reveal(pb.model);
    // the field below the formation (scene coordinates near the floating origin)
    base.group.position.set(Math.round(e.camera.position.x), 0, Math.round(e.camera.position.z));
    base.show(e.scene, true);
    base.resetVehicles();
    pb.model.add(this.landGear!.group);
    this.landGear!.set(1);
    // the formation mates, the rest on their hardstands
    for (const a of this.cast) { a.phase = 'off'; a.b.root.visible = false; }
    for (let i = 1; i <= 3; i++) { const a = this.cast[i]; a.phase = 'air'; a.rpm = 0.8; a.gear.set(1); a.b.root.visible = true; }
    this.parkRest(4);
    Object.assign(this.sq, { down: false, bounced: false, stopped: false, sparkT: 0, dustT: 0, gearK: 1, rpm: 0.75, roll: 0 });
    // where she will come to rest (the crash crews head there)
    const decel = this.sev === 2 ? 5 : this.sev === 1 ? 3.6 : 4;
    this.stopA = A_TD + (V_APP - 2) ** 2 / (2 * decel);
    this.stopB = this.sev === 2 ? this.slewSide() * 7 : 0;
    sound.setMode('menu');   // outside the ship now: the interior drone gives way to the engines
    this.overlay(true, BOOKEND_TEXT.landing);
    this.setFade(1);
  }

  private slewSide() {
    const b = this.pb;
    if (!b) return 1;
    const l = (b.engineDead[0] ? 1 : 0) + (b.engineDead[1] ? 1 : 0), r = (b.engineDead[2] ? 1 : 0) + (b.engineDead[3] ? 1 : 0);
    return l > r ? 1 : r > l ? -1 : 1;   // toward the dead side (+b = left)
  }

  private severity(b: Bomber): 0 | 1 | 2 {
    if (this.forceSeverity >= 0) return Math.min(2, this.forceSeverity) as 0 | 1 | 2;
    const out = b.enginesOut;
    const tip = ['wingLtip', 'wingRtip'].some((n) => (b.zone(n)?.hp ?? 1) <= 0);
    const tail = b.zone('tail');
    const tf = tail ? Math.max(0, tail.hp) / tail.maxHp : 1;
    const integ = b.integrity;
    if (out >= 2 || integ < 0.35 || tf < 0.2 || (tip && out >= 1)) return 2;
    if (out >= 1 || tip || integ < 0.6 || tf < 0.5 || this.game.world.crewWounded >= 1) return 1;
    return 0;
  }

  private updateLanding(dt: number) {
    const t = this.t, e = this.engine, cam = e.camera, g = this.base!.group.position, pb = this.pb!;
    const shot = t < 4.5 ? 0 : t < 10 ? 1 : t < 17 ? 2 : 3;
    const cut = shot !== this.shot;
    if (cut) { this.shot = shot; this.lookInit = false; e.post.resetHistory(); this.note(`shot L${shot + 1} at ${t.toFixed(2)}`); }
    this.setFade(t < 0.8 ? 1 - t / 0.8 : t > LANDING_LEN - 1.1 ? (t - (LANDING_LEN - 1.1)) / 1.1 : 0);
    this.caption(t > 0.5 && t < 4.3);
    const yaw0 = Math.atan2(DIR.x, DIR.z);
    const sq = this.sq;
    if (shot === 0) {
      // letting down through the top of the overcast
      const y = cloudTops() + 150 - 300 * smooth(0, 4.5, t) - 8 * t;
      afToLocal(-16000 + CRUISE * t, 300, _c, y);
      this.formation4(_c, yaw0, -0.05, t, false);
      _p.copy(pb.root.position);
      cam.position.copy(_p).addScaledVector(DIR, 38 - t * 3).addScaledVector(LEFT, -34).addScaledVector(UP, 5);
      this.aim(_q.copy(_p).addScaledVector(UP, 1), dt, 40, cut);
      cineLens(e, 44);
      pb.vel.copy(DIR).multiplyScalar(CRUISE).addScaledVector(UP, -90);
      this.say('letdown', t >= 0.6);
    } else if (shot === 1) {
      // over the field in echelon, peeling off one by one
      const u = t - 4.5;
      afToLocal(-1050 + CRUISE * u, -70, _c, 125);
      this.formation4(_c, yaw0, 0, u, true);
      afToLocal(TOWER.a - 3, TOWER.b - 6.8, cam.position, 5.35).add(g);
      this.aim(_q.copy(pb.root.position).addScaledVector(UP, -50), dt, 2.5, cut);   // the tree line along the bottom
      cineLens(e, 26 + 8 * smooth(1, 5, u));
      if (this.sev >= 1) {
        if (u >= 1.1 && !this.said.has('fl1')) { this.said.add('fl1'); this.fireFlare(pb, 1); }
        if (u >= 1.8 && !this.said.has('fl2')) { this.said.add('fl2'); this.fireFlare(pb, -1); }
        this.say('flares', t >= 5.0);
        this.say('crashCrew', t >= 7.4);
      } else this.say('land', t >= 5.0);
      if (this.sev < 2) this.landGear!.set(1 - smooth(8.4, 9.8, t));
    } else {
      // final, touchdown and roll-out (L4 is two seconds further on)
      const u = t - 10 + (shot === 3 ? 2 : 0);
      if (cut && shot === 2) { this.sq.v = V_APP; for (let i = 1; i <= 3; i++) this.cast[i].b.root.visible = i === 1; }
      this.finalAndRoll(u, dt, cut && shot === 3);
      // F1 on the approach a long way behind; F2/F3 in the circuit
      this.approachOther(this.cast[1], u - 22);
      if (shot === 2) {
        afToLocal(A_TD + 100, -38, cam.position, 1.5).add(g);
        this.aim(_q.copy(pb.root.position).addScaledVector(UP, 0.5), dt, 5, cut);
        cineLens(e, 26 + 24 * smooth(2.5, 6.5, u));
        if (this.sev === 2) this.say('belly', t >= 10.3);
      } else if (this.sev >= 1) {
        afToLocal(this.stopA + 58, this.stopB + 36, cam.position, 7 - (t - 17) * 0.5).add(g);
        this.aim(_q.copy(pb.root.position).addScaledVector(UP, 0.5), dt, 3, cut);
        cineLens(e, 44 - 4 * smooth(17, 21, t));
        this.say('out', t >= 17.6);
      } else {
        _p.copy(pb.root.position);
        cam.position.copy(_p).addScaledVector(DIR, -44 + (t - 17) * 2).addScaledVector(LEFT, 15).setY(4.5);
        this.aim(_q.copy(_p).addScaledVector(UP, 1), dt, 6, cut);
        cineLens(e, 46);
        this.say('home', t >= 17.5);
      }
      if (this.sev >= 1) this.driveVehicles(t, dt);
    }
    if (this.sev >= 1 && shot === 1) this.driveVehicles(t, dt);
    // the real ship: props, smoke from the dead engines, its own damage effects
    pb.root.updateMatrixWorld(true);
    pb.updateProps(dt, sq.rpm);
    this.game.world.bomberDamage.update(dt);
    // engines
    this.voices.length = 0;
    const stage = pb.enginesOut >= 2 ? 3 : pb.enginesOut >= 1 ? 2 : 0;
    if (sq.rpm > 0.05) this.voices.push({ id: 980, pos: pb.root.position, vel: pb.vel, radial: true, throttle: sq.rpm, stage, type: 'b17' });
    if (this.sev === 2 && sq.down) this.field.scrape(pb.root.position, pb.vel, sq.v);
    for (let i = 1; i <= 3; i++) if (this.cast[i].b.root.visible) this.engineVoice(this.cast[i], 980 + i);
  }

  // The four ships of the formation (the player's ship real, three from the cast): L1 in a vic
  // letting down, L2 in right echelon running in and breaking left one by one
  private formation4(c: THREE.Vector3, yaw: number, pitch: number, u: number, peel: boolean) {
    const g = this.base!.group.position, pb = this.pb!;
    const order = this.sev >= 1 ? [0, 1, 2, 3] : [1, 0, 2, 3];   // a damaged ship lands first
    const ships: (Bomber)[] = [pb, this.cast[1].b, this.cast[2].b, this.cast[3].b];
    ships.forEach((b, i) => {
      const k = order.indexOf(i);
      let sx: number, sy: number, sz: number;
      if (peel) { sx = -k * 42; sy = -k * 6; sz = -k * 30; } else { sx = [0, 38, -38, 0][k]; sy = [0, -8, -8, -16][k]; sz = [0, -34, -34, -68][k]; }
      _p.copy(c).addScaledVector(LEFT, sx).addScaledVector(UP, sy).addScaledVector(DIR, sz);
      let y = yaw, p = pitch + Math.sin(u * 0.5 + i) * 0.008, r = Math.sin(u * 0.4 + i * 1.3) * 0.02;
      if (peel) {
        // break left at 1.1 s intervals: a climbing, banked turn away from the runway line
        const tb = 2.4 + k * 1.0, d = Math.max(0, u - tb);
        if (d > 0) {
          const rate = 0.32 * smooth(0, 1.2, d);
          const ang = 0.32 * (d - 0.6 * (1 - Math.exp(-d / 0.6)));   // integral of the eased turn rate
          // fly the arc: offset from the straight path by turning about a centre to the left
          const rad = CRUISE / 0.32;
          const sx2 = rad * (1 - Math.cos(ang)), sz2 = rad * Math.sin(ang) - CRUISE * d;
          _p.addScaledVector(LEFT, sx2).addScaledVector(DIR, sz2).addScaledVector(UP, 12 * smooth(0, 3, d));
          y = yaw + ang;
          r = -0.55 * (rate / 0.32);
          p += 0.04 * smooth(0, 1, d);
        }
      }
      if (b === pb) { _p.add(g); b.root.position.copy(_p); _e.set(-p, y, r); b.root.quaternion.setFromEuler(_e); b.root.updateMatrixWorld(true); }
      else this.place(b, _p.x, _p.y, _p.z, y, p, r);
    });
    for (const a of [this.cast[1], this.cast[2], this.cast[3]]) a.v = CRUISE;
    this.sq.rpm = 0.75;
    pb.vel.copy(DIR).multiplyScalar(CRUISE);
  }

  private finalAndRoll(u: number, dt: number, jumped: boolean) {
    const sq = this.sq, pb = this.pb!, g = this.base!.group.position, sev = this.sev;
    if (jumped) {
      // the cut into L4 skips 2 s: run the roll-out on in small steps
      const steps = Math.ceil(2 / (1 / 30));
      for (let i = 0; i < steps; i++) this.rollStep(u - 2 + (i + 1) / 30, 1 / 30, false);
    }
    this.rollStep(u, dt, true);
    afToLocal(sq.a, sq.b, _p, sq.y).add(g);
    pb.root.position.copy(_p);
    _e.set(-sq.pitch, sq.yaw, sq.roll);
    pb.root.quaternion.setFromEuler(_e);
    pb.vel.copy(DIR).multiplyScalar(sq.v).addScaledVector(UP, sq.down ? 0 : -2.7);
    this.landGear!.set(sev === 2 ? 1 : 0);
  }

  // One step of the final approach / landing roll at time u into L3 (story)
  private rollStep(u: number, dt: number, fx: boolean) {
    const sq = this.sq, sev = this.sev, yaw0 = Math.atan2(DIR.x, DIR.z);
    if (u < T_TD) {
      const x = T_TD - u;
      sq.a = A_TD - V_APP * x; sq.b = 0; sq.v = V_APP;
      const h = x > 1.2 ? 2.7 * x : 3.24 * Math.pow(x / 1.2, 1.6);
      sq.pitch = sev === 2 ? 0.05 + 0.03 * smooth(1.2, 0, x) : 0.04 + 0.05 * smooth(1.4, 0.1, x);
      sq.y = (sev === 2 ? BELLY_Y : wheelsY(sq.pitch)) + h;
      sq.yaw = yaw0 + (sev >= 1 ? Math.sin(u * 1.9) * 0.025 : 0);
      sq.roll = sev >= 1 ? Math.sin(u * 1.3) * 0.05 : Math.sin(u * 0.9) * 0.015;
      sq.rpm = 0.55;
      return;
    }
    const d = u - T_TD;
    if (!sq.down) {
      sq.down = true; sq.vy = sev === 1 ? 3.2 : 0;
      if (fx) this.touchdown();
    }
    const decel = sev === 2 ? 5 : sev === 1 ? 3.6 : 4;
    sq.v = Math.max(0, sq.v - decel * dt);
    if (sq.v < 9 && sev === 0) sq.v = Math.max(sq.v, 8);   // taxi speed: she rolls on to turn off
    sq.a += sq.v * dt;
    if (sev === 2) {
      // belly: slewing toward the dead engines, a wing down, props stopped
      const side = this.slewSide(), k = smooth(0, 6, d);
      sq.yaw = yaw0 + side * 0.32 * k;
      sq.b = this.stopB * k;
      sq.roll = -side * 0.07 * smooth(0, 2, d);
      sq.pitch = 0.035;
      sq.y = BELLY_Y + Math.max(0, 0.25 - d * 0.5) * Math.abs(Math.sin(d * 13));
      sq.rpm = Math.max(0, 0.55 - d * 2);
      if (fx && sq.v > 1.5) this.scrape(dt);
    } else {
      if (sev === 1 && !sq.bounced) {
        sq.vy -= 9.81 * dt;
        const lift = Math.max(0, (sq.y - wheelsY(sq.pitch)) + sq.vy * dt);
        if (lift <= 0 && sq.vy < 0 && d > 0.2) { sq.bounced = true; if (fx) this.touchdown(); }
        sq.y = wheelsY(sq.pitch) + lift;
      }
      const tail = smooth(30, 18, sq.v);
      sq.pitch = 0.08 + (THREE_POINT - 0.08) * tail;
      if (sev === 0 || sq.bounced) sq.y = wheelsY(sq.pitch);
      sq.yaw = yaw0 + (sev === 1 ? 0.07 * Math.sin(d * 2.1) * Math.exp(-d * 0.35) : 0);
      sq.roll = sev === 1 ? 0.03 * Math.sin(d * 2.1 + 1) * Math.exp(-d * 0.4) : 0;
      sq.rpm = 0.3;
    }
    if (sq.v < 0.5 && !sq.stopped) { sq.stopped = true; this.note(`stopped at a=${sq.a.toFixed(0)} t=${this.t.toFixed(1)}`); }
  }

  private touchdown() {
    const fx = this.game.world.effects, pb = this.pb!, O = this.O;
    if (this.sev === 2) { this.field.touchdown(pb.root.position, true); return; }
    // a puff of tyre smoke from each main wheel
    for (const x of [3.02, -3.02]) {
      pb.root.localToWorld(_p.set(x, MAIN_CONTACT.y + 0.3, MAIN_CONTACT.z));
      for (let i = 0; i < 6; i++) {
        (O.vel as THREE.Vector3).copy(pb.vel).multiplyScalar(0.3).add(_v.set(R() * 2, 0.8 + Math.random(), R() * 2));
        O.pos = _p; O.life = 1.4; O.size0 = 0.8; O.size1 = 4.5; O.color0 = C_TYRE; O.color1 = C_DUST1; O.alpha0 = 0.4; O.alpha1 = 0;
        O.frame = 0; O.drag = 2.2; O.rise = 0.4; O.lit = true; O.rotVel = R();
        fx.smoke.spawn(O);
      }
    }
    this.field.touchdown(pb.root.position, false, this.sev === 1);
  }

  // Belly landing: sparks off the fuselage and nacelles, a spray of earth and dust
  private scrape(dt: number) {
    const fx = this.game.world.effects, pb = this.pb!, sq = this.sq, O = this.O;
    sq.sparkT -= dt; sq.dustT -= dt;
    if (sq.sparkT <= 0) {
      sq.sparkT = 0.05;
      for (const [x, z] of [[0, -3.5], [3.0, 1.0], [-3.0, 1.0], [0, -8]]) {
        pb.root.localToWorld(_p.set(x + R() * 0.5, -1.5, z + R()));
        _p.y = 0.3;
        _v.copy(pb.vel).multiplyScalar(0.6);
        fx.sparks(_p, _v, Math.random() < 0.15);
      }
    }
    if (sq.dustT <= 0 && fx.smoke.count < 7600) {
      sq.dustT = 0.03;
      const k = Math.min(1, sq.v / 30);
      for (let i = 0; i < 3; i++) {
        pb.root.localToWorld(_p.set(R() * 7, -1.4, -6 + R() * 8));
        _p.y = 0.6;
        (O.vel as THREE.Vector3).copy(pb.vel).multiplyScalar(0.25 + Math.random() * 0.3).add(_v.set(R() * 6, 1.5 + Math.random() * 3, R() * 6));
        O.pos = _p; O.life = 2.4 + Math.random(); O.size0 = 2; O.size1 = 10 + Math.random() * 6; O.color0 = C_DUST; O.color1 = C_DUST1;
        O.alpha0 = 0.32 * k + 0.08; O.alpha1 = 0; O.frame = 0; O.drag = 1.1; O.rise = 0.6; O.lit = true; O.rotVel = R() * 0.5;
        fx.smoke.spawn(O);
      }
    }
  }

  // Another ship on a straight-in approach (u < T_TD) far behind, then gone
  private approachOther(a: Actor, u: number) {
    const x = T_TD - u;
    if (x < 0) { a.b.root.visible = false; return; }
    const h = 2.7 * x;
    afToLocal(A_TD - V_APP * x, 0, _p, wheelsY(0.04) + h);
    a.gear.set(0);
    this.place(a.b, _p.x, _p.y, _p.z, Math.atan2(DIR.x, DIR.z), 0.04, 0);
    a.rpm = 0.55; a.v = V_APP;
  }

  // The fire tender, crash truck and ambulances race to where she stops
  private driveVehicles(t: number, dt: number) {
    const base = this.base!;
    const start = 7.8;
    if (t < start) return;
    const targets: [number, number][] = [[10, 18], [-8, 20], [16, -14], [2, 17]];
    base.vehicles.forEach((v: Vehicle, i) => {
      if (v.kind === 'jeep') return;
      const [da, db] = targets[i % targets.length];
      afToLocal(this.stopA + da, this.stopB + db, _p, v.home.y);
      const vt = (v.obj.userData as { v?: number }).v ?? 0;
      _w.copy(_p).sub(v.obj.position).setY(0);
      const dist = _w.length();
      const want = Math.min(19, Math.sqrt(2 * 4 * Math.max(0, dist - 1)));
      const nv = THREE.MathUtils.clamp(want, vt - 6 * dt, vt + 3.5 * dt);
      (v.obj.userData as { v?: number }).v = nv;
      if (dist > 0.5) {
        _w.normalize();
        v.obj.position.addScaledVector(_w, Math.min(dist, nv * dt));
        const yaw = Math.atan2(_w.x, _w.z);
        v.obj.rotation.y += wrap(yaw - v.obj.rotation.y) * Math.min(1, dt * 3);
      }
      v.obj.getWorldPosition(_vp);
      _vv.set(Math.sin(v.obj.rotation.y), 0, Math.cos(v.obj.rotation.y)).multiplyScalar(nv);
      this.field.vehicle(v, v.kind as CrewVehicle, _vp, _vv, nv, dt);
      const on = Math.floor((t + i * 0.13) * 6) % 2 === 0;
      v.beacons.forEach((bm, j) => { bm.visible = j === 0 ? on : !on; });
      // dust off the grass behind them
      const fx = this.game.world.effects, O = this.O;
      if (nv > 4 && fx.smoke.count < 7600 && Math.random() < dt * 14) {
        v.obj.localToWorld(_q.set(R(), 0.4, -3));
        (O.vel as THREE.Vector3).set(R() * 1.5, 0.6, R() * 1.5);
        O.pos = _q; O.life = 1.6; O.size0 = 1; O.size1 = 5; O.color0 = C_DUST; O.color1 = C_DUST1; O.alpha0 = 0.18; O.alpha1 = 0;
        O.frame = 0; O.drag = 1.5; O.rise = 0.3; O.lit = true; O.rotVel = R() * 0.5;
        fx.smoke.spawn(O);
      }
    });
  }

  // Red Very lights fired from the cockpit roof: wounded aboard
  private fireFlare(b: Bomber, side: number) {
    b.root.localToWorld(_p.set(0.4 * side, 1.7, 2.4));
    const v = b.vel.clone().multiplyScalar(0.92).addScaledVector(UP, 32 + Math.random() * 6);
    b.root.localToWorld(_w.set(side, 0, 0)).sub(_c.setFromMatrixPosition(b.root.matrixWorld)).normalize();
    v.addScaledVector(_w, 9);
    this.flares.push({ p: _p.clone(), v, life: 4.2, lightT: 0 });
    this.field.flarePop(_p);
  }

  private updateFlares(dt: number) {
    if (!this.flares.length) { this.field.flares(this.flares); return; }
    const fx = this.game.world.effects, O = this.O;
    for (const f of this.flares) {
      f.life -= dt;
      f.v.y -= 9.81 * 0.5 * dt;
      f.v.multiplyScalar(Math.exp(-0.35 * dt));
      f.p.addScaledVector(f.v, dt);
      const k = Math.max(0, Math.min(1, f.life / 1.2));
      O.pos = f.p; (O.vel as THREE.Vector3).set(0, 0, 0); O.life = 0.3; O.size0 = 5.5 * k + 1.2; O.size1 = 1.2; O.color0 = C_FLARE; O.color1 = C_FLARE1;
      O.alpha0 = 1; O.alpha1 = 0; O.frame = 1; O.drag = 0; O.rise = 0; O.lit = false; O.rotVel = 0;
      fx.glow.spawn(O);
      if (fx.smoke.count < 7800) {
        (O.vel as THREE.Vector3).set(R() * 0.4, 0.3, R() * 0.4);
        O.life = 3.6; O.size0 = 1.2; O.size1 = 7; O.color0 = C_FSMOKE; O.color1 = C_FSMOKE; O.alpha0 = 0.32 * k; O.alpha1 = 0; O.frame = 0; O.drag = 0.6; O.rise = 0.2; O.lit = true; O.rotVel = R() * 0.4;
        fx.smoke.spawn(O);
      }
      f.lightT -= dt;
      if (f.lightT <= 0 && k > 0.2) { f.lightT = 0.12; fx.flashLight(f.p, 260 * k, 0.16, 0xff3020, 160); }
    }
    this.flares = this.flares.filter((f) => f.life > 0);
    this.field.flares(this.flares);   // each flare's hiss rides up with it
  }

  // ---------------- shared ----------------

  private begin(seq: 'takeoff' | 'landing') {
    this.seq = seq;
    this.t = 0; this.shot = -1; this.st = 0;
    this.skipReq = false; this.skipAt = -1;
    this.said.clear(); this.flares = []; this.voices.length = 0; this.log = [];
    this.lookInit = false;
    this.fade = -1;
    this.snap.capture(this.engine);
    this.mbSaved = this.engine.post.motionBlur;
    this.engine.post.motionBlur = 0.2;   // telephoto pans: keep the near ground readable
    this.hideUi(true);
    addEventListener('pointerdown', this.onSkip, true);
    addEventListener('keydown', this.onKey, true);
  }

  private onSkip = () => { if (this.seq !== 'none') this.skipReq = true; };
  private onKey = (ev: KeyboardEvent) => {
    if (this.seq === 'none') return;
    if (ev.code === 'Space' || ev.code === 'Escape' || ev.code === 'Enter') { this.skipReq = true; if (ev.code === 'Space') ev.preventDefault(); }
  };

  private finish() {
    const seq = this.seq, m = this.mission, cb = this.onDone;
    this.cleanup();
    if (seq === 'takeoff') this.resumeFor = m;
    else if (seq === 'landing') this.landedFor = m;
    this.onDone = null;
    cb?.();
  }

  // Leave without calling back (the game moved on: menu, another mission)
  private abort() {
    this.note('aborted');
    this.cleanup();
    this.onDone = null;
  }

  private cleanup() {
    const seq = this.seq, e = this.engine, w = this.game.world;
    this.seq = 'none';
    removeEventListener('pointerdown', this.onSkip, true);
    removeEventListener('keydown', this.onKey, true);
    this.overlay(false);
    this.hideUi(false);
    this.snap.restore(e);
    if (this.mbSaved >= 0) { e.post.motionBlur = this.mbSaved; this.mbSaved = -1; }
    this.reveal.restore();
    for (const { o, v } of this.worldVis) o.visible = v;
    this.worldVis = [];
    this.flares = [];
    this.voices.length = 0;
    sound.updateFighterVoices([]);
    this.field.stopAll(seq === 'landing' ? 0.6 : 0.3);
    if (this.weatherSaved) { applyWeather(e, this.weatherSaved); this.weatherSaved = null; }
    if (this.tgtSaved) {
      targetUniforms.uTgt.value.w = this.tgtSaved.w;
      cloudTargetUniforms.uGap.value.copy(this.tgtSaved.gap); cloudTargetUniforms.uGlow.value.copy(this.tgtSaved.glow);
      this.tgtSaved = null;
    }
    const pb = this.pb;
    if (pb) {
      pb.root.position.copy(this.pbPos); pb.root.quaternion.copy(this.pbQuat); pb.vel.copy(this.pbVel); pb.spin.copy(this.pbSpin);
      pb.root.updateMatrixWorld(true);
      this.pb = null;
    }
    this.landGear?.group.removeFromParent();
    if (this.base) {
      this.base.show(e.scene, false);
      this.base.resetVehicles();
      for (const a of this.cast) { a.b.root.visible = false; a.phase = 'off'; }
    }
    if (seq !== 'none') w.effects.clear();
    e.post.resetHistory();
  }

  private hideWorld(keep: THREE.Object3D | { root: THREE.Object3D } | null) {
    const k = keep && 'root' in keep ? keep.root : keep;
    this.worldVis = [];
    for (const a of this.game.world.aircraft) {
      if (a.root === k) continue;
      this.worldVis.push({ o: a.root, v: a.root.visible });
      a.root.visible = false;
    }
  }

  private hideUi(on: boolean) {
    if (on) {
      for (const sel of ['#hud', '#hudCanvas', '#abilityBar', '#touchHud', '#cine', '#swsCine']) {
        document.querySelectorAll<HTMLElement>(sel).forEach((el) => { this.hidden.push({ el, v: el.style.visibility }); el.style.visibility = 'hidden'; });
      }
    } else {
      for (const { el, v } of this.hidden) el.style.visibility = v;
      this.hidden = [];
    }
  }

  private currentWeather(): Weather {
    const key = (this.game as unknown as { weatherKey?: string }).weatherKey;
    try { return key ? (JSON.parse(key) as Weather) : DEFAULT_WEATHER; } catch { return DEFAULT_WEATHER; }
  }

  // Smoothed look-at (k: responsiveness, 1/s)
  private aim(target: THREE.Vector3, dt: number, k: number, snap = false) {
    if (!this.lookInit || snap) { this.look.copy(target); this.lookInit = true; }
    else this.look.lerp(target, 1 - Math.exp(-k * dt));
    const cam = this.engine.camera;
    _m.lookAt(cam.position, this.look, UP);
    _qt.setFromRotationMatrix(_m);
    cam.quaternion.copy(_qt);
  }

  private engineVoice(a: Actor, id: number) {
    if (!a.b.root.visible || a.rpm < 0.05) return;
    a.wpos.setFromMatrixPosition(a.b.root.matrixWorld);
    a.b.root.getWorldDirection(a.wvel).multiplyScalar(a.v);
    this.voices.push({ id, pos: a.wpos, vel: a.wvel, radial: true, throttle: a.rpm, stage: 0, type: 'b17' });
  }

  private say(key: RadioKey, when: boolean) {
    if (!when || this.said.has(key) || this.skipAt >= 0) return;
    this.said.add(key);
    const [who, text] = BOOKEND_RADIO[key];
    const recorded = voice.sayLine(who, text, 3);
    if (!recorded) sound.radioStatic();
    const idx = ['Pilot', 'Navigator', 'Tail', 'Top Turret', 'Ball Turret', 'Bombardier', 'Radio', 'Lead', 'Big Friend'].indexOf(who);
    setTimeout(() => {
      if (this.seq === 'none') return;
      this.subtitle(who, text);
      if (!recorded) sound.speak(text, Math.max(0, idx));
    }, INTERPHONE_LEAD_S * 1000);
    this.note(`radio ${key}`);
  }

  // ---------------- overlay ----------------

  private ensureDom() {
    if (this.root?.isConnected) return;
    if (!document.getElementById('bkCineCss')) {
      const s = document.createElement('style');
      s.id = 'bkCineCss'; s.textContent = CSS;
      document.head.appendChild(s);
    }
    const r = document.createElement('div');
    r.id = 'bkCine';
    r.innerHTML = '<div class="bar t"></div><div class="bar b"></div><div class="tag"></div><div class="cap"></div><div class="hint"></div><div class="sub"></div><div class="fd"></div>';
    document.body.appendChild(r);
    this.root = r;
    const q = (c: string) => r.querySelector<HTMLElement>('.' + c)!;
    this.els = { tag: q('tag'), cap: q('cap'), hint: q('hint'), sub: q('sub'), fd: q('fd') };
  }

  private overlay(on: boolean, caption = '') {
    if (!on) { if (this.root) this.root.style.display = 'none'; return; }
    this.ensureDom();
    const els = this.els!;
    this.root!.style.display = '';
    els.tag.textContent = tx(BOOKEND_TEXT.tag);
    els.cap.textContent = tx(caption);
    els.hint.textContent = tx(BOOKEND_TEXT.skip);
    els.sub.innerHTML = '';
    els.tag.classList.remove('show'); els.cap.classList.remove('show');
    this.fade = -1;
  }

  private caption(on: boolean) {
    if (!this.els) return;
    this.els.tag.classList.toggle('show', on);
    this.els.cap.classList.toggle('show', on);
  }

  private setFade(a: number) {
    const v = Math.round(Math.min(1, Math.max(0, a)) * 100) / 100;
    if (v === this.fade || !this.els) return;
    this.fade = v;
    this.els.fd.style.opacity = String(v);
  }

  private subtitle(who: string, text: string) {
    if (!this.els) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    this.els.sub.innerHTML = `<div class="line"><span class="who">${esc(tx(who))}</span>${esc(withName(tx(text)))}</div>`;
    this.subT = 2.6 + text.length * 0.045;
  }

  private note(s: string) { this.log.push(`${this.t.toFixed(2)} ${s}`); if (this.log.length > 80) this.log.shift(); }
}

// Formation slots for the take-off's last shot (left, up, forward; m): the World box, a bit tighter
const FORMATION: [number, number, number][] = (() => {
  const vic = [[0, 0, 0], [36, -8, -34], [-36, -8, -34]];
  const el = [[0, 0, 0], [95, 45, -70], [-95, -45, -80], [0, -90, -160]];
  const out: [number, number, number][] = [];
  for (const e of el) for (const v of vic) out.push([(e[0] + v[0]) * 1.4, (e[1] + v[1]) * 1.4, (e[2] + v[2]) * 1.4]);
  // the Sky Queen flies number two in the lead element
  const sq = out.splice(1, 1)[0];
  return [sq, ...out];
})();
