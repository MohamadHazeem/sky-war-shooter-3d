import * as THREE from 'three';
import type { Game } from './Game';
import type { Mission } from './Missions';
import type { Fighter } from '../world/Aircraft';
import { STATIONS, dirFromYawPitch, type StationId } from '../world/B17Layout';
import { segSphere } from '../world/Ballistics';
import { tintModel } from '../world/EnemyTypes';
import { gunLead } from '../world/Gunnery';
import { projectMarker } from '../ui/MarkerProjection';
import { CANVAS_MONO, num, tx } from '../i18n';
import {
  CABLE, COACH_TEXT, GhostRecorder, SCORE, SLEEVE_HP, TAIL, accuracyBonus, coachLead, downPoints, ghostAt, leadDegrees,
  passPoint, passVelocity, timeline, type Drill, type Ghost, type GhostSample, type Window,
} from './GunneryRangeRules';
import { harmless } from './TrainingDrones';

// Gunnery Range 2.0 (Phase 11 goal 35): a free practice flight. The drill's targets — gunless
// target drones and cloth sleeves towed on a cable behind a tow ship — fly straight passes on
// rails in the bomber's frame (GunneryRangeRules: the same passes at the same moments on every
// run, so the ghost of the best run lines up). Game hooks go through Onboarding (start / direct /
// update, like the Gunnery School) and GameHud.drawOverlay (the lead tutor and the ghost sight).

export const RANGE_MISSION = (station: StationId, title: string): Mission => ({
  id: 'range', number: 0, tutorial: true, range: true,
  title, target: 'Gunnery range', date: 'Practice flight · over the Wash', role: 'gunner', station,
  briefing: ['A practice flight over the Wash. Target drones and towed sleeves only — nobody shoots back.'],
  objectives: ['Shoot the drill'],
  bombers: 6, waves: [], duration: 9999, maxBombersLost: 99, playerArmor: 0, midRound: false, specials: false, boss: false,
  weather: { sunEl: 44, sunAz: 200, low: 0.4, high: 0.25, contrails: true },
});

export interface RangeRun { drill: Drill; tutor: boolean; ghost: Ghost | null }
export interface RangeResult {
  drill: Drill; score: number; points: number; bonus: number; hits: number; shots: number;
  downed: number; total: number; ghost: Ghost; ghostScore: number | null;
}
export interface RangeHost { done(r: RangeResult): void }

interface Sleeve { mesh: THREE.Group; cable: THREE.Mesh; hits: number; falling: boolean; vel: THREE.Vector3; t: number }
interface Target {
  win: Window;
  f: Fighter | null;        // the drone, or the tow ship of a sleeve
  sleeve: Sleeve | null;
  downed: boolean;
  head: number; bank: number;
  pos: THREE.Vector3;       // the thing to shoot at (drone or sleeve), world
  vel: THREE.Vector3;       // its world velocity
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1), _up = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Vector3();
const _p = { x: 0, y: 0, z: 0 };
const _g: GhostSample = { yaw: 0, pitch: 0, score: 0, on: false };
const _lead = new THREE.Vector3(), _aim = new THREE.Vector3(), _o = new THREE.Vector3();
// The sleeve is drawn (and hit) larger than life, like the game's fighters (World.ENEMY_SCALE ×6):
// a true 7 m sleeve is two pixels wide at 600 m. Five orange and white bands, mouth forward.
const SLEEVE_LEN = 40, SLEEVE_R = 3.4, SLEEVE_BANDS = 5;
const SLEEVE_SPHERES = [-SLEEVE_LEN * 0.3, 0, SLEEVE_LEN * 0.3];   // three hit spheres along its length
const SLEEVE_HIT_R = SLEEVE_R * 1.5;
// the tow ship flies a cable's length beyond the sleeve (~850 m at the drilled range): drawn at ×8
// and in tow-target yellow so it reads as an aircraft there, not a speck
const TOW_SCALE = 8;
const TOW_TINT = new THREE.Color(2.6, 2.1, 0.45);
// the cable is kept at least ~2 px thick on screen: radius grows with distance from the eye
const CABLE_PX = 0.0016;
// the tutor's labels and the ghost marker keep clear of the gun's sight ring, the target and each other
const PLATE_PAD = 6;
const RING_OUTER = 0.0682;   // the ring sight's torus: 0.066 m radius + 0.0022 m tube (Viewmodels.buildM2)
const _rc = new THREE.Vector3(), _re = new THREE.Vector3();
const DRONE_TINT = new THREE.Color(2.6, 1.25, 0.32);   // target-drone orange over the Fw 190 paint
/** Does the rectangle (x, y, w, h) touch the circle (cx, cy, r)? */
const rectCircle = (x: number, y: number, w: number, h: number, cx: number, cy: number, r: number) => {
  const dx = cx - Math.min(Math.max(cx, x), x + w), dy = cy - Math.min(Math.max(cy, y), y + h);
  return dx * dx + dy * dy < r * r;
};
const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;

