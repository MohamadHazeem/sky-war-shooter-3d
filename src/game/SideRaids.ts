// Optional side raids for the dynamic campaign (CampaignState.ts, ui/CampaignMap.ts).
// Between two story missions the campaign offers 2-3 raids, generated from templates: rail
// yards, airfields, oil, U-boat pens and aircraft factories. Each raid is an ordinary Mission
// on the existing round system (Missions.ts Round / roundDef) with its own weather, enemy mix,
// strategic effects and a merit reward. Generation is a pure function of the campaign seed and
// the gap, so the same raids come back after a reload; the Mission objects are cached so their
// identity is stable (CampaignState keeps their base values in a WeakMap).
//
// Ids are `raid-<gap>-<template>`: gap g is the slot before story mission CAMPAIGN[g]
// (gaps 1..CAMPAIGN.length-1, i.e. after the first story mission and before the last).
import { CAMPAIGN, type Mission } from './Missions';
import type { Weather } from '../render/Weather';
import type { StationId } from '../world/B17Layout';
import type { EnemyType } from '../world/EnemyTypes';

export type RaidKind = 'rail' | 'airfield' | 'oil' | 'uboat' | 'factory';

// What a successful raid does to the strategic state (CampaignState.applyOutcome)
export interface RaidEffects {
  luftwaffe: number;    // change to Luftwaffe strength (percentage points, negative = weaker)
  escort: number;       // escort availability earned
  squadron: number;     // replacement ships that arrive early
  morale: number;       // crew morale
}

export interface RaidTarget { name: string; city: string }

export interface RaidTemplate {
  kind: RaidKind;
  label: string;              // short name on the map ("Rail yards")
  verb: string;               // effect blurb on the raid card
  targets: RaidTarget[];      // city must match a BriefingMap place key (the briefing route chart)
  role: 'gunner' | 'pilot' | 'either';
  difficulty: number;         // scales the fighters in the air
  reward: number;             // merit paid on success
  effects: RaidEffects;
  mix: [EnemyType, number][]; // enemy types the defenders put up
  moods: Weather['mood'][];   // likely weather over this kind of target
  flak?: number;              // flak intensity over the target (gunner raids)
  brief: (t: RaidTarget) => string[];
  success: (t: RaidTarget) => string;
  objective: string;
}

