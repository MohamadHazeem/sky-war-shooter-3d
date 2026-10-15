// Gunner Mastery: the long-term goals of a B-17 gunner, on top of the career and the skill tree.
//
//   - Mastery ranks per gun station (ten ranks, XP from kills at that station, deflection and
//     ace kills, untouched rounds, accuracy) with a reward on most ranks;
//   - challenge sets: deflection kills, ace kills, untouched rounds, long shots and kills at
//     every station, three tiers each;
//   - the weekly Ace Hunt: points from every gunner sortie this ISO week, a quarry type worth
//     triple, a goal with a reward, and its own online board 'acehunt-gunner-<yyyyww>'
//     (firestore.rules);
//   - unlockables: gun sight styles (GunSights.ts), crew patches (CrewPatches.ts), nose art and
//     bomber names (Customize.ts / NoseArt.ts, as 'nose:<id>' / 'name:<name>' unlocks);
//   - per-station stats: kills, rounds fired, hits, accuracy, time at the gun.
//
// Pure data and maths plus guarded localStorage (sws3d.mastery.v1, mirrored by the cloud save
// like every sws3d.* key), so it is unit-tested in Node. The in-game side is MasteryWatch.ts.
import { STATION_ORDER, type StationId } from '../world/B17Layout';
import { hashString } from './Dailies';
import { weekKey } from './Weekly';
import { isSightId, sightDef } from './GunSights';
import { isPatchId, patchDef } from './CrewPatches';

// ---------------- ranks ----------------
export interface MasteryRank { name: string; xp: number }
export const MASTERY_RANKS: MasteryRank[] = [
  { name: 'Trainee', xp: 0 },
  { name: 'Gunner', xp: 100 },
  { name: 'Seasoned Gunner', xp: 250 },
  { name: 'Sharpshooter', xp: 500 },
  { name: 'Marksman', xp: 900 },
  { name: 'Expert', xp: 1500 },
  { name: 'Veteran', xp: 2400 },
  { name: 'Ace Gunner', xp: 3600 },
  { name: 'Master Gunner', xp: 5200 },
  { name: 'Legend', xp: 7500 },
];
export const MAX_RANK = MASTERY_RANKS.length;

export interface RankState { rank: number; name: string; xp: number; next: number | null; progress: number }

// rank is 1..10
export function masteryRank(xp: number): RankState {
  const x = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let i = 0;
  while (i < MASTERY_RANKS.length - 1 && x >= MASTERY_RANKS[i + 1].xp) i++;
  const cur = MASTERY_RANKS[i], nx = MASTERY_RANKS[i + 1];
  return { rank: i + 1, name: cur.name, xp: x, next: nx ? nx.xp : null, progress: nx ? (x - cur.xp) / (nx.xp - cur.xp) : 1 };
}

// ---------------- kills ----------------
export const XP = { kill: 10, heavy: 5, deflection: 10, ace: 25, long: 10, clean: 20, win: 15, sharp: 20 } as const;
export const DEFLECTION_DEG = 60;      // crossing angle for a deflection kill
export const DEFLECTION_MIN_SPEED = 25; // m/s of relative speed, so a hanging target is not "crossing"
export const LONG_RANGE = 600;          // m
export const SHARP_ACC = 0.25, SHARP_MIN_SHOTS = 100;
export const CLEAN_ROUND_S = 45;        // an untouched round must last this long
const HEAVY = new Set(['bf110', 'ju88', 'me410', 'he111', 'do335']);

export interface V3 { x: number; y: number; z: number }

// Crossing angle (0..90°) between the target's motion relative to the gun and the line of sight:
// 0 = flying straight at or away from the gun, 90 = crossing at right angles (full deflection)
export function crossingAngle(los: V3, rel: V3): number {
  const l = Math.hypot(los.x, los.y, los.z), v = Math.hypot(rel.x, rel.y, rel.z);
  if (l < 1e-6 || v < 1e-6) return 0;
  const c = Math.abs((los.x * rel.x + los.y * rel.y + los.z * rel.z) / (l * v));
  return (Math.acos(Math.min(1, c)) * 180) / Math.PI;
}

