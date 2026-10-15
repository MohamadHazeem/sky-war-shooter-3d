import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { stubStorage } from './helpers';
import {
  CREW_IDS, FILE_MAX, IMAGE_MAX, MOD_FORMAT, PACKS_MAX, cleanText, installPack, loadInstalled, modItemId, modTemplate, packToJson, parseMod,
  sanitizeInstalled, saveInstalled, validateMod, type ModIssue, type ModPack, type ModResult,
} from '../src/game/Mods';
import { DEFAULT_SPEC, USER_MISSION_ID, buildUserMission, decodeMission, encodeMission } from '../src/game/MissionEditor';
import { MEN } from '../src/game/CrewRoster';
import { activeModMissions, applyMods, initMods, installedMods, setInstalled } from '../src/game/ModRuntime';
import { isModKey, modNose, modPaint, modPaints } from '../src/render/ModArt';
import { owns } from '../src/game/Customize';
import { Progression } from '../src/game/Upgrades';
import { HANGAR_TABS } from '../src/game/MenuModel';
import { modeFor } from '../src/game/Modes';
import '../src/ui/MissionEditorScreen';   // registers the player-mission mode, as Game.ts does
import { hasPhrase, setLang, tx } from '../src/i18n';
import ar from '../src/i18n/ar/mods';
import fr from '../src/i18n/fr/mods';
import de from '../src/i18n/de/mods';
import es from '../src/i18n/es/mods';

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); setInstalled([]); });

const base = (extra: Record<string, unknown> = {}) => ({ format: MOD_FORMAT, version: 1, id: 'test-mod', name: 'Test Mod', crew: { dawson: { first: 'Sam' } }, ...extra });
const ok = (r: ModResult): ModPack => { if (!r.ok) throw new Error(JSON.stringify(r.errors)); return r.pack; };
const keys = (r: ModResult) => (r.ok ? [] : r.errors.map((e) => e.key));
const example = (f: string) => readFileSync(`public/mods/${f}`, 'utf8');

describe('mod files: the examples and the template', () => {
  it('every bundled example and the template are valid mods, listed in the index', () => {
    const index = JSON.parse(example('index.json')) as { id: string; file: string; name: string; description: string }[];
    const files = readdirSync('public/mods').filter((f) => f.endsWith('.json') && f !== 'index.json');
    expect(index.map((e) => e.file).sort()).toEqual(files.sort());
    for (const e of index) {
      const r = parseMod(example(e.file));
      expect(r.ok, e.file).toBe(true);
      const p = ok(r);
      expect(p.id).toBe(e.id);
      expect(p.name).toBe(e.name);
      expect(r.ok && r.warnings).toEqual([]);
    }
    const extras = ok(parseMod(example('eighth-extras.json')));
    expect(extras.missions).toHaveLength(3);
    expect(extras.paints.some((p) => p.pattern)).toBe(true);
    expect(extras.noseArt).toHaveLength(2);
    const t = parseMod(JSON.stringify(modTemplate()));
    expect(t.ok).toBe(true);
    expect(t.ok && t.warnings).toEqual([]);
  });

  it('a mission given by fields equals the same mission given as a Mission Editor code', () => {
    const fields = ok(validateMod(base({ missions: [{ id: 'aa', name: 'Dawn', target: 'Docks, Bremen', route: 'short', weather: 'fog', sunElevation: 12, seat: 'tail', bombers: 9, skill: 'ace', escorts: 'none', flak: 'deadly', waves: [{ leg: 'home', from: 'high', count: 7, types: ['me262', 'fw190'] }] }] })));
    const m = fields.missions[0];
    expect(m.spec).toMatchObject({ name: 'Dawn', target: 1, route: 'short', mood: 'fog', sunEl: 12, station: 'tail', bombers: 9, skill: 'ace', escorts: 'none', flak: 3 });
    expect(m.spec.waves).toEqual([{ leg: 'home', from: 'high', count: 7, types: ['fw190', 'me262'] }]);
    const coded = ok(validateMod(base({ missions: [{ id: 'aa', code: m.code }] })));
    expect(coded.missions[0].spec).toEqual(m.spec);
    // a target by index, flak by number, omitted fields take the editor defaults
    const short = ok(validateMod(base({ missions: [{ id: 'bb', target: 2, flak: 1 }] }))).missions[0].spec;
    expect(short).toMatchObject({ target: 2, flak: 1, route: DEFAULT_SPEC.route, waves: DEFAULT_SPEC.waves });
    // flown like any player mission: one progress id and no leaderboard
    const flown = buildUserMission(m.spec);
    expect(flown.id).toBe(USER_MISSION_ID);
    expect(modeFor(flown)?.board('gunner')).toBe('');
  });
});

