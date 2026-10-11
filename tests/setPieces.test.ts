import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { stubStorage } from './helpers';
import { setLang, tx } from '../src/i18n';
import { setPieceDue, SP_FIRST, SP_MAX, SP_OVERDUE, type SpGate } from '../src/game/SetPieces';

// node:fs without @types/node (the project's tsconfig only has the browser types)
const FS = 'node:fs';
const { readFileSync } = (await import(FS)) as { readFileSync(p: URL, enc: 'utf8'): string };
const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../public/audio/voice/manifest.json', import.meta.url), 'utf8')) as { clips: Record<string, { text: string }> };

const gate = (o: Partial<SpGate> = {}): SpGate => ({
  role: 'gunner', boss: false, busy: false, phase: 'breather', missionT: 120, roundT: 40, roundLeft: 60,
  sinceLast: 1e9, gap: 160, count: 0, near: 0, ...o,
});

describe('set piece scheduling (pacing)', () => {
  it('plays in the breather of a gunner round', () => {
    expect(setPieceDue(gate())).toBe(true);
  });

  it('never in a boss fight, the final wave, an objective/event, heavy combat or the P-51', () => {
    expect(setPieceDue(gate({ boss: true }))).toBe(false);
    expect(setPieceDue(gate({ phase: 'final' }))).toBe(false);
    expect(setPieceDue(gate({ busy: true }))).toBe(false);
    expect(setPieceDue(gate({ near: 7 }))).toBe(false);
    expect(setPieceDue(gate({ near: 6 }))).toBe(true);
    expect(setPieceDue(gate({ role: 'pilot' }))).toBe(false);
  });

  it('keeps the round edges, the gap and the per-mission cap', () => {
    expect(setPieceDue(gate({ roundT: 10 }))).toBe(false);
    expect(setPieceDue(gate({ roundLeft: 10 }))).toBe(false);
    expect(setPieceDue(gate({ missionT: SP_FIRST - 1 }))).toBe(false);
    expect(setPieceDue(gate({ sinceLast: 100 }))).toBe(false);
    expect(setPieceDue(gate({ count: SP_MAX }))).toBe(false);
  });

  it('outside a breather only when long overdue and quiet', () => {
    expect(setPieceDue(gate({ phase: 'mid', sinceLast: 170 }))).toBe(false);
    expect(setPieceDue(gate({ phase: 'mid', sinceLast: 160 + SP_OVERDUE, missionT: 300, near: 3 }))).toBe(false);
    expect(setPieceDue(gate({ phase: 'mid', sinceLast: 160 + SP_OVERDUE, missionT: 300, near: 2 }))).toBe(true);
    expect(setPieceDue(gate({ phase: 'none', sinceLast: 1e9, missionT: SP_FIRST + SP_OVERDUE, near: 0 }))).toBe(true);
  });
});

// callout texts in a source file (literal and template), as tools/voice/generate.py finds them
function callouts(path: string): string[] {
  const out: string[] = [];
  for (const m of source(path).matchAll(/callout\('sp_\w+', [^,]+, ('(?:[^'\\]|\\.)*'|`[^`]*`), 0, 3\)/g)) out.push(m[1]);
  return out;
}

describe('set piece radio and captions', () => {
  beforeEach(() => { stubStorage(); setLang('ar'); });
  afterEach(() => { setLang('en'); });

  const KEEP = /B-17G?|P-51D?|Bf 109|Sky Queen|Lucky Lady/g;
  const arabicFor = (s: string) => {
    const out = tx(s);
    expect(out, s).toMatch(/[؀-ۿ]/);
    expect(out.replace(KEEP, ''), `untranslated words in: ${s}\n→ ${out}`).not.toMatch(/[A-Za-z]{2,}/);
  };

  it('every radio line of the set pieces and the straggler has Arabic and a recorded clip', () => {
    const lits = [...callouts('game/SetPieces.ts'), ...callouts('game/RandomEvents.ts')];
    expect(lits.length).toBeGreaterThanOrEqual(22);
    const clipTexts = new Set(Object.values(manifest.clips).map((c) => c.text));
    const texts: string[] = [];
    for (const lit of lits) {
      const body = lit.slice(1, -1).replace(/\\'/g, "'");
      if (lit.startsWith('`')) {
        // the chute count: one line per count
        for (let n = 3; n <= 6; n++) texts.push(body.replace(/\$\{[^}]*\}(.*?)\$\{[^}]*\}/, `${['', 'one', 'two', 'three', 'four', 'five', 'six'][n - 1]}$1${['', 'one', 'two', 'three', 'four', 'five', 'six'][n]}`));
      } else texts.push(body);
    }
    for (const s of texts) {
      arabicFor(s);
      expect(clipTexts.has(s), `no clip: ${s}`).toBe(true);
    }
  });

  it('drama captions, the reward and the bomber names', () => {
    for (const s of ['FLAK HIT', 'MID-AIR COLLISION', 'BOMB BAY HIT', 'STRAGGLER', 'LITTLE FRIENDS', 'P-51s on a Bf 109', 'Collision averted', 'Collision averted — +75 merit']) arabicFor(s);
    for (const s of ['{name} is going down', '{name} — a Fw 190 on a collision course', '{name} — fire in the bomb bay', '{name} is dropping out of formation']) {
      const out = tx(s, { name: 'Lucky Lady' });
      expect(out).toContain('Lucky Lady');
      expect(out.replace('Lucky Lady', '')).toMatch(/[؀-ۿ]/);
      expect(out.replace('Lucky Lady', '').replace('Fw 190', '')).not.toMatch(/[A-Za-z]{2,}/);
    }
  });
});
