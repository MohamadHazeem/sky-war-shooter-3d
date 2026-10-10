import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeCode, normalizeCode, CODE_ALPHABET, CODE_LEN } from '../src/net/Signal';
import { sampleTrack, advanceClock, INTERP_DELAY } from '../src/net/Coop';
import { seedRandom } from './helpers';

const S = (t: number, x: number) => ({ t, p: new THREE.Vector3(x, 0, 0), q: new THREE.Quaternion(), f: 1, fr: 1 });

describe('co-op join codes', () => {
  it('are 6 characters from the unambiguous alphabet', () => {
    seedRandom(7);
    for (let i = 0; i < 200; i++) {
      const c = makeCode();
      expect(c).toHaveLength(CODE_LEN);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{6}$/); // the pattern firestore.rules accepts
    }
  });
  it('normalises typed codes and rejects bad ones', () => {
    expect(normalizeCode(' k7pq-2m ')).toBe('K7PQ2M');
    expect(normalizeCode('k7pq-2mx')).toBeNull();
    expect(normalizeCode('ers84h')).toBe('ERS84H');
    expect(normalizeCode('ERS 84H')).toBe('ERS84H');
    expect(normalizeCode('ERS80H')).toBeNull();  // 0 is never used
    expect(normalizeCode('ABCDEFG')).toBeNull();
  });
});

describe('co-op snapshot interpolation', () => {
  const v = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Quaternion();
  it('interpolates between bracketing samples and reports velocity', () => {
    sampleTrack([S(0, 0), S(0.05, 10), S(0.1, 20)], 0.075, p, q, v);
    expect(p.x).toBeCloseTo(15);
    expect(v.x).toBeCloseTo(200);
  });
  it('extrapolates at most 0.2 s past the newest sample', () => {
    sampleTrack([S(0, 0), S(0.05, 10)], 1, p, q, v);
    expect(p.x).toBeCloseTo(10 + 200 * 0.2);
  });
  it('clamps to the oldest sample before the buffer', () => {
    sampleTrack([S(1, 5), S(1.05, 6)], 0.5, p, q, v);
    expect(p.x).toBe(5);
  });
});

describe('co-op render clock', () => {
  it('starts one buffer delay behind the newest snapshot', () => {
    expect(advanceClock(-1, 10, 1 / 60)).toBeCloseTo(10 - INTERP_DELAY);
  });
  it('tracks a steady 20 Hz stream without drifting or passing it', () => {
    let rt = -1, latest = 0;
    for (let f = 0; f < 600; f++) {
      if (f % 3 === 0) latest = f / 60;
      rt = advanceClock(rt, latest, 1 / 60);
      expect(rt).toBeLessThanOrEqual(latest);
    }
    expect(latest - rt).toBeGreaterThan(0.03);
    expect(latest - rt).toBeLessThan(0.15);
  });
  it('jumps when far off (pause, restart)', () => {
    expect(advanceClock(3, 50, 1 / 60)).toBeCloseTo(50 - INTERP_DELAY);
  });
});
