import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Input } from '../core/Input';
import type { UI } from '../ui/UI';
import type { Game } from './Game';
import type { Mission } from './Missions';
import { Aircraft, Fighter } from '../world/Aircraft';
import { Atmos } from '../render/Atmosphere';
import { Replay } from './Replay';
import { Theatre } from './Theatre';
import { CamSnapshot, CineOverlay, HudHider, ModelReveal, cineLens } from './CineShared';
import { tx } from '../i18n';
import { access } from '../core/Accessibility';
import { CombatDirector, ShotRig, type ShotPlan } from './CombatDirector';

// Cinematic moments: kill cam, end-of-mission fly-by and the best-moment replay (Replay.ts).
//
// Kill cam: on a special kill (boss part/ship, ace, Bf 110 / Ju 88, or the 3rd+ kill of a
// quick streak), at most once every 25 s, the view cuts for 1.6-2.2 s (real time) to an
// external camera that orbits or tracks the dying aircraft (FighterDeath drives the death),
// in slow motion with a letterbox, then dips to black and cuts back to the gun. Clicking
// or firing skips it at once. Never in the tutorial, never when the player is in trouble
// (aircraft integrity under 50%, more than 3.5% of it lost in the last 3 s, three or more
// crew wounded), never mid station-change, and for the P-51 only with height and the nose
// up enough to fly on hands-off. Settings "Kill cam" (settings.killCam, default on).
//
// Fly-by: a successful mission gets a 4.6 s low pass along the bomber box before the
// debrief (camera on the side that looks into the sun, path checked clear of every
// bomber), with contrails on and a MISSION COMPLETE card. Click / Space / Enter skips.
//
// Drama cam: a formation set piece (SetPieces.ts: a B-17 downed by flak, a collision, a bomb-bay
// explosion, a straggler, P-51s diving past) asks for a 2.4-3.4 s over-the-shoulder shot from just
// outside the player's own B-17, looking past it at the drama, in gentle slow motion. Same rules as
// the kill cam (setting, tutorial, the player's health, station change, cooldown shared with it),
// and never while fighters are pressing an attack nearby (2+ within 1.5 km, or one within 600 m).
//
// Director shots (CombatDirector.ts, Phase 10 goal 10): close passes in slow motion and kill
// follows on ordinary kills (gun camera, chase, long lens from a neighbour), rare and never in a
// critical moment (Settings "Combat director"). Every sequence here also gets the film look
// (FilmLook.ts: bokeh focused on the subject, per-object motion blur, grain, halation); Reduce
// motion turns their slow motion, handheld sway and grain off.
//
// Ownership rules, so control is never broken:
//   - The controllers keep running every frame and keep their own state. preFrame() hands
//     them back their own FOV/zoom/near/far and blocks their input (no aim drift, no
//     unseen firing); update() records their camera output, then overrides the camera.
//   - On exit the camera parent, pose, lens and the post settings (DOF) are restored from
//     that snapshot, the HUD is shown again and engine.timeScale goes back to 1 (Game's
//     own slow-mo or the Focus ability re-apply themselves the next frame).
//   - Nothing here allocates per frame (scratch vectors, typed arrays).

const COOLDOWN = 25;              // s (mission time) between kill cams
const DUR_SPECIAL = 2.2, DUR_HEAVY = 1.9, DUR_STREAK = 1.6;  // real seconds
const KC_SLOW = 0.28, KC_SLOW_END = 0.65;
const FADE_OUT = 0.14, FADE_IN = 0.22;
const FLY_DELAY = 1.3;            // real s of the gun view ("ALL GUNS SECURE") before the fly-by
const FLY_DUR = 4.6;
const HP_LOW = 0.5, HP_DROP = 0.035;
const HEAVY = ['bf110', 'ju88', 'me410', 'he111'];

type Mode = 'none' | 'kill' | 'flyby' | 'replay' | 'drama' | 'shot';
const DRAMA_SLOW = 0.55;          // drama cam slow motion (eases back to 1 over its second half)
const DRAMA_NEAR = 1500, DRAMA_CLOSE = 600;

/** Drama cam subject: writes its current position into `out`; false once it is gone. */
export type DramaFocus = (out: THREE.Vector3) => boolean;

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _f = new THREE.Vector3();
const _l = new THREE.Vector3();
const _h = new THREE.Vector3();
const ZERO = new THREE.Vector3();

