import type { FlightParams } from './FlightModel';
import { ENEMY_VARIANTS, type EnemyType } from './EnemyTypes';
import type { StationId } from './B17Layout';

/**
 * Enemy AI 2.0 (Phase 10 goal 11): the decisions behind a Luftwaffe pilot, kept pure so they are
 * unit-tested and deterministic (every random choice takes an `rng`). EnemyPilot (AI.ts) asks
 * these functions what to do and flies the answer.
 *
 *  envelope      per-type performance from the flight model itself: stall, corner, level and
 *                never-exceed speeds (the AI never dives past vDive, never chooses to fly slow)
 *  energyPlan    after a pass: extend (unload, rebuild speed), zoom (trade speed for a perch),
 *                dive (trade height for speed) or re-attack at once
 *  chooseApproach  attack geometry per target weakness: a silent / wounded gun, a straggler, the
 *                side with a dead engine, the type's own strengths and the pilot's personality
 *  pressure / pickEvasion  evasive breaks when the gunner's fire gets close: jink, break, split-S
 *  woundedChoice  limp home or press on, by personality
 *  personas      aggressive / cunning / cautious; aces add a signature move the crew learns
 *  decisionQuality  difficulty scales how good these choices are, not only the aim
 */

export type Rng = () => number;
export type Personality = 'aggressive' | 'cunning' | 'cautious';
export type Signature = 'corkscrew' | 'splitS' | 'zoom' | 'wingover' | 'lowSix';
export type EnergyMove = 'dive' | 'zoom' | 'extend' | 'reattack';
export type Evasion = 'jink' | 'break' | 'splitS';
export type Approach = 'headon' | 'stern' | 'beamL' | 'beamR' | 'high' | 'low';
export type Role = 'turner' | 'slasher' | 'heavy' | 'bomber';

export const G = 9.81;
export const PERSONALITIES: Personality[] = ['aggressive', 'cunning', 'cautious'];
export const SIGNATURE_IDS: Signature[] = ['corkscrew', 'splitS', 'zoom', 'wingover', 'lowSix'];
export const APPROACHES: Approach[] = ['headon', 'stern', 'beamL', 'beamR', 'high', 'low'];

// ---------------------------------------------------------------- envelopes
export interface Envelope {
  role: Role;
  vStall: number;    // 1 g stall (m/s)
  vCorner: number;   // slowest speed that still pulls max g: the best turning speed
  vMax: number;      // level top speed at full power
  vDive: number;     // never exceed: the AI throttles back and shallows the dive before this
}

// Never-exceed speeds (m/s, true airspeed at bomber altitude; real-world ratios between types)
const V_DIVE: Record<EnemyType, number> = { fw190: 235, bf109: 220, me262: 275, bf110: 205, ju88: 195, ju88g: 210, me163: 280, he111: 165, me410: 215, do335: 250 };
const ROLE: Record<EnemyType, Role> = { fw190: 'turner', bf109: 'turner', me262: 'slasher', me163: 'slasher', do335: 'slasher', bf110: 'heavy', ju88: 'heavy', ju88g: 'heavy', me410: 'heavy', he111: 'bomber' };

/** Speeds that come out of the flight model's own numbers (FlightModel.ts). */
export function envelopeOf(p: FlightParams, vDive: number, role: Role): Envelope {
  const vStall = Math.sqrt(G / (p.liftK * p.alphaStall));
  const vCorner = vStall * Math.sqrt(p.maxG);
  const vMax = Math.cbrt(p.power / p.dragK);
  return { role, vStall, vCorner: Math.min(vCorner, vMax * 0.92), vMax, vDive: Math.max(vDive, vMax * 1.05) };
}

export const ENVELOPES = Object.fromEntries((Object.keys(ENEMY_VARIANTS) as EnemyType[])
  .map((t) => [t, envelopeOf(ENEMY_VARIANTS[t].params, V_DIVE[t], ROLE[t])])) as Record<EnemyType, Envelope>;
export const envelope = (t: string): Envelope => ENVELOPES[t as EnemyType] ?? ENVELOPES.fw190;

