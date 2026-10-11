import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { aaWave, aaMount, traverseAA, tickAAGun, fireAAGun, damageAAAsset, repairAAPit, aaDefeated, aaIntegrity, AA_GUNS, type AAAssetHealth } from '../src/game/AADefenceRules';
import { aaMission, AA_MODE, AA_MOODS } from '../src/game/AADefenceMode';
import { leaderboardMode, modeFor, MODES } from '../src/game/Modes';
import { AA_LEADERBOARD } from '../src/net/Leaderboard';
import { hasPhrase, tx, setLang } from '../src/i18n';
import aaStrings from '../src/i18n/ar/aa';
const asset = (kind: AAAssetHealth['kind'], hp = 100): AAAssetHealth => ({ kind, hp, maxHp: 100, repair: 0 });

describe('fixed AA waves', () => {
  it('starts with a readable strafe group, introduces bombers, destroyers and late jets', () => {
    expect(aaWave(1).groups.map(g => g.profile)).toEqual(['strafe']);
    expect(aaWave(2).groups.some(g => g.type === 'ju88' && g.profile === 'dive')).toBe(true);
    expect(aaWave(3).groups.some(g => g.type === 'he111' && g.profile === 'level')).toBe(true);
    expect(aaWave(4).groups.some(g => g.type === 'bf110' && g.profile === 'rocket')).toBe(true);
    expect(aaWave(6).groups.some(g => g.type === 'me262')).toBe(true);
    expect(aaWave(8).groups.some(g => g.type === 'me163')).toBe(true);
    expect(aaWave(1).count).toBeLessThan(aaWave(4).count);
    expect(aaWave(4).count).toBeLessThan(aaWave(10).count);
  });
  it('announces every fifth major raid and bounds late-wave rendering work', () => {
    for (let n = 1; n <= 1000; n++) {
      const wave = aaWave(n);
      expect(wave.major).toBe(n % 5 === 0);
      expect(wave.count).toBe(wave.groups.reduce((s, g) => s + g.count, 0));
      expect(wave.count).toBeLessThanOrEqual(35);
      expect(wave.groups.length).toBeLessThanOrEqual(7);
      for (let i = 0; i < wave.groups.length; i++) {
        const g = wave.groups[i];
        expect(Number.isFinite(g.speed + g.bearing + g.at)).toBe(true);
        if (i) expect(g.at).toBeGreaterThan(wave.groups[i - 1].at);
      }
    }
  });
});

describe('airfield damage and repairs', () => {
  it('clamps damage, reports destruction only once and ignores invalid damage', () => {
    const h = asset('hangar');
    expect(damageAAAsset(h, -20)).toBe(false);
    expect(damageAAAsset(h, NaN)).toBe(false);
    expect(h.hp).toBe(100);
    expect(damageAAAsset(h, 25)).toBe(false);
    expect(h.hp).toBe(75);
    expect(damageAAAsset(h, 200)).toBe(true);
    expect(h.hp).toBe(0);
    expect(damageAAAsset(h, 20)).toBe(false);
  });
  it('loses on the tower OR all bombers, never merely a hangar/fuel loss', () => {
    const a = [asset('tower'), asset('bomber'), asset('bomber'), asset('hangar', 0), asset('fuel', 0)];
    expect(aaDefeated(a)).toBe(false);
    damageAAAsset(a[1], 100); expect(aaDefeated(a)).toBe(false);
    damageAAAsset(a[2], 100); expect(aaDefeated(a)).toBe(true);
    a[1].hp = 100; damageAAAsset(a[0], 100); expect(aaDefeated(a)).toBe(true);
  });
  it('disables a damaged pit for twelve seconds, then returns it to service', () => {
    const p = asset('pit');
    damageAAAsset(p, 200); expect(p.repair).toBe(12);
    repairAAPit(p, 11.9); expect(p.hp).toBe(0);
    damageAAAsset(p, 100); expect(p.repair).toBeCloseTo(0.1);
    repairAAPit(p, 0.2); expect(p.hp).toBe(60); expect(p.repair).toBe(0);
  });
  it('computes aggregate integrity including destroyed assets', () => {
    expect(aaIntegrity([asset('tower'), asset('bomber', 50), asset('hangar', 0)])).toBe(0.5);
    expect(aaIntegrity([])).toBe(0);
  });
});

