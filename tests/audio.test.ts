import { describe, expect, it } from 'vitest';
import { computeThreat, finalStretch, CLIMAX } from '../src/audio/Threat';
import { taikoBar, brassBar, stringsBar, LAYER_SR, PEAK } from '../src/audio/MusicLayers';
import { CAMPAIGN, survivalMission } from '../src/game/Missions';

const at = (x: number, z = 0) => ({ pos: { x, y: 0, z } });
const L = { x: 0, y: 0, z: 0 };

describe('threat', () => {
  it('is zero outside a mission and low in a lull', () => {
    expect(computeThreat({ active: false, enemies: [at(100)], listener: L })).toBe(0);
    const lull = computeThreat({ active: true, enemies: [], listener: L });
    expect(lull).toBeGreaterThan(0);
    expect(lull).toBeLessThan(0.15);
  });

  it('rises with more and closer fighters, and with damage', () => {
    const far = computeThreat({ active: true, enemies: [at(3500)], listener: L });
    const near = computeThreat({ active: true, enemies: [at(300)], listener: L });
    const crowd = computeThreat({ active: true, enemies: [at(300), at(500), at(700), at(800, 200), at(600, -300), at(400, 100)], listener: L });
    expect(far).toBeGreaterThan(0.15);
    expect(far).toBeLessThan(0.45);
    expect(near).toBeGreaterThan(far);
    expect(crowd).toBeGreaterThan(near);
    expect(crowd).toBeGreaterThan(0.45);
    expect(crowd).toBeLessThan(CLIMAX);
    const hurt = computeThreat({ active: true, enemies: [at(300)], listener: L, integrity: 0.3 });
    expect(hurt).toBeGreaterThan(near);
  });

  it('reaches the climax for a boss, ON FIRE, or a pressing final wave', () => {
    expect(computeThreat({ active: true, enemies: [{ ...at(2000), boss: true }], listener: L })).toBeGreaterThanOrEqual(CLIMAX);
    expect(computeThreat({ active: true, enemies: [at(2000)], listener: L, onFire: true })).toBeGreaterThanOrEqual(CLIMAX);
    const six = [at(300), at(500), at(700), at(800, 200), at(600, -300), at(400, 100)];
    expect(computeThreat({ active: true, enemies: six, listener: L, finalWave: true })).toBeGreaterThanOrEqual(CLIMAX);
  });

  it('stays in 0..1 and ignores non-finite positions', () => {
    const t = computeThreat({ active: true, enemies: [{ pos: { x: NaN, y: 0, z: 0 } }, at(10)], listener: L, integrity: -5, onFire: true, finalWave: true });
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(1);
  });

  it('final stretch: second half of the last campaign round, late survival rounds', () => {
    const m = CAMPAIGN.find((x) => x.round && (x.rounds ?? 1) > 1) ?? CAMPAIGN.find((x) => x.round)!;
    const last = (m.rounds ?? 1) - 1;
    expect(finalStretch(m, last, 1, 0)).toBe(false);
    expect(finalStretch(m, last, 9999, 0)).toBe(true);
    if (last > 0) expect(finalStretch(m, 0, 9999, 0)).toBe(false);
    const s = survivalMission('gunner');
    expect(finalStretch(s, 0, 9999, 0)).toBe(false);
    expect(finalStretch(s, 3, 9999, 0)).toBe(true);
    expect(finalStretch(null, 0, 0, 0)).toBe(false);
  });
});

describe('music layers', () => {
  const spb = 60 / 130;
  it('render one bar plus a tail, peak-normalised and deterministic', () => {
    const a = taikoBar(spb, 'drive', 3), b = taikoBar(spb, 'drive', 3);
    expect(a.length).toBeGreaterThan(4 * spb * LAYER_SR);
    expect(a).toEqual(b);
    let pk = 0;
    for (const v of a) { expect(Number.isFinite(v)).toBe(true); pk = Math.max(pk, Math.abs(v)); }
    expect(pk).toBeCloseTo(PEAK, 2);
  });

  it('put the drum hits on the beat grid', () => {
    const d = taikoBar(spb, 'heart', 1);
    const energy = (t: number) => { let e = 0; const i0 = Math.round(t * LAYER_SR); for (let i = i0; i < i0 + 240; i++) e += d[i] * d[i]; return e; };
    // heart: big hits on step 0 and step 8 (beat 3); silence just before them
    expect(energy(0)).toBeGreaterThan(energy(2 * spb - 0.02) * 10);
    expect(energy(2 * spb)).toBeGreaterThan(0.01);
  });

  it('pitch the brass on the bar root', () => {
    // root A (9): the low note is A1 = 55 Hz; the autocorrelation peak over 40-150 Hz is its period
    const d = brassBar(spb, 9, false, 1);
    const from = Math.round(0.5 * LAYER_SR), n = Math.round(0.5 * LAYER_SR);
    let best = 0, bestLag = 0;
    for (let lag = Math.floor(LAYER_SR / 150); lag <= Math.ceil(LAYER_SR / 40); lag++) {
      let c = 0;
      for (let i = from; i < from + n; i++) c += d[i] * d[i + lag];
      if (c > best) { best = c; bestLag = lag; }
    }
    expect(LAYER_SR / bestLag).toBeGreaterThan(53);
    expect(LAYER_SR / bestLag).toBeLessThan(57);
  });

  it('strings: 8 notes per bar over fast tempi, 16 over slow ones', () => {
    const onsets = (d: Float32Array, bar: number) => {
      let n = 0, was = false;
      for (let t = 0; t < bar; t += 0.004) { const i = Math.round(t * LAYER_SR); const loud = Math.abs(d[i]) > 0.25; if (loud && !was) n++; was = loud || (was && Math.abs(d[i]) > 0.05); }
      return n;
    };
    expect(stringsBar(60 / 166, 9, true).length).toBeGreaterThan(0);
    const slow = stringsBar(60 / 83, 9, true, 0, 1);
    expect(onsets(slow, 4 * 60 / 83)).toBeGreaterThanOrEqual(8);
  });
});
