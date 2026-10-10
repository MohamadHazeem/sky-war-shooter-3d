// Display refresh detection and the frame-time target of dynamic resolution (pure logic,
// used by core/Engine.ts and unit-tested in tests/frameTiming.test.ts).

// Common display refresh rates; a measured rate within 7 % snaps to one of these
export const REFRESH_RATES = [48, 50, 60, 72, 75, 85, 90, 100, 120, 144, 160, 165, 170, 180, 200, 240];

// A measured rate (Hz) -> the display rate it most likely is (rounded when it matches none,
// capped at 240). null for nonsense (hidden tab, breakpoint).
export function snapRefreshHz(hz: number): number | null {
  if (!Number.isFinite(hz) || hz < 20) return null;
  const snap = REFRESH_RATES.find((r) => Math.abs(r - hz) / r < 0.07);
  return Math.min(240, snap ?? Math.round(hz));
}

// requestAnimationFrame timestamps (ms) of idle frames -> refresh rate, from the median
// interval (the first couple of frames after a busy one are skipped)
export function refreshFromTimestamps(ts: number[]): number | null {
  const d: number[] = [];
  for (let i = 3; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
  if (d.length < 4) return null;
  d.sort((a, b) => a - b);
  return snapRefreshHz(1000 / d[d.length >> 1]);
}

// Live frame intervals (ms) over a couple of seconds: when even the fast frames come in
// clearly under the assumed period, the display is faster than we thought.
// Intervals under 3.5 ms (two frames run back to back by script) are ignored.
export function fasterRefreshFrom(intervals: number[], refreshHz: number): number | null {
  const s = intervals.filter((v) => v >= 3.5).sort((a, b) => a - b);
  if (s.length < 30) return null;
  const p20 = s[Math.floor(s.length * 0.2)];
  if (p20 >= 0.88 * (1000 / refreshHz)) return null;
  return snapRefreshHz(1000 / s[Math.floor(s.length * 0.1)]);
}

// Frame time (ms) dynamic resolution aims for: the refresh period, or 60 fps when a
// high-refresh display can't be kept up with (and never faster than the display itself).
export function drsTargetMs(refreshHz: number, gaveUpHighRefresh: boolean): number {
  const period = 1000 / refreshHz;
  return refreshHz > 65 && !gaveUpHighRefresh ? period : Math.max(1000 / 60, period);
}

// The lowest render scale dynamic resolution may use for a target: on the high-refresh tier it
// won't trade more than ~28 % of the resolution for the extra frames (it drops to 60 fps instead)
export const drsFloor = (targetMs: number) => (targetMs < 1000 / 65 ? 0.72 : 0.55);
