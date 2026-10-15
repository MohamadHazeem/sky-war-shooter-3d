import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { stubStorage } from './helpers';
import { en, type UiKey } from '../src/i18n/en';
import { ALL_TABLES } from '../src/i18n/phrases';
import { TABLE_ORDER, arTables, type LangPack } from '../src/i18n/pack';
import type { PhraseTable } from '../src/i18n/types';
import { t, tx, txIn, setLang, getLang, loadLang, hasPhrase, isTranslated, LANGS } from '../src/i18n';
import fr from '../src/i18n/packs/fr';
import de from '../src/i18n/packs/de';
import es from '../src/i18n/packs/es';
import { CAMPAIGN, type Mission } from '../src/game/Missions';
import { UPGRADES, WEAPONS, AIRCRAFT, PERKS } from '../src/game/Upgrades';
import { STATIONS } from '../src/world/B17Layout';
import { CREW } from '../src/world/Crew';
import { VOICE_LINES } from '../src/audio/voiceLines';
import { SKILLS, BRANCHES } from '../src/game/Skills';
import { RAID_TEMPLATES, sideRaidsFor, FIRST_GAP, LAST_GAP } from '../src/game/SideRaids';
import { ALL_ENEMIES, MOODS, SEATS, SKILLS as BATTLE_SKILLS, buildCustomMission, configParts, sanitizeConfig, type CustomConfig } from '../src/game/CustomBattle';
import { weeklyMission, weeklyScenario, fmtWeekCountdown } from '../src/game/Weekly';
import { MODES } from '../src/game/Modes';
import { NEWS } from '../src/game/WhatsNew';

// French, German and Spanish: the same coverage the Arabic tests ask for (tests/i18n.test.ts),
// checked against the Arabic tables, which list every English text the game translates.
// Gaps per table: I18N_GAPS=1 npx vitest run tests/i18nLocales.test.ts

type Latin = 'fr' | 'de' | 'es';
const PACKS: Record<Latin, LangPack & { tables: [string, PhraseTable][] }> = { fr, de, es };
const LATIN = Object.keys(PACKS) as Latin[];

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (s: string) => [...s.matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => m[1].toLowerCase()).sort();

// The Arabic tables by file name
const FS = 'node:fs';
const { readdirSync } = (await import(FS)) as { readdirSync(p: URL): string[] };
const AR = arTables();

beforeEach(() => { stubStorage(); });
afterEach(async () => { await setLang('en'); });

