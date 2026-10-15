import { afterEach, describe, expect, it, vi } from 'vitest';
const FS = 'node:fs';
const { readFileSync, statSync } = await import(FS) as { readFileSync(p: string, enc: 'utf8'): string; statSync(p: string): { size: number } };
import { Music } from '../src/audio/Music';
import { snareBar, LAYER_SR, PEAK } from '../src/audio/MusicLayers';
import { CUES, MAX_LOSS_CUES, MIN_GAP, ScoreDirector, bombRunBed, bombRunSnare, moodSnare, transposeRate } from '../src/audio/ScoreDirector';
import { PHRASES } from '../src/i18n/phrases';

const manifest = JSON.parse(readFileSync('public/audio/manifest.json', 'utf8')).music;
const CUE_FILES = ['sting_rise', 'sting_bombsaway', 'sting_strike', 'sting_loss', 'sting_win', 'sting_bunk'];
const dur = (name: string) => (manifest[name]?.frames && manifest[name]?.sampleRate ? manifest[name].frames / manifest[name].sampleRate : 40);

function fixture() {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn() });
  const node = () => ({ gain: param(), frequency: param(), Q: param(), playbackRate: param(), buffer: null as unknown, connect: vi.fn(function(this: unknown) { return this; }), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), addEventListener: vi.fn() });
  const ctx = { currentTime: 0, sampleRate: 100, createGain: node, createBiquadFilter: node, createBufferSource: vi.fn(node), createBuffer: () => ({ getChannelData: () => new Float32Array(100) }) };
  vi.stubGlobal('window', { setInterval: () => 1, requestIdleCallback: () => 1 });
  const m = new Music(); m.init(ctx as any, node() as any, node() as any);
  for (const name of ['menu', 'tension', 'combat', 'climax', 'victory', 'defeat', 'crew', 'crewLoss', 'bombrun']) m.addTrack(name, { duration: dur(name) } as AudioBuffer, manifest[name] ?? {});
  const stings: Record<string, AudioBuffer> = {};
  for (const name of CUE_FILES) { stings[name] = { duration: 4 } as AudioBuffer; m.addTrack(name, stings[name], manifest[name]); }
  // the buffer sources started for a given stinger
  const played = (name: string) => ctx.createBufferSource.mock.results.map((r) => r.value).filter((s) => s.buffer === stings[name]);
  return { m, ctx, inner: m as any, played };
}
afterEach(() => vi.unstubAllGlobals());

describe('score director', () => {
  it('bounds cues by cooldown, a global gap and priority', () => {
    const d = new ScoreDirector();
    expect(d.request('strike', 0)).toBe(true);
    expect(d.request('strike', 5)).toBe(false);                 // cooldown
    expect(d.request('rise', 1)).toBe(false);                   // lower priority inside the gap
    expect(d.request('bombsAway', 1)).toBe(true);               // outranks the gap
    expect(d.request('rise', 1 + MIN_GAP + 0.1)).toBe(true);
    expect(d.request('strike', CUES.strike.cooldown + 0.1)).toBe(true);
    d.enabled = false; expect(d.request('win', 100)).toBe(false);
  });
  it('caps loss cues per mission and never plays one for the player', () => {
    const d = new ScoreDirector();
    expect(d.bomberLost(true, 0)).toBeNull();
    let n = 0;
    for (let i = 0; i < 8; i++) if (d.bomberLost(false, i * 11)) n++;
    expect(n).toBe(MAX_LOSS_CUES);
    d.reset(); expect(d.bomberLost(false, 0)).toBe('loss');
  });
  it('follows the bomb run: bombs away once on release, the strike only after the fall', () => {
    const d = new ScoreDirector();
    const seq = ['inbound', 'level', 'doors', 'countdown', 'away', 'falling', 'strike', 'rally', 'complete'] as const;
    const cues = seq.map((p, i) => d.bombRun(p, i * 10));
    expect(cues).toEqual([null, null, null, null, 'bombsAway', null, 'strike', null, null]);
    expect(d.bombRun('complete', 100)).toBeNull();
    // a run that jumps straight to strike (no fall seen) earns no strike stinger
    const e = new ScoreDirector(); expect(e.bombRun('strike', 0)).toBeNull();
  });
  it('rises only when entering the climax', () => {
    const d = new ScoreDirector();
    expect(d.mood('combat', 'climax', 0)).toBe('rise');
    expect(d.mood('climax', 'climax', 50)).toBeNull();
    expect(d.mood('climax', 'combat', 60)).toBeNull();
    expect(d.mood('tension', 'climax', 10)).toBeNull();        // cooldown
    expect(d.mood('tension', 'climax', 50)).toBe('rise');
  });
  it('maps the run and the mood to the bed and the snare layer', () => {
    expect(bombRunBed('idle')).toBe(false); expect(bombRunBed('rally')).toBe(false); expect(bombRunBed('complete')).toBe(false);
    expect(bombRunBed('inbound')).toBe(true); expect(bombRunBed('strike')).toBe(true);
    expect(bombRunSnare('countdown')).toBe(1);
    expect(bombRunSnare('doors')).toBeGreaterThan(bombRunSnare('inbound'));
    expect(bombRunSnare('away')).toBeLessThan(bombRunSnare('countdown'));
    expect(bombRunSnare('idle')).toBe(0);
    expect(moodSnare('calm', 0.9)).toBe(0); expect(moodSnare('tension', 0.4)).toBe(0);
    expect(moodSnare('combat', 0.8)).toBeGreaterThan(moodSnare('combat', 0.45));
    expect(moodSnare('climax', 1)).toBeGreaterThan(0);
  });
  it('transposes by the nearest way', () => {
    expect(transposeRate(2, 2)).toBe(1);
    expect(transposeRate(2, 9)).toBeCloseTo(2 ** (-5 / 12));   // D -> A: down a fourth
    expect(transposeRate(2, 4)).toBeCloseTo(2 ** (2 / 12));
    for (let r = 0; r < 12; r++) { expect(transposeRate(2, r)).toBeGreaterThan(0.7); expect(transposeRate(2, r)).toBeLessThan(1.42); }
  });
});

