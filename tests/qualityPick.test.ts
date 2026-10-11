import { describe, expect, it } from 'vitest';
import { deviceTiers, frameStats, MIN_FRAMES, pickQuality, pickTargetMs, type FrameStats } from '../src/render/QualityPick';
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
    for (const ms of [12, 16, 20]) expect(pickQuality({ tier: 'high', stats: st(ms), refreshHz: 60 })).toEqual({ quality: 'high', tryUpper: false });
  });

  it('over budget drops to medium, badly over to low', () => {
    expect(pickQuality({ tier: 'high', stats: st(28), refreshHz: 60 }).quality).toBe('medium');
    expect(pickQuality({ tier: 'high', stats: st(36), refreshHz: 60 }).quality).toBe('medium');
    expect(pickQuality({ tier: 'high', stats: st(50), refreshHz: 60 }).quality).toBe('low');
    expect(pickQuality({ tier: 'high', stats: st(120), refreshHz: 60 }).quality).toBe('low');
  });

  it('frequent spikes count even when the median looks fine', () => {
    expect(pickQuality({ tier: 'high', stats: st(14, 45), refreshHz: 60 }).quality).toBe('medium');
    // a fast median with spiky frames doesn't earn an ultra try
    expect(pickQuality({ tier: 'high', stats: st(6, 16), refreshHz: 60 }).tryUpper).toBe(false);
  });

  it('a high-refresh display plans for 60 fps, a 50 Hz one for 50', () => {
    expect(pickQuality({ tier: 'high', stats: st(15), refreshHz: 144 }).quality).toBe('high');
    // 24 ms: medium at 60 Hz, still high on a 50 Hz display (20 ms period)
    expect(pickQuality({ tier: 'high', stats: st(24.5), refreshHz: 60 }).quality).toBe('medium');
    expect(pickQuality({ tier: 'high', stats: st(24.5), refreshHz: 50 }).quality).toBe('high');
  });

  it('the hold limit is what dynamic resolution can absorb', () => {
    const limit = pickTargetMs(60) * 1.14 * drsAbsorb(0.8);
    const justIn = limit / 1.1 - 0.05, justOut = limit / 1.1 + 0.05;
    expect(pickQuality({ tier: 'high', stats: st(justIn, justIn), refreshHz: 60 }).quality).toBe('high');
    expect(pickQuality({ tier: 'high', stats: st(justOut, justOut), refreshHz: 60 }).quality).toBe('medium');
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