// ---------------------------------------------------------------- energy
/** Specific energy as a height (m): what the aircraft could climb to by trading all its speed. */
export const energyHeight = (alt: number, speed: number) => alt + (speed * speed) / (2 * G);
/** Height a zoom climb gains bleeding from `speed` down to the corner speed (80 % efficient). */
export const zoomGain = (env: Envelope, speed: number) => Math.max(0, (speed * speed - env.vCorner * env.vCorner) / (2 * G)) * 0.8;

export interface EnergyState { alt: number; speed: number }

/**
 * What to do after a firing pass (or before the next one), from the pilot's energy against his
 * target's. Good pilots (q high) never come back in slow and always keep a height advantage;
 * rookies turn straight back in. Jets never turn with the bombers: extend, zoom, slash again.
 */
export function energyPlan(env: Envelope, me: EnergyState, ref: EnergyState, q: number, personality: Personality): EnergyMove {
  const slow = me.speed < env.vCorner * 0.85;
  const fast = me.speed > env.vCorner * 1.15;
  const above = me.alt - ref.alt;
  if (env.role === 'slasher') return slow ? 'extend' : above < 500 ? 'zoom' : 'dive';
  if (q < 0.35) return me.speed < env.vStall * 1.6 ? 'extend' : 'reattack';
  if (slow) return 'extend';
  if (above > 900) return 'dive';
  if (fast && above < 600) return 'zoom';
  if (personality === 'cautious' && above < 300) return 'zoom';
  return 'reattack';
}

/** Throttle that keeps the aircraft inside its envelope (dive limit, never slow by choice). */
export function envelopeThrottle(env: Envelope, speed: number, want: number): number {
  if (speed > env.vDive * 0.92) return Math.min(want, 0.15);
  if (speed > env.vDive * 0.85) return Math.min(want, 0.5);
  if (speed < env.vStall * 1.3) return 1;
  return want;
}

// ---------------------------------------------------------------- attack geometry
// Which of the bomber's guns cover each approach (the player's five stations; the chin and
// cheek guns add a little up front). A silent or wounded gun opens its sector.
export const COVER: Record<Approach, Partial<Record<StationId, number>>> = {
  headon: { top: 0.5, ball: 0.2 },
  stern: { tail: 0.7, top: 0.3, ball: 0.3 },
  beamL: { waistL: 0.7, top: 0.3, ball: 0.2 },
  beamR: { waistR: 0.7, top: 0.3, ball: 0.2 },
  high: { top: 0.8, waistL: 0.1, waistR: 0.1 },
  low: { ball: 0.8, tail: 0.2 },
};
const COVER_FIXED: Record<Approach, number> = { headon: 0.15, stern: 0, beamL: 0, beamR: 0, high: 0, low: 0 };
// time spent inside the guns' reach (closure speed): head-on is over fastest, the stern chase slowest
const EXPOSURE: Record<Approach, number> = { headon: 0.6, stern: 1.3, beamL: 1, beamR: 1, high: 0.8, low: 1 };
/** The gun position on the player's ship that each approach comes through. */
export const STATION_OF: Record<Approach, StationId> = { headon: 'top', stern: 'tail', beamL: 'waistL', beamR: 'waistR', high: 'top', low: 'ball' };

const FIT: Record<Role, Record<Approach, number>> = {
  turner: { headon: 0.5, stern: 0.3, beamL: 0.2, beamR: 0.2, high: 0.4, low: 0.1 },
  slasher: { headon: 0, stern: 0.7, beamL: 0, beamR: 0, high: 0.5, low: 0.5 },
  heavy: { headon: 0.1, stern: 0.4, beamL: 0.5, beamR: 0.5, high: 0.2, low: 0 },
  bomber: { headon: 0, stern: 0, beamL: 0.5, beamR: 0.5, high: 0, low: 0 },
};
const STYLE: Record<Personality, Partial<Record<Approach, number>>> = {
  aggressive: { headon: 0.3, stern: 0.2 },
  cunning: { high: 0.25, low: 0.25 },
  cautious: { beamL: 0.15, beamR: 0.15, high: 0.2 },
};
const DEF_WEIGHT: Record<Personality, number> = { aggressive: 0.6, cunning: 1, cautious: 1.4 };
const WEAK_WEIGHT: Record<Personality, number> = { aggressive: 0.8, cunning: 1.5, cautious: 1.1 };

