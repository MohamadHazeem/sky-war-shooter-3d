// Adaptive difficulty director (Phase 11 · 29). Measures how the player is doing — accuracy,
// damage taken, reaction time (a fighter entering gun range -> the player's first hit on it)
// and kills per minute — and gently adapts four knobs, always inside the band of the chosen
// difficulty (Recruit never reaches Veteran, Veteran never reaches Recruit or Ace):
//
//   mult   the director's target number of fighters in the air (Director, Pacing)
//   skill  enemy skill: how readily pilots press attacks and how sharp they fly and shoot
//   aim    x World.enemyAimMult: > 1 spoils the attackers' aim
//   focus  x World.playerFocus: < 1 sends more attackers at the rest of the formation
//
// Never punishing: easing is fast and works from the first seconds (a badly hurt aircraft
// eases at once), pushing is slow and needs a minute of evidence; a crisis (low health)
// cancels any push straight away; the score and merit are never touched. Settings "Adaptive
// difficulty" switches it off (every knob exactly 1). Pure: no THREE, no DOM (tests/adaptive.test.ts).

export type AdaptiveBand = 'recruit' | 'veteran' | 'ace';
export type AdaptiveRole = 'gunner' | 'pilot';

// How far each difficulty may ease (performance -1) or push (+1). Recruit leans on easing, Ace
// on pushing ("Ace stays brutal"). With difficultyBalance (enemy 0.8 / 1 / 1.2) the effective
// enemy skill stays inside 0.8x.. of the neighbours' midpoints (tests/adaptive.test.ts).
export const ADAPTIVE_BANDS: Record<AdaptiveBand, { ease: number; push: number }> = {
  recruit: { ease: 1, push: 0.5 },
  veteran: { ease: 0.8, push: 0.8 },
  ace: { ease: 0.5, push: 1 },
};
// Full-strength swing of each knob at performance -1 (ease) and +1 (push), before the band
export const ADAPTIVE_RANGE = {
  mult: { ease: 0.25, push: 0.2 },    // fighters in the air: 0.75x .. 1.2x
  skill: { ease: 0.12, push: 0.1 },   // enemy skill: 0.88x .. 1.1x
  aim: { ease: 0.3, push: 0.08 },     // aim error: 1.3x (worse) .. 0.92x (sharper)
  focus: { ease: 0.25, push: 0 },     // attackers on the player: 0.75x .. 1x (never more)
};
// What a human-level player does (calibrated on the autoplay human bot, docs/BALANCE.md and
// docs/phase11/reports/29.md): performance 0 = these, the knobs stay at 1
export const ADAPTIVE_BASELINE: Record<AdaptiveRole, { acc: number; react: number; dmg: number; kpm: number }> = {
  gunner: { acc: 0.35, react: 4, dmg: 0.04, kpm: 5.5 },   // dmg: integrity lost per minute; react: s from 900 m
  pilot: { acc: 0.24, react: 4, dmg: 0.06, kpm: 1.4 },
};
// weights of the four measures: in the autoplay runs accuracy and damage separate the bots best;
// reaction time is noisy (target choice, gun sectors), so it only nudges
const W = { acc: 0.4, react: 0.1, dmg: 0.3, kpm: 0.2 };
const WINDOW = 45;          // s, time constant of the measures (recent play counts most)
const EASE_TAU = 10;        // s, how fast the knobs ease off
const PUSH_TAU = 40;        // s, how fast they push (slow: the player never feels a switch)
const WARMUP = 60;          // s of play before any push is allowed
const MIN_SHOTS = 30;       // rounds in the window before accuracy counts
const REACT_CAP = 15;       // s, longest reaction counted
const CRISIS = 0.4;         // health below this: no push, ease hard

export interface AdaptiveSample {
  t: number;            // world time (s)
  dt: number;           // frame time (s)
  health: number;       // player's aircraft integrity 0..1
  shots: number;        // cumulative rounds fired by the player (world.stats.shots)
  hits: number;         // cumulative rounds that struck (world.stats.hits)
}
// A target the reaction tracker sees (Fighter fits)
export interface AdaptiveTarget { team?: string; alive: boolean; remove?: boolean; playerDamage: number; pos: { distanceTo(p: any): number } }

