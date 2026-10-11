/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { it, expect } from 'vitest';

it('voice pipeline preserves partial manifests, retries, hashes and fallback behaviour', () => {
  expect(() => execFileSync('python3', ['tools/voice/test_generate.py'], { encoding: 'utf8' })).not.toThrow();
});
