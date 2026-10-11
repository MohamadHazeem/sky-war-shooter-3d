// Graphics preset auto-pick: frame stats from a short benchmark of the menu scene + the display
// refresh rate -> the preset to play on (pure logic, run by game/AutoGraphics.ts, unit-tested in
// tests/qualityPick.test.ts). The thresholds come from dynamic resolution (FrameTiming.ts):
// a preset holds as long as dynamic resolution can keep it on time without dropping far.
import { DRS_FAST, DRS_SLOW, drsAbsorb, drsTargetMs } from './FrameTiming';

export type Tier = 'low' | 'medium' | 'high' | 'ultra';
export const TIERS: Tier[] = ['low', 'medium', 'high', 'ultra'];
const idx = (t: Tier) => Math.max(0, TIERS.indexOf(t));

export interface FrameStats { p50: number; p90: number; n: number }

// Frame times (ms) -> median, 90th percentile and count
export function frameStats(ms: number[]): FrameStats {
  const s = ms.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (!s.length) return { p50: NaN, p90: NaN, n: 0 };
  return { p50: s[s.length >> 1], p90: s[Math.min(s.length - 1, Math.floor(s.length * 0.9))], n: s.length };
}

// Fewer timed frames than this and the pick keeps the tier it measured
export const MIN_FRAMES = 12;
// One tier down costs about this share of the frame (pixel budget, MSAA, cloud steps, AO, shadows)
export const TIER_STEP_COST = 0.6;
// Missions draw more than the menu (cockpit, more fighters, effects): menu frames are scaled up
export const MENU_TO_MISSION = 1.1;
// A tier holds while dynamic resolution can keep it on time at this render scale or above
export const PICK_SCALE = 0.8;
// Spikes count too: a p90 this many times the median is normal frame-to-frame noise
export const P90_SPREAD = 1.3;

// The frame time (ms) the pick plans for: the display period, but never faster than 60 fps
// (dynamic resolution also falls back to 60 when it can't keep a high-refresh display fed)
export const pickTargetMs = (refreshHz: number) => drsTargetMs(refreshHz > 0 ? refreshHz : 60, true);

// Expected mission load (ms) from menu frames: the median, or the spikes when they're unusual
const load = (s: FrameStats) => Math.max(s.p50, s.p90 / P90_SPREAD) * MENU_TO_MISSION;

export interface PickInput {
  tier: Tier;            // the preset the frames were measured at
  stats: FrameStats;
  refreshHz: number;
  cap?: Tier;            // highest preset this device may get (touch phones: medium)
  upper?: FrameStats;    // frames measured at the tier above, after a { tryUpper } answer
}
export interface Pick { quality: Tier; tryUpper: boolean }

export function pickQuality({ tier, stats, refreshHz, cap = 'ultra', upper }: PickInput): Pick {
  const T = pickTargetMs(refreshHz);
  const top = Math.min(idx(cap), TIERS.length - 1);
  let i = Math.min(idx(tier), top);
  if (stats.n < MIN_FRAMES || !Number.isFinite(stats.p50)) return { quality: TIERS[i], tryUpper: false };
  const l = load(stats);
  if (i < top) {
    // the tier above was tried: keep it if it runs at full resolution (no point in a richer
    // preset that dynamic resolution then has to blur)
    if (upper) {
      if (upper.n >= MIN_FRAMES && load(upper) <= T * DRS_FAST) return { quality: TIERS[i + 1], tryUpper: false };
    } else if (l / TIER_STEP_COST <= T * DRS_FAST) {
      // comfortably under budget: the next tier up would still be on time at full resolution
      return { quality: TIERS[i], tryUpper: true };
    }
  }
  // over budget: step down until dynamic resolution can carry the rest
  const limit = T * DRS_SLOW * drsAbsorb(PICK_SCALE);
  let cost = l;
  while (i > 0 && cost > limit) { i--; cost *= TIER_STEP_COST; }
  return { quality: TIERS[i], tryUpper: false };
}

export interface DeviceInfo { touch: boolean; shortSide: number; reducedData: boolean }

// Where the benchmark starts and the highest preset it may pick: touch devices and data savers
// start from medium; phones (short side under 600 CSS px) never go above medium, tablets above high
export function deviceTiers(d: DeviceInfo): { start: Tier; cap: Tier } {
  if (d.touch && d.shortSide < 600) return { start: 'medium', cap: 'medium' };
  if (d.touch) return { start: 'medium', cap: 'high' };
  if (d.reducedData) return { start: 'medium', cap: 'ultra' };
  return { start: 'high', cap: 'ultra' };
}
