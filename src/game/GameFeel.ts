import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { World } from '../world/World';
import type { UI } from '../ui/UI';
import { Aircraft, Fighter } from '../world/Aircraft';
import { ENEMY_VARIANTS, EnemyType } from '../world/EnemyTypes';
import { Combo, FIRE_KILLS, FIRE_SCORE } from './Combo';
import { sound } from '../audio/Sound';
import { playCue } from '../audio/FeedbackCues';
import { access } from '../core/Accessibility';
import { tx, CANVAS_MONO } from '../i18n';

// Game feel ("juice") for kills and hits, plus the streak meter / ON FIRE presentation.
//
// Every confirmed kill lands with:
//   hit-stop   the simulation nearly freezes for 40-70 ms (game time; audio keeps running)
//   flash      a short white-orange screen flash (PostFX.flash), scaled to the kill's size
//   popup      an animated score popup: scales in with an overshoot, then floats and fades
//   punch      a quick camera punch-in (camera.zoom on a spring; the controllers own .fov)
//   pulse      a radial zoom-blur pulse (PostFX.zoomPulse, folded into the motion-blur taps)
// Kills in quick succession escalate all of these ("chain"), so a run of kills plays like
// a highlight reel. Every hit gets a small crosshair bloom (the hit-marker tick itself is
// drawn by Game.drawOverlay).
//
// Streak meter (Combo.heat): shown on the HUD, fills with kills, decays. Full = ON FIRE:
// +50% score (Combo.scoreMult), hotter/wider player tracers, a burning HUD frame and a
// music swell. A heavy hit (a burst of damage on the player's aircraft) puts it out.
//
// No slow motion here: only Game decides on slow-mo for big kills.

const HITSTOP_SCALE = 0.05;      // engine.timeScale while frozen (not 0: real dt stays recoverable)
const CHAIN_GAP = 2.6;           // s (real) between kills that keeps a chain going
const POPUPS = 8;
const PUNCH_K = 420, PUNCH_C = 30; // camera punch spring (slightly under-damped: one small overshoot)
const HEAVY_TAU = 0.8;           // s, leak of the incoming-damage accumulator
const HEAVY_DAMAGE = 28;         // scaled damage inside ~a second that counts as a heavy hit

interface Popup {
  rel: THREE.Vector3;   // camera-relative position at the kill (survives origin rebases)
  age: number; life: number;
  pts: string; sub: string;
  size: number;         // font px of the main line
  hot: boolean;         // ON FIRE colouring
  lift: number; liftCur: number; // pushed up by newer popups so a chain stacks like a ticker
  active: boolean;
}

const fontCache = new Map<number, string>();
const subCache = new Map<number, string>();
const font = (px: number) => { let f = fontCache.get(px); if (!f) { f = `700 ${px}px Oswald, "Arial Narrow", "Noto Kufi Arabic", sans-serif`; fontCache.set(px, f); } return f; };
const subFont = (px: number) => { let f = subCache.get(px); if (!f) { f = `600 ${px}px ${CANVAS_MONO}`; subCache.set(px, f); } return f; };
const CHAIN_LABEL = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'QUAD KILL', 'RAMPAGE'];

const _p = new THREE.Vector3();

export class GameFeel {
  ambientFlash = 0;   // set by the weather (lightning)
  private clock = 0;                 // real seconds while active
  private appliedScale = 1;          // engine.timeScale the next frame's dt was scaled by
  private hitstop = 0;               // real seconds of freeze left
  private savedScale = 1;            // timeScale to restore when the freeze ends
  private freshStop = false;         // the kill happened during this frame: its dt doesn't count
  private flash = 0;
  private pulse = 0;
  private punch = 0; private punchV = 0;
  private zoomSet = false;
  private bloom = 0;
  private chain = 0;
  private lastKillClock = -99;
  private popups: Popup[] = [];
  private heavyAcc = 0;
  private wasOnFire = false;
  private doused = false;
  private tracerHeat = 0;
  private fireT = 0;                 // seconds ON FIRE (drives the frame flicker)
  private wasActive = false;
  // HUD DOM (injected into #hud, which UI.hud() rebuilds each mission)
  private meter: HTMLElement | null = null;
  private meterFill: HTMLElement | null = null;
  private meterLabel: HTMLElement | null = null;
  private frame: HTMLElement | null = null;
  private shownHeat = -1;
  private shownFire = false;
  private hudAcc = 0;

