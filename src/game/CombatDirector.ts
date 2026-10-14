import * as THREE from 'three';
import type { Game } from './Game';
import { Aircraft, Bomber, Fighter } from '../world/Aircraft';
import { Atmos } from '../render/Atmosphere';
import type { ShotLook } from '../render/FilmParams';
import { access } from '../core/Accessibility';
import {
  DIRECTOR, closestApproach, directorLevel, killScale, passQualifies, passScale, pickKillCam, pickPassCam, shotAllowed, shotDuration,
  type Approach, type DirectorGate, type KillCam, type PassCam,
} from './CineDirectorRules';

// Combat director (Phase 10 goal 10): every now and then (Settings "Combat director": off /
// rare / often) a short cinematic cuts in, then hands the view straight back to the gun:
//   close pass   a fighter about to flash past the player's aircraft (closest approach in under
//                a second, a few wingspans out): slow motion through the pass, seen through the
//                waist window, from a wing-tip camera, or on a long lens from a neighbouring B-17
//   kill follow  an ordinary credited kill (the special ones keep Cinematics' kill cam): 2-3 s
//                following the breaking-up fighter on the 16 mm gun camera (B&W, 4:3), a
//                handheld chase camera, or a long lens from a neighbour, then back to the gun.
// The rules (CineDirectorRules.ts) keep it rare and out of critical moments: never in the
// tutorial or co-op, never in the bomb run, a boss fight, a station change, never when the
// player is hurt or under fire, never with another fighter pressing an attack; a cooldown and
// a per-mission cap. Cinematics.ts owns the shot (input, HUD, letterbox, lens restore); ShotRig
// below places the camera each frame from the live aircraft (no stored positions: the floating
// origin can rebase mid-shot) and tells Cinematics the slow motion and film look to use.

export interface ShotPlan {
  event: 'pass' | 'kill';
  cam: PassCam | KillCam;
  subject: Aircraft;
  host: Aircraft;               // the player's aircraft
  neighbour: Bomber | null;     // telephoto platform
  side: number;                 // +1: the subject is on the host's left (+X)
  tCpa: number;                 // pass: game s to closest approach at the start
}

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _ap: Approach = { t: 0, miss: 0, speed: 0 };
const _box = new THREE.Box3();
const _m = new THREE.Matrix4();

/** Half-span (x) and chord position (z) of an aircraft's wing tip in its root frame, measured
 *  once per model kind from the mesh bounds. */
const tips = new Map<string, { x: number; z: number }>();
const wingTip = (a: Aircraft) => wingTipOf(a.kind, a.root, a.model, a instanceof Bomber);
export function wingTipOf(kind: string, root: THREE.Object3D, model: THREE.Object3D, bomber: boolean): { x: number; z: number } {
  const key = `${kind}:${model.scale.x.toFixed(3)}`;
  let t = tips.get(key);
  if (t) return t;
  root.updateMatrixWorld(true);
  _m.copy(root.matrixWorld).invert();
  let bx = 0, bz = 0;
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    _box.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld).applyMatrix4(_m);
    const x = Math.max(Math.abs(_box.min.x), Math.abs(_box.max.x));
    if (x > bx) { bx = x; bz = (_box.min.z + _box.max.z) * 0.5; }
  });
  if (bx < 2) bx = bomber ? 15.7 : 5.2 * model.scale.x;
  t = { x: bx, z: THREE.MathUtils.clamp(bz, -3, 3) };
  tips.set(key, t);
  return t;
}

export class CombatDirector {
  shots = 0;
  private seq = 0;
  private killSeq = 0;
  private pendingKill: Aircraft | null = null;
  private lastShotAt = -1e9;
  private scanT = 0;

  constructor(private game: Game) {}

  get level() { return directorLevel(this.game.settings.cineDirector); }

  newMission() { this.shots = 0; this.pendingKill = null; this.lastShotAt = -1e9; }

  /** An ordinary credited kill (Cinematics hands over the ones its own kill cam doesn't take). */
  onKill(victim: Aircraft) {
    const lv = this.level;
    if (lv === 'off' || !(victim instanceof Fighter)) return;
    if (Math.random() < DIRECTOR[lv].killChance) this.pendingKill = victim;
  }

