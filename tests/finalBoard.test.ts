import { it, expect } from 'vitest';
// @ts-expect-error CLI module has no declaration file
import { matchingCaptures } from '../tools/final_board.mjs';
const run = () => ({ complete: true, quality: 'high', shots: Array.from({length: 16}, (_, i) => ({ shot: `shot-${i}`, version: 2, seed: 1943, camera: {position:[0,1,2]}, weather: {sunEl: 40}, viewport:[1920,1080], renderSize:[1920,1080], steps:360, errors:[] })) });
it('rejects incomplete runs, changed cameras and swapped presets before publishing a board', () => {
  const a = run(), b = run();
  expect(() => matchingCaptures(a,b)).not.toThrow();
  b.complete = false; expect(() => matchingCaptures(a,b)).toThrow(); b.complete = true;
  b.shots[3].camera.position[0] = 1; expect(() => matchingCaptures(a,b)).toThrow();
  const c = run(); c.quality = 'cinematic'; expect(() => matchingCaptures(a,c)).toThrow();
});