export class GunneryRange {
  active = false;
  phase: 'intro' | 'run' | 'result' | 'over' = 'over';
  run: RangeRun | null = null;
  t = 0;                          // drill clock (s)
  points = 0;                     // hit and kill points so far
  downed = 0;
  private wins: Window[] = [];
  private idx = 0;                // next window to open
  private cur: Target | null = null;
  private hits0 = 0; private shots0 = 0; private droneHits = 0; private sleeveHits = 0;
  private rec = new GhostRecorder();
  private resultT = 0;
  private result: RangeResult | null = null;
  private card: HTMLElement | null = null;
  private lastHtml = '';
  private prevGround: typeof this.game.world.ballistics.ground = null;
  private sleeveMats: THREE.MeshStandardMaterial[] | null = null;
  private cableMat: THREE.MeshStandardMaterial | null = null;
  private sleeveGeos: THREE.BufferGeometry[] | null = null;
  private cableGeo: THREE.CylinderGeometry | null = null;
  coach: string = '';             // last coaching word (dev / tests)
  readonly plate = { x: 0, y: 0, w: 0, h: 0, ringX: 0, ringY: 0, ringR: 0 };   // last tutor plate and ring sight (dev / tests)
  readonly lead = new THREE.Vector3();   // the tutor's lead point this frame (world; valid while leadOn)
  leadOn = false;
  readonly log: string[] = [];

  constructor(private game: Game, private host: RangeHost) {}

  // ---------------- lifecycle ----------------
  /** The run to fly next (set by the range screen before the mission starts; kept for Restart). */
  prepare(run: RangeRun) { this.run = run; }

