// Pure contracts shared by temporal passes and their tests. Motion is previous UV - current UV.
export function halton(index: number, base: number): number {
  let value = 0, scale = 1;
  while (index > 0) { scale /= base; value += scale * (index % base); index = Math.floor(index / base); }
  return value;
}
export const JITTER = Array.from({ length: 8 }, (_, i) => [halton(i + 1, 2) - .5, halton(i + 1, 3) - .5] as const);
export const adaptationWeight = (dt: number, brightening: boolean) => 1 - Math.exp(-Math.max(0, Math.min(dt, .1)) * (brightening ? 1.2 : 3));
export const exposureTarget = (luminance: number) => Math.max(.65, Math.min(1.6, .3 / Math.max(luminance, .001)));
export const historyDepthMatches = (previous: number, expected: number) => Math.abs(previous - expected) < Math.max(.002, expected * .025);