export interface KillInfo { type: string; dist: number; cross: number; relSpeed: number; ace: boolean }
export interface KillClass { heavy: boolean; deflection: boolean; long: boolean; ace: boolean; xp: number }

export function classifyKill(k: KillInfo): KillClass {
  const heavy = HEAVY.has(k.type);
  const deflection = k.cross >= DEFLECTION_DEG && k.relSpeed >= DEFLECTION_MIN_SPEED;
  const long = k.dist >= LONG_RANGE;
  const xp = XP.kill + (heavy ? XP.heavy : 0) + (deflection ? XP.deflection : 0) + (k.ace ? XP.ace : 0) + (long ? XP.long : 0);
  return { heavy, deflection, long, ace: k.ace, xp };
}

// ---------------- rewards ----------------
export type Reward =
  | { kind: 'merit'; amount: number }
  | { kind: 'sight'; id: string }
  | { kind: 'patch'; id: string }
  | { kind: 'nose'; id: string }
  | { kind: 'name'; id: string };

export const FALLBACK_MERIT = 500;   // paid instead of an item already owned
export const MASTER_NOSE = 'mastergunner', HUNTER_NOSE = 'acehunter';
export const NOSE_NAMES: Record<string, string> = { [MASTER_NOSE]: 'Master Gunner', [HUNTER_NOSE]: 'Ace Hunter' };

export const unlockKey = (r: Reward) => (r.kind === 'merit' ? '' : `${r.kind}:${r.id}`);

// English label for a reward ("Gun sight: Gyro K-14"); translated piecewise by the screens
export function rewardParts(r: Reward): { kind: string; name: string } {
  switch (r.kind) {
    case 'merit': return { kind: 'Merit', name: `+${r.amount}` };
    case 'sight': return { kind: 'Gun sight', name: sightDef(r.id).name };
    case 'patch': return { kind: 'Crew patch', name: patchDef(r.id).name };
    case 'nose': return { kind: 'Nose art', name: NOSE_NAMES[r.id] ?? r.id };
    case 'name': return { kind: 'Bomber name', name: `"${r.id}"` };
  }
}

// What each station gives for itself: a patch at rank 3, a sight at 5 and a bomber name at 7
export const STATION_GEAR: Record<StationId, { patch: string; sight: string; name: string }> = {
  waistL: { patch: 'portwatch', sight: 'mk9', name: 'Left Hook' },
  waistR: { patch: 'starboard', sight: 'crosshair', name: 'Right Cross' },
  top: { patch: 'tophat', sight: 'k14', name: 'High Noon' },
  ball: { patch: 'ballbearing', sight: 'chevron', name: 'Belly Gunner' },
  tail: { patch: 'stinger', sight: 'tracer', name: 'Tail-End Charlie' },
};

// The reward for reaching a rank at a station (rank 1 has none)
export function stationReward(st: StationId, rank: number): Reward | null {
  const g = STATION_GEAR[st];
  switch (rank) {
    case 2: return { kind: 'merit', amount: 250 };
    case 3: return { kind: 'patch', id: g.patch };
    case 4: return { kind: 'merit', amount: 500 };
    case 5: return { kind: 'sight', id: g.sight };
    case 6: return { kind: 'merit', amount: 1000 };
    case 7: return { kind: 'name', id: g.name };
    case 8: return { kind: 'merit', amount: 1500 };
    case 9: return { kind: 'nose', id: MASTER_NOSE };
    case 10: return { kind: 'patch', id: 'legend' };
    default: return null;
  }
}

// ---------------- challenge sets ----------------
export type ChallengeId = 'deflection' | 'aces' | 'clean' | 'long' | 'allround';
export interface ChallengeDef { id: ChallengeId; name: string; desc: string; tiers: [number, number, number]; rewards: [Reward, Reward, Reward] }