describe('mod files: rejected input', () => {
  const cases: [string, unknown, string][] = [
    ['wrong format', { ...base(), format: 'other' }, 'Not a Sky War mod: the file needs "format": "sws3d-mod".'],
    ['newer version', { ...base(), version: 2 }, 'This mod needs a newer version of the game (mod format {v}).'],
    ['bad version', { ...base(), version: '1' }, '{path}: must be a whole number from {min} to {max}.'],
    ['bad id', base({ id: 'Bad Id!' }), '{path}: id must be 2-24 lowercase letters, digits or dashes.'],
    ['no name', base({ name: '   ' }), '{path}: missing text.'],
    ['long name', base({ name: 'x'.repeat(41) }), '{path}: too long (at most {n} characters).'],
    ['empty', { format: MOD_FORMAT, version: 1, id: 'empty', name: 'Empty' }, 'This mod has no missions, paint schemes, nose art or crew names.'],
    ['missions not a list', base({ missions: {} }), '{path}: must be a list.'],
    ['too many missions', base({ missions: Array.from({ length: 13 }, (_, i) => ({ id: `m${i}x` })) }), '{path}: too many entries (at most {n}).'],
    ['duplicate mission id', base({ missions: [{ id: 'same' }, { id: 'same' }] }), '{path}: id "{id}" is used twice.'],
    ['unknown enemy', base({ missions: [{ id: 'm1', waves: [{ types: ['spitfire'] }] }] }), '{path}: must be one of: {list}.'],
    ['wave count range', base({ missions: [{ id: 'm1', waves: [{ count: 40 }] }] }), '{path}: must be a whole number from {min} to {max}.'],
    ['fractional count', base({ missions: [{ id: 'm1', waves: [{ count: 2.5 }] }] }), '{path}: must be a whole number from {min} to {max}.'],
    ['no waves', base({ missions: [{ id: 'm1', waves: [] }] }), '{path}: needs at least one wave.'],
    ['too many waves', base({ missions: [{ id: 'm1', waves: Array(9).fill({}) }] }), '{path}: too many entries (at most {n}).'],
    ['unknown target', base({ missions: [{ id: 'm1', target: 'Paris' }] }), '{path}: must be one of: {list}.'],
    ['bad weather', base({ missions: [{ id: 'm1', weather: 'sunny' }] }), '{path}: must be one of: {list}.'],
    ['bad flak', base({ missions: [{ id: 'm1', flak: 'huge' }] }), '{path}: must be one of: {list}.'],
    ['bad code', base({ missions: [{ id: 'm1', code: 'AAAA' }] }), '{path}: mission code not valid.'],
    ['bad colour', base({ paints: [{ id: 'p1', name: 'P', top: 'red' }] }), '{path}: colour must look like #5a5a2a.'],
    ['css injection colour', base({ paints: [{ id: 'p1', name: 'P', top: '#000000;background:url(x)' }] }), '{path}: colour must look like #5a5a2a.'],
    ['paint without colour', base({ paints: [{ id: 'p1', name: 'P' }] }), '{path}: a paint scheme needs a "top" colour or a "pattern" image.'],
    ['scale range', base({ paints: [{ id: 'p1', name: 'P', top: '#112233', scale: 20 }] }), '{path}: must be a number from {min} to {max}.'],
    ['metal not boolean', base({ paints: [{ id: 'p1', name: 'P', top: '#112233', metal: 'yes' }] }), '{path}: must be true or false.'],
    ['web image', base({ noseArt: [{ id: 'n1', name: 'N', image: 'https://example.com/a.png' }] }), '{path}: image must be an embedded PNG, JPEG or WebP (a data:image/…;base64 URL).'],
    ['svg image', base({ noseArt: [{ id: 'n1', name: 'N', image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }] }), '{path}: image must be an embedded PNG, JPEG or WebP (a data:image/…;base64 URL).'],
    ['quote in image', base({ noseArt: [{ id: 'n1', name: 'N', image: 'data:image/png;base64,AAAA");x:url("' }] }), '{path}: image must be an embedded PNG, JPEG or WebP (a data:image/…;base64 URL).'],
    ['huge image', base({ noseArt: [{ id: 'n1', name: 'N', image: 'data:image/png;base64,' + 'A'.repeat(IMAGE_MAX) }] }), '{path}: image is too large (at most {kb} KB).'],
    ['missing image', base({ noseArt: [{ id: 'n1', name: 'N' }] }), '{path}: missing image.'],
    ['unknown crewman', base({ crew: { hitler: { first: 'X' } } }), '{path}: unknown crewman (use one of: {list}).'],
    ['inherited key', base({ crew: JSON.parse('{"__proto__": {"first": "X"}}') }), '{path}: unknown crewman (use one of: {list}).'],
    ['crew not object', base({ crew: { dawson: 'Sam' } }), '{path}: must be an object.'],
    ['long crew name', base({ crew: { dawson: { last: 'x'.repeat(17) } } }), '{path}: too long (at most {n} characters).'],
    ['crew name of symbols', base({ crew: { dawson: { nick: '<<>>' } } }), '{path}: missing text.'],
  ];
  for (const [label, raw, key] of cases) it(`rejects ${label}`, () => {
    const r = validateMod(raw);
    expect(r.ok).toBe(false);
    expect(keys(r)).toContain(key);
  });

  it('rejects files that are not JSON, empty or too large', () => {
    expect(keys(parseMod(''))).toEqual(['The file is empty.']);
    expect(keys(parseMod('{ "format": "sws3d-mod", '))).toEqual(['This is not valid JSON. Check for a missing comma or quote.']);
    expect(keys(parseMod(' '.repeat(FILE_MAX) + '{}'))).toEqual(['The file is too large (at most {kb} KB).']);
    expect(keys(parseMod('[1,2]'))).toEqual(['Not a Sky War mod: the file needs "format": "sws3d-mod".']);
    expect(keys(parseMod('null'))).toEqual(['Not a Sky War mod: the file needs "format": "sws3d-mod".']);
  });

  it('cleans text, drops unknown fields with a warning and never merges inherited keys', () => {
    const r = validateMod({ ...base({ name: 'Evil <img src=x onerror=alert(1)>‮ mod', description: 'a\u0000b\n\nc', extra: 1 }), crew: { dawson: { first: 'Sam<b>', nick: 'O\'Neil-Jr.', foo: 1 } } });
    const p = ok(r);
    expect(p.name).not.toMatch(/[<>‮]/);
    expect(p.description).toBe('a b c');
    expect(p.crew.dawson).toEqual({ first: 'Sam b', nick: 'O\'Neil-Jr.' });
    expect(r.ok && r.warnings.map((w) => w.vars?.field)).toEqual(['extra', 'foo']);
    const polluted = validateMod(JSON.parse('{"format":"sws3d-mod","version":1,"id":"pp","name":"P","__proto__":{"x":1},"crew":{"dawson":{"first":"A","__proto__":{"y":1}}}}'));
    expect(polluted.ok).toBe(true);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(Object.getPrototypeOf(ok(polluted).crew.dawson)).toBe(Object.prototype);
    expect(cleanText('a⁦b‏c', 10)).toBe('a b c');
  });

  it('a fuzz of mutated mod files never throws and only ever accepts valid content', () => {
    const src = JSON.parse(example('eighth-extras.json'));
    let a = 7;
    const r = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
    const junk = [null, -1, 1e9, 3.5, '', 'x', '#zzzzzz', true, [], {}, ['fw190'], 'data:image/png;base64,@@'];
    const mutate = (v: unknown, depth: number): unknown => {
      if (r() < 0.06 || depth > 5) return junk[Math.floor(r() * junk.length)];
      if (Array.isArray(v)) return v.map((x) => mutate(x, depth + 1));
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [r() < 0.02 ? k + '_' : k, mutate(x, depth + 1)]));
      return v;
    };
    let accepted = 0;
    for (let i = 0; i < 400; i++) {
      const res = validateMod(mutate(src, 0));
      if (!res.ok) { expect(res.errors.length).toBeGreaterThan(0); continue; }
      accepted++;
      for (const m of res.pack.missions) expect(decodeMission(m.code)).toMatchObject({ ok: true, spec: m.spec });
      for (const p of res.pack.paints) { expect(p.top).toMatch(/^#[0-9a-f]{6}$/); expect(p.under).toMatch(/^#[0-9a-f]{6}$/); }
      for (const n of res.pack.noseArt) expect(n.image).toMatch(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/);
    }
    expect(accepted).toBeGreaterThan(0);
  });
});

