// Career: the player's service record. Lifetime stats, career XP and the rank ladder, medal
// counts and the concrete rewards each medal and promotion grants. Pure data and maths plus
// guarded localStorage, so it is unit-tested in Node. Game wiring lives in ServiceRecord.ts.

// ---------------- ranks ----------------

export interface RankDef { name: string; abbr: string; xp: number }

export const RANKS: RankDef[] = [
  { name: 'Private', abbr: 'PVT', xp: 0 },
  { name: 'Staff Sergeant', abbr: 'S/SGT', xp: 1500 },
  { name: 'Master Sergeant', abbr: 'M/SGT', xp: 5000 },
  { name: 'Lieutenant', abbr: '1ST LT', xp: 12000 },
  { name: 'Captain', abbr: 'CAPT', xp: 25000 },
  { name: 'Major', abbr: 'MAJ', xp: 50000 },
];

export interface RankInfo {
  index: number;
  rank: RankDef;
  next: RankDef | null;
  into: number;       // XP earned since this rank
  span: number;       // XP from this rank to the next (0 at the top)
  progress: number;   // 0..1 towards the next rank (1 at the top)
}

export function rankFor(xp: number): RankInfo {
  const x = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let i = 0;
  while (i < RANKS.length - 1 && x >= RANKS[i + 1].xp) i++;
  const rank = RANKS[i], next = RANKS[i + 1] ?? null;
  const span = next ? next.xp - rank.xp : 0;
  const into = x - rank.xp;
  return { index: i, rank, next, into, span, progress: next ? Math.min(1, into / span) : 1 };
}

export interface MissionXpInput { score: number; kills: number; success: boolean; medals: number }

// Career XP for one mission: a twentieth of the score, kills, completion and medals
export function xpForMission(r: MissionXpInput): number {
  const s = Math.max(0, r.score || 0), k = Math.max(0, r.kills || 0), m = Math.max(0, r.medals || 0);
  return Math.round(s / 20 + k * 10 + (r.success ? 150 : 40) + m * 75);
}

// ---------------- rewards ----------------

// What a medal or promotion grants. 'unlock' uses Progression.unlock with the WEAPONS/AIRCRAFT
// ids; if it is already owned the fallback merit is paid instead. 'cosmetic' records the id
// (TODO: hand it to Customize.ts once the nose art / paint module lands) and pays merit for now.
export type Reward =
  | { kind: 'merit'; amount: number }
  | { kind: 'unlock'; id: string; label: string; fallback: number }
  | { kind: 'cosmetic'; id: string; label: string; fallback: number };

export interface MedalDef {
  name: string;
  desc: string;
  ribbon: string;   // CSS background for the ribbon bar
  first: Reward;    // the first time it is awarded
  repeat: number;   // merit every time after that
}

const stripes = (...c: string[]) => `linear-gradient(90deg, ${c.map((x, i) => `${x} ${(i / c.length) * 100}% ${((i + 1) / c.length) * 100}%`).join(', ')})`;

