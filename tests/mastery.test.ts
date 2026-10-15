import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { stubStorage } from './helpers';
import {
  CHALLENGES, FALLBACK_MERIT, HUNT, HUNT_GOAL, HUNT_MERIT, HUNT_PATCH, MASTERY_KEY, MASTERY_RANKS, MAX_RANK, MasteryBook, NOSE_NAMES, QUARRIES,
  STATION_GEAR, XP, classifyKill, crossingAngle, emptyTally, huntMode, huntPointsForKill, masteryRank, quarryFor, sourcesOf, stationReward,
  type MissionTally, type RewardTarget,
} from '../src/game/Mastery';
import { SIGHTS, drawHudSight, drawReflectorSight, isSightId, setActiveSight, activeSight } from '../src/game/GunSights';
import { PATCHES, patchSvg } from '../src/game/CrewPatches';
import { COLLECTABLES, NAME_PRESETS } from '../src/game/Customize';
import { NOSE_ARTS } from '../src/render/NoseArt';
import { STATION_ORDER } from '../src/world/B17Layout';
import { HANGAR_TABS } from '../src/game/MenuModel';
import { MASTERY_TABS } from '../src/ui/MasteryScreen';
import { hasPhrase, setLang, tx } from '../src/i18n';
import { PHRASES } from '../src/i18n/phrases';

const WEEK1 = new Date(Date.UTC(2026, 9, 14, 12));   // ISO week 2026-42
const WEEK2 = new Date(Date.UTC(2026, 9, 21, 12));   // week 43

function target(): RewardTarget & { points: number } {
  return {
    points: 0, unlocked: new Set<string>(),
    unlock(id: string) { this.unlocked.add(id); return true; },
    earn(n: number) { this.points += n; },
  };
}

function tally(kills = 0, over: Partial<ReturnType<typeof emptyTally>> = {}, station: (typeof STATION_ORDER)[number] = 'ball'): MissionTally {
  return { stations: { [station]: { ...emptyTally(), kills, xp: kills * XP.kill, ...over } }, huntPoints: kills * HUNT.kill, huntKills: kills, win: false };
}

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); setActiveSight('ring'); });

describe('mastery ranks', () => {
  it('climbs ten ranks with growing gaps', () => {
    expect(MASTERY_RANKS).toHaveLength(MAX_RANK);
    for (let i = 1; i < MASTERY_RANKS.length; i++) expect(MASTERY_RANKS[i].xp - MASTERY_RANKS[i - 1].xp).toBeGreaterThanOrEqual(MASTERY_RANKS[Math.max(0, i - 1)].xp - MASTERY_RANKS[Math.max(0, i - 2)].xp);
    expect(masteryRank(0).rank).toBe(1);
    expect(masteryRank(99).rank).toBe(1);
    expect(masteryRank(100).rank).toBe(2);
    expect(masteryRank(1e9)).toMatchObject({ rank: 10, next: null, progress: 1 });
    expect(masteryRank(NaN).rank).toBe(1);
    expect(masteryRank(175).progress).toBeCloseTo(0.5);
  });

  it('every station has a patch at 3, a sight at 5, a name at 7 and the master nose art at 9', () => {
    for (const s of STATION_ORDER) {
      expect(stationReward(s, 1)).toBeNull();
      expect(stationReward(s, 3)).toEqual({ kind: 'patch', id: STATION_GEAR[s].patch });
      expect(stationReward(s, 5)).toEqual({ kind: 'sight', id: STATION_GEAR[s].sight });
      expect(stationReward(s, 7)).toEqual({ kind: 'name', id: STATION_GEAR[s].name });
      expect(stationReward(s, 9)).toEqual({ kind: 'nose', id: 'mastergunner' });
      expect(isSightId(STATION_GEAR[s].sight)).toBe(true);
    }
    // five different sights, patches and names: one of each per gun
    for (const k of ['patch', 'sight', 'name'] as const) expect(new Set(STATION_ORDER.map((s) => STATION_GEAR[s][k])).size).toBe(5);
  });
});

