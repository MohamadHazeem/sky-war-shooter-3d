import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { stubStorage } from './helpers';
import {
  ALL_ENEMIES, MOODS, SEATS, SKILLS,
} from '../src/game/CustomBattle';
import {
  BOMBERS, CODE_MAX, DEFAULT_SPEC, ESCORTS, ESCORT_LABEL, FLAK_LABEL, FROM_LABEL, FROMS, LEG_LABEL, LEGS, LIBRARY_MAX, NAME_MAX, ROUTE_LABEL, ROUTES,
  TARGETS, USER_MISSION_ID, WAVES_MAX, DECODE_ERROR_TEXT, type MissionSpec,
  addToLibrary, buildUserMission, checksum, cleanName, decodeMission, describeSpec, encodeMission, extractCode, legStart, linkCode,
  loadLibrary, rateMission, recordPlay, removeFromLibrary, routeTimes, sanitizeLibrary, sanitizeSpec, shareLink, userMissionCode, withoutLinkCode,
} from '../src/game/MissionEditor';
import { USER_MODE } from '../src/ui/MissionEditorScreen';
import { leaderboardMode, modeFor, MODES } from '../src/game/Modes';
import { setLang, tx } from '../src/i18n';
import type { Mission } from '../src/game/Missions';

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); });

// a deterministic stream of specs covering every option
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];
function randomSpec(r: () => number): MissionSpec {
  const n = 1 + Math.floor(r() * WAVES_MAX);
  return sanitizeSpec({
    name: pick(r, ['', 'Black Week', 'غارة الفجر', 'Op. Thunder #3', 'A', 'Zürich (II): dawn!']),
    target: Math.floor(r() * TARGETS.length), route: pick(r, ROUTES), mood: pick(r, MOODS), sunEl: 2 + Math.floor(r() * 69),
    station: pick(r, SEATS), bombers: pick(r, BOMBERS), skill: pick(r, SKILLS), escorts: pick(r, ESCORTS), flak: Math.floor(r() * 4),
    waves: Array.from({ length: n }, () => ({
      leg: pick(r, LEGS), from: pick(r, FROMS), count: 1 + Math.floor(r() * 12),
      types: ALL_ENEMIES.filter(() => r() < 0.3),
    })),
  });
}

// raw bytes -> the code alphabet (base64url without padding), with a correct checksum appended
function codeFrom(bytes: number[]): string {
  const sum = checksum(bytes);
  const all = [...bytes, sum >> 8, sum & 255];
  let bin = '';
  for (const b of all) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bytesOf(code: string): number[] {
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (code.length % 4)) % 4));
  return [...bin].map((c) => c.charCodeAt(0));
}

