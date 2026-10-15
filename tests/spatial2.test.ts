import { describe, expect, it } from 'vitest';
import {
  ListenerMotion, doppler2, passBy, hrtfScore, pickHrtf, occlusion, SKIN, compartmentOf, ROOMS, isStation,
  FlakRumble, ENGINE_ORDERS, engineHarmonics, rpmFor, bomberRpm, SPATIAL_DETAIL,
} from '../src/audio/Spatial2';
import { doppler, SPEED_OF_SOUND } from '../src/audio/Acoustics';
import { PHRASES } from '../src/i18n/phrases';

describe('relative Doppler', () => {
  it('equals the old one-ended Doppler for a still listener', () => {
    for (const v of [-300, -50, 0, 80, 200, 260]) expect(doppler2(v, 0)).toBeCloseTo(doppler(v), 10);
  });
  it('a wingman holding station has no pitch shift', () => {
    // bomber flies +Z at 75 m/s; a fighter 100 m ahead flying the same course: the source moves
    // away from the listener at 75 (vs = -75), the listener closes on it at 75 (vl = +75)
    expect(doppler2(-75, 75)).toBeCloseTo(1, 2);
  });
  it('head-on closing raises the pitch more than either end alone, and stays bounded', () => {
    const both = doppler2(150, 75);
    expect(both).toBeGreaterThan(doppler2(150, 0));
    expect(both).toBeGreaterThan(doppler2(0, 75));
    expect(doppler2(5000, 5000)).toBeLessThanOrEqual(3.2);
    expect(doppler2(-5000, -5000)).toBeGreaterThanOrEqual(0.3);
    expect(Number.isFinite(doppler2(NaN, NaN))).toBe(true);
    expect(doppler2(0, 0)).toBe(1);
    expect(SPEED_OF_SOUND).toBe(343);
  });
});

describe('ListenerMotion', () => {
  it('converges on the camera velocity', () => {
    const m = new ListenerMotion();
    for (let i = 0; i <= 120; i++) m.update(0, 0, 75 * i / 60, i / 60);
    expect(m.vz).toBeCloseTo(75, 0);
    expect(Math.abs(m.vx) + Math.abs(m.vy)).toBeLessThan(1e-6);
  });
  it('ignores teleports (floating origin, camera cuts) and bad samples', () => {
    const m = new ListenerMotion();
    for (let i = 0; i <= 60; i++) m.update(0, 0, 75 * i / 60, i / 60);
    const before = m.vz;
    m.update(0, 0, 5000, 61 / 60);         // a 5 km jump in one frame
    expect(m.vz).toBeCloseTo(before, 6);
    m.update(NaN, 0, 0, 62 / 60);
    m.update(0, 0, 5000, 62 / 60);          // same timestamp: no division by zero
    expect(Number.isFinite(m.vz)).toBe(true);
    m.reset();
    expect(m.vx + m.vy + m.vz).toBe(0);
  });
});

