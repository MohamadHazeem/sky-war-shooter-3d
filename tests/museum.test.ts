import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { stubStorage } from './helpers';
import { setLang, tx } from '../src/i18n';
import { AIRCRAFT_SPECS, serviceLabel, specTexts, type AircraftId } from '../src/game/AircraftData';
import {
  MUSEUM, EncounterLog, encounters, factOpen, freshFacts, loadMuseum, markKnown, museumDebrief, museumTexts, museumTotals,
  openFacts, openSnapshot, ruleText, type MuseumStats,
} from '../src/game/Museum';
import { CODEX_SHELVES, codexEntries, codexTexts, entryOpen } from '../src/game/Codex';
import { MEDALS } from '../src/game/Career';
import { CAMPAIGN } from '../src/game/Missions';
import { HANGAR_TABS } from '../src/game/MenuModel';

const FS = 'node:fs';
const { readFileSync } = (await import(FS)) as { readFileSync(p: URL, enc: 'utf8'): string };
const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

const stats = (o: { seen?: Partial<Record<AircraftId, number>>; kills?: Partial<Record<AircraftId, number>>; missions?: number } = {}): MuseumStats =>
  ({ seen: (id) => o.seen?.[id] ?? 0, kills: (id) => o.kills?.[id] ?? 0, missions: o.missions ?? 0 });

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); });

describe('museum data', () => {
  it('has every aircraft of the brief, on the turntable, with history, crew and four facts', () => {
    const brief: AircraftId[] = ['b17', 'p51d', 'p47d', 'spitfire9', 'bf109', 'fw190', 'me262', 'bf110', 'ju88', 'me410', 'me163'];
    const ids = AIRCRAFT_SPECS.map((s) => s.id);
    for (const id of brief) expect(ids, id).toContain(id);
    for (const s of AIRCRAFT_SPECS) {
      const e = MUSEUM[s.id];
      expect(e, s.id).toBeTruthy();
      expect(e.history.length, s.id).toBeGreaterThan(60);
      expect(e.crew.length, s.id).toBeGreaterThan(0);
      expect(e.facts.length, s.id).toBe(4);
      expect(e.facts[0].rule.kind, s.id).toBe('free');
    }
    expect(MUSEUM.b17.crew.length).toBe(10);
    expect(MUSEUM.p47d.facts.map((f) => f.text).join(' ')).toContain('15,636');
  });

  it('the P-47 and Spitfire cards use their own models and real figures', () => {
    const by = (id: string) => AIRCRAFT_SPECS.find((s) => s.id === id)!;
    expect(by('p47d').model).toBe('p47d');
    expect(by('spitfire9').model).toBe('spitfire9');
    expect(by('p47d').side).toBe('allied');
    expect(by('p47d').first).toBe('6 May 1941');
    expect(by('spitfire9').first).toBe('5 March 1936 (Mk IX: 1942)');
    expect(serviceLabel(by('spitfire9'))).toBe('Allied · RAF');
    expect(serviceLabel(by('p47d'))).toBe('Allied · USAAF');
    expect(serviceLabel(by('fw190'))).toBe('Luftwaffe');
    expect(serviceLabel(by('boss'))).toBe('Fictional · boss');
    for (const id of ['p47d', 'spitfire9']) for (const t of specTexts(by(id))) expect(t.length).toBeLessThan(120);
  });

  it('facts open by encounters, kills and missions', () => {
    const none = stats();
    expect(openFacts('fw190', none)).toBe(1);
    expect(openFacts('fw190', stats({ seen: { fw190: 1 } }))).toBe(2);
    expect(openFacts('fw190', stats({ kills: { fw190: 1 } }))).toBe(2);     // a kill is an encounter too
    expect(openFacts('fw190', stats({ seen: { fw190: 9 }, kills: { fw190: 3 } }))).toBe(3);
    expect(openFacts('fw190', stats({ kills: { fw190: 10 } }))).toBe(4);
    expect(openFacts('p47d', stats({ seen: { p47d: 3 } }))).toBe(3);
    expect(openFacts('b17', stats({ missions: 5 }))).toBe(3);
    expect(openFacts('boss', stats({ kills: { boss: 2 } }))).toBe(3);
    expect(factOpen({ kind: 'missions', n: 10 }, 'b17', stats({ missions: 9 }))).toBe(false);
    const t = museumTotals(none);
    expect(t.open).toBe(AIRCRAFT_SPECS.length);
    expect(t.total).toBe(AIRCRAFT_SPECS.length * 4);
  });

  it('the lock lines', () => {
    expect(ruleText({ kind: 'seen', n: 1 })).toEqual(['Meet it in a mission', {}]);
    expect(ruleText({ kind: 'kills', n: 3 })).toEqual(['Shoot down {n}', { n: 3 }]);
    expect(ruleText({ kind: 'missions', n: 5 })).toEqual(['Fly {n} missions', { n: 5 }]);
  });
});

