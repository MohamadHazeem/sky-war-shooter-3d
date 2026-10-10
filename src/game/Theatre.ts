import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Input } from '../core/Input';
import type { UI } from '../ui/UI';
import type { Game } from './Game';
import type { Aircraft } from '../world/Aircraft';
import { Ballistics } from '../world/Ballistics';
import { instantiate, type ModelKind } from '../world/Models';
import { Atmos } from '../render/Atmosphere';
import { CamSnapshot, HudHider, ModelReveal } from './CineShared';
import { GUNNER_HIDDEN } from './PhotoMode';
import {
  Recorder, type ClipData, type EntityMeta, findFrame, samplePose, sampleCamera, sliceClip, markLabel,
  MAX_ENT, GUN_SLOTS, F_ALIVE, F_FIRE, stageOf, EV_KILL, EV_EXPLOSION, EV_FLAK, MK_KILL,
} from './Recorder';
import { tx } from '../i18n';
import { TheatreScreen, SPEEDS, MODE_ORDER, type CamMode, type PhotoSettings, type TheatreControl, type TimelineMark, type AircraftItem, type MomentItem } from '../ui/TheatreScreen';
import type { TheatreAxes, TheatrePad } from '../core/Gamepad';

// Replay theatre (Phase 5 goal 16).
//
// Recording: Recorder.ts keeps the last 90 s of the mission (12 Hz keyframes, events and
// best-moment marks). Theatre wraps two world entry points once, so World.ts needs no
// hooks: Effects.explosion / Effects.flak (explosion and big FX events) and Ballistics.fire
// (the player's rounds -> gun slots); kills are seen by the recorder itself (an aircraft
// that stops being alive). The wrappers only record while a mission is in play.
//
// Playback: opening the theatre takes over engine.onFrame, so Game.frame (and with it the
// whole simulation) stops while it is open; on exit the previous frame callback, camera,
// lens, post settings, HUD, hidden layers and the live player's transform are restored and
// the debriefing (or the title menu) comes back. Nothing is re-simulated: proxies (model
// clones) are posed from the interpolated keyframes, explosions/flak are replayed from
// events, damage smoke comes from the recorded damage stage, and the player's tracers are
// re-synthesised from the gun slots into a private Ballistics (no hit tests).
//
// Saved moments: 15 s around the playhead, up to 5, in IndexedDB (MomentStore); the title
// menu gets a "Theatre" entry that lists and plays them.

const MAX_SAVED = 5;
const MOMENT_BEFORE = 10, MOMENT_AFTER = 5;
const UP = new THREE.Vector3(0, 1, 0);
const FREE_SPEED = 40;     // m/s, Shift x5
const EMPTY: Aircraft[] = [];

const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _col: [number, number, number] = [9, 2.6, 0.9];

interface Proxy {
  id: number;
  meta: EntityMeta;
  root: THREE.Object3D;
  model: THREE.Object3D | null;   // own clone (null: the live player's aircraft)
  live: boolean;
  present: boolean;
  flags: number;
  hint: number;
  vel: THREE.Vector3;
  trailT: number;
}

const enum Shot { Chase, Flyby, Pov, Orbit, Victim }

export interface SavedMoment { key?: number; title: string; created: number; duration: number; thumb: string; clip: ClipData }

// ---------------- IndexedDB store ----------------

export class MomentStore {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!this.db) {
      this.db = new Promise((res, rej) => {
        const r = indexedDB.open('sws-theatre', 1);
        r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('moments')) r.result.createObjectStore('moments', { keyPath: 'key', autoIncrement: true }); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => { this.db = null; rej(r.error); };
      });
    }
    return this.db;
  }

  private async req<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('moments', mode);
      const r = f(tx.objectStore('moments'));
      tx.oncomplete = () => res(r.result);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  }

  async list(): Promise<SavedMoment[]> {
    const all = await this.req('readonly', (s) => s.getAll() as IDBRequest<SavedMoment[]>);
    return all.sort((a, b) => b.created - a.created);
  }
  count() { return this.req('readonly', (s) => s.count()); }
  get(key: number) { return this.req('readonly', (s) => s.get(key) as IDBRequest<SavedMoment | undefined>); }
  async add(m: SavedMoment): Promise<number | null> {
    if ((await this.count()) >= MAX_SAVED) return null;
    return this.req('readwrite', (s) => s.add(m) as IDBRequest<number>);
  }
  remove(key: number) { return this.req('readwrite', (s) => s.delete(key)); }
}

// ---------------- theatre ----------------

