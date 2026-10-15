import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { stubStorage } from './helpers';
import {
  ANGLES, ANGLE_LABEL, COACH_TEXT, DEFAULT_PREFS, DISTS, DRILL_KEYS, GAP, GHOST_HZ, GHOST_MAX, GhostRecorder, KIND_LABEL, LEAD_IN, RANGE_KEY,
  SCORE, SLEEVE_HP, SPEEDS, SPEED_LABEL, SPEED_MS, accuracyBonus, bookRun, coachLead, downPoints, drill, drillById, drillLength, drillsFor,
  freeDrill, ghostAt, leadDegrees, loadRange, passAxis, passHalf, MIN_HALF, MAX_HALF, passPoint, passVelocity, sanitizeFree, sanitizeSave, saveRange, stars, timeline,
  type FreeConfig, type GhostSample,
} from '../src/game/GunneryRangeRules';
import { RANGE_MISSION } from '../src/game/GunneryRange';
import { HANGAR_TABS } from '../src/game/MenuModel';
import { STATIONS, STATION_ORDER, inArc } from '../src/world/B17Layout';
import { hasPhrase, setLang, tx } from '../src/i18n';

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); });

const allFree = (): FreeConfig[] => (['drone', 'sleeve'] as const).flatMap((kind) => SPEEDS.flatMap((speed) => ANGLES.flatMap((angle) => DISTS.map((range) => ({ kind, speed, angle, range })))));
const p = { x: 0, y: 0, z: 0 };
const v3 = () => new THREE.Vector3(p.x, p.y, p.z);

describe('gunnery range: drills', () => {
  it('four drills per gun position, the same every time, with unique ids that round-trip', () => {
    const ids = new Set<string>();
    for (const st of STATION_ORDER) {
      const ds = drillsFor(st);
      expect(ds.map((d) => d.key)).toEqual([...DRILL_KEYS]);
      for (const d of ds) {
        expect(drill(st, d.key as never)).toEqual(d);
        expect(drillById(d.id)).toEqual(d);
        expect(d.par).toBeGreaterThan(0);
        expect(d.passes.length).toBeGreaterThanOrEqual(4);
        ids.add(d.id);
      }
      expect(ds.find((d) => d.key === 'sleeve')!.passes.every((s) => s.kind === 'sleeve')).toBe(true);
      expect(ds.find((d) => d.key === 'long')!.passes.every((s) => s.range >= 800)).toBe(true);
    }
    expect(ids.size).toBe(STATION_ORDER.length * DRILL_KEYS.length);
    for (const bad of ['', 'waistL-nope', 'nose-steady', 'free-waistL-drone-fast-45-500', 'free-waistL-drone-fast-60-123']) expect(drillById(bad), bad).toBeNull();
  });

  it('free practice flies exactly the chosen target, speed, angle and range', () => {
    for (const cfg of allFree()) {
      const d = freeDrill('tail', cfg);
      expect(drillById(d.id)).toEqual(d);
      for (const s of d.passes) expect([s.kind, s.speed, s.angle, s.range]).toEqual([cfg.kind, SPEED_MS[cfg.speed], cfg.angle, cfg.range]);
      // left-to-right and right-to-left in turn
      expect(d.passes.map((s) => s.dir)).toEqual([1, -1, 1, -1, 1, -1]);
    }
    expect(sanitizeFree({ kind: 'zeppelin' as never, speed: 'warp' as never, angle: 45 as never, range: 50 as never })).toEqual({ kind: 'drone', speed: 'medium', angle: 60, range: 500 });
  });

  it('every pass stays inside its gun’s field of fire, at its speed and crossing angle, never too close', () => {
    for (const st of STATION_ORDER) {
      const def = STATIONS[st];
      const drills = [...drillsFor(st), ...allFree().map((c) => freeDrill(st, c))];
      for (const d of drills) for (const s of d.passes) {
        const half = passHalf(s, st);
        expect(half).toBeGreaterThanOrEqual(MIN_HALF);
        expect(half).toBeLessThanOrEqual(MAX_HALF);
        for (let k = 0; k <= 10; k++) {
          const at = -half + (2 * half * k) / 10;
          passPoint(s, st, at, p);
          const pt = v3();
          expect(inArc(def, pt), `${d.id} ${k}`).toBe(true);
          expect(pt.length()).toBeGreaterThan(s.range * 0.55);
        }
        passVelocity(s, st, p);
        const vel = v3();
        expect(vel.length()).toBeCloseTo(s.speed, 6);
        passAxis(s, st, p);
        const los = v3();
        expect(THREE.MathUtils.radToDeg(vel.clone().normalize().angleTo(los.negate()))).toBeCloseTo(s.angle, 4);
      }
    }
  });

  it('a fixed timeline: lead-in, passes one after another with a gap, so ghosts line up', () => {
    const d = drill('waistL', 'crossers');
    const w = timeline(d);
    expect(w[0].start).toBe(LEAD_IN);
    for (let i = 1; i < w.length; i++) expect(w[i].start).toBeCloseTo(w[i - 1].start + w[i - 1].half * 2 + GAP, 9);
    expect(drillLength(d)).toBeGreaterThan(w[w.length - 1].start + w[w.length - 1].half * 2);
    expect(drillLength(d)).toBeLessThan(120);
    expect(timeline(drill('waistL', 'crossers'))).toEqual(w);
  });
});

