import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { Combo, COMBO_MAX, COMBO_WINDOW } from '../src/game/Combo';
import { CombatTally } from '../src/game/CombatTally';
import { KeyAim } from '../src/game/KeyAim';
import { STATIONS, STATION_ORDER, wrapAngle, inArc, dirFromYawPitch } from '../src/world/B17Layout';
import type { Input } from '../src/core/Input';
import { stubStorage } from './helpers';

describe('Combo', () => {
  let c: Combo;
  beforeEach(() => { c = new Combo(); });

  it('kills and hits raise the multiplier, capped at COMBO_MAX', () => {
    c.onKill();
    expect(c.mult).toBeCloseTo(1.5, 10);
    c.onHit();
    expect(c.mult).toBeCloseTo(1.52, 10);
    for (let i = 0; i < 10; i++) c.onKill();
    expect(c.mult).toBe(COMBO_MAX);
  });

  it('holds for the window, then decays back to x1', () => {
    c.onKill();
    expect(c.fraction).toBe(1);
    for (let t = 0; t < COMBO_WINDOW - 0.1; t += 0.1) c.update(0.1);
    expect(c.mult).toBeCloseTo(1.5, 10);
    expect(c.fraction).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) c.update(0.1);
    expect(c.mult).toBeLessThan(1.5);
    for (let i = 0; i < 100; i++) c.update(0.1);
    expect(c.mult).toBe(1);
    expect(c.fraction).toBe(0);
  });

  it('a new hit refreshes the hold', () => {
    c.onKill();
    c.update(COMBO_WINDOW - 1);
    c.onHit();
    expect(c.fraction).toBe(1);
    c.reset();
    expect(c.mult).toBe(1);
    expect(c.fraction).toBe(0);
  });
});

describe('CombatTally', () => {
  it('tracks best streak, closest kill and kills per gun in crew order', () => {
    const t = new CombatTally();
    t.recordKill(1, 400, STATIONS.tail);
    t.recordKill(3, 120, STATIONS.waistL);
    t.recordKill(2, 250, STATIONS.tail);
    t.recordKill(1, 90, null);
    expect(t.bestStreak).toBe(3);
    expect(t.closestKill).toBe(90);
    expect(t.killsByGun()).toEqual([{ label: 'Left Waist', kills: 1 }, { label: 'Tail Gun', kills: 2 }]);
    t.reset();
    expect(t.killsByGun()).toEqual([]);
    expect(t.closestKill).toBe(Infinity);
  });
});

describe('KeyAim', () => {
  const fakeInput = (keys: string[]) => ({ down: (k: string) => keys.includes(k) }) as unknown as Input;

  it('a tap is gentle and a held key ramps to full deflection', () => {
    const k = new KeyAim();
    k.update(fakeInput(['ArrowRight']), 1 / 60);
    expect(k.x).toBeGreaterThanOrEqual(0.3);
    expect(k.x).toBeLessThan(0.35);
    for (let i = 0; i < 60; i++) k.update(fakeInput(['ArrowRight', 'KeyI']), 1 / 60);
    expect(k.x).toBeCloseTo(1, 10);
    expect(k.y).toBeGreaterThan(0.9);
    k.update(fakeInput([]), 1 / 60);
    expect(k.x).toBe(0);
    expect(k.y).toBe(0);
  });

  it('opposite keys cancel and left/down are negative', () => {
    const k = new KeyAim();
    k.update(fakeInput(['ArrowLeft', 'KeyL']), 0.1);
    expect(k.x).toBe(0);
    k.update(fakeInput(['KeyJ', 'KeyK']), 0.1);
    expect(k.x).toBeLessThan(0);
    expect(k.y).toBeLessThan(0);
  });
});

describe('B17Layout', () => {
  it('wrapAngle maps into [-PI, PI]', () => {
    for (const a of [0, 1, -1, 4, -4, 10 * Math.PI + 0.3, -7.5]) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThanOrEqual(-Math.PI);
      expect(w).toBeLessThanOrEqual(Math.PI);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(a), 10);
      expect(Math.sin(w)).toBeCloseTo(Math.sin(a), 10);
    }
  });

  it('dirFromYawPitch gives unit vectors and each station covers its rest direction', () => {
    for (const id of STATION_ORDER) {
      const st = STATIONS[id];
      const d = dirFromYawPitch(st.rest.yaw, st.rest.pitch);
      expect(d.length()).toBeCloseTo(1, 10);
      expect(inArc(st, d), id).toBe(true);
    }
    // the tail gun cannot fire forward, the waist guns cannot fire across the fuselage
    expect(inArc(STATIONS.tail, new THREE.Vector3(0, 0, 1))).toBe(false);
    expect(inArc(STATIONS.waistL, new THREE.Vector3(-1, 0, 0))).toBe(false);
    expect(inArc(STATIONS.waistR, new THREE.Vector3(-1, 0, 0))).toBe(true);
  });
});

describe('Achievements', () => {
  async function fresh(seed: Record<string, unknown> = {}) {
    const store = stubStorage(seed);
    vi.resetModules();
    const mod = await import('../src/game/Achievements');
    return { a: mod.achievements, store };
  }
  const mission = { playerDamaged: false, flak: { start: 0, end: 1, intensity: 1 } } as never;

  it('unlocks first blood and ace, and persists them', async () => {
    const { a, store } = await fresh();
    a.onConfirmedKill(1, 'engine');
    expect(a.has('firstBlood')).toBe(true);
    expect(a.has('ace')).toBe(false);
    a.onConfirmedKill(5, 'wingL');
    expect(a.has('ace')).toBe(true);
    expect(a.has('wingClipper')).toBe(true);
    const saved = JSON.parse(store.getItem('sws3d.achievements.v1')!);
    expect(Object.keys(saved).sort()).toEqual(['ace', 'firstBlood', 'wingClipper']);
  });

  it('mission-end checks need success, no hits and a real accuracy sample', async () => {
    const { a } = await fresh();
    a.beginMission(mission);
    a.onPlayerHit();
    a.endMission(true, 40, 39); // too few rounds for sharpshooter
    expect(a.has('flakSurvivor')).toBe(true);
    expect(a.has('untouchable')).toBe(false);
    expect(a.has('sharpshooter')).toBe(false);
    a.beginMission(mission);
    a.endMission(true, 100, 31);
    expect(a.has('untouchable')).toBe(true);
    expect(a.has('sharpshooter')).toBe(true);
  });

  it('loads earlier unlocks and ignores corrupt storage', async () => {
    expect((await fresh({ 'sws3d.achievements.v1': { survivor: 1 } })).a.has('survivor')).toBe(true);
    expect((await fresh({ 'sws3d.achievements.v1': '{oops' })).a.has('survivor')).toBe(false);
  });
});