export const RAID_TEMPLATES: RaidTemplate[] = [
  {
    kind: 'rail', label: 'Rail yards', verb: 'Snarls German supply: Luftwaffe −3, morale +3',
    targets: [{ name: 'Marshalling yards', city: 'Hamm' }, { name: 'Rail junction', city: 'Münster' }, { name: 'Marshalling yards', city: 'Osnabrück' }, { name: 'Rail yards', city: 'Hannover' }],
    role: 'gunner', difficulty: 0.85, reward: 200, flak: 0.8,
    effects: { luftwaffe: -3, escort: 0, squadron: 0, morale: 3 },
    mix: [['fw190', 0.55], ['bf109', 0.45]], moods: ['clear', 'overcast'],
    brief: (t) => [
      `A short one today. The ${t.name.toLowerCase()} at ${t.city} move every train between the Ruhr and the north German ports: fighters, fuel and flak shells all pass through them.`,
      'The defences are light, and Group calls it a chance to blood the new crews. Do not believe the words "milk run". The day fighters based nearby will come up to meet us.',
    ],
    success: (t) => `The yards at ${t.city} are a tangle of twisted rail. Nothing will move through them for a week.`,
    objective: 'Bomb the rail yards',
  },
  {
    kind: 'airfield', label: 'Airfields', verb: 'Catches fighters on the ground: Luftwaffe −8, escort +12',
    targets: [{ name: 'Fighter airfield', city: 'Rheine' }, { name: 'Fighter airfield', city: 'Twente' }, { name: 'Fighter base', city: 'Oldenburg' }],
    role: 'either', difficulty: 1.0, reward: 300, flak: 0.9,
    effects: { luftwaffe: -8, escort: 12, squadron: 0, morale: 2 },
    mix: [['bf109', 0.5], ['fw190', 0.4], ['bf110', 0.1]], moods: ['clear', 'dusk'],
    brief: (t) => [
      `The Jagdgruppe at ${t.city} has been hitting our formations over the coast for a month. Today we hit it at home: runways, hangars and dispersal pens.`,
      'Every fighter we catch on the ground is one that will not be waiting for us over Germany, and with the coastal fields out of action the Mustangs can push further inland. Expect the whole Gruppe to scramble the moment we cross the coast.',
    ],
    success: (t) => `${t.city} is cratered from end to end. The Jagdgruppe there will be flying from somewhere else for a while.`,
    objective: 'Wreck the airfield',
  },
  {
    kind: 'oil', label: 'Oil', verb: 'Starves the fighters of fuel: Luftwaffe −6, morale +2',
    targets: [{ name: 'Synthetic oil plant', city: 'Gelsenkirchen' }, { name: 'Synthetic fuel works', city: 'Leuna' }, { name: 'Refinery', city: 'Misburg' }],
    role: 'gunner', difficulty: 1.1, reward: 350, flak: 1.4,
    effects: { luftwaffe: -6, escort: 0, squadron: 0, morale: 2 },
    mix: [['fw190', 0.4], ['bf110', 0.3], ['ju88', 0.15], ['bf109', 0.15]], moods: ['clear', 'overcast'],
    brief: (t) => [
      `The target is the ${t.name.toLowerCase()} at ${t.city}. Germany has almost no natural oil: every drop of fuel for her fighters is cooked out of coal in plants like this one.`,
      'No fuel means no training flights, and no training means green pilots. The Germans know it, so the plant is ringed with heavy flak, and twin-engine destroyers will be up with rockets. Keep them off the formation through the bomb run.',
    ],
    success: (t) => `Black smoke over ${t.city} is climbing past twenty thousand feet. The Luftwaffe will be counting its fuel by the litre.`,
    objective: 'Bomb the oil plant through the flak',
  },
  {
    kind: 'uboat', label: 'U-boat pens', verb: 'Convoys get through: +3 replacement ships, morale +4',
    targets: [{ name: 'U-boat base', city: 'Wilhelmshaven' }, { name: 'U-boat yards', city: 'Kiel' }, { name: 'U-boat yards', city: 'Emden' }],
    role: 'gunner', difficulty: 0.95, reward: 250, flak: 1.0,
    effects: { luftwaffe: 0, escort: 0, squadron: 3, morale: 4 },
    mix: [['fw190', 0.5], ['bf109', 0.2], ['ju88', 0.2], ['bf110', 0.1]], moods: ['overcast', 'storm'],
    brief: (t) => [
      `The Navy has asked for this one. The ${t.name.toLowerCase()} at ${t.city} turns out the boats that hunt our convoys in the Atlantic, and those convoys carry our new aircraft and crews.`,
      'Every convoy that gets through brings replacements to the group sooner. The route runs low over the North Sea; expect fighters from the coastal fields and Ju 88s from the Frisian Islands.',
    ],
    success: (t) => `The slipways at ${t.city} took a pounding. The next convoy will have a quieter crossing, and the group will see the benefit.`,
    objective: 'Hit the U-boat slipways',
  },
  {
    kind: 'factory', label: 'Aircraft factory', verb: 'Cuts fighter production: Luftwaffe −7, escort +6',
    targets: [{ name: 'Aircraft assembly plant', city: 'Brunswick' }, { name: 'Fieseler works', city: 'Kassel' }, { name: 'Gothaer Waggonfabrik', city: 'Gotha' }],
    role: 'gunner', difficulty: 1.15, reward: 400, flak: 1.5,
    effects: { luftwaffe: -7, escort: 6, squadron: 0, morale: 2 },
    mix: [['fw190', 0.45], ['bf110', 0.25], ['bf109', 0.2], ['ju88', 0.1]], moods: ['clear', 'overcast'],
    brief: (t) => [
      `The ${t.name} at ${t.city} builds fighters, and every one it finishes will be shooting at us within a month. This is a deep one, and it will be defended like Berlin.`,
      'The Sturmgruppen and the rocket-carrying destroyers will be up in force. Hold the formation tight and keep firing; the bombardiers need a steady run of four minutes over the aiming point.',
    ],
    success: (t) => `The assembly halls at ${t.city} are burning. That is a month of fighters the Luftwaffe will never get.`,
    objective: 'Destroy the aircraft factory',
  },
];

