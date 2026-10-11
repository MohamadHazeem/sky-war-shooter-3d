import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { stubStorage } from './helpers';
import { setLang, tx } from '../src/i18n';
import extras from '../src/i18n/ar/extras';
import { PHRASES } from '../src/i18n/phrases';
import { AIRCRAFT_SPECS, QUIZ_POOL, QUIZ_ROUNDS, loadQuiz, quizChoices, quizSequence, saveQuiz, specTexts } from '../src/game/AircraftData';
import { NEWS, SEEN_KEY, WHATS_NEW_VERSION, loadSeen, markSeen, shouldShow } from '../src/game/WhatsNew';
import { ENEMY_VARIANTS } from '../src/world/EnemyTypes';

// node:fs without @types/node (the project's tsconfig only has the browser types)
const FS = 'node:fs';
const { readFileSync } = (await import(FS)) as { readFileSync(p: URL, enc: 'utf8'): string };
const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

const arabic = /[؀-ۿ]/;
// Latin kept in Arabic text: aircraft, weapon and unit designations, gamepad button names, key caps
const KEEP = /B-17G?|P-51D?|Fw 190|Bf 109|Bf 110|Ju 88|Me 262|Me 163|Me 410|He 111|Do 335|\b[A-Z]-\d+[a-z]?\b|\bMG \d+(?:\/\d+|Z)?|\bMK \d+|\bBK 5|\bM2\b|\bU4\b|\b(?:LT|RT|LB|RB)\b|\b[A-Z]\b/g;
function arabicFor(s: string): string {
  const out = tx(s);
  expect(out, s).toMatch(arabic);
  expect(out.replace(/<[^>]+>/g, '').replace(/\{\w+\}/g, '').replace(KEEP, ''), `untranslated words in: ${s}\n→ ${out}`).not.toMatch(/[A-Za-z]{2,}/);
  return out;
}

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); });

describe('aircraft recognition data', () => {
  it('has every enemy type, both of ours and the fictional boss', () => {
    const ids = AIRCRAFT_SPECS.map((s) => s.id);
    for (const t of Object.keys(ENEMY_VARIANTS)) expect(ids, t).toContain(t);
    expect(ids).toContain('b17');
    expect(ids).toContain('p51d');
    const boss = AIRCRAFT_SPECS.find((s) => s.id === 'boss')!;
    expect(boss.fictional).toBe(true);
    expect(boss.name).toMatch(/fictional/i);
    expect(boss.note).toMatch(/fictional/i);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every card is filled in and short', () => {
    for (const s of AIRCRAFT_SPECS) {
      for (const t of specTexts(s)) { expect(t.length, `${s.id}: ${t}`).toBeGreaterThan(0); expect(t.length, `${s.id}: ${t}`).toBeLessThan(120); }
      if (!s.fictional) {
        expect(s.speed, s.id).toMatch(/^\d{3} mph \(\d{3} km\/h\)$/);
        expect(s.first, s.id).toMatch(/19(3\d|4[0-3])/);
      }
    }
  });

  it('a few historical figures', () => {
    const by = (id: string) => AIRCRAFT_SPECS.find((s) => s.id === id)!;
    expect(by('b17').first).toBe('28 July 1935');
    expect(by('b17').crew).toBe('10');
    expect(by('p51d').speed).toBe('437 mph (703 km/h)');
    expect(by('me262').armament).toContain('4 × 30 mm MK 108');
    expect(by('me410').armament).toContain('BK 5');
    expect(by('me410').note).toContain('Bf 110');   // the stand-in airframe is labelled
    expect(by('do335').first).toBe('26 October 1943');
  });

  it('quiz: four distinct choices with the answer, sequences without repeats in a row, the best score kept', () => {
    let seed = 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    expect(QUIZ_POOL).not.toContain('boss');
    for (const id of QUIZ_POOL) for (let k = 0; k < 20; k++) {
      const c = quizChoices(id, rnd);
      expect(c.length).toBe(4);
      expect(new Set(c).size).toBe(4);
      expect(c).toContain(id);
    }
    for (let k = 0; k < 30; k++) {
      const q = quizSequence(rnd);
      expect(q.length).toBe(QUIZ_ROUNDS);
      for (let i = 1; i < q.length; i++) expect(q[i]).not.toBe(q[i - 1]);
    }
    expect(loadQuiz()).toEqual({ best: 0, played: 0, last: 0 });
    expect(saveQuiz(6).best).toBe(true);
    expect(saveQuiz(4).best).toBe(false);
    expect(loadQuiz()).toEqual({ best: 6, played: 2, last: 4 });
  });
});

