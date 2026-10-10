import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { stubStorage } from './helpers';
import {
  ACE_RANKS, EMBLEM_IDS, FIRST_NAMES, HIT_CLAIM, HOSPITAL_MISSIONS, MOST_WANTED_MULT, NEMESIS_KEY, ROSTER_SIZE, SURNAMES, TRAITS, TRAIT_IDS, COLOURS,
  type EncounterInput, type NemesisState, applyEncounter, beginMission, bounty, emptyNemesis, encounterText, ensureRoster, loadNemesis,
  memoryText, mostWanted, payoutFor, pickAce, placeOf, rankForVictories, record, reportLines, sanitizeNemesis, saveNemesis,
  aceName, fullRankName, traitLabel, unitLabel, placeLabel,
} from '../src/game/Nemesis';
import { CAMPAIGN, survivalMission } from '../src/game/Missions';
import { MEDALS } from '../src/game/Career';
import { ACHIEVEMENTS } from '../src/game/Achievements';
import { setLang, tx, hasPhrase } from '../src/i18n';

// node:fs without @types/node (the project's tsconfig only has the browser types)
const FS = 'node:fs';
const { readFileSync } = (await import(FS)) as { readFileSync(p: URL, enc: 'utf8'): string };

// deterministic stream (mulberry32)
function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const enc = (o: Partial<EncounterInput> = {}): EncounterInput => ({
  fate: 'withdrew', byPlayer: false, hits: 0, wounded: [], downed: 0, downedUs: false, health: 1, place: 'Bremen', mission: 'Twelve O\'Clock High', role: 'gunner', ...o,
});

function fresh(seed = 3): NemesisState {
  const st = emptyNemesis();
  ensureRoster(st, rng(seed));
  return st;
}

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); });

describe('roster', () => {
  it('fills a roster of distinct, consistent Experten', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const st = fresh(seed);
      expect(st.aces.length).toBe(ROSTER_SIZE);
      expect(new Set(st.aces.map((a) => a.id)).size).toBe(ROSTER_SIZE);
      expect(new Set(st.aces.map((a) => a.last)).size).toBe(ROSTER_SIZE);
      // eight aces, eight styles: every trait once
      expect(new Set(st.aces.map((a) => a.trait)).size).toBe(TRAIT_IDS.length);
      for (const a of st.aces) {
        expect(TRAITS[a.trait].types).toContain(a.type);
        expect(TRAITS[a.trait].units).toContain(a.unit);
        expect(SURNAMES).toContain(a.last);
        expect(FIRST_NAMES).toContain(a.first);
        expect(EMBLEM_IDS).toContain(a.emblem);
        expect(COLOURS.map((c) => c.hex)).toContain(a.color);
        expect(a.rank).toBeLessThanOrEqual(rankForVictories(a.victories));
        expect(a.victories).toBeGreaterThanOrEqual(22);
        expect(a.status).toBe('active');
      }
    }
  });

  it('ranks follow the victory ladder', () => {
    expect(rankForVictories(0)).toBe(0);
    expect(rankForVictories(ACE_RANKS[2].at)).toBe(2);
    expect(rankForVictories(ACE_RANKS[2].at - 1)).toBe(1);
    expect(rankForVictories(999)).toBe(ACE_RANKS.length - 1);
  });

  it('picks aces with a grudge or a history more often, never the injured or excluded', () => {
    const st = fresh(5);
    const [hot, , hurt] = st.aces;
    hot.grudge = 3;
    hurt.status = 'injured';
    const r = rng(9);
    const n = new Map<string, number>();
    for (let i = 0; i < 4000; i++) { const a = pickAce(st, { role: 'gunner' }, r)!; n.set(a.id, (n.get(a.id) ?? 0) + 1); }
    expect(n.get(hurt.id) ?? 0).toBe(0);
    const others = st.aces.filter((a) => a !== hot && a !== hurt).map((a) => n.get(a.id) ?? 0);
    expect(n.get(hot.id)!).toBeGreaterThan(2.5 * Math.max(...others));
    const ex = new Set(st.aces.map((a) => a.id).filter((id) => id !== st.aces[1].id));
    expect(pickAce(st, { role: 'pilot', exclude: ex }, r)!.id).toBe(st.aces[1].id);
    expect(pickAce(st, { role: 'pilot', exclude: new Set(st.aces.map((a) => a.id)) }, r)).toBeNull();
  });
});

