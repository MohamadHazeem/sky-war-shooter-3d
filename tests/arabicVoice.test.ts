import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { stubStorage } from './helpers';
import { setLang, tx } from '../src/i18n';
import { arabicNumber, spokenArabic } from '../src/audio/arabicSpoken';
import { _resetVoiceLang, hasArabicTake, voiceLang, voiceUrl } from '../src/audio/VoiceLang';

type Clip = { file: string; role: string; text: string; dur: number };
const EN = JSON.parse(readFileSync('public/audio/voice/manifest.json', 'utf8')) as { clips: Record<string, Clip> };
const AR_PATH = 'public/audio/voice/ar/manifest.json';
const AR = JSON.parse(readFileSync(AR_PATH, 'utf8')) as { lang: string; clips: Record<string, Clip> };
const TEXTS = (JSON.parse(readFileSync('tools/voice/lines_ar.json', 'utf8')) as { texts: Record<string, { text: string; say?: string }> }).texts;
const arabic = /[؀-ۿ]/;

beforeEach(() => { stubStorage(); _resetVoiceLang(); });
afterEach(() => { setLang('en'); _resetVoiceLang(); });

describe('spoken Arabic', () => {
  it('spells numbers out', () => {
    expect(arabicNumber(1)).toBe('واحد');
    expect(arabicNumber(12)).toBe('اثنا عشر');
    expect(arabicNumber(17)).toBe('سبعة عشر');
    expect(arabicNumber(27)).toBe('سبعة وعشرون');
    expect(arabicNumber(190)).toBe('مئة وتسعون');
    expect(arabicNumber(262)).toBe('مئتان واثنان وستون');
    expect(arabicNumber(1944)).toBe('ألف وتسعمئة وأربعة وأربعون');
  });

  it('turns designations, digits and dashes into words and pauses', () => {
    expect(spokenArabic('طائرات Fw 190 مدرّعة — اضربوه!')).toBe('طائرات فوكه وولف مئة وتسعون مدرّعة، اضربوه!');
    expect(spokenArabic('Fw 190 A-8')).toBe('فوكه وولف مئة وتسعون إيه ثمانية');
    expect(spokenArabic('طائرة P-51D')).toBe('طائرة بي واحد وخمسون دي');
    expect(spokenArabic('المحرك رقم 3!')).toBe('المحرك رقم ثلاثة!');
    expect(spokenArabic('إلى «⁨Sky Queen⁩»…')).toBe('إلى سكاي كوين،');
  });

  it('every Arabic clip text is Arabic and its spoken form has no Latin or digits left', () => {
    expect(Object.keys(TEXTS).length).toBeGreaterThan(800);
    for (const [en, e] of Object.entries(TEXTS)) {
      expect(e.text, en).toMatch(arabic);
      expect(e.say ?? e.text, en).not.toMatch(/[A-Za-z0-9]/);
    }
  });

  it('the voice speaks the subtitle the player reads', () => {
    setLang('ar');
    let same = 0, total = 0;
    for (const [en, e] of Object.entries(TEXTS)) {
      const sub = tx(en);
      // crew-room lines filled at runtime are translated template-first (arabic.mjs does the same)
      if (/o'clock/.test(en) || !arabic.test(sub)) continue;
      total++;
      if (sub === e.text) same++;
    }
    // a translation edited after the last `arabic.mjs` run only drifts a few lines until the next render
    expect(total).toBeGreaterThan(600);
    expect(same / total).toBeGreaterThan(0.97);
  });
});

describe('Arabic voice-over assets', () => {
  it('mirrors the English clip ids with Arabic takes', () => {
    expect(AR.lang).toBe('ar');
    const ids = Object.keys(AR.clips);
    for (const id of ids) {
      expect(EN.clips[id], id).toBeTruthy();
      expect(AR.clips[id].role).toBe(EN.clips[id].role);
      expect(AR.clips[id].text, id).toMatch(arabic);
      expect(existsSync('public/audio/voice/ar/' + AR.clips[id].file), id).toBe(true);
    }
    // new English lines may wait for the next Arabic render (they fall back to English)
    expect(ids.length / Object.keys(EN.clips).length).toBeGreaterThan(0.95);
  });

  it('every role keeps its voice and stays in the size budget', () => {
    const roles = new Set(Object.values(AR.clips).map((c) => c.role));
    expect([...roles].sort()).toEqual([...new Set(Object.values(EN.clips).map((c) => c.role))].sort());
    let bytes = 0;
    for (const c of Object.values(AR.clips)) bytes += statSync('public/audio/voice/ar/' + c.file).size;
    expect(bytes).toBeLessThan(24 * 1024 * 1024);   // lazy: fetched clip by clip, only in Arabic
  });
});

describe('voice language', () => {
  it('plays Arabic takes only in Arabic, English otherwise or when a take is missing', () => {
    _resetVoiceLang({ tanks: { file: 'tanks.m4a', dur: 2 } });
    expect(voiceUrl('tanks', 'tanks.m4a')).toBe('/audio/voice/tanks.m4a');
    expect(voiceLang()).toBe('en');
    setLang('ar');
    expect(voiceLang()).toBe('ar');
    expect(hasArabicTake('tanks')).toBe(true);
    expect(voiceUrl('tanks', 'tanks.m4a')).toBe('/audio/voice/ar/tanks.m4a');
    expect(voiceUrl('rockets', 'rockets.m4a')).toBe('/audio/voice/rockets.m4a');
  });
});