export const MEDALS: MedalDef[] = [
  { name: 'Second Tour Medal', desc: 'Complete twenty-five second-tour operations.', ribbon: stripes('#1d3f8f', '#e8a317', '#fff', '#e8a317', '#1d3f8f'), first: { kind: 'merit', amount: 2500 }, repeat: 0 },
  { name: 'Air Medal', desc: 'Complete a campaign mission.', ribbon: stripes('#e8a317', '#1d3f8f', '#1d3f8f', '#e8a317', '#1d3f8f', '#1d3f8f', '#e8a317'), first: { kind: 'merit', amount: 300 }, repeat: 150 },
  { name: 'Distinguished Flying Cross', desc: 'Five kills in a B-17 gunner mission.', ribbon: stripes('#b3321f', '#f2efe6', '#1d3f8f', '#1d3f8f', '#1d3f8f', '#f2efe6', '#b3321f'), first: { kind: 'unlock', id: 'stinger', label: 'Stinger twin-feed .50', fallback: 300 }, repeat: 300 },
  { name: 'Silver Star', desc: 'Eight kills with at most one bomber lost.', ribbon: stripes('#1d3f8f', '#f2efe6', '#1d3f8f', '#f2efe6', '#b3321f', '#f2efe6', '#1d3f8f', '#f2efe6', '#1d3f8f'), first: { kind: 'unlock', id: 'hispano', label: 'Hispano 20 mm cannon', fallback: 500 }, repeat: 500 },
  { name: 'Purple Heart', desc: 'Wounded in action.', ribbon: stripes('#f2efe6', '#5b2a86', '#5b2a86', '#5b2a86', '#5b2a86', '#5b2a86', '#f2efe6'), first: { kind: 'unlock', id: 'p51armored', label: 'P-51D "Iron Mustang"', fallback: 200 }, repeat: 200 },
  { name: 'Ace in a Day', desc: 'Five confirmed kills in one mission.', ribbon: stripes('#1a1a1a', '#e0b65a', '#1a1a1a', '#e0b65a', '#e0b65a', '#1a1a1a', '#e0b65a', '#1a1a1a'), first: { kind: 'unlock', id: 'p51h', label: 'P-51H Lightweight', fallback: 400 }, repeat: 400 },
  { name: 'Gunner\'s Wings', desc: 'Complete a gunner mission with 25%+ accuracy over 150+ rounds.', ribbon: stripes('#9aa3ad', '#1d3f8f', '#9aa3ad', '#d8dde2', '#9aa3ad', '#1d3f8f', '#9aa3ad'), first: { kind: 'unlock', id: 'hellfire', label: 'M2 "Hellfire" AP-I', fallback: 300 }, repeat: 300 },
  { name: 'Fortress Defender', desc: 'Complete a campaign mission without losing a bomber.', ribbon: stripes('#4b5132', '#b9a76f', '#4b5132', '#4b5132', '#b9a76f', '#4b5132'), first: { kind: 'unlock', id: 'p8x50', label: 'Heavy battery (+30% fire)', fallback: 300 }, repeat: 300 },
  { name: 'Experten Killer', desc: 'Shoot down a named Luftwaffe Experte.', ribbon: stripes('#1a1a1a', '#f2efe6', '#b3321f', '#b3321f', '#f2efe6', '#1a1a1a'), first: { kind: 'merit', amount: 600 }, repeat: 300 },
  { name: 'Giant Killer', desc: 'Bring down a boss.', ribbon: stripes('#1a1a1a', '#b3321f', '#1a1a1a', '#1a1a1a', '#b3321f', '#1a1a1a'), first: { kind: 'unlock', id: 'p4x20', label: '20 mm cannons (P-51)', fallback: 500 }, repeat: 500 },
];

export const medalDef = (name: string) => MEDALS.find((m) => m.name === name);

// Promotion rewards, by rank index (Private has none)
export const PROMOTION_REWARDS: (Reward | null)[] = [
  null,
  { kind: 'unlock', id: 'b17f', label: 'B-17F "Lucky Lady"', fallback: 800 },
  { kind: 'merit', amount: 1500 },
  { kind: 'unlock', id: 'yb40', label: 'YB-40 Gunship', fallback: 2000 },
  { kind: 'cosmetic', id: 'noseart-captain', label: 'Captain\'s nose art', fallback: 2500 },
  { kind: 'merit', amount: 4000 },
];

// The parts of Progression a reward needs (Upgrades.ts Progression satisfies it)
export interface RewardTarget { unlocked: Set<string>; unlock(id: string, cost: number): boolean; earn(n: number): void }

export interface GrantResult { text: string; merit: number }