export class Cinematics {
  readonly replay: Replay;
  readonly theatre: Theatre;       // replay theatre: 90 s recorder + playback screen (Theatre.ts)
  readonly director: CombatDirector; // close passes / kill follows (CombatDirector.ts)
  private rig = new ShotRig();
  private heroD = new Float64Array(12);
  private heroA: THREE.Object3D[] = [];
  private mode: Mode = 'none';
  /** The best-moment replay is playing over the live world (Bookends steps its parked scene aside). */
  get replaying() { return this.mode === 'replay'; }
  private overlay = new CineOverlay();
  private snap = new CamSnapshot();
  private reveal = new ModelReveal();
  private hud = new HudHider();
  private real = 0;                 // real seconds this frame
  private lastScale = 1;            // engine.timeScale the next frame's dt is scaled by
  private inputOff = false;
  private inputActive = false;
  private fadeIn = 0;
  private scaleGuard = 0;           // after a kill cam: undo our slow-mo if it got restored late (hit-stop)
  private guardScale = -1;
  private lastSet = -1;
  private lastWorldTime = 0;
  private lastMission: Mission | null = null;
  private mountT = 0;
  private flushed = false;
  // player health history (integrity every 0.5 s, last 3 s)
  private hp = new Float32Array(6).fill(1);
  private hpI = 0;
  private hpT = 0;
  // kill cam
  private pending: Aircraft | null = null;
  private pendingDur = 0;
  private lastKillCam = -1e9;
  private shots = 0;
  private kc = {
    victim: null as Aircraft | null, t: 0, dur: 2, shot: 0, side: 1, dist: 100,
    focus: new THREE.Vector3(), focusVel: new THREE.Vector3(),   // absolute (floating origin added back)
    anchor: new THREE.Vector3(), anchorVel: new THREE.Vector3(),
    dir: new THREE.Vector3(), look: new THREE.Vector3(), cam: new THREE.Vector3(),
  };
  // drama cam (set pieces)
  private dramaReq: { focus: DramaFocus; dur: number; title: string; sub: string } | null = null;
  private dr = {
    focus: null as DramaFocus | null, t: 0, dur: 3, gone: false,
    off: new THREE.Vector3(),      // camera offset from the player's aircraft (rebase-proof: both move together)
    look: new THREE.Vector3(),     // smoothed look point, relative to the player's aircraft
    subj: new THREE.Vector3(),
  };
  // fly-by
  private flyQueued = false;
  private flyDelay = 0;
  private flyT = 0;
  private flyDone: (() => void) | null = null;
  private flySubject: Aircraft | null = null;
  private flyRel = new THREE.Vector3();
  private flySide = 1;
  private flyLat = 70;
  private flyVert = -24;
  private contrailsSaved: boolean | null = null;

  constructor(private engine: Engine, private input: Input, private ui: UI, private game: Game) {
    this.replay = new Replay(engine, game.world);
    this.theatre = new Theatre(engine, input, ui, game);
    this.director = new CombatDirector(game);
    engine.post.film.heroes = this.collectHeroes;
  }

  /** Per-object motion blur subjects (FilmLook): the nearest aircraft and wreckage that move
   *  against the camera (the formation flying along with it would only cost draw calls). */
  private collectHeroes = (out: THREE.Object3D[], cam: THREE.Camera) => {
    const w = this.game.world, cine = this.mode !== 'none';
    const range = cine ? 1600 : 650, cap = cine ? 10 : 6;
    const ref = this.mode === 'shot' ? this.rig.refVel : (w.player?.vel ?? ZERO);
    const cp = cam.getWorldPosition(_h);
    const d = this.heroD, a = this.heroA;
    let n = 0;
    const consider = (root: THREE.Object3D, vel: THREE.Vector3, skipInside: number) => {
      if (!root.visible) return;
      const dd = root.position.distanceToSquared(cp);
      if (dd > range * range || dd < skipInside * skipInside) return;
      const rx = vel.x - ref.x, ry = vel.y - ref.y, rz = vel.z - ref.z;
      if (rx * rx + ry * ry + rz * rz < 144) return;
      if (n === cap && dd >= d[cap - 1]) return;
      let i = n < cap ? n++ : cap - 1;
      while (i > 0 && d[i - 1] > dd) { d[i] = d[i - 1]; a[i] = a[i - 1]; i--; }
      d[i] = dd; a[i] = root;
    };
    for (const ac of w.aircraft) if (!ac.remove) consider(ac.root, ac.vel, ac === w.player ? ac.radius : 0);
    const pieces = (w.wrecks as unknown as { pieces?: { root: THREE.Object3D; vel: THREE.Vector3 }[] }).pieces;
    if (pieces) for (const pc of pieces) consider(pc.root, pc.vel, 0);
    for (let i = 0; i < n; i++) out.push(a[i]);
  };

  // ---------------- hooks ----------------

