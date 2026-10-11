// Aircraft recognition data (title menu → Aircraft, ui/GalleryScreen.ts): the spec card of
// every type in the game. Historical figures are rounded and short (one representative
// sub-type each, the one the game flies); the boss warship is fictional and labelled as such.
// All shown text is English here and translated through tx() (i18n/ar/extras.ts).
// Pure data: unit-tested (tests/extras.test.ts).
import type { ModelKind } from '../world/Models';
import type { EnemyType } from '../world/EnemyTypes';

export type AircraftId = 'b17' | 'p51d' | EnemyType | 'boss';

export interface AircraftSpec {
  id: AircraftId;
  model: ModelKind;          // the 3D model shown (Me 410: the Bf 110 stand-in, boss: the Ju 88 hull)
  side: 'allied' | 'axis';
  name: string;              // full designation
  nick: string;              // short name for the list and the quiz buttons
  role: string;
  crew: string;
  armament: string;
  speed: string;             // top speed
  first: string;             // first flight of the type
  size: string;              // span × length
  tip: string;               // the game-relevant recognition / combat tip
  note?: string;             // footnote (stand-in airframe, fictional)
  fictional?: boolean;
}

export const AIRCRAFT_SPECS: AircraftSpec[] = [
  {
    id: 'b17', model: 'b17', side: 'allied', name: 'Boeing B-17G Flying Fortress', nick: 'B-17G',
    role: 'Heavy bomber · your aircraft', crew: '10',
    armament: '13 × .50 cal M2 machine guns · up to 8,000 lb of bombs',
    speed: '287 mph (462 km/h)', first: '28 July 1935', size: '31.6 m × 22.7 m',
    tip: 'Five gun positions you can man: switch seats to meet each attack where it comes from.',
  },
  {
    id: 'p51d', model: 'p51d', side: 'allied', name: 'North American P-51D Mustang', nick: 'P-51D',
    role: 'Long-range escort fighter', crew: '1',
    armament: '6 × .50 cal M2 machine guns',
    speed: '437 mph (703 km/h)', first: '26 October 1940', size: '11.3 m × 9.8 m',
    tip: 'Friendly! Bubble canopy and a belly scoop: hold your fire when one dives past the bombers.',
  },
  {
    id: 'fw190', model: 'fw190', side: 'axis', name: 'Focke-Wulf Fw 190 A-8', nick: 'Fw 190',
    role: 'Fighter · bomber destroyer', crew: '1',
    armament: '2 × 13 mm MG 131 · 4 × 20 mm MG 151/20 cannon',
    speed: '408 mph (656 km/h)', first: '1 June 1939', size: '10.5 m × 9.0 m',
    tip: 'Attacks head-on from twelve o\'clock high in tight groups: meet him with the top turret and fire early.',
  },
  {
    id: 'bf109', model: 'bf109', side: 'axis', name: 'Messerschmitt Bf 109 G-14', nick: 'Bf 109',
    role: 'Fighter', crew: '1',
    armament: '1 × 20 mm MG 151/20 cannon · 2 × 13 mm MG 131',
    speed: '400 mph (640 km/h)', first: '29 May 1935', size: '9.9 m × 9.0 m',
    tip: 'Nimble but lightly built: a short, well-led burst brings him down. Watch for him diving on stragglers.',
  },
  {
    id: 'bf110', model: 'bf110', side: 'axis', name: 'Messerschmitt Bf 110 G', nick: 'Bf 110',
    role: 'Zerstörer heavy fighter', crew: '2–3',
    armament: '2 × 20 mm cannon · 4 × 7.92 mm MG · twin rear MG 81Z · 21 cm rockets',
    speed: '370 mph (595 km/h)', first: '12 May 1936', size: '16.3 m × 12.1 m',
    tip: 'Hangs back out of range and lobs 21 cm rockets from a kilometre: break the wave up before it fires.',
  },
  {
    id: 'ju88', model: 'ju88', side: 'axis', name: 'Junkers Ju 88 A-4', nick: 'Ju 88',
    role: 'Bomber · heavy fighter', crew: '4',
    armament: '7.92 mm and 13 mm defensive guns · 1,400 kg of bombs internally',
    speed: '317 mph (510 km/h)', first: '21 December 1936', size: '20.1 m × 14.4 m',
    tip: 'Slow and armoured: go for an engine, not the fuselage.',
  },
  {
    id: 'me262', model: 'me262', side: 'axis', name: 'Messerschmitt Me 262 A-1a Schwalbe', nick: 'Me 262',
    role: 'Jet fighter', crew: '1',
    armament: '4 × 30 mm MK 108 cannon',
    speed: '540 mph (870 km/h)', first: '18 April 1941 (first jet flight 18 July 1942)', size: '12.6 m × 10.6 m',
    tip: 'Too fast to track: lead him far ahead, and fire as he slows to line up his cannon.',
  },
  {
    id: 'me163', model: 'me163', side: 'axis', name: 'Messerschmitt Me 163 B Komet', nick: 'Me 163',
    role: 'Rocket interceptor', crew: '1',
    armament: '2 × 30 mm MK 108 cannon',
    speed: '596 mph (960 km/h)', first: '1941', size: '9.3 m × 5.7 m',
    tip: 'A few minutes of rocket fuel: one slashing pass, then he glides home. One good hit and he is done.',
  },
  {
    id: 'he111', model: 'he111', side: 'axis', name: 'Heinkel He 111 H', nick: 'He 111',
    role: 'Medium bomber', crew: '5',
    armament: 'Up to 7 × 7.92 mm MG · 2,000 kg of bombs',
    speed: '273 mph (440 km/h)', first: '24 February 1935', size: '22.6 m × 16.4 m',
    tip: 'Glazed nose, close formations, a gunner in every window: attack from below and go for the engines.',
  },
  {
    id: 'me410', model: 'bf110', side: 'axis', name: 'Messerschmitt Me 410 A Hornisse', nick: 'Me 410',
    role: 'Heavy fighter · bomber destroyer', crew: '2',
    armament: '2 × 20 mm cannon · 2 × 7.92 mm MG · 2 × 13 mm remote barbettes · 50 mm BK 5 cannon (U4)',
    speed: '388 mph (624 km/h)', first: '1942', size: '16.4 m × 12.4 m',
    tip: 'The BK 5 cannon telegraphs: he lines up from two kilometres and holds steady. Kill him before he fires.',
    note: 'Shown on the Bf 110 airframe the game uses as a stand-in.',
  },
  {
    id: 'do335', model: 'do335', side: 'axis', name: 'Dornier Do 335 A Pfeil', nick: 'Do 335',
    role: 'Heavy fighter (push-pull)', crew: '1',
    armament: '1 × 30 mm MK 103 cannon · 2 × 20 mm MG 151/20',
    speed: '474 mph (763 km/h)', first: '26 October 1943', size: '13.8 m × 13.9 m',
    tip: 'A propeller at each end: he dives from high astern as fast as a jet. Watch the tail and lead him hard.',
  },
  {
    id: 'boss', model: 'ju88', side: 'axis', name: 'Luftkreuzer (fictional)', nick: 'Luftkreuzer',
    role: 'Flying warship · boss battle group', crew: 'Fictional',
    armament: 'Gun turrets · 8.8 cm dorsal flak · rocket pods',
    speed: 'Fictional', first: 'Never: invented for the game', size: 'About three times a Ju 88',
    tip: 'Shoot away turrets, engines and flak to breach the armour, then pour fire into the hull.',
    note: 'Fictional: no such aircraft was ever built.', fictional: true,
  },
];

