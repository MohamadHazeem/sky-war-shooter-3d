// Seasons and fair leaderboards (Phase 11 · 19).
// - Monthly seasons (UTC calendar months). Every new score carries `season` = yyyymm, which
//   firestore.rules pins to the server clock, so a season board resets by itself on the 1st and
//   past seasons stay readable as frozen archives (no write can target a past season).
// - Plausibility: every entry carries its mission `duration` (s). HARD limits are rejected by the
//   rules; SOFT limits (or a server-side `shadowbans/{uid}` entry) make the rules require
//   `shadow: true`: the entry is kept and its player still sees it, but nobody else does.
//   The numbers below are mirrored in firestore.rules (tests/seasons.test.ts checks they match).
// - Season rewards: posted (non-shadow) scores count as sorties; 3 / 10 / 25 sorties in a season
//   reach Bronze / Silver / Gold and unlock that tier's season-only nose art (once, for good).
//   A local archive keeps each past season's tier, sorties and best score.
// Pure logic apart from localStorage: unit-tested.

// ---------------- the calendar ----------------
export const FIRST_SEASON = 202610;            // October 2026 is Season 1

// yyyymm of a date (UTC), the value the rules compare with request.time
export function seasonKey(d = new Date()): number { return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1; }
export const validSeason = (k: number) => Number.isInteger(k) && k >= FIRST_SEASON && k % 100 >= 1 && k % 100 <= 12;
export function seasonNumber(k: number): number {
  return (Math.floor(k / 100) - Math.floor(FIRST_SEASON / 100)) * 12 + (k % 100) - (FIRST_SEASON % 100) + 1;
}
export function shiftSeason(k: number, by: number): number {
  const m = Math.floor(k / 100) * 12 + (k % 100) - 1 + by;
  return Math.floor(m / 12) * 100 + (m % 12) + 1;
}
export const seasonStart = (k: number) => new Date(Date.UTC(Math.floor(k / 100), (k % 100) - 1, 1));
export const msUntilSeasonEnd = (now = new Date()) => seasonStart(shiftSeason(seasonKey(now), 1)).getTime() - now.getTime();
// "16d 04h 05m" — the same shape as the weekly countdown, so the Arabic pattern covers it
export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m` : `${h}h ${String(m).padStart(2, '0')}m`;
}

// Daily and weekly boards are already time-boxed: they get no season view
export const seasonalBoard = (mode: string) => !!mode && !/^(daily|weekly)-/.test(mode);

// ---------------- plausibility ----------------
export interface Claim { score: number; kills: number; rounds: number; duration: number }

export const LIMITS = {
  maxDuration: 36000,                // s (10 h)
  // HARD (rejected): score <= kills*4000 + rounds*3000 + 5000, score <= duration*1500 + 20000,
  // kills*2 <= duration + 20 (30 kills a minute), rounds*10 <= duration + 60 (10 s a round)
  hard: { perKill: 4000, perRound: 3000, base: 5000, perSec: 1500, secBase: 20000, killSecs: 2, killBase: 20, roundSecs: 10, roundBase: 60 },
  // SOFT (shadow): score > kills*2500 + rounds*2000 + 3000, score > duration*400 + 10000
  // (24k a minute), kills*4 > duration + 40 (15 kills a minute)
  soft: { perKill: 2500, perRound: 2000, base: 3000, perSec: 400, secBase: 10000, killSecs: 4, killBase: 40 },
} as const;

export type Verdict = 'ok' | 'shadow' | 'reject';

export function plausibility(c: Claim): Verdict {
  const { score, kills, rounds, duration } = c, h = LIMITS.hard, s = LIMITS.soft;
  const ints = [score, kills, rounds, duration].every((v) => Number.isInteger(v) && v >= 0);
  if (!ints || duration > LIMITS.maxDuration || score > 5000000 || kills > 5000 || rounds > 500) return 'reject';
  if (score > kills * h.perKill + rounds * h.perRound + h.base || score > duration * h.perSec + h.secBase
    || kills * h.killSecs > duration + h.killBase || rounds * h.roundSecs > duration + h.roundBase) return 'reject';
  if (score > kills * s.perKill + rounds * s.perRound + s.base || score > duration * s.perSec + s.secBase
    || kills * s.killSecs > duration + s.killBase) return 'shadow';
  return 'ok';
}

// The `shadow` value the rules demand for an entry
export const shadowFlag = (c: Claim, banned: boolean) => banned || plausibility(c) === 'shadow';

// Rows other players may see: hide shadow entries that are not the viewer's own
export function visibleRows<T extends { shadow?: boolean; mine: boolean }>(rows: T[]): T[] {
  return rows.filter((r) => r.mine || r.shadow !== true);
}

// ---------------- rewards ----------------
export type Tier = 'bronze' | 'silver' | 'gold';
export const TIERS: { id: Tier; sorties: number; label: string; nose: string; noseName: string }[] = [
  { id: 'bronze', sorties: 3, label: 'Bronze', nose: 'seasonbronze', noseName: 'Bronze Season Wings' },
  { id: 'silver', sorties: 10, label: 'Silver', nose: 'seasonsilver', noseName: 'Silver Season Wings' },
  { id: 'gold', sorties: 25, label: 'Gold', nose: 'seasongold', noseName: 'Gold Season Wings' },
];
export const SEASON_REWARD = 'Season reward';            // the nose arts' "exclusive" note
export const seasonRibbon = (k: number, t: Tier) => `season:${k}:${t}`;

export function tierFor(sorties: number): Tier | null {
  let t: Tier | null = null;
  for (const d of TIERS) if (sorties >= d.sorties) t = d.id;
  return t;
}
export function nextTier(sorties: number) { return TIERS.find((d) => sorties < d.sorties) ?? null; }

export interface SeasonRecord { key: number; sorties: number; best: number; tier: Tier | null }
export interface SeasonState { current: SeasonRecord; archive: SeasonRecord[] }
export interface RewardTarget { unlocked: Set<string>; unlock(id: string, cost: number): boolean }

const KEY = 'sws3d.seasons';
const fresh = (key: number): SeasonRecord => ({ key, sorties: 0, best: 0, tier: null });
const ARCHIVE_MAX = 24;

function clean(r: any): SeasonRecord | null {
  if (!r || !validSeason(r.key)) return null;
  const sorties = Math.max(0, Math.floor(Number(r.sorties) || 0)), best = Math.max(0, Math.floor(Number(r.best) || 0));
  return { key: r.key, sorties, best, tier: tierFor(sorties) };
}

export function loadSeasons(now = new Date()): SeasonState {
  let raw: any = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { /* */ }
  const archive = (Array.isArray(raw?.archive) ? raw.archive : []).map(clean).filter(Boolean) as SeasonRecord[];
  const state: SeasonState = { current: clean(raw?.current) ?? fresh(seasonKey(now)), archive };
  return rollover(state, now);
}

export function saveSeasons(s: SeasonState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* */ }
}

// A new month archives the finished season (if it was flown) and starts a clean one
export function rollover(s: SeasonState, now = new Date()): SeasonState {
  const key = seasonKey(now);
  if (s.current.key === key) return s;
  const archive = s.current.sorties > 0 && !s.archive.some((r) => r.key === s.current.key) ? [s.current, ...s.archive] : s.archive;
  return { current: fresh(key), archive: archive.sort((a, b) => b.key - a.key).slice(0, ARCHIVE_MAX) };
}

export interface SortieResult { record: SeasonRecord; reached: Tier | null; nose: string | null }

// A posted score: counts toward this season unless it was shadow-flagged; reaching a tier pays
// that season's ribbon and, the first time ever, the tier's nose art
export function recordSortie(score: number, shadow: boolean, prog: RewardTarget | null, now = new Date()): SortieResult {
  const s = loadSeasons(now);
  if (shadow) return { record: s.current, reached: null, nose: null };
  const before = s.current.tier;
  s.current.sorties++;
  s.current.best = Math.max(s.current.best, Math.max(0, Math.round(score)));
  s.current.tier = tierFor(s.current.sorties);
  saveSeasons(s);
  const reached = s.current.tier !== before ? s.current.tier : null;
  let nose: string | null = null;
  if (reached && prog) {
    prog.unlock(seasonRibbon(s.current.key, reached), 0);
    const def = TIERS.find((t) => t.id === reached)!;
    if (!prog.unlocked.has(`nose:${def.nose}`)) { prog.unlock(`nose:${def.nose}`, 0); nose = def.noseName; }
  }
  return { record: s.current, reached, nose };
}
