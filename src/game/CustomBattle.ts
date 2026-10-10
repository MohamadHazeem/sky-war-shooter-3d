// Custom Battle: the player sets up a battle on the Survival screen (CustomBattleScreen.ts) and
// this module turns the configuration into an ordinary round Mission, so the existing round
// system flies it: Missions.roundDef (flatRounds), BossBattle (Mission.boss), SpecialEvents
// (Mission.specials), ModeRunner (Mission.enemyTypes, Mission.roundFlak).
//
// Custom battles never post to the online leaderboards (the mode's board is ''). The last
// configuration is kept in localStorage. Pure logic apart from the storage helpers: unit-tested.
import type { Mission } from './Missions';
import type { Weather } from '../render/Weather';
import type { EnemyType } from '../world/EnemyTypes';
import type { StationId } from '../world/B17Layout';
import { type ModeDef, type Role, registerMode } from './Modes';
import type { PaceProfile } from './Pacing';

export type Skill = 'recruit' | 'veteran' | 'ace' | 'insane';
export type Mood = 'clear' | 'overcast' | 'storm' | 'dusk';

export interface CustomConfig {
  role: Role;
  station: StationId;      // gunner seat
  enemies: EnemyType[];    // enemy types sent
  min: number;             // fighters in the air at once, start of each round ...
  max: number;             // ... and at full ramp
  skill: Skill;
  roundLength: number;     // seconds of spawning per round
  rounds: number;          // number of rounds; 0 = endless
  mood: Mood;
  sunEl: number;           // sun elevation in degrees (dawn/dusk low, noon high)
  boss: boolean;           // a battle-group round
  bossRound: number;       // 1-based round of the battle group (endless: then every bossRound rounds)
  specials: boolean;       // special events (ace squadron, Zerstörer wave, rocket barrage)
  flak: boolean;           // flak barrage through the middle of every round
  escorts: boolean;        // Mustang wingmen (pilot) / Mustangs joining the box (gunner)
}

export const ALL_ENEMIES: EnemyType[] = ['fw190', 'bf109', 'bf110', 'ju88', 'me262', 'me163'];
export const SEATS: StationId[] = ['waistL', 'waistR', 'top', 'ball', 'tail'];
export const MOODS: Mood[] = ['clear', 'overcast', 'storm', 'dusk'];
export const SKILLS: Skill[] = ['recruit', 'veteran', 'ace', 'insane'];

export const LIMITS = {
  fighters: [1, 20] as const,
  roundLength: [60, 360] as const,   // step 30
  rounds: [1, 10] as const,          // 0 = endless
  sunEl: [2, 70] as const,
};

// Enemy skill range, incoming damage on the player (x the role's default) and rocket share
export const SKILL_DEF: Record<Skill, { label: string; skill: [number, number]; armor: number; rockets: number }> = {
  recruit: { label: 'Recruit', skill: [0.7, 0.85], armor: 0.75, rockets: 0.05 },
  veteran: { label: 'Veteran', skill: [0.9, 1.1], armor: 1, rockets: 0.15 },
  ace: { label: 'Ace', skill: [1.15, 1.35], armor: 1.2, rockets: 0.25 },
  insane: { label: 'Insane', skill: [1.4, 1.65], armor: 1.45, rockets: 0.35 },
};

export const MOOD_LABEL: Record<Mood, string> = { clear: 'Clear', overcast: 'Overcast', storm: 'Storm', dusk: 'Red dusk' };

// Cloud cover for each mood (the sets Survival cycles through, Weather.ROUND_WEATHER)
const MOOD_SKY: Record<Mood, { low: number; high: number; contrails: boolean }> = {
  clear: { low: 0.7, high: 0.55, contrails: true },
  overcast: { low: 0.9, high: 0.95, contrails: false },
  storm: { low: 0.97, high: 0.98, contrails: false },
  dusk: { low: 0.62, high: 0.4, contrails: true },
};

export const DUSK_MAX_SUN = 8;            // the red-dusk mood keeps the sun on the horizon
export const ENDLESS_DURATION = 1e9;      // finite on purpose: an endless custom battle is not Survival
export const ESCORT_ARRIVE = 45;          // s: the gunner's Mustangs join the box