export interface TargetState {
  straggler: boolean;
  engineOut: [number, number];                     // dead engines on the bomber's left, right
  weak: Partial<Record<StationId, number>>;        // 0 = gun fully manned .. 1 = silent
}
export interface Attacker { role: Role; personality: Personality; q: number }
export type PickReason = 'deadGun' | 'straggler' | 'engine' | 'type' | 'style';
export interface ApproachPick { approach: Approach; reason: PickReason; score: number }

export function approachScores(t: TargetState, a: Attacker): { approach: Approach; score: number; reason: PickReason }[] {
  return APPROACHES.map((ap) => {
    let def = COVER_FIXED[ap], weakGain = 0;
    for (const [s, c] of Object.entries(COVER[ap]) as [StationId, number][]) {
      const wk = Math.min(1, Math.max(0, t.weak[s] ?? 0));
      def += c * (1 - wk);
      weakGain += c * wk;
    }
    const fit = FIT[a.role][ap], style = STYLE[a.personality][ap] ?? 0;
    let engine = 0;
    if (ap === 'beamL') engine = 0.45 * t.engineOut[0];
    if (ap === 'beamR') engine = 0.45 * t.engineOut[1];
    const strag = t.straggler ? (ap === 'stern' || ap === 'low' ? 0.6 : 0.2) : 0;
    const weak = weakGain * WEAK_WEIGHT[a.personality];
    const score = fit + style + engine + strag + weak - DEF_WEIGHT[a.personality] * def * EXPOSURE[ap] * 0.5;
    const top = Math.max(weak, engine, strag, fit, style);
    const reason: PickReason = top === weak && weak > 0.25 ? 'deadGun' : top === strag && strag > 0 ? 'straggler' : top === engine && engine > 0 ? 'engine' : top === style && style > fit ? 'style' : 'type';
    return { approach: ap, score, reason };
  });
}

/** Pick an approach. Good pilots (q -> 1) take the best one; poor ones choose almost at random. */
export function chooseApproach(t: TargetState, a: Attacker, rng: Rng): ApproachPick {
  const all = approachScores(t, a);
  const T = 0.04 + 0.7 * (1 - Math.min(1, Math.max(0, a.q)));
  let max = -Infinity;
  for (const s of all) max = Math.max(max, s.score);
  let sum = 0;
  const w = all.map((s) => { const v = Math.exp((s.score - max) / T); sum += v; return v; });
  let r = rng() * sum;
  for (let i = 0; i < all.length; i++) { r -= w[i]; if (r <= 0) return all[i]; }
  return all[all.length - 1];
}

// ---------------------------------------------------------------- evasion
/** Gunfire pressure: player rounds passing within ~30 m count 1, a hit 4; it fades in ~1 s. */
export function updatePressure(p: number, near: number, hit: boolean, dt: number) { return p * Math.exp(-dt) + near + (hit ? 4 : 0); }
/** Pressure that makes a pilot react. Better pilots read the tracers sooner; aggressive ones shrug them off. */
export function evasionThreshold(personality: Personality, q: number) {
  // pressure ~ rounds per second passing within 30 m: sustained accurate fire is 10-20
  const base = personality === 'aggressive' ? 10 : personality === 'cunning' ? 6.5 : 4;
  return base * (1.35 - 0.6 * Math.min(1, Math.max(0, q)));
}
/** Seconds between tracers getting close and the stick moving. */
export const reactionTime = (q: number) => 0.9 - 0.6 * Math.min(1, Math.max(0, q));
export const EVADE_COOLDOWN = 5;

