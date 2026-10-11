import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { stubStorage } from './helpers';
import { CAMPAIGN } from '../src/game/Missions';
import { SURNAMES } from '../src/game/Nemesis';
import {
  ACE_SURNAMES, ALL_MEN, DYN_CAP, DYN_CAP_FINALE, LOSS_WORDS, NAME_OF, NICK_OF, POOL, VAR_VALUES, VIGNETTES, VOICE_ROLE,
  allTexts, buildScene, fill, isHeavy, lwTrend, presentMen, recordedLines, spokenText, vignetteFor, type CrewRoomCtx, type Scene,
} from '../src/game/CrewRoom';
import { tx, setLang, hasPhrase } from '../src/i18n';

// node:fs without @types/node (the project's tsconfig only has the browser types)
const FS = 'node:fs';
const { existsSync, readFileSync, statSync } = (await import(FS)) as {
  existsSync(p: URL): boolean; readFileSync(p: URL, enc: 'utf8'): string; statSync(p: URL): { size: number };
};
const VOICE = new URL('../public/audio/voice/', import.meta.url);
const join = (dir: URL, file: string) => new URL(file, dir);
// the roster (CrewRoster.ts touches window at import: read its table instead)
const MEN = [...readFileSync(new URL('../src/game/CrewRoster.ts', import.meta.url), 'utf8').matchAll(/\{ id: '(\w+)', rank: '[\w.]+', first: '\w+', last: '(\w+)', nick: '(\w+)'.*?gunner: (true|false)/g)]
  .map((m) => ({ id: m[1], last: m[2], nick: m[3], gunner: m[4] === 'true' }));
const man = JSON.parse(readFileSync(join(VOICE, 'manifest.json'), 'utf8')) as { clips: Record<string, { file: string; text: string; role: string; dur: number }> };

const ctx = (o: Partial<CrewRoomCtx> = {}): CrewRoomCtx => ({
  mission: 'm1', role: 'gunner', kills: 3, shots: 300, hits: 60, lost: 1, total: 9,
  hospital: [], patched: [], rookies: [], aces: [], luftwaffe: 100, ...o,
});
const scene = (id: string, o: Partial<CrewRoomCtx> = {}) => buildScene(id, ctx({ mission: id, role: CAMPAIGN.find((m) => m.id === id)!.role, ...o }))!;
const ids = (s: Scene) => s.lines.map((l) => l.id);
const has = (s: Scene, id: string) => s.lines.some((l) => l.id === id);
const block = (s: Scene) => s.lines.filter((l) => !/^cr_m\d+_/.test(l.id));

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); });