describe("what's new", () => {
  it('shows once per version, never on top of the training prompt', () => {
    expect(loadSeen()).toBe(null);
    expect(shouldShow(loadSeen(), false)).toBe(true);
    expect(shouldShow(loadSeen(), true)).toBe(false);      // brand-new player: after the prompt
    markSeen();
    expect(localStorage.getItem(SEEN_KEY)).toBe(WHATS_NEW_VERSION);
    expect(shouldShow(loadSeen(), false)).toBe(false);
    expect(shouldShow('0.9', false)).toBe(true);           // an older bulletin was seen
  });

  it('has a card with a target for every big feature', () => {
    const ids = NEWS.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['campaign', 'takeoff', 'boss', 'interior', 'specials', 'wingman', 'nemesis', 'skills', 'custom', 'theatre', 'coop', 'arabic']) expect(ids).toContain(id);
    // every target is handled by TitleExtras.tryIt and illustrated by the board
    const hub = source('game/TitleExtras.ts'), board = source('ui/WhatsNewScreen.ts');
    for (const id of ids) { expect(hub, id).toContain(`case '${id}'`); expect(board, id).toMatch(new RegExp(`\\n  ${id}: \\(\\) =>`)); }
  });

  it('both entries are in the grouped title menu', () => {
    const ui = source('ui/UI.ts');
    const sec = ui.match(/const MENU_SECONDARY = \[([^\]]*)\]/)![1];
    expect(sec).toContain("'aircraft'");
    expect(sec).toContain("'whatsnew'");
  });
});

describe('Arabic for the bulletin and the gallery', () => {
  beforeEach(() => { setLang('ar'); });

  it('the phrase table adds no key another table already has (no silent overrides)', () => {
    const others = { ...PHRASES };
    for (const k of Object.keys(extras.phrases)) delete others[k];
    // PHRASES merges every table: a key of ours also defined elsewhere would only show up as a changed value
    const tables = ['missions', 'radio', 'game', 'loadout', 'career', 'combat', 'misc', 'pilot', 'raid', 'campaign', 'skills', 'battle', 'theatre', 'aircraft', 'coop', 'hud', 'specials', 'nemesis', 'strafe', 'bookends'];
    const dup: string[] = [];
    for (const t of tables) {
      const src = source(`i18n/ar/${t}.ts`);
      for (const k of Object.keys(extras.phrases)) {
        const lit = k.includes("'") ? `"${k}":` : `'${k}':`;
        if (src.includes(lit)) dup.push(`${t}: ${k}`);
      }
    }
    expect(dup).toEqual([]);
  });

  it('every news card and every board text', () => {
    for (const n of NEWS) { arabicFor(n.title); arabicFor(n.text); if (n.tag) arabicFor(n.tag); }
    const board = [...source('ui/WhatsNewScreen.ts').matchAll(/tx\((['"])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((m) => m[2].replace(/\\'/g, "'"));
    expect(board.length).toBeGreaterThan(5);
    for (const s of board) arabicFor(s);
    arabicFor('bulletin · version {v}');
    const boss = source('game/TitleExtras.ts').match(/const BOSS_BRIEF = '([^']+)'/)![1];
    arabicFor(boss);
    arabicFor('recognition · quiz');
  });

  it('every spec card and every gallery text', () => {
    for (const s of AIRCRAFT_SPECS) for (const t of specTexts(s)) {
      if (/[A-Za-z]/.test(t.replace(KEEP, ''))) arabicFor(t);   // pure designations ("Bf 109") and numbers stay as they are
    }
    const screen = [...source('ui/GalleryScreen.ts').matchAll(/tx\((['"])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((m) => m[2].replace(/\\'/g, "'"));
    expect(screen.length).toBeGreaterThan(20);
    for (const s of screen) arabicFor(s);
    for (const s of ['Fictional · boss', 'Allied · USAAF', 'Luftwaffe', 'HANGAR 2 · KEEP CLEAR', 'Aircraft']) arabicFor(s);
    expect(tx('Round {i} / {n}', { i: 3, n: 10 })).toBe('الجولة 3 / 10');
    expect(tx('287 mph (462 km/h)')).toBe('287 ميلًا في الساعة (462 كم/س)');
    expect(tx('26 October 1943')).toBe('26 أكتوبر 1943');
  });

  it('English is unchanged', () => {
    setLang('en');
    for (const s of AIRCRAFT_SPECS) for (const t of specTexts(s)) expect(tx(t)).toBe(t);
    for (const n of NEWS) expect(tx(n.text)).toBe(n.text);
  });
});
