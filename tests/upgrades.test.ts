import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Progression, PERKS, WEAPONS, AIRCRAFT, UPGRADES, MAX_LEVEL, upgradeCost, type PerkId,
} from '../src/game/Upgrades';
import { stubStorage, seedRandom, type MemoryStorage } from './helpers';

const KEY = 'sws3d.armory.v1';
let store: MemoryStorage;

beforeEach(() => { store = stubStorage(); });

describe('tables', () => {
  it('have unique ids and a free default per role', () => {
    for (const table of [WEAPONS, AIRCRAFT]) {
      expect(new Set(table.map((d) => d.id)).size).toBe(table.length);
      for (const role of ['gunner', 'pilot'] as const) {
        expect(table.some((d) => d.role === role && d.cost === 0)).toBe(true);
      }
    }
    expect(new Set(PERKS.map((p) => p.id)).size).toBe(PERKS.length);
    expect(new Set(UPGRADES.map((u) => u.id)).size).toBe(UPGRADES.length);
  });

  it('loadout fallbacks point at the free defaults', () => {
    // Progression.loadout falls back to WEAPONS[0]/[4] and AIRCRAFT[0]/[3]
    expect(WEAPONS[0]).toMatchObject({ role: 'gunner', cost: 0 });
    expect(WEAPONS[4]).toMatchObject({ role: 'pilot', cost: 0 });
    expect(AIRCRAFT[0]).toMatchObject({ role: 'gunner', cost: 0 });
    expect(AIRCRAFT[3]).toMatchObject({ role: 'pilot', cost: 0 });
  });

  it('upgrade costs rise and stop at MAX_LEVEL', () => {
    for (let l = 1; l < MAX_LEVEL; l++) expect(upgradeCost(l)).toBeGreaterThan(upgradeCost(l - 1));
    expect(upgradeCost(MAX_LEVEL)).toBe(Infinity);
    expect(upgradeCost(MAX_LEVEL + 3)).toBe(Infinity);
  });

  it('weapons have sane ballistics', () => {
    for (const w of WEAPONS) {
      expect(w.rate).toBeGreaterThan(0);
      expect(w.damage).toBeGreaterThan(0);
      expect(w.velocity).toBeGreaterThan(500);
      expect(w.tracerEvery).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('loadout maths', () => {
  it('is neutral for a fresh gunner and pilot', () => {
    const p = new Progression();
    const g = p.loadout();
    expect(g).toMatchObject({ damage: 1, rate: 1, heat: 1, velocity: 1, armor: 1, hitScale: 1, spread: 1, explosive: 0, scoreMult: 1 });
    expect(g.weapon.id).toBe('m2');
    expect(g.aircraft.id).toBe('b17g');
    p.role = 'pilot';
    const l = p.loadout();
    expect(l.weapon.id).toBe('p6x50');
    expect(l.aircraft.id).toBe('p51d');
  });

  it('multiplies upgrade levels with stacking perks', () => {
    const p = new Progression();
    p.levels.firepower = 3;
    p.levels.cooling = 2;
    p.levels.armor = 5;
    p.perks = ['ap', 'ap', 'cool', 'cool', 'vest'];
    const l = p.loadout();
    expect(l.damage).toBeCloseTo(1.36 * 1.5, 10);
    expect(l.heat).toBeCloseTo(0.76 * 0.36, 10);
    expect(l.armor).toBeCloseTo(0.6 * 0.8, 10);
  });

  it('explosive tips stack as independent 1-in-8 chances', () => {
    const p = new Progression();
    p.perks = ['explosive'];
    expect(p.loadout().explosive).toBeCloseTo(1 / 8, 10);
    p.perks = ['explosive', 'explosive'];
    expect(p.loadout().explosive).toBeCloseTo(15 / 64, 10);
  });

  it('applies the selected aircraft and weapon', () => {
    const p = new Progression();
    p.unlocked.add('b17f').add('hellfire');
    p.selectAircraft(AIRCRAFT.find((a) => a.id === 'b17f')!);
    p.selectWeapon(WEAPONS.find((w) => w.id === 'hellfire')!);
    const l = p.loadout();
    expect(l.armor).toBeCloseTo(1.15, 10);
    expect(l.rate).toBeCloseTo(1.1, 10);
    expect(l.traverse).toBeCloseTo(1.2, 10);
    expect(l.incendiary).toBeCloseTo(0.12, 10); // weapon beats the 0.06 perk
  });

  it('falls back to the default weapon for an unknown saved id', () => {
    const p = new Progression();
    (p.weapon as Record<string, string>).gunner = 'laser';
    expect(p.loadout().weapon.id).toBe('m2');
  });
});

describe('perk awarding', () => {
  it('never hands out a non-stacking perk twice', () => {
    seedRandom(42);
    const p = new Progression();
    for (let i = 0; i < 300; i++) p.award();
    for (const def of PERKS.filter((d) => !d.stack)) {
      expect(p.perks.filter((x) => x === def.id).length).toBeLessThanOrEqual(1);
    }
    expect(p.perks.length).toBe(300);
  });

  it('only offers stacking perks once every unique one is held', () => {
    const p = new Progression();
    p.perks = PERKS.filter((d) => !d.stack).map((d) => d.id);
    const stacking = new Set<PerkId>(PERKS.filter((d) => d.stack).map((d) => d.id));
    seedRandom(7);
    for (let i = 0; i < 50; i++) expect(stacking.has(p.award().id)).toBe(true);
  });

  it('records the awarded perk', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const p = new Progression();
    const got = p.award();
    expect(got.id).toBe(PERKS[0].id);
    expect(p.perks).toEqual([PERKS[0].id]);
  });
});

describe('buying and unlocking', () => {
  it('buy charges the level cost and caps at MAX_LEVEL', () => {
    const p = new Progression();
    expect(p.buy('gyro')).toBe(false);
    expect(p.levels.gyro).toBe(0);
    p.points = 100000;
    let spent = 0;
    for (let l = 0; l < MAX_LEVEL; l++) { spent += upgradeCost(l); expect(p.buy('gyro')).toBe(true); }
    expect(p.levels.gyro).toBe(MAX_LEVEL);
    expect(p.points).toBe(100000 - spent);
    expect(p.buy('gyro')).toBe(false);
    expect(p.levels.gyro).toBe(MAX_LEVEL);
  });

  it('unlock charges once and refuses when short', () => {
    const p = new Progression();
    p.points = 2000;
    expect(p.unlock('hispano', 2500)).toBe(false);
    expect(p.unlocked.has('hispano')).toBe(false);
    expect(p.unlock('stinger', 1500)).toBe(true);
    expect(p.points).toBe(500);
    expect(p.unlock('stinger', 1500)).toBe(true); // already owned: free
    expect(p.points).toBe(500);
  });

  it('cannot select a locked weapon or aircraft', () => {
    const p = new Progression();
    p.selectWeapon(WEAPONS.find((w) => w.id === 'hispano')!);
    p.selectAircraft(AIRCRAFT.find((a) => a.id === 'yb40')!);
    expect(p.weapon.gunner).toBe('m2');
    expect(p.aircraft.gunner).toBe('b17g');
  });

  it('earn rounds and ignores negatives', () => {
    const p = new Progression();
    p.earn(10.6);
    p.earn(-50);
    expect(p.points).toBe(11);
  });
});

describe('save / load', () => {
  it('round-trips through localStorage', () => {
    const a = new Progression();
    a.points = 5000;
    a.buy('rate');
    a.unlock('p51h', 1800);
    a.selectAircraft(AIRCRAFT.find((x) => x.id === 'p51h')!);
    a.perks = ['ap']; // per-mission, must not persist
    a.save();
    const b = new Progression();
    expect(b.points).toBe(a.points);
    expect(b.levels.rate).toBe(1);
    expect(b.unlocked.has('p51h')).toBe(true);
    expect(b.unlocked.has('m2')).toBe(true);
    expect(b.aircraft.pilot).toBe('p51h');
    expect(b.perks).toEqual([]);
  });

  it('migrates the retired belts/reload upgrades', () => {
    store.setItem(KEY, JSON.stringify({ points: 7, levels: { belts: 2, reload: 3, firepower: 1 } }));
    const p = new Progression();
    expect(p.levels.velocity).toBe(2);
    expect(p.levels.gyro).toBe(3);
    expect(p.levels.firepower).toBe(1);
    expect('belts' in p.levels).toBe(false);
    expect('reload' in p.levels).toBe(false);
  });

  it('does not let a stale belts level overwrite velocity', () => {
    store.setItem(KEY, JSON.stringify({ levels: { belts: 4, velocity: 1 } }));
    expect(new Progression().levels.velocity).toBe(1);
  });

  it('survives corrupt data and missing storage', () => {
    store.setItem(KEY, '{not json');
    expect(new Progression().points).toBe(0);
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    });
    const p = new Progression();
    expect(p.points).toBe(0);
    expect(() => p.earn(5)).not.toThrow();
  });
});