describe('crew-room vignettes', () => {
  it('has one vignette for every story mission, and only those', () => {
    expect(VIGNETTES.map((v) => v.id).sort()).toEqual(CAMPAIGN.map((m) => m.id).sort());
    expect(new Set(VIGNETTES.map((v) => v.id)).size).toBe(VIGNETTES.length);
    expect(vignetteFor('survival-gunner')).toBeNull();
    expect(buildScene('raid-1-0', ctx())).toBeNull();
  });

  it('keeps names and voices in step with the roster and the Experten', () => {
    expect(ACE_SURNAMES).toEqual(SURNAMES);
    expect([...ALL_MEN].sort()).toEqual(MEN.map((m) => m.id).sort());
    for (const m of MEN) {
      expect(NICK_OF[m.id as keyof typeof NICK_OF]).toBe(m.nick);
      if (m.gunner) expect(NAME_OF[m.id as keyof typeof NAME_OF]).toBe(m.last);
    }
    // the speaker's recorded voice is the one his position speaks with on the radio
    expect(VOICE_ROLE).toMatchObject({ brenner: 'pilot', doyle: 'copilot', stern: 'nav', kessler: 'bombardier', mendez: 'top', gallo: 'radio', reilly: 'ball', price: 'waist', walsh: 'waist', dawson: 'tail' });
  });

  it('every line id is unique, and the story keeps away the men it sends away', () => {
    const all = [...VIGNETTES.flatMap((v) => [...v.open, ...v.close]), ...Object.values(POOL)];
    expect(new Set(all.map((d) => d.id)).size).toBe(all.length);
    for (const v of VIGNETTES) for (const a of v.absent ?? []) {
      const s = buildScene(v.id, ctx({ mission: v.id }))!;
      expect(s.lines.some((l) => l.who === a), `${v.id}: ${a}`).toBe(false);
      expect(s.present).not.toContain(a);
    }
    // Doyle is in the hospital after Frankfurt (m10) until he is back for Schweinfurt (m5)
    expect(vignetteFor('m10')!.absent).toContain('doyle');
    expect(vignetteFor('m4')!.absent).toContain('doyle');
    expect(scene('m5').lines.some((l) => l.who === 'doyle')).toBe(true);
  });

  it('a regular vignette lasts 30-60 s of recorded speech; the finale is longer', () => {
    const secs = (s: Scene) => s.lines.reduce((t, l) => {
      const c = Object.entries(man.clips).find(([id, c]) => id.startsWith('cr_') && c.text === spokenText(l) && c.role === VOICE_ROLE[l.who]);
      return t + (c ? c[1].dur : spokenText(l).length / 14) + 0.55;
    }, 1.5);
    const lens: Record<string, number> = {};
    for (const v of VIGNETTES) lens[v.id] = secs(scene(v.id, { kills: 2, lost: 1, aces: [{ last: 'Lindner', fate: 'escaped', byPlayer: false }] }));
    for (const v of VIGNETTES) if (!v.finale) { expect(lens[v.id], v.id).toBeGreaterThan(30); expect(lens[v.id], v.id).toBeLessThan(66); }
    const fin = lens.m12;
    expect(fin).toBeGreaterThan(Math.max(...VIGNETTES.filter((v) => !v.finale).map((v) => lens[v.id])));
    expect(fin).toBeLessThan(150);
  });
});

