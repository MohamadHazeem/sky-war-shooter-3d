import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildStream, bomberPose, escortPos, gagglePos, gaggleTheta, groupCentre, lossPath, newPose, squadronSizes,
  KIND_BOMBER, KIND_ESCORT, KIND_GAGGLE, LOSS_DIVE, LOSS_SPIRAL, MAX_STREAM_BOMBERS, REC_FLOATS, STREAM_TIERS, type StreamTier,
} from '../src/world/StreamLayout';

const V = 75;

describe('bomber stream layout', () => {
  it('sizes the stream per tier: hundreds on High/Ultra, a smaller stream on Low', () => {
    const n = (t: StreamTier) => buildStream(t).bombers;
    expect(n('low')).toBeGreaterThanOrEqual(100);
    expect(n('low')).toBeLessThan(n('medium'));
    expect(n('medium')).toBeGreaterThanOrEqual(300);
    expect(n('high')).toBeGreaterThanOrEqual(500);
    expect(n('ultra')).toBeGreaterThanOrEqual(900);
    expect(n('ultra')).toBeLessThanOrEqual(MAX_STREAM_BOMBERS);
  });

  it('builds combat boxes of 18-36 B-17s from lead / high / low squadrons of vics', () => {
    for (const t of Object.keys(STREAM_TIERS) as StreamTier[]) {
      const L = buildStream(t);
      for (const g of L.groups) {
        expect(g.count).toBeGreaterThanOrEqual(18);
        expect(g.count).toBeLessThanOrEqual(36);
        expect(g.squadrons.length).toBe(3);
      }
    }
    for (const n of [18, 21, 24, 27, 36]) {
      const s = squadronSizes(n);
      expect(s[0] + s[1] + s[2]).toBe(n);
      for (const k of s) { expect(k % 3).toBe(0); expect(k).toBeGreaterThanOrEqual(6); expect(k).toBeLessThanOrEqual(12); }
    }
  });

  it('leaves room for the gameplay box: no stream aircraft within 900 m of it, ever', () => {
    const L = buildStream('ultra');
    const p = newPose(), v = new THREE.Vector3();
    for (let t = 0; t < 1800; t += 37) {
      for (let i = 0; i < L.bombers; i++) {
        bomberPose(L.data, i, t, V, p);
        expect(p.p.length()).toBeGreaterThan(900);
      }
      for (let i = L.escortFirst; i < L.escortFirst + L.escortCount; i++) expect(escortPos(L.data, i, t, V, 1200, v).y).toBeGreaterThan(400);
    }
  });

  it('is deterministic for a seed and records every kind', () => {
    const a = buildStream('high', 7), b = buildStream('high', 7), c = buildStream('high', 8);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(a.data)).not.toEqual(Array.from(c.data));
    const kinds = new Set<number>();
    for (let i = 0; i < a.count; i++) kinds.add(a.data[i * REC_FLOATS + 8]);
    expect([...kinds].sort()).toEqual([KIND_BOMBER, KIND_ESCORT, KIND_GAGGLE]);
    expect(a.gaggles.length).toBe(STREAM_TIERS.high.gaggles);
  });

  it('stretches the stream kilometres ahead and behind, with a second column off to one side', () => {
    const L = buildStream('high');
    const z = L.groups.map((g) => g.base.z), x = L.groups.map((g) => g.base.x);
    expect(Math.max(...z)).toBeGreaterThan(6000);
    expect(Math.min(...z)).toBeLessThan(-15000);
    expect(Math.max(...x)).toBeGreaterThan(5000);
  });

  it('keeps boxes moving smoothly (no jumps between frames)', () => {
    const L = buildStream('high');
    const a = newPose(), b = newPose();
    for (let i = 0; i < L.bombers; i += 17) {
      bomberPose(L.data, i, 100, V, a);
      bomberPose(L.data, i, 100 + 1 / 60, V, b);
      expect(a.p.distanceTo(b.p)).toBeLessThan(0.5);
      expect(Math.abs(a.roll)).toBeLessThan(0.1);
      expect(Math.abs(a.yaw)).toBeLessThan(0.05);
    }
    const g = L.groups[0], c0 = groupCentre(g, 0), c1 = groupCentre(g, 600);
    expect(c0.distanceTo(c1)).toBeLessThan(600);
  });

  it('flies the gaggles through their target box and out wide on the way back', () => {
    const L = buildStream('high');
    const gg = L.gaggles[0], i = gg.first;
    const target = L.groups[gg.target];
    expect(gaggleTheta(0)).toBe(0);
    expect(gaggleTheta(0.3)).toBeCloseTo(Math.PI);
    // across one cycle: passes close to the box centre, and swings at least a kilometre out
    let closest = Infinity, widest = 0;
    const p = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < gg.period; t += 0.25) {
      gagglePos(L.data, i, t, p);
      groupCentre(target, t, c);
      closest = Math.min(closest, p.distanceTo(c));
      widest = Math.max(widest, Math.abs(p.x - c.x));
    }
    expect(closest).toBeLessThan(400);
    expect(widest).toBeGreaterThan(1000);
  });

  it('sends losses down and back from where they were hit, a dive faster than a spiral', () => {
    const v = new THREE.Vector3();
    expect(lossPath(0, 3, LOSS_SPIRAL, V, v).length()).toBeLessThan(1e-6);
    const spiral = lossPath(20, 3, LOSS_SPIRAL, V, new THREE.Vector3());
    const dive = lossPath(20, 3, LOSS_DIVE, V, new THREE.Vector3());
    expect(spiral.y).toBeLessThan(-600);
    expect(dive.y).toBeLessThan(spiral.y);
    expect(spiral.z).toBeLessThan(-300);   // falling back through the stream
  });
});
