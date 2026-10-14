import { describe, it, expect, afterEach } from 'vitest';
import {
  DIRECTOR, closestApproach, directorLevel, killScale, passQualifies, passScale, pickKillCam, pickPassCam, reelSegments,
  shotAllowed, shotDuration, PASS_SLOW, KILL_SLOW, type Approach, type DirectorGate,
} from '../src/game/CineDirectorRules';
import { LOOK_PRESETS, SHOT_PRESETS, cocScalePx, filmLook, resolveFilm, type FilmParams } from '../src/render/FilmParams';
import { setLang, tx } from '../src/i18n';
import { CINEMA_PHRASES } from '../src/i18n/ar/cinema';

const gate = (o: Partial<DirectorGate> = {}): DirectorGate => ({
  level: 'rare', missionTime: 300, sinceLastCine: 999, shots: 0, playing: true, tutorial: false, coop: false, photo: false,
  busy: false, fit: true, threats: 0, ...o,
});

describe('combat director rules', () => {
  it('reads the setting (old saves: rare)', () => {
    expect(directorLevel(undefined)).toBe('rare');
    expect(directorLevel('often')).toBe('often');
    expect(directorLevel('off')).toBe('off');
    expect(directorLevel('nonsense')).toBe('rare');
  });

  it('never cuts away in a critical moment', () => {
    expect(shotAllowed(gate())).toBe(true);
    expect(shotAllowed(gate({ level: 'off' }))).toBe(false);
    expect(shotAllowed(gate({ tutorial: true }))).toBe(false);
    expect(shotAllowed(gate({ coop: true }))).toBe(false);
    expect(shotAllowed(gate({ photo: true }))).toBe(false);
    expect(shotAllowed(gate({ busy: true }))).toBe(false);       // bomb run, boss, station change...
    expect(shotAllowed(gate({ fit: false }))).toBe(false);       // hurt or under fire
    expect(shotAllowed(gate({ threats: 1 }))).toBe(false);       // another fighter pressing in
    expect(shotAllowed(gate({ playing: false }))).toBe(false);
  });

  it('is rare: warm-up, cooldown and a per-mission cap', () => {
    const t = DIRECTOR.rare;
    expect(shotAllowed(gate({ missionTime: t.warmup - 1 }))).toBe(false);
    expect(shotAllowed(gate({ sinceLastCine: t.cooldown - 1 }))).toBe(false);
    expect(shotAllowed(gate({ shots: t.maxPerMission }))).toBe(false);
    expect(DIRECTOR.often.cooldown).toBeLessThan(DIRECTOR.rare.cooldown);
    expect(DIRECTOR.rare.cooldown).toBeGreaterThanOrEqual(60);
  });

  it('finds the closest approach of a crossing fighter', () => {
    const a: Approach = { t: 0, miss: 0, speed: 0 };
    // 100 m ahead, 30 m to the side, closing at 150 m/s head-on
    closestApproach(30, 0, 100, 0, 0, -150, a);
    expect(a.t).toBeCloseTo(100 / 150, 5);
    expect(a.miss).toBeCloseTo(30, 5);
    expect(a.speed).toBeCloseTo(150, 5);
    expect(passQualifies(a, 18)).toBe(true);
    // already past
    closestApproach(30, 0, -50, 0, 0, -150, a);
    expect(a.t).toBeLessThan(0);
    expect(passQualifies(a, 18)).toBe(false);
    // collision course and a wide miss don't count; neither does a slow drift
    expect(passQualifies({ t: 0.6, miss: 2, speed: 150 }, 18)).toBe(false);
    expect(passQualifies({ t: 0.6, miss: 300, speed: 150 }, 18)).toBe(false);
    expect(passQualifies({ t: 0.6, miss: 30, speed: 20 }, 18)).toBe(false);
  });

  it('picks the camera language', () => {
    expect(pickPassCam('gunner', 'waistL', -5, true, 0)).toBe('waist');
    expect(pickPassCam('gunner', 'tail', -5, true, 0)).toBe('telephoto');
    expect(pickPassCam('gunner', 'tail', -5, true, 1)).toBe('wingtip');
    expect(pickPassCam('pilot', null, 0, false, 0)).toBe('wingtip');
    const kills = [0, 1, 2, 3, 4, 5, 6, 7].map((s) => pickKillCam(true, s));
    expect(kills.filter((k) => k === 'gunCam').length).toBeGreaterThanOrEqual(4);   // mostly the gun camera
    expect(kills).toContain('chase');
    expect(kills).toContain('telephoto');
    expect([0, 1, 2, 3].map((s) => pickKillCam(false, s))).not.toContain('telephoto');
  });

  it('slows the pass until just after closest approach; Reduce motion never slows', () => {
    expect(passScale(0.1, 0.7, false)).toBe(1);
    expect(passScale(0.5, 0.7, false)).toBe(PASS_SLOW);
    expect(passScale(0.8, 0.7, false)).toBe(PASS_SLOW);
    expect(passScale(1.0, 0.7, false)).toBe(1);
    expect(passScale(0.5, 0.7, true)).toBe(1);
    expect(killScale(0.2, false)).toBe(KILL_SLOW);
    expect(killScale(1, false)).toBeCloseTo(1);
    expect(killScale(0.2, true)).toBe(1);
    expect(shotDuration('kill', false)).toBeGreaterThanOrEqual(2);
    expect(shotDuration('kill', false)).toBeLessThanOrEqual(3);
    expect(shotDuration('pass', true)).toBeLessThan(shotDuration('pass', false));
  });
});

