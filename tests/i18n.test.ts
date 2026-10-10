import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { stubStorage } from './helpers';
import { en } from '../src/i18n/en';
import { ar } from '../src/i18n/ar';
import { PHRASES, PATTERNS } from '../src/i18n/phrases';
import { t, tx, setLang, getLang, hasPhrase } from '../src/i18n';
import { CAMPAIGN } from '../src/game/Missions';
import { UPGRADES, WEAPONS, AIRCRAFT, PERKS } from '../src/game/Upgrades';
import { STATIONS } from '../src/world/B17Layout';
import { CREW } from '../src/world/Crew';
import { VOICE_LINES } from '../src/audio/voiceLines';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (s: string) => [...s.matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => m[1].toLowerCase()).sort();
const arabic = /[؀-ۿ]/;

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); });

describe('interface strings', () => {
  it('every key in en.ts exists in ar.ts, translated', () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(ar[k], k).toBeTypeOf('string');
      expect(ar[k].length, k).toBeGreaterThan(0);
    }
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  it('keeps placeholders and markup', () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ar[k]), k).toEqual(placeholders(en[k]));
      expect(tags(ar[k]), k).toEqual(tags(en[k]));
    }
  });

  it('t() follows the language and fills variables', () => {
    expect(getLang()).toBe('en');
    expect(t('campaign.mission', { n: 3 })).toBe('MISSION 3');
    setLang('ar');
    expect(t('campaign.mission', { n: 3 })).toBe('المهمة 3');
    expect(localStorage.getItem('sws3d.lang')).toBe('ar');
  });
});

describe('phrase tables', () => {
  it('Arabic values keep placeholders, markup and the bomber-name token', () => {
    for (const [k, v] of Object.entries(PHRASES)) {
      expect(placeholders(v), k).toEqual(placeholders(k));
      expect(tags(v), k).toEqual(tags(k));
      if (k.includes('Sky Queen')) expect(v, k).toContain('Sky Queen');
    }
  });

  it('patterns are anchored', () => {
    for (const [re] of PATTERNS) expect(re.source.startsWith('^') && re.source.endsWith('$'), String(re)).toBe(true);
  });

  it('tx() is the identity in English and translates in Arabic', () => {
    expect(tx('Left Waist')).toBe('Left Waist');
    expect(tx('Wave {n}', { n: 2 })).toBe('Wave 2');
    setLang('ar');
    expect(tx('Left Waist')).toMatch(arabic);
    expect(tx('LEFT WAIST')).toBe(tx('Left Waist'));   // upper-cased display text
    expect(tx('no such line 123')).toBe('no such line 123');
  });

  it('covers every mission text', () => {
    for (const m of CAMPAIGN) {
      for (const s of [m.title, m.target, m.date, ...m.briefing, ...m.objectives, ...(m.success ? [m.success] : [])]) {
        expect(hasPhrase(s), `${m.id}: ${s}`).toBe(true);
      }
      for (const w of m.waves) if (w.radio) expect(hasPhrase(w.radio[1]), `${m.id} radio: ${w.radio[1]}`).toBe(true);
    }
  });

  it('covers the armory, hangar and field upgrades', () => {
    for (const u of UPGRADES) for (const s of [u.name, u.desc, u.per]) expect(hasPhrase(s), s).toBe(true);
    for (const d of [...WEAPONS, ...AIRCRAFT, ...PERKS]) for (const s of [d.name, d.desc]) expect(hasPhrase(s), s).toBe(true);
  });

  it('covers stations, crew and every recorded radio line', () => {
    for (const s of Object.values(STATIONS)) expect(hasPhrase(s.label), s.label).toBe(true);
    for (const c of CREW) expect(hasPhrase(c.label), c.label).toBe(true);
    for (const [id, l] of Object.entries(VOICE_LINES)) {
      expect(hasPhrase(l.text), `${id}: ${l.text}`).toBe(true);
      for (const sp of l.speakers) expect(hasPhrase(sp), `speaker ${sp}`).toBe(true);
    }
  });
});