describe('pass-by HRTF', () => {
  it('finds the closest approach of a crossing fighter', () => {
    // 600 m ahead, 40 m to the side, closing at 200 m/s
    const p = passBy(40, 0, 600, 0, 0, -200);
    expect(p.tca).toBeCloseTo(3, 6);
    expect(p.miss).toBeCloseTo(40, 6);
    const gone = passBy(40, 0, -600, 0, 0, -200);
    expect(gone.tca).toBeLessThan(0);
    expect(gone.miss).toBeCloseTo(Math.hypot(40, 600), 6);
    expect(passBy(10, 0, 0, 0, 0, 0).tca).toBe(Infinity);
  });
  it('a fighter about to pass close outranks a nearer one flying away', () => {
    const incoming = passBy(30, 0, 700, 0, 0, -220);
    const leaving = passBy(0, 0, -400, 0, 0, -150);
    const a = hrtfScore(700, incoming.tca, incoming.miss);
    const b = hrtfScore(400, leaving.tca, leaving.miss);
    expect(a).toBeGreaterThan(b);
    expect(hrtfScore(1500, 1, 10)).toBe(0);
    expect(hrtfScore(NaN, 1, 10)).toBe(0);
  });
  it('picks the k best with hysteresis and no flip-flop', () => {
    const on = new Uint8Array(6);
    const was = new Uint8Array(6);
    expect(pickHrtf([0.2, 0.9, 0, 0.5, 0.01, 0.3], 6, 2, was, on)).toBe(2);
    expect([...on]).toEqual([0, 1, 0, 1, 0, 0]);
    // slot 5 edges past slot 3 by a hair: slot 3 keeps its panner
    was.set(on);
    pickHrtf([0.2, 0.9, 0, 0.5, 0.01, 0.55], 6, 2, was, on);
    expect([...on]).toEqual([0, 1, 0, 1, 0, 0]);
    // nothing worth it: no panner
    pickHrtf([0, 0, 0.01, 0, 0, 0], 6, 4, new Uint8Array(6), on);
    expect(on.reduce((s, x) => s + x, 0)).toBe(0);
  });
  it('Reduced detail keeps one HRTF fighter and drops the harmonics', () => {
    expect(SPATIAL_DETAIL.reduced.hrtfFighters).toBe(1);
    expect(SPATIAL_DETAIL.normal.hrtfFighters).toBeGreaterThan(SPATIAL_DETAIL.reduced.hrtfFighters);
    expect(SPATIAL_DETAIL.reduced.harmonics).toBe(false);
    expect(SPATIAL_DETAIL.reduced.compartmentIRs).toBe(false);
  });
});

describe('station occlusion', () => {
  it('the left waist hears the left side through the open window, the right side through the skin', () => {
    const left = occlusion('waistL', 1, 0, 0);
    const right = occlusion('waistR', 1, 0, 0);
    expect(left.gain).toBe(1); expect(left.lp).toBe(1);
    // the far window still lets something in, more than solid skin
    expect(right.gain).toBeGreaterThan(SKIN.gain); expect(right.lp).toBeGreaterThan(SKIN.lp);
    expect(right.gain).toBeLessThan(1);
    const nose = occlusion('waistL', 0, 0, 1);
    expect(nose.lp).toBeLessThan(0.5);
  });
  it('turrets and the tail are open where their glazing looks', () => {
    expect(occlusion('top', 0, 1, 0).lp).toBeGreaterThan(occlusion('top', 0, -1, 0).lp);
    expect(occlusion('ball', 0, -1, 0).gain).toBeGreaterThan(occlusion('ball', 0, 1, 0).gain);
    expect(occlusion('tail', 0, 0, -1).lp).toBeGreaterThan(occlusion('tail', 0, 0, 1).lp);
    expect(occlusion('tail', 0, 0, 1)).toEqual({ gain: SKIN.gain, lp: SKIN.lp });
  });
  it('is smooth and safe', () => {
    let prev = occlusion('waistL', 1, 0, 0).gain;
    for (let a = -Math.PI; a <= 0; a += 0.05) {
      const g = occlusion('waistL', -Math.cos(a), 0, Math.sin(a)).gain;
      expect(Math.abs(g - prev)).toBeLessThan(0.08);
      prev = g;
    }
    expect(occlusion('waistR', 0, 0, 0)).toEqual({ gain: 1, lp: 1 });
    const out = { gain: 0, lp: 0 };
    expect(occlusion('ball', 0, -3, 0, out)).toBe(out);
    expect(isStation('ball')).toBe(true);
    expect(isStation('pilot')).toBe(false);
    expect(isStation(null)).toBe(false);
  });
});

