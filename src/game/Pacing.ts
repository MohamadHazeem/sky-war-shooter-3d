// Round pacing: the shape of a round of continuous combat, in three acts.
//
//   build    the first ~36% of the spawning time: the sky fills from the round's minimum
//            toward ~85% of its maximum
//   breather a 10–15 s lull: few new fighters, the music drops back, a line of crew banter
//   mid      the push resumes, climbing from 60% to the full maximum
//   final    the last 25%: no more trickle; a FINAL WAVE of 15–25 fighters arrives in two or
//            three big formations from different directions, the music goes to maximum and the
//            radio calls it in. Clearing it gives a short WAVE BEATEN beat, then the round ends.
//
// Game.director asks Pacing.director() every frame of a normal (non-boss) round and uses the
// returned level (`ramp`) for its target fighter count and skill, `scale` on that target, `gap`
// on the time between groups, `hold` to stop sending groups, `done` to end the round and `grace`
// as the clean-up time after the round clock runs out. The adaptive-difficulty multiplier is
// still applied by Game on top of all this. Boss rounds return from Game.director before
// Pacing is asked, so they are unaffected.
//
// Game modes (Modes.ts) can swap the profile: Ace Hunt keeps the three acts with a small elite
// final wave, Time Attack streams fighters for its whole clock and ends exactly on time.
import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { UI } from '../ui/UI';
import type { World } from '../world/World';
import type { Mission, Round, SpawnFrom, Wave } from './Missions';
import type { AttackType } from '../world/AI';
import { STATION_ORDER, StationId } from '../world/B17Layout';
import { sound } from '../audio/Sound';
import { VOICE_LINES, VoiceLineId } from '../audio/voiceLines';
import { modeFor, ModeRunner } from './Modes';

export type PacePhase = 'wait' | 'build' | 'breather' | 'mid' | 'final' | 'over';

export interface PaceProfile {
  breather: boolean;                       // mid-round lull
  final: false | { min: number; max: number };  // final wave size range (before the last-round bonus)
  stream?: boolean;                        // Time Attack: fast ramp, constant stream, ends exactly on the clock
}

export const DEFAULT_PROFILE: PaceProfile = { breather: true, final: { min: 15, max: 21 } };

export const BUILD_END = 0.36;        // share of the spawning time spent building up
export const FINAL_AT = 0.75;         // the final wave starts here (last 25%)
export const LULL_MIN = 10, LULL_MAX = 15;
export const AIR_CAP = 32;            // fighters in the air at once, final wave included (frame time)
const BEATEN_HOLD = 3;                // s of WAVE BEATEN before the round closes
const FORMATION_GAP = 4.5;            // s between the final wave's formations

export interface PaceMarks { start: number; buildEnd: number; lullEnd: number; final: number; end: number }

// Phase boundaries (round time, s) for a round
export function paceMarks(r: Round, profile: PaceProfile = DEFAULT_PROFILE): PaceMarks {
  const span = Math.max(1, r.duration - r.start);
  const buildEnd = r.start + span * BUILD_END;
  const lull = profile.breather ? THREE.MathUtils.clamp(span * 0.14, LULL_MIN, LULL_MAX) : 0;
  const final = profile.final ? r.start + span * FINAL_AT : r.duration;
  return { start: r.start, buildEnd, lullEnd: Math.min(final, buildEnd + lull), final, end: r.duration };
}

const smooth = (x: number) => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// The director's target curve at round time t: piecewise build -> lull -> surge (a pure
// function, unit-tested). ramp 0..1 is the level between the round's min and max.
export function paceAt(t: number, r: Round, profile: PaceProfile = DEFAULT_PROFILE): { phase: PacePhase; ramp: number; scale: number; gap: number } {
  if (t < r.start) return { phase: 'wait', ramp: 0, scale: 1, gap: 1 };
  if (t >= r.duration) return { phase: 'over', ramp: 1, scale: 1, gap: 1 };
  if (profile.stream) {
    // Time Attack: full strength within 20 s, groups close together, a last-30-seconds push
    const ramp = smooth((t - r.start) / 20);
    return { phase: 'mid', ramp, scale: r.duration - t < 30 ? 1.15 : 1, gap: 0.45 };
  }
  const k = paceMarks(r, profile);
  if (t < k.buildEnd) return { phase: 'build', ramp: 0.85 * smooth((t - k.start) / (k.buildEnd - k.start)), scale: 1, gap: 1 };
  if (t < k.lullEnd) return { phase: 'breather', ramp: 0, scale: 0.35, gap: 2.5 };
  if (t < k.final) {
    const x = (t - k.lullEnd) / Math.max(1, k.final - k.lullEnd);
    // the last moments before the final wave thin out a little: the calm before it
    return { phase: 'mid', ramp: 0.6 + 0.4 * smooth(x), scale: profile.final && x > 0.88 ? 0.75 : 1, gap: 1 };
  }
  return { phase: 'final', ramp: 1, scale: 1, gap: 1 };
}