describe('gunnery range: score and stars', () => {
  it('earlier kills score more; accuracy is a bounded bonus', () => {
    expect(downPoints(0)).toBe(SCORE.down + SCORE.speed);
    expect(downPoints(1)).toBe(SCORE.down);
    expect(downPoints(0.25)).toBeGreaterThan(downPoints(0.75));
    expect(downPoints(-3)).toBe(downPoints(0));
    expect(accuracyBonus(0, 0)).toBe(0);
    expect(accuracyBonus(50, 100)).toBe(SCORE.accuracy / 2);
    expect(accuracyBonus(500, 100)).toBe(SCORE.accuracy);
  });

  it('stars at 30 / 60 / 90 % of par; a sleeve drill has a higher par per pass', () => {
    expect([0, 29, 30, 59, 60, 89, 90, 200].map((s) => stars(s, 100))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(stars(50, 0)).toBe(0);
    const drone = drill('tail', 'steady'), sleeve = drill('tail', 'sleeve');
    expect(sleeve.par / sleeve.passes.length).toBeGreaterThan(drone.par / drone.passes.length);
    expect(SLEEVE_HP * SCORE.sleeveHit).toBeGreaterThan(100);
  });
});

describe('gunnery range: ghost of the best run', () => {
  it('records on the drill clock and interpolates between samples', () => {
    const r = new GhostRecorder();
    for (let i = 0; i <= 120; i++) { const t = i / 60; r.sample(t, t * 0.1, -t * 0.05, Math.floor(t) * 100); }
    expect(r.g.hz).toBe(GHOST_HZ);
    expect(r.g.yaw.length).toBe(11);   // 0, 0.2 … 2.0
    const out: GhostSample = { yaw: 0, pitch: 0, score: 0, on: false };
    ghostAt(r.g, 1.1, out);
    expect(out.on).toBe(true);
    expect(out.yaw).toBeCloseTo(0.11, 2);
    expect(out.pitch).toBeCloseTo(-0.055, 2);
    expect(out.score).toBe(100);
    expect(ghostAt(r.g, 5, out).on).toBe(false);
    expect(ghostAt(null, 1, out).on).toBe(false);
    expect(ghostAt(r.g, -1, out).on).toBe(false);
  });

  it('turns the short way round past ±180° and caps its length', () => {
    const g = { hz: GHOST_HZ, yaw: [3100, -3100], pitch: [0, 0], score: [0, 0] };
    const out: GhostSample = { yaw: 0, pitch: 0, score: 0, on: false };
    ghostAt(g, 0.1, out);
    expect(Math.abs(out.yaw)).toBeGreaterThan(3.1);
    const r = new GhostRecorder();
    r.sample(10_000, 0, 0, 0);
    expect(r.g.yaw.length).toBe(GHOST_MAX);
  });
});

describe('gunnery range: lead tutor', () => {
  it('coaches more or less lead along the motion, higher or lower across it', () => {
    expect(coachLead(2, 2, 10)).toBe('on');
    expect(coachLead(-30, 5, 10)).toBe('more');
    expect(coachLead(30, -5, 10)).toBe('less');
    expect(coachLead(3, 25, 10)).toBe('high');
    expect(coachLead(3, -25, 10)).toBe('low');
    expect(Object.keys(COACH_TEXT).sort()).toEqual(['high', 'less', 'low', 'more', 'on']);
  });

  it('measures the lead angle', () => {
    expect(leadDegrees({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 100 }, { x: 100, y: 0, z: 100 })).toBeCloseTo(45, 6);
    expect(leadDegrees({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(0);
  });
});

describe('gunnery range: records', () => {
  it('a new best keeps its ghost; a worse run keeps the old best and ghost', () => {
    const save = sanitizeSave({});
    const d = drill('waistR', 'crossers');
    const ghost = { hz: GHOST_HZ, yaw: [1, 2], pitch: [3, 4], score: [0, 50] };
    const a = bookRun(save, d, { score: 500, ghost });
    expect([a.newBest, a.prevBest, save.records[d.id].runs]).toEqual([true, null, 1]);
    const b = bookRun(save, d, { score: 300, ghost: { ...ghost, yaw: [9, 9] } });
    expect([b.newBest, b.prevBest, save.records[d.id].best, save.records[d.id].runs]).toEqual([false, 500, 500, 2]);
    expect(save.records[d.id].ghost!.yaw).toEqual([1, 2]);
    const c = bookRun(save, d, { score: d.par, ghost: { ...ghost, yaw: [7, 7] } });
    expect([c.newBest, c.stars, save.records[d.id].stars, save.records[d.id].ghost!.yaw]).toEqual([true, 3, 3, [7, 7]]);
  });

  it('saves, loads and cleans up stored data', () => {
    const save = sanitizeSave({});
    expect(save.prefs).toEqual(DEFAULT_PREFS);
    save.prefs = { station: 'ball', tutor: false, ghost: true, free: { kind: 'sleeve', speed: 'fast', angle: 90, range: 900 } };
    bookRun(save, drill('ball', 'long'), { score: 321, ghost: { hz: GHOST_HZ, yaw: [1], pitch: [2], score: [3] } });
    saveRange(save);
    expect(loadRange()).toEqual(save);
    stubStorage({ [RANGE_KEY]: '{not json' });
    expect(loadRange().records).toEqual({});
    const dirty = sanitizeSave({
      records: { 'nose-x': { best: 5 }, 'tail-steady': { best: -1 }, 'top-sleeve': { best: 'x' }, 'ball-long': { best: 12.4, stars: 9, runs: -2, ghost: { yaw: [1, 'a'], pitch: [2, 3], score: [0, 1, 2] } } },
      prefs: { station: 'nose', tutor: 'yes', ghost: false, free: { speed: 'fast' } },
    });
    expect(Object.keys(dirty.records)).toEqual(['ball-long']);
    expect(dirty.records['ball-long']).toEqual({ best: 12, stars: 3, runs: 1, ghost: { hz: GHOST_HZ, yaw: [1, 0], pitch: [2, 3], score: [0, 1] } });
    expect(dirty.prefs).toEqual({ station: 'waistL', tutor: true, ghost: false, free: { kind: 'drone', speed: 'fast', angle: 60, range: 500 } });
  });
});

describe('gunnery range: mission, menu and Arabic', () => {
  it('a harmless gunner practice flight at the chosen gun, with a Hangar entry', () => {
    const m = RANGE_MISSION('tail', 'Crossing targets');
    expect([m.role, m.station, m.tutorial, m.range, m.playerArmor, m.waves.length]).toEqual(['gunner', 'tail', true, true, 0, 0]);
    const tab = HANGAR_TABS.find((t) => t.id === 'aircraft')!;
    expect(tab.entries.map((e) => e[0])).toContain('range');
  });

  it('every player-visible text is translated', () => {
    const d0 = drill('waistL', 'steady'), free = freeDrill('waistL', sanitizeFree({}));
    const texts = new Set<string>([
      'Gunnery Range', 'Drones, towed sleeves and drills', 'GUNNERY RANGE', 'Practise your gunnery',
      'Target drones and towed sleeves over the Wash. Nobody shoots back. Every run of a drill flies the same targets, so you can beat your ghost.',
      'Gun position', 'Drill', 'Target', 'Speed', 'Angle', 'Range', 'Options', 'Lead tutor', 'Shows the lead point, the time of flight and coaches your aim.',
      'Ghost of your best run', 'A blue ring shows where your best run was aiming, and its score.', 'Start drill', 'Not flown yet', 'ghost ready',
      'Targets down', 'Hits', 'Accuracy', 'Accuracy bonus', 'New best!', 'First score on this drill', 'Level with your ghost', 'Drill complete',
      'GHOST', 'Tow ship', 'Shoot the drill', 'Gunnery range', 'Practice flight · over the Wash',
      'A practice flight over the Wash. Target drones and towed sleeves only — nobody shoots back.',
      free.title, free.text, d0.title,
      ...DRILL_KEYS.flatMap((k) => [drill('top', k).title, drill('top', k).text]),
      ...Object.values(SPEED_LABEL), ...Object.values(ANGLE_LABEL), ...Object.values(KIND_LABEL), ...Object.values(COACH_TEXT),
      ...STATION_ORDER.map((s) => STATIONS[s].label),
    ]);
    const templates: [string, Record<string, string | number>][] = [
      ['{n} of 3 stars', { n: 2 }], ['Best {n}', { n: 450 }], ['You beat your ghost by {n}', { n: 40 }], ['Your ghost was {n} ahead', { n: 40 }],
      ['{n} m', { n: 500 }], ['{n} of {m} down', { n: 3, m: 6 }], ['Accuracy {p}%', { p: 40 }], ['First target in {n} s', { n: 3 }],
      ['Ghost {n}', { n: 120 }], ['Sleeve {n}/{m}', { n: 3, m: 14 }], ['Target {n} / {m}', { n: 2, m: 6 }],
      ['LEAD {d}° · {r} m', { d: '2.5', r: 600 }], ['Time of flight {t} s', { t: '0.71' }],
    ];
    setLang('ar');
    for (const t of texts) { expect(hasPhrase(t), t).toBe(true); expect(tx(t), t).toMatch(/[؀-ۿ]/); }
    for (const [t, vars] of templates) {
      expect(hasPhrase(t), t).toBe(true);
      const s = tx(t, vars);
      expect(s, t).toMatch(/[؀-ۿ]/);
      expect(s, t).not.toMatch(/\{\w+\}/);
    }
  });
});