describe('language list and switching', () => {
  it('offers English, French, German, Spanish and Arabic, each named in its own language', () => {
    expect(LANGS.map((l) => l.id).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr']);
    expect(LANGS.find((l) => l.id === 'de')!.name).toBe('Deutsch');
  });

  it('loads a language pack on switch and remembers the choice', async () => {
    for (const l of LATIN) {
      await setLang(l);
      expect(getLang()).toBe(l);
      expect(isTranslated()).toBe(true);
      expect(localStorage.getItem('sws3d.lang')).toBe(l);
      expect(t('common.back')).toBe(PACKS[l].ui['common.back']);
      expect(tx('Left Waist')).toBe(PACKS[l].phrases['Left Waist']);
    }
    await setLang('en');
    expect(isTranslated()).toBe(false);
    expect(tx('Left Waist')).toBe('Left Waist');
  });

  it('upper-cased display text comes back upper-cased, placeholders untouched', async () => {
    await setLang('fr');
    expect(tx('LEFT WAIST')).toBe(fr.phrases['Left Waist'].toUpperCase());
    expect(tx('Wave {n}', { n: 4 })).toMatch(/4/);
  });

  it('the Arabic tables merge in the same order as phrases.ts', () => {
    expect(TABLE_ORDER.length).toBe(ALL_TABLES.length);
    expect(new Set(TABLE_ORDER).size).toBe(TABLE_ORDER.length);
    expect(TABLE_ORDER.every(Boolean)).toBe(true);
    expect([...AR.keys()].sort()).toEqual([...TABLE_ORDER].sort());
  });
});

describe.each(LATIN)('%s', (lang) => {
  const pack = PACKS[lang];
  beforeAll(async () => { await loadLang(lang); });

  it('interface strings: every key of en.ts, translated, placeholders and markup kept', () => {
    for (const k of Object.keys(en) as UiKey[]) {
      const v = pack.ui[k];
      expect(v, k).toBeTypeOf('string');
      expect(v!.length, k).toBeGreaterThan(0);
      expect(placeholders(v!), k).toEqual(placeholders(en[k]));
      expect(tags(v!), k).toEqual(tags(en[k]));
    }
    expect(Object.keys(pack.ui).filter((k) => !(k in en))).toEqual([]);
  });

  it('every table file has an Arabic twin and only its keys (no typos), same patterns', () => {
    const dir = readdirSync(new URL(`../src/i18n/${lang}/`, import.meta.url)).filter((f) => f.endsWith('.ts'));
    expect(pack.tables.length).toBe(dir.length);
    const problems: string[] = [];
    for (const [name, table] of pack.tables) {
      const twin = AR.get(name);
      if (!twin) { problems.push(`${lang}/${name}.ts has no ar/${name}.ts`); continue; }
      for (const k of Object.keys(table.phrases)) if (twin.phrases[k] === undefined) problems.push(`${lang}/${name}.ts key not in ar/${name}.ts: ${k}`);
      const mine = (table.patterns ?? []).map(([re]) => String(re)), theirs = (twin.patterns ?? []).map(([re]) => String(re));
      if (mine.join('\n') !== theirs.join('\n')) problems.push(`${lang}/${name}.ts patterns differ from ar/${name}.ts: ${mine.filter((r) => !theirs.includes(r)).join(' ')} | missing ${theirs.filter((r) => !mine.includes(r)).join(' ')}`);
    }
    expect(problems).toEqual([]);
  });

  it('values keep placeholders, markup and the bomber name', () => {
    for (const [k, v] of Object.entries(pack.phrases)) {
      expect(placeholders(v), `${lang}: ${k}`).toEqual(placeholders(k));
      expect(tags(v), `${lang}: ${k}`).toEqual(tags(k));
      if (k.includes('Sky Queen')) expect(v, k).toContain('Sky Queen');
      expect(v, `${lang}: ${k}`).not.toMatch(/[؀-ۿ]/);
    }
  });

  it('covers the Arabic phrase tables', () => {
    const gaps: string[] = [];
    let total = 0;
    for (const [name, twin] of AR) {
      const mine = pack.tables.find(([n]) => n === name)?.[1];
      for (const k of Object.keys(twin.phrases)) {
        total++;
        if (mine?.phrases[k] === undefined) gaps.push(`${name}: ${k}`);
      }
    }
    if (process.env.I18N_GAPS) console.log(`${lang} gaps (${gaps.length}/${total}):\n${gaps.join('\n')}`);
    // a goal merged later may add a few Arabic lines first; English shows until they are translated
    expect(gaps.length / total, gaps.slice(0, 20).join('\n')).toBeLessThan(0.01);
  });

  it('covers every mission text, upgrade, station, crew member and recorded radio line', () => {
    const has = (s: string) => expect(hasPhrase(s, lang), `${lang}: ${s}`).toBe(true);
    for (const m of CAMPAIGN) missionTexts(m).forEach(has);
    for (const u of UPGRADES) [u.name, u.desc, u.per].forEach(has);
    for (const d of [...WEAPONS, ...AIRCRAFT, ...PERKS]) [d.name, d.desc].forEach(has);
    for (const s of Object.values(STATIONS)) has(s.label);
    for (const c of CREW) has(c.label);
    for (const l of Object.values(VOICE_LINES)) { has(l.text); l.speakers.forEach(has); }
    for (const b of BRANCHES) { has(b.name); has(b.motto); }
    for (const s of SKILLS) { has(s.name); has(s.desc); }
    for (const d of MODES) { has(d.title); has(d.blurb); }
    for (const n of NEWS) { has(n.title); has(n.text); }
  });

  it('runtime texts the Arabic tables translate (raids, battles, weekly) translate too', () => {
    const missing = RUNTIME.filter((s) => hasPhrase(s, 'ar') && !hasPhrase(s, lang));
    expect(missing.length / RUNTIME.length, missing.slice(0, 20).join('\n')).toBeLessThan(0.01);
    // pattern translations never leave a capture unfilled or throw
    for (const s of RUNTIME) expect(txIn(lang, s), s).not.toMatch(/\$\d/);
  });
});

const missionTexts = (m: Mission) => [m.title, m.target, m.date, ...m.briefing, ...m.objectives, ...(m.success ? [m.success] : []),
  ...m.waves.flatMap((w) => (w.radio ? [w.radio[1]] : []))];

// Strings the game builds at runtime (the generators the Arabic tests walk)
const RUNTIME: string[] = (() => {
  const out = new Set<string>();
  for (const tpl of RAID_TEMPLATES) {
    out.add(tpl.label); out.add(tpl.verb); out.add(tpl.objective);
    for (const tg of tpl.targets) for (const s of [...tpl.brief(tg), tpl.success(tg), tg.city, tg.name]) out.add(s);
  }
  for (let seed = 1; seed <= 30; seed++) {
    for (let g = FIRST_GAP; g <= LAST_GAP(); g++) for (const r of sideRaidsFor(seed, g)) missionTexts(r.mission).forEach((s) => out.add(s));
  }
  const cfgs: Partial<CustomConfig>[] = [];
  for (const station of SEATS) for (const mood of MOODS) cfgs.push({ role: 'gunner', station, mood });
  for (const skill of BATTLE_SKILLS) cfgs.push({ role: 'pilot', skill, rounds: 0, boss: true, bossRound: 2 });
  for (const e of ALL_ENEMIES) cfgs.push({ enemies: [e], rounds: 1, boss: true, flak: true, escorts: false, specials: false });
  for (const c of cfgs) [...missionTexts(buildCustomMission(c)), ...configParts(sanitizeConfig(c))].forEach((s) => out.add(s));
  for (let w = 1; w <= 53; w++) {
    const key = `2026${String(w).padStart(2, '0')}`;
    const s = weeklyScenario(key);
    out.add(s.headline); out.add(`Operation ${s.operation}`); out.add(s.target);
    for (const role of ['gunner', 'pilot'] as const) missionTexts(weeklyMission(role, key)).forEach((x) => out.add(x));
  }
  for (const ms of [3 * 86400000 + 4 * 3600000 + 60000, 5 * 3600000]) out.add(fmtWeekCountdown(ms));
  return [...out].filter((s) => /[A-Za-z]{2}/.test(s));
})();