// Size of a final wave. maxN: the round's max fighters (grows with the campaign / survival
// round), last: the mission's last round, mult: adaptive difficulty, enemies: already in the air.
export function finalWaveSize(profile: PaceProfile, maxN: number, last: boolean, mult: number, enemies: number, lowPerf: boolean): number {
  if (!profile.final) return 0;
  const { min, max } = profile.final;
  let n = THREE.MathUtils.lerp(min, max, THREE.MathUtils.clamp((maxN - 5) / 15, 0, 1)) + (last ? 4 : 0);
  n *= THREE.MathUtils.clamp(mult, 0.8, 1.25);
  if (lowPerf) n *= 0.75;
  const hi = max + (last ? 4 : 0);
  n = Math.min(Math.round(n), hi, AIR_CAP - enemies);
  return Math.max(Math.ceil(min * 0.6), n);
}

// Split a final wave into formations: 3 for the big ones (and every mission's last round)
export function splitFormations(n: number, last: boolean): number[] {
  const k = n >= 18 || last ? 3 : 2;
  const out: number[] = [];
  for (let i = 0; i < k; i++) out.push(Math.floor(n / k) + (i < n % k ? 1 : 0));
  return out.filter((c) => c > 0);
}

export interface Pace {
  phase: PacePhase;
  ramp: number;      // 0..1 level between r.min and r.max (also drives skill and the group gap)
  scale: number;     // multiplier on the target number in the air
  gap: number;       // multiplier on the time between groups
  hold: boolean;     // send no groups now
  done: boolean;     // the round can end now
  grace: number;     // s after the round clock before the round ends regardless
}

export interface PacingHooks {
  spawn(w: Wave): void;                        // Game.spawnWave (one formation)
  score(n: number): void;
  adaptive: { mult: number; skill: number };
  station(): StationId | null;                 // gun position the player is manning (gunner)
}

const ATTACK: Record<string, AttackType> = { front: 'headon', rear: 'stern', left: 'beam', right: 'beam', high: 'high' };
const shuffle = <T>(a: T[]): T[] => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

const LULL_GUNNER: VoiceLineId[] = ['rc_lull', 'chat_oxygen', 'chat_tail_oxygen', 'chat_ball_clear', 'chat_engineer_hot', 'chat_bombardier_sun', 'chat_interphone'];
const LULL_PILOT: VoiceLineId[] = ['rc_lead_regroup', 'chat_lead_fuel', 'chat_lead_swivel', 'chat_blue3_temps', 'chat_bigfriend_thanks'];

export class Pacing {
  phase: PacePhase = 'wait';
  finalCount = 0;                // fighters in this round's final wave
  log: string[] = [];            // dev / playtests: what happened when
  private mission: Mission | null = null;
  private roundIdx = -1;
  private lastT = -1;
  private lastWorldTime = 0;
  private finalT = -1;           // round time the final wave began (-1: not yet)
  private queue: { at: number; wave: Wave }[] = [];
  private beatenT = -1;          // round time the final wave was beaten
  private lullDone = false;
  private music: number | null = null;   // intensity override for this frame (applied in frame())

  constructor(private world: World, private ui: UI, private engine: Engine, private modes: ModeRunner, private hooks: PacingHooks) {}

  get profile(): PaceProfile { return (this.mission && modeFor(this.mission)?.pace) || DEFAULT_PROFILE; }

