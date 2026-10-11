import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { stubStorage } from './helpers';
import { tx, setLang } from '../src/i18n';
import { CHAPTERS, chapterForRole, manualTexts } from '../src/game/FieldManual';
import { DIAGRAM_LABELS, keyVars } from '../src/ui/FieldManualScreen';
import { controlRows } from '../src/ui/ControlsCard';
import { keyMap } from '../src/core/KeyMap';

// Field Manual (Phase 5 extra goal 36): content shape, the role chapter, keys from the live
// bindings, and Arabic for every line.

const CHROME = [
  'Field Manual', 'RESTRICTED', 'FM 1-M · War Department field manual', 'Aerial gunnery and fighter tactics for B-17 crews and P-51 pilots',
  'Close', 'Contents', 'Chapter {n}', 'Reachable from the title menu, the pause menu, Settings and the controls card ({help}).',
  'Keyboard and mouse', 'Gamepad', 'Touch', 'Full manual', 'how to fight · all controls', 'Manual',
];
// Latin that stays in Arabic: designations, key names, units, the bomber's name
const KEEP = /B-17G?|P-51D?|Fw 190|Bf 109|Bf 110|Ju 88|Me 262|Me 163|Me 410|He 111|Do 335|BK 5|K-14|FM 1-M|Sky Queen|UTC|Esc|Space|Enter|\bG\b/g;
const arabic = /[؀-ۿ]/;

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); keyMap.reset(); });

describe('field manual', () => {
  it('has the nine chapters in order, each with sections', () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual(['gunnery', 'crew', 'p51', 'abilities', 'enemies', 'campaign', 'modes', 'controls', 'settings']);
    for (const c of CHAPTERS) expect(c.sections.length, c.id).toBeGreaterThan(0);
  });

  it('every enemy type has a line', () => {
    const enemies = CHAPTERS.find((c) => c.id === 'enemies')!;
    const names = enemies.sections.flatMap((s) => (s.rows ?? []).map(([k]) => k));
    expect(names).toEqual(['Fw 190', 'Bf 109', 'Bf 110', 'Ju 88', 'Me 262', 'Me 163', 'He 111', 'Me 410', 'Do 335']);
    expect(enemies.sections.some((s) => /Luftkreuzer/.test(s.h))).toBe(true);
  });

  it('the pause menu opens the chapter for the role', () => {
    expect(chapterForRole('gunner')).toBe('gunnery');
    expect(chapterForRole('pilot')).toBe('p51');
  });

  it('key names come from the live bindings (remaps show)', () => {
    expect(keyVars().reload).toBe('<kbd>R</kbd>');
    keyMap.bind('reload', 'KeyY');
    expect(keyVars().reload).toBe('<kbd>Y</kbd>');
    expect(controlRows('gunner', 'keyboard').some(([k, v]) => k === '<kbd>Y</kbd>' && v === 'Reload')).toBe(true);
    expect(controlRows('pilot', 'pad').length).toBeGreaterThan(5);
    expect(controlRows('pilot', 'touch').length).toBeGreaterThan(5);
  });

  it('only uses placeholders the screen fills', () => {
    const known = new Set([...Object.keys(keyVars()), 'n', 'help']);
    for (const s of manualTexts()) for (const m of s.matchAll(/\{(\w+)\}/g)) expect(known.has(m[1]), `${m[1]} in: ${s}`).toBe(true);
  });

  it('every line, label and button has Arabic', () => {
    setLang('ar');
    for (const s of [...manualTexts(), ...DIAGRAM_LABELS, ...CHROME]) {
      if (!/[A-Za-z]{2,}/.test(s.replace(KEEP, ''))) continue;   // a bare designation (Fw 190)
      const out = tx(s);
      expect(out, s).toMatch(arabic);
      expect(out.replace(/<[^>]+>/g, '').replace(/\{\w+\}/g, '').replace(KEEP, ''), `untranslated words in: ${s}\n→ ${out}`).not.toMatch(/[A-Za-z]{2,}/);
    }
  });
});
