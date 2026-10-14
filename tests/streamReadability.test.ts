import { it, expect } from 'vitest';
import { streamFootprint } from '../src/render/StreamReadability';
it('preserves near scale and keeps far wing silhouettes above the High alpha-test threshold', () => {
  expect(streamFootprint(15)).toEqual({ drawn: 15, coverage: 1 });
  for (const pixels of [0.3, 0.7, 1, 2, 3]) {
    const f = streamFootprint(pixels);
    expect(f.drawn * 2).toBeGreaterThanOrEqual(6);
    expect(f.coverage).toBeGreaterThan(0.5);
    expect(f.coverage).toBeLessThanOrEqual(1);
  }
  expect(streamFootprint(1, true)).toEqual({drawn:2, coverage:0.25});
});
