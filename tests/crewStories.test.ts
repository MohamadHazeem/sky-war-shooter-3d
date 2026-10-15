import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStorage, stubStorage } from './helpers';
import {
  CrewStories, performanceMult, moraleLabel, fatigueLabel, bondLabel, storyTexts, lean, pairKey,
  STORY_MEN, PERSONA, BONDS, JOURNAL_TEXT, VIGNETTE_TEXT, LETTERS, STORE_KEY, PASS_EVERY,
  MORALE_START, REPLY_MORALE, REPLY_MORALE_BAD, type Sortie,
} from '../src/game/CrewStories';
import { hasPhrase, setLang, tx } from '../src/i18n';
import { say } from '../src/ui/CrewStoriesPanel';
import type { ManId } from '../src/game/CrewRoster';

const never = () => 0.999;            // no rituals broken, no mail
const always = () => 0;               // every roll hits
const ALL = STORY_MEN;
const sortie = (o: Partial<Sortie> = {}): Sortie => ({ success: true, flew: [...ALL], wounded: [], killed: [], kills: {}, lost: 0, ...o });
const fresh = (rng = never, store: MemoryStorage | null = null) => new CrewStories(rng, store);
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); });

describe('performance from morale and fatigue', () => {
  it('is exactly neutral in the normal band and at the start', () => {
    expect(performanceMult(MORALE_START, 0)).toBe(1);
    expect(performanceMult(40, 50)).toBe(1);
    expect(performanceMult(75, 10)).toBe(1);
    const s = fresh();
    for (const id of ALL) expect(s.mult(id)).toBe(1);
  });
  it('lifts in high spirits and drags when shaken or exhausted, within bounds', () => {
    expect(performanceMult(100, 0)).toBeCloseTo(1.06);
    expect(performanceMult(0, 0)).toBeCloseTo(0.85);
    expect(performanceMult(60, 100)).toBeCloseTo(0.88);
    expect(performanceMult(0, 100)).toBeCloseTo(0.73);
    expect(performanceMult(20, 0)).toBeLessThan(performanceMult(35, 0));
    expect(performanceMult(-50, 200)).toBe(performanceMult(0, 100));
  });
  it('labels', () => {
    expect(moraleLabel(90)).toBe('High spirits');
    expect(moraleLabel(10)).toBe('Shaken');
    expect(fatigueLabel(0)).toBe('Fresh');
    expect(fatigueLabel(80)).toBe('Exhausted');
    expect(bondLabel(80)).toBe('Like brothers');
    expect(bondLabel(-60)).toBe('At odds');
  });
});

describe('personalities', () => {
  it('every man has two traits, a ritual, a broken-ritual story and family', () => {
    for (const id of ALL) {
      const p = PERSONA[id];
      expect(p.traits).toHaveLength(2);
      expect(p.broken).toContain('{who}');
      expect(p.family.length).toBeGreaterThan(0);
    }
  });
  it('traits lean the numbers', () => {
    expect(lean('stern').loss).toBeGreaterThan(lean('brenner').loss);   // worrier vs calm
    expect(lean('kessler').faith).toBeGreaterThan(lean('stern').faith); // superstitious vs precise
    expect(lean('walsh').cheer).toBeGreaterThan(0);
    expect(lean('dawson').stamina).toBeLessThan(1);
  });
  it('bonds start where the bios say', () => {
    const s = fresh();
    expect(s.bond('price', 'walsh')).toBe(55);
    expect(s.bond('walsh', 'price')).toBe(55);
    expect(s.bond('stern', 'kessler')).toBeLessThan(0);
    expect(s.bond('brenner', 'dawson')).toBe(0);
    expect(new Set(BONDS.map((b) => pairKey(b.a, b.b))).size).toBe(BONDS.length);
  });
});

