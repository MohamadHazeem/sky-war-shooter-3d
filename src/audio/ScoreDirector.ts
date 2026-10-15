// Adaptive score 2.0: the rules that turn game events into music cues. Pure (time is passed
// in), so the score's behaviour is unit-tested in Node; Music.ts plays what it decides.
//
//   rise       the score climbs into the climax (a roll + crash whose accent lands on the
//              climax track's first downbeat)
//   bombsAway  release: big drum, crash and a low brass chord over the bomb-run bed
//   strike     the strike is confirmed below: a timpani roll into a major brass chord
//   loss       a friendly B-17 goes down: a bell toll and a falling muted-trumpet lament
//   win        mission success: a short brass fanfare, the victory track entering under it
//   bunk       the crew room with an empty bunk: a solo horn over the room's music
//
// The bomb run also gets its own bed (music_bombrun: snare-march strings in D minor) from
// the IP to the strike, and a field-snare layer whose level follows the run's phases.
import type { BombRunPhase } from '../game/BombRunState';
import type { Mood } from './Music';

export type Cue = 'rise' | 'bombsAway' | 'strike' | 'loss' | 'win' | 'bunk';

export interface CueSpec {
  cooldown: number;           // s before the same cue may play again
  duck: number;               // bed + layers dip to this level while it sounds (1 = none)
  quantise: 'now' | 'beat' | 'bar'; // where on the playing track's grid its accent lands
  priority: number;           // a higher one may cut the global gap of a lower one
}

export const CUES: Record<Cue, CueSpec> = {
  rise: { cooldown: 45, duck: 1, quantise: 'bar', priority: 1 },
  bombsAway: { cooldown: 20, duck: 0.7, quantise: 'beat', priority: 3 },
  strike: { cooldown: 20, duck: 0.75, quantise: 'beat', priority: 2 },
  loss: { cooldown: 10, duck: 0.55, quantise: 'beat', priority: 2 },
  win: { cooldown: 5, duck: 0.4, quantise: 'now', priority: 4 },
  bunk: { cooldown: 30, duck: 0.6, quantise: 'now', priority: 1 },
};

export const MIN_GAP = 3;        // s between two cues (unless the later one outranks)
export const MAX_LOSS_CUES = 3;  // per mission: a massacre must not become a bell concert

/** The bomb run has its own bed from the IP until the strike photos. */
export function bombRunBed(phase: BombRunPhase): boolean {
  return phase === 'inbound' || phase === 'level' || phase === 'doors' || phase === 'countdown'
    || phase === 'away' || phase === 'falling' || phase === 'strike';
}

/** Field-snare layer level (0..1) through the run: it tightens towards the release, holds
 * back while the bombs fall, and is gone by the rally. */
export function bombRunSnare(phase: BombRunPhase): number {
  switch (phase) {
    case 'inbound': return 0.45;
    case 'level': return 0.6;
    case 'doors': return 0.8;
    case 'countdown': return 1;
    case 'away': return 0.25;
    case 'falling': return 0.55;
    case 'strike': return 0.3;
    default: return 0;
  }
}

/** Snare-layer level outside the bomb run, from the mood and the smoothed threat. */
export function moodSnare(mood: Mood, threat: number): number {
  if (mood === 'climax') return 0.65;
  if (mood !== 'combat') return 0;
  return 0.3 + 0.3 * Math.min(1, Math.max(0, (threat - 0.45) / 0.37));
}

export class ScoreDirector {
  private last = new Map<Cue, number>();
  private lastAt = -Infinity;
  private lastPriority = 0;
  private losses = 0;
  private phase: BombRunPhase = 'idle';
  enabled = true;

  /** A new mission (or the menus): cooldowns and the loss count start over. */
  reset() { this.last.clear(); this.lastAt = -Infinity; this.lastPriority = 0; this.losses = 0; this.phase = 'idle'; }

  /** May `cue` play at `now`? Records it when it may. */
  request(cue: Cue, now: number): boolean {
    if (!this.enabled) return false;
    const spec = CUES[cue];
    if (now - (this.last.get(cue) ?? -Infinity) < spec.cooldown) return false;
    if (now - this.lastAt < MIN_GAP && spec.priority <= this.lastPriority) return false;
    if (cue === 'loss') { if (this.losses >= MAX_LOSS_CUES) return false; this.losses++; }
    this.last.set(cue, now); this.lastAt = now; this.lastPriority = spec.priority;
    return true;
  }

  /** The bomb-run clock moved: the cue its new phase earns, if any. */
  bombRun(phase: BombRunPhase, now: number): Cue | null {
    const was = this.phase;
    if (phase === was) return null;
    this.phase = phase;
    if (phase === 'away' && was !== 'away') return this.request('bombsAway', now) ? 'bombsAway' : null;
    if (phase === 'strike' && was === 'falling') return this.request('strike', now) ? 'strike' : null;
    return null;
  }

  /** The mood changed: entering the climax from below earns the rise. */
  mood(from: Mood, to: Mood, now: number): Cue | null {
    return to === 'climax' && from !== 'climax' && this.request('rise', now) ? 'rise' : null;
  }

  /** A friendly bomber went down (the player's own loss is the defeat's business). */
  bomberLost(player: boolean, now: number): Cue | null {
    return !player && this.request('loss', now) ? 'loss' : null;
  }

  get lossCues() { return this.losses; }
}

/** Playback rate that moves a cue rendered on `from` (pitch class) to `to`, by the nearest
 * way (at most a tritone either side), so a pitched cue sits in the key of the bar it lands in. */
export function transposeRate(from: number, to: number): number {
  let st = (((to - from) % 12) + 12) % 12;
  if (st > 6) st -= 12;
  return Math.pow(2, st / 12);
}