export interface EvadeContext { personality: Personality; q: number; alt: number; floor: number; speed: number; env: Envelope; dist: number }
export function pickEvasion(c: EvadeContext, rng: Rng): Evasion {
  const roomBelow = c.alt - c.floor > 1300 && c.speed > c.env.vStall * 1.8;
  const r = rng();
  // rookies panic and break off; aces keep coming, jinking, or roll out underneath
  if (c.q < 0.35) return r < 0.75 ? 'break' : 'jink';
  if (c.personality === 'aggressive') return r < 0.8 ? 'jink' : 'break';
  if (c.personality === 'cunning') return roomBelow && c.dist < 700 && r < 0.55 ? 'splitS' : r < 0.75 ? 'jink' : 'break';
  return roomBelow && r < 0.4 ? 'splitS' : r < 0.8 ? 'break' : 'jink';
}

// ---------------------------------------------------------------- wounded
export type WoundedChoice = 'fight' | 'press' | 'limp';
const LIMP_AT: Record<Personality, number> = { aggressive: 0.2, cunning: 0.28, cautious: 0.4 };   // the old rule was 0.3 for everyone
/**
 * health: worst of structure and critical zones; engine: engine zone 0..1. An aggressive pilot
 * presses on for one last pass before he limps; a cautious one turns for home early.
 */
export function woundedChoice(health: number, engine: number, personality: Personality, pressed: boolean): WoundedChoice {
  const limpAt = LIMP_AT[personality];
  if (health < limpAt || (engine < 0.2 && personality === 'cautious')) {
    return personality === 'aggressive' && !pressed && health > 0.1 ? 'press' : 'limp';
  }
  return 'fight';
}
/** A damaged engine caps the power a limping aircraft has left. */
export const limpThrottle = (engine: number) => 0.3 + 0.4 * Math.min(1, Math.max(0, engine));

// ---------------------------------------------------------------- personas
// q < 0: worked out from the difficulty (EnemyPilot.quality); known: the crew has met this ace before
export interface Persona { personality: Personality; signature: Signature | null; ace: boolean; q: number; known?: boolean }

/**
 * Decision quality 0..1 from the world difficulty (Recruit 0.8 / Veteran 1 / Ace 1.2), the
 * pilot's own skill relative to it, and whether he is an ace. Recruit ~0.25, Veteran ~0.55,
 * Ace ~0.85.
 */
export function decisionQuality(difficulty: number, skill: number, ace = false) {
  const own = skill / Math.max(0.1, difficulty);
  const q = 0.55 + (difficulty - 1) * 1.5 + (own - 1.1) * 0.15 + (ace ? 0.2 : 0);
  return Math.min(1, Math.max(0.05, q));
}

const TYPE_MIX: Record<Role, [number, number, number]> = { turner: [0.45, 0.35, 0.2], slasher: [0.2, 0.3, 0.5], heavy: [0.2, 0.3, 0.5], bomber: [0, 0, 1] };
export function randomPersonality(type: string, rng: Rng): Personality {
  const mix = TYPE_MIX[envelope(type).role];
  const r = rng();
  return r < mix[0] ? 'aggressive' : r < mix[0] + mix[1] ? 'cunning' : 'cautious';
}

// Named Experten (game/Nemesis.ts traits): a personality and two candidate signature moves each
export const ACE_STYLE: Record<string, { personality: Personality; signatures: [Signature, Signature] }> = {
  headon: { personality: 'aggressive', signatures: ['splitS', 'corkscrew'] },
  sun: { personality: 'cunning', signatures: ['zoom', 'splitS'] },
  straggler: { personality: 'cunning', signatures: ['wingover', 'lowSix'] },
  tailgun: { personality: 'aggressive', signatures: ['lowSix', 'wingover'] },
  escorts: { personality: 'aggressive', signatures: ['wingover', 'zoom'] },
  jet: { personality: 'cautious', signatures: ['zoom', 'zoom'] },
  sturmbock: { personality: 'aggressive', signatures: ['lowSix', 'corkscrew'] },
  biggun: { personality: 'cautious', signatures: ['wingover', 'zoom'] },
};
export function hashId(id: string) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** The same Experte always flies the same way: his personality and signature come from trait + id. */
export function acePersona(trait: string, id: string, q: number): Persona {
  const s = ACE_STYLE[trait] ?? ACE_STYLE.headon;
  return { personality: s.personality, signature: s.signatures[hashId(id) % 2], ace: true, q };
}