describe('share codes', () => {
  it('round-trip every option exactly', () => {
    const r = rng(7);
    for (let i = 0; i < 400; i++) {
      const s = randomSpec(r);
      const code = encodeMission(s);
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(code.length).toBeLessThanOrEqual(CODE_MAX);
      const d = decodeMission(code);
      expect(d.ok, code).toBe(true);
      if (d.ok) { expect(d.spec).toEqual(s); expect(d.code).toBe(code); }
    }
  });

  it('is compact: the default mission is a short code, the largest fits a link', () => {
    expect(encodeMission(DEFAULT_SPEC).length).toBeLessThan(30);
    const big = sanitizeSpec({ ...DEFAULT_SPEC, name: 'ي'.repeat(NAME_MAX), waves: Array.from({ length: WAVES_MAX }, () => ({ leg: 'home', from: 'mixed', count: 12, types: ALL_ENEMIES })) });
    expect(encodeMission(big).length).toBeLessThanOrEqual(CODE_MAX);
    expect(decodeMission(encodeMission(big)).ok).toBe(true);
  });

  it('accepts a pasted link or a #fragment as well as the bare code', () => {
    const code = encodeMission(DEFAULT_SPEC);
    const link = shareLink('https://example.com/play/?lang=ar#x', code);
    expect(link).toBe(`https://example.com/play/?mission=${code}`);
    expect(extractCode(`  ${link}  `)).toBe(code);
    expect(decodeMission(link).ok).toBe(true);
    expect(decodeMission(`https://example.com/#mission=${code}`).ok).toBe(true);
    expect(linkCode(link)).toBe(code);
    expect(linkCode(`https://example.com/#mission=${code}`)).toBe(code);
    expect(linkCode('https://example.com/?join=ABCD')).toBeNull();
    expect(withoutLinkCode(`https://example.com/?mission=${code}&join=X`)).toBe('https://example.com/?join=X');
  });

  it('rejects empty, foreign, damaged and oversized codes without throwing', () => {
    expect(decodeMission('')).toEqual({ ok: false, error: 'empty' });
    expect(decodeMission(undefined)).toEqual({ ok: false, error: 'empty' });
    expect(decodeMission({ code: 1 })).toEqual({ ok: false, error: 'empty' });
    expect(decodeMission('<script>alert(1)</script>')).toEqual({ ok: false, error: 'format' });
    expect(decodeMission('A'.repeat(CODE_MAX + 4))).toEqual({ ok: false, error: 'format' });
    const code = encodeMission(DEFAULT_SPEC);
    // every single-character typo is caught
    const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let caught = 0, tried = 0;
    for (let i = 0; i < code.length; i++) {
      const c = alpha[(alpha.indexOf(code[i]) + 17) % 64];
      const d = decodeMission(code.slice(0, i) + c + code.slice(i + 1));
      tried++;
      if (!d.ok) caught++;
      else expect(d.code).toBe(code);   // only the unused low bits of the last character may change
    }
    expect(caught).toBeGreaterThanOrEqual(tried - 1);
    expect(decodeMission(code.slice(0, -3)).ok).toBe(false);
    for (const e of ['empty', 'format', 'checksum', 'version', 'invalid'] as const) expect(DECODE_ERROR_TEXT[e]).toBeTruthy();
  });

  it('rejects a newer version and out-of-range values even with a valid checksum', () => {
    const body = bytesOf(encodeMission(DEFAULT_SPEC)).slice(0, -2);
    const v2 = body.slice(); v2[0] = (2 << 4) | (v2[0] & 15);
    expect(decodeMission(codeFrom(v2))).toEqual({ ok: false, error: 'version' });
    const badTarget = body.slice(); badTarget[0] = (1 << 4) | 15;   // target 15 of 10
    expect(decodeMission(codeFrom(badTarget))).toEqual({ ok: false, error: 'invalid' });
    expect(decodeMission(codeFrom([...body, 0]))).toEqual({ ok: false, error: 'invalid' });   // trailing byte
    expect(decodeMission(codeFrom(body.slice(0, -1))).ok).toBe(false);                       // cut short
  });

  it('fuzz: random bytes with a valid checksum never throw, and anything accepted is a valid spec', () => {
    const r = rng(99);
    let accepted = 0;
    for (let i = 0; i < 3000; i++) {
      const bytes = Array.from({ length: 8 + Math.floor(r() * 40) }, () => Math.floor(r() * 256));
      bytes[0] = (1 << 4) | (bytes[0] & 15);
      const d = decodeMission(codeFrom(bytes));
      if (d.ok) {
        accepted++;
        expect(sanitizeSpec(d.spec)).toEqual(d.spec);
        expect(d.spec.waves.length).toBeGreaterThan(0);
        expect(cleanName(d.spec.name)).toBe(d.spec.name);
      } else expect(['invalid', 'format', 'version']).toContain(d.error);
    }
    expect(accepted).toBeLessThan(3000);
  });

  it('a decoded name is the only free text, and it carries nothing HTML-special', () => {
    expect(cleanName('<img src=x onerror=alert(1)>')).toBe('img src x onerror alert(');   // capped at NAME_MAX
    expect(cleanName('"Raid" & \'co\' <b>')).toBe('Raid co b');
    expect(cleanName('a‮b\u0000c\nd')).toBe('a b c d');   // bidi override and control characters
    expect(cleanName('x'.repeat(100))).toHaveLength(NAME_MAX);
    expect(cleanName(42)).toBe('');
    const s = sanitizeSpec({ ...DEFAULT_SPEC, name: '<b>Raid</b>' });
    expect(decodeMission(encodeMission(s)).ok).toBe(true);
    expect((decodeMission(encodeMission(s)) as { spec: MissionSpec }).spec.name).toBe('b Raid b');
  });
});