  start() {
    this.stop();
    if (!this.run) return;
    this.active = true;
    this.phase = 'intro';
    this.t = 0; this.points = 0; this.downed = 0; this.idx = 0; this.cur = null;
    this.droneHits = 0; this.sleeveHits = 0; this.result = null; this.resultT = 0;
    this.wins = timeline(this.run.drill);
    this.rec = new GhostRecorder();
    this.log.length = 0;
    const w = this.game.world;
    this.hits0 = w.stats.hits; this.shots0 = w.stats.shots;
    this.prevGround = w.ballistics.ground;
    w.ballistics.ground = this.sleeveHit;
    this.card = document.createElement('div');
    this.card.id = 'rangeCard';
    this.card.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.card);
    this.lastHtml = '';
    this.render();
  }

  stop() {
    if (this.active) {
      const w = this.game.world;
      if (w.ballistics.ground === this.sleeveHit) w.ballistics.ground = this.prevGround;
    }
    this.clearTarget();
    this.active = false;
    this.phase = 'over';
    this.card?.remove();
    this.card = null;
  }

  get drillTime() { return this.t; }
  /** The lead tutor replaces the ordinary lead pip while it is on. */
  get tutorOn() { return this.active && !!this.run?.tutor; }
  get length() { const l = this.wins[this.wins.length - 1]; return l ? l.start + l.half * 2 + TAIL : 0; }
  get current() { return this.cur; }

  // Onboarding.direct → here, replacing the battle director while the range mission runs
  update(dt: number) {
    if (!this.active || !this.run) return;
    const g = this.game, w = g.world;
    // a harmless sky, re-asserted every frame (loadouts and perks rewrite these)
    w.playerDamageScale = 0; w.aiGunnerFactor = 0; w.flakIntensity = 0; w.playerFocus = 1;
    if (this.card) this.card.classList.toggle('show', g.state === 'playing');
    if (g.state !== 'playing') return;
    this.t += dt;
    if (this.phase === 'result') {
      this.resultT += dt;
      if (this.resultT > 3 && this.result) { const r = this.result; this.phase = 'over'; this.stop(); this.host.done(r); }
      return;
    }
    if (this.phase === 'intro' && this.wins.length && this.t >= this.wins[0].start - 0.5) this.phase = 'run';
    this.updateTarget(dt);
    // open the next pass on time, whatever happened to the last one
    const next = this.wins[this.idx];
    if (next && this.t >= next.start) { this.clearTarget(); this.spawn(next); this.idx++; }
    // ghost: where this run aimed, on the drill's clock
    const b = w.playerBomber;
    if (b) {
      b.worldToLocal(_v.copy(g.gunner.aimDirection(_v2)).add(b.pos), _v3);
      this.rec.sample(this.t, Math.atan2(_v3.x, _v3.z), Math.asin(THREE.MathUtils.clamp(_v3.y, -1, 1)), this.score);
    }
    if (this.t >= this.length) this.finish();
    g.score = this.points;   // the HUD's score line shows the range score
    this.render();
  }

  /** Live score: hit and kill points (the accuracy bonus is added at the end). */
  get score() { return this.points; }
  get hits() { return this.droneHits + this.sleeveHits; }
  get shots() { return this.game.world.stats.shots - this.shots0; }

  private finish() {
    if (!this.run) return;
    this.clearTarget();
    const shots = this.shots, hits = Math.min(this.hits, shots);
    const bonus = accuracyBonus(hits, shots);
    const score = this.points + bonus;
    this.rec.sample(this.t, 0, 0, score);
    const gh = this.run.ghost;
    this.result = {
      drill: this.run.drill, score, points: this.points, bonus, hits, shots, downed: this.downed, total: this.wins.length,
      ghost: this.rec.g, ghostScore: gh && gh.score.length ? gh.score[gh.score.length - 1] : null,
    };
    this.log.push(`done ${score} (${this.downed}/${this.wins.length}, ${hits}/${shots})`);
    this.phase = 'result'; this.resultT = 0;
    this.render();
  }

  // ---------------- targets ----------------
  private spawn(win: Window) {
    const g = this.game, w = g.world;
    const b = w.playerBomber;
    if (!b) return;
    const tg: Target = { win, f: null, sleeve: null, downed: false, head: NaN, bank: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() };
    this.place(tg);
    if (win.spec.kind === 'drone') {
      const f = w.spawnEnemy(tg.pos.clone(), 'beam', 0.5, false, false, 'fw190', DRONE_TINT);
      harmless(f, 0.3);
      f.label = 'Target drone';
      tg.f = f;
    } else {
      const f = w.spawnEscort(tg.pos.clone(), new THREE.Vector3(), 'p47d');
      f.guns = [];
      f.setScale(TOW_SCALE);
      tintModel(f.model, TOW_TINT);
      f.label = 'Tow ship';
      tg.f = f;
      tg.sleeve = this.makeSleeve();
    }
    const f = tg.f!;
    (w as any).pilots?.delete?.(f);   // flown on rails, not by the AI
    const orig = f.update.bind(f);
    (f as any).update = (dt: number) => {
      if (!f.alive) { orig(dt); return; }
      this.fly(tg, f, dt);
      f.updateProps(dt, 0.9);
    };
    this.fly(tg, f, 0);
    this.cur = tg;
    this.log.push(`pass ${this.idx + 1} ${win.spec.kind} @${this.t.toFixed(1)}s`);
  }

  /** Position and world velocity of the shootable part at pass time s (from the pass middle). */
  private place(tg: Target) {
    const b = this.game.world.playerBomber!;
    const st = this.run!.drill.station;
    const s = this.t - tg.win.start - tg.win.half;
    passPoint(tg.win.spec, st, s, _p);
    tg.pos.set(_p.x, _p.y, _p.z).add(STATIONS[st].pivot);
    b.localToWorld(tg.pos, tg.pos);
    passVelocity(tg.win.spec, st, _p);
    tg.vel.set(_p.x, _p.y, _p.z).applyQuaternion(b.quat).add(b.vel);
  }

  private fly(tg: Target, f: Fighter, dt: number) {
    if (!this.game.world.playerBomber) return;
    this.place(tg);
    // the drone is the target; a tow ship flies a cable's length ahead of its sleeve
    const p = _v.copy(tg.pos);
    if (tg.sleeve) p.addScaledVector(_v2.copy(tg.vel).normalize(), CABLE);
    f.vel.copy(tg.vel);
    f.fm.vel.copy(tg.vel);
    f.root.position.copy(p);
    const head = Math.atan2(f.vel.x, f.vel.z);
    if (dt > 0 && Number.isFinite(tg.head)) {
      let dh = head - tg.head;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      tg.bank += (THREE.MathUtils.clamp(-dh / dt * 2.5, -0.9, 0.9) - tg.bank) * Math.min(1, dt * 3);
    }
    tg.head = head;
    if (f.vel.lengthSq() > 1) {
      _m.lookAt(f.vel, ZERO, _up);
      f.root.quaternion.setFromRotationMatrix(_m).multiply(_q.setFromAxisAngle(_z, tg.bank));
    }
  }

  private updateTarget(dt: number) {
    const tg = this.cur;
    if (!tg) return;
    const end = tg.win.start + tg.win.half * 2;
    const frac = (this.t - tg.win.start) / (tg.win.half * 2);
    // drone: shot down by the world's own damage model
    if (tg.f && tg.win.spec.kind === 'drone' && !tg.f.alive && !tg.downed) {
      tg.downed = true; this.downed++;
      this.points += downPoints(frac);
      this.log.push(`down ${this.downed} @${frac.toFixed(2)}`);
    }
    // hits on drones: every player round that struck an axis aircraft (only drones fly here)
    const hitsNow = this.game.world.stats.hits - this.hits0;
    if (hitsNow > this.droneHits) { this.points += (hitsNow - this.droneHits) * SCORE.hit; this.droneHits = hitsNow; }
    const sl = tg.sleeve;
    if (sl) this.updateSleeve(tg, sl, dt, frac);
    if (this.t >= end && !(sl && sl.falling)) this.clearTarget();
  }

  private updateSleeve(tg: Target, sl: Sleeve, dt: number, frac: number) {
    const w = this.game.world;
    if (!sl.falling && sl.hits >= SLEEVE_HP && !tg.downed) {
      tg.downed = true; this.downed++;
      this.points += downPoints(frac);
      sl.falling = true; sl.t = 0; sl.vel.copy(tg.vel);
      sl.cable.visible = false;
      w.effects.spawnDebris(tg.pos, tg.vel, 6, false, undefined, 0.5);
      this.log.push(`sleeve shredded ${this.downed} @${frac.toFixed(2)}`);
    }
    if (sl.falling) {
      // the cloth tumbles away behind the formation
      sl.t += dt;
      sl.vel.y -= 9.81 * dt; sl.vel.multiplyScalar(Math.exp(-dt * 0.9));
      sl.mesh.position.addScaledVector(sl.vel, dt);
      sl.mesh.rotateX(dt * 1.7); sl.mesh.rotateZ(dt * 0.9);
      tg.pos.copy(sl.mesh.position);
      if (sl.t > 3.5) { this.removeSleeve(sl); tg.sleeve = null; }
      return;
    }
    // trail behind the tow ship: the sleeve's long axis along the flight path
    sl.mesh.position.copy(tg.pos);
    _v.copy(tg.vel).normalize();
    sl.mesh.quaternion.setFromUnitVectors(_up, _v);
    const tow = tg.f!.pos;
    sl.cable.position.copy(tg.pos).add(tow).multiplyScalar(0.5);
    sl.cable.quaternion.setFromUnitVectors(_up, _v2.copy(tow).sub(tg.pos).normalize());
    const cr = Math.max(0.3, this.game.engine.camera.position.distanceTo(sl.cable.position) * CABLE_PX);
    sl.cable.scale.set(cr, tow.distanceTo(tg.pos), cr);
    // shredding: the cloth thins and greys as it takes hits
    const k = Math.min(1, sl.hits / SLEEVE_HP);
    sl.mesh.scale.set(1 - 0.35 * k, 1, 1 - 0.35 * k);
  }

  // Ballistics.ground: asked about every round that hit no aircraft this step
  private sleeveHit = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, axis: boolean, _dmg: number, player: boolean): boolean => {
    const prev = this.prevGround;
    const sl = this.cur?.sleeve;
    if (player && !axis && sl && !sl.falling) {
      const p = sl.mesh.position;
      const r = SLEEVE_HIT_R * this.game.world.ballistics.playerHitScale;
      _o.set(0, 1, 0).applyQuaternion(sl.mesh.quaternion);
      for (const k of SLEEVE_SPHERES) {
        if (segSphere(ax, ay, az, bx, by, bz, p.x + _o.x * k, p.y + _o.y * k, p.z + _o.z * k, r) >= 0) {
          sl.hits++; this.sleeveHits++;
          this.points += SCORE.sleeveHit;
          this.game.hud.hitMarkerT = 0.12;
          this.game.world.effects.hitFlash(_aim.set(bx, by, bz), this.cur!.vel);
          return true;
        }
      }
    }
    return prev ? prev(ax, ay, az, bx, by, bz, axis, _dmg, player, null, false) : false;
  };

  private clearTarget() {
    const tg = this.cur;
    if (!tg) return;
    if (tg.f && tg.f.alive) tg.f.remove = true;
    if (tg.sleeve) this.removeSleeve(tg.sleeve);
    this.cur = null;
  }

  private makeSleeve(): Sleeve {
    // plain double-sided standard materials (emissive is a uniform): World.prewarm already compiled
    // that program. Bright orange and white bands so the cloth reads against haze and cloud.
    this.sleeveMats ??= [
      new THREE.MeshStandardMaterial({ color: 0xff5a0a, emissive: 0x8a2c00, roughness: 0.9, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0xfaf6ea, emissive: 0x4a4842, roughness: 0.9, side: THREE.DoubleSide }),
    ];
    this.cableMat ??= new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
    if (!this.sleeveGeos) {
      // a tapering cone in bands, +Y (the open mouth) towards the tow ship
      const step = SLEEVE_LEN / SLEEVE_BANDS, rAt = (i: number) => SLEEVE_R * (1 - 0.35 * i / SLEEVE_BANDS);
      this.sleeveGeos = Array.from({ length: SLEEVE_BANDS }, (_, i) =>
        new THREE.CylinderGeometry(rAt(i), rAt(i + 1), step, 16, 1, true).translate(0, SLEEVE_LEN / 2 - (i + 0.5) * step, 0));
    }
    this.cableGeo ??= new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    const mesh = new THREE.Group();
    this.sleeveGeos.forEach((geo, i) => {
      const band = new THREE.Mesh(geo, this.sleeveMats![i % 2]);
      band.frustumCulled = false; band.castShadow = true;
      mesh.add(band);
    });
    const cable = new THREE.Mesh(this.cableGeo, this.cableMat);
    cable.frustumCulled = false;
    const scene = this.game.world.scene;
    scene.add(mesh); scene.add(cable);
    return { mesh, cable, hits: 0, falling: false, vel: new THREE.Vector3(), t: 0 };
  }

  private removeSleeve(sl: Sleeve) {
    sl.mesh.removeFromParent();
    sl.cable.removeFromParent();
  }

  // ---------------- HUD card ----------------
  private render() {
    if (!this.card || !this.run) return;
    const d = this.run.drill;
    const n = this.wins.length;
    const pass = Math.min(n, this.idx);
    let body: string;
    if (this.phase === 'result' && this.result) {
      const r = this.result;
      body = `<div class="t">${tx('Drill complete')}</div><div class="big">${num(r.score)}</div>`
        + `<div class="st">${tx('{n} of {m} down', { n: r.downed, m: r.total })} · ${tx('Accuracy {p}%', { p: r.shots ? Math.round(r.hits / r.shots * 100) : 0 })}</div>`;
    } else if (this.phase === 'intro') {
      const left = Math.max(0, Math.ceil((this.wins[0]?.start ?? 0) - this.t));
      body = `<div class="t">${tx(d.title)}</div><div class="b">${tx(d.text)}</div><div class="st">${tx('First target in {n} s', { n: left })}</div>`;
    } else {
      ghostAt(this.run.ghost, this.t, _g);
      const gl = this.run.ghost && _g.on ? `<span class="gh">${tx('Ghost {n}', { n: num(_g.score) })}</span>` : '';
      const tg = this.cur;
      const sleeve = tg?.sleeve && !tg.sleeve.falling ? ` · ${tx('Sleeve {n}/{m}', { n: tg.sleeve.hits, m: SLEEVE_HP })}` : '';
      body = `<div class="row"><span class="sc">${num(this.points)}</span>${gl}</div>`
        + `<div class="st">${tx('Target {n} / {m}', { n: Math.max(1, pass), m: n })}${sleeve} · ${fmtT(Math.max(0, this.length - this.t))}</div>`;
    }
    const html = `<div class="k">${tx('GUNNERY RANGE')} · ${tx(STATIONS[d.station].label)}</div>${body}`;
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.card.innerHTML = html;
  }

  // ---------------- overlay: lead tutor + ghost sight (GameHud.drawOverlay) ----------------
  private gx = 0; private gy = 0; private ghostShown = false;
  draw(ctx: CanvasRenderingContext2D, W: number, H: number) {
    this.ghostShown = false;
    if (!this.active || !this.run || this.phase === 'result') return;
    const g = this.game, cam = g.engine.camera, b = g.world.playerBomber;
    if (!b) return;
    // the ghost: where your best run was aiming at this moment of the drill
    if (this.run.ghost && ghostAt(this.run.ghost, this.t, _g).on) {
      dirFromYawPitch(_g.yaw, _g.pitch, _v).applyQuaternion(b.quat).multiplyScalar(600).add(cam.position);
      const sp = projectMarker(_v, cam);
      if (sp.on) { this.gx = (sp.x * 0.5 + 0.5) * W; this.gy = (-sp.y * 0.5 + 0.5) * H; this.ghostShown = true; }
    }
    if (this.run.tutor) this.drawTutor(ctx, W, H);
    if (this.ghostShown) this.drawGhost(ctx, this.gx, this.gy);
  }

  /** A solid blue ring on a dark halo, four ticks and a labelled plate: reads on sky, cloud and sea. */
  private drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const r = 18;
    ctx.save();
    ctx.fillStyle = 'rgba(30,90,255,0.2)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    for (let k = 0; k < 2; k++) {
      ctx.lineWidth = k ? 3 : 7; ctx.strokeStyle = k ? 'rgba(70,140,255,1)' : 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.moveTo(x - r - 9, y); ctx.lineTo(x - r + 3, y); ctx.moveTo(x + r - 3, y); ctx.lineTo(x + r + 9, y);
      ctx.moveTo(x, y + r - 3); ctx.lineTo(x, y + r + 9);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(70,140,255,1)';
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.font = `700 11px ${CANVAS_MONO}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = tx('GHOST'), lw = ctx.measureText(label).width + 12;
    ctx.fillStyle = 'rgba(14,34,96,0.9)';
    ctx.fillRect(x - lw / 2, y - r - 22, lw, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x, y - r - 14);
    ctx.restore();
  }

  // what the tutor's label plate must keep clear of this frame (screen px)
  private sx = 0; private sy = 0; private sr = 0;            // the HUD reticle
  private rx = 0; private ry = 0; private rr = 0;            // the physical ring sight in aim view (0 = none)
  private lx = 0; private ly = 0; private lr = 0;            // the lead ring
  private tx = 0; private ty = 0; private tr = 0;            // the target
  private W = 0; private H = 0;
  private clearAt(x: number, y: number, w: number, h: number) {
    const hit = rectCircle;
    if (x < 8 || y < 8 || x + w > this.W - 8 || y + h > this.H - 8) return false;
    if (this.rr > 0 && hit(x, y, w, h, this.rx, this.ry, this.rr)) return false;
    if (hit(x, y, w, h, this.sx, this.sy, this.sr) || hit(x, y, w, h, this.lx, this.ly, this.lr) || hit(x, y, w, h, this.tx, this.ty, this.tr)) return false;
    if (this.ghostShown && hit(x, y, w, h, this.gx, this.gy, 44)) return false;
    // the gun's post runs down the middle of the screen below the sight
    if (x < this.sx + 34 && x + w > this.sx - 34 && y + h > this.sy) return false;
    return true;
  }

  private drawTutor(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const g = this.game, cam = g.engine.camera, b = g.world.playerBomber!;
    const tg = this.cur;
    this.coach = '';
    this.leadOn = false;
    if (!tg || tg.downed || (tg.f && !tg.f.alive) || (tg.sleeve && tg.sleeve.falling)) return;
    const origin = cam.position;
    const speed = g.gunner.loadout.weapon.velocity * g.gunner.loadout.velocity;
    const tof = gunLead(_lead, origin, tg.pos, tg.vel, b.vel, speed);
    this.lead.copy(_lead); this.leadOn = true;
    const range = origin.distanceTo(tg.pos);
    // projectMarker hands back one shared object: read each projection before the next
    const tp = projectMarker(tg.pos, cam);
    const tx0 = (tp.x * 0.5 + 0.5) * W, ty0 = (-tp.y * 0.5 + 0.5) * H, tFront = tp.front;
    const lp = projectMarker(_lead, cam);
    if (!lp.on || !tFront) return;
    const lx = (lp.x * 0.5 + 0.5) * W, ly = (-lp.y * 0.5 + 0.5) * H;
    // the gun's line at the target's range
    _aim.copy(g.gunner.aimDirection(_aim)).multiplyScalar(range).add(origin);
    const ap = projectMarker(_aim, cam);
    const ax = (ap.x * 0.5 + 0.5) * W, ay = (-ap.y * 0.5 + 0.5) * H;
    // tolerance: the target's size on screen (a hit lands inside it), never smaller than 9 px
    const fovPx = H / (2 * Math.tan(THREE.MathUtils.degToRad((cam as THREE.PerspectiveCamera).fov) / 2));
    const tol = Math.max(9, (tg.sleeve ? 5 : 7) / Math.max(1, range) * fovPx);
    // the aim's error split along the target's motion on screen
    let mx = lx - tx0, my = ly - ty0;
    const ml = Math.hypot(mx, my);
    if (ml > 1e-3) { mx /= ml; my /= ml; } else { mx = 1; my = 0; }
    const ex = ax - lx, ey = ay - ly;
    const along = ex * mx + ey * my;
    // what is left over, read as high (+) or low (-) on the screen
    const rx = ex - along * mx, ry = ey - along * my;
    const across = Math.hypot(rx, ry) * (ry <= 0 ? 1 : -1);
    const coach = coachLead(along, across, tol);
    this.coach = coach;
    const on = coach === 'on';
    ctx.save();
    // dashed track from the target to the lead point, with tenth-of-a-second ticks
    ctx.strokeStyle = 'rgba(255,214,120,0.6)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.lineTo(lx, ly); ctx.stroke();
    ctx.setLineDash([]);
    const ticks = Math.min(20, Math.floor(tof / 0.1));
    for (let i = 1; i <= ticks; i++) {
      const k = i * 0.1 / tof, x = tx0 + (lx - tx0) * k, y = ty0 + (ly - ty0) * k;
      ctx.beginPath(); ctx.moveTo(x - my * 4, y + mx * 4); ctx.lineTo(x + my * 4, y - mx * 4); ctx.stroke();
    }
    // the lead ring: green when the gun is on it
    ctx.strokeStyle = on ? 'rgba(120,235,140,0.95)' : 'rgba(255,200,90,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(lx, ly, tol, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx - 4, ly); ctx.lineTo(lx + 4, ly); ctx.moveTo(lx, ly - 4); ctx.lineTo(lx, ly + 4); ctx.stroke();
    // one label plate: the coach's word, lead angle and range, time of flight. It sits beside the
    // lead ring on the side away from the target, and keeps clear of the sight ring, the target,
    // the ghost and the gun's post (further out, then below or above, until it fits)
    const deg = leadDegrees(origin, tg.pos, _lead);
    const word = tx(COACH_TEXT[coach]);
    const l1 = tx('LEAD {d}° · {r} m', { d: deg.toFixed(1), r: Math.round(range) }), l2 = tx('Time of flight {t} s', { t: tof.toFixed(2) });
    ctx.font = `700 15px ${CANVAS_MONO}`;
    const ww = ctx.measureText(word).width;
    ctx.font = `600 11px ${CANVAS_MONO}`;
    const pw = Math.max(ww, ctx.measureText(l1).width, ctx.measureText(l2).width) + 16, ph = 56;
    this.W = W; this.H = H;
    // the HUD reticle, and in aim view the gun's physical ring sight as it is drawn on screen
    this.sx = W / 2; this.sy = H / 2; this.sr = Math.min(W, H) * 0.05 + 14;
    this.rr = 0;
    const ring = g.gunner.sightRing();
    if (ring) {
      ring.updateWorldMatrix(true, false);
      const cp = projectMarker(ring.getWorldPosition(_rc), cam);
      if (cp.on) {
        this.rx = (cp.x * 0.5 + 0.5) * W; this.ry = (-cp.y * 0.5 + 0.5) * H;
        // outer edge of the torus, across and up (the ring may be seen a little obliquely)
        const ex = projectMarker(ring.localToWorld(_re.set(RING_OUTER, 0, 0)), cam);
        const r1 = Math.hypot((ex.x * 0.5 + 0.5) * W - this.rx, (-ex.y * 0.5 + 0.5) * H - this.ry);
        const ey = projectMarker(ring.localToWorld(_re.set(0, RING_OUTER, 0)), cam);
        const r2 = Math.hypot((ey.x * 0.5 + 0.5) * W - this.rx, (-ey.y * 0.5 + 0.5) * H - this.ry);
        this.rr = Math.max(r1, r2) + 10;
      }
    }
    this.lx = lx; this.ly = ly; this.lr = tol + 4;
    this.tx = tx0; this.ty = ty0; this.tr = Math.max(16, (tg.sleeve ? SLEEVE_LEN * 0.55 : 30) / Math.max(1, range) * fovPx) + 4;
    const away = tx0 <= lx ? 1 : -1;
    let px = NaN, py = NaN;
    const reach = Math.max(190, this.rr * 2 + 46);
    for (let d = PLATE_PAD; d <= reach && Number.isNaN(px); d += 46) {
      for (let c = 0; c < 4; c++) {
        const s = c === 0 ? away : -away;
        const x = c < 2 ? (s > 0 ? lx + tol + d : lx - tol - d - pw) : lx - pw / 2;
        const y = c < 2 ? ly - ph / 2 : c === 2 ? ly + tol + d : ly - tol - d - ph;
        if (this.clearAt(x, y, pw, ph)) { px = x; py = y; break; }
      }
    }
    // nothing fits near the lead point: a fixed spot up and left of the sight (outside the ring sight)
    if (Number.isNaN(px)) {
      const r = Math.max(this.sr, this.rr), cx = this.rr > 0 ? this.rx : this.sx, cy = this.rr > 0 ? this.ry : this.sy;
      px = Math.max(8, cx - r - 24 - pw); py = Math.max(8, cy - r * 0.7 - ph);
    }
    const pl = this.plate;
    pl.x = px; pl.y = py; pl.w = pw; pl.h = ph; pl.ringX = this.rx; pl.ringY = this.ry; pl.ringR = this.rr;
    ctx.fillStyle = 'rgba(8,10,6,0.82)';
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = on ? 'rgba(120,235,140,0.95)' : 'rgba(255,200,90,0.95)';
    ctx.fillRect(px, py, 3, ph);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `700 15px ${CANVAS_MONO}`;
    ctx.fillText(word, px + 10, py + 19);
    ctx.font = `600 11px ${CANVAS_MONO}`;
    ctx.fillStyle = 'rgba(255,224,150,0.95)';
    ctx.fillText(l1, px + 10, py + 35);
    ctx.fillText(l2, px + 10, py + 49);
    ctx.restore();
  }
}