describe('after a mission', () => {
  it('a good mission lifts the men aboard; a bad one costs them', () => {
    const good = fresh(), bad = fresh();
    good.endSortie(sortie({ success: true, kills: { price: 2 } }));
    bad.endSortie(sortie({ success: false, lost: 2 }));
    expect(good.morale('price')).toBeGreaterThan(good.morale('walsh'));
    expect(good.morale('dawson')).toBeGreaterThan(MORALE_START);
    expect(bad.morale('dawson')).toBeLessThan(MORALE_START);
  });
  it('fatigue builds for the men who fly and drains for the men who rest', () => {
    const s = fresh();
    for (let i = 0; i < 3; i++) s.endSortie(sortie({ flew: ALL.filter((id) => id !== 'reilly'), lost: 3 }));
    expect(s.fatigue('dawson')).toBeGreaterThan(20);
    expect(s.fatigue('reilly')).toBe(0);
    expect(s.fatigue('dawson')).toBeLessThan(s.fatigue('stern'));   // tough tires slower
  });
  it('exhaustion lowers performance; the 48-hour pass restores the crew', () => {
    const s = fresh();
    for (let i = 0; i < PASS_EVERY - 1; i++) s.endSortie(sortie({ lost: 4, wounded: [] }));
    const before = s.fatigue('stern');
    expect(before).toBeGreaterThan(50);
    expect(s.mult('stern')).toBeLessThan(1);
    s.endSortie(sortie({ lost: 4 }));
    expect(s.fatigue('stern')).toBeLessThan(before);
    expect(s.journal.some((e) => e.kind === 'pass')).toBe(true);
  });
  it('a wounded man\'s friends feel it, and it brings them closer', () => {
    const s = fresh();
    const b0 = s.bond('price', 'walsh');
    s.endSortie(sortie({ wounded: ['walsh'] }));
    expect(s.morale('price')).toBeLessThan(s.morale('reilly'));
    expect(s.bond('price', 'walsh')).toBeGreaterThan(b0);
    expect(s.journal.some((e) => e.text === JOURNAL_TEXT.wounded && e.vars?.a === 'Walsh' && e.vars?.b === 'Price')).toBe(true);
  });
  it('a man killed: everyone grieves, his friend most; he leaves the stories', () => {
    const s = fresh();
    s.endSortie(sortie({ killed: ['walsh'] }));
    expect(s.dead.has('walsh')).toBe(true);
    expect(s.morale('price')).toBeLessThan(s.morale('reilly'));
    expect(s.morale('reilly')).toBeLessThan(MORALE_START);
    expect(s.journal.some((e) => e.text === JOURNAL_TEXT.killed && e.vars?.a === 'Walsh' && e.vars?.b === 'Price')).toBe(true);
    const morale = s.morale('walsh');
    s.endSortie(sortie());
    expect(s.morale('walsh')).toBe(morale);
  });
  it('heavy group losses are noted by the biggest worrier', () => {
    const s = fresh();
    s.endSortie(sortie({ lost: 5 }));
    expect(s.journal.find((e) => e.text === JOURNAL_TEXT.heavy)?.vars).toEqual({ n: 5, a: 'Stern' });
  });
  it('good missions together mend friction; bad ones sharpen it', () => {
    const s = fresh(), t = fresh();
    for (let i = 0; i < 25; i++) s.endSortie(sortie({ lost: 3 }));
    expect(s.bond('stern', 'kessler')).toBeGreaterThanOrEqual(0);
    expect(s.journal.some((e) => e.text === JOURNAL_TEXT.madeUp) || s.n > 0).toBe(true);
    for (let i = 0; i < 4; i++) t.endSortie(sortie({ success: false }));
    expect(t.bond('price', 'gallo')).toBeLessThan(-30);
    expect(t.bond('price', 'walsh')).toBe(55);   // friends are not hurt by a bad day
  });
  it('morale and fatigue stay in 0..100 over a long hard tour', () => {
    const s = fresh(always);
    for (let i = 0; i < 40; i++) s.endSortie(sortie({ success: i % 3 !== 0, lost: i % 4, wounded: i % 5 ? [] : ['gallo'] }));
    for (const id of ALL) {
      expect(s.morale(id)).toBeGreaterThanOrEqual(0); expect(s.morale(id)).toBeLessThanOrEqual(100);
      expect(s.fatigue(id)).toBeGreaterThanOrEqual(0); expect(s.fatigue(id)).toBeLessThanOrEqual(100);
    }
    expect(s.journal.length).toBeLessThanOrEqual(14);
    expect(s.letters.length).toBeLessThanOrEqual(12);
  });
});

