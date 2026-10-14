/// <reference types="node" />
import { readFileSync, existsSync, statSync } from 'node:fs';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { DuckEnvelope, engineMask, skinDamage } from '../src/audio/Soundscape';
import { attachRadioChatter, detachRadioChatter, interphoneTick, onContact } from '../src/game/RadioChatter';
import { hasPhrase } from '../src/i18n';
import { VOICE_LINES } from '../src/audio/voiceLines';

const cfg = JSON.parse(readFileSync('tools/voice/lines.json', 'utf8'));
const man = JSON.parse(readFileSync('public/audio/voice/manifest.json', 'utf8'));
afterEach(detachRadioChatter);

describe('interior controls', () => {
  it('keeps engine identity, including asymmetric failures and repair', () => {
    expect(engineMask([false, false, false, false])).toBe(15);
    expect(engineMask([true, false, false, true])).toBe(6);
    expect(engineMask([false, true, true, false])).toBe(9);
    expect(engineMask([true, true, true, true])).toBe(0);
    expect(engineMask([false, false, false, false])).toBe(15);
  });
  it('air leaks follow damaged fuselage, not engine or wing damage', () => {
    const zones = [{ name: 'fuselage', hp: 75, maxHp: 100 }, { name: 'fuselageAft', hp: 25, maxHp: 100 }, { name: 'engine1', hp: 0, maxHp: 100 }];
    expect(skinDamage(zones)).toBe(.5);
    zones[0].hp = zones[1].hp = 100;
    expect(skinDamage(zones)).toBe(0);
    zones[0].hp = -200; zones[1].hp = NaN;
    expect(skinDamage(zones)).toBe(1);
    expect(skinDamage([])).toBe(0);
  });
  it('gun bursts and hits cannot release a longer voice duck', () => {
    const d = new DuckEnvelope();
    d.add(0, 5, .72, .65);
    for (let t = 0; t < 3; t += .07) d.add(t, .09, .5, 1);
    expect(d.level(3.5)).toBeCloseTo(.72);
    expect(d.level(3.5, true)).toBeCloseTo(.65);
    expect(d.level(5.1, true)).toBe(1);
    const param = { cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() };
    d.schedule(param as unknown as AudioParam, 3.5, true);
    expect(param.setTargetAtTime.mock.calls.at(-1)?.slice(0, 2)).toEqual([1, 5]);
    d.clear(); expect(d.level(0)).toBe(1);
  });
  it('bounds duck storage and ignores nonfinite requests', () => {
    const d = new DuckEnvelope(); d.add(0, 10, .4, .3);
    for (let i = 0; i < 100; i++) d.add(0, 1 + i / 100, .5 + i / 300, .7);
    d.add(0, NaN, 0, 0);
    expect(d.level(5, true)).toBeCloseTo(.3);
    expect(d.level(31)).toBe(1);
  });
});

describe('crew conversation', () => {
  it('waits for a completed missed pass, then a spaced check-in and reply', () => {
    const callout = vi.fn(); attachRadioChatter({ callout }, 'gunner');
    interphoneTick(1, true, 0, 0, 0);
    interphoneTick(5, true, 20, 0, 0);
    interphoneTick(8, false, 20, 0, 0); expect(callout).not.toHaveBeenCalled();
    interphoneTick(10, false, 20, 0, 0); expect(callout.mock.calls[0][2]).toBe(VOICE_LINES.ss_miss.text);
    interphoneTick(15, false, 20, 0, 0); expect(callout.mock.calls[1][2]).toBe(VOICE_LINES.ss_check.text);
    interphoneTick(21, false, 20, 0, 0); expect(callout.mock.calls[2][2]).toBe(VOICE_LINES.ss_clear.text);
    interphoneTick(22, false, 20, 0, 0); expect(callout).toHaveBeenCalledTimes(3);
  });
  it('does not call a hit pass a miss; wounds supersede a healthy reply', () => {
    const callout = vi.fn(); attachRadioChatter({ callout }, 'gunner');
    interphoneTick(1, true, 0, 0, 0); interphoneTick(5, true, 20, 1, 1);
    interphoneTick(10, false, 20, 1, 1); interphoneTick(15, false, 20, 1, 1); interphoneTick(21, false, 20, 1, 1);
    expect(callout.mock.calls.some(c => c[2] === VOICE_LINES.ss_miss.text)).toBe(false);
    expect(callout.mock.calls.at(-1)?.[2]).toBe(VOICE_LINES.ss_hurt.text);
    attachRadioChatter({ callout }, 'pilot'); callout.mockClear(); interphoneTick(60, false, 0, 0, 2); expect(callout).not.toHaveBeenCalled();
  });
  it('new attacks cancel pending check-ins; mission reset clears state', () => {
    const callout = vi.fn(); attachRadioChatter({ callout }, 'gunner');
    interphoneTick(1, true, 0, 0, 0); interphoneTick(7, false, 0, 0, 0); interphoneTick(10, true, 0, 0, 0);
    interphoneTick(12, true, 0, 0, 0); expect(callout).not.toHaveBeenCalled();
    attachRadioChatter({ callout }, 'gunner'); interphoneTick(1, false, 0, 0, 0); expect(callout).not.toHaveBeenCalled();
    interphoneTick(31, false, 0, 0, 0); expect(callout.mock.calls[0][2]).toBe(VOICE_LINES.ss_quiet.text);
  });
  it('composes every type with all clock positions, in Arabic too', () => {
    const callout = vi.fn();
    for (const type of ['fw190','bf109','bf110','ju88','me262','me163','he111','me410','do335']) {
      for (const h of ['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve']) for (const lv of ['low','level','high']) {
        onContact({callout}, type, `${h} o'clock ${lv}`);
        expect(hasPhrase(callout.mock.calls.at(-1)![2])).toBe(true);
      }
    }
  });
});