describe('outcomes', () => {
  it('damaging the bomber and wounding a crewman earns victories, promotion and a memory', () => {
    const st = fresh(7);
    const a = st.aces[0];
    a.victories = ACE_RANKS[3].at - 2; a.rank = 2;
    const res = applyEncounter(st, a.id, enc({ hits: HIT_CLAIM + 4, wounded: ['Sgt. Reilly'], downed: 1 }), rng(1))!;
    expect(res.enc.gained).toBe(3);          // a bomber, a crewman and the shot-up claim
    expect(a.victories).toBe(ACE_RANKS[3].at + 1);
    expect(res.promotedTo).toBe(3);
    expect(a.rank).toBe(3);
    expect(a.status).toBe('active');
    expect(record(a).wounded).toEqual(['Sgt. Reilly']);
    expect(memoryText(a)).toBe('Wounded Sgt. Reilly over Bremen');
    expect(st.last!.items[0].enc.promotedTo).toBe(3);
    expect(reportLines(st.last!.items[0]).join(' ')).toContain('wounded Sgt. Reilly');
  });

  it('an escape at low health leaves patches and a grudge', () => {
    const st = fresh(8);
    const a = st.aces[1];
    const res = applyEncounter(st, a.id, enc({ fate: 'escaped', health: 0.25 }))!;
    expect(res.enc.scarred).toBe(true);
    expect(a.scars).toBe(1);
    expect(a.grudge).toBe(1);
    expect(a.status).toBe('active');
    expect(memoryText(a)).toBe('Escaped us damaged over Bremen');
    for (let i = 0; i < 6; i++) applyEncounter(st, a.id, enc({ fate: 'escaped', health: 0.2 }));
    expect(a.scars).toBe(4);
    expect(a.grudge).toBe(3);
  });

  it('shot down by the player: dead, bounty paid, a new man promoted from the ranks', () => {
    const st = fresh(9);
    const a = st.aces[2];
    const price = payoutFor(st, a);
    const res = applyEncounter(st, a.id, enc({ fate: 'down', byPlayer: true }), rng(4))!;
    expect(res.payout).toBe(price);
    expect(res.enc.payout).toBe(price);
    expect(st.aces).not.toContain(a);
    expect(st.fallen[0]).toBe(a);
    expect(a.status).toBe('dead');
    expect(st.aces.length).toBe(ROSTER_SIZE);
    const r = res.replacement!;
    expect(st.aces).toContain(r);
    expect(r.unit).toBe(a.unit);
    expect(r.promotedFrom).toContain(a.last);
    expect(r.victories).toBeLessThanOrEqual(30);
    expect(r.grudge).toBe(1);
    expect(st.kills).toBe(1);
    expect(st.last!.items[0].replacement?.last).toBe(r.last);
  });

  it('shot down by the formation pays nothing; the most wanted pays double', () => {
    const st = fresh(10);
    const a = st.aces[3];
    expect(applyEncounter(st, a.id, enc({ fate: 'down' }))!.payout).toBe(0);
    expect(st.kills).toBe(0);
    const w = mostWanted(st)!;
    const base = bounty(w);
    const res = applyEncounter(st, w.id, enc({ fate: 'down', byPlayer: true }))!;
    expect(res.wasMostWanted).toBe(true);
    expect(res.payout).toBe(base * MOST_WANTED_MULT);
  });

  it('a bail-out puts him in hospital; he returns injured-free after a few missions', () => {
    const st = fresh(11);
    const a = st.aces[4];
    applyEncounter(st, a.id, enc({ fate: 'bailed', byPlayer: true }));
    expect(a.status).toBe('injured');
    expect(st.aces).toContain(a);
    expect(a.scars).toBe(1);
    for (let i = 0; i < HOSPITAL_MISSIONS; i++) { beginMission(st); expect(a.status).toBe('injured'); expect(pickAce(st, { role: 'gunner', exclude: new Set(st.aces.filter((x) => x !== a).map((x) => x.id)) })).toBeNull(); }
    const back = beginMission(st);
    expect(back).toContain(a);
    expect(a.status).toBe('active');
    expect(a.recovered).toBe(true);
    expect(memoryText(a)).toBe('Bailed out over Bremen, back from hospital');
    applyEncounter(st, a.id, enc());
    expect(a.recovered).toBe(false);
  });

  it('the bounty grows with what he did to the crew', () => {
    const st = fresh(12);
    const a = st.aces[5];
    const b0 = bounty(a);
    applyEncounter(st, a.id, enc({ wounded: ['Sgt. Price'], downedUs: true, downed: 1 }));
    expect(bounty(a)).toBeGreaterThan(b0);
    expect(bounty(a) % 50).toBe(0);
  });
});

