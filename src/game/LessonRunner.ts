import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { UI } from '../ui/UI';
import type { Game } from './Game';
import type { Mission } from './Missions';
import { STATIONS, type StationId } from '../world/B17Layout';
import { gunLead, TWIN_CONVERGENCE } from '../world/Gunnery';
import { keyMap } from '../core/KeyMap';
import { TrainingDrones } from './TrainingDrones';
import {
  lessonById, loadLessonProgress, saveLessonProgress, recordAttempt, recordResult, pct, SHORT_BURST, OUT_OF_RANGE,
  type Accuracy, type LessonDef, type LessonId, type LessonStep,
} from './StationLessons';
import { tx } from '../i18n';

// Plays one station lesson (StationLessons.ts) in a harmless training sky, the same way the
// Gunnery School does: Onboarding hands it the mission's director step. Steps check the
// gunner's real state (lead point, bursts, the gun's jam, the oxygen hose), each one has a
// timeout, and Backspace (or the card's button on touch) skips a step.

export function lessonMission(def: LessonDef): Mission {
  return {
    id: 'lesson_' + def.id, number: 0, tutorial: true, lesson: def.id,
    title: def.title, target: 'Station lesson', date: 'Training flight · over the Wash', role: 'gunner', station: def.station,
    briefing: [def.summary], objectives: ['Complete the lesson'],
    bombers: 6, waves: [], duration: 9999, maxBombersLost: 99, playerArmor: 0,
    weather: { sunEl: 44, sunAz: 200, low: 0.4, high: 0.25, contrails: true },
  };
}

export interface LessonHost { finished(id: LessonId, next: boolean): void }

// pace of a lesson's hose cut: greys out within ~6 s, no crewman rescue while the step lasts
const DRILL_OXYGEN = { oxygenGrace: 0.4, oxygenRise: 6, rescue: 120 };
export const SKIP_KEY = 'Backspace';

const kbd = (k: string) => `<kbd>${k}</kbd>`;
const onTouch = () => typeof document !== 'undefined' && document.body.classList.contains('touch');
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _lead = new THREE.Vector3();

export class LessonRunner {
  active = false;
  def: LessonDef | null = null;
  stepIdx = -1;
  phase: 'intro' | 'step' | 'done' | 'finale' | 'over' = 'over';
  readonly log: string[] = [];
  private t = 0;
  private total = 0;
  private acc = 0;               // per-step accumulator (lead hold)
  private shots0 = 0;
  private hits0 = 0;
  private bursts = 0;
  private longBursts = 0;
  private burstT = -1;           // s into the current burst (-1 = not firing)
  private wasted = 0;            // rounds fired out of convergence range
  private prevShots = 0;
  private triggered = false;     // jamFight / oxygenFight: the trouble has started
  private byPlayer = false;
  private skip = false;
  private stepsSkipped = 0;
  private timeouts = 0;
  private before: Accuracy | null = null;
  private after: Accuracy | null = null;
  private card: HTMLElement | null = null;
  private range: TrainingDrones;
  private lastHtml = '';

  constructor(private game: Game, private engine: Engine, private ui: UI, private host: LessonHost) {
    this.range = new TrainingDrones(game);
    window.addEventListener('keydown', (e) => {
      if (e.code === SKIP_KEY && !e.repeat && this.active && this.phase === 'step' && this.game.state === 'playing') { e.preventDefault(); this.skip = true; }
    });
  }

  get step(): LessonStep | null { return this.def && this.stepIdx >= 0 ? this.def.steps[this.stepIdx] ?? null : null; }