  constructor(private engine: Engine, private world: World, private ui: UI, private combo: Combo) {
    for (let i = 0; i < POPUPS; i++) this.popups.push({ rel: new THREE.Vector3(), age: 0, life: 0, pts: '', sub: '', size: 30, hot: false, lift: 0, liftCur: 0, active: false });
  }

  /** New mission: drop every effect and give the engine back its normal clock. */
  reset() {
    this.release();
    this.flash = 0; this.pulse = 0; this.punch = 0; this.punchV = 0; this.bloom = 0;
    this.chain = 0; this.lastKillClock = -99; this.heavyAcc = 0;
    this.wasOnFire = false; this.doused = false; this.tracerHeat = 0; this.fireT = 0;
    for (const p of this.popups) p.active = false;
    this.applyOutputs();
    this.shownHeat = -1; this.shownFire = false;
  }

  // ---------------- events ----------------

  /** A confirmed player kill. pts is what was just paid out. */
  onKill(victim: Aircraft, pts: number) {
    const gap = this.clock - this.lastKillClock;
    this.chain = gap < CHAIN_GAP ? this.chain + 1 : 1;
    this.lastKillClock = this.clock;
    // kill size: 0 for a single-engine fighter, ~1 for the heavy twins and anything bigger
    const base = victim instanceof Fighter ? (ENEMY_VARIANTS[victim.enemyType as EnemyType]?.score ?? 100) : 300;
    const size = THREE.MathUtils.clamp(Math.log2(Math.max(1, base / 100)) / 1.7 + (victim.radius > 30 ? 0.5 : 0), 0, 1.5);
    const esc = 1 + 0.28 * Math.min(4, this.chain - 1);          // 1 .. 2.12
    const k = (1 + 0.6 * size) * esc;
    // hit-stop: 40-70 ms, longer for big kills and for chains
    this.startHitstop(THREE.MathUtils.clamp(0.04 + 0.012 * size + 0.007 * (this.chain - 1), 0.04, 0.07));
    this.flash = Math.max(this.flash, Math.min(0.85, 0.2 * k));
    this.pulse = Math.max(this.pulse, Math.min(0.06, 0.016 * k));
    this.punchV += Math.min(2.8, 1.1 * k);
    this.bloom = 1;
    // popup
    const p = this.popups.find((q) => !q.active) ?? this.popups.reduce((a, b) => (a.age > b.age ? a : b));
    p.active = true; p.age = 0; p.lift = 0; p.liftCur = 0; p.life = 1.5 + 0.15 * Math.min(4, this.chain);
    p.rel.copy(victim.pos).sub(this.engine.camera.position);
    p.pts = `+${pts}`;
    p.hot = this.combo.onFire;
    p.sub = this.chain >= 2 ? tx(CHAIN_LABEL[Math.min(5, this.chain)]) : p.hot ? tx('ON FIRE ×{n}', { n: FIRE_SCORE }) : tx('{label} DOWN', { label: victim.label.toUpperCase() });
    p.size = Math.round(Math.min(56, 30 + 7 * size + 5 * Math.min(4, this.chain - 1)));
    for (const q of this.popups) if (q !== p && q.active) q.lift += p.size * 1.3;
  }

  /** A player round connected (not a kill). */
  onHit() { this.bloom = Math.min(1, this.bloom + 0.45); }

  /** Damage taken by the player's aircraft (already scaled). A burst puts the fire out. */
  onIncoming(damage: number) {
    if (!Number.isFinite(damage) || damage <= 0) return;
    this.heavyAcc += damage;
    if (this.heavyAcc >= HEAVY_DAMAGE && this.combo.onFire) {
      this.combo.onHeavyHit();
      this.doused = true;
      this.heavyAcc = 0;
    }
  }

  // ---------------- per frame ----------------