describe('kill classification', () => {
  it('measures the crossing angle', () => {
    expect(crossingAngle({ x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: -150 })).toBeCloseTo(0);     // head-on
    expect(crossingAngle({ x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 150 })).toBeCloseTo(0);      // going away
    expect(crossingAngle({ x: 0, y: 0, z: 100 }, { x: 120, y: 0, z: 0 })).toBeCloseTo(90);     // full deflection
    expect(crossingAngle({ x: 0, y: 0, z: 100 }, { x: 100, y: 0, z: 100 })).toBeCloseTo(45);
    expect(crossingAngle({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(0);
  });

  it('books deflection, long, ace and heavy kills with their XP', () => {
    const plain = classifyKill({ type: 'fw190', dist: 300, cross: 10, relSpeed: 80, ace: false });
    expect(plain).toMatchObject({ deflection: false, long: false, ace: false, heavy: false, xp: XP.kill });
    const all = classifyKill({ type: 'ju88', dist: 700, cross: 70, relSpeed: 90, ace: true });
    expect(all).toMatchObject({ deflection: true, long: true, ace: true, heavy: true });
    expect(all.xp).toBe(XP.kill + XP.heavy + XP.deflection + XP.ace + XP.long);
    // a target hanging still relative to the gun is not a deflection shot
    expect(classifyKill({ type: 'fw190', dist: 300, cross: 80, relSpeed: 5, ace: false }).deflection).toBe(false);
  });

  it('persists weekly flight duration and resets it with the hunt', () => {
    let date = new Date('2026-10-15T12:00:00Z');
    const book = new MasteryBook(false, () => date);
    const target = { unlocked: new Set<string>(), unlock: () => true, earn: () => {} };
    book.commit(tally(1, { time: 120 }, 'waistL'), target);
    book.commit(tally(1, { time: 90 }, 'tail'), target);
    expect(book.huntEntry()?.duration).toBe(210);
    expect(new MasteryBook(true, () => date).huntEntry()?.duration).toBe(210);
    date = new Date('2026-10-22T12:00:00Z');
    book.rollWeek();
    expect(book.d.hunt.duration).toBe(0);
  });
  it('scores the weekly hunt with the quarry worth triple', () => {
    const q = QUARRIES[0];
    const c = classifyKill({ type: q.types[0], dist: 200, cross: 0, relSpeed: 50, ace: false });
    expect(huntPointsForKill(q.types[0], c, q)).toBe(HUNT.kill + HUNT.quarry);
    expect(huntPointsForKill('nothing', c, q)).toBe(HUNT.kill);
  });
});

describe('the mastery record', () => {
  it('commits a mission: stats, XP, bonuses, and rank rewards paid once', () => {
    const book = new MasteryBook(true, () => WEEK1), t = target();
    const rep = book.commit({ ...tally(12, { shots: 400, hits: 120, deflection: 3, aces: 1, clean: 1, time: 300 }), win: true }, t);
    const rec = book.station('ball');
    expect(rec).toMatchObject({ kills: 12, shots: 400, hits: 120, deflection: 3, aces: 1, clean: 1, bestMission: 12 });
    expect(rec.xp).toBe(12 * XP.kill + XP.clean + XP.win + XP.sharp);
    expect(book.accuracy('ball')).toBeCloseTo(0.3);
    expect(rep.stations[0]).toMatchObject({ id: 'ball', before: { rank: 1 }, after: { rank: 2 } });
    expect(rep.rewards.map((r) => r.reward)).toContainEqual({ kind: 'merit', amount: 250 });
    expect(t.points).toBe(250);
    // a second commit does not pay rank 2 again
    book.commit(tally(0, { shots: 10 }), t);
    expect(t.points).toBe(250);
    // persisted and reloaded
    expect(JSON.parse(localStorage.getItem(MASTERY_KEY)!).stations.ball.kills).toBe(12);
    expect(new MasteryBook(true, () => WEEK1).station('ball').kills).toBe(12);
  });

  it('unlocks the station gear and pays merit for anything already owned', () => {
    const book = new MasteryBook(true, () => WEEK1), t = target();
    book.commit(tally(250, {}, 'tail'), t);   // 2,500 XP: rank 7
    expect(book.rank('tail').rank).toBe(7);
    for (const k of ['patch:stinger', 'sight:tracer', 'name:Tail-End Charlie']) expect(t.unlocked.has(k), k).toBe(true);
    const book2 = new MasteryBook(false, () => WEEK1), t2 = target();
    t2.unlocked.add('patch:stinger');
    const rep = book2.commit(tally(30, {}, 'tail'), t2);   // rank 3
    expect(rep.rewards.find((r) => r.source === 'tail|3')?.reward).toEqual({ kind: 'merit', amount: FALLBACK_MERIT });
  });

  it('claims challenge tiers in order', () => {
    const book = new MasteryBook(true, () => WEEK1), t = target();
    const rep = book.commit(tally(15, { deflection: 15 }), t);
    expect(rep.challenges.find((c) => c.id === 'deflection')).toMatchObject({ after: 15, tier: 1, goal: 75 });
    expect(t.unlocked.has('sight:deflection')).toBe(true);
    expect(book.setSight(t, 'deflection')).toBe(true);
    expect(book.activeSight(t)).toBe('deflection');
    expect(book.setSight(t, 'k14')).toBe(false);        // not owned
    expect(book.setSight(t, 'nonsense')).toBe(false);
    // Every Gun counts the station with the fewest kills
    expect(book.progress('allround')).toBe(0);
    for (const s of STATION_ORDER) book.commit(tally(5, {}, s), t);
    expect(book.progress('allround')).toBe(5);
    expect(t.unlocked.has('patch:fullcrew')).toBe(true);
  });

  it('carries career kills over once', () => {
    const book = new MasteryBook(true, () => WEEK1);
    book.migrate({ waistL: 40, top: 3, bogus: 99 });
    expect(book.station('waistL')).toMatchObject({ kills: 40, xp: 400, shots: 0 });
    book.migrate({ waistL: 400 });
    expect(book.station('waistL').kills).toBe(40);
  });

  it('runs the weekly Ace Hunt: goal reward once a week, the patch once ever, reset each week', () => {
    let now = WEEK1;
    const book = new MasteryBook(true, () => now), t = target();
    expect(book.d.hunt.week).toBe('202642');
    expect(book.huntEntry()).toBeNull();
    const rep = book.commit({ ...tally(0), huntPoints: HUNT_GOAL, huntKills: 10 }, t);
    expect(rep.hunt).toMatchObject({ gained: HUNT_GOAL, points: HUNT_GOAL, reached: true });
    expect(t.unlocked.has('patch:' + HUNT_PATCH)).toBe(true);
    expect(t.points).toBe(HUNT_MERIT);
    expect(book.huntEntry()).toEqual({ mode: 'acehunt-gunner-202642', duration: 0, score: HUNT_GOAL, kills: 10, rounds: 1 });
    book.commit({ ...tally(0), huntPoints: 50, huntKills: 0 }, t);
    expect(t.points).toBe(HUNT_MERIT);                 // paid once this week
    now = WEEK2;
    book.rollWeek();
    expect(book.d.hunt).toMatchObject({ week: '202643', points: 0, done: false });
    book.commit({ ...tally(0), huntPoints: HUNT_GOAL, huntKills: 0 }, t);
    expect(t.points).toBe(HUNT_MERIT * 2);
    expect(book.d.huntWins).toBe(2);
  });

  it('picks the same quarry for everyone in a week', () => {
    expect(quarryFor('202642')).toBe(quarryFor('202642'));
    const seen = new Set(Array.from({ length: 52 }, (_, i) => quarryFor(`2026${String(i + 1).padStart(2, '0')}`).id));
    expect(seen.size).toBe(QUARRIES.length);
  });

  it('every unlockable has a way to earn it', () => {
    for (const s of SIGHTS) if (s.id !== 'ring') expect(sourcesOf({ kind: 'sight', id: s.id }).length, s.id).toBeGreaterThan(0);
    for (const p of PATCHES) if (!p.free) expect(sourcesOf({ kind: 'patch', id: p.id }).length, p.id).toBeGreaterThan(0);
    for (const id of Object.keys(NOSE_NAMES)) expect(sourcesOf({ kind: 'nose', id }).length, id).toBeGreaterThan(0);
    for (const c of CHALLENGES) expect(c.tiers[0]).toBeLessThan(c.tiers[1]);
  });
});

describe('cosmetics', () => {
  it('mastery nose art and names exist, are exclusive and never drop from crates', () => {
    for (const id of Object.keys(NOSE_NAMES)) {
      expect(NOSE_ARTS.find((n) => n.id === id)?.exclusive, id).toBeTruthy();
      expect(COLLECTABLES.find((c) => c.key === 'nose:' + id)?.exclusive, id).toBeTruthy();
    }
    const names = [...STATION_ORDER.map((s) => STATION_GEAR[s].name), ...CHALLENGES.flatMap((c) => c.rewards.filter((r) => r.kind === 'name').map((r) => (r as { id: string }).id))];
    for (const n of names) {
      expect(NAME_PRESETS.find((p) => p.name === n)?.exclusive, n).toBeTruthy();
      expect(COLLECTABLES.find((c) => c.key === 'name:' + n)?.exclusive, n).toBeTruthy();
    }
  });

  it('draws every sight style and patch', () => {
    const calls: string[] = [];
    const g = new Proxy({}, { get: (_t, k) => (k in Object.prototype ? undefined : typeof k === 'string' && /^[a-z]/.test(k) && !['strokeStyle', 'fillStyle', 'lineWidth', 'shadowColor', 'shadowBlur'].includes(k) ? (..._a: unknown[]) => { calls.push(k); } : undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
    for (const s of SIGHTS) {
      setActiveSight(s.id);
      expect(activeSight().id).toBe(s.id);
      drawHudSight(g, 100, 100, 30, 0.8);
      drawReflectorSight(g, 256);
    }
    expect(calls.length).toBeGreaterThan(50);
    for (const p of PATCHES) { expect(patchSvg(p.id)).toMatch(/^<svg[^>]*class="patch"/); expect(patchSvg(p.id)).toContain('</svg>'); }
    setActiveSight('nonsense');
    expect(activeSight().id).toBe('ring');
  });
});

describe('weekly Ace Hunt board', () => {
  it('is allowed by firestore.rules', () => {
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    const m = rules.match(/request\.resource\.data\.mode\.matches\('([^']+)'\)/);
    expect(m).toBeTruthy();
    const re = new RegExp(m![1]);
    expect(re.test(huntMode('202642'))).toBe(true);
    expect(huntMode('202642').length).toBeLessThanOrEqual(40);
    // the old boards are all still allowed
    for (const mode of ['survival-gunner', 'acehunt-gunner', 'acehunt-pilot', 'weekly-pilot-202641', 'daily-gunner-20261015', 'campaign-m12', 'coop-gunner']) expect(re.test(mode), mode).toBe(true);
    expect(re.test('acehunt-pilot-202642')).toBe(false);
  });
});

describe('Arabic', () => {
  it('covers every mastery text', () => {
    const texts = [
      ...MASTERY_RANKS.map((r) => r.name), ...MASTERY_TABS.map(([, l]) => l), ...CHALLENGES.flatMap((c) => [c.name, c.desc]),
      ...SIGHTS.flatMap((s) => [s.name, s.desc]), ...PATCHES.map((p) => p.name), ...Object.values(NOSE_NAMES), ...QUARRIES.map((q) => q.name),
      'Gun sight', 'Crew patch', 'Nose art', 'Bomber name', 'Gunner Mastery reward', 'GUNNER MASTERY', 'Weekly Ace Hunt · B-17 Gunner',
    ];
    setLang('ar');
    for (const s of texts) { expect(hasPhrase(s), s).toBe(true); expect(tx(s), s).toMatch(/[؀-ۿ]/); }
    const entry = (HANGAR_TABS as readonly { entries: readonly (readonly string[])[] }[]).flatMap((t) => t.entries).find((e) => e[0] === 'mastery')!;
    expect(entry).toBeTruthy();
    for (const s of [entry[1], entry[2]]) expect(tx(s)).toMatch(/[؀-ۿ]/);
    expect(tx('Rank {n}', { n: 4 })).toBe('الرتبة 4');
    expect(PHRASES['Veteran']).toBe('مخضرم');   // the mastery table never overrides older wording
  });
});
