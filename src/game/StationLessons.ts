import type { StationId } from '../world/B17Layout';
import type { DroneSpec } from './TrainingDrones';

// Station lessons: one short interactive lesson per gun position, after the Gunnery School.
// Pure data and bookkeeping (unit-tested in tests/stationLessons.test.ts); the flight that
// plays a lesson is LessonRunner.ts, the menu is ui/TrainingScreen.ts.
//
// Every lesson opens and closes with the same drill (the same drone flown the same way), so
// the hits / rounds fired before and after the lesson are directly comparable. Lessons unlock
// one after another: the next opens when the previous one is completed or skipped.

export type LessonId = 'waist' | 'top' | 'ball' | 'tail';

// What a step waits for (LessonRunner checks it every frame)
export type LessonStepKind =
  | 'drill'        // shoot the drill drone (measures accuracy: first = before, last = after)
  | 'leadHold'     // hold the sight on the lead point for a second
  | 'kill'         // shoot down the step's drone
  | 'approach'     // a drone closing from out of convergence: kill it, counting rounds fired out of range
  | 'bursts'       // fire short bursts
  | 'jam'          // the gun jams: clear it
  | 'jamFight'     // kill a drone; the gun jams part way through
  | 'oxygen'       // the mask hose comes loose: reconnect it
  | 'oxygenFight'; // kill a drone while the hose comes loose part way through

export interface LessonStep {
  id: string;
  kind: LessonStepKind;
  title: string;
  text: string;                  // English; {fire} {reload} {o2} {key} {n} {range} {conv} are filled in by the runner
  radio: [string, string];       // speaker, line (subtitle; Arabic in i18n/ar/lessons.ts)
  timeout: number;               // s: the step moves on anyway (a lesson can never get stuck)
  drone?: DroneSpec;
  leadPip?: boolean;             // force the lead indicator on, whatever the difficulty
  need?: number;                 // bursts: how many short bursts
}

export interface LessonDef {
  id: LessonId;
  station: StationId;
  title: string;                 // the topic
  summary: string;               // one line on the Training screen
  steps: LessonStep[];
}

export const SHORT_BURST = 0.9;  // s: a burst at most this long counts as short
export const OUT_OF_RANGE = 600; // m: rounds fired beyond this in the convergence lesson are wasted

const DRILL_TEXT = 'Shoot down the drone your own way. This drill measures your accuracy — the same drill comes back at the end of the lesson.';
const FINAL_TEXT = 'The same drill as the start. Use what you just learned.';
const drill = (station: string, spec: DroneSpec, first: boolean): LessonStep => ({
  id: first ? 'before' : 'after', kind: 'drill', title: first ? 'Warm-up drill' : 'Final drill',
  text: first ? DRILL_TEXT : FINAL_TEXT,
  radio: first ? ['Pilot', `Training drone on the ${station}. Show me what you've got before we start.`] : ['Pilot', 'Same drone as before. Let\'s see the difference.'],
  timeout: 45, drone: spec,
});

const WAIST_DRILL: DroneSpec = { dist: 540, y0: 0, p0: 0.06, ay: 0.5, ap: 0.03, w: 0.21 };
const TOP_DRILL: DroneSpec = { dist: 650, y0: 0.3, p0: 0.12, ay: 0.35, ap: 0.05, w: 0.2 };
const BALL_DRILL: DroneSpec = { dist: 560, y0: 0.4, p0: 0.1, ay: 0.3, ap: 0.06, w: 0.2 };
const TAIL_DRILL: DroneSpec = { dist: 580, y0: 0, p0: 0.05, ay: 0.3, ap: 0.08, w: 0.22 };

