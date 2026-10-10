import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { leadPoint, steerTo } from '../src/world/AI';
import { FlightModel, P51_PARAMS } from '../src/world/FlightModel';
import type { Aircraft } from '../src/world/Aircraft';
import { seedRandom } from './helpers';

const G = 9.81;
const ac = (pos: THREE.Vector3, vel: THREE.Vector3) => ({ pos, vel }) as unknown as Aircraft;

describe('leadPoint', () => {
  it('a stationary target needs only gravity compensation', () => {
    const out = leadPoint(new THREE.Vector3(), new THREE.Vector3(), ac(new THREE.Vector3(0, 0, 800), new THREE.Vector3()), 800);
    expect(out.x).toBeCloseTo(0, 10);
    expect(out.z).toBeCloseTo(800, 10);
    expect(out.y).toBeCloseTo(0.5 * G * 1 * 1, 6); // 1 s time of flight
  });

  it('leads a crossing target so bullet and target arrive together', () => {
    const muzzle = 870;
    const tPos = new THREE.Vector3(0, 0, 600), tVel = new THREE.Vector3(120, 0, 0);
    const out = leadPoint(new THREE.Vector3(), new THREE.Vector3(), ac(tPos, tVel), muzzle);
    const t = Math.hypot(out.x, out.z) / muzzle;  // flight time to the aim point (gravity part aside)
    expect(out.x).toBeGreaterThan(0);              // aims ahead of the target
    expect(out.x).toBeCloseTo(120 * t, 0);         // target has moved exactly that far
    expect(out.y).toBeCloseTo(0.5 * G * t * t, 1);
  });

  it('uses relative velocity: matching the target\'s motion needs no lead', () => {
    const v = new THREE.Vector3(30, 5, 150);
    const out = leadPoint(new THREE.Vector3(0, 0, 0), v, ac(new THREE.Vector3(50, 20, 400), v.clone()), 850);
    expect(out.x).toBeCloseTo(50, 10);
    expect(out.z).toBeCloseTo(400, 10);
    expect(out.y).toBeGreaterThan(20);
  });

  it('writes into the provided vector and leaves the inputs alone', () => {
    const shooter = new THREE.Vector3(1, 2, 3), tp = new THREE.Vector3(100, 0, 500);
    const target = new THREE.Vector3();
    const res = leadPoint(shooter, new THREE.Vector3(), ac(tp, new THREE.Vector3(10, 0, 0)), 800, target);
    expect(res).toBe(target);
    expect(shooter.toArray()).toEqual([1, 2, 3]);
    expect(tp.toArray()).toEqual([100, 0, 500]);
  });
});

describe('steerTo', () => {
  const fmAt = (q = new THREE.Quaternion()) => {
    const fm = new FlightModel(P51_PARAMS, new THREE.Vector3(0, 5000, 0), q);
    fm.vel.set(0, 0, 170).applyQuaternion(q);
    return fm;
  };

  it('keeps every output within its stick range for random attitudes and targets', () => {
    seedRandom(99);
    const rnd = () => Math.random() * 2 - 1;
    for (let i = 0; i < 2000; i++) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI));
      const fm = fmAt(q);
      const dir = new THREE.Vector3(rnd(), rnd(), rnd());
      if (dir.lengthSq() < 1e-6) continue;
      const maxPull = 0.5 + Math.random() * 0.5;
      const off = steerTo(fm, dir, 0.5 + Math.random(), maxPull);
      for (const v of [fm.roll, fm.yaw]) { expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1); }
      expect(fm.pitch).toBeGreaterThanOrEqual(-0.6);
      expect(fm.pitch).toBeLessThanOrEqual(maxPull);
      expect(off).toBeCloseTo(fm.forward().angleTo(dir), 6);
    }
  });

  it('banks toward the target side and pulls toward a target above', () => {
    // body frame: +X is the left wing, so world -X is to the right
    const right = fmAt(); steerTo(right, new THREE.Vector3(-1, 0, 0.2));
    const left = fmAt(); steerTo(left, new THREE.Vector3(1, 0, 0.2));
    const up = fmAt(); steerTo(up, new THREE.Vector3(0, 1, 0.3));
    const ahead = fmAt(); const off = steerTo(ahead, new THREE.Vector3(0, 0, 1));
    expect(right.roll).toBeGreaterThan(0.5);
    expect(left.roll).toBeLessThan(-0.5);
    expect(up.pitch).toBeGreaterThan(0.5);
    expect(Math.abs(up.roll)).toBeLessThan(0.1);
    expect(off).toBeCloseTo(0, 10);
    expect(Math.abs(ahead.roll)).toBeLessThan(1e-9);
    expect(Math.abs(ahead.yaw)).toBeLessThan(1e-9);
  });

  it('flies the aircraft onto a heading 90 degrees away', () => {
    const fm = fmAt();
    const goal = new THREE.Vector3(-1, 0, 0);
    let off = Math.PI;
    for (let i = 0; i < 25 * 60; i++) { off = steerTo(fm, goal); fm.step(1 / 60); }
    expect(off).toBeLessThan(0.1);
    expect(Math.abs(fm.pos.y - 5000)).toBeLessThan(800);
  });
});