describe('compartments', () => {
  it('each station gets its own room, smaller rooms are shorter and duller', () => {
    expect(compartmentOf('waistL')).toBe('waist');
    expect(compartmentOf('waistR')).toBe('waist');
    expect(compartmentOf('top')).toBe('flightDeck');
    expect(compartmentOf('ball')).toBe('ball');
    expect(compartmentOf('tail')).toBe('tail');
    expect(compartmentOf(null)).toBe('outside');
    expect(ROOMS.outside.send).toBe(0);
    expect(ROOMS.ball.length).toBeLessThan(ROOMS.tail.length);
    expect(ROOMS.tail.length).toBeLessThan(ROOMS.waist.length);
    expect(ROOMS.ball.damp).toBeLessThan(ROOMS.waist.damp);
    expect(ROOMS.ball.send).toBeLessThan(ROOMS.waist.send);
    for (const r of Object.values(ROOMS)) expect(r.predelay).toBeLessThan(0.1);   // the DelayNode's maximum
  });
});

describe('flak rumble', () => {
  it('builds with a barrage, darkens with distance and dies away', () => {
    const near = new FlakRumble(), far = new FlakRumble();
    for (let i = 0; i < 6; i++) { near.burst(500); far.burst(3500); near.step(0.5); far.step(0.5); }
    expect(near.level).toBeGreaterThan(far.level);
    expect(near.lp).toBeGreaterThan(far.lp);
    expect(near.level).toBeLessThanOrEqual(1);
    for (let i = 0; i < 200; i++) near.step(0.1);
    expect(near.level).toBeLessThan(0.01);
  });
  it('ignores far, silent and broken bursts', () => {
    const r = new FlakRumble();
    r.burst(9000); r.burst(NaN); r.burst(300, 0); r.step(NaN);
    expect(r.level).toBe(0);
    for (let i = 0; i < 1000; i++) r.burst(10);
    expect(r.level).toBeLessThanOrEqual(1);
    expect(Number.isFinite(r.lp)).toBe(true);
  });
});

describe('engine harmonics', () => {
  it('Cyclone and Merlin orders at known rpm', () => {
    const f = new Float32Array(3), g = new Float32Array(3);
    engineHarmonics('cyclone', 2300, f, g);
    expect(f[0]).toBeCloseTo(2300 / 60 * 0.5625 * 3, 3);   // ~64.7 Hz blade-pass
    expect(f[1]).toBeCloseTo(2 * f[0], 3);
    expect(f[2]).toBeCloseTo(2300 / 60 * 4.5, 3);          // ~172.5 Hz firing
    engineHarmonics('merlin', 3000, f, g);
    expect(f[0]).toBeCloseTo(3000 / 60 * 0.479 * 4, 3);
    expect(f[2]).toBeCloseTo(300, 3);
    expect(g[0]).toBeCloseTo(1, 6);
  });
  it('louder and higher with rpm; silent when stopped', () => {
    const f = new Float32Array(3), g = new Float32Array(3);
    engineHarmonics('merlin', rpmFor('merlin', 0.2), f, g);
    const lo = [f[0], g[0]];
    engineHarmonics('merlin', rpmFor('merlin', 1), f, g);
    expect(f[0]).toBeGreaterThan(lo[0]);
    expect(g[0]).toBeGreaterThan(lo[1]);
    engineHarmonics('cyclone', 0, f, g);
    expect(g[0] + g[1] + g[2]).toBe(0);
    expect(rpmFor('cyclone', 1)).toBe(ENGINE_ORDERS.cyclone.max);
    expect(rpmFor('cyclone', NaN)).toBe(ENGINE_ORDERS.cyclone.idle);
  });
  it('the bomber runs its remaining engines harder', () => {
    expect(bomberRpm(4)).toBe(2300);
    expect(bomberRpm(2)).toBeGreaterThan(bomberRpm(4));
    expect(bomberRpm(0)).toBe(0);
    expect(Math.abs(bomberRpm(4, 1) - 2300)).toBeLessThan(30);
  });
});

describe('Arabic', () => {
  it('has the Audio detail hint', () => {
    expect(PHRASES['Normal: 3D headphone sound for passing fighters, engine harmonics and a different echo at each gun station. Reduced: lighter for weak devices.']).toMatch(/[؀-ۿ]/);
  });
});