  /** Called by Cinematics when any cinematic ran (shared spacing). */
  noteCine(t: number) { this.lastShotAt = Math.max(this.lastShotAt, t); }

  /** Once per frame with nothing else playing. Returns a shot to start, or null. */
  poll(real: number, fit: boolean, sinceCine: number): ShotPlan | null {
    const g = this.game, w = g.world, m = g.mission, host = w.player;
    const kill = this.pendingKill;
    this.pendingKill = null;
    if (!m || !host || !host.alive || host.remove) return null;
    this.scanT -= real;
    if (!kill && this.scanT > 0) return null;
    this.scanT = 0.1;
    const lv = this.level;
    const gate: DirectorGate = {
      level: lv, missionTime: w.time, sinceLastCine: Math.min(sinceCine, w.time - this.lastShotAt), shots: this.shots,
      playing: g.state === 'playing', tutorial: !!m.tutorial, coop: !!g.coop.role, photo: g.photo.active,
      busy: g.bombardier.active || g.bombRun.holding || g.boss.active || g.ditching.active || g.formationReturn.active || (m.role === 'gunner' && g.gunner.transition > 0),
      fit, threats: 0,
    };
    if (kill) {
      if (kill.remove) return null;
      gate.threats = this.threats(host, kill, 1500);
      if (!shotAllowed(gate)) return null;
      const nb = this.neighbour(host, kill.pos);
      return this.plan('kill', pickKillCam(!!nb, this.killSeq++), kill, host, nb, 0);
    }
    if (lv === 'off' || gate.playing === false) return null;
    // close passes: the fighter about to flash past (closest approach soon, a few wingspans out)
    let best: Fighter | null = null, bestT = 0;
    const r = host.radius;
    for (const f of w.activeEnemies()) {
      if (!f.alive || f.remove || !w.enemyPilot(f)) continue;
      const ap = closestApproach(f.pos.x - host.pos.x, f.pos.y - host.pos.y, f.pos.z - host.pos.z, f.vel.x - host.vel.x, f.vel.y - host.vel.y, f.vel.z - host.vel.z, _ap);
      if (!passQualifies(ap, r)) continue;
      if (!best || ap.t < bestT) { best = f; bestT = ap.t; }
    }
    if (!best) return null;
    gate.threats = this.threats(host, best, 1200);
    if (!shotAllowed(gate) || Math.random() > DIRECTOR[lv].passChance) { this.scanT = 1.5; return null; }
    const nb = this.neighbour(host, best.pos);
    _a.copy(best.pos).sub(host.pos).applyQuaternion(_q.copy(host.quat).invert());
    const cam = pickPassCam(m.role === 'pilot' ? 'pilot' : 'gunner', w.playerStationId(), _a.y, !!nb, this.seq++);
    return this.plan('pass', cam, best, host, nb, bestT);
  }

  /** Dev / capture: a shot of the given kind now, on the nearest fighter. */
  force(event: 'pass' | 'kill', cam?: PassCam | KillCam): ShotPlan | null {
    const w = this.game.world, host = w.player;
    if (!host) return null;
    let f: Fighter | null = null, bd = Infinity;
    for (const e of w.activeEnemies()) { const d = e.pos.distanceToSquared(host.pos); if (e.alive && d < bd) { bd = d; f = e; } }
    if (!f) return null;
    if (event === 'pass') {
      // put it on a passing line: from ahead-left, crossing 35 m off the beam, 0.7 s to go
      const side = cam === 'waist' && w.playerStationId() === 'waistR' ? -1 : 1;
      _a.set(0, 0, 1).applyQuaternion(host.quat);              // host forward
      _b.set(1, 0, 0).applyQuaternion(host.quat).multiplyScalar(side);   // host left (x+)
      const rel = 150;                                          // m/s relative closing speed
      f.fm.vel.copy(host.vel).addScaledVector(_a, -rel * 0.9).addScaledVector(_b, -rel * 0.25).addScaledVector(UP, -rel * 0.05);
      f.vel.copy(f.fm.vel);
      _c.copy(f.vel).sub(host.vel);
      f.pos.copy(host.pos).addScaledVector(_b, host.radius * 1.6 + 8).addScaledVector(UP, -4).addScaledVector(_c, -0.7);
      f.quat.setFromUnitVectors(_c.set(0, 0, 1), _a.copy(f.vel).normalize());
      const relY = -4;
      const nb = this.neighbour(host, f.pos);
      const pc = (cam as PassCam) ?? pickPassCam(this.game.mission?.role === 'pilot' ? 'pilot' : 'gunner', w.playerStationId(), relY, !!nb, this.seq++);
      return this.plan('pass', pc, f, host, nb, 0.7);
    }
    const nb = this.neighbour(host, f.pos);
    w.killAircraft(f, true, 'dev');
    return this.plan('kill', (cam as KillCam) ?? pickKillCam(!!nb, this.killSeq++), f, host, nb, 0);
  }

