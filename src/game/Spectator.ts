import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Input } from '../core/Input';
import type { Game } from './Game';
import type { CrewSeat } from '../net/Crew';
import { Fighter, type Aircraft } from '../world/Aircraft';
import { STATIONS, STATION_ORDER, type StationId } from '../world/B17Layout';
import { ModelReveal, cineLens } from './CineShared';
import { SpectatorHud } from '../ui/SpectatorHud';
import {
  ACTION_RANGE, CALM_SHOTS, SHOTS, cycleView, defaultView, nextShot, shotOffset, shouldCut, stationIndex, stationTarget,
  SHOT_SECONDS, type ShotKind, type SpecView,
} from './SpectatorRules';

// Spectator view for B-17 crew co-op (Phase 11 goal 34). A spectator is a guest without a gun:
// it joins a crew's spectator room, receives the same snapshots and events as the gunners (held
// back by the broadcast delay, CoopSession), and watches through this:
//
//   gun positions  the local gunner controller sits at the watched station and its target aim is
//                  set every frame from that gunner's streamed aim (`ca`), so the view is the real
//                  first-person one (interior, sight, recoil spring) and turns as that gunner turns
//   cinematic      an automatic camera outside the ship: chase, wing, belly and head-on shots of our
//                  B-17, and an over-the-shoulder shot past it at the nearest fighter whenever one
//                  comes within 1.8 km (SpectatorRules.nextShot / shouldCut)
//
// The spectator's own input never reaches the gun (Input.enabled stays off while watching; the
// view keys are read here), so nothing is fired or sent. Hooks: CoopSession.guestTick -> pre()
// (before the gunner controller), Game.frame -> coop.afterView() -> post() (after Cinematics).
// Nothing here allocates per frame.

export interface SpectatorHost {
  crew(): readonly CrewSeat[];        // the humans aboard (host id 0)
  readonly myId: number;
  readonly aims: Float32Array;        // absolute yaw, pitch per station (STATION_ORDER)
  readonly fire: number;              // guns firing (bit per station)
  delay(): number;                    // broadcast delay, s
  waiting(): boolean;                 // no snapshot yet: the picture has not started
  station(id: StationId): void;       // move the local gunner (no crew-seat check)
  leave(): void;
}

const UP = new THREE.Vector3(0, 1, 0);
const _cam = new THREE.Vector3(), _look = new THREE.Vector3(), _dir = new THREE.Vector3(), _side = new THREE.Vector3();
const _tgt = { y: 0, p: 0 };

export class Spectator {
  active = false;
  view: SpecView = 'cine';
  private hud: SpectatorHud;
  private reveal = new ModelReveal();
  private revealed = false;
  private hudT = 0;
  private inputWas = true;
  // cinematic camera
  shot: ShotKind | null = null;
  private shotT = 0;
  private calmIdx = 0;
  private subject: Aircraft | null = null;
  private side = 1;
  private lookS = new THREE.Vector3();
  private lookInit = false;

  constructor(private game: Game, private engine: Engine, private input: Input, private host: SpectatorHost) {
    this.hud = new SpectatorHud((v) => this.setView(v), () => host.leave());
  }

  /** The round starts: watch the host's gun (or the first crewed one, or the cinematic camera). */
  begin() {
    if (!this.active) {
      this.active = true;
      this.inputWas = this.input.enabled;
      (this.input as any).lock = () => {};   // no pointer lock: the cursor stays free for the view bar
      window.addEventListener('keydown', this.onKey);
    }
    this.shot = null; this.subject = null; this.calmIdx = 0; this.lookInit = false;
    this.setView(defaultView(this.host.crew()));
    this.hud.show(true);
    this.hudT = 0;
  }

  end() {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener('keydown', this.onKey);
    this.input.enabled = this.inputWas;
    delete (this.input as any).lock;
    this.leaveCine();
    this.hud.show(false);
  }

