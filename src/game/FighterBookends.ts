import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { UI } from '../ui/UI';
import type { Game } from './Game';
import type { Mission } from './Missions';
import { Aircraft } from '../world/Aircraft';
import type { ModelKind } from '../world/Models';
import { Airbase, DEPART, HOLD_S, SURFACE_Y, afToLocal, afYaw, type Vehicle } from '../world/Airbase';
import { CamSnapshot, cineLens } from './CineShared';
import { Atmos } from '../render/Atmosphere';
import { applyWeather, DEFAULT_WEATHER, type Weather } from '../render/Weather';
import { targetUniforms } from '../render/TargetGround';
import { cloudTargetUniforms } from '../render/Clouds';
import type { ParticleOpts } from '../render/Particles';
import { sound, type FighterSound } from '../audio/Sound';
import { voice } from '../audio/Voice';
import { INTERPHONE_LEAD_S } from '../audio/Interphone';
import { FieldSounds, type CrewVehicle } from '../audio/Field';
import { tx } from '../i18n';

// Fighter bookends (Phase 5 extra goal 35): the take-off and landing scenes around the P-51
// escort missions of the campaign (m4, m7, m9), the counterpart of the B-17 scenes (Bookends.ts).
// The field is Deenethorpe's layout (Airbase.ts, shared with the B-17 scenes: one instance per
// session) dressed as a fighter station, the 354th Fighter Group at Boxted: earth blast pens off
// the perimeter track with Mustangs parked in them, Blue flight on the move.
//
// Take-off (~18.5 s): the player's Mustang S-turns down the taxiway with Blue Four behind (the long
// nose blocks the view ahead), Lead and Blue Three already rolling; the pair's take-off roll, tails
// up, dust; gear up and a fast climb out low over the field; a cut to the rendezvous above the
// bomber stream. Radio: the tower clears Blue flight, Blue Four acknowledges (in escort missions
// the player flies as Lead's Blue Two and the wingman is Blue Four: PilotOps / Wingman.callsign).
//
// Landing (~15 s, after a successful mission): the pair runs in over the runway and breaks left
// (the fighter overhead: a climbing turn onto the downwind leg), a curving final, a wheel landing
// on the mains, the tail coming down in the roll-out. Badly damaged (the player's P-51: engine
// shot up, integrity low): a dead-stick glide straight in with the prop windmilling and smoke
// trailing, and (worst) the gear will not come down: a wheels-up landing in sparks and dust with
// the crash crews racing out.
//
// Same rules as the B-17 scenes: Space / Esc / Enter / click skips, the setting "Takeoff & landing
// scenes" (settings.bookends) turns both off, dev autoplay (bookends.auto) never plays, only
// missions started from the briefing. Everything of its own (the Mustangs, gear, the pens, the
// B-17s of the rendezvous) is built lazily when the briefing opens and compiled there
// (compileAsync, no shader stall), kept across the mission for the landing and disposed when the
// landing is over or the mission ends without one (release()). Bookends.ts delegates its hooks.

export const FIGHTER_RADIO = {
  clear: ['Tower', 'Boxted tower to Blue flight: you are cleared for take-off. Good hunting.'],
  ack: ['Blue Four', 'Blue Four, rolling with you.'],
  rv: ['Lead', 'Blue flight, Big Friends at twelve o\'clock low. Take station on the box.'],
  breakL: ['Lead', 'Blue flight, initial for the break. Breaking left.'],
  land: ['Tower', 'Blue flight, cleared to land. Welcome home.'],
  deadstick: ['Blue Two', 'Engine\'s gone — coming in dead-stick!'],
  wheelsUp: ['Blue Two', 'Gear won\'t come down — I\'m putting her down on her belly!'],
  crash: ['Tower', 'Crash crew to the runway! Mustang coming in wheels up!'],
  home: ['Blue Four', 'Blue Four is down. Nice flying today, Two.'],
} as const satisfies Record<string, readonly [string, string]>;
type RadioKey = keyof typeof FIGHTER_RADIO;

export const FIGHTER_TEXT = {
  tag: 'BOXTED · STATION 150',
  takeoff: '354TH FIGHTER GROUP · TAKE-OFF',
  landing: '354TH FIGHTER GROUP · RETURN TO BASE',
} as const;

export const F_TAKEOFF_LEN = 18.5;
export const F_LANDING_LEN = 15;
const SKIP_AFTER = 0.6;
const SKIP_FADE = 0.3;
const MORNING: Weather = { sunEl: 10, sunAz: 115, low: 0.62, high: 0.3, contrails: true, mood: 'clear' };
const DUSK: Weather = { sunEl: 4, sunAz: 255, low: 0.55, high: 0.4, contrails: true, mood: 'dusk' };

// P-51D gear in the model frame (the model has none): tyre contact points with the aircraft level
export const P51_MAIN = new THREE.Vector3(0, -2.05, 0.75);
export const P51_TAIL = new THREE.Vector3(0, -0.6, -6.5);
/** Three-point attitude, tail wheel down (~11 degrees nose up). */
export const P51_3PT = Math.atan((P51_TAIL.y - P51_MAIN.y) / (P51_MAIN.z - P51_TAIL.z));
const wheelsY = (pitch: number) => SURFACE_Y - P51_MAIN.y * Math.cos(pitch) - P51_MAIN.z * Math.sin(pitch);
const BELLY_Y = 0.95;
const A0 = -880;              // take-off: brakes off here (airfield a)
const ACC = 6.5;              // m/s^2 take-off roll
const VLO = 46;               // m/s lift-off
const A_TD = -700;            // landing: touchdown point (airfield a)
const V_APP = 42;             // m/s over the threshold
const T_TD = 3.2;             // s into L2 at touchdown
const CRUISE = 95;

const UP = new THREE.Vector3(0, 1, 0);
const DIR = afToLocal(1, 0, new THREE.Vector3());
const LEFT = afToLocal(0, 1, new THREE.Vector3());
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();
const _qt = new THREE.Quaternion();
const _2 = new THREE.Vector2();
const _2d = new THREE.Vector2();
const R = () => Math.random() * 2 - 1;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const cloudTops = () => Atmos.lowBase + (Atmos.lowTop - Atmos.lowBase) * Math.min(1, Atmos.lowCoverage * 1.05);