describe('crew-room selection', () => {
  it('names the men in the hospital, keeps them out of the room and has someone else tell it', () => {
    const s = scene('m2', { hospital: ['gallo'] });
    expect(s.present).not.toContain('gallo');
    expect(s.lines.some((l) => l.who === 'gallo')).toBe(false);
    const h = s.lines.find((l) => l.id === POOL.hosp1.id)!;
    expect(h.who).toBe('mendez');   // Gallo would have said it
    expect(spokenText(h)).toBe("Doc says Gallo will be in the hospital a week or two. I'll take him his mail.");
    expect(has(s, POOL.hospOne.id)).toBe(true);
    // two men: the second line and "see them both"
    const s2 = scene('m2', { hospital: ['reilly', 'brenner'] });
    expect(spokenText(s2.lines.find((l) => l.id === POOL.hosp2.id)!)).toBe('the Skipper is in the next bed over. He asked us to keep his place by the stove.'.replace(/^t/, 't'));
    expect(has(s2, POOL.hospTwo.id)).toBe(true);
    expect(s2.lines.find((l) => l.id === POOL.hospTwo.id)!.who).toBe('doyle');   // the Skipper is away
    expect(s2.lines.some((l) => l.who === 'brenner' || l.who === 'reilly')).toBe(false);
    // the navigator is the second man in: the bombardier tells it
    const s3 = scene('m2', { hospital: ['gallo', 'stern'] });
    const h3 = s3.lines.find((l) => l.id === POOL.hosp2.id)!;
    expect(h3.who).toBe('kessler');
    expect(spokenText(h3)).toContain('Lieutenant Stern');
    // the navigator and the Skipper away: the losses are still counted
    expect(scene('m2', { hospital: ['stern', 'brenner'], lost: 1, total: 12 }).lines.find((l) => l.id === POOL.lost1.id)?.who).toBe('kessler');
  });

  it('asks a patched-up man how he is, and he answers in his own voice', () => {
    const s = scene('m1', { patched: ['reilly'] });
    const q = s.lines.find((l) => l.id === POOL.patchQ.id)!;
    const a = s.lines.find((l) => l.id === POOL.patchA.id)!;
    expect(spokenText(q)).toBe('How are you holding up, Shorty?');
    expect(q.who).toBe('brenner');
    expect(a.who).toBe('reilly');
    expect(ids(s).indexOf(a.id)).toBe(ids(s).indexOf(q.id) + 1);
    // the Skipper patched up: Doyle asks him
    const s2 = scene('m1', { patched: ['brenner'] });
    expect(s2.lines.find((l) => l.id === POOL.patchQ.id)!.who).toBe('doyle');
    expect(spokenText(s2.lines.find((l) => l.id === POOL.patchQ.id)!)).toBe('How are you holding up, Skipper?');
    expect(s2.lines.find((l) => l.id === POOL.patchA.id)!.who).toBe('brenner');
  });

  it('counts the losses; heavy losses empty a bunk', () => {
    expect(has(scene('m1', { lost: 0 }), POOL.lost0.id)).toBe(true);
    expect(has(scene('m1', { lost: 1, total: 12 }), POOL.lost1.id)).toBe(true);
    expect(has(scene('m1', { lost: 2, total: 12 }), POOL.lost2.id)).toBe(true);
    const light = scene('m1', { lost: 2, total: 12 });
    expect(light.emptyBunk).toBe(false);
    expect(has(light, POOL.bunk.id)).toBe(false);
    const heavy = scene('m1', { lost: 4, total: 12 });
    expect(isHeavy(ctx({ lost: 4, total: 12 }))).toBe(true);
    expect(heavy.emptyBunk).toBe(true);
    const n = heavy.lines.find((l) => l.id === POOL.lostN.id)!;
    expect(spokenText(n)).toBe("Four ships didn't come back today. I wrote down every name I knew.");
    expect(n.show).toEqual({ n: 4 });
    expect(has(heavy, POOL.bunk.id) && has(heavy, POOL.bunkReply.id)).toBe(true);
    // a quarter of a small formation is heavy too
    expect(isHeavy(ctx({ lost: 2, total: 6 }))).toBe(true);
    // more than the recorded words: speech synthesis with the number
    const many = scene('m1', { lost: 11, total: 12 }).lines.find((l) => l.id === POOL.lostMany.id)!;
    expect(many.dyn).toBe(true);
    expect(spokenText(many)).toBe("11 ships didn't come back today. I wrote down every name I knew.");
    expect(LOSS_WORDS).toHaveLength(7);
  });

  it('Black Thursday empties the Lucky Lady\'s bunks whatever the losses, without the generic bunk lines', () => {
    const s = scene('m8', { lost: 0 });
    expect(s.emptyBunk).toBe(true);
    const h = scene('m8', { lost: 5, total: 12 });
    expect(has(h, POOL.bunk.id)).toBe(false);
    expect(has(h, POOL.lostN.id)).toBe(true);
  });

  it('remembers the Experten: shot down (and by whom) or got away', () => {
    const down = scene('m2', { aces: [{ last: 'Lindner', fate: 'escaped', byPlayer: false }, { last: 'Kranz', fate: 'down', byPlayer: true }] });
    const d = down.lines.find((l) => l.id === POOL.aceDown.id)!;
    expect(spokenText(d)).toBe("Kranz won't be back. I watched him go down.");
    expect(d.who).toBe('dawson');
    expect(has(down, POOL.aceYours.id)).toBe(true);
    expect(has(down, POOL.aceAway.id)).toBe(false);   // one ace per scene
    const away = scene('m2', { aces: [{ last: 'Lindner', fate: 'withdrew', byPlayer: false }] });
    expect(spokenText(away.lines.find((l) => l.id === POOL.aceAway.id)!)).toBe("Lindner got away from us again. He'll be back.");
    expect(has(away, POOL.aceYours.id)).toBe(false);
    // somebody else's kill: no word for the player
    expect(has(scene('m2', { aces: [{ last: 'Dorn', fate: 'bailed', byPlayer: false }] }), POOL.aceYours.id)).toBe(false);
    // a name with no recording: the line goes to speech synthesis
    const odd = scene('m2', { aces: [{ last: 'Unbekannt', fate: 'down', byPlayer: false }] }).lines.find((l) => l.id === POOL.aceDown.id)!;
    expect(odd.dyn).toBe(true);
    // Dawson in the hospital: nobody else saw it
    expect(has(scene('m2', { hospital: ['dawson'], aces: [{ last: 'Kranz', fate: 'down', byPlayer: true }] }), POOL.aceDown.id)).toBe(false);
  });

  it('follows the strategic picture', () => {
    expect(lwTrend(80)).toBe('weaker');
    expect(lwTrend(100)).toBe('even');
    expect(lwTrend(120)).toBe('stronger');
    const quiet = { kills: 0, shots: 0, hits: 0, lost: 0 };
    expect(has(scene('m2', { ...quiet, luftwaffe: 82 }), POOL.lwWeak.id)).toBe(true);
    const strong = scene('m2', { ...quiet, luftwaffe: 118 });
    expect(has(strong, POOL.lwStrong.id) && has(strong, POOL.lwStrongReply.id)).toBe(true);
    expect(has(scene('m2', { ...quiet, luftwaffe: 100 }), POOL.lwEven.id)).toBe(true);
  });

  it('talks about the player\'s day: kills and accuracy, gunner or Mustang pilot', () => {
    expect(has(scene('m1', { kills: 0, shots: 200, hits: 20 }), POOL.gun0.id)).toBe(true);
    expect(has(scene('m1', { kills: 2 }), POOL.gun1.id)).toBe(true);
    expect(has(scene('m1', { kills: 4 }), POOL.gun3.id)).toBe(true);
    const ace = scene('m1', { kills: 7, shots: 500, hits: 175 });
    expect(has(ace, POOL.gun5.id)).toBe(true);
    const count = ace.lines.find((l) => l.id === POOL.gunCount.id)!;
    expect(count.dyn).toBe(true);
    expect(spokenText(count)).toBe('I checked the claims board. 7 confirmed, and you hit with 35 percent of your rounds.');
    expect(has(scene('m1', { kills: 1, shots: 100, hits: 40, lost: 0 }), POOL.accHigh.id)).toBe(true);
    expect(has(scene('m1', { kills: 0, shots: 900, hits: 40, lost: 0 }), POOL.accLow.id)).toBe(true);
    // the escort missions: the crew talks to the Mustang pilot
    const p = scene('m9', { kills: 6 });
    expect(has(p, POOL.fly5.id)).toBe(true);
    expect(spokenText(p.lines.find((l) => l.id === POOL.flyCount.id)!)).toBe('By my count you got 6 of them, and every one was heading for a bomber.');
    expect(p.lines.some((l) => l.id.startsWith('cr_gun'))).toBe(false);
    expect(has(scene('m9', { kills: 0 }), POOL.fly0.id)).toBe(true);
  });

  it('mentions a replacement who flew for a resting man', () => {
    const s = scene('m3', { rookies: [{ rookie: 'Kowalski', for: 'mendez' }], kills: 0, shots: 0, lost: 0 });
    const r = s.lines.find((l) => l.id === POOL.rookie.id)!;
    expect(spokenText(r)).toBe("Kowalski flew in Mendez's place today. Not bad for a first mission.");
    expect(r.dyn).toBe(true);
  });

  it('keeps the outcome block short, dropping the least important lines first', () => {
    const busy = ctx({ hospital: ['gallo', 'reilly'], patched: ['price'], lost: 5, total: 12, aces: [{ last: 'Kranz', fate: 'down', byPlayer: true }], rookies: [{ rookie: 'Novak', for: 'walsh' }], kills: 6, shots: 300, hits: 120, luftwaffe: 120 });
    for (const v of VIGNETTES) {
      const s = buildScene(v.id, { ...busy, mission: v.id })!;
      const b = block(s);
      expect(b.length, v.id).toBeLessThanOrEqual(v.finale ? DYN_CAP_FINALE : DYN_CAP);
      // the wounded always come first and are never dropped
      expect(b[0].id, v.id).toBe(POOL.hosp1.id);
      expect(has(s, POOL.rookie.id)).toBe(false);
      // nobody in the hospital speaks; every speaker is in the room
      for (const l of s.lines) { expect(['gallo', 'reilly']).not.toContain(l.who); expect(s.present).toContain(l.who); }
      expect(s.lines.length, v.id).toBeGreaterThanOrEqual(8);
    }
  });

  it('the finale adds the tour in numbers and ends on "Let\'s go home"', () => {
    const s = scene('m12', { tour: { kills: 71, lost: 23 } });
    const t = s.lines.find((l) => l.id === POOL.tour.id)!;
    expect(t.dyn).toBe(true);
    expect(spokenText(t)).toBe("Over the whole tour, we claimed 71 fighters. The group lost 23 Fortresses. I'll remember the second number longer.");
    expect(spokenText(s.lines[s.lines.length - 1])).toBe("Twenty-five. Let's go home.");
    expect(s.lines.some((l) => l.cue === 'gramophone')).toBe(true);
    // the Skipper in the hospital: Doyle says it
    const s2 = scene('m12', { hospital: ['brenner'], tour: { kills: 71, lost: 23 } });
    expect(s2.lines[s2.lines.length - 1].who).toBe('doyle');
    expect(s.lines.length).toBeGreaterThan(Math.max(...VIGNETTES.filter((v) => !v.finale).map((v) => scene(v.id).lines.length)));
  });

  it('casts the speakers first, then the others in the room, without the absent', () => {
    const s = scene('m10', { hospital: ['price'] });
    expect(s.present.length).toBeLessThanOrEqual(8);
    const speakers = [...new Set(s.lines.map((l) => l.who))];
    expect(s.present.slice(0, speakers.length)).toEqual(speakers);
    expect(presentMen(vignetteFor('m10')!, ctx({ hospital: ['price'] }))).not.toContain('price');
    expect(s.present).not.toContain('doyle');
  });

  it('fills variables', () => {
    expect(fill('{a} and {b}', { a: 1, b: 'two' })).toBe('1 and two');
    expect(fill('{a} and {c}', { a: 1 })).toBe('1 and {c}');
    expect(fill('plain')).toBe('plain');
  });
});

