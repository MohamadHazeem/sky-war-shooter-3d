import { afterEach, describe, expect, it, vi } from 'vitest';
const FS = 'node:fs';
const { readFileSync, statSync } = await import(FS) as { readFileSync(p: string, enc: 'utf8'): string; statSync(p: string): { size: number } };
import { Music } from '../src/audio/Music';
import { modeThreat, scoreMode } from '../src/audio/ModeMusic';
import { nightMission, raidMission } from '../src/game/RaidDefence';

const manifest = JSON.parse(readFileSync('public/audio/manifest.json', 'utf8')).music;
const names = ['night', 'field', 'train', 'boss', 'crew', 'crewLoss', 'breakup'];
function fixture() {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn() });
  const node = () => ({ gain: param(), frequency: param(), Q: param(), connect: vi.fn(function(this: unknown) { return this; }), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), addEventListener: vi.fn() });
  const ctx = { currentTime: 0, sampleRate: 100, createGain: node, createBiquadFilter: node, createBufferSource: vi.fn(node), createBuffer: () => ({ getChannelData: () => new Float32Array(100) }) };
  vi.stubGlobal('window', { setInterval: () => 1, requestIdleCallback: () => 1 });
  const m = new Music(); m.init(ctx as any, node() as any, node() as any);
  for (const name of ['menu', 'tension', 'climax', 'victory', ...names]) m.addTrack(name, { duration: 40 } as AudioBuffer, manifest[name] ?? {});
  return { m, ctx, inner: m as any };
}
afterEach(() => vi.unstubAllGlobals());
describe('mode scores', () => {
  it('selects the real special-operation mission IDs and gives the boss priority', () => {
    expect(scoreMode(nightMission().id, false)).toBe('night');
    expect(scoreMode(raidMission().id, false)).toBe('field');
    expect(scoreMode('strafe-pilot', false)).toBe('train');
    expect(scoreMode('night-pilot', true)).toBe('boss');
    expect(scoreMode('m1', false)).toBe('day');
    expect(scoreMode(undefined, false)).toBe('day');
  });
  it('builds when searchlights cone raiders and preserves higher combat threat', () => {
    expect(modeThreat(0.1, 'night', 0)).toBe(0.1);
    expect(modeThreat(0.1, 'night', 1)).toBeCloseTo(0.66);
    expect(modeThreat(0.1, 'night', 3)).toBeGreaterThan(modeThreat(0.1, 'night', 1));
    expect(modeThreat(0.99, 'night', 1)).toBe(0.99);
    expect(modeThreat(0, 'boss', 0)).toBe(0.9);
    expect(modeThreat(0.1, 'field', 3)).toBe(0.1);
  });
  it('cross-fades mission modes and room variants, returning to menu/day score', () => {
    const { m, ctx, inner } = fixture();
    m.setContext('night-pilot', false); m.setScene('mission');
    expect(m.playing).toBe('night');
    const old = inner.lead;
    ctx.currentTime = 1; m.setContext('raid-pilot', false); inner.updateTracks();
    expect(m.playing).toBe('field');
    expect(old.gain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 1.08, 2 / 3);
    expect(old.src.stop).toHaveBeenCalled();
    expect(old.gain.gain.cancelAndHoldAtTime).toHaveBeenCalledWith(1);
    m.setContext('strafe-pilot', false); inner.updateTracks(); expect(m.playing).toBe('train');
    m.setContext('strafe-pilot', true); inner.updateTracks(); expect(m.playing).toBe('boss');
    m.setScene('menu'); m.setCrewRoom(false); expect(m.playing).toBe('crew');
    m.setCrewRoom(true); expect(m.playing).toBe('crewLoss');
    m.setCrewRoom(null); expect(m.playing).toBe('menu');
    m.setContext('m1', false); m.setScene('mission'); ctx.currentTime = 5; inner.updateTracks(); expect(m.playing).toBe('tension');
  });
  it('adapts layers, drops them at Reduced detail, and keeps room music unlayered', () => {
    const { m, inner } = fixture(); m.setContext('night-pilot', false); m.setScene('mission');
    inner.smooth = 0.1; const quiet = inner.layerLevels(); inner.smooth = 0.85;
    expect(inner.layerLevels().strings).toBeGreaterThan(quiet.strings);
    expect(inner.layerLevels().brass).toBe(0);
    m.setDetail(true); expect(inner.layerLevels()).toEqual({ drums: 0, brass: 0, strings: 0, snare: 0 });
    m.setDetail(false); m.setCrewRoom(true); expect(inner.layerLevels()).toEqual({ drums: 0, brass: 0, strings: 0, snare: 0 });
  });
  it('plays a bounded breakup overlay, respects mute, and resumes the selected bed', () => {
    const { m, ctx, inner } = fixture(); m.setContext('m5', true); m.setScene('mission');
    const count = ctx.createBufferSource.mock.calls.length;
    m.breakup(); m.breakup(); expect(ctx.createBufferSource.mock.calls.length).toBe(count + 1);
    expect(m.playing).toBe('boss');
    ctx.currentTime = 4; m.enabled = false; m.stop(); m.breakup(); inner.schedule();
    expect(ctx.createBufferSource.mock.calls.length).toBe(count + 1);
    m.enabled = true; m.resume(); expect(m.playing).toBe('boss');
  });
  it('late track arrival replaces the fallback without blocking gameplay', () => {
    const { m, ctx, inner } = fixture(); inner.tracks.delete('night');
    m.setContext('night-pilot', false); m.setScene('mission'); expect(m.playing).toBe('tension');
    m.addTrack('night', { duration: 40 } as AudioBuffer, manifest.night);
    ctx.currentTime = 3; inner.updateTracks(); expect(m.playing).toBe('night');
  });
  it('ships loop metadata, source generator and less than 2 MB of compressed music', () => {
    let bytes = 0;
    for (const name of names) {
      const m = manifest[name]; bytes += statSync('public/audio/' + m.file).size;
      expect(m.loop).toBe(name !== 'breakup');
      expect(m.loopEnd).toBeLessThanOrEqual(m.frames / m.sampleRate);
      if (m.loop) expect(m.loopEnd - m.loopStart).toBeCloseTo(m.bars * 240 / m.bpm, 4);
      expect(m.gain).toBeGreaterThan(0); expect(m.gain).toBeLessThan(0.5);
    }
    expect(bytes).toBeLessThan(2_000_000);
    expect(readFileSync('tools/audio/mode_music_build.mjs', 'utf8')).toContain('deterministic');
  });
});