  /** Game kill event (credited player kills only). streak = Game's quick-succession count. */
  onKill(victim: Aircraft, streak: number) {
    const fighter = victim instanceof Fighter;
    const heavy = fighter && HEAVY.includes((victim as Fighter).enemyType);
    const special = !!((victim as any).boss || (victim as any).ace);
    this.replay.onKill(victim, 1 + (heavy ? 1 : 0) + (special ? 2 : 0) + Math.max(0, streak - 1) * 0.5);
    this.theatre.onPlayerKill(victim, streak);
    if (special || heavy || streak >= 3) {
      this.pending = victim;
      this.pendingDur = special ? DUR_SPECIAL : heavy ? DUR_HEAVY : DUR_STREAK;
    } else this.director.onKill(victim);
  }

  /** Set pieces: ask for a short drama shot of `focus`. Returns false when the rules say no now
   *  (the shot then simply doesn't happen); true when it will start this frame. */
  drama(focus: DramaFocus, dur: number, title: string, sub: string): boolean {
    if (this.mode !== 'none' || this.dramaReq || !this.dramaAllowed()) return false;
    this.dramaReq = { focus, dur, title, sub };
    return true;
  }

  /** Mission succeeded: schedule the fly-by. Returns the ending time to use; done() ends
   *  the ending early (called when the fly-by finishes or is skipped). */
  queueFlyby(endTimer: number, done: () => void): number {
    const m = this.game.mission;
    if (!m || m.tutorial || !this.pickFlySubject()) return endTimer;
    this.flyQueued = true;
    this.flyDelay = FLY_DELAY;
    this.flyDone = done;
    // contrails on (weather may have them off) so the pass has its trails; they build up during the delay
    const c = this.game.world.contrails;
    if (this.contrailsSaved === null) this.contrailsSaved = c.enabled;
    c.enabled = true;
    return Math.max(endTimer, FLY_DELAY + FLY_DUR + 2.5);   // safety net: the ending still ends if the fly-by can't run
  }

  /** Right after Game's slow-mo step, before abilities and the controllers. */
  preFrame(dt: number) {
    this.real = this.lastScale > 0 ? dt / this.lastScale : 0;
    if (this.inputOff) this.giveInput();
    if (this.mode === 'none') return;
    const g = this.game, inp = this.input;
    if (this.mode !== 'replay') {
      const live = g.state === 'playing' || (g.state === 'ending' && this.mode === 'flyby');
      if (!live || g.photo.active) { this.end(); return; }
      if (inp.mouseHit(0) || inp.hit('Space') || (this.mode === 'flyby' && (inp.hit('Enter') || inp.hit('Escape')))) { this.end(true); return; }
    }
    this.snap.restoreLens(this.engine);
    if (this.mode === 'replay') return;
    // the controllers run on, blind: no aim drift, no firing while the view is elsewhere
    this.inputActive = inp.active;
    inp.enabled = false; inp.active = false;
    inp.mouseDX = 0; inp.mouseDY = 0; inp.wheel = 0;
    this.inputOff = true;
    const e = this.engine, calm = access.prefs.reduceMotion;   // Reduce motion: no slow motion
    if (this.mode === 'kill') {
      const u = this.kc.t / this.kc.dur;
      const s = calm ? 1 : u < 0.72 ? KC_SLOW : THREE.MathUtils.lerp(KC_SLOW, KC_SLOW_END, (u - 0.72) / 0.28);
      if (e.timeScale > s) { e.timeScale = s; this.lastSet = s; }
    } else if (this.mode === 'drama') {
      const u = this.dr.t / this.dr.dur;
      const s = calm ? 1 : u < 0.5 ? DRAMA_SLOW : THREE.MathUtils.lerp(DRAMA_SLOW, 1, (u - 0.5) / 0.5);
      if (e.timeScale > s) { e.timeScale = s; this.lastSet = s; }
    } else if (this.mode === 'shot') {
      // the rig eases in and out of its slow motion: raise it again while the scale is still ours
      const s = this.rig.scale;
      if (e.timeScale > s || (e.timeScale === this.lastSet && e.timeScale !== s)) { e.timeScale = s; this.lastSet = s; }
    } else if (e.timeScale !== 1 && e.timeScale > 0.06) e.timeScale = 1;   // fly-by runs at normal speed (leave a hit-stop alone)
  }