  // Game.director, after the boss check: t is the round time, enemies the active fighters
  director(dt: number, m: Mission, r: Round, t: number, enemies: number, roundIdx: number): Pace {
    const w = this.world;
    if (m !== this.mission || roundIdx !== this.roundIdx || t < this.lastT - 1e-6 || w.time < this.lastWorldTime - 1e-6) this.newRound(m, roundIdx);
    this.lastT = t; this.lastWorldTime = w.time;
    const prof = this.profile;
    const base = paceAt(t, r, prof);
    const last = Number.isFinite(m.rounds ?? 1) && roundIdx >= (m.rounds ?? 1) - 1;
    this.modes.tick(dt, m, r, t, enemies);
    const out: Pace = { ...base, hold: false, done: false, grace: 30 };

    // ---- breather ----
    if (base.phase === 'breather') {
      if (!this.lullDone) {
        this.lullDone = true;
        const id = pick(m.role === 'pilot' ? LULL_PILOT : LULL_GUNNER);
        const l = VOICE_LINES[id];
        w.callout('pace_lull', pick(l.speakers as readonly string[]), l.text, 20, 1);
        this.ui.tip(m.role === 'gunner' ? 'A lull in the attack — reload and cool the guns' : 'A lull in the attack — climb back above the bombers', 2600);
        this.log.push(`${t.toFixed(0)}s breather`);
      }
      this.music = 0.12;
    }

    // ---- final wave ----
    if (prof.final && t >= paceMarks(r, prof).final && this.finalT < 0 && t < r.duration) this.startFinal(m, r, t, enemies, last);
    if (this.finalT >= 0) {
      out.hold = true;
      while (this.queue.length && t >= this.queue[0].at) {
        const q = this.queue.shift()!;
        this.hooks.spawn(q.wave);
        sound.music.swell();
      }
      const all = this.queue.length === 0;
      if (this.beatenT < 0) {
        this.music = 1;
        if (all && enemies === 0 && t - this.finalT > 2) this.waveBeaten(m, t, last);
      }
      if (this.beatenT >= 0 && t - this.beatenT >= BEATEN_HOLD) out.done = true;
      // the final wave is fought out: time to clear it after the round clock (2.5 s a fighter)
      out.grace = Math.min(90, 30 + 2.5 * this.finalCount);
    } else if (prof.stream) {
      out.done = t >= r.duration;                  // Time Attack ends with the clock
    } else {
      out.done = t >= r.duration && enemies === 0; // no final wave (or never reached it): the old rule
    }
    this.phase = this.finalT >= 0 && base.phase !== 'over' ? 'final' : base.phase;
    out.phase = this.phase;
    return out;
  }

  // Game.frame, after the fighter sounds have set the music level: calm the breather, max the final wave
  frame(_dt: number) {
    if (this.music !== null) sound.music.setIntensity(this.music);
    this.music = null;
  }

  private newRound(m: Mission, roundIdx: number) {
    this.mission = m; this.roundIdx = roundIdx;
    this.finalT = -1; this.beatenT = -1; this.queue = []; this.lullDone = false; this.finalCount = 0;
    this.phase = 'wait';
    if (roundIdx === 0) this.log = [];
  }

  private startFinal(m: Mission, r: Round, t: number, enemies: number, last: boolean) {
    const prof = this.profile;
    const lowPerf = this.engine.quality === 'low' || this.engine.fps < 35;
    const n = finalWaveSize(prof, r.max, last, this.hooks.adaptive.mult, enemies, lowPerf);
    this.finalT = t;
    this.finalCount = n;
    const parts = splitFormations(n, last);
    const skill = r.skill[1] * this.hooks.adaptive.skill * 0.95;   // a crowd: each one a touch less sharp
    const sides = shuffle(['front', 'left', 'right', 'rear', 'high'] as SpawnFrom[]);
    // gunner: the first formation comes in on the player's gun, the others on two other positions
    const here = this.hooks.station();
    const others = shuffle(STATION_ORDER.filter((s) => s !== here));
    this.queue = parts.map((count, i) => {
      const from = sides[i % sides.length];
      const station = m.role === 'gunner' && i > 0 ? others[(i - 1) % others.length] : undefined;
      return { at: t + i * FORMATION_GAP, wave: { at: 0, count, from, attack: ATTACK[from], station, skill, rockets: r.rockets ?? 0 } };
    });
    const elite = !!modeFor(m)?.elite;
    this.ui.banner('FINAL WAVE', elite ? `${n} elite fighters — the aces are coming` : last ? `${n} fighters — here comes the whole Luftwaffe!` : `${n} fighters inbound from ${parts.length} directions`, 3800);
    this.world.callout('pace_final', m.role === 'pilot' ? 'Lead' : 'Pilot',
      m.role === 'pilot' ? 'Here comes the whole Luftwaffe! Blue flight, break them up before they reach the bombers!' : 'Here comes the whole Luftwaffe! Every gun, pick a target!', 0, 3);
    sound.music.swell();
    this.log.push(`${t.toFixed(0)}s FINAL WAVE ${n} in ${parts.join('+')} (air ${enemies})`);
  }

  private waveBeaten(m: Mission, t: number, last: boolean) {
    this.beatenT = t;
    const bonus = 250 + 20 * this.finalCount;
    this.hooks.score(bonus);
    this.ui.banner('WAVE BEATEN', `The sky is clear · +${bonus}`, 2800);
    if (m.role === 'pilot') this.world.callout('pace_beaten', 'Lead', VOICE_LINES.rc_lead_clear.text, 0, 3);
    else if (last) this.world.callout('pace_beaten', 'Pilot', VOICE_LINES.rc_going_home.text, 0, 3);
    else this.world.callout('pace_beaten', 'Pilot', 'That\'s the lot of them! They\'re breaking off!', 0, 3);
    sound.music.swell();
    this.log.push(`${t.toFixed(0)}s WAVE BEATEN`);
  }
}