describe('crew-room voices', () => {
  it('has a clip for every recorded line, in every voice and for every name (run tools/voice/crewroom.mjs + generate.py)', () => {
    const byText = new Map<string, { id: string; role: string; file: string }[]>();
    for (const [id, c] of Object.entries(man.clips)) if (id.startsWith('cr_')) (byText.get(c.text) ?? byText.set(c.text, []).get(c.text)!).push({ id, role: c.role, file: c.file });
    let n = 0;
    for (const { def, roles } of recordedLines()) {
      const texts = def.key ? VAR_VALUES[def.key].map((v) => def.text.replace(`{${def.key}}`, v)) : [def.text];
      for (const t of texts) for (const r of roles) {
        const hit = byText.get(t)?.find((c) => c.role === r);
        expect(hit, `${def.id} [${r}]: ${t}`).toBeDefined();
        expect(existsSync(join(VOICE, hit!.file))).toBe(true);
        n++;
      }
    }
    expect(n).toBeGreaterThan(250);
  });

  it('every line a scene picks is recorded, or is a dynamic line for speech synthesis', () => {
    const texts = new Set(Object.entries(man.clips).filter(([id]) => id.startsWith('cr_')).map(([, c]) => `${c.role}|${c.text}`));
    const variants: Partial<CrewRoomCtx>[] = [
      {}, { lost: 0 }, { lost: 5, total: 12 }, { kills: 0 }, { kills: 9, shots: 300, hits: 120 }, { luftwaffe: 70 }, { luftwaffe: 130 },
      { hospital: ['gallo'] }, { patched: ['walsh'] }, { aces: [{ last: 'Zeller', fate: 'down', byPlayer: true }] }, { aces: [{ last: 'Engel', fate: 'escaped', byPlayer: false }] },
    ];
    for (const v of VIGNETTES) for (const o of variants) {
      for (const l of scene(v.id, o).lines) {
        if (l.dyn) continue;
        expect(texts.has(`${VOICE_ROLE[l.who]}|${spokenText(l)}`), `${v.id} ${l.who}: ${spokenText(l)}`).toBe(true);
      }
    }
  });

  it('sits before the briefings in lines.json, out of the game-code table, under 4 MB of audio', () => {
    const lines = JSON.parse(readFileSync(new URL('../tools/voice/lines.json', import.meta.url), 'utf8')).lines as { id?: string; group?: string; noTable?: boolean }[];
    const g = lines.findIndex((l) => l.group === 'crew room (tools/voice/crewroom.mjs)');
    const b = lines.findIndex((l) => l.group === 'briefings (tools/voice/briefings.mjs)');
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(b);
    const cr = lines.filter((l) => l.id?.startsWith('cr_'));
    expect(cr.length).toBe(recordedLines().length);
    expect(cr.every((l) => l.noTable)).toBe(true);
    expect(lines.findIndex((l) => l.id?.startsWith('cr_'))).toBe(g + 1);
    const ts = readFileSync(new URL('../src/audio/voiceLines.ts', import.meta.url), 'utf8');
    expect(ts).not.toContain('cr_');
    const bytes = Object.entries(man.clips).filter(([id]) => id.startsWith('cr_')).reduce((s, [, c]) => s + statSync(join(VOICE, c.file)).size, 0);
    expect(bytes).toBeGreaterThan(1024 * 1024);
    expect(bytes).toBeLessThan(4 * 1024 * 1024);
  });
});

