import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CAMPAIGN } from '../src/game/Missions';
import { PILOT_ROUNDS } from '../src/game/PilotRounds';
import { ENEMY_VARIANTS } from '../src/world/EnemyTypes';
import { FlightModel, P51_PARAMS } from '../src/world/FlightModel';
import { steerTo } from '../src/world/AI';

describe('scripted P-51 rounds', () => {
  it('cover exactly the campaign pilot missions that list them, one per round', () => {
    for (const [id, rounds] of Object.entries(PILOT_ROUNDS)) {
      const m = CAMPAIGN.find((c) => c.id === id);
      expect(m, id).toBeDefined();
      expect(m!.role).toBe('pilot');
      expect(rounds.length).toBe(m!.rounds);
    }
    expect(PILOT_ROUNDS.m4).toBeDefined();
    expect(PILOT_ROUNDS.m7).toBeDefined();
  });

  it('m4 and m7 each fly an intercept, a sweep and a straggler round', () => {
    for (const id of ['m4', 'm7']) expect(PILOT_ROUNDS[id].map((r) => r.kind)).toEqual(['intercept', 'sweep', 'straggler']);
  });

  it('every group is well formed', () => {
    for (const [id, rounds] of Object.entries(PILOT_ROUNDS)) {
      for (const r of rounds) {
        expect(r.groups.length, id).toBeGreaterThan(0);
        expect(r.maxTime).toBeGreaterThan(60);
        if (r.kind === 'straggler') {
          expect(r.straggleAt).toBeGreaterThan(0);
          expect(r.holdFor).toBeGreaterThan(0);
          expect(r.straggleAt! + r.holdFor!).toBeLessThan(r.maxTime);
          // someone actually goes for her, after she falls out
          const onHer = r.groups.filter((g) => g.goal === 'straggler');
          expect(onHer.length).toBeGreaterThan(0);
          for (const g of onHer) expect(g.afterClear || g.at > r.straggleAt!).toBe(true);
        } else {
          expect(r.groups.some((g) => g.goal === 'straggler')).toBe(false);
        }
        for (const g of r.groups) {
          expect(g.types.length).toBeGreaterThan(0);
          for (const t of g.types) expect(ENEMY_VARIANTS[t], t).toBeDefined();
          expect(g.at).toBeGreaterThanOrEqual(0);
          expect(g.skill).toBeGreaterThan(0.5);
          expect(g.skill).toBeLessThan(1.6);
          if (g.pairs) expect(g.goal).toBe('player');
        }
        // timed groups come in order
        const timed = r.groups.filter((g) => !g.afterClear).map((g) => g.at);
        expect([...timed].sort((a, b) => a - b)).toEqual(timed);
      }
    }
  });
});

describe('FlightModel specific force (cockpit head lean)', () => {
  it('reads about one g up in level flight and more in a pull', () => {
    const fm = new FlightModel(P51_PARAMS, new THREE.Vector3(0, 6000, 0), new THREE.Quaternion());
    fm.vel.set(0, 0, 180);
    for (let i = 0; i < 20 * 60; i++) { steerTo(fm, new THREE.Vector3(0, 0, 1)); fm.step(1 / 60); }
    expect(fm.load.y).toBeGreaterThan(8.5);
    expect(fm.load.y).toBeLessThan(11);
    expect(Math.abs(fm.load.x)).toBeLessThan(1);
    fm.pitch = 1;
    for (let i = 0; i < 30; i++) fm.step(1 / 60);
    expect(fm.load.length()).toBeGreaterThan(25);
  });
});