export const CHALLENGES: ChallengeDef[] = [
  { id: 'deflection', name: 'Deflection Shooting', desc: 'Down fighters crossing your line of fire at 60° or more.', tiers: [15, 75, 250],
    rewards: [{ kind: 'sight', id: 'deflection' }, { kind: 'patch', id: 'crossfire' }, { kind: 'name', id: 'Deflection Queen' }] },
  { id: 'aces', name: 'Ace Hunter', desc: 'Down aces: named Experten, Ace Hunt aces and squadron leaders.', tiers: [5, 25, 100],
    rewards: [{ kind: 'patch', id: 'acehunter' }, { kind: 'name', id: 'Ace Hunter' }, { kind: 'nose', id: HUNTER_NOSE }] },
  { id: 'clean', name: 'Untouched', desc: 'Clear a round at the guns without your B-17 taking a hit.', tiers: [3, 15, 50],
    rewards: [{ kind: 'patch', id: 'untouched' }, { kind: 'merit', amount: 1000 }, { kind: 'name', id: 'Untouchable' }] },
  { id: 'long', name: 'Long Shot', desc: 'Down fighters 600 m away or more.', tiers: [10, 50, 150],
    rewards: [{ kind: 'merit', amount: 500 }, { kind: 'patch', id: 'longshot' }, { kind: 'name', id: 'Long Reach' }] },
  { id: 'allround', name: 'Every Gun', desc: 'Kills at every gun station: counts the station with the fewest.', tiers: [5, 25, 100],
    rewards: [{ kind: 'patch', id: 'fullcrew' }, { kind: 'merit', amount: 1500 }, { kind: 'merit', amount: 3000 }] },
];

// ---------------- weekly Ace Hunt ----------------
export interface Quarry { id: string; name: string; types: string[] }
export const QUARRIES: Quarry[] = [
  { id: 'fw190', name: 'Fw 190s', types: ['fw190'] },
  { id: 'bf109', name: 'Bf 109s', types: ['bf109'] },
  { id: 'heavies', name: 'Heavy fighters (Bf 110 / Ju 88 / Me 410)', types: ['bf110', 'ju88', 'me410'] },
  { id: 'jets', name: 'Jets and rockets (Me 262 / Me 163)', types: ['me262', 'me163'] },
];
export const HUNT = { kill: 10, quarry: 20, ace: 40, deflection: 10, long: 10, clean: 25 } as const;   // quarry: extra on top of kill
export const HUNT_GOAL = 1500;
export const HUNT_MERIT = 1000;
export const HUNT_PATCH = 'huntmaster';
export const huntMode = (key = weekKey()) => `acehunt-gunner-${key}`;
export const quarryFor = (key = weekKey()): Quarry => QUARRIES[hashString(`sws3d-acehunt:${key}`) % QUARRIES.length];

export function huntPointsForKill(type: string, c: KillClass, q: Quarry): number {
  return HUNT.kill + (q.types.includes(type) ? HUNT.quarry : 0) + (c.ace ? HUNT.ace : 0) + (c.deflection ? HUNT.deflection : 0) + (c.long ? HUNT.long : 0);
}

// ---------------- the record ----------------
export interface StationRec {
  xp: number; kills: number; shots: number; hits: number; time: number;
  deflection: number; aces: number; long: number; heavy: number; clean: number; bestMission: number;
}
export interface HuntRec { week: string; points: number; kills: number; missions: number; posted: number; done: boolean }
export interface MasteryData {
  v: 1;
  stations: Record<StationId, StationRec>;
  claimed: string[];        // rewards paid: 'st:<station>:<rank>', 'ch:<id>:<tier>', 'hunt:<yyyyww>'
  sight: string;
  patch: string;
  hunt: HuntRec;
  huntWins: number;
  migrated: boolean;        // career kills by station carried over once
}

