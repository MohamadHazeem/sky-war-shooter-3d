import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FlightModel, P51_PARAMS, FW190_PARAMS, type FlightParams } from '../src/world/FlightModel';
import { ENEMY_VARIANTS } from '../src/world/EnemyTypes';
import { steerTo } from '../src/world/AI';
import { seedRandom } from './helpers';

const DT = 1 / 60;

function plane(p: FlightParams, speed = 170, alt = 6000) {
  const fm = new FlightModel(p, new THREE.Vector3(0, alt, 0), new THREE.Quaternion());
  fm.vel.set(0, 0, speed); // nose is +Z
  return fm;
}

const finite = (fm: FlightModel) =>
  [fm.pos.x, fm.pos.y, fm.pos.z, fm.vel.x, fm.vel.y, fm.vel.z, fm.quat.x, fm.quat.y, fm.quat.z, fm.quat.w,
    fm.omega.x, fm.omega.y, fm.omega.z, fm.alpha, fm.gLoad, fm.speed].every(Number.isFinite);

describe('FlightModel', () => {
  it('flies a steady, straight path with the instructor holding the nose on the horizon', () => {
    const fm = plane(P51_PARAMS);
    const ahead = new THREE.Vector3(0, 0, 1);
    let minVy = Infinity, maxVy = -Infinity;
    for (let i = 0; i < 60 / DT; i++) {
      steerTo(fm, ahead);
      fm.step(DT);
      if (i > 10 / DT) { minVy = Math.min(minVy, fm.vel.y); maxVy = Math.max(maxVy, fm.vel.y); }
    }
    expect(finite(fm)).toBe(true);
    expect(maxVy - minVy).toBeLessThan(1);            // no phugoid: the path is steady
    expect(Math.abs(fm.vel.y)).toBeLessThan(8);       // nose level = a shallow glide at most
    expect(Math.abs(fm.pos.x)).toBeLessThan(1);       // no wandering sideways
    expect(fm.speed).toBeGreaterThan(150);            // settles at a sensible cruise
    expect(fm.speed).toBeLessThan(220);
    expect(fm.alpha).toBeGreaterThan(0);              // flying on positive lift
    expect(fm.stalled).toBe(false);
    expect(fm.forward().z).toBeGreaterThan(0.999);
  });

  it('holds altitude in level flight with a simple altitude-hold loop', () => {
    const fm = plane(P51_PARAMS, 180);
    const dir = new THREE.Vector3();
    let worst = 0;
    for (let i = 0; i < 60 / DT; i++) {
      const climb = THREE.MathUtils.clamp((6000 - fm.pos.y) * 0.002 - fm.vel.y * 0.01 + 0.03, -0.2, 0.2);
      steerTo(fm, dir.set(0, climb, 1));
      fm.step(DT);
      if (i > 20 / DT) worst = Math.max(worst, Math.abs(fm.pos.y - 6000));
    }
    expect(worst).toBeLessThan(30);
    expect(Math.abs(fm.vel.y)).toBeLessThan(1);
    expect(fm.up().y).toBeGreaterThan(0.999);         // wings level
  });

  it('settles hands-off without diverging', () => {
    const fm = plane(FW190_PARAMS);
    for (let i = 0; i < 20 / DT; i++) fm.step(DT);
    expect(finite(fm)).toBe(true);
    expect(fm.speed).toBeGreaterThan(80);
    expect(fm.speed).toBeLessThan(300);
  });

  it('the limiter keeps a full pull below the stall and max G', () => {
    for (const p of [P51_PARAMS, FW190_PARAMS]) {
      const fm = plane(p, 200);
      fm.pitch = 1;
      for (let i = 0; i < 8 / DT; i++) {
        fm.step(DT);
        expect(fm.alpha).toBeLessThan(p.alphaStall);
        expect(fm.gLoad).toBeLessThanOrEqual(p.maxG + 1e-9);
        expect(fm.stalled).toBe(false);
      }
    }
  });

  it('without the limiter a slow full pull stalls, and lift never exceeds max G', () => {
    const fm = plane(P51_PARAMS, 70);
    fm.limiter = false;
    fm.throttle = 0;
    fm.pitch = 1;
    let stalled = false;
    for (let i = 0; i < 10 / DT; i++) {
      fm.step(DT);
      stalled ||= fm.stalled;
      expect(fm.gLoad).toBeLessThanOrEqual(P51_PARAMS.maxG + 1e-9);
      expect(fm.gLoad).toBeGreaterThanOrEqual(-P51_PARAMS.maxG * 0.5 - 1e-9);
    }
    expect(stalled).toBe(true);
  });

  it('produces no NaN over 60 s of random stick for every airframe', () => {
    seedRandom(1234);
    const params: FlightParams[] = [P51_PARAMS, ...Object.values(ENEMY_VARIANTS).map((v) => v.params)];
    for (const p of params) {
      for (const limiter of [true, false]) {
        const fm = plane(p, 150);
        fm.limiter = limiter;
        for (let i = 0; i < 60 / DT; i++) {
          if (i % 30 === 0) {
            fm.pitch = Math.random() * 2 - 1; fm.roll = Math.random() * 2 - 1; fm.yaw = Math.random() * 2 - 1;
            fm.throttle = Math.random();
          }
          fm.step(DT);
        }
        expect(finite(fm), `power ${p.power} limiter ${limiter}`).toBe(true);
        expect(fm.quat.length()).toBeCloseTo(1, 6);
      }
    }
  });

  it('survives a standing start and a huge time step', () => {
    const fm = plane(P51_PARAMS, 0);
    for (let i = 0; i < 600; i++) fm.step(DT);
    fm.step(0.5);
    expect(finite(fm)).toBe(true);
  });
});