export const templateFor = (kind: RaidKind) => RAID_TEMPLATES.find((t) => t.kind === kind)!;

// Deterministic PRNG (mulberry32)
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = (t: number) => { const d = new Date(t); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const parse = (s: string) => Date.parse(s + ' UTC');

// A date between story missions g-1 and g, for raid k of the gap
export function raidDate(gap: number, k = 0): string {
  const a = parse(CAMPAIGN[gap - 1].date), b = parse(CAMPAIGN[gap].date);
  const day = 86400000;
  const span = Math.max(0, Math.round((b - a) / day) - 1);
  const off = span <= 0 ? 0 : 1 + Math.min(span - 1, Math.floor(span * (0.35 + 0.15 * k)));
  return fmtDate(a + off * day);
}

const WEATHER: Record<NonNullable<Weather['mood']>, (r: () => number) => Weather> = {
  clear: (r) => ({ sunEl: 24 + r() * 26, sunAz: 165 + r() * 50, low: 0.45 + r() * 0.25, high: 0.3 + r() * 0.25, contrails: true, mood: 'clear' }),
  overcast: (r) => ({ sunEl: 30 + r() * 15, sunAz: 175 + r() * 20, low: 0.86 + r() * 0.06, high: 0.9, contrails: false, mood: 'overcast' }),
  storm: (r) => ({ sunEl: 16 + r() * 8, sunAz: 190 + r() * 15, low: 0.95, high: 0.97, contrails: false, mood: 'storm' }),
  dusk: (r) => ({ sunEl: 3 + r() * 4, sunAz: 240 + r() * 20, low: 0.55 + r() * 0.1, high: 0.4, contrails: true, mood: 'dusk' }),
  night: (r) => ({ sunEl: 22 + r() * 8, sunAz: 130 + r() * 20, low: 0.22, high: 0.2, contrails: false, mood: 'night' }), // moonlit (raid templates don't pick it)
};

const STATIONS: StationId[] = ['waistL', 'waistR', 'top', 'ball', 'tail'];
export const FIRST_GAP = 1;
export const LAST_GAP = () => CAMPAIGN.length - 1;
export const isRaidId = (id: string) => /^raid-\d+-[a-z]+$/.test(id);

export interface SideRaid {
  mission: Mission;
  template: RaidTemplate;
  target: RaidTarget;
  gap: number;
}

const cache = new Map<string, SideRaid[]>();
const byId = new Map<string, SideRaid>();

// The 2-3 raids offered in gap g (before story mission CAMPAIGN[g]) for this campaign seed
export function sideRaidsFor(seed: number, gap: number): SideRaid[] {
  if (gap < FIRST_GAP || gap > LAST_GAP()) return [];
  const key = `${seed}:${gap}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = rng((seed * 2654435761 + gap * 40503) >>> 0);
  const pool = [...RAID_TEMPLATES];
  // shuffle, then take 2 or 3
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const n = r() < 0.55 ? 3 : 2;
  const t01 = (gap - FIRST_GAP) / Math.max(1, LAST_GAP() - FIRST_GAP); // 0 early .. 1 late in the tour
  const out = pool.slice(0, n).map((tpl, k) => build(tpl, gap, k, t01, r));
  cache.set(key, out);
  for (const s of out) byId.set(`${seed}:${s.mission.id}`, s);
  return out;
}

export function sideRaidById(seed: number, id: string): SideRaid | null {
  const m = /^raid-(\d+)-[a-z]+$/.exec(id);
  if (!m) return null;
  sideRaidsFor(seed, +m[1]);
  return byId.get(`${seed}:${id}`) ?? null;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function build(tpl: RaidTemplate, gap: number, k: number, t01: number, r: () => number): SideRaid {
  const target = tpl.targets[Math.floor(r() * tpl.targets.length)];
  const role: 'gunner' | 'pilot' = tpl.role === 'either' ? (r() < 0.5 ? 'pilot' : 'gunner') : tpl.role;
  const mood = tpl.moods[Math.floor(r() * tpl.moods.length)] ?? 'clear';
  const weather = WEATHER[mood ?? 'clear'](r);
  const station = STATIONS[Math.floor(r() * STATIONS.length)];
  const d = tpl.difficulty;
  const duration = Math.round(lerp(180, 230, t01) / 10) * 10;
  const min = Math.max(3, Math.round(lerp(4, 7, t01) * d));
  const max = Math.max(min + 2, Math.round(lerp(7, 12, t01) * d));
  const skill: [number, number] = [+(lerp(0.85, 1.05, t01) * (0.9 + 0.1 * d)).toFixed(2), +(lerp(1.0, 1.25, t01) * (0.9 + 0.1 * d)).toFixed(2)];
  const rockets = tpl.mix.some(([e]) => e === 'bf110' || e === 'ju88') ? +(0.1 + 0.2 * d * t01).toFixed(2) : 0;
  const bombers = role === 'pilot' ? 12 : 9 + 3 * Math.floor(r() * 2);
  const maxLost = Math.ceil(bombers / 2);
  const city = target.city;
  const id = `raid-${gap}-${tpl.kind}`;
  const pilot = role === 'pilot';
  const mission: Mission = {
    id, number: 0,
    title: pilot ? `Strike on ${city}` : `${tpl.label} — ${city}`,
    target: pilot ? `Escort — ${target.name.toLowerCase()}, ${city}` : `${target.name}, ${city}`,
    date: raidDate(gap, k), role, station: pilot ? undefined : station,
    briefing: [
      ...tpl.brief(target),
      pilot
        ? 'You are flying close escort in a P-51D. Stay with the bombers until they are off the target, then you may go down and hunt.'
        : 'This is an optional operation. Group will not hold it against any crew that stands down, but what we hit today changes what is waiting for us on the next big one.',
    ],
    objectives: [pilot ? 'Protect the bombers over the airfield' : tpl.objective, 'Survive the mission', `Lose no more than ${maxLost} bombers`],
    bombers, escorts: pilot ? 3 : undefined, waves: [
      { at: 6, count: 3, from: 'mixed', skill: skill[0], radio: pilot ? ['Lead', `Bandits climbing out of ${city}! Blue flight, go get them.`] : ['Navigator', `Fighters coming up from ${city}. Here they come!`] },
    ],
    weather, duration, maxBombersLost: maxLost,
    success: tpl.success(target),
    round: { duration, start: 6, min, max, skill, rockets },
    rounds: 2,
  };
  if (!pilot && tpl.flak) {
    const s = Math.round(duration * 0.38), e = Math.round(duration * 0.62);
    mission.flak = { start: s, end: e, intensity: tpl.flak };
    mission.bombsAway = Math.round((s + e) / 2);
  }
  return { mission, template: tpl, target, gap };
}

// The defenders' enemy type for a raid (Modes.ts ENEMY_MIX provider); null for other missions
export function raidEnemyType(m: Mission, rand = Math.random): EnemyType | null {
  const k = /^raid-\d+-([a-z]+)$/.exec(m.id)?.[1] as RaidKind | undefined;
  const tpl = k && RAID_TEMPLATES.find((t) => t.kind === k);
  if (!tpl) return null;
  let x = rand() * tpl.mix.reduce((a, [, p]) => a + p, 0);
  for (const [t, p] of tpl.mix) { x -= p; if (x <= 0) return t; }
  return tpl.mix[0][0];
}