describe('rituals', () => {
  it('a broken ritual unsettles the man for the mission, a superstitious man more', () => {
    const s = fresh(always);
    s.beginSortie(['kessler', 'stern']);
    expect(s.men.kessler.ritualBroken).toBe(true);
    expect(s.morale('kessler')).toBeLessThan(s.morale('stern'));
    expect(s.morale('stern')).toBeLessThan(MORALE_START);
    expect(s.morale('dawson')).toBe(MORALE_START);   // not aboard
    expect(s.journal.filter((e) => e.kind === 'ritual')).toHaveLength(2);
  });
  it('kept rituals change nothing', () => {
    const s = fresh(never);
    s.beginSortie([...ALL]);
    for (const id of ALL) expect(s.morale(id)).toBe(MORALE_START);
  });
});

describe('letters and replies', () => {
  it('mail call brings at most two letters a break', () => {
    const s = fresh(always);
    s.endSortie(sortie());
    expect(s.letters).toHaveLength(2);
    expect(s.inbox()).toHaveLength(2);
    expect(s.journal.filter((e) => e.kind === 'letter')).toHaveLength(2);
  });
  it('one reply per break, a lift in morale, more for bad news', () => {
    const s = fresh(never);
    s.letters.push({ id: 1, man: 'walsh', from: 'his mother', text: LETTERS[0].text, bad: false, n: 0, replied: false });
    s.letters.push({ id: 2, man: 'gallo', from: 'his mother', text: LETTERS[6].text, bad: true, n: 0, replied: false });
    const w = s.morale('walsh'), g = s.morale('gallo');
    expect(s.canReply).toBe(true);
    expect(s.reply(1)).toBe(true);
    expect(s.morale('walsh')).toBeCloseTo(w + REPLY_MORALE * lean('walsh').letters);
    expect(s.canReply).toBe(false);
    expect(s.reply(2)).toBe(false);
    expect(s.reply(1)).toBe(false);
    s.endSortie(sortie());
    expect(s.canReply).toBe(true);
    const g2 = s.morale('gallo');
    expect(s.reply(2)).toBe(true);
    expect(s.morale('gallo') - g2).toBeCloseTo(REPLY_MORALE_BAD * lean('gallo').letters);
    expect(g).toBeGreaterThan(0);
    expect(s.journal[0].text).toBe(JOURNAL_TEXT.reply);
  });
  it('unanswered letters fade after a few missions', () => {
    const s = fresh(never);
    s.letters.push({ id: 1, man: 'walsh', from: 'his mother', text: LETTERS[0].text, bad: false, n: 0, replied: false });
    for (let i = 0; i < 3; i++) s.endSortie(sortie());
    expect(s.inbox()).toHaveLength(0);
  });
});

describe('persistence', () => {
  it('saves and loads the whole state; ignores junk', () => {
    const store = new MemoryStorage();
    const a = fresh(always, store);
    a.endSortie(sortie({ wounded: ['reilly'], killed: ['walsh'], lost: 3 }));
    const b = fresh(never, store);
    expect(b.n).toBe(1);
    expect(b.morale('reilly')).toBeCloseTo(a.morale('reilly'));
    expect(b.fatigue('dawson')).toBeCloseTo(a.fatigue('dawson'));
    expect(b.bond('price', 'walsh')).toBe(a.bond('price', 'walsh'));
    expect(b.dead.has('walsh')).toBe(true);
    expect(b.letters).toEqual(a.letters);
    expect(b.journal).toEqual(a.journal);
    store.setItem(STORE_KEY, '{"v":1,"n":"x","men":{"price":{"morale":900}},"bonds":{"price|nobody":5},"letters":[{}],"dead":["ghost"]}');
    const c = fresh(never, store);
    expect(c.n).toBe(0);
    expect(c.morale('price')).toBe(100);
    expect(c.letters).toHaveLength(0);
    expect(c.dead.size).toBe(0);
    store.setItem(STORE_KEY, 'not json');
    expect(fresh(never, store).morale('price')).toBe(MORALE_START);
  });
});