describe('field snare layer', () => {
  const spb = 60 / 100;
  it('renders one bar plus a tail, deterministic and peak-normalised', () => {
    const a = snareBar(spb, 'march', 4), b = snareBar(spb, 'march', 4);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(4 * spb * LAYER_SR);
    let pk = 0; for (const v of a) { expect(Number.isFinite(v)).toBe(true); pk = Math.max(pk, Math.abs(v)); }
    expect(pk).toBeCloseTo(PEAK, 2);
  });
  it('the roll crescendos across the bar', () => {
    const d = snareBar(spb, 'roll', 1), bar = 4 * spb;
    const e = (t0: number, t1: number) => { let s = 0; for (let i = Math.round(t0 * LAYER_SR); i < Math.round(t1 * LAYER_SR); i++) s += d[i] * d[i]; return s; };
    expect(e(bar * 0.75, bar)).toBeGreaterThan(e(0, bar * 0.25) * 3);
  });
});

describe('adaptive score 2.0 in Music', () => {
  it('swaps to the bomb-run bed for the run and back after the rally', () => {
    const { m, ctx, inner } = fixture();
    m.setContext('m1', false); m.setScene('mission');
    expect(m.playing).toBe('tension');
    ctx.currentTime = 2; m.setBombRun('inbound'); inner.updateTracks();
    expect(m.playing).toBe('bombrun');
    expect(inner.layerLevels().snare).toBeCloseTo(bombRunSnare('inbound') * 1, 5);
    ctx.currentTime = 4; m.setBombRun('countdown');
    expect(inner.layerLevels().snare).toBe(1);
    ctx.currentTime = 30; m.setBombRun('rally'); inner.lastSwitch = -99; inner.updateTracks();
    expect(m.playing).toBe('tension');
  });
  it('plays bombs away on the grid, ducks the bed, and respects the cue switch', () => {
    const { m, ctx, inner, played } = fixture();
    m.setContext('m1', false); m.setScene('mission');
    m.setBombRun('countdown'); inner.updateTracks();
    ctx.currentTime = 3; m.setBombRun('away');
    const [s] = played('sting_bombsaway');
    expect(s).toBeTruthy();
    expect(s.start.mock.calls[0][0]).toBeGreaterThanOrEqual(3);
    expect(s.start.mock.calls[0][0]).toBeLessThan(3 + 60 / 100 + 0.1); // within a beat
    expect(s.playbackRate.value).toBe(1);                              // the bed is in D: no transposition
    expect(inner.bedBus.gain.setTargetAtTime).toHaveBeenCalledWith(CUES.bombsAway.duck, expect.any(Number), 0.06);
    // switched off: the bed still changes, the stingers stay quiet
    const b = fixture(); b.m.cues = false; b.m.setContext('m1', false); b.m.setScene('mission');
    b.m.setBombRun('falling'); b.m.setBombRun('strike');
    expect(b.played('sting_strike')).toHaveLength(0);
  });
  it('transposes a loss stinger to the climax bar and bounds a massacre', () => {
    const { m, ctx, inner, played } = fixture();
    m.setContext('m1', false); m.setScene('mission');
    inner.mood = 'climax'; inner.lastSwitch = -99; inner.updateTracks();
    expect(m.playing).toBe('climax');
    for (let i = 0; i < 6; i++) { ctx.currentTime = 1 + i * 11; m.bomberLost(false); }
    m.bomberLost(true);
    const s = played('sting_loss');
    expect(s).toHaveLength(MAX_LOSS_CUES);
    expect(s[0].playbackRate.value).toBeCloseTo(transposeRate(2, manifest.climax.roots[0]), 5);
  });
  it('opens a win with the fanfare and brings the victory track in under it', () => {
    const { m, ctx, inner, played } = fixture();
    m.setContext('m1', false); m.setScene('mission'); ctx.currentTime = 10;
    m.stinger(true);
    expect(played('sting_win')).toHaveLength(1);
    expect(m.playing).toBe('victory');
    expect(inner.lead.when).toBeGreaterThan(10.4);
    // a loss: the recorded defeat path, no fanfare
    const b = fixture(); b.m.setScene('mission'); b.m.stinger(false); expect(b.played('sting_win')).toHaveLength(0);
  });
  it('rises into the climax with the accent on the new track\'s downbeat', () => {
    const { m, ctx, inner, played } = fixture();
    m.setContext('m1', false); m.setScene('mission');
    ctx.currentTime = 1; inner.mood = 'combat'; inner.moodAt = 1; inner.lastSwitch = -99; inner.updateTracks();
    ctx.currentTime = 5; m.setThreat(1); inner.smooth = 0.95; inner.schedule();
    expect(m.mood).toBe('climax');
    const [s] = played('sting_rise');
    expect(s).toBeTruthy();
    const [start, off] = s.start.mock.calls[0];
    expect(start - off + manifest.sting_rise.accent).toBeCloseTo(inner.lead.when, 3);
  });
  it('marks the empty bunk in the crew room once', () => {
    const { m, played } = fixture();
    m.setScene('menu'); m.setCrewRoom(true); m.setCrewRoom(true);
    expect(played('sting_bunk')).toHaveLength(1);
    m.setCrewRoom(null); m.setCrewRoom(false);
    expect(played('sting_bunk')).toHaveLength(1);
  });
});