describe('installed mods', () => {
  const pack = (id: string, extra: Record<string, unknown> = {}) => ok(validateMod(base({ id, ...extra })));

  it('install, replace (keeping on/off), cap and storage round trip', () => {
    let list = installedMods().slice();
    const a = installPack(list, pack('alpha'), 'alpha.json', 1);
    expect(a.ok && a.replaced).toBe(false);
    list = a.ok ? a.list : list;
    list[0] = { ...list[0], enabled: false };
    const b = installPack(list, pack('alpha', { name: 'Alpha 2' }), 'alpha.json', 2);
    expect(b.ok && b.replaced).toBe(true);
    list = b.ok ? b.list : list;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ enabled: false, at: 2, pack: { name: 'Alpha 2' } });
    for (let i = 1; i < PACKS_MAX; i++) { const r = installPack(list, pack(`p${i}x`), 'f', i); if (r.ok) list = r.list; }
    expect(list).toHaveLength(PACKS_MAX);
    const full = installPack(list, pack('overflow'), 'f');
    expect(full.ok).toBe(false);
    expect(saveInstalled(list)).toBe(true);
    expect(loadInstalled().map((m) => m.pack.id)).toEqual(list.map((m) => m.pack.id));
  });

  it('stored mods are validated again: tampered entries are dropped', () => {
    const good = { pack: pack('good'), enabled: true, at: 1, source: 'g.json' };
    const bad = { pack: { ...pack('bad'), paints: [{ id: 'x1', name: 'X', top: 'url(javascript:1)', under: '#000000', metal: false, scale: 1 }] }, enabled: true, at: 1, source: 'b.json' };
    const list = sanitizeInstalled([good, bad, 'junk', null, { ...good }]);
    expect(list.map((m) => m.pack.id)).toEqual(['good']);
    expect(sanitizeInstalled(JSON.parse(JSON.stringify(list)))).toEqual(list);
    expect(packToJson(list[0].pack).format).toBe(MOD_FORMAT);
  });

  it('applies enabled mods: crew names (restored when off), paint and nose art, missions', () => {
    expect([...CREW_IDS].sort()).toEqual(MEN.map((m) => m.id).sort());
    const dawson = MEN.find((m) => m.id === 'dawson')!;
    const before = { first: dawson.first, last: dawson.last, nick: dawson.nick, call: dawson.call };
    const p = ok(parseMod(example('eighth-extras.json')));
    const crew = ok(parseMod(example('hometown-crew.json')));
    expect(setInstalled([{ pack: p, enabled: true, at: 1, source: 'x' }, { pack: crew, enabled: true, at: 2, source: 'y' }])).toBe(true);
    expect(dawson).toMatchObject({ first: 'Lyle', last: 'Becker', nick: 'Owl', call: before.call });   // radio calls keep the recorded names
    const paintId = modItemId('eighth-extras', 'desert-camo');
    expect(modPaint(paintId)).toMatchObject({ name: 'Desert Camo', pack: 'Mighty Eighth Extras' });
    expect(modNose(modItemId('eighth-extras', 'checkertail'))?.showName).toBe(true);
    expect(isModKey('paint:' + paintId)).toBe(true);
    const prog = new Progression();
    expect(owns(prog, 'paint:' + paintId)).toBe(true);
    expect(owns(prog, 'paint:mod.eighth-extras.nope')).toBe(false);
    expect(activeModMissions().map((m) => m.mission.id)).toEqual(['black-thursday', 'jet-scare', 'milk-run']);
    // switched off: nothing stays active and the crew get their own names back
    setInstalled(installedMods().map((m) => ({ ...m, enabled: false })));
    expect(dawson).toMatchObject(before);
    expect(modPaints()).toHaveLength(0);
    expect(isModKey('paint:' + paintId)).toBe(false);
    expect(owns(prog, 'paint:' + paintId)).toBe(false);
    expect(activeModMissions()).toEqual([]);
    // and they come back from storage on the next start
    setInstalled(installedMods().map((m) => ({ ...m, enabled: m.pack.id === 'hometown-crew' })));
    for (const m of MEN) Object.assign(m, { first: 'x' });
    initMods();
    expect(dawson.first).toBe('Lyle');
    setInstalled([]);
    applyMods();
    expect(dawson).toMatchObject(before);
  });
});