describe('crew-room vignettes', () => {
  it('picks short written vignettes for the men in the room', () => {
    const s = fresh(always);
    s.endSortie(sortie());
    const v = s.vignettes(ALL);
    expect(v.length).toBeGreaterThan(0);
    expect(v.length).toBeLessThanOrEqual(2);
    for (const n of v) expect(Object.values(VIGNETTE_TEXT)).toContain(n.text);
    expect(v[0].kind === 'letter' || v[0].kind === 'badLetter').toBe(true);
  });
  it('remembers the fallen and leaves absent men out', () => {
    const s = fresh(never);
    s.endSortie(sortie({ killed: ['walsh'] }));
    const v = s.vignettes(ALL.filter((id) => id !== 'walsh'));
    expect(v[0]).toEqual({ kind: 'memorial', text: VIGNETTE_TEXT.memorial, vars: { a: 'Walsh', b: 'Price' } });
    const only = s.vignettes(['dawson'] as ManId[], 3);
    for (const n of only) expect(Object.values(n.vars).every((x) => x === 'Dawson' || x === 'Walsh' || !['Brenner', 'Price'].includes(x))).toBe(true);
  });
  it('shows exhaustion and low spirits', () => {
    const s = fresh(never);
    s.men.dawson.fatigue = 90; s.men.reilly.morale = 10;
    const kinds = s.vignettes(ALL, 4).map((n) => n.kind);
    expect(kinds).toContain('tired');
    expect(kinds).toContain('low');
  });
});

describe('Arabic', () => {
  it('every story text and UI label has a translation that keeps its placeholders', () => {
    const ui = ['CREW STORIES · MORALE AND BONDS', 'Mail call', 'The men', 'Friends and friction', 'Crew journal', 'Help him write back',
      'You have helped with one reply this break. More after the next mission.', 'No letters waiting. Mail comes after missions.',
      'Fly a mission with the crew and their stories start here.', 'Morale', 'Fatigue', 'Ritual', 'Morale: {m}', 'Fatigue: {f}', 'Performance {n}%', '{a} & {b}', 'Mission {n}',
      'Morale and fatigue change how well each man does his job. Good missions, letters and rest lift them; losses weigh on them.',
      'Brenner', 'Doyle', 'Stern', 'Kessler', 'Mendez', 'Gallo', 'Reilly', 'Price', 'Walsh', 'Dawson'];
    setLang('ar');
    for (const s of [...storyTexts(), ...ui]) {
      expect(hasPhrase(s), s).toBe(true);
      expect(placeholders(tx(s)), s).toEqual(placeholders(s));
      expect(tx(s), s).toMatch(/[؀-ۿ]/);
    }
  });
  it('fills names and senders in Arabic', () => {
    setLang('ar');
    const t = say(VIGNETTE_TEXT.letter, { a: 'Walsh', from: 'his mother' });
    expect(t).toContain('والش');
    expect(t).toContain('والدته');
    expect(t).not.toMatch(/[A-Za-z]{3}/);
  });
});

describe('the roster follows morale', () => {
  it('role skills are unchanged at neutral morale and fall when a man is shaken', async () => {
    const { crewRoster } = await import('../src/game/CrewRoster');
    const { crewStories } = await import('../src/game/CrewStories');
    const { roleStat } = await import('../src/game/CrewRoles');
    crewStories.reset();
    expect(crewRoster.roleStat('dawson', 'gunnery')).toBe(roleStat('dawson', 'gunnery', crewRoster.level('dawson')));
    crewStories.men.dawson.morale = 0; crewStories.men.dawson.fatigue = 100;
    expect(crewRoster.roleStat('dawson', 'gunnery')).toBeLessThan(roleStat('dawson', 'gunnery', crewRoster.level('dawson')));
    crewStories.men.dawson.morale = 100; crewStories.men.dawson.fatigue = 0;
    expect(crewRoster.roleStat('dawson', 'gunnery')).toBeGreaterThan(roleStat('dawson', 'gunnery', crewRoster.level('dawson')));
    crewStories.reset();
  });
});