  /** After the controllers, camera shake and GameFeel; before the floating origin and HUD. */
  update(dt: number) {
    const g = this.game, w = g.world, e = this.engine, real = this.real;
    // new mission (or back to the menu): forget everything
    if (w.time + 1e-6 < this.lastWorldTime || g.mission !== this.lastMission) this.newMission();
    this.lastWorldTime = w.time;
    this.lastMission = g.mission;
    if (this.mode !== 'none' && (g.state === 'menu' || g.state === 'briefing')) this.end();

    const inPlay = g.state === 'playing' || g.state === 'ending';
    this.theatre.record(dt, inPlay);      // the controller's view (before any override below)
    if (inPlay) {
      this.replay.record(dt, e.camera);   // the controller's view (we override it below)
      this.trackHealth(real);
      this.flushed = false;
    }
    if (this.mode === 'kill' || this.mode === 'flyby' || this.mode === 'drama' || this.mode === 'shot') this.snap.refresh(e);

    // kill cam request from this frame's kill event
    if (this.pending) {
      if (this.mode === 'none' && this.killCamAllowed()) this.startKill(this.pending, this.pendingDur);
      this.pending = null;
    }
    if (this.dramaReq) {
      const q = this.dramaReq;
      this.dramaReq = null;
      if (this.mode === 'none' && this.dramaAllowed()) this.startDrama(q.focus, q.dur, q.title, q.sub);
    }
    // combat director: a close pass or a kill follow, when the rules allow one
    if (this.mode === 'none' && g.state === 'playing' && !this.flyQueued) {
      const fit = !!(g.mission && w.player) && this.playerFit();
      const plan = this.director.poll(real, fit, w.time - this.lastKillCam);
      if (plan) this.startShot(plan);
    }
    if (this.flyQueued) {
      this.flyDelay -= real;
      if (this.flyDelay <= 0 && g.state === 'ending') {
        this.flyQueued = false;
        if (this.mode === 'kill') this.end();
        if (this.mode === 'none' && this.pickFlySubject()) this.startFlyby();
        else this.finishFlyby();
      } else if (g.state !== 'ending') { this.flyQueued = false; this.restoreContrails(); }
    }

    if (this.mode === 'kill') this.updateKill(dt, real);
    else if (this.mode === 'drama') this.updateDrama(real);
    else if (this.mode === 'shot') this.updateShot(dt, real);
    else if (this.mode === 'flyby') this.updateFlyby(real);
    else if (this.mode === 'replay') this.replay.update(real);

    if (g.state === 'debrief') this.debrief(real);

    if (this.fadeIn > 0) {
      this.fadeIn = Math.max(0, this.fadeIn - real);
      this.overlay.setFade(this.fadeIn / FADE_IN);
    }
    if (this.scaleGuard > 0) {
      this.scaleGuard -= real;
      if (e.timeScale === this.guardScale) e.timeScale = 1;
    }
    if (this.inputOff) this.giveInput();
    this.lastScale = e.timeScale;
  }

  // ---------------- kill cam ----------------

  private killCamAllowed(): boolean {
    const g = this.game, w = g.world, m = g.mission;
    if (g.settings.killCam === false || !m || m.tutorial || g.state !== 'playing' || g.photo.active) return false;
    if (w.time - this.lastKillCam < COOLDOWN || this.flyQueued) return false;
    return this.playerFit();
  }

  // Drama cam: the kill-cam rules (but its own, shorter gap after a kill cam), never in co-op
  // (both players share the clock), and never with fighters pressing an attack close by
  private dramaAllowed(): boolean {
    const g = this.game, w = g.world, m = g.mission;
    if (g.settings.killCam === false || !m || m.tutorial || g.state !== 'playing' || g.photo.active || g.coop.role) return false;
    if (w.time - this.lastKillCam < 8 || this.flyQueued) return false;
    const pl = w.player;
    if (!pl) return false;
    let near = 0;
    for (const f of w.activeEnemies()) {
      if (!w.enemyPilot(f)) continue;   // a set piece's own scripted aircraft (no AI: not attacking)
      const d = f.pos.distanceTo(pl.pos);
      if (d < DRAMA_CLOSE) return false;
      if (d < DRAMA_NEAR) near++;
    }
    return near < 2 && this.playerFit();
  }

  // the player isn't in trouble: alive, healthy, not mid station-change (P-51: can fly on hands-off)
  private playerFit(): boolean {
    const g = this.game, w = g.world, m = g.mission!;
    const pl = w.player;
    if (!pl || !pl.alive || pl.remove) return false;
    // under heavy fire: low integrity, or a real chunk of it lost in the last few seconds
    const hpNow = pl.integrity;
    let hpMax = hpNow;
    for (let i = 0; i < this.hp.length; i++) if (this.hp[i] > hpMax) hpMax = this.hp[i];
    if (hpNow < HP_LOW || hpMax - hpNow > HP_DROP) return false;
    if (m.role === 'gunner') {
      if (w.crewWounded >= 3 || g.gunner.transition > 0) return false;
    } else {
      // the Mustang flies on hands-off for two seconds: needs height and a nose that isn't buried
      if (pl.pos.y < 1200 || pl.forward(_a).y < -0.45) return false;
    }
    return true;
  }