export const DEFAULT_CONFIG: CustomConfig = {
  role: 'gunner', station: 'waistL', enemies: ['fw190', 'bf109'], min: 3, max: 8, skill: 'veteran',
  roundLength: 120, rounds: 3, mood: 'clear', sunEl: 45, boss: false, bossRound: 3, specials: true, flak: false, escorts: true,
};

const clampInt = (v: unknown, lo: number, hi: number, def: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : def;
  return Math.max(lo, Math.min(hi, n));
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], def: T): T => (list.includes(v as T) ? (v as T) : def);
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);

// Any stored / typed value -> a valid configuration (missing or bad fields take the defaults)
export function sanitizeConfig(raw: unknown): CustomConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CONFIG;
  const enemies = Array.isArray(o.enemies) ? ALL_ENEMIES.filter((t) => (o.enemies as unknown[]).includes(t)) : d.enemies.slice();
  let min = clampInt(o.min, LIMITS.fighters[0], LIMITS.fighters[1], d.min);
  let max = clampInt(o.max, LIMITS.fighters[0], LIMITS.fighters[1], d.max);
  if (min > max) [min, max] = [max, min];
  const rounds = o.rounds === 0 ? 0 : clampInt(o.rounds, LIMITS.rounds[0], LIMITS.rounds[1], d.rounds);
  const len = clampInt(o.roundLength, LIMITS.roundLength[0], LIMITS.roundLength[1], d.roundLength);
  return {
    role: oneOf(o.role, ['gunner', 'pilot'] as const, d.role),
    station: oneOf(o.station, SEATS, d.station),
    enemies: enemies.length ? enemies : d.enemies.slice(),
    min, max,
    skill: oneOf(o.skill, SKILLS, d.skill),
    roundLength: Math.round(len / 30) * 30,
    rounds,
    mood: oneOf(o.mood, MOODS, d.mood),
    sunEl: clampInt(o.sunEl, LIMITS.sunEl[0], LIMITS.sunEl[1], d.sunEl),
    boss: bool(o.boss, d.boss),
    bossRound: clampInt(o.bossRound, 1, rounds === 0 ? LIMITS.rounds[1] : rounds, rounds === 0 ? 3 : Math.min(rounds, d.bossRound)),
    specials: bool(o.specials, d.specials),
    flak: bool(o.flak, d.flak),
    escorts: bool(o.escorts, d.escorts),
  };
}

// Sky for a mood and sun elevation (low sun swings round to the west)
export function customWeather(mood: Mood, sunEl: number): Weather {
  const el = mood === 'dusk' ? Math.min(sunEl, DUSK_MAX_SUN) : sunEl;
  const sky = MOOD_SKY[mood];
  return { sunEl: el, sunAz: el < 20 ? 250 : 200, low: sky.low, high: sky.high, contrails: sky.contrails, mood };
}

export function timeOfDayLabel(sunEl: number, mood?: Mood): string {
  if (mood === 'dusk') return 'dusk';
  return sunEl < 12 ? 'dawn' : sunEl < 30 ? 'morning sun' : 'noon';
}

const ENEMY_NAME: Record<EnemyType, string> = { fw190: 'Fw 190', bf109: 'Bf 109', bf110: 'Bf 110', ju88: 'Ju 88', me262: 'Me 262', me163: 'Me 163' };
const SEAT_NAME: Record<StationId, string> = { waistL: 'Left Waist', waistR: 'Right Waist', top: 'Top Turret', ball: 'Ball Turret', tail: 'Tail Gun' };