export const specById = (id: AircraftId) => AIRCRAFT_SPECS.find((s) => s.id === id)!;

/** Every shown text of the gallery data (i18n coverage test). */
export function specTexts(s: AircraftSpec): string[] {
  return [s.name, s.nick, s.role, s.crew, s.armament, s.speed, s.first, s.size, s.tip, ...(s.note ? [s.note] : [])];
}

// ---------------- recognition quiz ----------------

export const QUIZ_ROUNDS = 10;
export const QUIZ_POOL: AircraftId[] = AIRCRAFT_SPECS.filter((s) => !s.fictional).map((s) => s.id);

/** Four choices for a round: the answer plus three distinct others, shuffled. */
export function quizChoices(answer: AircraftId, rnd: () => number = Math.random): AircraftId[] {
  const others = QUIZ_POOL.filter((id) => id !== answer);
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
  const out = [answer, ...others.slice(0, 3)];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** The types of one quiz: QUIZ_ROUNDS draws, no type twice in a row. */
export function quizSequence(rnd: () => number = Math.random): AircraftId[] {
  const out: AircraftId[] = [];
  while (out.length < QUIZ_ROUNDS) {
    const id = QUIZ_POOL[Math.floor(rnd() * QUIZ_POOL.length)];
    if (id !== out[out.length - 1]) out.push(id);
  }
  return out;
}

export interface QuizRecord { best: number; played: number; last: number }
const QUIZ_KEY = 'sws3d.recognition.v1';

export function loadQuiz(): QuizRecord {
  try {
    const r = JSON.parse(localStorage.getItem(QUIZ_KEY) ?? '{}');
    return { best: Number(r.best) || 0, played: Number(r.played) || 0, last: Number(r.last) || 0 };
  } catch { return { best: 0, played: 0, last: 0 }; }
}

/** Records a finished quiz; returns the record and whether it is a new best. */
export function saveQuiz(score: number): { rec: QuizRecord; best: boolean } {
  const rec = loadQuiz();
  const best = score > rec.best;
  rec.best = Math.max(rec.best, score);
  rec.played++;
  rec.last = score;
  try { localStorage.setItem(QUIZ_KEY, JSON.stringify(rec)); } catch { /* storage unavailable */ }
  return { rec, best };
}
