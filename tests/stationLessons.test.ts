import { describe, it, expect, vi } from 'vitest';
import { stubStorage } from './helpers';
import {
  LESSONS, LESSON_KEY, emptyProgress, loadLessonProgress, saveLessonProgress, isUnlocked, lessonStatus, nextLesson,
  recordAttempt, recordResult, skipLesson, accuracy, accuracyGain, lessonMetrics, lessonById,
} from '../src/game/StationLessons';
import { LessonRunner, lessonMission } from '../src/game/LessonRunner';
import { trainingRows } from '../src/ui/TrainingScreen';
import { GunnerSurvival } from '../src/game/GunnerSurvival';
import { STATIONS } from '../src/world/B17Layout';
import { hasPhrase } from '../src/i18n';

describe('station lessons: content', () => {
  it('one lesson per gun position type, in unlock order, covering the four topics', () => {
    expect(LESSONS.map((l) => l.id)).toEqual(['waist', 'top', 'ball', 'tail']);
    expect(LESSONS.map((l) => STATIONS[l.station].type)).toEqual(['waist', 'turret', 'turret', 'tail']);
    expect(LESSONS.map((l) => l.title)).toEqual(['Leading targets', 'Convergence', 'Ammo and jams', 'Oxygen']);
  });

  it('every lesson opens and closes with the same measured drill, and every step can time out', () => {
    for (const l of LESSONS) {
      const first = l.steps[0], last = l.steps[l.steps.length - 1];
      expect(first.kind, l.id).toBe('drill');
      expect(last.kind, l.id).toBe('drill');
      expect(last.drone, l.id).toEqual(first.drone);
      expect(l.steps.filter((s) => s.kind === 'drill'), l.id).toHaveLength(2);
      for (const s of l.steps) {
        expect(s.timeout, `${l.id}.${s.id}`).toBeGreaterThan(0);
        expect(s.timeout, `${l.id}.${s.id}`).toBeLessThanOrEqual(60);
        const needsDrone = ['drill', 'kill', 'approach', 'leadHold', 'jamFight', 'oxygenFight'].includes(s.kind);
        expect(!!s.drone, `${l.id}.${s.id}`).toBe(needsDrone);
      }
      expect(new Set(l.steps.map((s) => s.id)).size, l.id).toBe(l.steps.length);
    }
  });

  it('the convergence lesson closes from outside to inside the 400 m it asks for', () => {
    const wait = lessonById('top')!.steps.find((s) => s.kind === 'approach')!;
    expect(wait.drone!.dist).toBeGreaterThan(1000);
    expect(wait.drone!.minDist!).toBeLessThan(400);
  });

  it('every player-visible lesson string has Arabic', () => {
    const strings = [
      'Station lesson', 'Complete the lesson', 'STATION LESSON', 'Lesson complete', 'LESSON COMPLETE', 'Accuracy {a} → {b}',
      "Good work, gunner. That one's in the log book.", 'Back to the {st}: press {key}', 'Range {m} m', 'Rounds wasted out of range: {n}',
      'Short bursts: {n} / {m}', 'Too long! Let go sooner.', 'Hose loose! Press {o2}', 'Jammed! Hold {reload}', 'Skip step', '{key} skip step', 'Skipped',
      'Station lesson — follow the instructions', 'Gunnery School and station lessons', 'Lessons complete: {n} / {m}',
      'Average accuracy change: {n} points', 'Finish or skip the lesson above to unlock', 'Fly again', 'Locked', 'New', 'Done', 'Start', 'Skip',
      'Short lessons for each gun position. Each one unlocks the next; skip any you already know.',
    ];
    for (const l of LESSONS) {
      strings.push(l.title, l.summary, lessonMission(l).target);
      for (const s of l.steps) strings.push(s.title, s.text, s.radio[1]);
    }
    for (const r of trainingRows(emptyProgress(), false)) strings.push(r.title, r.summary, r.station);
    for (const s of strings) expect(hasPhrase(s), s).toBe(true);
  });
});

