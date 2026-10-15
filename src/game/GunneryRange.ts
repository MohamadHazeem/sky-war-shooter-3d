import * as THREE from 'three';
import type { Game } from './Game';
import type { Mission } from './Missions';
import type { Fighter } from '../world/Aircraft';
import { STATIONS, dirFromYawPitch, type StationId } from '../world/B17Layout';
import { segSphere } from '../world/Ballistics';
import { gunLead } from '../world/Gunnery';
import { projectMarker } from '../ui/MarkerProjection';
import { CANVAS_MONO, num, tx } from '../i18n';
import {
  CABLE, COACH_TEXT, GhostRecorder, SCORE, SLEEVE_HP, TAIL, accuracyBonus, coachLead, downPoints, ghostAt, leadDegrees,
  passPoint, passVelocity, timeline, type Drill, type Ghost, type GhostSample, type Window,
} from './GunneryRangeRules';
import { harmless } from './Tutorial';

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

interface Sleeve { mesh: THREE.Mesh; cable: THREE.Mesh; hits: number; falling: boolean; vel: THREE.Vector3; t: number }
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
// The sleeve is drawn (and hit) larger than life, like the game's fighters (World.ENEMY_SCALE):
// a true 9 m sleeve is two pixels wide at 600 m.
const SLEEVE_LEN = 22, SLEEVE_R = 2.1;
const SLEEVE_SPHERES = [-SLEEVE_LEN / 3, 0, SLEEVE_LEN / 3];   // three hit spheres along its length
const DRONE_TINT = new THREE.Color(2.6, 1.25, 0.32);   // target-drone orange over the Fw 190 paint
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
  private sleeveMat: THREE.MeshStandardMaterial | null = null;
  private cableMat: THREE.MeshStandardMaterial | null = null;
  private sleeveGeo: THREE.CylinderGeometry | null = null;
  private cableGeo: THREE.CylinderGeometry | null = null;
  coach: string = '';             // last coaching word (dev / tests)
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
    sl.cable.scale.set(1, tow.distanceTo(tg.pos), 1);
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
      const r = SLEEVE_R * 1.9 * this.game.world.ballistics.playerHitScale;
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
    // a plain double-sided standard material: World.prewarm already compiled that program
    this.sleeveMat ??= new THREE.MeshStandardMaterial({ color: 0xff7a2e, roughness: 0.95, side: THREE.DoubleSide });
    this.cableMat ??= new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 });
    this.sleeveGeo ??= new THREE.CylinderGeometry(SLEEVE_R, SLEEVE_R * 0.7, SLEEVE_LEN, 16, 1, true);
    this.cableGeo ??= new THREE.CylinderGeometry(0.12, 0.12, 1, 4, 1, true);
    const mesh = new THREE.Mesh(this.sleeveGeo, this.sleeveMat);
    const cable = new THREE.Mesh(this.cableGeo, this.cableMat);
    mesh.frustumCulled = false; cable.frustumCulled = false;
    mesh.castShadow = true;
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
  draw(ctx: CanvasRenderingContext2D, W: number, H: number) {
    if (!this.active || !this.run || this.phase === 'result') return;
    const g = this.game, cam = g.engine.camera, b = g.world.playerBomber;
    if (!b) return;
    // the ghost: where your best run was aiming at this moment of the drill
    if (this.run.ghost && ghostAt(this.run.ghost, this.t, _g).on) {
      dirFromYawPitch(_g.yaw, _g.pitch, _v).applyQuaternion(b.quat).multiplyScalar(600).add(cam.position);
      const sp = projectMarker(_v, cam);
      if (sp.on) {
        const x = (sp.x * 0.5 + 0.5) * W, y = (-sp.y * 0.5 + 0.5) * H;
        ctx.save();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(150,205,255,0.95)'; ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(170,215,255,0.85)';
        ctx.font = `600 10px ${CANVAS_MONO}`;
        ctx.textAlign = 'center';
        ctx.fillText(tx('GHOST'), x, y - 22);
        ctx.restore();
      }
    }
    if (this.run.tutor) this.drawTutor(ctx, W, H);
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
    const tol = Math.max(9, (tg.sleeve ? 3.5 : 7) / Math.max(1, range) * fovPx);
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
    // labels: lead angle, range, time of flight, and the coach's word
    const deg = leadDegrees(origin, tg.pos, _lead);
    ctx.font = `600 11px ${CANVAS_MONO}`;
    // the labels go on the side away from the target, so they never cover it
    const right = tx0 <= lx;
    ctx.textAlign = right ? 'left' : 'right';
    const lx2 = right ? lx + tol + 8 : lx - tol - 8;
    const l1 = tx('LEAD {d}° · {r} m', { d: deg.toFixed(1), r: Math.round(range) }), l2 = tx('Time of flight {t} s', { t: tof.toFixed(2) });
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const bw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 10;
    ctx.fillRect(right ? lx2 - 5 : lx2 - bw + 5, ly - 26, bw, 40);
    ctx.fillStyle = 'rgba(255,224,150,0.95)';
    ctx.fillText(l1, lx2, ly - 12);
    ctx.fillText(l2, lx2, ly + 2);
    ctx.font = `700 15px ${CANVAS_MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = on ? 'rgba(120,235,140,0.95)' : 'rgba(255,214,120,0.95)';
    ctx.fillText(tx(COACH_TEXT[coach]), W / 2, H * 0.68);
    ctx.restore();
  }
}
