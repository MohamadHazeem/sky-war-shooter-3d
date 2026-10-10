// Weekly Challenge: one scenario per ISO week (Monday 00:00 UTC to Monday), the same for every
// player, e.g. "Week 41: Operation Thunderclap — 5 rounds, Me 262s only, dusk, boss in round 5".
// The scenario is a CustomConfig drawn from a generator seeded by the week, built into a Mission
// by CustomBattle.buildCustomMission. Its spawns run on a seeded stream like the Daily Run
// (ServiceRecord). Scores go to the 'weekly-<role>-<yyyyww>' board (firestore.rules), and the
// first completion each week pays merit, a 'weekly:<yyyyww>' ribbon and, once, the weekly-only
// nose art (Progression.unlock). Pure logic apart from registerMode: unit-tested.
import type { Mission } from './Missions';
import type { EnemyType } from '../world/EnemyTypes';
import { hashString, mulberry32 } from './Dailies';
import { type CustomConfig, type Mood, type Skill, buildCustomMission, customPace, enemiesLabel, SEATS, timeOfDayLabel } from './CustomBattle';
import { MODES, type ModeDef, type Role, registerMode } from './Modes';

// ---------------- ISO week ----------------
export interface IsoWeek { year: number; week: number }

// ISO-8601 week of a UTC date: weeks start on Monday, week 1 holds the year's first Thursday
export function isoWeek(d = new Date()): IsoWeek {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);           // the Thursday of this week decides the year
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return { year, week };
}

// yyyyww (the leaderboard suffix)
export function weekKey(d = new Date()): string {
  const { year, week } = isoWeek(d);
  return `${year}${String(week).padStart(2, '0')}`;
}

export function parseWeekKey(key: string): IsoWeek | null {
  if (!/^\d{6}$/.test(key)) return null;
  const year = +key.slice(0, 4), week = +key.slice(4);
  return week >= 1 && week <= 53 ? { year, week } : null;
}

// Monday 00:00 UTC that starts an ISO week
export function weekStart(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const mon1 = Date.UTC(year, 0, 4 - ((jan4.getUTCDay() || 7) - 1));
  return new Date(mon1 + (week - 1) * 7 * 86400000);
}

// Milliseconds until the next Monday 00:00 UTC (the next scenario)
export function msUntilNextWeek(now = new Date()): number {
  const { year, week } = isoWeek(now);
  return weekStart(year, week).getTime() + 7 * 86400000 - now.getTime();
}

