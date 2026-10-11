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
// Rounded costs relative to High: throttled menu measurements, checked in the gunner view.
// Medium keeps the shadow submission cost; it is much closer to High than a 0.6 step.
// See docs/phase6/reports/02.md for the measured model and its limitations.
export const TIER_COST: Record<Tier, number> = { low: 0.7, medium: 0.8, high: 1, ultra: 1.35 };
export const PIXEL_SHARE: Record<Tier, number> = { low: 0.1, medium: 0.2, high: 0.4, ultra: 0.35 };
// Missions draw more than the menu (cockpit, more fighters, effects): menu frames are scaled up
export const MENU_TO_MISSION = 1.3;
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
  recovered?: FrameStats; // same tier measured at PICK_SCALE: test DRS before downgrading
  upper?: FrameStats;    // frames measured at the tier above, after a { tryUpper } answer
}
export interface Pick { quality: Tier; tryUpper: boolean }

const valid = (s: FrameStats) => s.n >= MIN_FRAMES && Number.isFinite(s.p50)
  && Number.isFinite(s.p90) && s.p50 >= 0 && s.p90 >= s.p50;

export const needsRecoveryProbe = (stats: FrameStats, refreshHz: number) =>
  valid(stats) && load(stats) > pickTargetMs(refreshHz) * DRS_SLOW;

export function pickQuality({ tier, stats, refreshHz, cap = 'ultra', upper, recovered }: PickInput): Pick {
  const T = pickTargetMs(refreshHz);
  const top = idx(cap), measured = idx(tier);
  let i = Math.min(measured, top);
  if (!valid(stats)) return { quality: TIERS[i], tryUpper: false };
  const l = load(stats);
  if (i === measured && i < top) {
    if (upper) {
      if (valid(upper) && load(upper) <= T * DRS_FAST) return { quality: TIERS[i + 1], tryUpper: false };
    } else if (l * TIER_COST[TIERS[i + 1]] / TIER_COST[tier] <= T * DRS_FAST) {
      return { quality: TIERS[i], tryUpper: true };
    }
  }
  // The actual reduced-resolution sample wins over the model for the measured tier.
  // Other tiers retain their own fixed/pixel split, including when a cap lowers the start.
  for (; i > 0; i--) {
    const candidate = TIERS[i];
    const cost = i === measured && recovered && valid(recovered) ? load(recovered)
      : l * TIER_COST[candidate] / TIER_COST[tier] / drsAbsorb(PICK_SCALE, PIXEL_SHARE[candidate]);
    if (cost <= T * DRS_SLOW) break;
  }
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