describe('station lessons: progress', () => {
  it('unlocks one after another, by completing or skipping', () => {
    const p = emptyProgress();
    expect(LESSONS.map((l) => lessonStatus(p, l.id))).toEqual(['new', 'locked', 'locked', 'locked']);
    expect(skipLesson(p, 'top')).toBe(false);               // locked: cannot be skipped
    recordResult(p, 'waist', { time: 120, before: { shots: 100, hits: 20 }, after: { shots: 80, hits: 32 }, stepsSkipped: 0, timeouts: 1 });
    expect(isUnlocked(p, 'top')).toBe(true);
    expect(nextLesson(p)).toBe('top');
    expect(skipLesson(p, 'top')).toBe(true);
    expect(lessonStatus(p, 'top')).toBe('skipped');
    expect(lessonStatus(p, 'ball')).toBe('new');
    expect(lessonStatus(p, 'tail')).toBe('locked');
    expect(skipLesson(p, 'waist')).toBe(false);             // done stays done
    expect(nextLesson(p)).toBe('top');                      // skipped is still the one to fly
  });

  it('measures completion and accuracy before / after', () => {
    const p = emptyProgress();
    recordAttempt(p, 'waist'); recordAttempt(p, 'waist');
    const e = recordResult(p, 'waist', { time: 130, before: { shots: 100, hits: 20 }, after: { shots: 80, hits: 32 }, stepsSkipped: 1, timeouts: 0 });
    expect(e).toMatchObject({ attempts: 2, completed: 1, bestTime: 130, before: 0.2, after: 0.4, stepsSkipped: 1 });
    expect(accuracyGain(e)).toBe(20);
    recordResult(p, 'waist', { time: 150, before: null, after: { shots: 0, hits: 0 }, stepsSkipped: 0, timeouts: 0 });
    expect(p.lessons.waist).toMatchObject({ completed: 2, bestTime: 130, before: undefined, after: undefined });
    expect(accuracyGain(p.lessons.waist)).toBeUndefined();
    expect(accuracy({ shots: 3, hits: 9 })).toBe(1);        // a round can score more than one hit: capped
    skipLesson(p, 'top');
    recordResult(p, 'ball', { time: 90, before: { shots: 50, hits: 10 }, after: { shots: 50, hits: 5 }, stepsSkipped: 0, timeouts: 0 });
    expect(lessonMetrics(p)).toEqual({ total: 4, completed: 2, skipped: 1, attempts: 2, avgGain: -10 });
  });

  it('persists, and survives missing or corrupt storage', () => {
    const storage = stubStorage();
    expect(loadLessonProgress()).toEqual(emptyProgress());
    const p = emptyProgress();
    skipLesson(p, 'waist');
    saveLessonProgress(p);
    expect(loadLessonProgress().lessons.waist?.skipped).toBe(true);
    storage.setItem(LESSON_KEY, '{nope');
    expect(loadLessonProgress()).toEqual(emptyProgress());
    storage.setItem(LESSON_KEY, JSON.stringify({ v: 9, lessons: { waist: { completed: 1 } } }));
    expect(loadLessonProgress()).toEqual(emptyProgress());
  });

  it('the Training screen lists the school first and points at the next lesson', () => {
    const p = emptyProgress();
    let rows = trainingRows(p, false);
    expect(rows.map((r) => r.id)).toEqual(['school', 'waist', 'top', 'ball', 'tail']);
    expect(rows.filter((r) => r.next).map((r) => r.id)).toEqual(['school']);
    expect(rows.map((r) => r.canSkip)).toEqual([false, true, false, false, false]);
    recordResult(p, 'waist', { time: 100, before: { shots: 10, hits: 2 }, after: { shots: 10, hits: 5 }, stepsSkipped: 0, timeouts: 0 });
    rows = trainingRows(p, true);
    expect(rows.filter((r) => r.next).map((r) => r.id)).toEqual(['top']);
    expect(rows[1]).toMatchObject({ status: 'done', result: ['20%', '50%'] });
    expect(rows[3].status).toBe('locked');
  });
});

describe('station lessons: mission and oxygen pace', () => {
  it('a lesson flies as a harmless training mission at its own gun position', () => {
    for (const l of LESSONS) {
      expect(lessonMission(l)).toMatchObject({ id: `lesson_${l.id}`, tutorial: true, lesson: l.id, role: 'gunner', station: l.station, playerArmor: 0, waves: [] });
    }
  });

  it('the lesson hose cut greys out within seconds on every difficulty, and Recruit\'s rescue does not end it', () => {
    for (const d of ['recruit', 'veteran', 'ace'] as const) {
      const life = new GunnerSurvival();
      life.reset(d);
      life.oxygenDrill = { oxygenGrace: 0.4, oxygenRise: 6, rescue: 120 };
      life.oxygen = true;
      for (let i = 0; i < 70; i++) life.update(0.1, 0, 0, 0);
      expect(life.oxygen, d).toBe(true);
      expect(life.hypoxia, d).toBeGreaterThan(0.85);
      life.reset(d);
      expect(life.oxygenDrill).toBeNull();
    }
  });
});