describe('shipped soundscape assets', () => {
  it('covers all eleven dynamic source templates with real recordings and anchored mappings', () => {
    expect(new Set(cfg.dynamic.map((r: any) => r.source + ':' + r.template)).size).toBe(11);
    expect(man.dynamic).toEqual(cfg.dynamic);
    for (const r of cfg.dynamic) {
      expect(r.pattern.startsWith('^') && r.pattern.endsWith('$')).toBe(true);
      expect(man.clips[r.clip], r.clip).toBeTruthy();
      expect(existsSync('public/audio/voice/' + man.clips[r.clip].file)).toBe(true);
    }
    for (const l of cfg.lines.filter((l: any) => /^(ss_|pfx_ss_)/.test(l.id ?? ''))) expect(man.clips[l.id]?.text).toBe(l.text);
  });
  it('keeps all added media below five MB, measured and explicitly CC0 credited', () => {
    const report = JSON.parse(readFileSync('docs/phase8/reports/05-audio.json', 'utf8'));
    const sources = JSON.parse(readFileSync('tools/audio/soundscape_sources.json', 'utf8'));
    const credits = readFileSync('public/audio/CREDITS.md', 'utf8');
    let bytes = 0;
    for (const f of report.files) {
      bytes += statSync('public/audio/' + f.file).size;
      expect(f.peakDb).toBeLessThan(-1); expect(Number.isFinite(f.lufsI)).toBe(true);
      expect(credits).toContain(f.file);
      for (const id of f.sources) expect(sources[id].license).toContain('/publicdomain/zero/');
    }
    for (const [id, clip] of Object.entries(man.clips) as [string, any][]) if (/^(ss_|pfx_ss_)/.test(id)) bytes += statSync('public/audio/voice/' + clip.file).size;
    const voices = JSON.parse(readFileSync('docs/phase8/reports/05-voice.json', 'utf8'));
    expect(voices.files).toHaveLength(34);
    for (const v of voices.files) {
      expect(v.peakDb).toBeLessThan(-1);
      expect(v.durationOK).toBe(true);
      expect(Number.isFinite(v.lufsI)).toBe(true);
    }
    expect(bytes).toBeLessThan(5_000_000);
  });
});

// Exercise the real resolver: exact clips, composed clock clips and dynamic mappings.
it('resolves spoken equivalents in the runtime, including arbitrary names and all clocks', async () => {
  const { Voice } = await import('../src/audio/Voice');
  const voice = new Voice() as any;
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => man } as Response);
  vi.spyOn(voice, 'fetchBuf').mockResolvedValue(null);
  try {
    await voice.load();
    const cases: [string, string][] = [
      ["He's back — the one who wounded Sgt. Walsh over Berlin!", 'ss_revenge_wound'],
      ["He's back — the one who shot us down over Emden!", 'ss_revenge_down'],
      ["Yellow noses, twelve o'clock high! That's Bauer's Staffel — 45 kills!", 'ss_ace_in'],
      ['Bauer is breaking off — the yellow noses are heading home.', 'ss_ace_out'],
      ['You got Bauer! The whole group saw him go down!', 'ss_ace_kill'],
      ['Somebody got Bauer! Scratch one Experte!', 'ss_ace_other'],
      ['Careful, Blue two — that Bf 110 has a rear gunner. Come at him from below!', 'ss_rear'],
      ["He's seen you — he's breaking left! Stay with him!", 'ss_break_left'],
      ["He's seen you — he's breaking right! Stay with him!", 'ss_break_right'],
      ["Little friends, this is Memphis Belle. We've lost two engines and can't keep up — can you cover us?", 'ss_cover'],
      ['Me 262s coming in — jet — very fast, fragile!', 'ss_type_me262'],
      ['Do 335s in this bunch — Pfeil, a push-pull fighter as fast as a jet in a dive!', 'ss_type_do335'],
    ];
    for (const [text, id] of cases) expect(voice.resolve('Navigator', text)).toEqual([id]);
    for (const [type, label] of [['fw190','Fw 190'],['bf109','Bf 109'],['bf110','Bf 110'],['ju88','Ju 88'],['me262','Me 262'],['me163','Me 163'],['he111','He 111'],['me410','Me 410'],['do335','Do 335']]) {
      expect(voice.resolve('Navigator', `${label}s, nine o'clock high!`)).toEqual([`pfx_ss_${type}`, 'clock_9_high__nav']);
    }
    expect(voice.resolve('Navigator', 'This is an unrelated new line!')).toBeNull();
  } finally { fetch.mockRestore(); }
});