describe('spec -> mission', () => {
  it('sanitizes junk into a valid spec with at least one wave', () => {
    const s = sanitizeSpec({ target: 99, route: 'endless', mood: 'night', sunEl: -5, station: 'nose', bombers: 7, skill: 'god', escorts: 'all', flak: 9,
      waves: [{ leg: 'x', from: 'below', count: 50, types: ['spitfire'] }, ...Array(20).fill({})] });
    expect(s.target).toBe(TARGETS.length - 1);
    expect(s.route).toBe('medium'); expect(s.mood).toBe('clear'); expect(s.sunEl).toBe(2); expect(s.station).toBe('waistL');
    expect(s.bombers).toBe(12); expect(s.skill).toBe('veteran'); expect(s.escorts).toBe('late'); expect(s.flak).toBe(3);
    expect(s.waves).toHaveLength(WAVES_MAX);
    expect(s.waves[0]).toEqual({ leg: 'in', from: 'mixed', count: 12, types: ['fw190'] });
    expect(sanitizeSpec({ waves: [] }).waves).toHaveLength(1);
  });

  it('builds an ordinary gunner wave mission: legs in order, flak over the target, bombs away, escorts', () => {
    const s = sanitizeSpec({
      ...DEFAULT_SPEC, route: 'long', flak: 3, escorts: 'early', bombers: 18, skill: 'ace', station: 'tail',
      waves: [
        { leg: 'home', from: 'rear', count: 6, types: ['me262'] },
        { leg: 'in', from: 'front', count: 3, types: ['fw190', 'bf109'] },
        { leg: 'target', from: 'high', count: 5, types: ['me163'] },
        { leg: 'in', from: 'left', count: 2, types: ['bf110'] },
      ],
    });
    const m = buildUserMission(s);
    const t = routeTimes('long');
    expect(m.id).toBe(USER_MISSION_ID);
    expect(m.role).toBe('gunner'); expect(m.station).toBe('tail'); expect(m.bombers).toBe(18);
    expect(m.duration).toBe(360); expect(m.bombsAway).toBe(t.bombsAway);
    expect(m.flak).toEqual({ start: t.flakStart, end: t.flakEnd, intensity: 1.8 });
    expect(m.escortArrive).toBe(20);
    expect(m.round).toBeUndefined();
    expect(m.waves.map((w) => [w.at, !!w.afterClear, w.count, w.types])).toEqual([
      [legStart('in', 'long'), false, 3, ['fw190', 'bf109']],
      [0, true, 2, ['bf110']],
      [legStart('target', 'long'), false, 5, ['me163']],
      [legStart('home', 'long'), false, 6, ['me262']],
    ]);
    expect(m.waves.map((w) => w.attack)).toEqual(['headon', 'beam', 'high', 'stern']);
    expect(m.waves[0].skill).toBeLessThan(m.waves[3].skill);   // skill climbs through the mission
    // timed legs stay in order, inside the mission
    expect(legStart('in', 'short')).toBeLessThan(legStart('target', 'short'));
    expect(legStart('target', 'short')).toBeLessThan(legStart('home', 'short'));
    expect(legStart('home', 'short')).toBeLessThan(routeTimes('short').duration);
    expect(buildUserMission({ ...s, flak: 0, escorts: 'none' }).flak).toBeUndefined();
    expect(buildUserMission({ ...s, flak: 0, escorts: 'none' }).escortArrive).toBeUndefined();
    expect(userMissionCode(m)).toBe(encodeMission(s));
    expect(userMissionCode({ ...m } as Mission)).toBeNull();
  });

  it('is claimed by the Mission Editor mode, which never posts scores', () => {
    const m = buildUserMission(DEFAULT_SPEC);
    expect(MODES).toContain(USER_MODE);
    expect(modeFor(m)).toBe(USER_MODE);
    expect(leaderboardMode(m)).toBe('');
    expect(USER_MODE.board('gunner')).toBe('');
    expect(USER_MODE.roles).toEqual(['gunner']);
  });
});

