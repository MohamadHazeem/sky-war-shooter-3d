import { defineConfig } from 'vitest/config';

// Unit tests for the pure game logic. They run in plain Node: three.js maths works
// without WebGL, and the few modules that touch localStorage get an in-memory mock.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    // the offline audio-synthesis tests render every generated voice/buffer: ~2 s locally,
    // 8-12 s on GitHub's shared runners, so the 5 s default timed CI out
    testTimeout: 60_000,
    // persist module transforms across runs (many agents re-run the suite while iterating)
    fsModuleCache: true,
  },
});