  setView(v: SpecView) {
    if (v !== 'cine') this.host.station(v);
    if (v !== 'cine' && this.view === 'cine') this.leaveCine();
    if (v === 'cine' && this.view !== 'cine') { this.shot = null; this.lookInit = false; }
    this.view = v;
    this.hudT = 0;
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.active || e.repeat || (e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return;
    const st = STATION_ORDER.find(s => e.code === 'Digit' + STATIONS[s].key || e.code === 'Numpad' + STATIONS[s].key);
    if (st) this.setView(st);
    else if (e.code === 'KeyC' || e.code === 'Digit6' || e.code === 'Numpad6') this.setView('cine');
    else if (e.code === 'ArrowRight' || e.code === 'KeyE') this.setView(cycleView(this.view, document.documentElement.dir === 'rtl' ? -1 : 1));
    else if (e.code === 'ArrowLeft' || e.code === 'KeyQ') this.setView(cycleView(this.view, document.documentElement.dir === 'rtl' ? 1 : -1));
    else return;
    e.preventDefault();
  };

  /** Before the gunner controller: no player input at the gun; the watched gunner's aim instead. */
  pre() {
    if (!this.active) return;
    const inp = this.input;
    inp.enabled = false;
    inp.mouseDX = 0; inp.mouseDY = 0; inp.wheel = 0;
    const gun = this.game.gunner;
    gun.assist = 0;   // no aim magnetism pulling the watched aim about
    if (this.view === 'cine' || !gun.bomber) return;
    if (gun.station !== this.view && gun.transition <= 0) this.host.station(this.view);
    if (gun.station !== this.view) return;
    const i = stationIndex(this.view) * 2, def = STATIONS[this.view];
    stationTarget(def, this.host.aims[i], this.host.aims[i + 1], _tgt);
    const s = gun.state;
    s.tYaw = _tgt.y; s.tPitch = _tgt.p;
  }

  /** After the controllers and Cinematics: the cinematic camera, then the overlay. */
  post(dt: number) {
    if (!this.active) return;
    const real = dt / Math.max(0.05, this.engine.timeScale);
    if (this.view === 'cine') this.cinematic(real);
    this.hudT -= real;
    if (this.hudT <= 0) {
      this.hudT = 0.2;
      this.hud.update(this.view, this.host.crew(), this.host.myId, this.host.fire, this.host.delay(), this.host.waiting());
    }
  }

  private leaveCine() {
    if (!this.revealed) return;
    this.reveal.restore();
    this.revealed = false;
    this.engine.post.film.setShot(null);
    this.engine.camera.up.copy(UP);
    this.engine.post.resetHistory();
  }

  // ---------------- cinematic camera ----------------

  /** The nearest live enemy fighter within ACTION_RANGE of our ship (null when none). */
  private threat(pb: Aircraft): Aircraft | null {
    let best: Aircraft | null = null, bd = ACTION_RANGE * ACTION_RANGE;
    for (const a of this.game.world.aircraft) {
      if (!a.alive || a.remove || a.team !== 'axis' || !(a instanceof Fighter)) continue;
      const d = a.pos.distanceToSquared(pb.pos);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  private cinematic(real: number) {
    const pb = this.game.world.playerBomber, e = this.engine, cam = e.camera;
    if (!pb) return;
    if (!this.revealed) { this.reveal.reveal(pb.model); this.revealed = true; e.post.film.setShot('cinema'); }
    const near = this.threat(pb);
    this.shotT += real;
    const gone = !this.subject || !this.subject.alive || this.subject.remove || this.subject.pos.distanceToSquared(pb.pos) > ACTION_RANGE * ACTION_RANGE * 1.6;
    if (!this.shot || shouldCut(this.shot, this.shotT, !!near, gone)) {
      const prev = this.shot;
      if (prev && prev !== 'action') this.calmIdx++;
      this.shot = nextShot(prev, !!near, this.calmIdx);
      this.shotT = 0;
      this.subject = this.shot === 'action' ? near : null;
      this.side = Math.random() < 0.5 ? -1 : 1;
      this.lookInit = false;
      e.post.resetHistory();   // no motion-blur smear across the cut
    }
    if (this.shot === 'action' && this.subject) {
      // over the shoulder: our B-17 big in the foreground, the fighter beyond it
      const f = this.subject;
      _dir.copy(f.pos).sub(pb.pos);
      const dist = _dir.length();
      _dir.multiplyScalar(1 / Math.max(1, dist));
      _side.crossVectors(_dir, UP);
      if (_side.lengthSq() < 1e-4) _side.set(1, 0, 0);
      _side.normalize().multiplyScalar(this.side);
      const u = this.shotT / SHOT_SECONDS.action;
      _cam.copy(pb.pos).addScaledVector(_dir, -46).addScaledVector(_side, 14 + 6 * u).addScaledVector(UP, 9);
      _look.copy(pb.pos).lerp(f.pos, Math.min(0.6, 220 / Math.max(220, dist) + 0.3));
      cineLens(e, 44);
    } else {
      const kind = (this.shot === 'action' ? CALM_SHOTS[this.calmIdx % CALM_SHOTS.length] : this.shot) as Exclude<ShotKind, 'action'>;
      const s = SHOTS[kind];
      pb.localToWorld(shotOffset(kind, this.shotT / SHOT_SECONDS[kind], _dir), _cam);
      pb.localToWorld(_dir.set(s.look[0], s.look[1], s.look[2]), _look);
      cineLens(e, s.fov);
    }
    // the look point follows smoothly (the camera itself rides with the ship: no jitter)
    if (!this.lookInit) { this.lookS.copy(_look).sub(pb.pos); this.lookInit = true; }
    else this.lookS.lerp(_dir.copy(_look).sub(pb.pos), 1 - Math.exp(-real * 5));
    cam.position.copy(_cam);
    cam.up.copy(UP);
    cam.lookAt(_look.copy(pb.pos).add(this.lookS));
    e.post.film.focusTarget = cam.position.distanceTo(pb.pos);
  }
}