const clamp = (v: number, a = -1, b = 1) => Math.max(a, Math.min(b, v));

export class Adaptive {
  enabled = true;
  band: AdaptiveBand = 'veteran';
  role: AdaptiveRole = 'gunner';
  baseFocus = 0.75;   // the mission's World.playerFocus before adapting
  // outputs
  mult = 1; skill = 1; aim = 1; focus = 1;
  perf = 0;           // performance -1 struggling .. +1 dominating (after the crisis rules; x the band when on)
  // measures (EMAs)
  acc = 0; react = 0; dmg = 0; kpm = 0;
  private shotsE = 0; private hitsE = 0; private reactN = 0;
  private lastShots = -1; private lastHits = 0; private lastHealth = -1;
  private t0 = -1; private lastT = 0;
  private kills: number[] = [];
  private engaged = new WeakMap<object, number>();   // target -> time it entered gun range (-1: counted)
  private scanT = 0;
  // mission summary (debrief): time-weighted mean of mult
  private sumMult = 0; private sumT = 0;

  reset(band: AdaptiveBand = this.band, role: AdaptiveRole = this.role, baseFocus = this.baseFocus) {
    this.band = band; this.role = role; this.baseFocus = baseFocus;
    this.mult = this.skill = this.aim = this.focus = 1; this.perf = 0;
    const b = ADAPTIVE_BASELINE[role];
    this.acc = b.acc; this.react = b.react; this.dmg = b.dmg; this.kpm = b.kpm;
    this.shotsE = this.hitsE = this.reactN = 0;
    this.lastShots = -1; this.lastHits = 0; this.lastHealth = -1; this.t0 = -1; this.lastT = 0;
    this.kills = []; this.engaged = new WeakMap(); this.scanT = 0;
    this.sumMult = this.sumT = 0;
  }

  onKill(t: number) { this.kills.push(t); }

  /** Reaction time: call with the enemy fighters and the player's position (cheap; scans 4x a second). */
  observe(t: number, targets: Iterable<AdaptiveTarget>, from: unknown, range: number) {
    if (t < this.scanT) return;
    this.scanT = t + 0.25;
    for (const f of targets) {
      if (!f.alive || f.remove || (f.team !== undefined && f.team !== 'axis')) continue;
      const at = this.engaged.get(f);
      if (at === -1) continue;
      if (at === undefined) {
        if (f.pos.distanceTo(from) < range) this.engaged.set(f, f.playerDamage > 0 ? -1 : t);
        continue;
      }
      if (f.playerDamage > 0) { this.engaged.set(f, -1); this.addReaction(t - at); }
      else if (t - at > REACT_CAP) this.engaged.set(f, -1);   // never answered: dropped (another gun's
    }                                                            // sector, or the player was busy); damage taken covers it
  }

  private addReaction(rt: number) {
    const s = Math.min(REACT_CAP, Math.max(0, rt));
    this.reactN++;
    const k = Math.max(0.12, 1 / this.reactN);   // first samples count fully, then an EMA
    this.react += (s - this.react) * k;
  }

