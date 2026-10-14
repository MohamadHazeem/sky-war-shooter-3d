import { describe, expect, it } from 'vitest';
import { drsFloor, drsTargetMs, qualityFallbackReady, fasterRefreshFrom, refreshFromTimestamps, snapRefreshHz } from '../src/render/FrameTiming';
import { Engine, lowerQuality, QUALITY, QUALITY_ORDER } from '../src/core/Engine';

const stamps = (periodMs: number, n: number, jitter = 0.3) => {
  const ts: number[] = [];
  let t = 1000;
  for (let i = 0; i < n; i++) { ts.push(t); t += periodMs + (i % 2 ? jitter : -jitter); }
  return ts;
};

describe('display refresh detection', () => {
  it('snaps measured rates to common displays', () => {
    expect(snapRefreshHz(59.4)).toBe(60);
    expect(snapRefreshHz(118.7)).toBe(120);
    expect(snapRefreshHz(143.2)).toBe(144);
    expect(snapRefreshHz(500)).toBe(240);
    expect(snapRefreshHz(NaN)).toBeNull();
    expect(snapRefreshHz(5)).toBeNull();
  });

  it('reads the refresh rate from idle rAF timestamps', () => {
    expect(refreshFromTimestamps(stamps(1000 / 120, 14))).toBe(120);
    expect(refreshFromTimestamps(stamps(1000 / 60, 14))).toBe(60);
    // a long first frame (the probe starts right after a rendered frame) is ignored
    const ts = stamps(1000 / 144, 14);
    ts[1] += 30; for (let i = 2; i < ts.length; i++) ts[i] += 30;
    expect(refreshFromTimestamps(ts)).toBe(144);
    expect(refreshFromTimestamps([0, 16, 33])).toBeNull();
  });

  it('only revises the rate upward from live frames', () => {
    const fast = Array.from({ length: 90 }, (_, i) => (i % 3 ? 8.4 : 16.6));   // a 120 Hz screen missing some frames
    expect(fasterRefreshFrom(fast, 60)).toBe(120);
    const slow = Array.from({ length: 90 }, () => 33.4);                      // a slow game on a 60 Hz screen
    expect(fasterRefreshFrom(slow, 60)).toBeNull();
    expect(fasterRefreshFrom(fast.slice(0, 10), 60)).toBeNull();
    // scripted frames run back to back between real ones are not a 240 Hz screen
    const mixed = Array.from({ length: 90 }, (_, i) => (i % 2 ? 0.4 : 16.3));
    expect(fasterRefreshFrom(mixed, 60)).toBeNull();
  });
});

describe('dynamic resolution target', () => {
  it('aims for the refresh period, falling back to 60 fps on a high-refresh screen', () => {
    expect(drsTargetMs(60, false)).toBeCloseTo(16.67, 1);
    expect(drsTargetMs(120, false)).toBeCloseTo(8.33, 1);
    expect(drsTargetMs(120, true)).toBeCloseTo(16.67, 1);
    expect(drsTargetMs(50, false)).toBeCloseTo(20, 1);
    expect(drsFloor(drsTargetMs(120, false))).toBeGreaterThan(drsFloor(drsTargetMs(60, false)));
  });
});

describe('dynamic resolution recovery', () => {
  it('reduces pixel load to recover frame time without requiring a tier drop', () => {
    // Exercise the actual controller without constructing a WebGL context.
    const engine = Object.assign(Object.create(Engine.prototype), {
      refreshHz: 60, hiGiveUp: false, hiMiss: 0, renderScale: 1, ftEma: 1 / 60,
      drsT: 0, drsHold: 0, drsUp: 0, drsCeil: 1, drsCeilT: 0,
      lastRaiseAt: -99, time: 0, intervals: [], pendingHz: null, resize: () => {},
    });
    for (let i = 0; i < 1200; i++) {
      const dt = (8 + 18 * engine.renderScale ** 2) / 1000;
      engine.time += dt;
      engine.dynamicResolution(dt);
    }
    expect(engine.renderScale).toBeLessThan(1);
    expect(engine.renderScale).toBeGreaterThan(0.55);
    expect(engine.ftEma * 1000).toBeLessThan(19);
    expect(qualityFallbackReady(1000 / (engine.ftEma * 1000), engine.renderScale, engine.targetMs)).toBe(false);
  });
});

describe('last-resort tier fallback', () => {
  it('waits for DRS and high-refresh recovery before dropping a tier', () => {
    expect(qualityFallbackReady(30, 0.8, 1000 / 60)).toBe(false);
    expect(qualityFallbackReady(30, 0.72, 1000 / 120)).toBe(false);
    expect(qualityFallbackReady(30, 0.55, 1000 / 120)).toBe(false);
    expect(qualityFallbackReady(30, 0.55, 1000 / 60)).toBe(true);
    expect(qualityFallbackReady(60, 0.55, 1000 / 60)).toBe(false);
  });
});

describe('quality presets', () => {
  it('keeps reduced volumetric clouds and neutral shadow slots on Low', () => {
    expect(QUALITY.low.shadows).toBe(1);
    expect(QUALITY.low.cloudSteps).toBe(20);
    expect(QUALITY.low.cloudTemporal).toBe(false);
    expect(QUALITY.low.haze).toBe(false);
    expect(QUALITY.medium.temporal).toBe(false);
    expect(QUALITY.low.temporal).toBe(false);
  });
  it('orders the tiers and steps down one at a time', () => {
    expect(QUALITY_ORDER).toEqual(['low', 'medium', 'high', 'ultra', 'cinematic']);
    expect(lowerQuality('cinematic')).toBe('ultra');
    expect(lowerQuality('ultra')).toBe('high');
    expect(lowerQuality('high')).toBe('medium');
    expect(lowerQuality('low')).toBe('low');
  });

  it('ultra raises every budget over high', () => {
    const h = QUALITY.high, u = QUALITY.ultra;
    expect(u.pixels).toBeGreaterThan(h.pixels);
    expect(u.cloudSteps).toBeGreaterThan(h.cloudSteps);
    expect(u.cloudSteps).toBeLessThanOrEqual(96);   // the cloud shader's loop bound
    expect(u.shadows).toBeGreaterThan(h.shadows);
    expect(u.particles).toBeGreaterThan(h.particles);
    expect(QUALITY.low.particles).toBe(0);           // living sky off on low
    expect(QUALITY.medium.particles).toBeLessThan(h.particles);
  });
});