  // ---------------- lifecycle ----------------
  start(id: LessonId) {
    this.stop();
    const def = lessonById(id);
    if (!def) return;
    const p = loadLessonProgress();
    recordAttempt(p, id);
    saveLessonProgress(p);
    this.def = def;
    this.active = true;
    this.stepIdx = -1;
    this.phase = 'intro';
    this.t = this.total = 0;
    this.stepsSkipped = this.timeouts = 0;
    this.before = this.after = null;
    this.log.length = 0;
    this.card = document.createElement('div');
    this.card.id = 'tutCard';
    this.card.classList.add('lesson');
    // the skip button survives re-renders: one delegated listener on the card
    this.card.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-skip]') && this.phase === 'step') this.skip = true; });
    document.body.appendChild(this.card);
    this.lastHtml = '';
    this.render('', tx(def.title), tx(def.summary));
    requestAnimationFrame(() => this.card?.classList.add('show'));
  }

  stop() {
    if (this.active) this.cleanupStep();
    this.active = false;
    this.phase = 'over';
    this.card?.remove();
    this.card = null;
    this.range.clear();
    this.game.hud.forceLeadPip = false;
  }

  // Onboarding.direct() while a lesson mission runs (replaces the director)
  update(dt: number) {
    if (!this.active || !this.def) return;
    const g = this.game, w = g.world;
    // harmless sky, re-asserted every frame
    w.playerDamageScale = 0;
    w.aiGunnerFactor = 0;
    w.flakIntensity = 0;
    w.playerFocus = 1;
    if (this.card) this.card.classList.toggle('show', g.state === 'playing');
    this.t += dt;
    this.total += dt;
    switch (this.phase) {
      case 'intro':
        if (this.t > 3.5) this.next();
        break;
      case 'step': {
        const s = this.step!;
        g.hud.forceLeadPip = !!s.leadPip;
        this.track(s, dt);
        const skipped = this.skip, timedOut = this.t > s.timeout;
        if (skipped || timedOut || this.check(s, dt)) this.endStep(s, skipped, !skipped && timedOut);
        else this.refresh();
        break;
      }
      case 'done':
        if (this.t > 1.3) this.next();
        break;
      case 'finale':
        if (this.t > 5) {
          const id = this.def.id;
          this.stop();
          this.host.finished(id, true);
        }
        break;
    }
  }

  private next() {
    this.range.clear();
    this.stepIdx++;
    const def = this.def!;
    if (this.stepIdx >= def.steps.length) { this.finish(); return; }
    const s = def.steps[this.stepIdx];
    this.phase = 'step'; this.t = 0; this.acc = 0;
    this.skip = false;
    this.bursts = this.longBursts = this.wasted = 0;
    this.burstT = -1;
    this.triggered = this.byPlayer = false;
    this.shots0 = this.game.world.stats.shots;
    this.hits0 = this.game.world.stats.hits;
    this.prevShots = this.shots0;
    if (s.drone) this.range.spawn(def.station, s.drone);
    if (s.kind === 'jam') this.jam();
    if (s.kind === 'oxygen') this.cutHose();
    this.game.world.callout('lesson' + def.id + s.id, s.radio[0], s.radio[1], 0, 3);
    this.lastHtml = '';
    this.refresh();
  }

  private endStep(s: LessonStep, skipped: boolean, timedOut: boolean) {
    const st = this.game.world.stats;
    const a: Accuracy = { shots: st.shots - this.shots0, hits: st.hits - this.hits0 };
    if (s.kind === 'drill' && !skipped) {
      if (this.stepIdx === 0) this.before = a; else this.after = a;
    }
    if (skipped) this.stepsSkipped++;
    if (timedOut) this.timeouts++;
    this.log.push(`${s.id} ${this.t.toFixed(1)}s${skipped ? ' (skipped)' : timedOut ? ' (timeout)' : ''} ${a.hits}/${a.shots}`);
    this.cleanupStep();
    this.phase = 'done'; this.t = 0;
    this.render(this.kicker(), tx(s.title), skipped ? `<span class="st">${tx('Skipped')}</span>` : `<span class="ok">✓ ${tx('Done')}</span>`, true);
  }

  // a step never leaves a jammed gun or a loose hose behind
  private cleanupStep() {
    const g = this.game;
    g.hud.forceLeadPip = false;
    const life = g.gunner.survival;
    if (life.oxygenDrill) { life.oxygenDrill = null; if (life.oxygen) life.reconnect(); }
    for (const id of Object.keys(STATIONS) as StationId[]) {
      const s = g.gunner.gunState(id);
      if (s?.jam) { s.jam = false; s.clear = 0; s.tapAge = Infinity; }
    }
  }

  private finish() {
    const def = this.def!;
    this.phase = 'finale'; this.t = 0;
    this.log.push('complete');
    const p = loadLessonProgress();
    const e = recordResult(p, def.id, { time: Math.round(this.total), before: this.before, after: this.after, stepsSkipped: this.stepsSkipped, timeouts: this.timeouts });
    saveLessonProgress(p);
    const line = e.before !== undefined || e.after !== undefined
      ? tx('Accuracy {a} → {b}', { a: pct(e.before), b: pct(e.after) })
      : tx('Lesson complete');
    this.render(tx('STATION LESSON'), tx('Lesson complete'), `${tx(def.title)} · ${line}`, true);
    this.ui.banner('LESSON COMPLETE', def.title, 4200);
    this.game.world.callout('lessondone', 'Pilot', 'Good work, gunner. That one\'s in the log book.', 0, 3);
  }

  // ---------------- step logic ----------------
  private gun() { return this.game.gunner.gunState(this.def!.station); }

  private jam() {
    const s = this.gun();
    s.jam = true; s.clear = 0; s.tapAge = Infinity;
  }

  private cutHose() {
    const life = this.game.gunner.survival;
    life.oxygenDrill = DRILL_OXYGEN;
    life.oxygen = true;
    life.oxygenTime = 0;
  }

  // per-frame bookkeeping the checks read
  private track(s: LessonStep, dt: number) {
    const g = this.game;
    if (g.input.hit('KeyO')) this.byPlayer = true;
    const firing = g.gunner.firing;
    if (firing) this.burstT = this.burstT < 0 ? 0 : this.burstT + dt;
    else if (this.burstT >= 0) {
      if (this.burstT <= SHORT_BURST) this.bursts++; else this.longBursts++;
      this.burstT = -1;
    }
    const d = this.range.drones[0];
    if (s.kind === 'approach' && d && d.dist > OUT_OF_RANGE) this.wasted += g.world.stats.shots - this.prevShots;
    if (s.kind === 'jamFight' && !this.triggered && g.world.stats.hits - this.hits0 >= 4) { this.triggered = true; this.jam(); }
    if (s.kind === 'oxygenFight' && !this.triggered && (this.t > 4 || g.world.stats.hits - this.hits0 >= 3)) { this.triggered = true; this.cutHose(); }
    this.prevShots = g.world.stats.shots;
  }

  private check(s: LessonStep, dt: number): boolean {
    const g = this.game;
    const killed = !this.range.anyAlive();
    switch (s.kind) {
      case 'drill': case 'kill': case 'approach': case 'jamFight': return killed;
      case 'oxygenFight': return killed && !g.gunner.survival.oxygen;
      case 'leadHold': {
        const d = this.range.drones[0];
        const b = g.world.playerBomber;
        if (!d || !d.f.alive || !b) return true;
        const cam = this.engine.camera.position;
        gunLead(_lead, cam, d.f.pos, d.f.vel, b.vel, g.gunner.loadout.weapon.velocity * g.gunner.loadout.velocity);
        const ang = g.gunner.aimDirection(_v).angleTo(_v2.copy(_lead).sub(cam));
        if (ang < 0.045) this.acc += dt; else this.acc = Math.max(0, this.acc - dt * 0.5);
        return this.acc > 1;
      }
      case 'bursts': return this.bursts >= (s.need ?? 3);
      case 'jam': return !this.gun().jam;
      case 'oxygen': return !g.gunner.survival.oxygen;
    }
  }

  // ---------------- card ----------------
  private kicker() { return tx('STEP {n} / {m}', { n: this.stepIdx + 1, m: this.def!.steps.length }); }

  private refresh() {
    const s = this.step;
    if (!s) return;
    const g = this.game;
    const def = this.def!;
    const vars = {
      fire: kbd(tx(onTouch() ? 'FIRE' : 'Left button')), reload: kbd(keyMap.label('reload')), o2: kbd('O'),
      n: s.need ?? 3, conv: TWIN_CONVERGENCE,
    };
    let body = tx(s.text, vars);
    const st = STATIONS[def.station];
    if ((s.drone || s.kind === 'bursts' || s.kind === 'jam') && g.gunner.station !== def.station) {
      body += `<div class="warn">${tx('Back to the {st}: press {key}', { st: tx(st.label).toUpperCase(), key: kbd(st.key) })}</div>`;
    }
    const d = this.range.drones[0];
    if (s.kind === 'approach' && d) {
      body += `<div class="st">${tx('Range {m} m', { m: Math.round(d.dist / 10) * 10 })}${this.wasted ? ' · ' + tx('Rounds wasted out of range: {n}', { n: this.wasted }) : ''}</div>`;
    }
    if (s.kind === 'leadHold') body += `<div class="bar"><div style="width:${Math.round(Math.min(1, this.acc) * 100)}%"></div></div>`;
    if (s.kind === 'bursts') {
      body += `<div class="st">${tx('Short bursts: {n} / {m}', { n: this.bursts, m: s.need ?? 3 })}</div>`;
      if (this.longBursts && this.burstT < 0) body += `<div class="warn">${tx('Too long! Let go sooner.')}</div>`;
    }
    if (s.kind === 'oxygenFight' && g.gunner.survival.oxygen) body += `<div class="warn">${tx('Hose loose! Press {o2}', vars)}</div>`;
    if (s.kind === 'jamFight' && this.gun().jam) body += `<div class="warn">${tx('Jammed! Hold {reload}', vars)}</div>`;
    if (s.kind === 'drill') {
      const st2 = g.world.stats;
      body += `<div class="st">${tx('Hits: {n}', { n: st2.hits - this.hits0 })}</div>`;
    }
    const skip = `<button class="skip" data-skip>${onTouch() ? tx('Skip step') : tx('{key} skip step', { key: kbd('Backspace') })}</button>`;
    this.render(this.kicker(), tx(s.title), body + skip);
  }

  private render(kicker: string, title: string, body: string, done = false) {
    if (!this.card || !this.def) return;
    const steps = this.def.steps;
    const dots = steps.map((_, i) => `<i class="${i < this.stepIdx || (done && i === this.stepIdx) ? 'on' : i === this.stepIdx ? 'cur' : ''}"></i>`).join('');
    const head = `${tx('STATION LESSON')} · ${tx(STATIONS[this.def.station].label).toUpperCase()}`;
    const html = `<div class="k">${head}${kicker ? ' · ' + kicker : ''}</div><div class="t">${title}</div><div class="b">${body}</div><div class="dots">${dots}</div>`;
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.card.innerHTML = html;
    this.card.classList.toggle('done', done);
  }
}
