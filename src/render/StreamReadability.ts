// Far silhouettes need enough covered pixels to survive the non-MSAA alpha test.
// These are half extents; High keeps wings/tail across at least 6.5 screen pixels.
export const STREAM_MIN_HALF_PX = 3.25;
export const STREAM_MIN_COVERAGE = 0.65;
export function streamFootprint(halfPx: number, low = false) {
  const drawn = Math.max(halfPx, low ? 2 : STREAM_MIN_HALF_PX);
  return { drawn, coverage: Math.max(low ? 0 : STREAM_MIN_COVERAGE, (halfPx / drawn) ** 2) };
}