  private startKill(v: Aircraft, dur: number) {
    const e = this.engine, g = this.game, cam = e.camera, k = this.kc;
    this.snap.capture(e);
    if (g.mission?.role === 'gunner') this.reveal.reveal(g.world.playerBomber?.model);
    this.hud.hide(this.ui.canvas);
    const what = v instanceof Fighter && v.label ? v.label.toUpperCase() : tx('BANDIT');
    this.overlay.show(true, tx('KILL CAM'), tx('{what} · DESTROYED', { what }), tx('CLICK TO SKIP'));
    this.overlay.setFade(0);
    this.fadeIn = 0;
    const off = Atmos.originOffset;
    k.victim = v; k.t = 0; k.dur = dur;
    this.lastSet = -1;
    k.focus.copy(v.pos).add(off); k.focusVel.copy(v.vel);
    k.anchor.copy(k.focus); k.anchorVel.copy(v.vel);
    k.look.copy(k.focus);
    k.dist = THREE.MathUtils.clamp(v.radius * 2.3, 30, 170);
    k.side = Math.random() < 0.5 ? -1 : 1;
    k.shot = this.shots++ % 2;   // alternate: orbit / track
    // start on the side the player was looking from, swung round 40 degrees and a little above
    k.dir.copy(cam.position).sub(v.pos);
    if (k.dir.lengthSq() < 1) v.forward(k.dir).negate();
    k.dir.normalize().applyAxisAngle(UP, k.side * 0.7);
    k.dir.y = k.dir.y * 0.5 + 0.22;
    k.dir.normalize();
    this.lastKillCam = g.world.time;
    this.mode = 'kill';
    e.post.film.setShot('cinema');
    e.post.resetHistory();
    this.updateKill(0, 0);
  }

  private updateKill(dt: number, real: number) {
    const k = this.kc, e = this.engine, cam = e.camera, off = Atmos.originOffset;
    k.t += real;
    if (k.t >= k.dur) { this.end(); return; }
    // the dying aircraft (or, once it has broken up, where its wreckage is falling)
    const v = k.victim;
    if (v && !v.remove) { k.focus.copy(v.pos).add(off); k.focusVel.copy(v.vel); }
    else if (dt > 0) {
      k.focusVel.y -= 9.81 * 0.8 * dt;
      k.focusVel.multiplyScalar(Math.exp(-0.05 * dt));
      k.focus.addScaledVector(k.focusVel, dt);
    }
    k.anchor.addScaledVector(k.anchorVel, dt);
    const u = THREE.MathUtils.clamp(k.t / k.dur, 0, 1), eu = u * u * (3 - 2 * u);
    if (k.shot === 0) {
      // orbit round the falling aircraft, easing in a little
      _a.copy(k.dir).applyAxisAngle(UP, k.side * 0.9 * eu);
      k.cam.copy(k.focus).addScaledVector(_a, k.dist * (1.15 - 0.25 * eu));
    } else {
      // track: keep pace with where it was flying; it tumbles away from the lens
      k.cam.copy(k.anchor).addScaledVector(k.dir, k.dist * (0.9 + 0.35 * eu));
    }
    // never inside the player's own aircraft
    const pl = this.game.world.player;
    if (pl) {
      _b.copy(pl.pos).add(off);
      const d = k.cam.distanceTo(_b), min = pl.radius * 2.2;
      if (d < min && d > 1e-3) k.cam.sub(_b).multiplyScalar(min / d).add(_b);
    }
    if (real > 0) k.look.lerp(k.focus, 1 - Math.exp(-real * 12));
    cam.position.copy(k.cam).sub(off);
    cam.lookAt(_a.copy(k.look).sub(off));
    cam.rotateZ(k.side * 0.07 * (1 - eu));
    cineLens(e, 40 - 6 * eu);
    e.post.film.focusTarget = k.cam.distanceTo(k.focus);
    this.overlay.setFade(k.t > k.dur - FADE_OUT ? (k.t - (k.dur - FADE_OUT)) / FADE_OUT : 0);
  }

  // ---------------- drama cam (set pieces) ----------------