describe('AA mounts and ammunition', () => {
  it('rate-limits both axes and makes the Bofors slower, at variable frame rates', () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 144]) for (const kind of [0, 1]) {
      const m = aaMount(kind); m.wantYaw = 2; m.wantPitch = 1;
      traverseAA(m, kind, dt);
      expect(m.yaw).toBeCloseTo(AA_GUNS[kind].yawRate * dt);
      expect(m.pitch - 0.2).toBeCloseTo(AA_GUNS[kind].pitchRate * dt);
    }
    expect(AA_GUNS[1].yawRate).toBeLessThan(AA_GUNS[0].yawRate);
  });
  it('takes the short path across north and respects elevation stops and upgrades', () => {
    const m = aaMount(0); m.yaw = Math.PI - 0.02; m.wantYaw = -Math.PI + 0.02;
    m.wantPitch = 50; traverseAA(m, 0, 1);
    expect(m.yaw).toBeCloseTo(-Math.PI + 0.02);
    expect(m.wantPitch).toBe(1.48);
    traverseAA(m, 0, 5); expect(m.pitch).toBe(1.48);
    m.wantPitch = -5; traverseAA(m, 0, 5); expect(m.pitch).toBe(-0.06);
    m.yaw = 0; m.wantYaw = 2; traverseAA(m, 0, 0.1, 1.2); expect(m.yaw).toBeCloseTo(0.162);
  });
  it('feeds Bofors four-round clips with a short pause, without replenishing reserve ammo', () => {
    const m = aaMount(1);
    for (let i = 0; i < 4; i++) { expect(fireAAGun(m, 1)).toBe(true); tickAAGun(m, 1, 0.5); }
    expect(m.ammo).toBe(20); expect(m.clip).toBe(0);
    expect(fireAAGun(m, 1)).toBe(false);
    tickAAGun(m, 1, 0.4); expect(m.clip).toBe(4); expect(m.ammo).toBe(20);
    expect(fireAAGun(m, 1)).toBe(true); expect(m.ammo).toBe(19); expect(m.clip).toBe(3);
    const quad = aaMount(0);
    for (let i = 0; i < 5; i++) { expect(fireAAGun(quad, 0)).toBe(true); tickAAGun(quad, 0, 0.1); }
    expect(quad.clipReload).toBe(0);
  });
  it('blocks during cooldown/reload/overheat and refills upgraded ammunition', () => {
    const m = aaMount(1); m.ammo = 1;
    expect(fireAAGun(m, 1)).toBe(true); expect(m.ammo).toBe(0); expect(m.reload).toBe(3.2);
    expect(fireAAGun(m, 1)).toBe(false);
    tickAAGun(m, 1, 3.2, 1.5); expect(m.ammo).toBe(36);
    m.heat = 0.99; expect(fireAAGun(m, 1)).toBe(true); expect(m.locked).toBe(true);
    tickAAGun(m, 1, 1); expect(fireAAGun(m, 1)).toBe(false);
    tickAAGun(m, 1, 5); expect(m.locked).toBe(false); expect(fireAAGun(m, 1)).toBe(true);
  });
});

describe('AA mode integration and Arabic', () => {
  it('uses its own leaderboard without stealing normal survival missions', () => {
    const m = aaMission('night');
    expect(modeFor(m)).toBe(AA_MODE);
    expect(leaderboardMode(m)).toBe(AA_LEADERBOARD);
    expect(modeFor({ ...m, id: 'survival-gunner' })?.id).toBe('survival');
    expect(modeFor({ ...m, id: 'survival-pilot' })?.id).toBe('survival');
    expect(MODES.filter(x => x.id === AA_LEADERBOARD)).toHaveLength(1);
    const rules = readFileSync('firestore.rules', 'utf8');
    const re = new RegExp(rules.match(/request.resource.data.mode.matches\('([^']+)'\)/)![1]);
    for (const id of ['survival-aa', 'survival-gunner', 'survival-pilot', 'coop-gunner', 'campaign-m12', 'daily-pilot-20261011', 'weekly-gunner-202641', 'raid-pilot', 'night-pilot', 'strafe-pilot', 'acehunt-gunner', 'timeattack-pilot']) expect(re.test(id), id).toBe(true);
    expect(re.test('survival-anything')).toBe(false);
  });
  it('covers all literal phrases used by the AA controller', () => {
    const source = readFileSync('src/game/AADefence.ts', 'utf8');
    for (const match of source.matchAll(/tx\('([^']+)'/g)) expect(hasPhrase(match[1]), match[1]).toBe(true);
  });
  it('covers every mission, HUD, weather and new radio phrase', () => {
    const m = aaMission();
    for (const s of [AA_MODE.title, AA_MODE.blurb, m.title, m.target, m.date, ...m.briefing, ...m.objectives, ...AA_MOODS.map(x => x[0].toUpperCase() + x.slice(1)), ...Object.keys(aaStrings.phrases)]) expect(hasPhrase(s), s).toBe(true);
    setLang('ar'); expect(tx('Incoming raid · {seconds}s', { seconds: 5 })).toContain('5'); setLang('en');
  });
});