  private plan(event: 'pass' | 'kill', cam: PassCam | KillCam, subject: Aircraft, host: Aircraft, neighbour: Bomber | null, tCpa: number): ShotPlan {
    if (cam === 'telephoto' && !neighbour) cam = event === 'pass' ? 'wingtip' : 'chase';
    _a.copy(subject.pos).sub(host.pos).applyQuaternion(_q.copy(host.quat).invert());
    this.shots++;
    this.lastShotAt = this.game.world.time;
    return { event, cam, subject, host, neighbour, side: _a.x >= 0 ? 1 : -1, tCpa };
  }

  // other fighters pressing an attack nearby (closing, or already close)
  private threats(host: Aircraft, except: Aircraft, range: number): number {
    let n = 0;
    for (const f of this.game.world.activeEnemies()) {
      if (f === except || !f.alive || !this.game.world.enemyPilot(f)) continue;
      _a.copy(f.pos).sub(host.pos);
      const d = _a.length();
      if (d > range) continue;
      _b.copy(f.vel).sub(host.vel);
      if (d < 500 || _a.dot(_b) < 0) n++;
    }
    return n;
  }

  // a neighbouring B-17 to film from: 80-650 m out, nearest to the action wins
  private neighbour(host: Aircraft, at: THREE.Vector3): Bomber | null {
    let best: Bomber | null = null, bd = Infinity;
    for (const b of this.game.world.bombers()) {
      if (b === host || !b.alive || b.straggling) continue;
      const dh = b.pos.distanceTo(host.pos);
      if (dh < 80 || dh > 650) continue;
      const d = b.pos.distanceTo(at);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
}

// ---------------------------------------------------------------- camera rig

const LOOK: Record<PassCam | KillCam, ShotLook> = { waist: 'cinema', wingtip: 'cinema', telephoto: 'telephoto', gunCam: 'gunCamera', chase: 'cinema' };

export class ShotRig {
  plan: ShotPlan | null = null;
  t = 0;                 // real s
  dur = 3;
  gameT = 0;             // game s since the start
  scale = 1;             // slow motion this rig wants
  fov = 50;
  focus = 100;           // m, camera to subject
  readonly refVel = new THREE.Vector3();   // what the camera travels with (per-object blur reference)
  private dir = new THREE.Vector3();       // smoothed look direction (rebase-proof)
  private localEye = new THREE.Vector3();  // gun camera: the gunner's eye in the host frame
  private anchor = new THREE.Vector3();    // chase: absolute (origin offset added back)
  private anchorVel = new THREE.Vector3();
  private focusP = new THREE.Vector3();    // absolute subject point (extrapolated once it is gone)
  private focusVel = new THREE.Vector3();
  private phase = [0, 0, 0, 0];
  private init = false;

  get look(): ShotLook { return this.plan ? LOOK[this.plan.cam] : 'cinema'; }
  /** Wider screen for the 16 mm gun camera (4:3 pillarbox), letterbox otherwise. */
  get academy() { return this.plan?.cam === 'gunCam'; }
  /** The camera sits inside the player's aircraft (no exterior reveal). */
  get inside() { return this.plan?.cam === 'waist' || (this.plan?.cam === 'gunCam' && this.plan.host instanceof Bomber); }

  start(plan: ShotPlan, cam: THREE.PerspectiveCamera) {
    this.plan = plan;
    this.t = 0; this.gameT = 0; this.init = false;
    const calm = access.prefs.reduceMotion;
    this.dur = shotDuration(plan.event, calm);
    this.scale = 1;
    for (let i = 0; i < 4; i++) this.phase[i] = Math.random() * 100;
    const off = Atmos.originOffset, s = plan.subject;
    this.focusP.copy(s.pos).add(off); this.focusVel.copy(s.vel);
    this.anchor.copy(this.focusP); this.anchorVel.copy(s.vel);
    plan.host.root.updateMatrixWorld();
    this.localEye.copy(cam.position);
    plan.host.root.worldToLocal(this.localEye);
    cam.getWorldDirection(this.dir);
  }

  stop() { this.plan = null; }

  /** Per frame (real s, game s). Returns false when the shot is over. */
  update(cam: THREE.PerspectiveCamera, real: number, dt: number): boolean {
    const p = this.plan;
    if (!p) return false;
    this.t += real; this.gameT += dt;
    if (this.t >= this.dur || p.host.remove) return false;
    const calm = access.prefs.reduceMotion;
    const u = this.t / this.dur;
    const want = p.event === 'pass' ? passScale(this.gameT, p.tCpa, calm) : killScale(u, calm);
    this.scale += (want - this.scale) * (1 - Math.exp(-real * (want > this.scale ? 5 : 12)));
    if (calm) this.scale = 1;
    const off = Atmos.originOffset, s = p.subject, host = p.host;
    // the subject (or, once it has broken up and gone, where its wreckage is falling)
    if (!s.remove) { this.focusP.copy(s.pos).add(off); this.focusVel.copy(s.vel); }
    else if (dt > 0) {
      this.focusVel.y -= 9.81 * 0.8 * dt;
      this.focusP.addScaledVector(this.focusVel, dt);
    }
    this.anchor.addScaledVector(this.anchorVel, dt);
    const subj = _c.copy(this.focusP).sub(off);     // scene coordinates this frame
    host.root.updateMatrixWorld();
    let fov = 50, shake = 0;
    cam.up.copy(UP);
    switch (p.cam) {
      case 'waist': {
        // inboard, across the waist from the window the fighter passes: the window frame and the
        // gun in the (defocused) foreground, the pass beyond it
        _a.set(-p.side * 0.12, 0.42, -8.15);
        host.root.localToWorld(_a);
        cam.position.copy(_a);
        // look out of the window, swinging part-way with the fighter (never off the window)
        _b.set(p.side * 0.84, 0.36, -7.45);
        host.root.localToWorld(_b).sub(_a).normalize();
        _a.copy(subj).sub(cam.position).normalize();
        const k = THREE.MathUtils.clamp(_a.dot(_b), 0, 1);
        _b.lerp(_a, 0.3 * k).normalize();
        this.lookAlong(cam, _b, real, 9);
        fov = 54 - 6 * u;
        this.refVel.copy(host.vel);
        break;
      }
      case 'wingtip': {
        // rigid wing camera at the tip on the pass side, looking back inboard at the fuselage
        const tip = wingTip(host);
        _a.set(p.side * (tip.x - 0.4), host instanceof Bomber ? 0.75 : 0.3, tip.z - (host instanceof Bomber ? 1.2 : 0.5));
        host.root.localToWorld(_a);
        cam.position.copy(_a);
        cam.up.set(0, 1, 0).applyQuaternion(host.quat);
        _b.set(0, 0.8, host instanceof Bomber ? -3 : -1);
        host.root.localToWorld(_b);
        _b.lerp(subj, 0.38).sub(cam.position).normalize();
        this.lookAlong(cam, _b, real, 10);
        fov = 70;
        shake = 0.0006;   // engine vibration through the spar
        this.refVel.copy(host.vel);
        break;
      }
      case 'telephoto': {
        // a long lens from a neighbouring B-17's waist window, panning by hand
        const nb = p.neighbour!;
        if (nb.remove) return false;
        nb.root.updateMatrixWorld();
        // frame the subject (and, for a pass, the player's ship it flashes past)
        const look = p.event === 'pass' ? _a.copy(host.pos).lerp(subj, 0.72) : _a.copy(subj);
        // the camera leans out of the waist window on the side that faces the action
        _b.copy(look);
        nb.root.worldToLocal(_b);
        _b.set(Math.sign(_b.x || 1) * 1.55, 0.75, -7.2);
        nb.root.localToWorld(_b);
        cam.position.copy(_b);
        const dist = look.distanceTo(cam.position);
        const half = p.event === 'pass' ? Math.max(22, subj.distanceTo(host.pos) * 0.65 + 14) : s.radius * 3 + 12;
        fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(half / Math.max(1, dist))), 4, 26);
        _b.copy(look).sub(cam.position).normalize();
        this.lookAlong(cam, _b, real, 4.5);
        shake = 0.0016 * (fov / 12);
        this.refVel.copy(nb.vel);
        break;
      }
      case 'gunCam': {
        // the 16 mm gun camera: on the gun (gunner) or in the wing root (P-51), panned by the gun
        if (host instanceof Bomber) _a.copy(this.localEye);
        else _a.set(p.side * 1.7, -0.2, 0.7);
        host.root.localToWorld(_a);
        cam.position.copy(_a);
        _b.copy(subj).sub(cam.position).normalize();
        this.lookAlong(cam, _b, real, 3.2);
        fov = 24;
        shake = 0.0022;   // the gun hammering
        this.refVel.copy(host.vel);
        break;
      }
      case 'chase': {
        // handheld chase: keeps pace with where the fighter was flying as it comes apart
        const r = THREE.MathUtils.clamp(s.radius * 4.2, 28, 70);
        _a.copy(this.anchorVel);
        if (_a.lengthSq() < 1) _a.set(0, 0, 1).applyQuaternion(s.quat);
        _a.normalize();
        _b.crossVectors(UP, _a).normalize();
        cam.position.copy(this.anchor).sub(off).addScaledVector(_a, -r * (0.7 + 0.35 * u)).addScaledVector(_b, (p.side || 1) * r * 0.55).addScaledVector(UP, r * 0.22);
        _b.copy(subj).sub(cam.position).normalize();
        this.lookAlong(cam, _b, real, 7);
        fov = 36 - 5 * u;
        shake = 0.0028;
        this.refVel.copy(this.anchorVel);
        break;
      }
    }
    // never inside the player's aircraft (outside cameras)
    if (!this.inside) {
      const d = cam.position.distanceTo(host.pos), min = p.cam === 'wingtip' ? 0 : host.radius * 1.2;
      if (d < min && d > 1e-3) cam.position.sub(host.pos).multiplyScalar(min / d).add(host.pos);
    }
    // handheld: slow, layered sway (none with Reduce motion)
    if (shake > 0 && !calm) {
      const tt = this.t, ph = this.phase;
      cam.rotateX(shake * (Math.sin(tt * 1.7 + ph[0]) + 0.5 * Math.sin(tt * 4.3 + ph[1]) + 0.25 * Math.sin(tt * 11.0 + ph[2])));
      cam.rotateY(shake * (Math.sin(tt * 1.3 + ph[1]) + 0.5 * Math.sin(tt * 3.7 + ph[3])));
      cam.rotateZ(shake * 0.6 * Math.sin(tt * 0.9 + ph[2]));
    }
    this.fov = fov;
    this.focus = Math.max(1, cam.position.distanceTo(subj));
    return true;
  }

  // smoothed look direction (an operator's pan lags a little), then aim the camera along it
  private lookAlong(cam: THREE.PerspectiveCamera, want: THREE.Vector3, real: number, rate: number) {
    if (!this.init || real <= 0) { this.dir.copy(want); this.init = true; }
    else this.dir.lerp(want, 1 - Math.exp(-real * rate)).normalize();
    cam.lookAt(_b.copy(cam.position).add(this.dir));
  }
}