  private startDrama(focus: DramaFocus, dur: number, title: string, sub: string) {
    const e = this.engine, g = this.game, w = g.world, d = this.dr;
    const pl = w.player;
    if (!pl || !focus(d.subj)) return;
    this.snap.capture(e);
    if (g.mission?.role === 'gunner') this.reveal.reveal(w.playerBomber?.model);
    this.hud.hide(this.ui.canvas);
    this.overlay.show(true, title, sub, tx('CLICK TO SKIP'));
    this.overlay.setFade(0);
    this.fadeIn = 0;
    // over the shoulder: behind the player's ship as seen from the subject, out to one side and a
    // little above, so the ship frames the near edge of the shot and the drama plays beyond it
    _f.copy(d.subj).sub(pl.pos);
    const dist = _f.length();
    _f.divideScalar(Math.max(1, dist));
    _l.crossVectors(UP, _f);
    if (_l.lengthSq() < 1e-4) _l.set(1, 0, 0);
    _l.normalize();
    const back = THREE.MathUtils.clamp(dist * 0.3, 40, 70);
    let best = -1;
    for (const side of [1, -1]) {
      for (const lat of [30, 44]) {
        _a.copy(_f).multiplyScalar(-back).addScaledVector(_l, side * lat).addScaledVector(UP, 10);
        // keep clear of every other bomber in the box
        let clear = Infinity;
        for (const b of w.bombers()) { if (b !== pl && b.alive) clear = Math.min(clear, _b.copy(pl.pos).add(_a).distanceTo(b.pos)); }
        if (clear > best) { best = clear; d.off.copy(_a); }
        if (clear > 45) break;
      }
      if (best > 45) break;
    }
    d.look.copy(d.subj).sub(pl.pos);
    d.focus = focus; d.t = 0; d.dur = dur; d.gone = false;
    this.lastSet = -1;
    this.lastKillCam = w.time;   // the kill cam waits its cooldown after a drama shot too
    this.mode = 'drama';
    e.post.film.setShot('cinema');
    e.post.resetHistory();
    this.updateDrama(0);
  }

  private updateDrama(real: number) {
    const d = this.dr, e = this.engine, cam = e.camera, pl = this.game.world.player;
    d.t += real;
    if (d.t >= d.dur || !pl) { this.end(); return; }
    if (!d.gone && d.focus && !d.focus(d.subj)) d.gone = true;
    // subject relative to the player's ship (the look point eases after it; once it is gone the
    // shot holds on where it was)
    if (!d.gone) _a.copy(d.subj).sub(pl.pos); else _a.copy(d.look);
    if (real > 0) d.look.lerp(_a, 1 - Math.exp(-real * 5)); else d.look.copy(_a);
    const u = THREE.MathUtils.clamp(d.t / d.dur, 0, 1), eu = u * u * (3 - 2 * u);
    // a slow push in
    cam.position.copy(pl.pos).addScaledVector(d.off, 1 - 0.14 * eu);
    cam.lookAt(_b.copy(pl.pos).add(d.look));
    cineLens(e, 38 - 6 * eu);
    e.post.film.focusTarget = cam.position.distanceTo(_b);
    this.overlay.setFade(d.t > d.dur - FADE_OUT ? (d.t - (d.dur - FADE_OUT)) / FADE_OUT : 0);
  }

  // ---------------- director shots (CombatDirector.ts) ----------------

  private startShot(plan: ShotPlan) {
    const e = this.engine, g = this.game, rig = this.rig;
    this.snap.capture(e);
    rig.start(plan, e.camera);
    if (!rig.inside && g.mission?.role === 'gunner') this.reveal.reveal(g.world.playerBomber?.model);
    this.hud.hide(this.ui.canvas);
    const s = plan.subject;
    const what = s instanceof Fighter && s.label ? s.label.toUpperCase() : tx('BANDIT');
    const nb = plan.neighbour;
    const tag = plan.cam === 'gunCam' ? tx('GUN CAMERA FILM') : plan.cam === 'waist' ? tx('WAIST WINDOW') : plan.cam === 'wingtip' ? tx('WING CAMERA')
      : plan.cam === 'telephoto' ? (nb?.name ? tx('FROM “{name}”', { name: nb.name }) : tx('FROM THE NEXT SHIP')) : tx('KILL CAM');
    const cap = plan.event === 'pass' ? tx('{what} · CLOSE PASS', { what }) : tx('{what} · DESTROYED', { what });
    this.overlay.show(true, tag, cap, tx('CLICK TO SKIP'), rig.academy);
    this.overlay.setFade(0);
    this.fadeIn = 0;
    this.lastSet = -1;
    this.lastKillCam = g.world.time;
    this.mode = 'shot';
    e.post.film.setShot(rig.look);
    e.post.resetHistory();
    this.updateShot(0, 0);
  }

  private updateShot(dt: number, real: number) {
    const e = this.engine, rig = this.rig;
    if (!rig.update(e.camera, real, dt)) { this.end(); return; }
    cineLens(e, rig.fov);
    e.post.film.focusTarget = rig.focus;
    this.overlay.setFade(rig.t > rig.dur - FADE_OUT ? (rig.t - (rig.dur - FADE_OUT)) / FADE_OUT : 0);
  }

  /** Dev / capture (sws.cine): force a director shot now. */
  devShot(event: 'pass' | 'kill', cam?: string): string {
    if (this.mode !== 'none') this.end();
    const plan = this.director.force(event, cam as never);
    if (!plan) return 'no fighter to film';
    this.startShot(plan);
    return `${plan.event}/${plan.cam}`;
  }

