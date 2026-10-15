/// <reference types="node" />
import { readdirSync, writeFileSync, rmSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { describe, it, expect } from 'vitest';
import { ALL_TABLES, PHRASES, withDiscovered } from '../src/i18n/phrases';
import type { PhraseTable } from '../src/i18n/types';

const tbl = (k: string, v: string): PhraseTable => ({ phrases: { [k]: v } });

describe('Arabic table auto-discovery', () => {
  it('puts unlisted tables first (sorted by file), keeps the explicit order, skips helpers', () => {
    const a = tbl('x', 'a'), b = tbl('x', 'b'), extra1 = tbl('x', 'e1'), extra2 = tbl('y', 'e2');
    const out = withDiscovered([a, b], {
      './ar/zeta.ts': { default: extra2 }, './ar/a.ts': { default: a }, './ar/b.ts': { default: b },
      './ar/alpha.ts': { default: extra1 }, './ar/fmt.ts': {},
    });
    expect(out).toEqual([extra1, extra2, a, b]);
    // explicit tables still win over discovered ones
    expect(Object.assign({}, ...out.map((t) => t.phrases))).toEqual({ x: 'b', y: 'e2' });
  });

  it('every table file under src/i18n/ar is used exactly once', () => {
    const files = readdirSync(new URL('../src/i18n/ar/', import.meta.url)).filter((f) => f.endsWith('.ts') && f !== 'fmt.ts');
    expect(new Set(ALL_TABLES).size).toBe(ALL_TABLES.length);
    expect(ALL_TABLES.length).toBe(files.length);
  });

  it('a table that exists only as a file in src/i18n/ar is picked up (fresh Vite load)', async () => {
    // A copy of src/i18n plus one new table file: nothing else is edited, as for a new goal.
    const dir = mkdtempSync(join(tmpdir(), 'sws-i18n-'));
    cpSync(fileURLToPath(new URL('../src/i18n/', import.meta.url)), dir, { recursive: true });
    const key = 'Discovery probe phrase 7f3a';
    writeFileSync(join(dir, 'ar', 'zzDiscoveryProbe.ts'),
      `import type { PhraseTable } from '../types';\nconst table: PhraseTable = { phrases: { '${key}': 'مسبار', 'Pause': 'probe' } };\nexport default table;\n`);
    const server = await createServer({ root: dir, configFile: false, logLevel: 'silent', server: { middlewareMode: true, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
    try {
      const fresh = await server.ssrLoadModule('/phrases.ts') as typeof import('../src/i18n/phrases');
      expect(fresh.PHRASES[key]).toBe('مسبار');
      expect(fresh.ALL_TABLES.length).toBe(ALL_TABLES.length + 1);
      // among the discovered tables (other goals' files may be discovered too), before every explicit one
      const probe = fresh.ALL_TABLES.findIndex((t) => t.phrases[key] === 'مسبار');
      expect(probe).toBeGreaterThanOrEqual(0);
      expect(probe).toBeLessThan(fresh.ALL_TABLES.findIndex((t) => t.phrases['Pause'] !== undefined && t.phrases['Pause'] !== 'probe'));
      expect(fresh.ALL_TABLES.slice(probe + 1).some(t => t.phrases['Pause'] === PHRASES['Pause'])).toBe(true);
      expect(fresh.PHRASES['Pause']).toBe(PHRASES['Pause']);
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
