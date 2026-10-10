import { describe, it, expect, beforeEach } from 'vitest';
import {
  MEDALS, PROMOTION_REWARDS, RANKS, emptyCareer, grantReward, loadCareer, rankFor, saveCareer, xpForMission,
} from '../src/game/Career';
import { ACHIEVEMENTS, achievements } from '../src/game/Achievements';
import { AIRCRAFT, Progression, WEAPONS } from '../src/game/Upgrades';
import { stubStorage } from './helpers';

beforeEach(() => { stubStorage(); });

describe('rank ladder', () => {
  it('runs Private → Major with rising thresholds', () => {
    expect(RANKS.map((r) => r.name)).toEqual(['Private', 'Staff Sergeant', 'Master Sergeant', 'Lieutenant', 'Captain', 'Major']);
    expect(RANKS[0].xp).toBe(0);
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i].xp).toBeGreaterThan(RANKS[i - 1].xp);
  });

  it('maps XP to rank exactly at the thresholds', () => {
    for (let i = 0; i < RANKS.length; i++) {
      expect(rankFor(RANKS[i].xp).index).toBe(i);
      if (i > 0) expect(rankFor(RANKS[i].xp - 1).index).toBe(i - 1);
    }
  });

  it('reports progress towards the next rank', () => {
    const half = (RANKS[1].xp + RANKS[2].xp) / 2;
    const r = rankFor(half);
    expect(r.rank.name).toBe('Staff Sergeant');
    expect(r.next?.name).toBe('Master Sergeant');
    expect(r.progress).toBeCloseTo(0.5, 5);
    expect(r.into + RANKS[1].xp).toBe(half);
    expect(r.span).toBe(RANKS[2].xp - RANKS[1].xp);
  });

  it('caps at Major and survives junk input', () => {
    const top = rankFor(1e9);
    expect(top.rank.name).toBe('Major');
    expect(top.next).toBeNull();
    expect(top.progress).toBe(1);
    expect(rankFor(-50).index).toBe(0);
    expect(rankFor(NaN).index).toBe(0);
    expect(rankFor(Infinity).index).toBe(0);
  });
});

describe('career XP', () => {
  it('rewards score, kills, success and medals', () => {
    expect(xpForMission({ score: 0, kills: 0, success: false, medals: 0 })).toBe(40);
    expect(xpForMission({ score: 1000, kills: 5, success: true, medals: 2 })).toBe(50 + 50 + 150 + 150);
    expect(xpForMission({ score: -5, kills: -1, success: true, medals: -3 })).toBe(150);
  });

  it('a typical tour reaches Staff Sergeant within three missions and Major only after many', () => {
    const per = xpForMission({ score: 4000, kills: 18, success: true, medals: 2 });
    expect(rankFor(per * 3).index).toBeGreaterThanOrEqual(1);
    expect(rankFor(per * 30).index).toBeLessThan(5);
  });
});

describe('rewards', () => {
  it('every unlock reward points at a real weapon or aircraft id', () => {
    const ids = new Set<string>([...WEAPONS.map((w) => w.id), ...AIRCRAFT.map((a) => a.id)]);
    for (const r of [...MEDALS.map((m) => m.first), ...PROMOTION_REWARDS]) if (r?.kind === 'unlock') expect(ids.has(r.id)).toBe(true);
  });

  it('an unlock is free, and pays merit instead when already owned', () => {
    const prog = new Progression();
    const r = { kind: 'unlock', id: 'hispano', label: 'Hispano', fallback: 500 } as const;
    expect(grantReward(r, prog, []).merit).toBe(0);
    expect(prog.unlocked.has('hispano')).toBe(true);
    expect(prog.points).toBe(0);
    expect(grantReward(r, prog, []).merit).toBe(500);
    expect(prog.points).toBe(500);
  });

  it('a cosmetic is recorded once and pays its fallback merit', () => {
    const prog = new Progression(), cos: string[] = [];
    grantReward({ kind: 'cosmetic', id: 'noseart-x', label: 'X', fallback: 100 }, prog, cos);
    grantReward({ kind: 'cosmetic', id: 'noseart-x', label: 'X', fallback: 100 }, prog, cos);
    expect(cos).toEqual(['noseart-x']);
    expect(prog.points).toBe(200);
  });
});

describe('persistence', () => {
  it('round-trips and repairs missing or mistyped fields', () => {
    const c = emptyCareer();
    c.xp = 1234; c.kills = 9; c.killsByType.fw190 = 9;
    saveCareer(c);
    expect(loadCareer()).toMatchObject({ xp: 1234, kills: 9, killsByType: { fw190: 9 } });
    localStorage.setItem('sws3d.career.v1', JSON.stringify({ xp: 'lots', kills: 3 }));
    const r = loadCareer();
    expect(r.xp).toBe(0);
    expect(r.kills).toBe(3);
    expect(r.killsByRole).toEqual({ gunner: 0, pilot: 0 });
    localStorage.setItem('sws3d.career.v1', '{not json');
    expect(loadCareer().kills).toBe(0);
  });
});

describe('achievements', () => {
  it('about forty, unique ids, stat ones have goals', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(38);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) if (a.stat) expect(a.goal).toBeGreaterThan(0);
  });

  it('progress follows the career counters', () => {
    const c = emptyCareer();
    const def = ACHIEVEMENTS.find((a) => a.id === 'kills100')!;
    c.kills = 40;
    expect(achievements.progress(def, c)).toBeCloseTo(0.4);
    c.kills = 250;
    expect(achievements.progress(def, c)).toBe(1);
  });
});