export const emptyStation = (): StationRec => ({ xp: 0, kills: 0, shots: 0, hits: 0, time: 0, deflection: 0, aces: 0, long: 0, heavy: 0, clean: 0, bestMission: 0 });
export const emptyHunt = (week = weekKey()): HuntRec => ({ week, points: 0, kills: 0, missions: 0, posted: 0, done: false });

export function emptyMastery(): MasteryData {
  const stations = {} as Record<StationId, StationRec>;
  for (const s of STATION_ORDER) stations[s] = emptyStation();
  return { v: 1, stations, claimed: [], sight: 'ring', patch: 'wings', hunt: emptyHunt(), huntWins: 0, migrated: false };
}

// One mission's tally, built live by MasteryWatch
export interface StationTally { kills: number; shots: number; hits: number; time: number; deflection: number; aces: number; long: number; heavy: number; clean: number; xp: number }
export interface MissionTally { stations: Partial<Record<StationId, StationTally>>; huntPoints: number; huntKills: number; win: boolean }
export const emptyTally = (): StationTally => ({ kills: 0, shots: 0, hits: 0, time: 0, deflection: 0, aces: 0, long: 0, heavy: 0, clean: 0, xp: 0 });

export interface RewardTarget { unlocked: Set<string>; unlock(id: string, cost: number): boolean; earn(n: number): void }
export interface Granted { source: string; reward: Reward; text: string }   // source: what earned it (English)
export interface StationGain { id: StationId; gained: number; before: RankState; after: RankState; tally: StationTally }
export interface ChallengeGain { id: ChallengeId; before: number; after: number; goal: number; tier: number }
export interface MissionReport { stations: StationGain[]; challenges: ChallengeGain[]; rewards: Granted[]; hunt: { gained: number; points: number; goal: number; reached: boolean; quarry: Quarry } }

export const MASTERY_KEY = 'sws3d.mastery.v1';
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, x) : 0);

export class MasteryBook {
  d: MasteryData;

  constructor(load = true, private now: () => Date = () => new Date()) {
    this.d = emptyMastery();
    if (load) this.load();
    this.rollWeek();
  }

  private load() {
    try {
      const o = JSON.parse(localStorage.getItem(MASTERY_KEY) ?? 'null');
      if (!o || typeof o !== 'object') return;
      for (const s of STATION_ORDER) {
        const r = o.stations?.[s];
        if (r && typeof r === 'object') for (const k of Object.keys(this.d.stations[s]) as (keyof StationRec)[]) this.d.stations[s][k] = num(r[k]);
      }
      if (Array.isArray(o.claimed)) this.d.claimed = o.claimed.filter((x: unknown) => typeof x === 'string');
      if (isSightId(o.sight)) this.d.sight = o.sight;
      if (isPatchId(o.patch)) this.d.patch = o.patch;
      if (o.hunt && typeof o.hunt.week === 'string') {
        this.d.hunt = { week: o.hunt.week, points: num(o.hunt.points), kills: num(o.hunt.kills), missions: num(o.hunt.missions), posted: num(o.hunt.posted), done: !!o.hunt.done };
      }
      this.d.huntWins = num(o.huntWins);
      this.d.migrated = !!o.migrated;
    } catch { /* storage unavailable or corrupt: a fresh record */ }
  }

  save() { try { localStorage.setItem(MASTERY_KEY, JSON.stringify(this.d)); } catch { /* storage unavailable */ } }

  // A new ISO week: the Ace Hunt starts again from zero
  rollWeek() {
    const k = weekKey(this.now());
    if (this.d.hunt.week !== k) { this.d.hunt = emptyHunt(k); this.save(); }
  }

  station(s: StationId) { return this.d.stations[s]; }
  rank(s: StationId) { return masteryRank(this.d.stations[s].xp); }
  accuracy(s: StationId) { const r = this.d.stations[s]; return r.shots > 0 ? r.hits / r.shots : 0; }
  totals(): StationRec {
    const t = emptyStation();
    for (const s of STATION_ORDER) for (const k of Object.keys(t) as (keyof StationRec)[]) t[k] = k === 'bestMission' ? Math.max(t[k], this.d.stations[s][k]) : t[k] + this.d.stations[s][k];
    return t;
  }