export function enemiesLabel(list: readonly EnemyType[]): string {
  if (list.length >= ALL_ENEMIES.length) return 'every type';
  if (list.length === 1) return `${ENEMY_NAME[list[0]]}s only`;
  return list.map((t) => ENEMY_NAME[t]).join(', ');
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// The pieces of the one-line summary (the screen translates each one)
export function configParts(c: CustomConfig): string[] {
  const who = c.role === 'gunner' ? `B-17 ${SEAT_NAME[c.station]}` : 'P-51 Escort';
  const rounds = c.rounds === 0 ? `endless ${mmss(c.roundLength)} rounds` : `${c.rounds} × ${mmss(c.roundLength)}`;
  const boss = c.boss ? (c.rounds === 0 ? `battle group every ${c.bossRound} rounds` : `battle group in round ${c.bossRound}`) : '';
  return [who, enemiesLabel(c.enemies), `${c.min}–${c.max} at once`, SKILL_DEF[c.skill].label, rounds,
    `${MOOD_LABEL[c.mood]}, ${timeOfDayLabel(c.sunEl, c.mood)}`, boss, c.specials ? 'special events' : '', c.flak ? 'flak' : '', c.escorts ? 'escorts' : '']
    .filter(Boolean);
}

// One line for the Survival screen's Custom Battle tab
export function describeConfig(c: CustomConfig): string {
  return configParts(c).join(' · ');
}

export interface MissionText {
  id?: string; title?: string; target?: string; date?: string;
  briefing?: string[]; objectives?: string[]; success?: string;
}

// Configuration -> Mission (the round system flies it)
export function buildCustomMission(raw: Partial<CustomConfig> | CustomConfig, text: MissionText = {}): Mission {
  const c = sanitizeConfig(raw);
  const endless = c.rounds === 0;
  const sk = SKILL_DEF[c.skill];
  const roleArmor = c.role === 'gunner' ? 0.6 : 0.75;
  const roundsTxt = endless ? 'Endless rounds' : `${c.rounds} round${c.rounds > 1 ? 's' : ''}`;
  return {
    id: text.id ?? `custom-${c.role}`, number: 0,
    title: text.title ?? (c.role === 'gunner' ? 'Custom Battle — Gunner' : 'Custom Battle — Escort'),
    target: text.target ?? `${roundsTxt} · ${enemiesLabel(c.enemies)}`,
    date: text.date ?? 'Custom battle',
    role: c.role, station: c.role === 'gunner' ? c.station : 'waistL',
    briefing: text.briefing ?? [`A battle of your own making: ${describeConfig(c)}.`, 'Custom battles are not posted to the online leaderboards.'],
    objectives: text.objectives ?? [endless ? 'Survive as many rounds as possible' : `Survive ${roundsTxt.toLowerCase()}`, 'Defend the formation'],
    bombers: 12,
    escorts: c.role === 'pilot' && c.escorts ? 3 : 0,
    escortArrive: c.role === 'gunner' && c.escorts ? ESCORT_ARRIVE : undefined,
    waves: [],
    weather: customWeather(c.mood, c.sunEl),
    round: { duration: c.roundLength, start: 6, min: c.min, max: c.max, skill: [sk.skill[0], sk.skill[1]], rockets: sk.rockets },
    rounds: endless ? Infinity : c.rounds,
    flatRounds: true,
    duration: endless ? ENDLESS_DURATION : c.roundLength * c.rounds,
    maxBombersLost: 99,
    playerArmor: roleArmor * sk.armor,
    enemyTypes: c.enemies.slice(),
    boss: c.boss ? { first: c.bossRound - 1, every: endless ? c.bossRound : undefined } : false,
    specials: c.specials,
    roundFlak: c.flak ? 1.2 : undefined,
    success: text.success ?? 'Battle won. Every round flown, and the formation still holds.',
  };
}

// Round pacing: build -> breather -> a final wave sized to the battle's own numbers (the
// default final wave of 15-21 is meant for full-size rounds; a 2-5 fighter battle keeps it small)
export function customPace(m: Pick<Mission, 'round'>): PaceProfile {
  const max = m.round?.max ?? 8;
  return { breather: true, final: { min: Math.max(2, Math.round(max * 1.2)), max: Math.max(3, Math.round(max * 1.6)) } };
}

// ---------------- the saved configuration ----------------
const KEY = 'sws3d.customBattle.v1';

export function loadConfig(): CustomConfig {
  try { return sanitizeConfig(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return sanitizeConfig(null); }
}
export function saveConfig(c: CustomConfig) {
  try { localStorage.setItem(KEY, JSON.stringify(sanitizeConfig(c))); } catch { /* storage unavailable */ }
}

// ---------------- the mode ----------------
export const CUSTOM_MODE: ModeDef = {
  id: 'custom', title: 'Custom Battle',
  blurb: 'Set up your own battle: seat, enemy types, numbers, skill, rounds, weather and time of day, battle group, special events, flak and escorts. Custom battles are not posted to the online leaderboards.',
  mission: (role) => buildCustomMission({ ...loadConfig(), role }),
  matches: (m) => m.id.startsWith('custom-'),
  board: () => '',
  paceFor: customPace,
};

registerMode(CUSTOM_MODE);
