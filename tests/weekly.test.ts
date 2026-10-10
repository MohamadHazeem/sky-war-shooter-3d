import { describe, it, expect, beforeEach } from 'vitest';
import {
  WEEKLY_MERIT, WEEKLY_MODE, WEEKLY_NOSE, claimWeekly, fmtWeekCountdown, isoWeek, msUntilNextWeek, parseWeekKey, weekKey, weekStart,
  weeklyCompletions, weeklyKeyOf, weeklyMission, weeklyMode, weeklyScenario, weeklySeed, type WeeklyTarget,
} from '../src/game/Weekly';
import { sanitizeConfig } from '../src/game/CustomBattle';
import { leaderboardMode, modeFor } from '../src/game/Modes';
import { isBossRound, roundDef } from '../src/game/Missions';
import { COLLECTABLES } from '../src/game/Customize';
import { rollCrate } from '../src/game/Loot';
import { Progression } from '../src/game/Upgrades';
import { seedRandom, stubStorage } from './helpers';

beforeEach(() => { stubStorage(); });

// the leaderboard modes firestore.rules accepts
const RULES = /^(survival-(gunner|pilot)|campaign-m[0-9]{1,2}|daily-(gunner|pilot)-[0-9]{8}|weekly-(gunner|pilot)-[0-9]{6}|(acehunt|timeattack)-(gunner|pilot))$/;
const utc = (y: number, mo: number, d: number, h = 12) => new Date(Date.UTC(y, mo - 1, d, h));