export function grantReward(r: Reward, prog: RewardTarget, cosmetics: string[]): GrantResult {
  if (r.kind === 'merit') { prog.earn(r.amount); return { text: `+${r.amount} merit`, merit: r.amount }; }
  if (r.kind === 'unlock') {
    if (!prog.unlocked.has(r.id) && prog.unlock(r.id, 0)) return { text: `${r.label} unlocked`, merit: 0 };
    prog.earn(r.fallback);
    return { text: `+${r.fallback} merit (${r.label} already owned)`, merit: r.fallback };
  }
  // cosmetic: remembered for the customisation screen; merit meanwhile
  // TODO(Customize.ts): unlock the matching nose art / paint scheme here when that module exists
  if (!cosmetics.includes(r.id)) cosmetics.push(r.id);
  prog.earn(r.fallback);
  return { text: `${r.label} · +${r.fallback} merit`, merit: r.fallback };
}

export const rewardLabel = (r: Reward | null) => !r ? '' : r.kind === 'merit' ? `+${r.amount} merit` : r.label;

// ---------------- persisted stats ----------------

export const ENEMY_KINDS = ['fw190', 'bf109', 'bf110', 'ju88', 'me262', 'me163'] as const;

export interface CareerData {
  v: 1;
  serial: string;          // service number shown on the record
  enlisted: number;        // first-seen timestamp
  xp: number;
  missions: number;        // debriefs reached
  wins: number;            // successful missions
  deaths: number;          // shot down or out of the fight
  kills: number;
  killsByType: Record<string, number>;
  killsByRole: { gunner: number; pilot: number };
  killsByStation: Record<string, number>;
  shots: number;
  hits: number;
  seconds: number;         // time in the air
  bestBombing: number;
  bestStreak: number;
  bosses: number;
  bombersSaved: number;    // bombers brought home on successful missions
  bombersLost: number;
  medals: Record<string, number>;
  cosmetics: string[];
  overdrives: number;
  campaignWins: string[];  // mission ids completed at least once
  bestSurvivalRound: number;
  dailyDone: number;
  dailyPerfectDays: number;
  dailyRuns: number;
  dailyBest: Record<string, number>; // leaderboard mode -> best score
}

const KEY = 'sws3d.career.v1';

export function newSerial(rand = Math.random): string {
  const n = () => Math.floor(rand() * 10);
  return `3${n()} ${n()}${n()}${n()} ${n()}${n()}${n()}`;
}

export function emptyCareer(): CareerData {
  return {
    v: 1, serial: newSerial(), enlisted: Date.now(), xp: 0, missions: 0, wins: 0, deaths: 0, kills: 0,
    killsByType: {}, killsByRole: { gunner: 0, pilot: 0 }, killsByStation: {}, shots: 0, hits: 0, seconds: 0,
    bestBombing: 0, bestStreak: 0, bosses: 0, bombersSaved: 0, bombersLost: 0, medals: {}, cosmetics: [], overdrives: 0,
    campaignWins: [], bestSurvivalRound: 0, dailyDone: 0, dailyPerfectDays: 0, dailyRuns: 0, dailyBest: {},
  };
}

export function loadCareer(): CareerData {
  const c = emptyCareer();
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (o && typeof o === 'object') {
      for (const k of Object.keys(c) as (keyof CareerData)[]) {
        if (o[k] !== undefined && typeof o[k] === typeof c[k]) (c as any)[k] = o[k];
      }
      const kr = c.killsByRole as Partial<CareerData['killsByRole']>;
      c.killsByRole = { gunner: Number(kr.gunner) || 0, pilot: Number(kr.pilot) || 0 };
    }
  } catch { /* storage unavailable or corrupt: start a fresh record */ }
  return c;
}

export function saveCareer(c: CareerData) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage unavailable */ }
}

export const totalMedals = (c: CareerData) => Object.values(c.medals).reduce((a, b) => a + b, 0);
export const heavyKills = (c: CareerData) => (c.killsByType.bf110 ?? 0) + (c.killsByType.ju88 ?? 0);
export const typesDowned = (c: CareerData) => ENEMY_KINDS.filter((t) => (c.killsByType[t] ?? 0) > 0).length;
export const stationsScored = (c: CareerData) => Object.values(c.killsByStation).filter((n) => n > 0).length;
export const lifetimeAccuracy = (c: CareerData) => (c.shots > 0 ? c.hits / c.shots : 0);