  /** Measure and adapt once per frame. */
  update(s: AdaptiveSample) {
    const { t, dt } = s;
    if (this.t0 < 0) { this.t0 = t; this.lastShots = s.shots; this.lastHits = s.hits; this.lastHealth = s.health; }
    const played = t - this.t0;
    const decay = Math.exp(-dt / WINDOW), b = ADAPTIVE_BASELINE[this.role];
    // accuracy: rounds fired and hits in the window
    const ds = Math.max(0, s.shots - this.lastShots), dh = Math.max(0, s.hits - this.lastHits);
    this.lastShots = s.shots; this.lastHits = s.hits;
    this.shotsE = this.shotsE * decay + ds; this.hitsE = this.hitsE * decay + dh;
    if (this.shotsE > 1) this.acc = Math.min(1, this.hitsE / this.shotsE);
    // damage taken: integrity lost per minute (repairs don't count back)
    const lost = Math.max(0, this.lastHealth - s.health); this.lastHealth = s.health;
    if (dt > 0) this.dmg += (lost * 60 / dt - this.dmg) * (1 - decay);
    // kills in the last minute (scaled while the first minute fills)
    while (this.kills.length && t - this.kills[0] > 60) this.kills.shift();
    this.kpm = this.kills.length * 60 / Math.max(30, Math.min(60, played));

    // performance: each measure against a human-level player, -1 .. +1
    let p = 0, wsum = 0;
    if (this.shotsE >= MIN_SHOTS) { p += W.acc * clamp((this.acc / b.acc - 1) / 0.6); wsum += W.acc; }
    if (this.reactN >= 2) { p += W.react * clamp((b.react - this.react) / b.react); wsum += W.react; }
    p += W.dmg * clamp((b.dmg - this.dmg) / b.dmg); wsum += W.dmg;
    if (played >= 30) { p += W.kpm * clamp((this.kpm / b.kpm - 1) / 0.75); wsum += W.kpm; }
    p = wsum > 0 ? p / wsum : 0;
    // health: a badly hurt aircraft always eases; a healthy one only adds a little
    const h = s.health;
    if (h < CRISIS) p = Math.min(p, -0.5 - (CRISIS - h) * 1.25);
    else if (h < 0.6) p = Math.min(p, 0) - 0.25;
    // no push on thin evidence
    if (played < WARMUP) p = Math.min(p, 0);
    p = clamp(p);
    this.lastT = t;
    // off: still measured (dev readout), every knob exactly 1
    if (!this.enabled) { this.mult = this.skill = this.aim = this.focus = 1; this.perf = p; return; }
    const band = ADAPTIVE_BANDS[this.band];
    const pb = p >= 0 ? p * band.push : p * band.ease;
    this.perf = pb;

    const target = (r: { ease: number; push: number }, sign: 1 | -1) => 1 + sign * (pb >= 0 ? r.push * pb : r.ease * pb);
    const crisis = h < CRISIS;
    this.mult = this.ease(this.mult, target(ADAPTIVE_RANGE.mult, 1), dt, crisis);
    this.skill = this.ease(this.skill, target(ADAPTIVE_RANGE.skill, 1), dt, crisis);
    this.aim = this.ease(this.aim, target(ADAPTIVE_RANGE.aim, -1), dt, crisis, true);
    this.focus = this.ease(this.focus, target(ADAPTIVE_RANGE.focus, 1), dt, crisis);
    this.sumMult += this.mult * dt; this.sumT += dt;
  }

  // easing (toward the easier side) is fast, pushing slow; a crisis drops any push at once.
  // inverse: for aim, larger = easier
  private ease(v: number, want: number, dt: number, crisis: boolean, inverse = false) {
    const easier = inverse ? want > v : want < v;
    if (crisis && (inverse ? v < 1 : v > 1)) v = 1;
    return v + (want - v) * (1 - Math.exp(-dt / (easier ? EASE_TAU : PUSH_TAU)));
  }

  /** The mission in one word for the debrief: eased / steady / pushed / off. */
  summary(): 'off' | 'eased' | 'steady' | 'pushed' {
    if (!this.enabled) return 'off';
    const m = this.sumT > 0 ? this.sumMult / this.sumT : 1;
    return m < 0.95 ? 'eased' : m > 1.05 ? 'pushed' : 'steady';
  }

  /** Dev readout (sws.game.adaptive.state()). */
  state() {
    const r = (v: number) => Math.round(v * 1000) / 1000;
    return { enabled: this.enabled, band: this.band, role: this.role, perf: r(this.perf), mult: r(this.mult), skill: r(this.skill), aim: r(this.aim), focus: r(this.focus),
      acc: r(this.acc), react: r(this.react), dmg: r(this.dmg), kpm: r(this.kpm), summary: this.summary(), t: r(this.lastT) };
  }
}
