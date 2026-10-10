import { defineConfig } from 'vitest/config';

// Unit tests for the pure game logic. They run in plain Node: three.js maths works
// without WebGL, and the few modules that touch localStorage get an in-memory mock.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
