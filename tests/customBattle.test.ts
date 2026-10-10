import { describe, it, expect, beforeEach } from 'vitest';
import {
  ALL_ENEMIES, CUSTOM_MODE, DEFAULT_CONFIG, DUSK_MAX_SUN, ENDLESS_DURATION, ESCORT_ARRIVE, SKILL_DEF, SKILLS,
  buildCustomMission, describeConfig, loadConfig, sanitizeConfig, saveConfig, type CustomConfig,
} from '../src/game/CustomBattle';
import { leaderboardMode, modeFor, roundFlakOn } from '../src/game/Modes';
import { isBossRound, roundDef } from '../src/game/Missions';
import { pickEnemyType, type EnemyType } from '../src/world/EnemyTypes';
import { mulberry32 } from '../src/game/Dailies';
import { stubStorage } from './helpers';

beforeEach(() => { stubStorage(); });

const cfg = (o: Partial<CustomConfig> = {}): CustomConfig => ({ ...DEFAULT_CONFIG, ...o });

describe('custom battle config', () => {
  it('fills a missing or broken config with the defaults', () => {
    expect(sanitizeConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(sanitizeConfig('junk')).toEqual(DEFAULT_CONFIG);
    expect(sanitizeConfig({ role: 'tank', skill: 'god', mood: 'fog', station: 'cockpit', min: 'x', boss: 1 })).toEqual(DEFAULT_CONFIG);
  });

  it('clamps numbers, orders min/max and keeps at least one valid enemy type', () => {
    const c = sanitizeConfig({ min: 30, max: -4, roundLength: 1000, rounds: 99, sunEl: 120, enemies: ['me262', 'zeppelin', 'me262'] });
    expect([c.min, c.max]).toEqual([1, 20]);
    expect(c.roundLength).toBe(360);
    expect(c.rounds).toBe(10);
    expect(c.sunEl).toBe(70);
    expect(c.enemies).toEqual(['me262']);
    expect(sanitizeConfig({ enemies: [] }).enemies.length).toBeGreaterThan(0);
    expect(sanitizeConfig({ roundLength: 100 }).roundLength).toBe(90);   // 30 s steps
  });

  it('keeps endless (0 rounds) and keeps the boss round inside the battle', () => {
    expect(sanitizeConfig({ rounds: 0 }).rounds).toBe(0);
    expect(sanitizeConfig({ rounds: 4, bossRound: 9 }).bossRound).toBe(4);
    expect(sanitizeConfig({ rounds: 0, bossRound: 4 }).bossRound).toBe(4);
    expect(sanitizeConfig({ rounds: 2, bossRound: 0 }).bossRound).toBe(1);
  });

  it('remembers the last configuration', () => {
    const c = cfg({ role: 'pilot', enemies: ['ju88', 'bf110'], min: 2, max: 5, skill: 'insane', rounds: 0, mood: 'storm', boss: true, bossRound: 2 });
    saveConfig(c);
    expect(loadConfig()).toEqual(sanitizeConfig(c));
    expect(describeConfig(loadConfig())).toContain('P-51 Escort');
  });
});

describe('config -> mission', () => {
  it('builds a round mission the round system flies', () => {
    const m = buildCustomMission(cfg({ station: 'tail', enemies: ['fw190', 'me163'], min: 4, max: 12, roundLength: 150, rounds: 4, skill: 'ace' }));
    expect(m.id).toBe('custom-gunner');
    expect(m.station).toBe('tail');
    expect(m.number).toBe(0);
    expect(m.rounds).toBe(4);
    expect(m.duration).toBe(600);
    expect(m.flatRounds).toBe(true);
    expect(m.enemyTypes).toEqual(['fw190', 'me163']);
    expect(m.round).toMatchObject({ duration: 150, min: 4, max: 12, skill: SKILL_DEF.ace.skill });
    expect(m.waves).toEqual([]);
    expect(m.briefing.length).toBeGreaterThan(0);
    // every round flies the configured numbers; later rounds get a little sharper
    let prev = 0;
    for (let i = 0; i < 4; i++) {
      const r = roundDef(m, i);
      expect(r).toMatchObject({ duration: 150, min: 4, max: 12 });
      expect(r.skill[0]).toBeGreaterThanOrEqual(prev);
      prev = r.skill[0];
    }
    expect(roundDef(m, 0).start).toBe(6);
    expect(roundDef(m, 1).start).toBe(4);
  });

  it('endless battles are not Survival: finite duration, no weather cycling, rounds without end', () => {
    const m = buildCustomMission(cfg({ rounds: 0, roundLength: 90 }));
    expect(m.rounds).toBe(Infinity);
    expect(m.duration).toBe(ENDLESS_DURATION);
    expect(Number.isFinite(m.duration)).toBe(true);
    for (const i of [0, 5, 30]) expect(roundDef(m, i).duration).toBe(90);
    expect(roundDef(m, 30).skill[1]).toBeLessThanOrEqual(SKILL_DEF.veteran.skill[1] + 0.12 + 1e-9);
  });

  it('skill scales enemy skill and the damage the player takes', () => {
    const ms = SKILLS.map((s) => buildCustomMission(cfg({ skill: s })));
    for (let i = 1; i < ms.length; i++) {
      expect(ms[i].round!.skill[0]).toBeGreaterThan(ms[i - 1].round!.skill[0]);
      expect(ms[i].playerArmor!).toBeGreaterThan(ms[i - 1].playerArmor!);
    }
  });

  it('weather mood and time of day', () => {
    const noon = buildCustomMission(cfg({ mood: 'overcast', sunEl: 60 })).weather!;
    expect(noon).toMatchObject({ mood: 'overcast', sunEl: 60, contrails: false });
    const dawn = buildCustomMission(cfg({ mood: 'clear', sunEl: 6 })).weather!;
    expect(dawn.sunEl).toBe(6);
    expect(buildCustomMission(cfg({ mood: 'dusk', sunEl: 50 })).weather!.sunEl).toBe(DUSK_MAX_SUN);
  });

  it('boss round on/off and which round', () => {
    const off = buildCustomMission(cfg({ rounds: 5, boss: false }));
    expect(off.boss).toBe(false);
    for (let i = 0; i < 5; i++) expect(isBossRound(off, i)).toBe(false);
    const on = buildCustomMission(cfg({ rounds: 5, boss: true, bossRound: 4 }));
    expect([0, 1, 2, 3, 4].map((i) => isBossRound(on, i))).toEqual([false, false, false, true, false]);
    const endless = buildCustomMission(cfg({ rounds: 0, boss: true, bossRound: 2 }));
    expect([0, 1, 2, 3, 4, 5].map((i) => isBossRound(endless, i))).toEqual([false, true, false, true, false, true]);
  });

  it('special events, flak and escorts switches', () => {
    const a = buildCustomMission(cfg({ specials: false, flak: true, escorts: true }));
    expect(a.specials).toBe(false);
    expect(a.roundFlak).toBeGreaterThan(0);
    expect(a.escortArrive).toBe(ESCORT_ARRIVE);
    expect(a.escorts).toBe(0);
    const b = buildCustomMission(cfg({ role: 'pilot', specials: true, flak: false, escorts: true }));
    expect(b.roundFlak).toBeUndefined();
    expect(b.escorts).toBeGreaterThan(0);
    expect(b.escortArrive).toBeUndefined();
    expect(buildCustomMission(cfg({ role: 'pilot', escorts: false })).escorts).toBe(0);
    const r = roundDef(a, 0);
    expect(roundFlakOn(r, r.duration * 0.1)).toBe(false);
    expect(roundFlakOn(r, r.duration * 0.5)).toBe(true);
    expect(roundFlakOn(r, r.duration * 0.9)).toBe(false);
  });

  it('sizes the final wave to the battle\'s own numbers', () => {
    const small = CUSTOM_MODE.paceFor!(buildCustomMission(cfg({ min: 2, max: 5 })));
    const big = CUSTOM_MODE.paceFor!(buildCustomMission(cfg({ min: 10, max: 20 })));
    expect(small.final).toEqual({ min: 6, max: 8 });
    expect(big.final).toEqual({ min: 24, max: 32 });
    expect(small.breather).toBe(true);
  });

  it('is a registered mode that never posts to a leaderboard', () => {
    for (const role of ['gunner', 'pilot'] as const) {
      const m = CUSTOM_MODE.mission(role);
      expect(m.role).toBe(role);
      expect(modeFor(m)).toBe(CUSTOM_MODE);
      expect(leaderboardMode(m)).toBe('');
    }
  });
});

describe('restricted enemy mix', () => {
  it('only sends the allowed types, and every allowed type turns up', () => {
    const rnd = mulberry32(42);
    for (const allowed of [['me262'], ['me163', 'ju88'], ALL_ENEMIES] as EnemyType[][]) {
      for (const tier of [0, 1, 3]) {
        const seen = new Set<EnemyType>();
        for (let i = 0; i < 400; i++) seen.add(pickEnemyType(allowed, tier, rnd));
        expect([...seen].sort()).toEqual([...allowed].sort());
      }
    }
  });
});
