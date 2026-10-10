import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { terrainHeight, RAIL, ROAD, ROAD2, RIVER, riverU, AIRFIELD, TUNNEL, Path } from '../src/world/Countryside';
import { GROUND_KINDS } from '../src/world/GroundTargets';
import { STRAFE_RADIO, STRAFE_MODE, strafeMission, pullOutHeight } from '../src/game/StrafeOps';
import { MODES, leaderboardMode } from '../src/game/Modes';
import { VOICE_LINES } from '../src/audio/voiceLines';
import { hasPhrase, setLang, tx } from '../src/i18n';
import { stubStorage } from './helpers';

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); });

describe('countryside terrain', () => {
  it('rolling hills within a sane range, flat sky-dome ground at the rim', () => {
    let lo = Infinity, hi = -Infinity;
    for (let u = -12000; u <= 12000; u += 370) for (let v = -12000; v <= 12000; v += 410) {
      const h = terrainHeight(u, v);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThan(110);
    expect(terrainHeight(16000, 0)).toBe(0);
    expect(terrainHeight(0, -20000)).toBe(0);
  });

  it('smooth: no step over a few metres anywhere on the map', () => {
    let worst = 0;
    for (let u = -9000; u <= 9000; u += 233) for (let v = -9000; v <= 9000; v += 251) worst = Math.max(worst, Math.abs(terrainHeight(u + 3, v) - terrainHeight(u, v)));
    expect(worst).toBeLessThan(1.5);
  });

  it('the airfield is levelled and the river runs in a valley', () => {
    const a = terrainHeight(AIRFIELD.u, AIRFIELD.v);
    expect(Math.abs(terrainHeight(AIRFIELD.u + 400, AIRFIELD.v + 150) - a)).toBeLessThan(0.5);
    for (const v of [-4000, 0, 3000]) expect(terrainHeight(riverU(v), v)).toBeLessThan(terrainHeight(riverU(v) + 900, v) + 6);
  });

  it('paths: arc length, clamped sampling, unit direction', () => {
    const p = new Path([[0, 0], [1000, 0], [2000, 500]], 10);
    expect(p.length).toBeGreaterThan(2000);
    const a = new THREE.Vector2(), d = new THREE.Vector2();
    p.at(0, a, d);
    expect(a.length()).toBeLessThan(1);
    expect(d.length()).toBeCloseTo(1, 5);
    p.at(1e9, a);
    expect(a.distanceTo(new THREE.Vector2(2000, 500))).toBeLessThan(1);
    for (const q of [RAIL, ROAD, ROAD2, RIVER]) expect(q.length).toBeGreaterThan(5000);
    // the railway ends at the tunnel
    RAIL.at(RAIL.nearest(TUNNEL.u, TUNNEL.v), a);
    expect(a.distanceTo(new THREE.Vector2(TUNNEL.u, TUNNEL.v))).toBeLessThan(15);
  });
});

describe('ground targets', () => {
  it('every kind has hit points, a score and hit spheres (parked aircraft fit theirs to the model)', () => {
    for (const [k, d] of Object.entries(GROUND_KINDS)) {
      expect(d.hp, k).toBeGreaterThan(0);
      expect(d.score, k).toBeGreaterThan(0);
      if (k !== 'plane') expect(d.spheres.length, k).toBeGreaterThan(0);
    }
    expect(GROUND_KINDS.loco.score).toBeGreaterThan(GROUND_KINDS.boxcar.score);
    expect(GROUND_KINDS.flak.flak && GROUND_KINDS.flaktower.flak && GROUND_KINDS.halftrack.flak).toBeTruthy();
  });

  it('pull-out height grows with the dive', () => {
    expect(pullOutHeight(new THREE.Vector3(0, 0, 150))).toBeCloseTo(0, 5);
    const shallow = pullOutHeight(new THREE.Vector3(0, -40, 145)), steep = pullOutHeight(new THREE.Vector3(0, -120, 90));
    expect(steep).toBeGreaterThan(shallow * 2);
    expect(steep).toBeGreaterThan(150);
  });
});

describe('Train Busting mode', () => {
  it('is a P-51 Special operations tab with its own leaderboard', () => {
    expect(MODES).toContain(STRAFE_MODE);
    expect(STRAFE_MODE.roles).toEqual(['pilot']);
    const m = strafeMission();
    expect(STRAFE_MODE.matches(m)).toBe(true);
    expect(leaderboardMode(m)).toBe('strafe-pilot');
    expect(m.rounds).toBe(3);
    expect(m.specials).toBe(false);
    expect(m.boss).toBe(false);
    expect(m.midRound).toBe(false);
  });

  it('every radio line is recorded with its exact subtitle text', () => {
    const texts = new Set(Object.values(VOICE_LINES).map((l) => l.text));
    for (const [k, [, text]] of Object.entries(STRAFE_RADIO)) expect(texts.has(text), k).toBe(true);
  });

  it('Arabic for the mission, the mode tab, the radio and the HUD', () => {
    const m = strafeMission();
    for (const s of [m.title, m.target, m.date, ...m.briefing, ...m.objectives, m.success!, STRAFE_MODE.blurb]) expect(hasPhrase(s), s).toBe(true);
    for (const [, text] of Object.values(STRAFE_RADIO)) expect(hasPhrase(text), text).toBe(true);
    setLang('ar');
    const ar = /[؀-ۿ]/;
    for (const s of ['ROUND 2 · CONVOY', 'Round 1/3 · TRAIN BUSTING — locomotive 4.2 km from the tunnel', 'Round 1/3 · TRAIN BUSTING — train stopped · 3/9 wagons destroyed',
      'Round 2/3 · CONVOY — 4/9 vehicles destroyed', 'Round 3/3 · AIRFIELD — 2/10 aircraft destroyed on the ground', 'Locomotive destroyed — +500', 'Fw 190 on the ground destroyed — +200',
      'Blue Two got the Flak tower', 'Fuel truck reached the village', 'Objective complete — +500', 'PULL UP', 'Your Mustang was brought down by flak.']) {
      expect(tx(s), s).toMatch(ar);
    }
  });
});