const C_DUST: [number, number, number] = [0.6, 0.54, 0.43];
const C_DUST1: [number, number, number] = [0.66, 0.6, 0.5];
const C_TYRE: [number, number, number] = [0.7, 0.7, 0.68];
const C_SMOKE: [number, number, number] = [0.18, 0.17, 0.16];
const C_SMOKE1: [number, number, number] = [0.42, 0.41, 0.4];

/** A model with spinning props and nothing else (the scenes pose it by hand). */
class Prop extends Aircraft {
  constructor(kind: ModelKind, radius: number) { super(kind, 'allied', radius); }
  update() { /* posed by the scene */ }
}

interface Gear { group: THREE.Group; set(retract: number): void }

interface Stang {
  a: Prop; gear: Gear; rpm: number; v: number; dustT: number; smokeT: number;
  wpos: THREE.Vector3; wvel: THREE.Vector3;
}

export interface BookendsHost { auto: boolean; sharedBase(): Airbase; ensureCss(): void }

export class FighterBookends {
  log: string[] = [];
  /** Dev / tests: -1 = from the damage, 0 normal, 1 dead-stick, 2 wheels-up. */
  forceSeverity = -1;
  private group: THREE.Group | null = null;
  private own: { geos: THREE.BufferGeometry[]; mats: THREE.Material[] } = { geos: [], mats: [] };
  private stangs: Stang[] = [];        // 0 player (Blue Two), 1 Blue Four, 2 Lead, 3 Blue Three, 4.. parked
  private bombers: Prop[] = [];
  private seq: 'none' | 'takeoff' | 'landing' = 'none';
  private t = 0;
  private shot = -1;
  private sev: 0 | 1 | 2 = 0;
  private armed: Mission | null = null;
  private resumeFor: Mission | null = null;
  private landFor: Mission | null = null;
  private landedFor: Mission | null = null;
  private mission: Mission | null = null;
  private onDone: (() => void) | null = null;
  private skipReq = false;
  private skipAt = -1;
  private snap = new CamSnapshot();
  private hidden: { el: HTMLElement; v: string }[] = [];
  private worldVis: { o: THREE.Object3D; v: boolean }[] = [];
  private weatherSaved: Weather | null = null;
  private tgtSaved: { w: number; gap: THREE.Vector4; glow: THREE.Vector4 } | null = null;
  private said = new Set<string>();
  private voices: FighterSound[] = [];
  private field = new FieldSounds();
  private look = new THREE.Vector3();
  private lookInit = false;
  private compiled = false;
  private mbSaved = -1;
  private down = false;         // landing: the player's ship is on the ground
  private downW = false;
  private stopA = 0;
  private ld = { a: 0, b: 0, y: 0, v: 0, pitch: 0, yaw: 0, roll: 0, sparkT: 0 };
  private root: HTMLElement | null = null;
  private els: Record<'tag' | 'cap' | 'hint' | 'sub' | 'fd', HTMLElement> | null = null;
  private fade = -1;
  private subT = 0;
  private readonly O: ParticleOpts = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 1, size0: 1, size1: 1, color0: C_DUST };

  constructor(private engine: Engine, private ui: UI, private game: Game, private host: BookendsHost) {}

  get active() { return this.seq !== 'none'; }
  get phase() { return this.seq; }
  get time() { return this.t; }
  get built() { return !!this.group; }

  /** P-51 escort missions of the campaign (m4, m7, m9 and any later ones); not co-op. */
  applies(m: Mission): boolean {
    return this.game.settings.bookends !== false && m.role === 'pilot' && /^m\d+$/.test(m.id) && !m.tutorial
      && Number.isFinite(m.duration) && !this.game.coop.role;
  }

  // ---------------- hooks (called by Bookends) ----------------

  prepare(m: Mission) {
    this.armed = this.applies(m) ? m : null;
    if (!this.armed) { if (this.seq === 'none') this.dispose(); return; }
    this.field.prepare();
    setTimeout(() => { if (this.seq === 'none' && this.armed === m && this.game.state === 'briefing') this.build(true); }, 300);
  }

  takeoff(m: Mission, resume: () => void): boolean {
    if (this.resumeFor === m) { this.resumeFor = null; this.landFor = m; return false; }
    if (this.seq !== 'none') this.abort();
    const ok = this.armed === m && !this.host.auto && this.applies(m);
    this.armed = null;
    if (!ok) { if (this.host.auto || this.landFor !== m) this.landFor = null; return false; }
    this.mission = m;
    this.onDone = resume;
    try { this.startTakeoff(); } catch (err) { console.warn('bookends: fighter take-off failed', err); this.cleanup(); return false; }
    return true;
  }

  landing(m: Mission, done: () => void): boolean {
    if (this.seq === 'landing') return true;
    if (this.landedFor === m) { this.landedFor = null; this.dispose(); return false; }
    if (this.seq !== 'none' || this.landFor !== m || this.host.auto || !this.applies(m)) return false;
    const pf = this.game.world.playerFighter;
    if (!pf || !pf.alive || pf.remove) return false;
    this.mission = m;
    this.onDone = done;
    try { this.startLanding(); } catch (err) { console.warn('bookends: fighter landing failed', err); this.cleanup(); return false; }
    return true;
  }

  /** Leaving the debrief or the mission (Bookends.release): nothing of ours is needed any more. */
  release() {
    if (this.seq !== 'none') return;
    this.landFor = null;
    this.dispose();
  }

  frame(dt: number): boolean {
    if (this.seq === 'none') return false;
    const g = this.game, e = this.engine;
    if ((this.seq === 'takeoff' && g.state !== 'briefing') || (this.seq === 'landing' && g.state !== 'ending')) { this.abort(); return false; }
    const real = Math.min(0.05, e.timeScale > 0 ? dt / e.timeScale : dt);
    if (real <= 0) return true;
    this.t += real;
    if (this.skipReq && this.skipAt < 0 && this.t > SKIP_AFTER) { this.skipAt = this.t; voice.stop(); sound.stopSpeech(); }
    this.skipReq = false;
    const len = this.seq === 'takeoff' ? F_TAKEOFF_LEN : F_LANDING_LEN;
    if (this.t >= len || (this.skipAt >= 0 && this.t - this.skipAt >= SKIP_FADE)) { this.finish(); return true; }
    this.voices.length = 0;
    if (this.seq === 'takeoff') this.updateTakeoff(real); else this.updateLanding(real);
    if (this.skipAt >= 0) this.setFade(Math.max(this.fade, (this.t - this.skipAt) / SKIP_FADE));
    g.world.effects.update(real);
    this.host.sharedBase().update(this.t);
    for (const s of this.stangs) if (s.a.root.visible) s.a.updateProps(real, s.rpm);
    for (const b of this.bombers) if (b.root.visible) b.updateProps(real, 0.8);
    sound.setListener(e.camera);
    sound.updateFighterVoices(this.voices);
    sound.updateWind(real);
    g.world.listener = e.camera.position;
    if (this.subT > 0 && (this.subT -= real) <= 0 && this.els) this.els.sub.innerHTML = '';
    return true;
  }

  // ---------------- build / dispose ----------------

  private build(compile: boolean) {
    const base = this.host.sharedBase();
    if (!this.group) {
      const t0 = performance.now();
      const grp = new THREE.Group();
      grp.name = 'bk_fighterStation';
      // Blue flight and three more Mustangs parked in their pens
      for (let i = 0; i < 7; i++) {
        const a = new Prop('p51d', 1.7);
        const gear = this.makeGear();
        a.model.add(gear.group);
        a.root.visible = false;
        grp.add(a.root);
        this.stangs.push({ a, gear, rpm: 0, v: 0, dustT: Math.random() * 0.1, smokeT: 0, wpos: new THREE.Vector3(), wvel: new THREE.Vector3() });
      }
      // the box of Fortresses at the rendezvous
      for (let i = 0; i < 6; i++) { const b = new Prop('b17', 1.77); b.root.visible = false; grp.add(b.root); this.bombers.push(b); }
      grp.add(this.makePens());
      this.group = grp;
      this.note(`built in ${Math.round(performance.now() - t0)} ms`);
    }
    if (this.group.parent !== base.group) base.group.add(this.group);
    if (compile && !this.compiled) this.compile(base);
  }

  private compile(base: Airbase) {
    const e = this.engine;
    this.compiled = true;
    const hiddenNow: THREE.Object3D[] = [];
    base.group.traverse((o) => { if (!o.visible) { hiddenNow.push(o); o.visible = true; } });
    const done = () => { for (const o of hiddenNow) if (this.seq === 'none' || o.userData.bkBeacon || !this.group?.getObjectById(o.id)) o.visible = false; };
    try {
      e.renderer.compileAsync(base.group, e.camera, e.scene).then(() => this.note('shaders compiled')).catch(() => {}).finally(done);
    } catch { done(); }
  }

  private dispose() {
    if (!this.group) return;
    this.group.removeFromParent();
    for (const g of this.own.geos) g.dispose();
    for (const m of this.own.mats) m.dispose();
    this.own = { geos: [], mats: [] };
    this.gearMats = null; this.gearGeos = null; this.pens = [];
    this.group = null;
    this.stangs = [];
    this.bombers = [];
    this.compiled = false;
    this.note('disposed');
  }

  private mat(color: number, rough: number, metal: number) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    this.own.mats.push(m);
    return m;
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T { this.own.geos.push(g); return g; }

  // Main legs fold inward into the wing roots, the tail wheel up into the fuselage
  private gearMats: { metal: THREE.Material; tyre: THREE.Material } | null = null;
  private gearGeos: Record<'strut' | 'wheel' | 'hub' | 'tStrut' | 'tWheel', THREE.BufferGeometry> | null = null;
  private makeGear(): Gear {
    this.gearMats ??= { metal: this.mat(0x8a8d88, 0.4, 0.75), tyre: this.mat(0x141414, 0.9, 0) };
    const W = 0.34, legLen = -P51_MAIN.y - 0.45 - W;
    this.gearGeos ??= {
      strut: this.geo(new THREE.CylinderGeometry(0.06, 0.075, legLen, 8).translate(0, -legLen / 2, 0)),
      wheel: this.geo(new THREE.CylinderGeometry(W, W, 0.2, 16).rotateZ(Math.PI / 2).translate(0, -legLen, 0)),
      hub: this.geo(new THREE.CylinderGeometry(0.15, 0.15, 0.22, 10).rotateZ(Math.PI / 2).translate(0, -legLen, 0)),
      tStrut: this.geo(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 6).translate(0, -0.1, 0.05)),
      tWheel: this.geo(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 12).rotateZ(Math.PI / 2).translate(0, -0.23, 0)),
    };
    const { metal, tyre } = this.gearMats, G = this.gearGeos;
    const group = new THREE.Group();
    group.name = 'bk_p51gear';
    const legs: THREE.Group[] = [];
    for (const x of [1.78, -1.78]) {
      const leg = new THREE.Group();
      leg.position.set(x, -0.45, P51_MAIN.z);
      leg.userData.side = Math.sign(x);
      for (const [g, m] of [[G.strut, metal], [G.wheel, tyre], [G.hub, metal]] as const) { const o = new THREE.Mesh(g, m); o.castShadow = true; leg.add(o); }
      group.add(leg);
      legs.push(leg);
    }
    const tail = new THREE.Group();
    tail.position.set(0, P51_TAIL.y + 0.38, P51_TAIL.z);
    for (const [g, m] of [[G.tStrut, metal], [G.tWheel, tyre]] as const) { const o = new THREE.Mesh(g, m); o.castShadow = true; tail.add(o); }
    group.add(tail);
    return {
      group,
      set(retract: number) {
        const k = THREE.MathUtils.clamp(retract, 0, 1);
        for (const l of legs) { l.rotation.z = -l.userData.side * k * 1.5; l.visible = k < 0.999; }
        tail.position.y = P51_TAIL.y + 0.38 + k * 0.32;
        tail.visible = k < 0.999;
      },
    };
  }

  // Earth blast pens (a U of banked earth) off the perimeter track near the runway 05 threshold
  private pens: { x: number; z: number; yaw: number }[] = [];
  private makePens(): THREE.Object3D {
    const g = new THREE.Group();
    const earth = this.mat(0x5d6a3c, 0.95, 0);
    const side = this.geo(new THREE.CylinderGeometry(1.2, 3.2, 2.2, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 5.2).translate(0, 1.1, 0));
    const back = this.geo(new THREE.CylinderGeometry(1.2, 3.2, 2.2, 4, 1).rotateY(Math.PI / 4).scale(5.4, 1, 1).translate(0, 1.1, 0));
    this.pens = [];
    for (const [a, b] of [[-1012, 62], [-984, 118], [-955, 174]] as [number, number][]) {
      afToLocal(a, b, _p);
      const yaw = afYaw(1, -0.5);
      const pen = new THREE.Group();
      pen.position.set(_p.x, 0, _p.z);
      pen.rotation.y = yaw;
      const l = new THREE.Mesh(side, earth); l.position.set(9.2, 0, -1);
      const r = new THREE.Mesh(side, earth); r.position.set(-9.2, 0, -1);
      const k = new THREE.Mesh(back, earth); k.position.set(0, 0, -9.5);
      for (const o of [l, r, k]) { o.receiveShadow = o.castShadow = true; pen.add(o); }
      g.add(pen);
      this.pens.push({ x: _p.x, z: _p.z, yaw });
    }
    return g;
  }

  // ---------------- take-off ----------------

  private startTakeoff() {
    this.build(!this.compiled);
    this.field.prepare();
    const e = this.engine, w = this.game.world, base = this.host.sharedBase();
    this.begin('takeoff');
    this.ui.hideAll();
    this.hideWorld();
    w.effects.clear();
    w.contrails.clear();
    this.weatherSaved = this.currentWeather();
    const mood = this.mission?.weather?.mood;
    applyWeather(e, { ...(mood === 'night' || mood === 'dusk' ? DUSK : MORNING), preset: this.mission?.weather?.preset, wind: this.mission?.weather?.wind });
    base.group.position.set(0, 0, 0);
    base.show(e.scene, true);
    base.resetVehicles();
    for (const s of this.stangs) { s.a.root.visible = false; s.gear.set(0); s.rpm = 0; }
    this.parkPens();
    this.overlay(true, FIGHTER_TEXT.takeoff);
    this.setFade(1);
  }

  private parkPens() {
    this.pens.forEach((p, i) => {
      const s = this.stangs[4 + i];
      if (!s) return;
      s.a.root.visible = true; s.gear.set(0); s.rpm = 0;
      // backed into the pen, nose out toward the track
      this.place(s.a, p.x - Math.sin(p.yaw) * 3, wheelsY(P51_3PT), p.z - Math.cos(p.yaw) * 3, p.yaw, P51_3PT, 0);
    });
  }

  // A Mustang taxiing along DEPART at arc length s, S-turning (phase ph) so the pilot can see past the nose
  private taxiPose(s: Stang, at: number, t: number, ph: number) {
    const amp = 2.4, per = 5.5, sp = 4.6;
    const sAt = at + sp * t;
    DEPART.at(sAt, _2, _2d);
    const w = (2 * Math.PI) / per;
    const off = amp * Math.sin(w * t + ph);
    const dOff = amp * w * Math.cos(w * t + ph) / sp;        // lateral drift per metre along
    const nx = _2d.y, nz = -_2d.x;                           // left of the path
    const yaw = Math.atan2(_2d.x, _2d.y) + Math.atan(dOff);
    this.place(s.a, _2.x + nx * off, wheelsY(P51_3PT), _2.y + nz * off, yaw, P51_3PT, 0);
    s.v = sp; s.rpm = 0.36;
    s.gear.set(0);
  }

  // The take-off roll from A0 at story time u (brakes off at u = 0); b: lateral station on the runway
  private rollPose(s: Stang, u: number, b: number, lag: number) {
    u = Math.max(0, u - lag);
    const tlo = VLO / ACC;
    let a: number, v: number, alt = 0, pitch: number;
    if (u < tlo) {
      v = ACC * u; a = A0 + 0.5 * ACC * u * u;
      pitch = P51_3PT * (1 - smooth(12, 26, v)) + 0.06 * smooth(VLO - 8, VLO, v);
    } else {
      const d = u - tlo;
      v = Math.min(70, VLO + 3 * d); a = A0 + 0.5 * ACC * tlo * tlo + VLO * d + 1.5 * d * d;
      alt = 0.5 * 3.2 * d * d + 0.6 * d;
      pitch = 0.06 + 0.06 * smooth(0, 1.5, d);
    }
    afToLocal(a, b, _p, wheelsY(pitch) + alt);
    this.place(s.a, _p.x, _p.y, _p.z, Math.atan2(DIR.x, DIR.z), pitch, 0);
    s.v = v; s.rpm = u > 0 ? 1 : 0.5;
    s.gear.set(smooth(tlo + 1.2, tlo + 3.4, u));
    return alt;
  }

  private updateTakeoff(dt: number) {
    const t = this.t, e = this.engine, cam = e.camera, g = this.host.sharedBase().group.position;
    const shot = t < 5 ? 0 : t < 11.8 ? 1 : t < 15 ? 2 : 3;
    const cut = shot !== this.shot;
    if (cut) { this.shot = shot; this.lookInit = false; e.post.resetHistory(); this.note(`shot F${shot + 1} at ${t.toFixed(2)}`); }
    const [P, W, L, T3] = this.stangs;
    this.setFade(t < 0.9 ? 1 - t / 0.9 : t > F_TAKEOFF_LEN - 1.1 ? (t - (F_TAKEOFF_LEN - 1.1)) / 1.1 : 0);
    this.caption(t > 0.6 && t < 4.6);
    for (const s of [P, W, L, T3]) s.a.root.visible = shot < 3;
    for (const b of this.bombers) b.root.visible = shot === 3;
    for (let i = 4; i < this.stangs.length; i++) this.stangs[i].a.root.visible = shot < 3;
    if (shot === 0) {
      // the taxiway: the player's Mustang S-turning toward a low camera, Blue Four behind;
      // Lead and Blue Three rolling on the runway in the distance
      this.taxiPose(P, HOLD_S - 150, t, 0);
      this.taxiPose(W, HOLD_S - 186, t, 1.9);
      this.rollPose(L, t - 0.5, 8, 0);
      this.rollPose(T3, t - 0.5, -8, 0.4);
      DEPART.at(HOLD_S - 112, _2, _2d);
      cam.position.set(_2.x - _2d.y * 26, 1.4, _2.y + _2d.x * 26).add(g);
      this.aim(_q.copy(P.a.root.position).add(g).addScaledVector(UP, 1.2), dt, 4);
      cineLens(e, 34 - 4 * smooth(0, 5, t));
      this.groundFx([P, W], false, dt);
      this.groundFx([L, T3], true, dt);
      this.engine1(L, 902); this.engine1(T3, 903);
    } else if (shot === 1) {
      // the pair's take-off roll past a low camera on the runway edge; tails up, dust, lift-off
      const u = t - 5 + 1.2;
      L.a.root.visible = T3.a.root.visible = false;
      this.rollPose(P, u, 7, 0);
      this.rollPose(W, u, -7, 0.35);
      afToLocal(A0 + 150, -30, cam.position, 1.3).add(g);
      _q.copy(P.a.root.position).lerp(W.a.root.position, 0.5).add(g).addScaledVector(UP, 1);
      this.aim(_q, dt, 6);
      cineLens(e, 30 + 18 * smooth(3, 6.5, u));
      this.groundFx([P, W], true, dt);
    } else if (shot === 2) {
      // gear up: tracking off the player's left quarter, low over the field, then the pull-up
      const u = t - 11.8 + 7.4;
      L.a.root.visible = T3.a.root.visible = false;
      const alt = this.rollPose(P, u, 7, 0);
      this.rollPose(W, u, -7, 0.35);
      // the climb steepens: lift the pair
      const k = smooth(13.2, 15, t);
      for (const s of [P, W]) { s.a.root.position.y += 40 * k * k; _e.setFromQuaternion(s.a.root.quaternion, 'YXZ'); _e.x -= 0.25 * k; s.a.root.quaternion.setFromEuler(_e); s.a.root.updateMatrixWorld(true); }
      cam.position.copy(P.a.root.position).addScaledVector(DIR, -26 + (t - 11.8) * 1.5).addScaledVector(LEFT, 13).addScaledVector(UP, 1.2 - alt * 0.1).add(g);
      this.aim(_q.copy(P.a.root.position).add(g).addScaledVector(DIR, 3), dt, 10, cut);
      cineLens(e, 50);
      this.groundFx([P, W], true, dt);
    } else {
      // the rendezvous: the pair climbs up to the bomber stream above the overcast
      const u = t - 15;
      const y = cloudTops() + 900;
      afToLocal(30000 + CRUISE * u, 0, _p, y);
      const yaw = Math.atan2(DIR.x, DIR.z);
      const box = [[0, 0, 0], [30, -8, -32], [-30, -8, -32], [0, -18, -64], [60, -16, -60], [-60, -16, -60]];
      this.bombers.forEach((b, i) => {
        const s = box[i];
        _q.copy(_p).addScaledVector(LEFT, s[0] - 40).addScaledVector(UP, s[1] - 60).addScaledVector(DIR, s[2] + 260);
        _q.y += Math.sin(u * 0.8 + i) * 0.6;
        this.place(b, _q.x, _q.y, _q.z, yaw, Math.sin(u * 0.5 + i) * 0.01, Math.sin(u * 0.4 + i * 1.3) * 0.02);
      });
      const k = 1 - smooth(0, 3.4, u);
      P.a.root.visible = W.a.root.visible = true;
      P.gear.set(1); W.gear.set(1); P.rpm = W.rpm = 1; P.v = W.v = CRUISE;
      for (const [s, off] of [[P, 0], [W, 1]] as [Stang, number][]) {
        _q.copy(_p).addScaledVector(LEFT, -off * 14).addScaledVector(UP, -off * 3 - 70 * k).addScaledVector(DIR, -off * 10 - 40 * k);
        this.place(s.a, _q.x, _q.y, _q.z, yaw + 0.05 * Math.sin(u), 0.12 * k + 0.02, -0.12 * k * (off ? 0.6 : 1));
      }
      cam.position.copy(P.a.root.position).addScaledVector(DIR, -34).addScaledVector(LEFT, 9).addScaledVector(UP, 7 - u * 0.5).add(g);
      this.aim(_q.copy(P.a.root.position).lerp(this.bombers[0].root.position, 0.4).add(g), dt, 4, cut);
      cineLens(e, 50);
    }
    // radio
    this.say('clear', t >= 1.2);
    this.say('ack', t >= 6.3);
    this.say('rv', t >= 15.4);
    this.engine1(P, 900);
    this.engine1(W, 901);
  }

  // ---------------- landing ----------------

  private startLanding() {
    this.build(!this.compiled);
    this.field.prepare();
    const e = this.engine, w = this.game.world, base = this.host.sharedBase();
    this.begin('landing');
    e.timeScale = 1;
    this.sev = this.severity();
    this.note(`landing, severity ${this.sev}`);
    this.hideWorld();
    w.effects.clear();
    this.tgtSaved = { w: targetUniforms.uTgt.value.w, gap: cloudTargetUniforms.uGap.value.clone(), glow: cloudTargetUniforms.uGlow.value.clone() };
    targetUniforms.uTgt.value.w = 0; cloudTargetUniforms.uGap.value.set(0, 0, 0, 0); cloudTargetUniforms.uGlow.value.set(0, 0, 1, 0);
    this.weatherSaved = null;
    base.group.position.set(Math.round(e.camera.position.x), 0, Math.round(e.camera.position.z));
    base.show(e.scene, true);
    base.resetVehicles();
    for (const s of this.stangs) { s.a.root.visible = false; s.gear.set(0); s.rpm = 0; }
    for (const b of this.bombers) b.root.visible = false;
    this.parkPens();
    this.down = this.downW = false;
    const decel = this.sev === 2 ? 7 : 4.2;
    this.stopA = A_TD + (V_APP - 4) ** 2 / (2 * decel);
    sound.setMode('menu');
    this.overlay(true, FIGHTER_TEXT.landing);
    this.setFade(1);
  }

  private severity(): 0 | 1 | 2 {
    if (this.forceSeverity >= 0) return Math.min(2, this.forceSeverity) as 0 | 1 | 2;
    const f = this.game.world.playerFighter;
    if (!f) return 0;
    const eng = f.zone('engine');
    const ef = eng ? Math.max(0, eng.hp) / eng.maxHp : 1;
    const integ = Math.min(f.integrity, f.structureFrac);
    if (integ < 0.45 || (ef <= 0 && integ < 0.7)) return 2;
    if (ef < 0.35 || integ < 0.62) return 1;
    return 0;
  }

  // The pair in the run-in and the break (sev 0): echelon right along the runway at 150 m, breaking
  // left one after the other into a climbing 180 onto the downwind leg
  private breakPose(s: Stang, u: number, k: number) {
    const V = 105, tb = 1.8 + k * 1.6, d = Math.max(0, u - tb);
    afToLocal(-700 + V * u, -k * 16, _p, 150 - k * 4);
    let yaw = Math.atan2(DIR.x, DIR.z), roll = 0, pitch = 0;
    if (d > 0) {
      const om = 0.62 * smooth(0, 0.7, d);
      const ang = Math.min(Math.PI, 0.62 * (d - 0.35 * (1 - Math.exp(-d / 0.35))));
      const rad = V / 0.62;
      _p.addScaledVector(LEFT, rad * (1 - Math.cos(ang))).addScaledVector(DIR, rad * Math.sin(ang) - V * d).addScaledVector(UP, 45 * smooth(0, 3, d));
      yaw += ang;
      roll = -1.25 * (om / 0.62);
      pitch = 0.08 * smooth(0, 0.6, d);
    }
    this.place(s.a, _p.x, _p.y, _p.z, yaw, pitch, roll);
    s.v = V; s.rpm = d > 0 ? 0.45 : 0.75;
  }

  // Final approach (curving in from the downwind side unless straight-in), touchdown and roll-out
  // for one Mustang, x = seconds before touchdown (negative after it)
  private finalPose(s: Stang, x: number, curve: boolean, belly: boolean, bOff: number) {
    let a: number, b: number, y: number, pitch: number, yaw = Math.atan2(DIR.x, DIR.z), roll = 0, v: number;
    if (x > 0) {
      v = V_APP + 2 * x;
      a = A_TD - V_APP * x - x * x;
      const cb = curve ? 8 * x * x : 0;
      b = bOff + cb;
      y = (belly ? BELLY_Y : wheelsY(0.02)) + 1.3 * x * x + 0.6 * x;
      pitch = belly ? 0.06 : 0.04 + 0.03 * smooth(1.5, 0, x);
      if (curve) {
        const db = 16 * x;                                   // cross-track closure (m/s)
        yaw = afYaw(V_APP, -db);
        roll = -0.9 * smooth(0.3, 2.2, x);
      }
    } else {
      const u = -x, dec = belly ? 7 : 4.2;
      const tStop = (V_APP - 4) / dec;
      const uu = Math.min(u, tStop);
      v = Math.max(0, V_APP - 4 - dec * uu);
      a = A_TD + (V_APP - 4) * uu - 0.5 * dec * uu * uu;
      b = bOff + (belly ? 6 * smooth(0, tStop, uu) : 0);
      if (belly) { pitch = 0.05 - 0.02 * smooth(0, 1, u); y = BELLY_Y; yaw += 0.25 * smooth(0.5, tStop, uu); roll = 0.05 * smooth(0, 2, u); }
      else {
        // wheel landing: tail up, then down as she slows
        pitch = 0.02 + (P51_3PT - 0.02) * smooth(0.8, 3.2, u);
        y = wheelsY(pitch) + Math.max(0, 0.18 - u * 0.6) * (u < 0.3 ? 1 : 0);
      }
    }
    afToLocal(a, b, _p, y);
    this.place(s.a, _p.x, _p.y, _p.z, yaw, pitch, roll);
    s.v = v;
    return a;
  }

  private updateLanding(dt: number) {
    const t = this.t, e = this.engine, cam = e.camera, g = this.host.sharedBase().group.position;
    const [P, W] = this.stangs;
    const sev = this.sev;
    const shot = t < 5.5 ? 0 : t < 10.2 ? 1 : 2;
    const cut = shot !== this.shot;
    if (cut) { this.shot = shot; this.lookInit = false; e.post.resetHistory(); this.note(`shot FL${shot + 1} at ${t.toFixed(2)}`); }
    this.setFade(t < 0.8 ? 1 - t / 0.8 : t > F_LANDING_LEN - 1.1 ? (t - (F_LANDING_LEN - 1.1)) / 1.1 : 0);
    this.caption(t > 0.5 && t < 4.3);
    P.a.root.visible = true;
    W.a.root.visible = sev === 0 || shot === 0;
    const belly = sev === 2;
    P.rpm = sev >= 1 ? 0.12 : P.rpm;
    W.rpm = 0.6;
    if (shot === 0) {
      if (sev === 0) {
        this.breakPose(P, t, 0);
        this.breakPose(W, t, 1);
        P.gear.set(1 - smooth(3.5, 5, t)); W.gear.set(1 - smooth(5, 6.5, t));
        afToLocal(-260, -150, cam.position, 1.8).add(g);
        this.aim(_q.copy(P.a.root.position).lerp(W.a.root.position, 0.35).add(g).addScaledVector(UP, -12), dt, 3, cut);
        cineLens(e, 36);
        this.say('breakL', t >= 0.6);
        this.say('land', t >= 3.8);
      } else {
        // dead-stick: gliding in over the trees, smoke trailing, Blue Four on the wing
        afToLocal(-3200 + 62 * t, 30, _p, 260 - 18 * t);
        const yaw = Math.atan2(DIR.x, DIR.z);
        this.place(P.a, _p.x, _p.y, _p.z, yaw, 0.03, Math.sin(t * 0.7) * 0.05);
        _q.copy(_p).addScaledVector(LEFT, -16).addScaledVector(DIR, -12).addScaledVector(UP, 4);
        this.place(W.a, _q.x, _q.y, _q.z, yaw, 0.03, Math.sin(t * 0.6 + 1) * 0.04);
        P.v = W.v = 62;
        P.gear.set(belly ? 1 : 1 - smooth(2.5, 4.5, t)); W.gear.set(1);
        cam.position.copy(_p).addScaledVector(DIR, 26 - t * 4).addScaledVector(LEFT, 14).addScaledVector(UP, 3).add(g);
        this.aim(_q.copy(_p).add(g), dt, 8, cut);
        cineLens(e, 44);
        this.say(belly ? 'wheelsUp' : 'deadstick', t >= 0.6);
        if (belly) this.say('crash', t >= 3.6);
      }
    } else {
      const x = T_TD - (t - 5.5);
      const curve = sev === 0;
      if (cut) { P.gear.set(belly ? 1 : 0); W.gear.set(0); }
      const a = this.finalPose(P, x, curve, belly, 0);
      if (sev === 0) this.finalPose(W, x + 3.4, curve, false, -1);
      if (x <= 0 && !this.down) { this.down = true; this.touchdown(P, belly); }
      if (sev === 0 && x + 3.4 <= 0 && !this.downW) { this.downW = true; this.touchdown(W, false); }
      if (belly && this.down) this.scrape(P, dt);
      if (shot === 1) {
        afToLocal(A_TD + 70, -34, cam.position, 1.4).add(g);
        this.aim(_q.copy(P.a.root.position).add(g).addScaledVector(UP, 0.6), dt, 5, cut);
        cineLens(e, 30 + 18 * smooth(1.5, 4.4, t - 5.5));
      } else if (belly) {
        afToLocal(this.stopA + 45, 30, cam.position, 4.5 - (t - 10.2) * 0.3).add(g);
        this.aim(_q.copy(P.a.root.position).add(g).addScaledVector(UP, 0.5), dt, 3, cut);
        cineLens(e, 40);
      } else {
        _p.copy(P.a.root.position);
        afToLocal(Math.max(a - 34, A_TD - 30), 14, cam.position, 2.6).add(g);
        this.aim(_q.copy(_p).add(g).addScaledVector(UP, 0.8), dt, 5, cut);
        cineLens(e, 44);
        this.say('home', t >= 11);
      }
      if (sev >= 1 && x < 0.5) this.driveVehicles(t - 5.5 - T_TD + 0.5, dt);
      if (sev === 0) { P.rpm = x > 0 ? 0.42 : Math.max(0.3, 0.42 - (-x) * 0.03); }
      this.groundFx([P, W].filter((s) => s.a.root.position.y - g.y < 2 && s.v > 6 && !(belly && s === P)), false, dt);
    }
    if (sev >= 1) this.smokeTrail(P, dt);
    if (sev === 0 || P !== this.stangs[0]) this.engine1(P, 900); else if (P.rpm > 0.2) this.engine1(P, 900);
    this.engine1(W, 901);
  }

  private touchdown(s: Stang, belly: boolean) {
    const fx = this.game.world.effects, O = this.O, pos = s.a.root.position;
    this.field.touchdown(pos, belly);
    if (belly) return;
    for (const x of [1.78, -1.78]) {
      s.a.root.localToWorld(_p.set(x, P51_MAIN.y + 0.2, P51_MAIN.z));
      for (let i = 0; i < 4; i++) {
        (O.vel as THREE.Vector3).set(R() * 1.5, 0.6 + Math.random(), R() * 1.5);
        O.pos = _p; O.life = 1.2; O.size0 = 0.4; O.size1 = 2.6; O.color0 = C_TYRE; O.color1 = C_DUST1; O.alpha0 = 0.4; O.alpha1 = 0;
        O.frame = 0; O.drag = 2.2; O.rise = 0.4; O.lit = true; O.rotVel = R();
        fx.smoke.spawn(O);
      }
    }
  }

  // Belly slide: sparks off the radiator scoop and wing roots, a spray of earth and dust
  private scrape(s: Stang, dt: number) {
    const fx = this.game.world.effects, O = this.O, ld = this.ld;
    s.a.root.getWorldDirection(_w).multiplyScalar(s.v);
    this.field.scrape(s.a.root.position, _w, s.v);
    if (s.v < 1) return;
    ld.sparkT -= dt;
    if (ld.sparkT <= 0) {
      ld.sparkT = 0.03;
      for (let i = 0; i < 2; i++) {
        s.a.root.localToWorld(_p.set(R() * 2.2, -0.9, -1 + R() * 2));
        _v.copy(_w).multiplyScalar(0.4).add(_q.set(R() * 4, 1 + Math.random() * 3, R() * 4));
        fx.sparks(_p, _v, Math.random() < 0.15);
      }
      if (fx.smoke.count < 7600) {
        s.a.root.localToWorld(_p.set(R() * 2, -0.6, -2 - Math.random() * 2));
        (O.vel as THREE.Vector3).copy(_w).multiplyScalar(0.3).add(_v.set(R() * 4, 1.2 + Math.random() * 2, R() * 4));
        O.pos = _p; O.life = 2 + Math.random(); O.size0 = 1.4; O.size1 = 7 + Math.random() * 4; O.color0 = C_DUST; O.color1 = C_DUST1;
        O.alpha0 = 0.3 * Math.min(1, s.v / 20) + 0.06; O.alpha1 = 0; O.frame = 0; O.drag = 1.1; O.rise = 0.6; O.lit = true; O.rotVel = R() * 0.5;
        fx.smoke.spawn(O);
      }
    }
  }

  private smokeTrail(s: Stang, dt: number) {
    const fx = this.game.world.effects, O = this.O;
    s.smokeT -= dt;
    if (s.smokeT > 0 || fx.smoke.count > 7400) return;
    s.smokeT = 0.05;
    s.a.root.localToWorld(_p.set(R() * 0.2, -0.3, 1.2));
    (O.vel as THREE.Vector3).set(R(), 0.8, R());   // left behind in the air
    O.pos = _p; O.life = 2.6; O.size0 = 0.8; O.size1 = 6; O.color0 = C_SMOKE; O.color1 = C_SMOKE1; O.alpha0 = 0.5; O.alpha1 = 0;
    O.frame = 0; O.drag = 0.7; O.rise = 0.6; O.lit = true; O.rotVel = R() * 0.5;
    fx.smoke.spawn(O);
  }

  // The fire tender, crash truck and an ambulance race to where she stops (u: s since touchdown)
  private driveVehicles(u: number, dt: number) {
    const base = this.host.sharedBase(), g = base.group.position;
    afToLocal(this.stopA, 8, _w);
    let i = 0;
    for (const v of base.vehicles as Vehicle[]) {
      if (v.kind === 'jeep') continue;
      const start = 0.2 + i * 0.5, idx = i++;
      if (u < start) continue;
      _q.copy(_w).addScaledVector(LEFT, 12 + idx * 7).addScaledVector(DIR, -idx * 6);
      const d = _p.copy(_q).sub(v.obj.position).setY(0);
      const dist = d.length();
      const sp = dist > 14 ? 16 : Math.max(0, dist - 2);
      if (dist > 0.5) {
        d.normalize();
        v.obj.position.addScaledVector(d, Math.min(dist, sp * dt));
        v.obj.rotation.y = Math.atan2(d.x, d.z);
      }
      for (const b of v.beacons) b.visible = true;
      _v.copy(d).multiplyScalar(sp);
      _p.copy(v.obj.position).add(g);
      this.field.vehicle(v, v.kind as CrewVehicle, _p, _v, sp, dt);
    }
  }

  // Prop wash and wheel dust behind the Mustangs on the ground
  private groundFx(list: Stang[], strong: boolean, dt: number) {
    const fx = this.game.world.effects, O = this.O, g = this.host.sharedBase().group.position;
    if (fx.smoke.count > 7000) return;
    for (const s of list) {
      const alt = s.a.root.position.y - wheelsY(0.1);
      if (alt > 10 || s.v < 1.5) continue;
      s.dustT -= dt;
      if (s.dustT > 0) continue;
      s.dustT = strong ? 0.04 : 0.22;
      for (const x of strong ? [2.4, 0, -2.4] : [1.6, -1.6]) {
        s.a.root.localToWorld(_p.set(x + R() * 0.6, 0, -2 - Math.random() * 2.5));
        _p.y = g.y + 0.5 + Math.random() * 0.5;
        s.a.root.getWorldDirection(_w).negate().setY(0).normalize();
        (O.vel as THREE.Vector3).copy(_w).multiplyScalar((strong ? 16 : 6) + Math.random() * 6).add(_v.set(R() * 3, 0.6 + Math.random(), R() * 3));
        O.pos = _p; O.life = strong ? 1.5 + Math.random() : 1.1; O.size0 = strong ? 1.2 : 0.6; O.size1 = strong ? 7 + Math.random() * 4 : 3;
        O.color0 = C_DUST; O.color1 = C_DUST1; O.alpha0 = (strong ? 0.2 : 0.1) * Math.max(0, 1 - alt / 10); O.alpha1 = 0; O.frame = 0; O.drag = 1.4; O.rise = 0.5; O.lit = true; O.rotVel = R() * 0.6;
        fx.smoke.spawn(O);
      }
    }
  }

  // ---------------- shared ----------------

  private place(a: Aircraft, x: number, y: number, z: number, yaw: number, pitch: number, roll: number) {
    a.root.position.set(x, y, z);
    _e.set(-pitch, yaw, roll);
    a.root.quaternion.setFromEuler(_e);
    a.root.updateMatrixWorld(true);
  }

  private engine1(s: Stang, id: number) {
    if (!s.a.root.visible || s.rpm < 0.05) return;
    s.wpos.setFromMatrixPosition(s.a.root.matrixWorld);
    s.a.root.getWorldDirection(s.wvel).multiplyScalar(s.v);
    this.voices.push({ id, pos: s.wpos, vel: s.wvel, radial: false, throttle: s.rpm, stage: 0, type: 'p51d' });
  }

  private begin(seq: 'takeoff' | 'landing') {
    this.seq = seq;
    this.t = 0; this.shot = -1;
    this.skipReq = false; this.skipAt = -1;
    this.said.clear(); this.voices.length = 0; this.log = [];
    this.lookInit = false;
    this.fade = -1;
    this.snap.capture(this.engine);
    this.mbSaved = this.engine.post.motionBlur;
    this.engine.post.motionBlur = 0.2;
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
    else if (seq === 'landing') { this.landedFor = m; this.landFor = null; }
    this.onDone = null;
    cb?.();
  }

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
    for (const { o, v } of this.worldVis) o.visible = v;
    this.worldVis = [];
    this.voices.length = 0;
    sound.updateFighterVoices([]);
    this.field.stopAll(seq === 'landing' ? 0.6 : 0.3);
    if (this.weatherSaved) { applyWeather(e, this.weatherSaved); this.weatherSaved = null; }
    if (this.tgtSaved) {
      targetUniforms.uTgt.value.w = this.tgtSaved.w;
      cloudTargetUniforms.uGap.value.copy(this.tgtSaved.gap); cloudTargetUniforms.uGlow.value.copy(this.tgtSaved.glow);
      this.tgtSaved = null;
    }
    const base = this.host.sharedBase();
    base.show(e.scene, false);
    base.resetVehicles();
    for (const s of this.stangs) s.a.root.visible = false;
    for (const b of this.bombers) b.root.visible = false;
    if (seq !== 'none') w.effects.clear();
    e.post.resetHistory();
    if (seq === 'landing') this.dispose();
  }

  private hideWorld() {
    this.worldVis = [];
    for (const a of this.game.world.aircraft) { this.worldVis.push({ o: a.root, v: a.root.visible }); a.root.visible = false; }
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

  private aim(target: THREE.Vector3, dt: number, k: number, snap = false) {
    if (!this.lookInit || snap) { this.look.copy(target); this.lookInit = true; }
    else this.look.lerp(target, 1 - Math.exp(-k * dt));
    const cam = this.engine.camera;
    _m.lookAt(cam.position, this.look, UP);
    _qt.setFromRotationMatrix(_m);
    cam.quaternion.copy(_qt);
  }

  private say(key: RadioKey, when: boolean) {
    if (!when || this.said.has(key) || this.skipAt >= 0) return;
    this.said.add(key);
    const [who, text] = FIGHTER_RADIO[key];
    const recorded = voice.sayLine(who, text, 3);
    if (!recorded) sound.radioStatic();
    setTimeout(() => {
      if (this.seq === 'none') return;
      this.subtitle(who, text);
      if (!recorded) sound.speak(text, 7);
    }, INTERPHONE_LEAD_S * 1000);
    this.note(`radio ${key}`);
  }

  // ---------------- overlay (the same letterbox as the B-17 scenes: #bkCine, Bookends' CSS) ----------------

  private ensureDom() {
    if (this.root?.isConnected) return;
    this.host.ensureCss();
    const r = document.createElement('div');
    r.id = 'bkCine';
    r.className = 'fighter';
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
    els.tag.textContent = tx(FIGHTER_TEXT.tag);
    els.cap.textContent = tx(caption);
    els.hint.textContent = tx('CLICK TO SKIP');
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
    this.els.sub.innerHTML = `<div class="line"><span class="who">${esc(tx(who))}</span>${esc(tx(text))}</div>`;
    this.subT = 2.6 + text.length * 0.045;
  }

  private note(s: string) { this.log.push(`${this.t.toFixed(2)} ${s}`); if (this.log.length > 80) this.log.shift(); }
}
