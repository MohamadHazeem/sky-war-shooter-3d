import { describe, expect, it } from 'vitest';
import { BombRunState, BOMB_RUN_TEXT, flakWalk, bombingOvercast } from '../src/game/BombRunState';
import { bombingReport } from '../src/ui/BombingReport';
import { hasPhrase } from '../src/i18n';
import { CAMPAIGN } from '../src/game/Missions';

describe('mandatory gunner bomb run clock', () => {
  it('runs IP, level, doors, countdown, release, fall, rally in 62 seconds', () => {
    const c = new BombRunState();
    for (const [t, phase] of [[71,'idle'],[72,'inbound'],[78,'level'],[84,'doors'],[95,'countdown']] as const) {
      expect(c.advance(t,100)).toBe(phase);
    }
    expect(c.level).toBe(true); expect(c.holdFighters).toBe(true); expect(c.doors).toBe(true);
    expect(c.advance(100,100,100)).toBe('away'); expect(c.level).toBe(false);
    expect(c.advance(103,100,100)).toBe('falling'); expect(c.doors).toBe(false);
    expect(c.advance(128.99,100,100)).toBe('strike'); expect(c.holdFighters).toBe(true);
    expect(c.advance(129,100,100)).toBe('rally'); expect(c.holdFighters).toBe(false);
    expect(c.advance(134,100,100)).toBe('complete'); expect(c.active).toBe(false);
    expect(134-72).toBe(62);
  });
  it('follows actual manual release and cannot skip the impact wait', () => {
    const c = new BombRunState();
    expect(c.advance(112,100)).toBe('countdown'); expect(c.level).toBe(true);
    expect(c.advance(112,100,112)).toBe('away');
    expect(c.advance(140.9,100,112)).toBe('strike');
    expect(c.advance(146,100,112)).toBe('complete'); expect(146-72).toBeLessThanOrEqual(75);
    c.reset(); expect(c.releasedAt).toBe(-1); expect(c.active).toBe(false);
    c.advance(95,100,95); expect(c.advance(129,100,95)).toBe('complete');
  });
  it('handles missed frames and repeated calls without restarting release', () => {
    const c = new BombRunState(); c.advance(100,100,100);
    c.advance(102,100,101); expect(c.releasedAt).toBe(100);
    expect(c.advance(145,100)).toBe('complete');
    c.reset(); expect(c.advance(72,100)).toBe('inbound');
  });
  it('schedules target-bound gunner missions, leaving return-leg sorties alone', () => {
    for (const m of CAMPAIGN.filter(m=>m.role==='gunner')) {
      if (['m6','m10'].includes(m.id)) expect(m.bombsAway).toBeUndefined();
      else { expect(m.bombsAway, m.id).toBeGreaterThan(28); expect(m.bombsAway!+34).toBeLessThan(m.duration); }
    }
  });
});
describe('walking flak boxes', () => {
  it('walks all six shells toward the formation and alternates battery sides', () => {
    const p = {x:0,y:0,z:0};
    for (let shell=0;shell<6;shell++) {
      flakWalk(p,0,shell); const distant=Math.hypot(p.x,p.y,p.z);
      flakWalk(p,4,shell); const middle=Math.hypot(p.x,p.y,p.z);
      flakWalk(p,8,shell); const near=Math.hypot(p.x,p.y,p.z);
      expect(distant).toBeGreaterThan(middle); expect(middle).toBeGreaterThan(near);
      expect(near).toBeLessThan(130); // activates the existing skin-shrapnel audio
      expect(p.x).toBeGreaterThan(0);
      flakWalk(p,18,shell); expect(p.x).toBeLessThan(0);
    }
  });
  it('reuses the supplied point and is deterministic across frame rates', () => {
    const a={x:0,y:0,z:0}, b={x:0,y:0,z:0};
    expect(flakWalk(a,8,4)).toBe(a); expect(flakWalk(b,8,4)).toEqual(a);
    expect(flakWalk(b,28,4)).toEqual(a);
  });
});
it('covers cloud presets, legacy overcast, every HUD phrase and strike reports', () => {
  expect(bombingOvercast(.8,'clear')).toBe(true); expect(bombingOvercast(0,'overcast')).toBe(true);
  expect(bombingOvercast(.45,'clear')).toBe(false);
  for(const text of Object.values(BOMB_RUN_TEXT)) expect(hasPhrase(text),text).toBe(true);
  expect(bombingReport({percent:75,score:0,photo:''})).toContain('on target');
  expect(bombingReport({percent:20,score:0,photo:''})).toContain('off target');
  expect(bombingReport({percent:75,score:0,photo:''})).not.toContain('Bombing score');
  expect(bombingReport()).toBe('');
});