describe('ISO week seeding', () => {
  it('numbers weeks the ISO way, across year boundaries', () => {
    expect(isoWeek(utc(2026, 10, 10))).toEqual({ year: 2026, week: 41 });
    expect(isoWeek(utc(2026, 10, 5, 0))).toEqual({ year: 2026, week: 41 });    // Monday 00:00
    expect(isoWeek(utc(2026, 10, 4, 23))).toEqual({ year: 2026, week: 40 });   // Sunday night
    expect(isoWeek(utc(2021, 1, 3))).toEqual({ year: 2020, week: 53 });
    expect(isoWeek(utc(2024, 12, 30))).toEqual({ year: 2025, week: 1 });
    expect(isoWeek(utc(2026, 12, 31))).toEqual({ year: 2026, week: 53 });
    expect(isoWeek(utc(2027, 1, 1))).toEqual({ year: 2026, week: 53 });
    expect(isoWeek(utc(2027, 1, 4))).toEqual({ year: 2027, week: 1 });
  });

  it('week keys are yyyyww and round-trip to the Monday that starts the week', () => {
    expect(weekKey(utc(2026, 10, 10))).toBe('202641');
    expect(weekKey(utc(2027, 1, 8))).toBe('202701');
    expect(parseWeekKey('202641')).toEqual({ year: 2026, week: 41 });
    expect(parseWeekKey('202660')).toBeNull();
    expect(parseWeekKey('2026-41')).toBeNull();
    expect(weekStart(2026, 41).toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(weekStart(2020, 53).toISOString()).toBe('2020-12-28T00:00:00.000Z');
    for (let d = 0; d < 800; d += 3) {
      const t = new Date(Date.UTC(2025, 0, 1) + d * 86400000 + 5 * 3600000);
      const { year, week } = isoWeek(t);
      const s = weekStart(year, week).getTime();
      expect(t.getTime()).toBeGreaterThanOrEqual(s);
      expect(t.getTime()).toBeLessThan(s + 7 * 86400000);
    }
  });

  it('counts down to next Monday 00:00 UTC', () => {
    expect(msUntilNextWeek(utc(2026, 10, 10, 12))).toBe(36 * 3600000);
    expect(msUntilNextWeek(utc(2026, 10, 5, 0))).toBe(7 * 86400000);
    expect(fmtWeekCountdown(36 * 3600000 + 5 * 60000)).toBe('1d 12h 05m');
    expect(fmtWeekCountdown(3 * 3600000)).toBe('3h 00m');
  });

  it('one scenario per week: the same for everyone, different from week to week', () => {
    expect(weeklyScenario('202641')).toEqual(weeklyScenario('202641'));
    const heads = new Set<string>(), ops = new Set<string>();
    for (let w = 1; w <= 52; w++) {
      const key = `2027${String(w).padStart(2, '0')}`;
      const s = weeklyScenario(key);
      heads.add(s.headline); ops.add(s.operation);
      expect(s.week).toBe(w);
      expect(s.headline).toMatch(new RegExp(`^Week ${w}: Operation .+ — \\d rounds, `));
      // the generator only produces valid custom-battle settings
      expect(sanitizeConfig({ ...s.config, role: 'gunner' })).toEqual({ ...s.config, role: 'gunner' });
      expect(s.config.rounds).toBeGreaterThanOrEqual(3);
      expect(s.config.rounds).toBeLessThanOrEqual(6);
      if (s.config.boss) expect(s.headline).toContain(`boss in round ${s.config.rounds}`);
    }
    expect(heads.size).toBe(52);
    expect(ops.size).toBeGreaterThan(10);
    expect(weeklySeed('202641', 'gunner')).toBe(weeklySeed('202641', 'gunner'));
    expect(weeklySeed('202641', 'gunner')).not.toBe(weeklySeed('202641', 'pilot'));
    expect(weeklySeed('202641', 'gunner')).not.toBe(weeklySeed('202642', 'gunner'));
  });

  it('builds the week\'s mission on its own allowed leaderboard', () => {
    for (const role of ['gunner', 'pilot'] as const) {
      const m = weeklyMission(role, '202641'), s = weeklyScenario('202641');
      expect(m.id).toBe(`weekly-${role}-202641`);
      expect(weeklyKeyOf(m)).toBe('202641');
      expect(modeFor(m)).toBe(WEEKLY_MODE);
      expect(leaderboardMode(m)).toBe(weeklyMode(role, '202641'));
      expect(leaderboardMode(m)).toMatch(RULES);
      expect(leaderboardMode(m)!.length).toBeLessThanOrEqual(40);
      expect(m.rounds).toBe(s.config.rounds);
      expect(m.enemyTypes).toEqual(s.config.enemies);
      expect(m.weather!.mood).toBe(s.config.mood);
      expect(roundDef(m, 0).duration).toBe(s.config.roundLength);
      for (let i = 0; i < s.config.rounds; i++) expect(isBossRound(m, i)).toBe(s.config.boss && i === s.config.rounds - 1);
    }
    expect(WEEKLY_MODE.board('gunner')).toMatch(RULES);
    expect(weeklyKeyOf({ id: 'survival-gunner' })).toBeNull();
  });
});

describe('weekly reward', () => {
  const target = (): WeeklyTarget & { merit: number } => {
    const t = { unlocked: new Set<string>(), merit: 0, earn(n: number) { t.merit += n; }, unlock(id: string) { t.unlocked.add(id); return true; } };
    return t;
  };

  it('pays merit, the week ribbon and (once) the weekly-only nose art on the first completion of each week', () => {
    const p = target();
    expect(claimWeekly(weeklyMission('gunner', '202641'), false, p)).toBeNull();
    expect(claimWeekly({ id: 'custom-gunner' }, true, p)).toBeNull();
    const r = claimWeekly(weeklyMission('gunner', '202641'), true, p)!;
    expect(r).toMatchObject({ key: '202641', merit: WEEKLY_MERIT, ribbon: 'weekly:202641', nose: true });
    expect(p.unlocked.has(WEEKLY_NOSE)).toBe(true);
    expect(claimWeekly(weeklyMission('pilot', '202641'), true, p)).toBeNull();   // once a week, either role
    const r2 = claimWeekly(weeklyMission('pilot', '202642'), true, p)!;
    expect(r2.nose).toBe(false);
    expect(p.merit).toBe(2 * WEEKLY_MERIT);
    expect(weeklyCompletions(p)).toBe(2);
  });

  it('works through Progression.unlock, and the nose art never drops from crates', () => {
    const prog = new Progression();
    expect(claimWeekly(weeklyMission('gunner', '202641'), true, prog)).not.toBeNull();
    expect(prog.unlocked.has(WEEKLY_NOSE)).toBe(true);
    expect(COLLECTABLES.find((c) => c.key === WEEKLY_NOSE)?.exclusive).toBeTruthy();
    stubStorage();   // a new player
    seedRandom(9);
    const fresh = new Progression();
    for (let i = 0; i < 400; i++) rollCrate(fresh, 'legendary');
    expect(fresh.unlocked.has(WEEKLY_NOSE)).toBe(false);
  });
});