  // Challenge progress (lifetime counters)
  progress(id: ChallengeId): number {
    const st = this.d.stations;
    switch (id) {
      case 'deflection': return STATION_ORDER.reduce((a, s) => a + st[s].deflection, 0);
      case 'aces': return STATION_ORDER.reduce((a, s) => a + st[s].aces, 0);
      case 'clean': return STATION_ORDER.reduce((a, s) => a + st[s].clean, 0);
      case 'long': return STATION_ORDER.reduce((a, s) => a + st[s].long, 0);
      case 'allround': return Math.min(...STATION_ORDER.map((s) => st[s].kills));
    }
  }
  tiersDone(c: ChallengeDef) { const p = this.progress(c.id); return c.tiers.filter((t) => p >= t).length; }

  // Career kills by station, from before mastery existed: carried over once, as kill XP
  migrate(killsByStation: Record<string, number>) {
    if (this.d.migrated) return;
    for (const s of STATION_ORDER) {
      const n = num(killsByStation[s]);
      const r = this.d.stations[s];
      if (n > r.kills) { r.xp += (n - r.kills) * XP.kill; r.kills = n; }
    }
    this.d.migrated = true;
    this.save();
  }

  owns(target: Pick<RewardTarget, 'unlocked'>, r: Reward): boolean {
    if (r.kind === 'merit') return false;
    if (r.kind === 'sight' && r.id === 'ring') return true;
    if (r.kind === 'patch' && patchDef(r.id).free) return true;
    return target.unlocked.has(unlockKey(r));
  }

  private grant(target: RewardTarget, r: Reward, source: string, out: Granted[]) {
    if (r.kind === 'merit') { target.earn(r.amount); out.push({ source, reward: r, text: `+${r.amount} merit` }); return; }
    if (this.owns(target, r)) { target.earn(FALLBACK_MERIT); out.push({ source, reward: { kind: 'merit', amount: FALLBACK_MERIT }, text: `+${FALLBACK_MERIT} merit` }); return; }
    target.unlock(unlockKey(r), 0);
    const p = rewardParts(r);
    out.push({ source, reward: r, text: `${p.kind}: ${p.name}` });
  }

  // Pay every reward earned and not yet paid (ranks, challenge tiers, this week's hunt)
  claimAll(target: RewardTarget): Granted[] {
    const out: Granted[] = [];
    const claim = (key: string, r: Reward | null, source: string) => {
      if (!r || this.d.claimed.includes(key)) return;
      this.d.claimed.push(key);
      this.grant(target, r, source, out);
    };
    for (const s of STATION_ORDER) {
      const rk = this.rank(s).rank;
      for (let i = 2; i <= rk; i++) claim(`st:${s}:${i}`, stationReward(s, i), `${s}|${i}`);
    }
    for (const c of CHALLENGES) {
      const done = this.tiersDone(c);
      for (let i = 0; i < done; i++) claim(`ch:${c.id}:${i + 1}`, c.rewards[i], `${c.id}|${i + 1}`);
    }
    const h = this.d.hunt;
    if (h.points >= HUNT_GOAL && !h.done) {
      h.done = true;
      this.d.huntWins++;
      this.d.claimed.push(`hunt:${h.week}`);
      this.grant(target, { kind: 'merit', amount: HUNT_MERIT }, 'hunt', out);
      if (!this.owns(target, { kind: 'patch', id: HUNT_PATCH })) this.grant(target, { kind: 'patch', id: HUNT_PATCH }, 'hunt', out);
    }
    if (out.length) this.save();
    return out;
  }