describe('library: save, rate, replay', () => {
  it('adds, rates, records plays and removes', () => {
    const a = encodeMission(DEFAULT_SPEC);
    const b = encodeMission({ ...DEFAULT_SPEC, target: 3 });
    expect(addToLibrary('junk', true)).toBeNull();
    addToLibrary(a, true, 1000);
    addToLibrary(b, false, 2000);
    expect(loadLibrary().map((e) => e.code)).toEqual([b, a]);   // last touched first
    rateMission(b, 4);
    rateMission(a, 99);
    recordPlay(b, true, 5200, 3000);
    recordPlay(b, false, 1800, 4000);
    const lib = loadLibrary();
    const eb = lib.find((e) => e.code === b)!, ea = lib.find((e) => e.code === a)!;
    expect(eb).toMatchObject({ mine: false, plays: 2, wins: 1, best: 5200, rating: 4 });
    expect(ea).toMatchObject({ mine: true, rating: 5, plays: 0 });
    addToLibrary(b, true);
    expect(loadLibrary().find((e) => e.code === b)!.mine).toBe(true);
    removeFromLibrary(a);
    expect(loadLibrary().map((e) => e.code)).toEqual([b]);
    // a play of a mission that is not in the library yet adds it
    const c = encodeMission({ ...DEFAULT_SPEC, target: 5 });
    expect(recordPlay(c, true, 100)).toMatchObject({ plays: 1, wins: 1 });
  });

  it('drops tampered entries and caps the list', () => {
    const good = encodeMission(DEFAULT_SPEC);
    const lib = sanitizeLibrary([{ code: good, plays: -4, best: 'x', rating: 12, mine: 'yes' }, { code: 'bad!' }, null, 7, { code: good }]);
    expect(lib).toEqual([{ code: good, mine: false, plays: 0, wins: 0, best: 0, rating: 5, at: 0 }]);
    const many = Array.from({ length: LIBRARY_MAX + 10 }, (_, i) => ({ code: encodeMission({ ...DEFAULT_SPEC, sunEl: 2 + i }), at: i }));
    expect(sanitizeLibrary(many)).toHaveLength(LIBRARY_MAX);
    localStorage.setItem('sws3d.missionEditor.v1', '{not json');
    expect(loadLibrary()).toEqual([]);
  });
});

describe('Arabic', () => {
  const arabic = /[؀-ۿ]/;
  const KEEP = /B-17G?|P-51D?|Fw 190|Bf 109|Bf 110|Ju 88 G|Ju 88|Me 262|Me 163|Me 410|He 111|Do 335/g;
  const arabicFor = (s: string) => {
    const out = tx(s);
    expect(out, s).toMatch(arabic);
    expect(out.replace(KEEP, ''), `untranslated words in: ${s}\n→ ${out}`).not.toMatch(/[A-Za-z]{2,}/);
  };

  it('every option, summary piece and generated mission text', () => {
    setLang('ar');
    for (const l of [...TARGETS, ...Object.values(ROUTE_LABEL), ...Object.values(ESCORT_LABEL), ...FLAK_LABEL, ...Object.values(FROM_LABEL), ...Object.values(LEG_LABEL), ...Object.values(DECODE_ERROR_TEXT)]) arabicFor(l);
    arabicFor(USER_MODE.title); arabicFor(USER_MODE.blurb);
    const r = rng(3);
    for (let i = 0; i < 120; i++) {
      const s = { ...randomSpec(r), name: '' };
      const m = buildUserMission(s);
      for (const t of [m.title, m.target, m.date, ...m.briefing, ...m.objectives, m.success!, ...describeSpec(s)]) arabicFor(t);
    }
  });

  it('every text on the editor screens', () => {
    setLang('ar');
    const FS = 'node:fs';
    return import(FS).then(({ readFileSync }) => {
      const src: string = readFileSync(new URL('../src/ui/MissionEditorScreen.ts', import.meta.url), 'utf8');
      const lits = [...src.matchAll(/tx\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
      expect(lits.length).toBeGreaterThan(40);
      for (const s of ['Rate 4 of 5', 'Wave 3', '4.5 min', '3 min', '12 bombers', '6 bombers', '1 of 8 waves · 1 fighters', '5 of 8 waves · 25 fighters', 'Flown once · best 1713', 'Flown 7 times · best 0']) arabicFor(s);
      for (const s of new Set(lits)) arabicFor(s.replace('{n}', '3').replace('{b}', '4200').replace('{w}', '2').replace('{max}', '8'));
    });
  });
});