export class Theatre implements TheatreControl, TheatrePad {
  readonly rec = new Recorder();
  readonly store = new MomentStore();
  private screen = new TheatreScreen();
  active = false;
  private clip: ClipData | null = null;
  private liveMode = false;
  private base = new THREE.Vector3();       // playback frame: scene = absolute - base
  // TheatreControl state
  t = 0; t0 = 0; t1 = 0;
  playing = true;
  speed = 1;
  mode: CamMode = 'director';
  orbitId = -1;
  photo: PhotoSettings = { fov: 0, dof: 0, focus: 60, exposure: 1, res: 1 };
  title = '';
  // playback
  private prevT = 0;
  private jumped = true;
  private proxies: Proxy[] = [];
  private byId = new Map<number, Proxy>();
  private player: Proxy | null = null;
  private evIdx = 0;
  private killBoom: Uint8Array = new Uint8Array(0);
  private gAcc = new Float32Array(GUN_SLOTS);
  private tracers = new Ballistics(1500);
  private fxExplosion: ((p: THREE.Vector3, v: THREE.Vector3, s?: number) => void) | null = null;
  private fxFlak: ((p: THREE.Vector3) => void) | null = null;
  // restore state
  private savedFrame: ((dt: number, time: number) => void) | undefined;
  private savedPaused = false;
  private savedScale = 1;
  private snap = new CamSnapshot();
  private hud = new HudHider();
  private reveal = new ModelReveal();
  private povHidden: THREE.Object3D[] = [];
  private pov: boolean | null = null;   // null: not applied yet (first setPov always runs)
  private pdt = 0;
  private hiddenObjs: THREE.Object3D[] = [];
  private shownLayers: Element[] = [];
  private livePose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  private post = { exposure: 1, motionBlur: 0, damageFlash: 0, desat: 0, flash: 0, zoomPulse: 0 };
  private fromLibrary = false;
  // cameras
  private orbit = { yaw: 0.6, pitch: 0.18, dist: 0 };
  private free = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, vel: new THREE.Vector3(), mul: 1 };
  private dir = { kind: Shot.Chase, subject: -1, start: -1, end: -1, side: 1, seq: 0, anchor: new THREE.Vector3(), cam: new THREE.Vector3(), look: new THREE.Vector3(), cut: true };
  private keys = new Set<string>();
  private drag: { id: number; x: number; y: number } | null = null;
  // touch: every finger down on the canvas; two of them pinch (orbit distance, else the FOV)
  private fingers = new Map<number, { x: number; y: number }>();
  private pinchD = 0;
  private touchAction = '';
  // free camera movement from the gamepad (this frame) and the on-screen move pad (held):
  // x strafe right, y up, z forward, each -1..1
  private padMove = new THREE.Vector3();
  private padFast = false;
  private touchMove = new THREE.Vector3();
  private titleT = 0;
  private busy = false;

  constructor(private engine: Engine, private input: Input, private ui: UI, private game: Game) {
    this.rec.origin = Atmos.originOffset;   // the live offset object (mutated by rebases)
    this.installWrappers();
  }

  // ---------------- recording hooks (Cinematics) ----------------

  private installWrappers() {
    const w = this.game.world, rec = this.rec, fx = w.effects;
    const ex = fx.explosion.bind(fx), fl = fx.flak.bind(fx);
    this.fxExplosion = ex; this.fxFlak = fl;
    fx.explosion = (pos, vel, scale = 1) => { if (rec.live) rec.event(w.time, EV_EXPLOSION, -1, -1, pos, vel, scale); ex(pos, vel, scale); };
    fx.flak = (pos) => { if (rec.live) rec.event(w.time, EV_FLAK, -1, -1, pos, null, 1); fl(pos); };
    const bl = w.ballistics, fire = bl.fire.bind(bl);
    bl.fire = (pos, vel, team, damage, tracer, color, owner, cannon = false, player = false, ttl = 2.6) => {
      if (player && rec.live && owner && owner === w.player) rec.shot(w.time, owner, pos, vel, tracer, color);
      fire(pos, vel, team, damage, tracer, color, owner, cannon, player, ttl);
    };
  }

  /** Every frame from Cinematics.update (dt = game time); records only while in play. */
  record(dt: number, inPlay: boolean) {
    const w = this.game.world;
    this.rec.live = inPlay;
    if (inPlay) this.rec.record(dt, w, this.engine.camera, this.game.boss?.cleared ?? false);
  }

  /** Credited player kill (Cinematics.onKill). */
  onPlayerKill(victim: Aircraft, streak: number) {
    const v = victim as Aircraft & { boss?: unknown; ace?: unknown };
    this.rec.playerKill(this.game.world.time, victim, streak, !!v.boss, !!v.ace);
  }

  /** New mission (or back to the menu): forget the recording. */
  newMission() {
    this.rec.reset();
    const m = this.game.mission;
    this.rec.role = m?.role ?? 'gunner';
    this.rec.title = m ? (m.number ? `Mission ${m.number} · ${m.title}` : m.title) : '';
  }

  /** Debrief (polled): adds the "Replay theatre" button. */
  mountDebrief() {
    if (this.active || this.rec.frames < 12) return;
    const row = document.querySelector('#debrief.show .row');
    if (!row || row.querySelector('[data-theatre]')) return;
    const b = document.createElement('button');
    b.className = 'btn ghost';
    b.dataset.theatre = '1';
    b.textContent = tx('Replay theatre');
    b.addEventListener('click', () => this.openLive());
    row.prepend(b);
  }

  /** Title menu (polled from Cinematics while in the menu): adds the "Theatre" entry. */
  mountTitle(real: number) {
    this.titleT -= real;
    if (this.titleT > 0 || this.active) return;
    this.titleT = 0.3;
    const menu = document.querySelector('#title.show .menu');
    if (!menu || menu.querySelector('[data-a="theatre"]')) return;
    const b = document.createElement('button');
    b.dataset.a = 'theatre';
    b.innerHTML = `${tx('Theatre')} <small>${tx('saved moments')}</small>`;
    b.addEventListener('click', () => this.openLibrary());
    const settings = menu.querySelector('[data-a="settings"]');
    menu.insertBefore(b, settings);
  }

  // ---------------- library ----------------

  async openLibrary() {
    if (this.active) return;
    let items: SavedMoment[] = [];
    try { items = await this.store.list(); } catch (err) { console.warn('Theatre: saved moments unavailable', err); }
    document.getElementById('title')?.classList.remove('show');
    const list: MomentItem[] = items.map((m) => ({ key: m.key!, title: m.title, created: m.created, duration: m.duration, thumb: m.thumb }));
    this.screen.showLibrary(list, {
      play: (key) => { const m = items.find((x) => x.key === key); if (m) { this.fromLibrary = true; this.open(m.clip, false); } },
      remove: async (key) => { try { await this.store.remove(key); } catch { /* */ } this.openLibrary(); },
      back: () => { this.screen.hideLibrary(); if (this.game.state === 'menu') document.getElementById('title')?.classList.add('show'); },
    });
  }

  // ---------------- open / close ----------------

  /** From the debriefing: the recording of the mission just flown, over the frozen world. */
  openLive(): boolean {
    if (this.active || this.rec.frames < 2) return false;
    this.fromLibrary = false;
    return this.open(this.rec.toClip(), true);
  }

  private open(clip: ClipData, live: boolean): boolean {
    if (this.active || clip.frames < 2) return false;
    const e = this.engine, w = this.game.world, scene = e.scene;
    this.clip = clip;
    this.liveMode = live;
    this.title = clip.title || 'Replay';
    // playback frame: the live scene's (aircraft line up with the frozen world), or the
    // clip's own first frame for a saved moment
    if (live) this.base.copy(Atmos.originOffset);
    else this.base.set(clip.off[0], clip.off[1], clip.off[2]);
    // take over the frame loop: the game is frozen until close()
    this.savedFrame = e.onFrame;
    e.onFrame = this.onFrame;
    this.savedPaused = e.paused; this.savedScale = e.timeScale;
    e.paused = false; e.timeScale = 1;
    this.snap.capture(e);
    const p = e.post;
    this.post = { exposure: p.exposure, motionBlur: p.motionBlur, damageFlash: p.damageFlash, desat: p.desat, flash: p.flash, zoomPulse: p.zoomPulse };
    this.hud.hide(this.ui.canvas);
    this.shownLayers = Array.from(document.querySelectorAll('.layer.show'));
    for (const l of this.shownLayers) l.classList.remove('show');
    this.screen.setLibraryVisible(false);
    // hide the live world's aircraft, wrecks, contrails and tracers; effects start clean
    this.hiddenObjs.length = 0;
    const hide = (o: THREE.Object3D | undefined | null) => { if (o && o.visible) { o.visible = false; this.hiddenObjs.push(o); } };
    const livePlayer = live ? w.aircraft.find((a) => a.id === clip.playerId && !a.remove) ?? null : null;
    for (const a of w.aircraft) if (a !== livePlayer) hide(a.root);
    for (const pc of ((w.wrecks as unknown as { pieces?: { root: THREE.Object3D }[] }).pieces ?? [])) hide(pc.root);
    hide(w.contrails.mesh);
    hide(w.ballistics.tracers.mesh);
    w.effects.clear();
    this.tracers.clear();
    scene.add(this.tracers.tracers.mesh);
    // proxies
    this.proxies.length = 0;
    this.byId.clear();
    this.player = null;
    for (const m of clip.meta) {
      let root: THREE.Object3D, model: THREE.Object3D | null = null, isLive = false;
      if (livePlayer && m.id === livePlayer.id) {
        root = livePlayer.root; isLive = true;
        this.livePose.pos.copy(livePlayer.pos); this.livePose.quat.copy(livePlayer.quat);
      } else {
        root = new THREE.Group();
        model = instantiate(m.kind as ModelKind);
        model.scale.setScalar(m.scale);
        root.add(model);
        scene.add(root);
      }
      root.visible = false;
      const px: Proxy = { id: m.id, meta: m, root, model, live: isLive, present: false, flags: 0, hint: -1, vel: new THREE.Vector3(), trailT: Math.random() * 0.1 };
      this.proxies.push(px);
      this.byId.set(m.id, px);
      if (m.id === clip.playerId) this.player = px;
    }
    // kills with no recorded explosion near them get a synthetic one
    this.killBoom = new Uint8Array(clip.evN);
    for (let i = 0; i < clip.evN; i++) {
      if (clip.evType[i] !== EV_KILL) continue;
      let found = false;
      for (let j = 0; j < clip.evN && !found; j++) {
        if (clip.evType[j] !== EV_EXPLOSION || Math.abs(clip.evT[j] - clip.evT[i]) > 0.5) continue;
        const dx = clip.evP[j * 3] - clip.evP[i * 3], dy = clip.evP[j * 3 + 1] - clip.evP[i * 3 + 1], dz = clip.evP[j * 3 + 2] - clip.evP[i * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < 160 * 160) found = true;
      }
      this.killBoom[i] = found ? 0 : 1;
    }
    this.t0 = clip.t[0];
    this.t1 = clip.t[clip.frames - 1];
    // start a few seconds before the best moment (else at the start)
    let start = this.t0, best = -1;
    for (let i = 0; i < clip.mkN; i++) if (clip.mkType[i] !== MK_KILL && clip.mkType[i] >= best) { best = clip.mkType[i]; start = clip.mkT[i] - 4; }
    if (best < 0 && clip.mkN) start = clip.mkT[0] - 3;
    this.t = THREE.MathUtils.clamp(start, this.t0, this.t1);
    this.prevT = this.t;
    this.jumped = true;
    this.playing = true;
    this.speed = 1;
    this.mode = 'director';
    this.orbitId = clip.playerId >= 0 && this.byId.has(clip.playerId) ? clip.playerId : (clip.meta[0]?.id ?? -1);
    this.orbit.dist = 0;
    this.dir.end = -1;
    this.pov = null;
    this.gAcc.fill(0);
    this.keys.clear();
    this.fingers.clear();
    this.drag = null;
    this.padMove.set(0, 0, 0);
    this.touchMove.set(0, 0, 0);
    this.active = true;
    addEventListener('keydown', this.onKey, true);
    addEventListener('keyup', this.onKeyUp, true);
    addEventListener('blur', this.onBlur);
    const cv = e.renderer.domElement;
    cv.addEventListener('pointerdown', this.onDown);
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
    addEventListener('pointercancel', this.onUp);
    cv.addEventListener('wheel', this.onWheel, { passive: false });
    this.touchAction = cv.style.touchAction;
    cv.style.touchAction = 'none';   // one finger orbits / looks, two pinch: no page gestures
    this.input.endFrame();
    this.apply(0);
    this.screen.show(this);
    return true;
  }

  close() {
    if (!this.active) return;
    const e = this.engine, w = this.game.world;
    this.active = false;
    removeEventListener('keydown', this.onKey, true);
    removeEventListener('keyup', this.onKeyUp, true);
    removeEventListener('blur', this.onBlur);
    const cv = e.renderer.domElement;
    cv.removeEventListener('pointerdown', this.onDown);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerup', this.onUp);
    removeEventListener('pointercancel', this.onUp);
    cv.removeEventListener('wheel', this.onWheel);
    cv.style.cursor = '';
    cv.style.touchAction = this.touchAction;
    this.fingers.clear();
    this.drag = null;
    this.setPov(false);
    this.reveal.restore();
    for (const px of this.proxies) {
      if (px.live) {
        px.root.position.copy(this.livePose.pos);
        px.root.quaternion.copy(this.livePose.quat);
        px.root.visible = true;
      } else px.root.removeFromParent();   // geometry/materials are shared with the model cache
    }
    this.proxies.length = 0;
    this.byId.clear();
    this.player = null;
    this.tracers.clear();
    this.tracers.tracers.mesh.removeFromParent();
    w.effects.clear();
    for (const o of this.hiddenObjs) o.visible = true;
    this.hiddenObjs.length = 0;
    const p = e.post, s = this.post;
    p.exposure = s.exposure; p.motionBlur = s.motionBlur; p.damageFlash = s.damageFlash; p.desat = s.desat; p.flash = s.flash; p.zoomPulse = s.zoomPulse;
    this.snap.restore(e);
    this.hud.restore();
    this.screen.close();
    e.onFrame = this.savedFrame;
    e.paused = this.savedPaused; e.timeScale = this.savedScale;
    this.input.endFrame();
    this.clip = null;
    if (this.fromLibrary) { this.screen.setLibraryVisible(true); this.fromLibrary = false; }
    else for (const l of this.shownLayers) l.classList.add('show');
    this.shownLayers.length = 0;
  }

  // ---------------- TheatreControl ----------------

  marks(): TimelineMark[] {
    const c = this.clip;
    if (!c) return [];
    const out: TimelineMark[] = [];
    for (let i = 0; i < c.mkN; i++) out.push({ t: c.mkT[i], type: c.mkType[i], label: markLabel(c.mkType[i], c.mkA[i]), major: c.mkType[i] !== MK_KILL });
    return out;
  }

  aircraft(): AircraftItem[] {
    const c = this.clip;
    if (!c) return [];
    const role = c.role;
    const items = c.meta.map((m) => {
      const pl = m.id === c.playerId;
      const label = pl ? `You · ${role === 'pilot' ? 'P-51' : 'B-17'}` : m.team === 1 ? `${m.label} #${m.id}` : m.kind === 'b17' ? `B-17 ${m.label === 'B-17' ? `#${m.id}` : `“${m.label}”`}` : `${m.label} #${m.id}`;
      return { id: m.id, label, team: m.team, player: pl };
    });
    return items.sort((a, b) => (b.player ? 1 : 0) - (a.player ? 1 : 0) || b.team - a.team || a.id - b.id);
  }

  present(id: number) { return this.byId.get(id)?.present ?? false; }

  togglePlay() {
    if (!this.playing && this.t >= this.t1 - 1e-3) this.seek(this.t0);
    this.playing = !this.playing;
  }
  setSpeed(s: number) { this.speed = s; }
  step(dir: number) {
    const c = this.clip;
    if (!c) return;
    this.playing = false;
    const f = findFrame(c, this.t);
    let target: number;
    if (dir > 0) target = c.t[f] > this.t + 1e-4 ? c.t[f] : c.t[Math.min(c.frames - 1, f + 1)];
    else target = c.t[f] < this.t - 1e-4 ? c.t[f] : c.t[Math.max(0, f - 1)];
    this.seek(target);
  }
  seek(t: number) {
    this.t = THREE.MathUtils.clamp(t, this.t0, this.t1);
    this.jumped = true;
  }
  jumpMark(dir: number) {
    const ms = this.marks().filter((m) => m.major);
    const list = ms.length ? ms : this.marks();
    if (!list.length) return;
    const lead = 2;
    let pick = dir > 0 ? list.find((m) => m.t - lead > this.t + 0.05) : [...list].reverse().find((m) => m.t - lead < this.t - 0.3);
    if (!pick) pick = dir > 0 ? list[0] : list[list.length - 1];
    this.seek(pick.t - lead);
    this.playing = true;
  }
  setMode(m: CamMode) {
    if (m === 'free' && this.mode !== 'free') {
      const cam = this.engine.camera;
      this.free.pos.copy(cam.position);
      _e.setFromQuaternion(cam.quaternion, 'YXZ');
      this.free.pitch = _e.x; this.free.yaw = _e.y;
      this.free.vel.set(0, 0, 0);
    }
    if (m === 'orbit' && this.mode !== 'orbit') this.orbitFromCamera();
    if (m === 'director') this.dir.end = -1;
    this.mode = m;
    this.engine.post.resetHistory();
  }
  setOrbit(id: number) {
    if (!this.byId.has(id)) return;
    const changed = id !== this.orbitId;
    this.orbitId = id;
    if (changed) this.orbit.dist = 0;
    if (this.mode !== 'orbit') this.setMode('orbit');
    else if (changed) this.orbitFromCamera();
  }
  cycleOrbit(dir = 1) {
    const list = this.aircraft().filter((a) => this.present(a.id));
    if (!list.length) return;
    const i = list.findIndex((a) => a.id === this.orbitId);
    this.setOrbit(list[(i + dir + list.length) % list.length].id);
  }
  /** Next camera mode (gamepad Y, the phone layout's mode button). */
  cycleMode() { this.setMode(MODE_ORDER[(MODE_ORDER.indexOf(this.mode) + 1) % MODE_ORDER.length]); }
  speedStep(dir: number) { this.speed = SPEEDS[THREE.MathUtils.clamp(SPEEDS.indexOf(this.speed) + dir, 0, SPEEDS.length - 1)]; }
  /** The on-screen move pad of the free camera (touch): strafe, up, forward, each -1..1. */
  setMove(x: number, y: number, z: number) { this.touchMove.set(x, y, z); }

  // ---------------- gamepad (core/Gamepad.ts, through DeviceControls) ----------------

  get freeMode() { return this.mode === 'free'; }
  toggleUi() { this.screen.toggleHidden(); }
  back() { if (this.screen.hidden) this.screen.toggleHidden(); else this.close(); }
  /** Sticks and triggers, every frame while the pad is connected (before onFrame). */
  padAxes(a: TheatreAxes, real: number) {
    if (!this.active) return;
    if (a.scrub) this.seek(this.t + a.scrub * 8 * real);   // up to 8 s of replay per second
    const moving = a.lx || a.ly || a.rx || a.ry || a.rise;
    // like a mouse drag, a stick takes over from the player / director camera as an orbit
    if (moving && this.mode !== 'free' && this.mode !== 'orbit') this.setMode('orbit');
    const inv = this.input.invertY ? -1 : 1;
    if (this.mode === 'free') {
      this.free.yaw -= a.rx * 2.4 * real;
      this.free.pitch = THREE.MathUtils.clamp(this.free.pitch - a.ry * inv * 1.8 * real, -1.55, 1.55);
      this.padMove.set(a.lx, a.rise, -a.ly);
      this.padFast = a.fast;
    } else if (this.mode === 'orbit') {
      // left stick (and the right stick's X) orbit; the right stick's Y moves in and out
      this.orbit.yaw -= (a.lx + a.rx) * 2.2 * real;
      this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch - a.ly * inv * 1.6 * real, -1.4, 1.4);
      if (a.ry && this.orbit.dist > 0) this.orbit.dist = THREE.MathUtils.clamp(this.orbit.dist * Math.exp(a.ry * 1.6 * real), 4, 3000);
    }
  }

  /** Pinch / zoom: k > 1 widens (orbit: further out; other cameras: a wider lens). */
  private zoomBy(k: number) {
    if (this.mode === 'orbit') {
      if (this.orbit.dist > 0) this.orbit.dist = THREE.MathUtils.clamp(this.orbit.dist * k, 4, 3000);
      return;
    }
    const fov = THREE.MathUtils.clamp((this.photo.fov || this.camFov) * k, 12, 100);
    this.setPhoto({ fov });
    this.screen.syncPhoto();
  }
  setPhoto(p: Partial<PhotoSettings>) { Object.assign(this.photo, p); }

  async screenshot(): Promise<string> {
    const blob = await this.capture(this.photo.res);
    if (!blob) return 'Screenshot failed';
    const a = document.createElement('a');
    const d = new Date(), z = (n: number) => String(n).padStart(2, '0');
    a.download = `sky-war-theatre-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.png`;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return `Saved ${this.lastShot.w}×${this.lastShot.h} PNG`;
  }

  /** Last capture's pixel size (for the status line / tests). */
  lastShot = { w: 0, h: 0, bytes: 0 };

  /** Renders the current view (optionally at a multiple of the screen resolution) and
   *  returns it as a PNG. thumb: also fills a small JPEG thumbnail (saved moments). */
  capture(scale = 1, thumb?: { url: string }): Promise<Blob | null> {
    const e = this.engine, r = e.renderer, cv = r.domElement;
    const prevScale = e.renderScale;
    if (scale > 1) {
      const base = e.pixelRatio / Math.max(1e-3, prevScale);
      const maxPx = Math.min(r.capabilities.maxTextureSize, 8192);
      const ratio = Math.min(e.pixelRatio * scale, maxPx / Math.max(1, e.width), maxPx / Math.max(1, e.height));
      e.renderScale = ratio / base;
      e.resize();
    }
    this.applyLens();
    e.post.resetHistory();
    e.render(1 / 60);
    // the drawing buffer is only valid in this task: copy it out right away
    if (thumb) {
      const t = document.createElement('canvas');
      t.width = 320; t.height = 180;
      const ctx = t.getContext('2d')!;
      const sw = cv.width, sh = cv.height, k = Math.min(sw / 16, sh / 9);
      ctx.drawImage(cv, (sw - k * 16) / 2, (sh - k * 9) / 2, k * 16, k * 9, 0, 0, 320, 180);
      thumb.url = t.toDataURL('image/jpeg', 0.78);
    }
    this.lastShot.w = cv.width; this.lastShot.h = cv.height;
    const p = new Promise<Blob | null>((res) => cv.toBlob(res, 'image/png'));
    if (scale > 1) { e.renderScale = prevScale; e.resize(); }
    return p.then((b) => { this.lastShot.bytes = b?.size ?? 0; return b; });
  }

  async saveMoment(): Promise<string> {
    const c = this.clip;
    if (!c || this.busy) return '';
    this.busy = true;
    try {
      const n = await this.store.count();
      if (n >= MAX_SAVED) return `${MAX_SAVED}/${MAX_SAVED} saved: delete one from Theatre in the title menu first`;
      const t0 = Math.max(this.t0, this.t - MOMENT_BEFORE), t1 = Math.min(this.t1, this.t + MOMENT_AFTER);
      const clip = sliceClip(c, t0, t1);
      if (clip.frames < 2) return 'Nothing to save here';
      let label = 'Moment';
      let bd = 6;
      for (let i = 0; i < clip.mkN; i++) {
        const d = Math.abs(clip.mkT[i] - this.t);
        if (d < bd && clip.mkType[i] !== MK_KILL) { bd = d; label = markLabel(clip.mkType[i], clip.mkA[i]); }
      }
      const th = { url: '' };
      await this.capture(1, th);
      const m: SavedMoment = { title: `${label} · ${c.title || 'Mission'}`, created: Date.now(), duration: clip.t[clip.frames - 1] - clip.t[0], thumb: th.url, clip };
      const key = await this.store.add(m);
      if (key === null) return `${MAX_SAVED}/${MAX_SAVED} saved: delete one first`;
      return `Moment saved (${n + 1}/${MAX_SAVED})`;
    } catch (err) {
      console.warn('Theatre: save failed', err);
      return 'Could not save (storage unavailable)';
    } finally {
      this.busy = false;
    }
  }

  // ---------------- frame ----------------

  private onFrame = (dt: number) => {
    if (!this.active || !this.clip) return;
    const real = Math.min(0.1, Math.max(0, dt));
    if (this.playing && !this.jumped) {
      this.t += real * this.speed;
      if (this.t >= this.t1) { this.t = this.t1; this.playing = false; }
    }
    const pdt = this.jumped ? 0 : Math.max(0, this.t - this.prevT);
    this.pdt = pdt;
    this.apply(pdt);
    this.updateCamera(real);
    this.applyLens();
    const w = this.game.world;
    w.effects.update(pdt);
    this.tracers.update(pdt, EMPTY);
    this.tracers.renderTracers(this.engine.camera, Math.max(1, this.engine.renderer.domElement.height));
    this.ui.ctx.clearRect(0, 0, innerWidth, innerHeight);
    this.screen.update(real);
    this.input.endFrame();
    this.padMove.set(0, 0, 0);   // the gamepad sets it again before the next frame
    this.padFast = false;
  };

  /** Poses the proxies for this.t and replays what happened since the previous frame. */
  private apply(pdt: number) {
    const c = this.clip!, t = this.t, w = this.game.world;
    if (this.jumped) {
      w.effects.clear();
      this.tracers.clear();
      this.gAcc.fill(0);
      this.engine.post.resetHistory();
      let i = 0;
      while (i < c.evN && c.evT[i] <= t) i++;
      this.evIdx = i;
    }
    for (const px of this.proxies) px.present = false;
    const f = findFrame(c, t), n = c.n[f], b = f * MAX_ENT;
    for (let s = 0; s < n; s++) {
      const px = this.byId.get(c.id[b + s]);
      if (!px) continue;
      const flags = samplePose(c, t, px.id, this.base, px.root.position, px.root.quaternion, px.vel, s);
      if (flags < 0) continue;
      px.present = true;
      px.flags = flags;
    }
    for (const px of this.proxies) {
      px.root.visible = px.present;
      if (px.present) px.root.updateMatrixWorld();
    }
    if (pdt > 0) {
      this.events(t);
      this.trails(pdt);
      this.guns(this.prevT, t, pdt);
    }
    this.prevT = t;
    this.jumped = false;
  }

  private events(t: number) {
    const c = this.clip!, b = this.base;
    while (this.evIdx < c.evN && c.evT[this.evIdx] <= t) {
      const i = this.evIdx++;
      if (t - c.evT[i] > 0.75) continue;   // too far behind (a long frame): skip
      _p.set(c.evP[i * 3] - b.x, c.evP[i * 3 + 1] - b.y, c.evP[i * 3 + 2] - b.z);
      _v.set(c.evV[i * 3], c.evV[i * 3 + 1], c.evV[i * 3 + 2]);
      const type = c.evType[i];
      if (type === EV_EXPLOSION) this.fxExplosion?.(_p, _v, c.evS[i]);
      else if (type === EV_FLAK) this.fxFlak?.(_p);
      else if (type === EV_KILL && this.killBoom[i]) {
        const px = this.byId.get(c.evA[i]);
        if (px?.present) _p.copy(px.root.position);
        this.fxExplosion?.(_p, _v, 0.7);
      }
    }
  }

  // damage smoke and fire from the recorded damage stage
  private trails(pdt: number) {
    const fx = this.game.world.effects;
    for (const px of this.proxies) {
      if (!px.present) continue;
      px.trailT -= pdt;
      if (px.trailT > 0) continue;
      px.trailT = 0.07;
      const stage = stageOf(px.flags), dead = !(px.flags & F_ALIVE), fire = (px.flags & F_FIRE) !== 0;
      if (stage < 2 && !fire && !dead) continue;
      if (fx.smoke.count > 7800) continue;
      const k = THREE.MathUtils.clamp(px.meta.radius / 7, 0.8, 3.5);
      fx.trail(px.root.position, px.vel, dead ? 1 : Math.min(1, (stage - 1) / 3), fire || dead, k);
    }
  }

  // the player's tracers: the rounds each gun slot fired between keyframes, spread over that interval
  private guns(t0: number, t1: number, pdt: number) {
    const c = this.clip!, pl = this.player;
    if (!pl || !pl.present || c.frames < 2) return;
    const j0 = findFrame(c, t0) + 1, j1 = Math.min(c.frames - 1, findFrame(c, t1) + 1);
    for (let j = j0; j <= j1; j++) {
      const ta = c.t[j - 1], tb = c.t[j];
      const ov = Math.min(t1, tb) - Math.max(t0, ta);
      if (ov <= 0 || tb <= ta) continue;
      const frac = ov / (tb - ta);
      for (let s = 0; s < GUN_SLOTS; s++) {
        const k = j * GUN_SLOTS + s, cnt = c.gN[k];
        if (!cnt) continue;
        this.gAcc[s] += cnt * frac;
        while (this.gAcc[s] >= 1) {
          this.gAcc[s] -= 1;
          _a.set(c.gOff[k * 3], c.gOff[k * 3 + 1], c.gOff[k * 3 + 2]).applyQuaternion(pl.root.quaternion).add(pl.root.position);
          _b.set(c.gDir[k * 3], c.gDir[k * 3 + 1], c.gDir[k * 3 + 2]).normalize().applyQuaternion(pl.root.quaternion);
          _v.copy(_b).multiplyScalar(c.gSpd[k] || 870).add(pl.vel);
          _a.addScaledVector(_v, Math.random() * pdt);
          _col[0] = c.gCol[k * 3] / 20; _col[1] = c.gCol[k * 3 + 1] / 20; _col[2] = c.gCol[k * 3 + 2] / 20;
          this.tracers.fire(_a, _v, 'allied', 0, true, _col, null, false, true, 2.6);
        }
      }
    }
  }

  // ---------------- cameras ----------------

  private updateCamera(real: number) {
    const cam = this.engine.camera;
    let fov = 50, pov = false;
    switch (this.mode) {
      case 'player':
        fov = sampleCamera(this.clip!, this.t, this.base, cam.position, cam.quaternion);
        pov = true;
        break;
      case 'orbit': fov = this.orbitCam(real); break;
      case 'free': this.freeCam(real); break;
      case 'director': {
        const r = this.director(real);
        fov = r.fov; pov = r.pov;
        break;
      }
    }
    this.setPov(pov);
    this.camFov = this.photo.fov || fov;
    cam.updateMatrixWorld();
  }
  private camFov = 50;

  private applyLens() {
    const e = this.engine, cam = e.camera, p = e.post, ph = this.photo;
    if (cam.fov !== this.camFov || cam.zoom !== 1) { cam.fov = this.camFov; cam.zoom = 1; cam.updateProjectionMatrix(); }
    p.exposure = ph.exposure;
    p.dofStrength = ph.dof;
    p.nearFocus = ph.dof > 0 ? ph.focus : 0.1;
    p.noBlurDist = 1e6;
    p.motionBlur = 0;
    p.damageFlash = 0; p.desat = 0; p.flash = 0; p.zoomPulse = 0;
  }

  /** Player's own view: the gunner's interior parts as recorded (hidden) vs revealed. */
  private setPov(on: boolean) {
    if (on === this.pov) return;
    this.pov = on;
    const pl = this.player, gunner = this.clip?.role !== 'pilot';
    if (on) {
      this.reveal.restore();
      if (pl && !pl.live && gunner && pl.model) pl.model.traverse((o) => { if (o.visible && GUNNER_HIDDEN.includes(o.name)) { o.visible = false; this.povHidden.push(o); } });
    } else {
      for (const o of this.povHidden) o.visible = true;
      this.povHidden.length = 0;
      if (pl?.live) this.reveal.reveal(pl.root);
    }
    this.engine.post.resetHistory();
  }

  private orbitFromCamera() {
    const px = this.byId.get(this.orbitId), cam = this.engine.camera;
    if (!px || !px.present) return;
    _a.copy(cam.position).sub(px.root.position);
    if (_a.lengthSq() < 1) return;
    this.orbit.yaw = Math.atan2(_a.x, _a.z);
    this.orbit.pitch = THREE.MathUtils.clamp(Math.asin(_a.y / _a.length()), -1.3, 1.3);
  }

  private orbitCam(_real: number): number {
    const px = this.byId.get(this.orbitId), cam = this.engine.camera, o = this.orbit;
    if (!px || !px.present) return 50;
    if (o.dist <= 0) o.dist = Math.max(14, px.meta.radius * 3.4);
    _a.set(Math.sin(o.yaw) * Math.cos(o.pitch), Math.sin(o.pitch), Math.cos(o.yaw) * Math.cos(o.pitch));
    cam.position.copy(px.root.position).addScaledVector(_a, o.dist);
    cam.up.copy(UP);
    cam.lookAt(px.root.position);
    return 50;
  }

  private freeCam(real: number) {
    const f = this.free, cam = this.engine.camera, k = this.keys;
    cam.quaternion.setFromEuler(_e.set(f.pitch, f.yaw, 0, 'YXZ'));
    _a.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _b.set(1, 0, 0).applyQuaternion(cam.quaternion);
    // keyboard + gamepad + the touch move pad
    const pm = this.padMove, tm = this.touchMove;
    const ax = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + pm.x + tm.x;
    const az = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + pm.z + tm.z;
    const ay = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0) + pm.y + tm.y;
    _v.set(0, 0, 0).addScaledVector(_a, az).addScaledVector(_b, ax).addScaledVector(UP, ay);
    if (_v.lengthSq() > 1) _v.normalize();
    const fast = k.has('ShiftLeft') || k.has('ShiftRight') || this.padFast;
    _v.multiplyScalar(FREE_SPEED * f.mul * (fast ? 5 : 1));
    f.vel.lerp(_v, 1 - Math.exp(-real * 8));
    f.pos.addScaledVector(f.vel, real);
    cam.position.copy(f.pos);
  }

  // Cinematic auto-director: cuts between a chase shot, a fly-by from a fixed point, the
  // player's own view and a slow orbit; ahead of each kill it cuts to the victim.
  private director(real: number): { fov: number; pov: boolean } {
    const d = this.dir, c = this.clip!, t = this.t, cam = this.engine.camera;
    if (this.jumped || t < d.start - 1e-3 || t >= d.end) this.pickShot();
    const px = this.byId.get(d.subject);
    if (d.kind === Shot.Pov) return { fov: sampleCamera(c, t, this.base, cam.position, cam.quaternion), pov: true };
    if (!px || !px.present) {
      // subject gone (shot down and removed): hold the view, cut at the next chance
      if (d.kind !== Shot.Victim) d.end = Math.min(d.end, t + 0.5);
      return { fov: cam.fov, pov: false };
    }
    const pos = px.root.position, r = Math.max(6, px.meta.radius);
    let fov = 50;
    switch (d.kind) {
      case Shot.Chase: {
        _a.set(0, 0, 1).applyQuaternion(px.root.quaternion);   // nose is +Z
        _b.crossVectors(UP, _a).normalize();
        const dist = r * 2.6;
        _p.copy(pos).addScaledVector(_a, -dist).addScaledVector(UP, dist * 0.32).addScaledVector(_b, d.side * dist * 0.28);
        _v.copy(pos).addScaledVector(_a, dist * 0.7);
        if (d.cut) { d.cam.copy(_p); d.look.copy(_v); }
        else {
          // follow in the subject's frame (it moves ~100 m/s: lag only the offset)
          d.cam.addScaledVector(px.vel, this.pdt).lerp(_p, 1 - Math.exp(-real * 3));
          d.look.addScaledVector(px.vel, this.pdt).lerp(_v, 1 - Math.exp(-real * 5));
        }
        fov = 55;
        break;
      }
      case Shot.Flyby:
        d.cam.copy(d.anchor);
        d.look.copy(pos);
        fov = THREE.MathUtils.clamp(32 * (300 / Math.max(60, d.anchor.distanceTo(pos))), 18, 48);
        break;
      case Shot.Orbit:
      case Shot.Victim: {
        const rate = d.kind === Shot.Victim ? 0.32 : 0.2;
        const ang = d.side * rate * (t - d.start);
        _a.copy(d.anchor).applyAxisAngle(UP, ang);
        const dist = d.kind === Shot.Victim ? r * 3.2 + 12 : r * 3.6;
        d.cam.copy(pos).addScaledVector(_a, dist);
        d.look.copy(pos);
        fov = d.kind === Shot.Victim ? 42 : 48;
        break;
      }
    }
    cam.position.copy(d.cam);
    cam.up.copy(UP);
    cam.lookAt(d.look);
    if (d.cut) { d.cut = false; this.engine.post.resetHistory(); }
    return { fov, pov: false };
  }

  private pickShot() {
    const d = this.dir, c = this.clip!, t = this.t;
    d.seq++;
    d.side = d.seq % 2 ? 1 : -1;
    d.cut = true;
    d.start = t;
    // a kill coming up: cut to the victim (credited player kills first)
    let victim = -1, killT = 0;
    for (let i = this.firstEventAfter(t); i < c.evN && c.evT[i] <= t + 2.4; i++) {
      if (c.evType[i] !== EV_KILL) continue;
      const px = this.byId.get(c.evA[i]);
      if (!px || !px.present) continue;
      if (victim < 0 || c.evS[i] > 0) { victim = px.id; killT = c.evT[i]; if (c.evS[i] > 0) break; }
    }
    const pl = this.player && this.player.present ? this.player : null;
    if (victim >= 0 && victim !== d.subject) {
      d.kind = Shot.Victim; d.subject = victim; d.end = Math.min(this.t1 + 1, killT + 2.2);
      const vp = this.byId.get(victim)!;
      if (pl) d.anchor.copy(pl.root.position).sub(vp.root.position); else d.anchor.set(1, 0.3, 0);
      d.anchor.y = d.anchor.y * 0.4 + d.anchor.length() * 0.15;
      d.anchor.normalize().applyAxisAngle(UP, d.side * 0.5);
      return;
    }
    const order = [Shot.Chase, Shot.Flyby, Shot.Orbit, Shot.Pov];
    let kind = order[d.seq % order.length];
    if (!pl && (kind === Shot.Chase || kind === Shot.Pov || kind === Shot.Orbit)) kind = Shot.Flyby;
    d.kind = kind;
    d.end = t + (kind === Shot.Pov ? 3.5 : kind === Shot.Flyby ? 4 : 5);
    if (kind === Shot.Flyby) {
      // a fixed point ahead of the subject (an enemy near the player half the time)
      let subj = pl;
      if (d.seq % 4 === 1 || !pl) {
        let bd = Infinity;
        for (const px of this.proxies) {
          if (!px.present || px.meta.team !== 1 || !(px.flags & F_ALIVE)) continue;
          const dd = pl ? px.root.position.distanceToSquared(pl.root.position) : 0;
          if (dd < bd) { bd = dd; subj = px; }
        }
      }
      if (!subj) { for (const px of this.proxies) if (px.present) { subj = px; break; } }
      if (!subj) { d.kind = Shot.Pov; return; }
      d.subject = subj.id;
      const r = Math.max(6, subj.meta.radius);
      _a.copy(subj.vel);
      if (_a.lengthSq() < 1) _a.set(0, 0, 1).applyQuaternion(subj.root.quaternion).multiplyScalar(90);
      _b.crossVectors(UP, _a).normalize();
      d.anchor.copy(subj.root.position).addScaledVector(_a, 2.0).addScaledVector(_b, d.side * (r * 3 + 25)).addScaledVector(UP, (d.seq % 3 - 1) * r * 1.5);
      return;
    }
    d.subject = pl!.id;
    if (kind === Shot.Orbit) {
      _a.set(0, 0, -1).applyQuaternion(pl!.root.quaternion);
      _a.y = 0.35;
      d.anchor.copy(_a.normalize());
    }
  }

  private firstEventAfter(t: number) {
    const c = this.clip!;
    let lo = 0, hi = c.evN;
    while (lo < hi) { const m = (lo + hi) >> 1; if (c.evT[m] < t) lo = m + 1; else hi = m; }
    return lo;
  }

  // ---------------- input ----------------

  private onKey = (e: KeyboardEvent) => {
    if (!this.active) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if ((tag === 'INPUT' || tag === 'SELECT') && e.code !== 'Escape') return;
    const code = e.code;
    let handled = true;
    switch (code) {
      case 'Space': if (!e.repeat) this.togglePlay(); break;
      case 'ArrowRight': if (e.shiftKey) this.seek(this.t + 5); else this.step(1); break;
      case 'ArrowLeft': if (e.shiftKey) this.seek(this.t - 5); else this.step(-1); break;
      case 'Home': this.seek(this.t0); break;
      case 'End': this.seek(this.t1); break;
      case 'Comma': this.jumpMark(-1); break;
      case 'Period': this.jumpMark(1); break;
      case 'Tab': if (!e.repeat) this.cycleOrbit(e.shiftKey ? -1 : 1); break;
      case 'Digit1': this.setMode('player'); break;
      case 'Digit2': this.setMode('orbit'); break;
      case 'Digit3': this.setMode('free'); break;
      case 'Digit4': this.setMode('director'); break;
      case 'BracketLeft': this.speed = SPEEDS[Math.max(0, SPEEDS.indexOf(this.speed) - 1)]; break;
      case 'BracketRight': this.speed = SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(this.speed) + 1)]; break;
      case 'KeyH': if (!e.repeat) this.screen.toggleHidden(); break;
      case 'Escape': if (this.screen.hidden) this.screen.toggleHidden(); else this.close(); break;
      case 'KeyW': case 'KeyA': case 'KeyS': case 'KeyD': case 'KeyQ': case 'KeyE': case 'ShiftLeft': case 'ShiftRight':
        this.keys.add(code); break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (!this.active) return;
    if (this.keys.delete(e.code)) { e.preventDefault(); e.stopPropagation(); }
  };

  private onBlur = () => { this.keys.clear(); this.drag = null; this.fingers.clear(); };

  private fingerSpan() {
    const [p, q] = [...this.fingers.values()];
    return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : 0;
  }

  private onDown = (e: PointerEvent) => {
    if (!this.active || (e.button !== 0 && e.button !== 2)) return;
    if (e.pointerType === 'touch') {
      this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.fingers.size >= 2) {
        // a second finger: pinch instead of drag
        this.drag = null;
        this.pinchD = this.fingerSpan();
        return;
      }
    }
    if (this.mode !== 'free' && this.mode !== 'orbit') {
      // dragging the view takes over from the player/director camera as an orbit
      this.setMode('orbit');
    }
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.engine.renderer.domElement.style.cursor = 'grabbing';
  };

  private onMove = (e: PointerEvent) => {
    if (!this.active) return;
    const f = this.fingers.get(e.pointerId);
    if (f) {
      f.x = e.clientX; f.y = e.clientY;
      if (this.fingers.size >= 2) {
        const span = this.fingerSpan();
        if (this.pinchD > 8 && span > 8) this.zoomBy(this.pinchD / span);   // fingers apart = closer
        this.pinchD = span;
        return;
      }
    }
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX; d.y = e.clientY;
    const k = e.pointerType === 'touch' ? 0.007 : 0.005;
    if (this.mode === 'free') {
      this.free.yaw -= dx * k * 0.8;
      this.free.pitch = THREE.MathUtils.clamp(this.free.pitch - dy * k * 0.8, -1.55, 1.55);
    } else if (this.mode === 'orbit') {
      this.orbit.yaw -= dx * k;
      this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch + dy * k, -1.4, 1.4);
    }
  };

  private onUp = (e: PointerEvent) => {
    if (this.fingers.delete(e.pointerId) && this.fingers.size === 1 && this.active) {
      // the pinch ends with one finger still down: it drags on from where it is
      const [[id, p]] = [...this.fingers];
      this.drag = { id, x: p.x, y: p.y };
      return;
    }
    if (this.drag && e.pointerId === this.drag.id) { this.drag = null; this.engine.renderer.domElement.style.cursor = ''; }
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.active) return;
    e.preventDefault();
    const k = Math.pow(1.12, Math.sign(e.deltaY));
    if (this.mode === 'free') this.free.mul = THREE.MathUtils.clamp(this.free.mul / k, 0.1, 20);
    else if (this.mode === 'orbit') this.orbit.dist = THREE.MathUtils.clamp(this.orbit.dist * k, 4, 3000);
  };
}
