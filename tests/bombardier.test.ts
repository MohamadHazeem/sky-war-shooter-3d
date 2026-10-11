import { describe, expect, it, beforeEach } from 'vitest';
import { BOMB_FALL, BOMB_DRAG, ON_TARGET_RADIUS, bombingScore, impactPattern, strikePhotoAltitude, releaseDue, type BombSolution } from '../src/game/BombingMath';
import { emptyCareer, loadCareer, saveCareer } from '../src/game/Career';
import { CAMPAIGN } from '../src/game/Missions';
import { hasPhrase } from '../src/i18n';
import { stubStorage } from './helpers';
import bombardier from '../src/i18n/ar/bombardier';
const speed = 110;
const centred: BombSolution = { x: 0, z: -speed * BOMB_FALL * BOMB_DRAG, forwardX: 0, forwardZ: 1, speed, windX: 0, windZ: 0, joltX: 0, joltZ: 0 };
beforeEach(() => { stubStorage(); });
describe('bomb pattern and awards', () => {
  it('a centred solution puts the entire carpet within 1,000 feet', () => {
    const p = impactPattern(centred, 27);
    expect(p).toHaveLength(27); expect(bombingScore(p)).toEqual({ hits: 27, percent: 100, score: 1000, pickle: true });
    expect(impactPattern(centred, 27)).toEqual(p);
  });
  it('uses the exact radius and strictly more than 80 percent for Pickle Barrel', () => {
    expect(bombingScore([{ x: ON_TARGET_RADIUS, z: 0 }]).hits).toBe(1);
    expect(bombingScore([{ x: ON_TARGET_RADIUS + .001, z: 0 }]).hits).toBe(0);
    const p = Array.from({ length: 10 }, (_, i) => ({ x: i < 8 ? 0 : 1000, z: 0 }));
    expect(bombingScore(p).pickle).toBe(false); p[8].x = 0; expect(bombingScore(p).pickle).toBe(true);
  });
  it('combines release timing, wind, heading and flak offsets in metres', () => {
    const base = impactPattern(centred, 9), wind = impactPattern({ ...centred, windX: 4, windZ: -2, joltX: 30, joltZ: -10 }, 9);
    expect(wind[0].x - base[0].x).toBeCloseTo(130); expect(wind[0].z - base[0].z).toBeCloseTo(-60);
    expect(bombingScore(impactPattern({ ...centred, z: centred.z + speed * 10 }, 9)).percent).toBe(0);
    expect(impactPattern({ ...centred, forwardX: 1, forwardZ: 0 }, 9)[0].x - base[0].x).toBeCloseTo(speed * BOMB_FALL * BOMB_DRAG);
  });
  it('fits even an early missed pattern into the strike photograph', () => {
    const p = [{ x: 6000, z: -3000 }], aspect = 1.6, altitude = strikePhotoAltitude(p, aspect);
    const halfHeight = altitude * Math.tan(24 * Math.PI / 180);
    expect(halfHeight).toBeGreaterThan(Math.abs(p[0].z));
    expect(halfHeight * aspect).toBeGreaterThan(Math.abs(p[0].x));
    expect(strikePhotoAltitude([], aspect)).toBe(3200);
  });
  it('is safe for no bombs and rejects invalid impact coordinates as hits', () => {
    expect(bombingScore([])).toEqual({ hits: 0, percent: 0, score: 0, pickle: false });
    expect(bombingScore([{ x: NaN, z: 0 }, { x: Infinity, z: 0 }]).percent).toBe(0);
  });
});
describe('sighting angle and progression', () => {
  it('holds release for a cloud gap but limits the run to 12 seconds late', () => {
    const angle = speed * BOMB_FALL * BOMB_DRAG;
    expect(releaseDue(angle + 1, speed, false, 100, 112)).toBe(false);
    expect(releaseDue(angle, speed, false, 100, 112)).toBe(true);
    expect(releaseDue(angle, speed, true, 100, 112)).toBe(false);
    expect(releaseDue(angle, speed, true, 112, 112)).toBe(true);
  });
  it('adds a backwards-compatible career record and persists it', () => {
    const old = emptyCareer(); delete (old as Partial<typeof old>).bestBombing;
    localStorage.setItem('sws3d.career.v1', JSON.stringify(old));
    const c = loadCareer(); expect(c.bestBombing).toBe(0); c.bestBombing = 93; saveCareer(c); expect(loadCareer().bestBombing).toBe(93);
  });
  it('offers runs in Emden and Ludwigshafen with room for the fall', () => {
    for (const id of ['m1', 'm3']) { const m = CAMPAIGN.find(m => m.id === id)!; expect(m.bombsAway).toBeGreaterThan(30); expect(m.duration).toBeGreaterThan(m.bombsAway! + 12 + BOMB_FALL); }
  });
  it('registers the bombsight Arabic table', () => { for (const key of Object.keys(bombardier.phrases)) expect(hasPhrase(key), key).toBe(true); });
});
