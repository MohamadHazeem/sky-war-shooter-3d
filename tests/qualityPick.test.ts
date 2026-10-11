import { describe, expect, it } from 'vitest';
import { deviceTiers, frameStats, MIN_FRAMES, MENU_TO_MISSION, PICK_SCALE, PIXEL_SHARE, needsRecoveryProbe, pickQuality, pickTargetMs, type FrameStats } from '../src/render/QualityPick';
import { drsAbsorb } from '../src/render/FrameTiming';

// steady frames around a median (p90 a little above it)
const st = (p50: number, p90 = p50 * 1.1, n = 90): FrameStats => ({ p50, p90, n });

describe('frame stats', () => {
  it('median and 90th percentile, ignoring junk', () => {
    const ms = Array.from({ length: 100 }, (_, i) => i + 1);
    const s = frameStats([...ms, NaN, -3]);
    expect(s.n).toBe(100);
    expect(s.p50).toBe(51);
    expect(s.p90).toBe(91);
    expect(frameStats([]).n).toBe(0);
  });
});

describe('graphics preset pick', () => {
  it('plans for the refresh period, never faster than 60 fps', () => {
    expect(pickTargetMs(60)).toBeCloseTo(16.67, 1);
    expect(pickTargetMs(144)).toBeCloseTo(16.67, 1);
    expect(pickTargetMs(50)).toBeCloseTo(20, 1);
    expect(pickTargetMs(0)).toBeCloseTo(16.67, 1);
  });

  it('a fast machine tries the tier above, and keeps it when it holds', () => {
    const first = pickQuality({ tier: 'high', stats: st(6), refreshHz: 60 });
    expect(first).toEqual({ quality: 'high', tryUpper: true });
    expect(pickQuality({ tier: 'high', stats: st(6), refreshHz: 60, upper: st(11) })).toEqual({ quality: 'ultra', tryUpper: false });
  });

  it('ultra that would need dynamic resolution falls back to high', () => {
    expect(pickQuality({ tier: 'high', stats: st(8), refreshHz: 60, upper: st(17) }).quality).toBe('high');
    // too few ultra frames (aborted early): stay on high
    expect(pickQuality({ tier: 'high', stats: st(6), refreshHz: 60, upper: st(9, 10, 4) }).quality).toBe('high');
  });

  it('a mid-range machine keeps high without trying ultra', () => {
    for (const ms of [12, 14, 16]) expect(pickQuality({ tier: 'high', stats: st(ms), refreshHz: 60 })).toEqual({ quality: 'high', tryUpper: false });
  });

  it('over budget drops to medium, badly over to low', () => {
    expect(pickQuality({ tier: 'high', stats: st(17.3), refreshHz: 60 }).quality).toBe('medium');
    expect(pickQuality({ tier: 'high', stats: st(17.45), refreshHz: 60 }).quality).toBe('medium');
    expect(pickQuality({ tier: 'high', stats: st(50), refreshHz: 60 }).quality).toBe('low');
    expect(pickQuality({ tier: 'high', stats: st(120), refreshHz: 60 }).quality).toBe('low');
  });

  it('frequent spikes count even when the median looks fine', () => {
    expect(pickQuality({ tier: 'high', stats: st(14, 22.5), refreshHz: 60 }).quality).toBe('medium');
    // a fast median with spiky frames doesn't earn an ultra try
    expect(pickQuality({ tier: 'high', stats: st(6, 24), refreshHz: 60 }).tryUpper).toBe(false);
  });

  it('a high-refresh display plans for 60 fps, a 50 Hz one for 50', () => {
    expect(pickQuality({ tier: 'high', stats: st(15), refreshHz: 144 }).quality).toBe('high');
    // 17.3 ms: medium at 60 Hz, still high on a 50 Hz display (20 ms period)
    expect(pickQuality({ tier: 'high', stats: st(17.3), refreshHz: 60 }).quality).toBe('medium');
    expect(pickQuality({ tier: 'high', stats: st(17.3), refreshHz: 50 }).quality).toBe('high');
  });

  it('the hold limit is what dynamic resolution can absorb', () => {
    const limit = pickTargetMs(60) * 1.14 * drsAbsorb(PICK_SCALE, PIXEL_SHARE.high);
    const justIn = limit / MENU_TO_MISSION - 0.05, justOut = limit / MENU_TO_MISSION + 0.05;
    expect(pickQuality({ tier: 'high', stats: st(justIn, justIn), refreshHz: 60 }).quality).toBe('high');
    expect(pickQuality({ tier: 'high', stats: st(justOut, justOut), refreshHz: 60 }).quality).toBe('medium');
  });

  it('uses measured recovery before dropping a tier, even when the model predicts a drop', () => {
    expect(needsRecoveryProbe(st(24), 60)).toBe(true);
    expect(needsRecoveryProbe(st(8), 60)).toBe(false);
    expect(pickQuality({ tier: 'high', stats: st(24), refreshHz: 60, recovered: st(14) }).quality).toBe('high');
    // CPU-bound: fewer pixels do not save it, even when the optimistic estimate would hold.
    expect(pickQuality({ tier: 'high', stats: st(17), refreshHz: 60, recovered: st(17) }).quality).toBe('medium');
    expect(pickQuality({ tier: 'high', stats: st(24), refreshHz: 60, recovered: st(4, 5, 2) }).quality).toBe('low');
  });

  it('checks exact hold boundaries for every tier and refresh rate', () => {
    for (const tier of ['medium', 'high', 'ultra'] as const) for (const hz of [50, 60, 144]) {
      const limit = pickTargetMs(hz) * 1.14 * drsAbsorb(PICK_SCALE, PIXEL_SHARE[tier]) / MENU_TO_MISSION;
      expect(pickQuality({ tier, stats: st(limit - 0.01), refreshHz: hz }).quality).toBe(tier);
      expect(pickQuality({ tier, stats: st(limit + 0.01), refreshHz: hz }).quality).not.toBe(tier);
    }
  });

  it('ignores malformed percentiles and scales costs when capped below the measured tier', () => {
    expect(pickQuality({ tier: 'high', stats: st(2, Infinity), refreshHz: 60 }).tryUpper).toBe(false);
    expect(pickQuality({ tier: 'high', stats: st(2), upper: st(2, NaN), refreshHz: 60 }).quality).toBe('high');
    expect(pickQuality({ tier: 'ultra', stats: st(22), refreshHz: 60, cap: 'medium' }).quality).toBe('medium');
  });

  it('respects the device cap', () => {
    // a phone measured at medium never tries high, however fast
    expect(pickQuality({ tier: 'medium', stats: st(3), refreshHz: 60, cap: 'medium' })).toEqual({ quality: 'medium', tryUpper: false });
    // a tablet measured at medium may try high, not ultra
    expect(pickQuality({ tier: 'medium', stats: st(3), refreshHz: 60, cap: 'high' })).toEqual({ quality: 'medium', tryUpper: true });
    expect(pickQuality({ tier: 'medium', stats: st(3), refreshHz: 60, cap: 'high', upper: st(8) }).quality).toBe('high');
    expect(pickQuality({ tier: 'high', stats: st(3), refreshHz: 60, cap: 'high' }).tryUpper).toBe(false);
    // a phone that is slow even at medium goes to low
    expect(pickQuality({ tier: 'medium', stats: st(45), refreshHz: 60, cap: 'medium' }).quality).toBe('low');
  });

  it('ultra is the top: nothing to try above it', () => {
    expect(pickQuality({ tier: 'ultra', stats: st(4), refreshHz: 60 })).toEqual({ quality: 'ultra', tryUpper: false });
  });

  it('too few frames keeps the measured tier', () => {
    expect(pickQuality({ tier: 'high', stats: st(80, 90, MIN_FRAMES - 1), refreshHz: 60 })).toEqual({ quality: 'high', tryUpper: false });
    expect(pickQuality({ tier: 'high', stats: frameStats([]), refreshHz: 60 }).quality).toBe('high');
  });
});

describe('device tiers', () => {
  it('desktop starts on high, may reach ultra', () => {
    expect(deviceTiers({ touch: false, shortSide: 1080, reducedData: false })).toEqual({ start: 'high', cap: 'ultra' });
  });
  it('data saver starts on medium', () => {
    expect(deviceTiers({ touch: false, shortSide: 1080, reducedData: true })).toEqual({ start: 'medium', cap: 'ultra' });
  });
  it('phones start and stay on medium; tablets start on medium, cap at high', () => {
    expect(deviceTiers({ touch: true, shortSide: 390, reducedData: false })).toEqual({ start: 'medium', cap: 'medium' });
    expect(deviceTiers({ touch: true, shortSide: 820, reducedData: false })).toEqual({ start: 'medium', cap: 'high' });
  });
});