// ---------------------------------------------------------------- signature moves
// station: the gun that gets the best shot while he flies it (the counter the crew teaches)
export const SIGNATURES: Record<Signature, { label: string; counter: StationId | null; learn: [string, string]; know: [string, string] }> = {
  corkscrew: {
    label: 'Corkscrew run', counter: null,
    learn: ['Navigator', 'He\'s corkscrewing through his run! Wait for him to level out, then hit him!'],
    know: ['Navigator', 'That\'s his corkscrew! Hold fire till he levels out!'],
  },
  splitS: {
    label: 'Split-S under the box', counter: 'ball',
    learn: ['Ball Turret', 'He rolled over and split-S\'d under the box! He goes out low!'],
    know: ['Ball Turret', 'Here comes his split-S! Ball turret, catch him going down!'],
  },
  zoom: {
    label: 'Zoom climb after the pass', counter: 'top',
    learn: ['Top Turret', 'He pulled straight up after his pass! He hangs up there at the top!'],
    know: ['Top Turret', 'He\'ll zoom up again! Top turret, wait for him at the top!'],
  },
  wingover: {
    label: 'Wingover straight back in', counter: null,
    learn: ['Waist', 'He wingovered straight back in! He comes at the same gun again!'],
    know: ['Waist', 'Same trick — he\'ll wingover and come right back! Stay on him!'],
  },
  lowSix: {
    label: 'Low six, up under the tail', counter: 'tail',
    learn: ['Tail', 'He snuck up low at six! Watch under the tail!'],
    know: ['Tail', 'His low-six trick again! Tail and ball, watch under us!'],
  },
};
export const PERSONALITY_LABEL: Record<Personality, string> = { aggressive: 'Aggressive', cunning: 'Cunning', cautious: 'Cautious' };

// ---------------------------------------------------------------- crew calls (gunner missions)
export const WEAK_CALL: Record<StationId, string> = {
  tail: 'He\'s going for our tail — the tail gunner\'s hit! Somebody cover six!',
  waistL: 'He\'s lining up on the left waist — that gun\'s hurt! Cover nine o\'clock!',
  waistR: 'He\'s lining up on the right waist — that gun\'s hurt! Cover three o\'clock!',
  top: 'He\'s diving on the top turret — the engineer\'s hit! Cover the top!',
  ball: 'He\'s coming up under us — the ball turret\'s hurt! Cover the belly!',
};
export const AI_CALLS = {
  limp: ['Waist', 'That one\'s hit — he\'s limping home, trailing smoke!'],
  press: ['Top Turret', 'He\'s smoking but he\'s coming back in — finish him!'],
  broke: ['Pilot', 'You drove him off — he broke away!'],
  pair: ['Navigator', 'Pair coming in, one behind the other! Stay on the gun!'],
} as const;

// ---------------------------------------------------------------- Schwarm
/** Trail slot of wingman i (1-based) behind his leader, formation frame (x right, y up, z fwd). */
export function wingSlot(i: number, out: { x: number; y: number; z: number }) {
  const side = i % 2 === 1 ? 1 : -1;
  out.x = side * 110 * Math.ceil(i / 2); out.y = 35 * i; out.z = -140 * i;
  return out;
}
/** Seconds after the leader's run begins that wingman i starts his. Sharper units keep it tight. */
export const staggerDelay = (i: number, q: number) => i * (3.2 - 1.6 * Math.min(1, Math.max(0, q)));
/** Chance a director group flies as coordinated Rotten / Schwärme instead of one by one. */
export const schwarmChance = (q: number) => 0.2 + 0.65 * Math.min(1, Math.max(0, q));

// ---------------------------------------------------------------- stats (autoplay metrics)
export const AI_STATS = {
  extend: 0, zoom: 0, dive: 0, reattack: 0,
  jink: 0, break: 0, splitS: 0,
  weakGun: 0, straggler: 0, engine: 0,
  schwarm: 0, signature: 0, limp: 0, press: 0,
};
export function resetAiStats() { for (const k in AI_STATS) (AI_STATS as Record<string, number>)[k] = 0; }

/** Small deterministic generator for tests and repeatable runs. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