  get shotInfo() { return this.mode === 'shot' ? { cam: this.rig.plan?.cam, t: this.rig.t, scale: this.rig.scale, focus: this.rig.focus, fov: this.rig.fov } : { mode: this.mode }; }

  // ---------------- fly-by ----------------

  private pickFlySubject(): Aircraft | null {
    const g = this.game, w = g.world;
    const pb = w.playerBomber;
    let s: Aircraft | null = g.mission?.role === 'gunner' && pb && pb.alive && !pb.remove ? pb : null;
    if (!s) {
      // escort missions: the bomber nearest the formation centre that is still flying
      let bd = Infinity;
      for (const b of w.bombers()) {
        if (!b.alive) continue;
        const d = b.pos.distanceToSquared(w.formationCenter);
        if (d < bd) { bd = d; s = b; }
      }
    }
    this.flySubject = s;
    return s;
  }

  private startFlyby() {
    const e = this.engine, g = this.game, w = g.world, s = this.flySubject!;
    this.flyRel.copy(s.pos).sub(w.formationCenter);
    // camera side: looking into the sun (backlit box, glowing trails)
    this.frame();
    const sunSide = _l.dot(Atmos.sunDir) > 0 ? -1 : 1;
    const cands = [[70, -24], [95, -45], [150, -80], [230, -130]];
    let found = false;
    for (const side of [sunSide, -sunSide]) {
      for (const [lat, vert] of cands) {
        if (this.pathClear(s, side, lat, vert)) { this.flySide = side; this.flyLat = lat; this.flyVert = vert; found = true; break; }
      }
      if (found) break;
    }
    if (!found) { this.flySide = sunSide; this.flyLat = 260; this.flyVert = -150; }
    this.snap.capture(e);
    this.reveal.reveal(w.playerBomber?.model);
    this.hud.hide(this.ui.canvas);
    this.overlay.show(true, '', '', tx('CLICK TO SKIP'));
    this.fadeIn = 0;
    this.flyT = 0;
    this.mode = 'flyby';
    e.post.film.setShot('cinema');
    e.post.resetHistory();
    this.updateFlyby(0);
  }

  // formation frame: _f forward (level), _l left
  private frame() {
    _f.copy(this.game.world.formationForward).setY(0);
    if (_f.lengthSq() < 1e-6) _f.set(0, 0, 1);
    _f.normalize();
    _l.crossVectors(UP, _f).normalize();
  }

  // The pass must stay 55 m clear of every other bomber in the box
  private pathClear(s: Aircraft, side: number, lat: number, vert: number) {
    for (const b of this.game.world.bombers()) {
      if (b === s || !b.alive) continue;
      _b.copy(b.pos).sub(s.pos);
      for (let x = -170; x <= 190; x += 30) {
        _a.copy(_f).multiplyScalar(x).addScaledVector(_l, side * lat).addScaledVector(UP, vert);
        if (_a.distanceToSquared(_b) < 55 * 55) return false;
      }
    }
    return true;
  }

  private updateFlyby(real: number) {
    const e = this.engine, cam = e.camera, w = this.game.world, s = this.flySubject;
    this.flyT += real;
    const t = this.flyT;
    if (t >= FLY_DUR) { this.end(); return; }
    const u = t / FLY_DUR, su = u * u * (3 - 2 * u);
    this.frame();
    if (s && !s.remove) _b.copy(s.pos); else _b.copy(this.flyRel).add(w.formationCenter);
    // a low pass from ahead of the subject to behind it, below and outside the box
    const along = THREE.MathUtils.lerp(190, -170, 0.55 * u + 0.45 * su);
    cam.position.copy(_b).addScaledVector(_f, along).addScaledVector(_l, this.flySide * this.flyLat).addScaledVector(UP, this.flyVert);
    cam.lookAt(_a.copy(_b).addScaledVector(UP, 1.5));   // the subject stays dead centre
    cam.rotateZ(this.flySide * THREE.MathUtils.lerp(0.05, -0.025, su));
    cineLens(e, THREE.MathUtils.lerp(32, 27, su));
    e.post.film.focusTarget = cam.position.distanceTo(_b);
    const m = this.game.mission;
    this.overlay.setCard(t > 0.55 && t < FLY_DUR - 0.75, tx('MISSION COMPLETE'), m ? (m.number ? tx('Mission {n} · {title}', { n: m.number, title: tx(m.title) }) : tx(m.title)) : '');
    // dip in from the gun view, dip out to the debrief
    this.overlay.setFade(Math.max(1 - t / 0.3, t > FLY_DUR - 0.3 ? (t - (FLY_DUR - 0.3)) / 0.3 : 0));
  }

  private finishFlyby() {
    this.restoreContrails();
    const cb = this.flyDone; this.flyDone = null;
    cb?.();
  }