// A lesson driven frame by frame against a stand-in game: the runner's checks read the
// same fields the real gunner and world expose.
function fakeRunner(id: 'ball' | 'tail') {
  stubStorage();
  const guns = new Map(Object.keys(STATIONS).map((k) => [k, { jam: false, clear: 0, tapAge: Infinity }]));
  let drones: { f: { alive: boolean }; dist: number }[] = [];
  const keys = new Set<string>();
  const game = {
    state: 'playing',
    world: { stats: { shots: 0, hits: 0 }, playerDamageScale: 1, aiGunnerFactor: 1, flakIntensity: 1, playerFocus: 0, callout: vi.fn(), playerBomber: {} },
    gunner: { station: lessonById(id)!.station, firing: false, survival: new GunnerSurvival(), gunState: (k: string) => guns.get(k)!, loadout: { weapon: { velocity: 870 }, velocity: 1 } },
    hud: { forceLeadPip: false },
    input: { hit: (k: string) => keys.has(k) },
  };
  const range = {
    get drones() { return drones; },
    anyAlive: () => drones.some((d) => d.f.alive),
    clear: () => { drones = []; },
    spawn: (_s: string, spec: { dist: number }) => { const d = { f: { alive: true }, dist: spec.dist }; drones.push(d); return d; },
  };
  const ui = { banner: vi.fn() };
  const r = Object.assign(Object.create(LessonRunner.prototype), {
    game, ui, range, engine: { camera: { position: {} } }, host: { finished: vi.fn() }, log: [], card: null, lastHtml: '',
    active: true, def: lessonById(id), stepIdx: -1, phase: 'intro', t: 0, total: 0, acc: 0, shots0: 0, hits0: 0, prevShots: 0,
    bursts: 0, longBursts: 0, burstT: -1, wasted: 0, triggered: false, byPlayer: false, skip: false, stepsSkipped: 0, timeouts: 0,
    before: null, after: null,
  }) as LessonRunner;
  const run = (s: number, each?: () => void) => { for (let t = 0; t < s; t += 0.05) { each?.(); r.update(0.05); } };
  const shoot = (shots: number, hits: number) => { game.world.stats.shots += shots; game.world.stats.hits += hits; };
  const kill = () => { for (const d of drones) d.f.alive = false; };
  return { r, game, guns, keys, run, shoot, kill, ui, get drones() { return drones; } };
}

describe('station lessons: the runner', () => {
  it('plays the ball turret lesson: drill, bursts, jam, jam under fire, drill — and records before / after', () => {
    const f = fakeRunner('ball');
    const { r, game } = f;
    f.run(3.6);                                           // intro
    expect(r.step?.id).toBe('before');
    expect(game.world.playerDamageScale).toBe(0);
    f.shoot(100, 10); f.kill(); f.run(0.1);
    expect(r.phase).toBe('done');
    f.run(1.4);
    expect(r.step?.kind).toBe('bursts');
    // one long burst does not count, three short ones do
    f.run(1.5, () => { game.gunner.firing = true; });
    f.run(0.3, () => { game.gunner.firing = false; });
    for (let i = 0; i < 3; i++) { f.run(0.4, () => { game.gunner.firing = true; }); f.run(0.3, () => { game.gunner.firing = false; }); }
    expect(r.phase).toBe('done');
    f.run(1.4);
    expect(r.step?.kind).toBe('jam');
    expect(f.guns.get('ball')!.jam).toBe(true);
    f.guns.get('ball')!.jam = false; f.run(0.1);         // cleared (by the gunner's own R handling)
    f.run(1.4);
    expect(r.step?.kind).toBe('jamFight');
    f.shoot(10, 4); f.run(0.1);
    expect(f.guns.get('ball')!.jam).toBe(true);          // jams half way through
    f.kill(); f.run(0.1);
    expect(r.phase).toBe('done');
    expect(f.guns.get('ball')!.jam).toBe(false);         // never left jammed after a step
    f.run(1.4);
    expect(r.step?.id).toBe('after');
    f.shoot(50, 20); f.kill(); f.run(0.1);
    f.run(1.4);
    expect(r.phase).toBe('finale');
    expect(f.ui.banner).toHaveBeenCalledOnce();
    expect(loadLessonProgress().lessons.ball).toMatchObject({ completed: 1, before: 0.1, after: 0.4, stepsSkipped: 0, timeouts: 0 });
    f.run(5.2);
    expect(r.active).toBe(false);
    expect((r as any).host.finished).toHaveBeenCalledWith('ball', true);
  });

  it('skips steps and times them out, and never measures a skipped drill', () => {
    const f = fakeRunner('tail');
    const { r, game } = f;
    f.run(3.6);
    (r as any).skip = true; f.run(0.1);                   // skip the warm-up drill
    f.run(1.4);
    expect(r.step?.kind).toBe('oxygen');
    expect(game.gunner.survival.oxygen).toBe(true);
    f.run(31);                                            // ignored: times out, hose reconnected
    expect(game.gunner.survival.oxygen).toBe(false);
    expect(game.gunner.survival.oxygenDrill).toBeNull();
    f.run(1.4);
    expect(r.step?.kind).toBe('oxygenFight');
    f.run(4.2);
    expect(game.gunner.survival.oxygen).toBe(true);       // the hose comes loose part way through
    f.kill(); f.run(0.2);
    expect(r.phase).toBe('step');                         // a dead drone is not enough while blacking out
    game.gunner.survival.reconnect(); f.run(0.1);
    expect(r.phase).toBe('done');
    f.run(1.4);
    f.shoot(40, 10); f.kill(); f.run(0.1); f.run(1.4);
    const e = loadLessonProgress().lessons.tail!;
    expect(e).toMatchObject({ completed: 1, after: 0.25, stepsSkipped: 1, timeouts: 1 });
    expect(e.before).toBeUndefined();
  });
});