export const LESSONS: readonly LessonDef[] = [
  {
    id: 'waist', station: 'waistL', title: 'Leading targets',
    summary: 'Waist gun · aim where the fighter will be, not where it is',
    steps: [
      drill('left waist', WAIST_DRILL, true),
      {
        id: 'hold', kind: 'leadHold', title: 'Aim ahead', timeout: 40, leadPip: true,
        text: 'Your rounds need time to get there, so aim ahead of a crossing plane. Hold the sight on the yellow <b class="gold">◇ lead indicator</b> for a second.',
        radio: ['Navigator', 'Don\'t chase his tail — get ahead of him.'],
        drone: { dist: 520, y0: 0, p0: 0.06, ay: 0.45, ap: 0.02, w: 0.18 },
      },
      {
        id: 'withPip', kind: 'kill', title: 'Fire at the lead', timeout: 50, leadPip: true,
        text: '{fire} at the <b class="gold">◇</b>, not at the plane. Short bursts — let the drone fly into your tracers.',
        radio: ['Waist', 'Lead him and let him fly into it!'],
        drone: { dist: 520, y0: 0, p0: 0.06, ay: 0.45, ap: 0.02, w: 0.2 },
      },
      {
        id: 'byEye', kind: 'kill', title: 'Lead by eye', timeout: 55,
        text: 'No indicator now. Aim ahead along its path: further ahead the faster it crosses and the further away it is. A plane flying straight at you needs no lead at all.',
        radio: ['Pilot', 'No crutches this time, gunner. Lead him by eye.'],
        drone: { dist: 500, y0: 0, p0: 0.06, ay: 0.5, ap: 0.03, w: 0.22 },
      },
      drill('left waist', WAIST_DRILL, false),
    ],
  },
  {
    id: 'top', station: 'top', title: 'Convergence',
    summary: 'Top turret · the twin guns hit hardest at 300 m',
    steps: [
      drill('top turret', TOP_DRILL, true),
      {
        id: 'sweet', kind: 'kill', title: 'The sweet spot', timeout: 50,
        text: 'Your twin .50s are aligned so their two streams cross at <b>{conv} m</b>. Near that range both land on the same spot. This drone sits right there: knock it down.',
        radio: ['Top Turret', 'Both guns meet at three hundred metres. That\'s where you hurt them.'],
        drone: { dist: 300, y0: 0.3, p0: 0.1, ay: 0.2, ap: 0.04, w: 0.2 },
      },
      {
        id: 'wait', kind: 'approach', title: 'Wait for it', timeout: 60,
        text: 'This one starts far out, where your streams spread apart and the rounds lose their punch. Hold your fire and open up once it is inside <b>400 m</b>.',
        radio: ['Pilot', 'He\'s way out. Don\'t waste it — wait till he\'s close.'],
        drone: { dist: 1150, y0: 0.25, p0: 0.12, ay: 0.12, ap: 0.03, w: 0.2, closing: 42, minDist: 280 },
      },
      drill('top turret', TOP_DRILL, false),
    ],
  },
  {
    id: 'ball', station: 'ball', title: 'Ammo and jams',
    summary: 'Ball turret · short bursts save the belt; clear a jam fast',
    steps: [
      drill('ball turret', BALL_DRILL, true),
      {
        id: 'bursts', kind: 'bursts', title: 'Short bursts', timeout: 40, need: 3,
        text: 'Every gun has a limited belt and a barrel that overheats. Fire <b>{n} short bursts</b> — under a second each. A turret can\'t be reloaded by hand: when its box runs low, the crew passes up more.',
        radio: ['Pilot', 'Short bursts, gunner. That belt has to last all the way to the target and back.'],
      },
      {
        id: 'jam', kind: 'jam', title: 'Clear the jam', timeout: 30,
        text: 'Your gun has jammed — the trigger just clicks. Hold {reload} or tap it twice to work the charging handle.',
        radio: ['Ball Turret', 'Gun\'s jammed! Working the charging handle!'],
      },
      {
        id: 'jamFight', kind: 'jamFight', title: 'Jam under fire', timeout: 60,
        text: 'Shoot this drone down. Expect a jam half way through: clear it with {reload} and get straight back on target.',
        radio: ['Navigator', 'Fighter low! Get him, and keep that gun running.'],
        drone: { dist: 480, y0: 0.4, p0: 0.12, ay: 0.25, ap: 0.05, w: 0.2, toughness: 0.5 },
      },
      drill('ball turret', BALL_DRILL, false),
    ],
  },
  {
    id: 'tail', station: 'tail', title: 'Oxygen',
    summary: 'Tail gun · at altitude a loose mask hose blacks you out',
    steps: [
      drill('tail gun', TAIL_DRILL, true),
      {
        id: 'hose', kind: 'oxygen', title: 'Check your mask', timeout: 30,
        text: 'Up here the air is too thin to breathe. Your mask hose just came loose: the picture greys out and your aim drifts. Press {o2} to reconnect it.',
        radio: ['Pilot', 'Oxygen check! Tail, you\'re not answering — check your mask hose!'],
      },
      {
        id: 'hoseFight', kind: 'oxygenFight', title: 'Oxygen under fire', timeout: 60,
        text: 'Shoot this drone down. If the screen starts to grey, press {o2} first — a gunner who blacks out can\'t hit anything.',
        radio: ['Tail', 'Bandit at six! I\'m on him.'],
        drone: { dist: 520, y0: 0, p0: 0.06, ay: 0.25, ap: 0.06, w: 0.2, toughness: 0.5 },
      },
      drill('tail gun', TAIL_DRILL, false),
    ],
  },
];

export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);