describe('mods: menu and translations', () => {
  it('the Mods screen is a hangar entry', () => {
    expect(HANGAR_TABS.flatMap((t) => t.entries.map((e) => e[0]))).toContain('mods');
  });

  it('every problem, screen text and example has Arabic, French, German and Spanish', async () => {
    const issues: ModIssue[] = [];
    const collect = (r: ModResult) => { issues.push(...(r.ok ? r.warnings : [...r.errors, ...r.warnings])); };
    collect(parseMod('')); collect(parseMod('{')); collect(parseMod(' '.repeat(FILE_MAX + 1)));
    collect(validateMod({ format: MOD_FORMAT, version: 9 }));
    collect(validateMod({ format: MOD_FORMAT, version: 1, id: 'e1', name: 'E' }));
    collect(validateMod(base({ extra: 1, missions: [{ id: 'a', code: 'x' }, { id: 'a', waves: [] }, { id: 'b', waves: [{ count: 99, types: ['x'] }] }, 5],
      paints: [{ id: 'p1', name: 'x'.repeat(50), top: 'red', metal: 1, scale: 99, pattern: 'http://x' }, { id: 'p2', name: 'P' }],
      noseArt: [{ id: 'n1', name: 'N' }, { id: 'n2', name: 'N', image: 'data:image/png;base64,' + 'A'.repeat(IMAGE_MAX) }],
      crew: { nobody: {}, dawson: { first: 5, last: '' } } })));
    const r = installPack(Array.from({ length: PACKS_MAX }, (_, i) => ({ pack: ok(validateMod(base({ id: `p${i}x` }))), enabled: true, at: 0, source: '' })), ok(validateMod(base({ id: 'zz' }))), '');
    if (!r.ok) issues.push(r.error);
    issues.push({ key: 'Not enough room for this mod. Remove a mod with large images first.' });
    const src = readFileSync('src/ui/ModsScreen.ts', 'utf8') + readFileSync('src/render/ModArt.ts', 'utf8') + readFileSync('src/ui/CrateUI.ts', 'utf8');
    const literals = [...src.matchAll(/tx\('((?:[^'\\]|\\.)+)'/g), ...src.matchAll(/count\([^,]+, '([^']+)', '([^']+)'\)/g)].flatMap((m) => m.slice(1)).filter(Boolean).map((s) => s.replace(/\\'/g, '\''));
    const index = JSON.parse(example('index.json')) as { name: string; description: string }[];
    const texts = new Set([...issues.map((i) => i.key), ...literals, ...index.flatMap((e) => [e.name, e.description]), 'Mods', 'Missions, paint and crews made by players',
      'Installed', 'Install', 'On', 'Off', 'Updated {name}.', 'Added {name}. It is switched on.']);
    expect(texts.size).toBeGreaterThan(70);
    for (const t of texts) expect(hasPhrase(t), t).toBe(true);
    for (const t of Object.keys(ar.phrases)) {
      expect(ar.phrases[t], t).toMatch(/[؀-ۿ]/);
      for (const [name, table] of [['fr', fr], ['de', de], ['es', es]] as const) {
        expect(table.phrases[t], `${name}: ${t}`).toBeTruthy();
        // the same placeholders in every language
        expect((table.phrases[t].match(/\{\w+\}/g) ?? []).sort(), `${name}: ${t}`).toEqual((t.match(/\{\w+\}/g) ?? []).sort());
      }
      expect((ar.phrases[t].match(/\{\w+\}/g) ?? []).sort(), t).toEqual((t.match(/\{\w+\}/g) ?? []).sort());
    }
    await setLang('ar');
    expect(tx('{path}: must be a list.', { path: 'missions' })).toMatch(/missions.*قائمة/);
  });
});