export function fmtWeekCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m` : `${h}h ${String(m).padStart(2, '0')}m`;
}

export const weeklyMode = (role: Role, key = weekKey()) => `weekly-${role}-${key}`;
export const weeklySeed = (key: string, role: Role) => hashString(`sws3d-weekly-run:${key}:${role}`);

// The week of a weekly mission (its id is its board: weekly-<role>-<yyyyww>), else null
export function weeklyKeyOf(m: Pick<Mission, 'id'> | null | undefined): string | null {
  const r = m?.id.match(/^weekly-(gunner|pilot)-(\d{6})$/);
  return r && parseWeekKey(r[2]) ? r[2] : null;
}

// ---------------- the scenario ----------------
const OPERATIONS = [
  'Thunderclap', 'Argument', 'Pointblank', 'Clarion', 'Frantic', 'Gomorrah', 'Tidal Wave', 'Hydra', 'Crossbow', 'Chattanooga',
  'Jericho', 'Varsity', 'Cobra', 'Grubworm', 'Aphrodite', 'Juggler', 'Starkey', 'Carpetbagger', 'Cadillac', 'Lucky Strike',
  'Iron Cross', 'Long Reach', 'Hailstorm', 'Black Ribbon', 'Steel Rain', 'Nightjar', 'Overcast', 'High Card',
];

interface Theme { id: string; enemies: EnemyType[]; min: number; max: number; target: string }
const THEMES: Theme[] = [
  { id: 'jets', enemies: ['me262'], min: 2, max: 6, target: 'The Jet Staffel' },
  { id: 'rockets', enemies: ['me262', 'me163'], min: 2, max: 6, target: 'Wonder weapons' },
  { id: 'heavies', enemies: ['bf110', 'ju88'], min: 2, max: 6, target: 'The Zerstörergeschwader' },
  { id: 'butcher', enemies: ['fw190'], min: 4, max: 10, target: 'The Sturmgruppe' },
  { id: 'gustav', enemies: ['bf109'], min: 4, max: 10, target: 'A Gustav swarm' },
  { id: 'singles', enemies: ['fw190', 'bf109'], min: 4, max: 11, target: 'The day fighters' },
  { id: 'mixed', enemies: ['fw190', 'bf109', 'bf110', 'ju88', 'me262', 'me163'], min: 3, max: 10, target: 'Everything the Luftwaffe has' },
  { id: 'hunters', enemies: ['fw190', 'bf110', 'me262'], min: 3, max: 9, target: 'A mixed Jagdverband' },
];

interface Sky { mood: Mood; sunEl: number }
const SKIES: Sky[] = [
  { mood: 'clear', sunEl: 8 },     // dawn
  { mood: 'clear', sunEl: 55 },    // noon
  { mood: 'clear', sunEl: 22 },    // morning sun
  { mood: 'overcast', sunEl: 40 },
  { mood: 'storm', sunEl: 30 },
  { mood: 'dusk', sunEl: 5 },
];

export interface WeeklyScenario {
  key: string;                 // yyyyww
  year: number;
  week: number;
  operation: string;           // "Thunderclap"
  target: string;
  config: Omit<CustomConfig, 'role'>;
  headline: string;            // "Week 41: Operation Thunderclap — 5 rounds, Me 262s only, dusk, boss in round 5"
}

export function weeklyScenario(key = weekKey()): WeeklyScenario {
  const wk = parseWeekKey(key) ?? isoWeek();
  const rng = mulberry32(hashString(`sws3d-weekly:${key}`));
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rng() * a.length)];
  const operation = pick(OPERATIONS);
  const theme = pick(THEMES);
  const sky = pick(SKIES);
  const rounds = 3 + Math.floor(rng() * 4);                       // 3-6
  const roundLength = 90 + 30 * Math.floor(rng() * 3);            // 1:30-2:30
  const skill: Skill = rng() < 0.6 ? 'veteran' : 'ace';
  const boss = rng() < 0.6;
  const config: Omit<CustomConfig, 'role'> = {
    station: pick(SEATS), enemies: theme.enemies.slice(), min: theme.min, max: theme.max, skill,
    roundLength, rounds, mood: sky.mood, sunEl: sky.sunEl, boss, bossRound: rounds,
    // special events bring their own aircraft: only in mixed-type weeks
    specials: theme.enemies.length >= 3 && rng() < 0.7,
    flak: rng() < 0.5, escorts: rng() < 0.5,
  };
  const tod = timeOfDayLabel(sky.sunEl, sky.mood);
  const weather = sky.mood === 'clear' || sky.mood === 'dusk' ? tod : `${sky.mood}, ${tod}`;
  const headline = `Week ${wk.week}: Operation ${operation} — ${rounds} rounds, ${enemiesLabel(theme.enemies)}, ${weather}${boss ? `, boss in round ${rounds}` : ''}`;
  return { key, year: wk.year, week: wk.week, operation, target: theme.target, config, headline };
}

export function weeklyMission(role: Role, key = weekKey()): Mission {
  const s = weeklyScenario(key);
  const c = s.config;
  return buildCustomMission({ ...c, role }, {
    id: weeklyMode(role, key),
    title: `Operation ${s.operation}`,
    target: s.target,
    date: `Weekly Challenge · Week ${s.week}, ${s.year}`,
    briefing: [
      `This week's challenge, the same for every crew: ${s.headline.replace(/^Week \d+: /, '')}.`,
      `The enemy schedule is fixed for the week. Fly all ${c.rounds} rounds to complete it: the first completion each week pays ${WEEKLY_MERIT} merit and a weekly ribbon, and earns the ${WEEKLY_NOSE_NAME} nose art, found nowhere else.`,
    ],
    objectives: [`Survive all ${c.rounds} rounds`, ...(c.boss ? [`Destroy the battle group in round ${c.bossRound}`] : []), 'Post a score on this week\'s board'],
    success: `Operation ${s.operation} complete. The weekly ribbon is yours.`,
  });
}

// ---------------- the reward ----------------
export const WEEKLY_MERIT = 2000;
export const WEEKLY_NOSE_ID = 'weeklyace';
export const WEEKLY_NOSE = `nose:${WEEKLY_NOSE_ID}`;
export const WEEKLY_NOSE_NAME = 'Lightning Shield';
export const weeklyRibbon = (key: string) => `weekly:${key}`;

export interface WeeklyTarget { unlocked: Set<string>; earn(n: number): void; unlock(id: string, cost: number): boolean }
export interface WeeklyReward { key: string; merit: number; ribbon: string; nose: boolean }

export const weeklyDone = (prog: Pick<WeeklyTarget, 'unlocked'>, key = weekKey()) => prog.unlocked.has(weeklyRibbon(key));
export const weeklyCompletions = (prog: Pick<WeeklyTarget, 'unlocked'>) => [...prog.unlocked].filter((k) => k.startsWith('weekly:')).length;

// A completed weekly mission: pays once per week (null when not a weekly, failed or already paid)
export function claimWeekly(m: Pick<Mission, 'id'>, success: boolean, prog: WeeklyTarget): WeeklyReward | null {
  const key = weeklyKeyOf(m);
  if (!key || !success || weeklyDone(prog, key)) return null;
  prog.unlock(weeklyRibbon(key), 0);
  prog.earn(WEEKLY_MERIT);
  const nose = !prog.unlocked.has(WEEKLY_NOSE);
  if (nose) prog.unlock(WEEKLY_NOSE, 0);
  return { key, merit: WEEKLY_MERIT, ribbon: weeklyRibbon(key), nose };
}

// ---------------- the mode ----------------
export const WEEKLY_MODE: ModeDef = {
  id: 'weekly', title: 'Weekly',
  blurb: 'A new scenario every Monday, the same for every crew, with its own leaderboard and a weekly-only reward.',
  mission: (role) => weeklyMission(role),
  matches: (m) => m.id.startsWith('weekly-'),
  board: (role) => weeklyMode(role),
  boardFor: (m) => (weeklyKeyOf(m) ? m.id : weeklyMode(m.role)),
  paceFor: customPace,
};

// before the Custom Battle tab
{
  const i = MODES.findIndex((d) => d.id === 'custom');
  registerMode(WEEKLY_MODE, i >= 0 ? i : MODES.length);
}