// ---------------------------------------------------------------- progress
export interface Accuracy { shots: number; hits: number }

export interface LessonRecord {
  attempts: number;              // flights started
  completed: number;             // flights finished
  skipped?: boolean;             // skipped from the Training screen (unlocks the next one)
  bestTime?: number;             // s
  before?: number;               // accuracy 0..1 of the last finished flight's warm-up drill
  after?: number;                // ...and of its final drill
  stepsSkipped?: number;         // last finished flight: steps skipped in flight
  timeouts?: number;             // last finished flight: steps that ran out of time
}

export interface LessonProgress { v: 1; lessons: Partial<Record<LessonId, LessonRecord>> }

export const LESSON_KEY = 'sws3d.lessons.v1';

export function emptyProgress(): LessonProgress { return { v: 1, lessons: {} }; }

export function loadLessonProgress(): LessonProgress {
  try {
    const raw = JSON.parse(localStorage.getItem(LESSON_KEY) ?? 'null');
    if (raw && raw.v === 1 && raw.lessons && typeof raw.lessons === 'object') return { v: 1, lessons: raw.lessons };
  } catch { /* storage unavailable or corrupt */ }
  return emptyProgress();
}

export function saveLessonProgress(p: LessonProgress) {
  try { localStorage.setItem(LESSON_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}

const rec = (p: LessonProgress, id: LessonId): LessonRecord => (p.lessons[id] ??= { attempts: 0, completed: 0 });

export function isDone(p: LessonProgress, id: LessonId) { return (p.lessons[id]?.completed ?? 0) > 0; }

/** The first lesson is always open; each next one opens once the previous is completed or skipped. */
export function isUnlocked(p: LessonProgress, id: LessonId) {
  const i = LESSONS.findIndex((l) => l.id === id);
  if (i <= 0) return i === 0;
  const prev = p.lessons[LESSONS[i - 1].id];
  return !!prev && (prev.completed > 0 || !!prev.skipped);
}

export type LessonStatus = 'locked' | 'new' | 'skipped' | 'done';
export function lessonStatus(p: LessonProgress, id: LessonId): LessonStatus {
  if (isDone(p, id)) return 'done';
  if (!isUnlocked(p, id)) return 'locked';
  return p.lessons[id]?.skipped ? 'skipped' : 'new';
}

/** The lesson the Training screen points at: the first unlocked one not yet completed. */
export function nextLesson(p: LessonProgress): LessonId | null {
  return LESSONS.find((l) => isUnlocked(p, l.id) && !isDone(p, l.id))?.id ?? null;
}

export function recordAttempt(p: LessonProgress, id: LessonId) { rec(p, id).attempts++; }

export function skipLesson(p: LessonProgress, id: LessonId) {
  if (!isUnlocked(p, id) || isDone(p, id)) return false;
  rec(p, id).skipped = true;
  return true;
}

export function accuracy(a: Accuracy | null | undefined): number | undefined {
  return a && a.shots > 0 ? Math.min(1, a.hits / a.shots) : undefined;
}

export interface LessonResult { time: number; before: Accuracy | null; after: Accuracy | null; stepsSkipped: number; timeouts: number }

export function recordResult(p: LessonProgress, id: LessonId, r: LessonResult) {
  const e = rec(p, id);
  e.completed++;
  e.bestTime = e.bestTime === undefined ? r.time : Math.min(e.bestTime, r.time);
  e.before = accuracy(r.before);
  e.after = accuracy(r.after);
  e.stepsSkipped = r.stepsSkipped;
  e.timeouts = r.timeouts;
  return e;
}

/** Accuracy change of a finished lesson in percentage points (undefined without both drills). */
export function accuracyGain(e: LessonRecord | undefined): number | undefined {
  return e?.before !== undefined && e.after !== undefined ? Math.round((e.after - e.before) * 100) : undefined;
}

export const pct = (a: number | undefined) => (a === undefined ? '—' : `${Math.round(a * 100)}%`);

/** Totals for the Training screen and the dev hook (sws.lessons.metrics()). */
export function lessonMetrics(p: LessonProgress) {
  const recs = LESSONS.map((l) => p.lessons[l.id]);
  const gains = recs.map(accuracyGain).filter((g): g is number => g !== undefined);
  return {
    total: LESSONS.length,
    completed: recs.filter((r) => (r?.completed ?? 0) > 0).length,
    skipped: recs.filter((r) => r?.skipped && !(r.completed > 0)).length,
    attempts: recs.reduce((n, r) => n + (r?.attempts ?? 0), 0),
    avgGain: gains.length ? Math.round(gains.reduce((a, b) => a + b, 0) / gains.length) : undefined,
  };
}
