import { describe, expect, it } from 'vitest';
import { GunnerSurvival, hypoxiaCurve, jamProbability, survivalGun, SURVIVAL } from '../src/game/GunnerSurvival';
import strings from '../src/i18n/ar/gunnerSurvival';
const setup = () => { const life = new GunnerSurvival(); life.reset(); return life; };
describe('gunner survival', () => {
  it('raises per-round jam probability with heat, damage and cold, within a small bound', () => {
    const base = SURVIVAL.veteran.jamRate;
    expect(jamProbability(base, 0, 0, 0)).toBe(base);
    expect(jamProbability(base, 1, 1, 1)).toBeCloseTo(base * 8);
    expect(jamProbability(base, 10, 10, 10)).toBeCloseTo(base * 8);
  });
  it('enforces the jam grace and cooldown across station changes', () => {
    const l = setup(), a = survivalGun(600), b = survivalGun(750);
    expect(l.shot(a, 1, 1, () => 0)).toBe(true);
    l.update(120, 0, 0, 0);
    expect(l.shot(a, 1, 1, () => 0)).toBe(false);
    expect(a.jam).toBe(true); expect(a.ammo).toBe(599);
    expect(l.shot(b, 1, 1, () => 0)).toBe(true);
    expect(l.clearJam(a, .7, true, false)).toBe(false);
    expect(l.clearJam(a, .7, true, false)).toBe(true);
    l.update(119, 0, 0, 0); expect(l.shot(a, 1, 1, () => 0)).toBe(true);
    l.update(1, 0, 0, 0); expect(l.shot(a, 1, 1, () => 0)).toBe(false);
  });
  it('clears on two taps and rejects unrelated taps and interrupted holds', () => {
    const l = setup(), s = survivalGun(600); s.jam = true;
    expect(l.clearJam(s, 0, false, true)).toBe(false);
    l.tickGun(s, .2, true); expect(l.clearJam(s, 0, false, true)).toBe(true);
    s.jam = true; l.clearJam(s, .5, true, false); l.tickGun(s, .6, true);
    l.clearJam(s, 0, false, false); expect(s.clear).toBe(0);
  });
  it('freezes only after idle time and first burst clears even a long-frozen receiver', () => {
    const l = setup(), s = survivalGun(600); l.chill = .5;
    l.tickGun(s, 89, true); expect(s.frost).toBe(0);
    l.tickGun(s, 11, true); expect(s.frost).toBe(.5);
    expect(l.shot(s, 0, 0)).toBe(false);
    l.tickGun(s, 10000, true); expect(s.frost).toBe(1);
    expect(l.thaw(s, .4)).toBe(true);
    expect(l.shot(s, 0, 0, () => 1)).toBe(true); expect(s.idle).toBe(0);
  });
  it('snow and a damaged suit accelerate cooling; the circuit repairs automatically', () => {
    const normal = setup(), cold = setup(); cold.hit(true, () => 0);
    normal.update(12, .5, 0, 0); cold.update(12, .5, 1, 0);
    expect(cold.chill).toBeGreaterThan(normal.chill);
    cold.update(60, 0, 0, 0); expect(cold.circuit).toBe(0);
  });
  it('gives oxygen a grace period, smooth onset, bounded aim loss and gradual recovery', () => {
    expect(hypoxiaCurve(6, 6, 35)).toBe(0);
    expect(hypoxiaCurve(23.5, 6, 35)).toBe(.5);
    expect(hypoxiaCurve(100, 6, 35)).toBe(1);
    const l = setup(); l.hit(false, () => 0); l.update(23.5, 0, 0, 0);
    expect(l.hypoxia).toBe(.5); expect(l.aimScale).toBeCloseTo(.825);
    l.reconnect(); l.update(2, 0, 0, 0); expect(l.hypoxia).toBe(.25);
    l.update(2, 0, 0, 0); expect(l.hypoxia).toBe(0);
  });
  it('crew rescues oxygen and subsequent damage cannot immediately undo the repair', () => {
    const l = setup(); l.hit(false, () => 0); l.update(45, 0, 0, 0);
    expect(l.oxygen).toBe(false); l.hit(false, () => 0); expect(l.oxygen).toBe(false);
    l.update(8, 0, 0, 0); expect(l.hypoxia).toBe(0);
  });
  it('moves rounds from reserve into a waist belt without discarding partial cans', () => {
    const l = setup(), s = survivalGun(600); s.ammo = 100;
    l.reload(s, true); expect(l.shot(s, 0, 0)).toBe(false);
    l.tickGun(s, 4.5, true); expect(s.ammo).toBe(600); expect(s.reserve).toBe(100);
    s.ammo = 0; l.reload(s, true); l.tickGun(s, 4.5, true);
    expect(s.ammo).toBe(100); expect(s.reserve).toBe(0);
    l.tickGun(s, 12, true); expect(s.reserve).toBe(600);
  });
  it('services fixed turret boxes through the crew and preserves separate stations', () => {
    const l = setup(), a = survivalGun(750), b = survivalGun(1000); a.ammo = 100;
    l.reload(a, false); expect(a.reload).toBe(0);
    l.tickGun(a, .1, false); expect(a.supply).toBe(12);
    l.tickGun(a, 12, false); expect(a.ammo).toBe(750); expect(b.ammo).toBe(1000);
    a.ammo = 0; expect(l.shot(a, 0, 0)).toBe(false);
    l.tickGun(a, 12, false); expect(a.ammo).toBe(750);
  });
  it('Recruit keeps unlimited belts, no failures or freezing, and lighter wounds', () => {
    const l = setup(), s = survivalGun(600); l.reset('recruit');
    l.hit(true, () => 0); l.update(1000, 1, 1, 3); l.tickGun(s, 1000, true);
    expect(l.shot(s, 1, 1, () => 0)).toBe(true);
    expect(s.ammo).toBe(600); expect(s.frost).toBe(0); expect(l.circuit).toBe(0); expect(l.oxygen).toBe(false); expect(l.wound).toBe(.25);
  });
  it('existing field dressing reduces sway and tunnel severity, resets clear mission state', () => {
    const l = setup(); l.update(30, 0, 0, 3); const severe = l.wound;
    l.update(10, 0, 0, 2); expect(l.wound).toBeLessThan(severe);
    l.update(20, 0, 0, 0); expect(l.wound).toBeLessThan(.001);
    l.oxygen = true; l.circuit = 20; l.reset(); expect(l.oxygen).toBe(false); expect(l.circuit).toBe(0);
  });
  it('translates all survival notices and radio calls', () => {
    for (const value of Object.values(strings.phrases)) expect(value).toMatch(/[\u0600-\u06ff]/);
  });
});