  private restoreContrails() {
    if (this.contrailsSaved !== null) { this.game.world.contrails.enabled = this.contrailsSaved; this.contrailsSaved = null; }
  }

  // ---------------- replay (debrief) ----------------

  private debrief(real: number) {
    if (!this.flushed) { this.flushed = true; this.replay.flush(); }
    if (this.mode !== 'none') return;
    this.mountT -= real;
    if (this.mountT > 0) return;
    this.mountT = 0.25;
    this.theatre.mountDebrief();
    if (!this.replay.hasClip) return;
    // the debrief panel is rebuilt by UI.debrief (e.g. back from the Armory): re-add the button
    const row = document.querySelector('#debrief.show .row');
    if (!row || row.querySelector('[data-replay]')) return;
    const b = document.createElement('button');
    b.className = 'btn ghost';
    b.dataset.replay = '1';
    b.textContent = tx('▶ Replay best moment');
    b.addEventListener('click', () => this.startReplay());
    row.prepend(b);
  }

  private startReplay() {
    if (this.mode !== 'none' || this.game.state !== 'debrief') return;
    const e = this.engine;
    this.snap.capture(e);
    this.mode = 'replay';
    if (!this.replay.start(() => this.replayEnded())) { this.mode = 'none'; this.snap.restore(e); return; }
    if (this.game.mission?.role === 'gunner') this.reveal.reveal(this.replay.liveModel);
    this.hud.hide(this.ui.canvas);
    document.getElementById('debrief')?.classList.remove('show');
    this.overlay.show(true, tx('REPLAY'), tx('BEST MOMENT'), tx('CLICK TO SKIP'));
    this.overlay.setFade(1);
    this.fadeIn = FADE_IN;
    cineLens(e, 50);
    e.post.film.setShot('cinema', 70);
    e.post.resetHistory();
    addEventListener('pointerdown', this.skipReplay, true);
    addEventListener('keydown', this.skipReplay, true);
  }

  private skipReplay = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    this.replay.stop();
  };

  private replayEnded() {
    removeEventListener('pointerdown', this.skipReplay, true);
    removeEventListener('keydown', this.skipReplay, true);
    this.engine.post.film.setShot(null);
    this.snap.restore(this.engine);
    this.reveal.restore();
    this.hud.restore();
    this.overlay.show(false);
    this.overlay.setFade(1);
    this.fadeIn = FADE_IN;
    this.mode = 'none';
    if (this.game.state === 'debrief') document.getElementById('debrief')?.classList.add('show');
  }

  // ---------------- shared ----------------

  interrupt() { this.end(true); this.overlay.setFade(0); this.fadeIn = 0; }

  /** Leave whatever sequence is running and give everything back. */
  private end(skipped = false) {
    const mode = this.mode;
    if (mode === 'none') return;
    if (mode === 'replay') { this.replay.stop(); return; }
    this.mode = 'none';
    if (this.inputOff) this.giveInput();
    this.rig.stop();
    this.engine.camera.up.set(0, 1, 0);
    this.engine.post.film.setShot(null);
    this.snap.restore(this.engine);
    this.reveal.restore();
    this.hud.restore();
    this.overlay.show(false);
    this.kc.victim = null;
    this.dr.focus = null;
    // back to the gun out of black (a skip comes out of half-black: it should feel instant)
    this.overlay.setFade(skipped ? 0.5 : 1);
    this.fadeIn = skipped ? FADE_IN * 0.5 : FADE_IN;
    if (mode === 'kill' || mode === 'drama' || mode === 'shot') {
      const e = this.engine;
      if (e.timeScale === this.lastSet) e.timeScale = 1;
      // a hit-stop that started during the kill cam restores our slow-mo when it ends: undo that too
      this.guardScale = this.lastSet; this.scaleGuard = 0.5;
    } else if (mode === 'flyby') this.finishFlyby();
  }

  private giveInput() {
    this.input.enabled = true;
    this.input.active = this.inputActive;
    this.inputOff = false;
  }

  private trackHealth(real: number) {
    const pl = this.game.world.player;
    this.hpT -= real;
    if (this.hpT > 0) return;
    this.hpT = 0.5;
    this.hp[this.hpI] = pl && pl.alive ? pl.integrity : 0;
    this.hpI = (this.hpI + 1) % this.hp.length;
  }

  private newMission() {
    if (this.mode !== 'none') this.end();
    this.replay.reset();
    this.theatre.newMission();
    this.director.newMission();
    this.lastKillCam = -1e9;
    this.pending = null;
    this.dramaReq = null;
    this.flyQueued = false;
    this.flyDone = null;
    this.restoreContrails();
    this.hp.fill(1);
    this.flushed = false;
  }
}