describe('crew-room Arabic', () => {
  beforeEach(() => { setLang('ar'); });
  const KEEP = /«⁨?Lucky Lady⁩?»|Esc|RAF/g;
  const arabic = /[؀-ۿ]/;

  it('translates every caption, line and template, keeping the placeholders', () => {
    for (const s of allTexts()) {
      expect(hasPhrase(s), s).toBe(true);
      const out = tx(s);
      expect(out, s).toMatch(arabic);
      expect(out.replace(KEEP, '').replace(/\{\w+\}/g, ''), `untranslated words in: ${s}\n→ ${out}`).not.toMatch(/[A-Za-z]{2,}/);
      expect([...out.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), s).toEqual([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort());
    }
    for (const s of ['Crew room', 'Space · next line', 'Tap · next line', 'Esc · skip', 'Skip scene', 'Tour complete']) expect(tx(s), s).toMatch(arabic);
  });

  it('shows the dynamic lines and names in Arabic, as the scene fills them', () => {
    const arVars = (l: { vars?: Record<string, string | number>; show?: Record<string, string | number> }) =>
      Object.fromEntries(Object.entries(l.show ?? l.vars ?? {}).map(([k, v]) => [k, typeof v === 'string' ? tx(v) : v]));
    const s = scene('m12', { hospital: ['reilly', 'brenner'], patched: ['price'], lost: 4, total: 12, aces: [{ last: 'Kranz', fate: 'down', byPlayer: true }], tour: { kills: 71, lost: 23 } });
    for (const l of s.lines) {
      const out = tx(l.text, arVars(l));
      expect(out, l.text).toMatch(arabic);
      expect(out, l.text).not.toMatch(/\{\w+\}/);
      expect(out.replace(KEEP, ''), out).not.toMatch(/[A-Za-z]{2,}/);
    }
    for (const m of ALL_MEN) { expect(tx(NAME_OF[m])).toMatch(arabic); expect(tx(NICK_OF[m])).toMatch(arabic); }
    for (const a of ACE_SURNAMES) expect(tx(a)).toMatch(arabic);
    const hosp = s.lines.find((l) => l.id === POOL.hosp1.id)!;
    expect(tx(hosp.text, arVars(hosp))).toContain('رايلي');
    const lost = s.lines.find((l) => l.id === POOL.lostN.id);
    if (lost) expect(tx(lost.text, arVars(lost))).toContain('4');
  });

  it('English is unchanged', () => {
    setLang('en');
    const l = scene('m2', { hospital: ['gallo'] }).lines.find((x) => x.id === POOL.hosp1.id)!;
    expect(tx(l.text, l.vars)).toBe(spokenText(l));
    expect(tx('Deenethorpe · Hut 14')).toBe('Deenethorpe · Hut 14');
  });
});
