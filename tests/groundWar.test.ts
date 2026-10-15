import { describe, it, expect } from 'vitest';
import { freightHead, groundSortie, hasGroundAirfield, RUNWAY_V, SORTIE_PERIOD, TRAIN_LOOP, TRAIN_SPEED } from '../src/world/GroundWarMath';
import { targetUniforms, syncTargetPlumes } from '../src/render/TargetGround';
import { groundWarUniforms, syncGroundWar } from '../src/render/GroundWar';

const pose = () => ({ u: 0, v: 0, altitude: 0, visibility: 0 });
describe('ground war scenery', () => {
  it('prepares continuous, bounded plume growth without replacing uniform slots', () => {
    const u = targetUniforms, shape = u.uPlumeShape.value[0];
    u.uPlumes.value[0].set(0, 0, 10, 1.2);
    u.uTgtClock.value = 9; syncTargetPlumes();
    expect(shape.toArray()).toEqual([80, 70, 0, 0]);
    u.uTgtClock.value = 100; syncTargetPlumes();
    expect(shape.x).toBeGreaterThan(5900);
    expect(shape.x).toBeLessThan(7480);
    expect(shape.z).toBeGreaterThan(0.5);
    u.uTgtClock.value = 10000; syncTargetPlumes();
    expect(shape.x).toBeLessThanOrEqual(7480);
    expect(shape.y).toBe(175);
    expect(u.uPlumeShape.value[0]).toBe(shape);
    u.uPlumes.value[0].set(0, 0, 0, 0); syncTargetPlumes();
    expect(shape.z).toBe(0);
  });
  it('accelerates along the runway before lifting off and climbing', () => {
    const p = pose();
    groundSortie(-600 + 10, 0, p);
    expect(p).toMatchObject({ u: -1315, v: RUNWAY_V, altitude: 4, visibility: 1 });
    groundSortie(-600 + 22, 0, p);
    expect(p.altitude).toBe(4);
    const rotation = p.u;
    groundSortie(-600 + 32, 0, p);
    expect(p.altitude).toBe(234);
    expect(p.u).toBeGreaterThan(rotation);
    expect(p.v).toBeGreaterThan(RUNWAY_V);
  });
  it('hides the reset, staggers launches and repeats deterministically across negative clocks', () => {
    const a = pose(), b = pose();
    groundSortie(-600, 0, a); expect(a.visibility).toBe(0);
    groundSortie(-600 + 60, 0, a); expect(a.visibility).toBe(0);
    groundSortie(-14, 0, a); groundSortie(-14 + SORTIE_PERIOD, 0, b);
    expect(a).toEqual(b);
    groundSortie(-14, 1, b); expect(a).not.toEqual(b);
    for (let t = -1000; t < 2000; t++) {
      groundSortie(t, 2, a);
      expect(Object.values(a).every(Number.isFinite)).toBe(true);
      expect(a.visibility).toBeGreaterThanOrEqual(0);
      expect(a.visibility).toBeLessThanOrEqual(1);
    }
  });
  it('moves freight at a fixed speed and wraps outside the visible yard', () => {
    expect(freightHead(1) - freightHead(0)).toBe(TRAIN_SPEED);
    expect(freightHead(TRAIN_LOOP / TRAIN_SPEED)).toBeCloseTo(freightHead(0));
    for (const t of [-10000, -301, 0, 60, 10000]) {
      expect(freightHead(t)).toBeGreaterThanOrEqual(-3400);
      expect(freightHead(t)).toBeLessThan(3400);
    }
  });
  it('only launches from airport layouts and clears activity without replacing pooled uniforms', () => {
    expect([0,1,2,3,4,5].filter(hasGroundAirfield)).toEqual([1,3]);
    const slots = groundWarUniforms.uGroundSorties.value.slice();
    syncGroundWar(-14, 3);
    expect(slots.some(v => v.w > 0)).toBe(true);
    syncGroundWar(20, 0);
    expect(slots.every(v => v.w === 0)).toBe(true);
    slots.forEach((v, i) => expect(groundWarUniforms.uGroundSorties.value[i]).toBe(v));
  });
});
