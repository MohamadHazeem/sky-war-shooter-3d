// Daily challenges ("Daily Orders") and the Daily Run seed. Everything here is derived from
// the UTC date, so every player gets the same three orders and the same Daily Run on the same
// day. Pure functions on top, then the small persisted tracker. No DOM, no three.js: unit-tested.

// ---------------- seeded randomness ----------------

// mulberry32: tiny, fast, good enough for gameplay; the same seed gives the same sequence
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a 32-bit string hash (seed source)
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// UTC calendar day as yyyymmdd (same format as the leaderboard's daily-<role>-<yyyymmdd> mode)
export function dayKey(d = new Date()): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Milliseconds until the next UTC midnight (when new orders are cut)
export function msUntilReset(now = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}

// Seed of the Daily Run for one role on one day
export const dailySeed = (key: string, role: 'gunner' | 'pilot') => hashString(`sws3d-daily-run:${key}:${role}`);

// Run fn with Math.random temporarily replaced by rng (restored even if fn throws). Used to put
// the Daily Run's spawn director and field upgrades on their own seeded stream.
export function withRandom<T>(rng: () => number, fn: () => T): T {
  const prev = Math.random;
  Math.random = rng;
  try { return fn(); } finally { Math.random = prev; }
}

// ---------------- challenge definitions ----------------

export type DailyKind =
  | 'survivalKills' | 'noLossWin' | 'heavies' | 'overdrive' | 'kills' | 'streak' | 'campaignWins'
  | 'pilotKills' | 'gunnerKills' | 'jets' | 'accuracy' | 'survivalRound' | 'dailyRun';

// 'add' kinds accumulate over the day; 'best' kinds keep the best single value
const BEST: ReadonlySet<DailyKind> = new Set<DailyKind>(['streak', 'accuracy', 'survivalRound']);
export const isBestKind = (k: DailyKind) => BEST.has(k);

interface Template { kind: DailyKind; goals: number[]; text: (n: number) => string; merit: (n: number) => number }

export const DAILY_TEMPLATES: Template[] = [
  { kind: 'survivalKills', goals: [15, 25, 40], text: (n) => `Down ${n} fighters in Survival`, merit: (n) => 200 + n * 12 },
  { kind: 'noLossWin', goals: [1], text: () => 'Win a campaign mission without losing a bomber', merit: () => 600 },
  { kind: 'heavies', goals: [3, 5], text: (n) => `Down ${n} heavies (Bf 110 / Ju 88)`, merit: (n) => 250 + n * 70 },
  { kind: 'overdrive', goals: [3, 5], text: (n) => `Use Overdrive ${n} times`, merit: (n) => 150 + n * 50 },
  { kind: 'kills', goals: [30, 50], text: (n) => `Confirm ${n} kills in any mode`, merit: (n) => 200 + n * 8 },
  { kind: 'streak', goals: [3, 4], text: (n) => `Chain a ${n}-kill streak`, merit: (n) => 150 + n * 80 },
  { kind: 'campaignWins', goals: [1, 2], text: (n) => n === 1 ? 'Complete a campaign mission' : `Complete ${n} campaign missions`, merit: (n) => 250 + n * 200 },
  { kind: 'pilotKills', goals: [10, 20], text: (n) => `Down ${n} fighters flying the P-51`, merit: (n) => 200 + n * 15 },
  { kind: 'gunnerKills', goals: [15, 25], text: (n) => `Down ${n} fighters from the B-17's guns`, merit: (n) => 200 + n * 12 },
  { kind: 'jets', goals: [2, 3], text: (n) => `Down ${n} rocket or jet fighters (Me 163 / Me 262)`, merit: (n) => 250 + n * 100 },
  { kind: 'accuracy', goals: [20, 25], text: (n) => `Finish a mission with ${n}%+ accuracy (100+ rounds)`, merit: (n) => 150 + n * 12 },
  { kind: 'survivalRound', goals: [3, 5], text: (n) => `Reach round ${n} in Survival`, merit: (n) => 150 + n * 80 },
  { kind: 'dailyRun', goals: [1], text: () => 'Fly today\'s Daily Run', merit: () => 300 },
];

export interface DailyDef { id: string; kind: DailyKind; goal: number; text: string; merit: number; xp: number }

export const DAILY_COUNT = 3;

// The day's orders: DAILY_COUNT different kinds, picked by a generator seeded from the date
export function pickDailies(key: string): DailyDef[] {
  const rng = mulberry32(hashString(`sws3d-dailies:${key}`));
  const pool = DAILY_TEMPLATES.slice();
  const out: DailyDef[] = [];
  while (out.length < DAILY_COUNT && pool.length) {
    const t = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const goal = t.goals[Math.floor(rng() * t.goals.length)];
    const merit = Math.round(t.merit(goal) / 10) * 10;
    out.push({ id: `${key}:${t.kind}:${goal}`, kind: t.kind, goal, text: t.text(goal), merit, xp: Math.round(merit / 2) });
  }
  return out;
}

// ---------------- persisted tracker ----------------

const KEY = 'sws3d.dailies.v1';

interface DailyState { day: string; progress: Partial<Record<DailyKind, number>>; done: string[]; perfect: boolean }

export class DailyTracker {
  private s: DailyState;
  onComplete: ((d: DailyDef) => void) | null = null;
  onPerfect: (() => void) | null = null;

  constructor(private now: () => Date = () => new Date()) {
    this.s = this.load();
    this.roll();
  }

  private load(): DailyState {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (o && typeof o.day === 'string') return { day: o.day, progress: o.progress ?? {}, done: Array.isArray(o.done) ? o.done : [], perfect: !!o.perfect };
    } catch { /* storage unavailable or corrupt */ }
    return { day: '', progress: {}, done: [], perfect: false };
  }

  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* storage unavailable */ } }

  // New UTC day: fresh orders, progress back to zero
  private roll() {
    const k = dayKey(this.now());
    if (this.s.day !== k) { this.s = { day: k, progress: {}, done: [], perfect: false }; this.save(); }
  }

  get day() { this.roll(); return this.s.day; }
  list(): DailyDef[] { this.roll(); return pickDailies(this.s.day); }
  value(kind: DailyKind) { this.roll(); return this.s.progress[kind] ?? 0; }
  isDone(d: DailyDef) { this.roll(); return this.s.done.includes(d.id); }
  doneCount() { return this.list().filter((d) => this.isDone(d)).length; }

  // Record progress; returns the orders this completed (callbacks fire too)
  record(kind: DailyKind, n: number): DailyDef[] {
    this.roll();
    const cur = this.s.progress[kind] ?? 0;
    const next = isBestKind(kind) ? Math.max(cur, n) : cur + Math.max(0, n);
    if (next === cur) return [];
    this.s.progress[kind] = next;
    const fresh: DailyDef[] = [];
    for (const d of pickDailies(this.s.day)) {
      if (d.kind === kind && next >= d.goal && !this.s.done.includes(d.id)) { this.s.done.push(d.id); fresh.push(d); }
    }
    const perfectNow = !this.s.perfect && pickDailies(this.s.day).every((d) => this.s.done.includes(d.id));
    if (perfectNow) this.s.perfect = true;
    this.save();
    for (const d of fresh) this.onComplete?.(d);
    if (perfectNow) this.onPerfect?.();
    return fresh;
  }
}