describe('score 2.0 assets', () => {
  it('ships original cues under the 3 MB budget, lazily loaded', () => {
    let bytes = 0;
    for (const name of ['bombrun', ...CUE_FILES]) {
      const e = manifest[name];
      expect(e, name).toBeTruthy();
      bytes += statSync('public/audio/' + e.file).size;
      expect(e.gain).toBeGreaterThan(0); expect(e.gain).toBeLessThanOrEqual(1);
      expect(e.loop).toBe(name === 'bombrun');
    }
    const bed = manifest.bombrun;
    expect(bed.roots).toHaveLength(bed.bars);
    expect(bed.loopEnd - bed.loopStart).toBeCloseTo(bed.bars * 240 / bed.bpm, 4);
    expect(bytes).toBeLessThan(3_000_000);
    // not in the first music batch (Sound.loadMusic): they stream in once a mission starts
    expect(readFileSync('src/audio/Sound.ts', 'utf8')).toContain("const first = ['menu', 'tension', 'combat', 'victory', 'defeat'];");
    const tool = readFileSync('tools/audio/score2_build.mjs', 'utf8');
    expect(tool).toContain('no recordings, no borrowed melodies');
    expect(readFileSync('public/audio/CREDITS.md', 'utf8')).toContain('score2_build.mjs');
  });
  it('has Arabic for the new setting', () => {
    expect(PHRASES['Music cues']).toMatch(/[؀-ۿ]/);
  });
});