  // Commit one gunner mission: stats, XP, the hunt, then every reward it earned
  commit(t: MissionTally, target: RewardTarget): MissionReport {
    this.rollWeek();
    const before = new Map(CHALLENGES.map((c) => [c.id, this.progress(c.id)]));
    const stations: StationGain[] = [];
    const used = STATION_ORDER.filter((s) => t.stations[s]);
    // mission bonuses go to the station flown longest
    const main = used.slice().sort((a, b) => (t.stations[b]!.time - t.stations[a]!.time))[0];
    for (const s of used) {
      const x = t.stations[s]!, r = this.d.stations[s];
      const rb = masteryRank(r.xp);
      let gained = x.xp + x.clean * XP.clean;
      if (s === main && t.win) gained += XP.win;
      if (x.shots >= SHARP_MIN_SHOTS && x.hits / x.shots >= SHARP_ACC) gained += XP.sharp;
      r.xp += gained; r.kills += x.kills; r.shots += x.shots; r.hits += x.hits; r.time += x.time;
      r.deflection += x.deflection; r.aces += x.aces; r.long += x.long; r.heavy += x.heavy; r.clean += x.clean;
      r.bestMission = Math.max(r.bestMission, x.kills);
      if (gained > 0 || x.kills > 0 || x.shots > 0) stations.push({ id: s, gained, before: rb, after: masteryRank(r.xp), tally: x });
    }
    const q = quarryFor(this.d.hunt.week);
    const h = this.d.hunt;
    const cleanPts = used.reduce((a, s) => a + t.stations[s]!.clean, 0) * HUNT.clean;
    const huntGained = t.huntPoints + cleanPts;
    h.points += huntGained; h.kills += t.huntKills; h.missions++;
    const challenges: ChallengeGain[] = CHALLENGES.map((c) => {
      const b = before.get(c.id)!, a = this.progress(c.id);
      const tier = c.tiers.filter((x) => a >= x).length;
      return { id: c.id, before: b, after: a, goal: c.tiers[Math.min(tier, 2)], tier };
    }).filter((c) => c.after > c.before);
    const rewards = this.claimAll(target);
    this.save();
    return { stations, challenges, rewards, hunt: { gained: huntGained, points: h.points, goal: HUNT_GOAL, reached: h.done, quarry: q } };
  }

  // ---- the Locker ----
  setSight(target: Pick<RewardTarget, 'unlocked'>, id: string): boolean {
    if (!isSightId(id) || !this.owns(target, { kind: 'sight', id })) return false;
    this.d.sight = id; this.save(); return true;
  }
  setPatch(target: Pick<RewardTarget, 'unlocked'>, id: string): boolean {
    if (!isPatchId(id) || !this.owns(target, { kind: 'patch', id })) return false;
    this.d.patch = id; this.save(); return true;
  }
  activeSight(target: Pick<RewardTarget, 'unlocked'>) { return this.owns(target, { kind: 'sight', id: this.d.sight }) ? this.d.sight : 'ring'; }
  activePatch(target: Pick<RewardTarget, 'unlocked'>) { return this.owns(target, { kind: 'patch', id: this.d.patch }) ? this.d.patch : 'wings'; }

  // The hunt entry for the weekly board (null when there is nothing new to post)
  huntEntry() {
    this.rollWeek();
    const h = this.d.hunt;
    return h.points > 0 ? { mode: huntMode(h.week), score: Math.round(h.points), kills: Math.round(h.kills), rounds: Math.min(500, Math.round(h.missions)) } : null;
  }
  markPosted() { this.d.hunt.posted = this.d.hunt.points; this.save(); }
}

// How each unlockable is earned (English, for the Locker): every source that grants it
export function sourcesOf(r: Reward): string[] {
  const k = unlockKey(r);
  const out: string[] = [];
  for (const s of STATION_ORDER) for (let i = 2; i <= MAX_RANK; i++) { const x = stationReward(s, i); if (x && unlockKey(x) === k) out.push(`${s}|${i}`); }
  for (const c of CHALLENGES) c.rewards.forEach((x, i) => { if (unlockKey(x) === k) out.push(`${c.id}|${i + 1}`); });
  if (k === `patch:${HUNT_PATCH}`) out.push('hunt');
  return out;
}