describe('persistence', () => {
  it('round-trips through localStorage under sws3d.nemesis.v1', () => {
    const st = loadNemesis(rng(2));
    applyEncounter(st, st.aces[0].id, enc({ fate: 'escaped', health: 0.3, wounded: ['Sgt. Dawson'] }));
    applyEncounter(st, st.aces[1].id, enc({ fate: 'down', byPlayer: true }));
    saveNemesis(st);
    expect(localStorage.getItem(NEMESIS_KEY)).toBeTruthy();
    const back = loadNemesis(rng(99));
    expect(back).toEqual(st);
  });

  it('survives corrupt or hostile saves', () => {
    localStorage.setItem(NEMESIS_KEY, '{not json');
    expect(loadNemesis(rng(1)).aces.length).toBe(ROSTER_SIZE);
    expect(sanitizeNemesis({ v: 2 })).toBeNull();
    const st = sanitizeNemesis({ v: 1, seq: -5, missions: 'x', aces: [{ id: 'x3', last: 'Dorn', trait: 'nope', rank: 99, victories: -4, color: 'red', emblem: '?', history: [{ fate: 'boom', wounded: [1, 'Sgt. Reilly'] }, null] }, { id: 'x3', last: 'Dup' }, 'junk'], fallen: [{ id: 'x9', last: 'Stahl', status: 'active' }] })!;
    expect(st.aces.length).toBe(1);
    const a = st.aces[0];
    expect(a.trait).toBe('headon');
    expect(a.rank).toBe(ACE_RANKS.length - 1);
    expect(a.victories).toBe(0);
    expect(a.color).toMatch(/^#/);
    expect(a.history.length).toBe(1);
    expect(a.history[0].fate).toBe('withdrew');
    expect(a.history[0].wounded).toEqual(['Sgt. Reilly']);
    expect(st.fallen[0].status).toBe('dead');
    expect(st.seq).toBe(9);          // new ids never clash with saved ones
    ensureRoster(st, rng(3));
    expect(new Set([...st.aces, ...st.fallen].map((x) => x.id)).size).toBe(st.aces.length + st.fallen.length);
  });
});

describe('places', () => {
  it('names where a mission was flown', () => {
    const byId = (id: string) => CAMPAIGN.find((m) => m.id === id)!;
    expect(placeOf(byId('m2'))).toBe('Bremen');
    expect(placeOf(byId('m4'))).toBe('Leipzig');
    expect(placeOf(byId('m6'))).toBe('the Netherlands');
    expect(placeOf(survivalMission('gunner'))).toBe('the Reich');
    expect(placeOf({ id: 'acehunt-pilot', target: 'Jagdgeschwader aces', number: 0 })).toBe('the Ruhr');
    for (const m of CAMPAIGN) expect(hasPhrase(placeOf(m)), m.id).toBe(true);
  });
});

describe('rewards', () => {
  it('has the Experten Killer medal and the ace achievements', () => {
    expect(MEDALS.some((m) => m.name === 'Experten Killer')).toBe(true);
    for (const id of ['expKill', 'expGrudge', 'expWanted', 'expFive']) expect(ACHIEVEMENTS.some((a) => a.id === id), id).toBe(true);
  });
});

// Latin that stays in Arabic text: aircraft designations and the S-2 office
const KEEP = /Fw 190|Bf 109|Me 262|Me 410|S-2/g;
function arabicFor(s: string): string {
  const out = tx(s);
  expect(out, s).toMatch(/[؀-ۿ]/);
  expect(out.replace(KEEP, ''), `untranslated words in: ${s}\n→ ${out}`).not.toMatch(/[A-Za-z]{2,}/);
  return out;
}

describe('Arabic', () => {
  beforeEach(() => { setLang('ar'); });

  it('names, ranks, units, traits, places', () => {
    for (const w of [...FIRST_NAMES, ...SURNAMES]) arabicFor(w);
    for (const r of ACE_RANKS) { arabicFor(r.name); arabicFor(r.short); }
    for (const t of TRAIT_IDS) { arabicFor(TRAITS[t].label); arabicFor(TRAITS[t].blurb); for (const u of TRAITS[t].units) arabicFor(u); }
    for (const c of COLOURS) arabicFor(c.name);
    const st = fresh(13);
    for (const a of st.aces) { arabicFor(aceName(a)); arabicFor(fullRankName(a)); arabicFor(traitLabel(a.trait)); arabicFor(unitLabel(a.unit)); arabicFor(`${['Lt.', 'Oblt.', 'Hptm.', 'Maj.', 'Obstlt.', 'Obst.'][a.rank]} ${a.last}`); }
    for (const p of ['the Reich', 'the Ruhr', 'the Channel', 'Bremen', 'Kiel', 'Gotha']) arabicFor(placeLabel(p));
  });

  it('dossier, debrief and intelligence lines for every kind of outcome', () => {
    const st = fresh(14);
    const outcomes: Partial<EncounterInput>[] = [
      { fate: 'down', byPlayer: true }, { fate: 'down' }, { fate: 'bailed', byPlayer: true }, { fate: 'bailed' },
      { fate: 'escaped', health: 0.2, wounded: ['Sgt. Reilly', 'Capt. Hal Brenner'] }, { fate: 'withdrew', hits: HIT_CLAIM + 1, downed: 3 },
      { fate: 'withdrew', downedUs: true, downed: 1, role: 'pilot', place: 'Leipzig' }, { fate: 'withdrew', downedUs: true, downed: 2, place: 'the Reich' },
    ];
    outcomes.forEach((o, i) => {
      const a = st.aces[i % st.aces.length];
      a.victories = ACE_RANKS[Math.min(5, a.rank + 1)].at - 1;   // every outcome can carry a promotion
      applyEncounter(st, a.id, enc(o), rng(i + 1));
      for (const it of st.last!.items) for (const l of reportLines(it)) arabicFor(l);
    });
    for (const a of [...st.aces, ...st.fallen]) { for (const e of a.history) arabicFor(encounterText(e)); const m = memoryText(a); if (m) arabicFor(m); }
  });

  it('radio lines, recorded and spoken', () => {
    for (const n of SURNAMES) {
      arabicFor(`Intelligence was right — that's ${n}'s machine! Watch for his markings!`);
      arabicFor(`You got ${n}! That's one Experte off the board!`);
      arabicFor(`Hptm. ${n}`);
    }
    arabicFor('He\'s back — the one who wounded Sgt. Reilly over Bremen!');
    arabicFor('He\'s back — the one who shot us down over the Reich!');
    arabicFor('Fw 190 (Experte)');
    const lines = JSON.parse(readFileSync(new URL('../tools/voice/lines.json', import.meta.url), 'utf8')).lines as { id?: string; text?: string; vars?: Record<string, string[]> }[];
    const nem = lines.filter((l) => l.id?.startsWith('nem_'));
    expect(nem.length).toBeGreaterThan(15);
    for (const l of nem) {
      const [key, values] = l.vars ? Object.entries(l.vars)[0] : ['', ['']];
      if (l.vars) expect(values).toEqual(SURNAMES);
      for (const v of values) arabicFor(l.text!.replace(`{${key}}`, v));
    }
  });

  it('English is unchanged', () => {
    setLang('en');
    const st = fresh(15);
    const a = st.aces[0];
    expect(aceName(a)).toBe(`${ACE_RANKS[a.rank].short} ${a.first} ${a.last}`);
    expect(fullRankName(a)).toBe(`${ACE_RANKS[a.rank].name} ${a.first} ${a.last}`);
  });
});