  /** Call once per frame after the controllers and camera shake. active = mission in play. */
  update(dt: number, active: boolean) {
    const real = this.appliedScale > 0 ? dt / this.appliedScale : 0;
    if (!active) {
      if (this.wasActive) { this.wasActive = false; this.reset(); }
      this.appliedScale = this.engine.timeScale;
      this.syncHud(false);
      return;
    }
    this.wasActive = true;
    this.clock += real;
    // hit-stop: hold the engine clock down; whatever Game set this frame (slow-mo or 1) is
    // remembered and restored when the freeze ends
    if (this.hitstop > 0) {
      if (this.engine.timeScale !== HITSTOP_SCALE) this.savedScale = this.engine.timeScale;
      if (this.freshStop) this.freshStop = false; else this.hitstop -= real;
      if (this.hitstop > 0) this.engine.timeScale = HITSTOP_SCALE;
      else this.release();
    }
    this.appliedScale = this.engine.timeScale;
    // decays (real time, so the freeze frame still shows the flash)
    this.flash *= Math.exp(-real * 16);
    this.pulse *= Math.exp(-real * 13);
    this.bloom *= Math.exp(-real * 11);
    this.heavyAcc *= Math.exp(-real / HEAVY_TAU);
    // camera punch spring (semi-implicit Euler, sub-stepped for long frames)
    let left = Math.min(real, 0.1);
    while (left > 0) {
      const h = Math.min(left, 1 / 120);
      this.punchV += (-PUNCH_K * this.punch - PUNCH_C * this.punchV) * h;
      this.punch += this.punchV * h;
      left -= h;
    }
    if (Math.abs(this.punch) < 1e-4 && Math.abs(this.punchV) < 1e-3) { this.punch = 0; this.punchV = 0; }
    // ON FIRE transitions
    const fire = this.combo.onFire;
    if (fire && !this.wasOnFire) this.ignite();
    else if (!fire && this.wasOnFire) this.extinguish();
    this.wasOnFire = fire;
    this.fireT = fire ? this.fireT + real : 0;
    this.tracerHeat += ((fire ? 1 : 0) - this.tracerHeat) * Math.min(1, real * 4);
    for (const p of this.popups) {
      if (!p.active) continue;
      if ((p.age += real) >= p.life) p.active = false;
      p.liftCur += (p.lift - p.liftCur) * Math.min(1, real * 14);
    }
    this.applyOutputs();
    this.hudAcc += real;
    if (this.hudAcc > 0.05) { this.hudAcc = 0; this.syncHud(true); }
  }

  private startHitstop(sec: number) {
    sec *= access.hitStop;   // 'reduce screen shake and flashes': no freeze frames
    if (sec <= 0) return;
    if (this.hitstop <= 0) this.savedScale = this.engine.timeScale === HITSTOP_SCALE ? 1 : this.engine.timeScale;
    this.hitstop = Math.max(this.hitstop, sec);
    this.freshStop = true;
  }

  private release() {
    if (this.hitstop > 0 || this.engine.timeScale === HITSTOP_SCALE) this.engine.timeScale = this.savedScale || 1;
    this.hitstop = 0;
    this.freshStop = false;
    this.appliedScale = this.engine.timeScale;
  }

  private applyOutputs() {
    const post = this.engine.post;
    const f = Math.max(this.flash, this.ambientFlash); // lightning (Game.storm) shares the flash
    post.flash = f < 0.004 ? 0 : f;
    post.zoomPulse = this.pulse < 0.0005 ? 0 : this.pulse;
    this.world.ballistics.playerTracerHeat = this.tracerHeat < 0.01 ? 0 : this.tracerHeat;
    const cam = this.engine.camera;
    const z = 1 + Math.max(-0.02, this.punch) * access.shake;
    if (this.punch !== 0 || this.zoomSet) {
      cam.zoom = z;
      cam.updateProjectionMatrix();
      this.zoomSet = this.punch !== 0;
    }
  }

  private ignite() {
    this.doused = false;
    this.ui.banner(`${FIRE_KILLS} kill streak · +${Math.round((FIRE_SCORE - 1) * 100)}% score`, 'ON FIRE', 2200);
    playCue('ignite', 0.5);
    sound.music.swell();
    this.flash = Math.max(this.flash, 0.35);
    this.pulse = Math.max(this.pulse, 0.03);
  }

  private extinguish() {
    if (this.doused) { this.ui.feed('Fire\'s out — took a heavy hit', 'loss'); playCue('douse', 0.4); }
    else this.ui.feed('Streak cooled off');
    this.doused = false;
  }

  // ---------------- HUD ----------------