describe('encounter log', () => {
  it('records only while armed, each type once per mission', () => {
    const log = new EncounterLog();
    log.note('fw190');                      // the menu scene: not armed
    expect(log.flush()).toEqual([]);
    log.arm();
    log.note('fw190'); log.note('fw190'); log.note('bf109'); log.note('p47d'); log.note('unknown');
    expect(log.flush().sort()).toEqual(['bf109', 'fw190', 'p47d']);
    expect(loadMuseum().seen).toEqual({ fw190: 1, bf109: 1, p47d: 1 });
    log.note('fw190');                      // after the debrief: not armed
    expect(log.flush()).toEqual([]);
    log.arm(); log.note('fw190'); log.flush();
    expect(loadMuseum().seen.fw190).toBe(2);
  });

  it('the debrief names the aircraft whose files gained facts', () => {
    const before = openSnapshot(stats());
    encounters.arm();
    encounters.note('me262');
    encounters.note('fw190');
    const ids = museumDebrief(before, () => { const s = loadMuseum().seen; return stats({ seen: s as Record<AircraftId, number>, kills: { bf109: 3 } }); });
    expect(ids.sort()).toEqual(['bf109', 'fw190', 'me262']);
  });

  it('new facts are marked until the player reads them; a corrupt save is ignored', () => {
    const s = stats({ seen: { fw190: 1 }, kills: { me163: 3 } });
    expect(freshFacts(s)).toEqual({ fw190: 1, me163: 2 });
    markKnown('me163', s);
    expect(freshFacts(s)).toEqual({ fw190: 1 });
    localStorage.setItem('sws3d.museum.v1', '{oops');
    expect(loadMuseum()).toEqual({ seen: {}, known: {} });
  });
});

describe('codex', () => {
  it('three shelves: every crew role, every medal, every campaign operation', () => {
    const e = codexEntries();
    expect(CODEX_SHELVES.map((s) => s.id)).toEqual(['crew', 'medals', 'ops']);
    expect(e.filter((x) => x.shelf === 'crew').length).toBe(9);
    expect(e.filter((x) => x.shelf === 'medals').map((x) => x.title)).toEqual(MEDALS.map((m) => m.name));
    expect(e.filter((x) => x.shelf === 'ops').map((x) => x.id)).toEqual(CAMPAIGN.map((m) => `op:${m.id}`));
    for (const x of e) { expect(x.body.length, x.id).toBeGreaterThan(40); expect(x.game.length, x.id).toBeGreaterThan(0); }
    expect(new Set(e.map((x) => x.id)).size).toBe(e.length);
    // each operation's history names the mission's date
    for (const m of CAMPAIGN) expect(e.find((x) => x.id === `op:${m.id}`)!.body, m.id).toContain(m.date);
  });

  it('operations open once flown; crew and medals are always open', () => {
    const ctx = { medals: () => 0, flown: (id: string) => id === 'm1' };
    const e = codexEntries();
    expect(entryOpen(e.find((x) => x.id === 'op:m1')!, ctx)).toBe(true);
    expect(entryOpen(e.find((x) => x.id === 'op:m2')!, ctx)).toBe(false);
    expect(e.filter((x) => x.shelf !== 'ops').every((x) => entryOpen(x, ctx))).toBe(true);
  });

  it('the museum is in Hangar and its hooks are wired', () => {
    const entry = HANGAR_TABS.find((t) => t.id === 'aircraft')!.entries.find((x) => x[0] === 'aircraft')!;
    expect(entry[1]).toBe('Museum');
    expect(source('world/World.ts').match(/encounters\.note\(/g)?.length).toBe(2);
    expect(source('game/MissionFlow.ts')).toContain('encounters.arm()');
    expect(source('game/MissionFlow.ts')).toContain('museumDebrief(');
  });
});

describe('Arabic for the museum and codex', () => {
  beforeEach(() => { setLang('ar'); });
  const arabic = /[؀-ۿ]/;
  // Latin kept in Arabic text: aircraft and weapon designations
  const KEEP = /B-17G?|P-51D?|P-47D?|Fw 190|Bf 109|Bf 110|Ju 88( G)?|Me 262|Me 163|Me 410|Me 323|Me 210|He 111|Do 335|\b[A-Z]-\d+\b|\bM2\b|\bBK 5\b|\b(?:LT|RT|LB|RB)\b|\b[A-Z]\b/g;
  const check = (s: string) => {
    const out = tx(s);
    expect(out, s).toMatch(arabic);
    expect(out.replace(/\{\w+\}/g, '').replace(KEEP, ''), `untranslated words in: ${s}\n→ ${out}`).not.toMatch(/[A-Za-z]{2,}/);
  };

  it('every museum, codex and screen text', () => {
    for (const s of [...museumTexts(), ...codexTexts()]) check(s);
    for (const id of ['p47d', 'spitfire9']) for (const t of specTexts(AIRCRAFT_SPECS.find((s) => s.id === id)!)) {
      if (/[A-Za-z]/.test(t.replace(KEEP, ''))) check(t);
    }
    const lit = (f: string) => [...source(f).matchAll(/tx\((['"])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((m) => m[2].replace(/\\'/g, "'"));
    for (const s of [...lit('ui/GalleryScreen.ts'), ...lit('ui/CodexPanel.ts')]) if (s.trim() !== ',') check(s);
    for (const s of ['Specs', 'History', 'Crew', 'Facts', 'Museum', 'Aircraft, crew, medals and operations', 'Meet it in {n} missions', 'Shoot one down', 'Shoot down {n}', 'Fly {n} missions']) check(s);
    for (const m of CAMPAIGN) check(m.date);
    expect(tx('Facts found: {n} / {total}', { n: 2, total: 4 })).toBe('الحقائق المكتشفة: 2 / 4');
  });

  it('English is unchanged', () => {
    setLang('en');
    for (const s of museumTexts()) expect(tx(s)).toBe(s);
  });
});