describe('combat film edit', () => {
  it('cuts the best moments together in time order', () => {
    const marks = [{ t: 10, type: 1 }, { t: 30, type: 3 }, { t: 50, type: 2 }, { t: 70, type: 1 }, { t: 85, type: 5 }, { t: 31, type: 1 }];
    const s = reelSegments(marks, 0, 90, 3);
    expect(s.length).toBe(3);
    for (let i = 1; i < s.length; i++) expect(s[i].a).toBeGreaterThan(s[i - 1].b);
    expect(s.map((x) => x.t)).toEqual([30, 50, 85]);          // types 5, 3, 2 win
    expect(s[0].a).toBeCloseTo(26.5); expect(s[0].b).toBeCloseTo(31.8);   // overlapping 31 merged in
    expect(s[2].b).toBeLessThanOrEqual(90);
  });

  it('falls back to the last ten seconds, and is empty for nothing', () => {
    expect(reelSegments([], 0, 40)).toEqual([{ a: 30, b: 40, t: 40 }]);
    expect(reelSegments([], 0, 0.5)).toEqual([]);
  });
});

describe('film look parameters', () => {
  const out = { ...LOOK_PRESETS.off } as FilmParams;

  it('reads the setting', () => {
    expect(filmLook(undefined)).toBe('off');
    expect(filmLook('kodachrome')).toBe('kodachrome');
    expect(filmLook('bogus')).toBe('off');
  });

  it('a shot overrides the play look but keeps its period grade', () => {
    resolveFilm(out, LOOK_PRESETS.kodachrome, SHOT_PRESETS.cinema, { calm: false, economy: false });
    expect(out.dof).toBe(true);
    expect(out.grade).toBe('kodachrome');
    resolveFilm(out, LOOK_PRESETS.kodachrome, SHOT_PRESETS.gunCamera, { calm: false, economy: false });
    expect(out.grade).toBe('gunCamera');
    resolveFilm(out, LOOK_PRESETS.off, null, { calm: false, economy: false });
    expect(out.on).toBe(false);
    expect(out.objectBlur).toBe(0);
  });

  it('Reduce motion removes grain, weave, flicker and dust; Low removes DOF and object blur', () => {
    resolveFilm(out, LOOK_PRESETS.newsreel, SHOT_PRESETS.gunCamera, { calm: true, economy: true });
    expect(out.grain).toBe(0); expect(out.weave).toBe(0); expect(out.flicker).toBe(0); expect(out.dust).toBe(0);
    expect(out.dof).toBe(false); expect(out.objectBlur).toBe(0);
    expect(out.on).toBe(false);  // Low skips the whole optional film pass
    expect(SHOT_PRESETS.gunCamera.grain).toBeGreaterThan(0);   // presets themselves untouched
  });

  it('thin-lens circle of confusion: longer lenses and wider apertures blur more', () => {
    const wide = cocScalePx(60, 50, 2.8, 1080), tele = cocScalePx(12, 50, 2.8, 1080), stopped = cocScalePx(60, 50, 11, 1080);
    expect(tele).toBeGreaterThan(wide);
    expect(stopped).toBeLessThan(wide);
    // a 50 mm-ish lens at f/2 focused 60 m out: a frame 1 m in front of the lens is well blurred
    const k = cocScalePx(40, 60, 2, 1080);
    expect(Math.abs(k * (1 - 60) / 1)).toBeGreaterThan(10);
  });
});

describe('Arabic', () => {
  afterEach(() => setLang('en'));
  it('covers every new player-visible string', () => {
    setLang('ar');
    for (const k of Object.keys(CINEMA_PHRASES)) expect(tx(k), k).toMatch(/[؀-ۿ]/);
    expect(tx('FROM “{name}”', { name: 'Sky Queen' })).toContain('Sky Queen');
  });
});