  private ensureHud(): boolean {
    if (this.meter?.isConnected && this.frame?.isConnected) return true;
    const hud = document.getElementById('hud');
    if (!hud || !hud.classList.contains('show')) return false;
    if (!this.meter?.isConnected) {
      const m = document.createElement('div');
      m.id = 'streakMeter';
      m.innerHTML = '<div class="sm-head"><span class="sm-label">' + tx('STREAK') + '</span></div><div class="sm-bar"><i></i><b></b><b></b><b></b><b></b></div>';
      hud.appendChild(m);
      this.meter = m;
      this.meterFill = m.querySelector('i');
      this.meterLabel = m.querySelector('.sm-label');
      this.shownHeat = -1; this.shownFire = false;
    }
    if (!this.frame?.isConnected) {
      const f = document.createElement('div');
      f.id = 'fireFrame';
      hud.appendChild(f);
      this.frame = f;
    }
    return true;
  }

  private syncHud(on: boolean) {
    if (!on) { if (this.frame?.isConnected) this.frame.classList.remove('on'); return; }
    if (!this.ensureHud()) return;
    const heat = this.combo.heat, fire = this.combo.onFire;
    if (Math.abs(heat - this.shownHeat) > 0.004) {
      this.shownHeat = heat;
      this.meterFill!.style.transform = `scaleX(${heat.toFixed(3)})`;
      this.meter!.classList.toggle('warm', heat > 0.01);
    }
    if (fire !== this.shownFire) {
      this.shownFire = fire;
      this.meter!.classList.toggle('fire', fire);
      this.meterLabel!.textContent = fire ? tx('ON FIRE  ×{n}', { n: FIRE_SCORE }) : tx('STREAK');
      this.frame!.classList.toggle('on', fire);
    }
  }

  // ---------------- 2D overlay ----------------

  /** Popups and the crosshair bloom, on the HUD canvas. (hx, hy) = aim point. */
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, hx: number, hy: number) {
    const cam = this.engine.camera;
    // crosshair bloom: a soft ring that kicks out on each hit and settles back in
    if (this.bloom > 0.03) {
      const b = this.bloom;
      ctx.strokeStyle = this.combo.onFire ? `rgba(255,170,60,${(0.6 * b).toFixed(3)})` : `rgba(255,245,225,${(0.5 * b).toFixed(3)})`;
      ctx.lineWidth = 1 + 1.5 * b;
      ctx.beginPath(); ctx.arc(hx, hy, 7 + 11 * b, 0, Math.PI * 2); ctx.stroke();
    }
    let any = false;
    for (const p of this.popups) if (p.active) { any = true; break; }
    if (!any) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const p of this.popups) {
      if (!p.active) continue;
      _p.copy(cam.position).add(p.rel).project(cam);
      if (_p.z > 1) continue;
      const x = (_p.x * 0.5 + 0.5) * W;
      // scale-in with an overshoot (0.3 -> ~1.2 -> 1) over 0.2 s, then float up and fade out
      const t = p.age;
      const s = t < 0.2 ? easeOutBack(t / 0.2) * 0.7 + 0.3 * (t / 0.2) : 1;
      const rise = t < 0.2 ? 0 : (t - 0.2) * 34 + (t - 0.2) * (t - 0.2) * 12;
      const a = Math.min(1, (p.life - t) / 0.45);
      const y = (-_p.y * 0.5 + 0.5) * H - 26 - rise - p.liftCur;
      const px = Math.max(8, Math.round(p.size * s));
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = font(px);
      ctx.lineWidth = Math.max(3, px * 0.14);
      ctx.strokeStyle = 'rgba(20,10,0,0.85)';
      ctx.strokeText(p.pts, x, y);
      ctx.fillStyle = p.hot ? '#ff9a3a' : '#ffd987';
      ctx.fillText(p.pts, x, y);
      if (t > 0.08) {
        const sp = Math.max(8, Math.round(px * 0.36));
        ctx.font = subFont(sp);
        ctx.lineWidth = 3;
        ctx.strokeText(p.sub, x, y + px * 0.62);
        ctx.fillStyle = p.hot ? '#ffc070' : '#fff1d0';
        ctx.fillText(p.sub, x, y + px * 0.62);
      }
    }
    ctx.restore();
  }
}

function easeOutBack(x: number) {
  const c1 = 2.2, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
