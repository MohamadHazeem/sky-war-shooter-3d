// The Tour (Phase 11 goal 07): a 25-mission tour of duty for the B-17 gunner.
//
// One persistent Fortress and one crew, from the Emden raid of September 1943 to the spring of
// 1944. Everything here is pure data and maths plus guarded localStorage ('sws3d.tour.v1'), so
// it is unit-tested in Node (tests/tour.test.ts). The game wiring lives in TourRuntime.ts and the
// screens in ui/TourScreen.ts.
//
// - Field orders: SCHEDULE is 25 stages in date order, each with one to three historical targets.
//   A target is flown as a variant of an existing gunner mission (Missions.ts / DeepPenetration.ts:
//   its weather, set piece, tactics, target layout and flak), re-dated, re-targeted and re-tuned
//   by the target's danger (1..5) and how far into the tour it is (tourMission).
// - The ship: damage carried between missions (`wear`, per hit zone, 0..1 of the zone's strength
//   still unrepaired), repair patches on her skin, missions flown. Shot down or ditched: the
//   crew gets a replacement Fortress.
// - The crew: ten men, the CrewRoster's originals at their trade. Wounds (out for a few
//   missions, Purple Heart), deaths, men sent home, replacements (rookies), promotions every few
//   missions and the Air Medal / Oak Leaf Clusters / DFC on the historical mission counts.
// - Morale and fatigue: change with every sortie and every event; they scale the AI gunners
//   (crewFactor). A stand-down rests the crew between missions.
// - Mid-tour events: one in two missions brings a card with a choice (EVENTS); the halfway flak
//   house is fixed. Mission 25 is the finale, "Going Home".
//
// Only a successful sortie is credited. A failed one is flown again; a lost ship is replaced.
import { CAMPAIGN, type Mission, type Round } from './Missions';
import { DEEP_PENETRATION } from './DeepPenetration';
import { baseOf, escortBaseline } from './CampaignState';
import { rng } from './SideRaids';
import { MEN, ROOKIES, type ManId } from './CrewRoster';
import type { CrewId } from '../world/Crew';
import type { StationId } from '../world/B17Layout';
import type { Weather } from '../render/Weather';

export const TOUR_KEY = 'sws3d.tour.v1';
export const TOUR_LENGTH = 25;
export const FIRST_SHIP = 'Sky Queen';   // displayed through Customize.withName (the player's own name for her)
export const isTourId = (id: string) => /^tour-\d{1,2}-\d$/.test(id);
export const tourId = (stage: number, opt: number) => `tour-${stage + 1}-${opt}`;
export function parseTourId(id: string): { stage: number; opt: number } | null {
  const m = /^tour-(\d{1,2})-(\d)$/.exec(id);
  return m ? { stage: +m[1] - 1, opt: +m[2] } : null;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// ---------------- field orders ----------------

export type Danger = 1 | 2 | 3 | 4 | 5;
type BaseId = 'm1' | 'm2' | 'm3' | 'm5' | 'm8' | 'm11' | 'm12' | 'dp1' | 'dp3' | 'dp4';
export interface TargetOption {
  title: string; what: string; city: string; base: BaseId; danger: Danger; station: StationId;
  weather?: Partial<Weather>; finale?: boolean;
}
export interface Stage { date: string; options: TargetOption[] }

const WINTER: Partial<Weather> = { preset: 'snow', mood: 'overcast', sunEl: 16, low: 0.86, high: 0.9, contrails: false };
const UNDERCAST: Partial<Weather> = { preset: 'clear', mood: 'overcast', sunEl: 22, low: 0.95, high: 0.35, contrails: true };
const op = (title: string, what: string, city: string, base: BaseId, danger: Danger, station: StationId, weather?: Partial<Weather>): TargetOption =>
  ({ title, what, city, base, danger, station, ...(weather ? { weather } : {}) });

// Eighth Air Force targets of autumn 1943 to spring 1944, in date order. The crew and the
// combat are fictional and compressed; dates and targets follow the historical raids.
export const SCHEDULE: Stage[] = [
  { date: '27 September 1943', options: [op('First Light over Emden', 'U-boat yards', 'Emden', 'm1', 1, 'waistL'), op('The Dutch Airfields', 'Fighter airfield', 'Woensdrecht', 'm1', 1, 'waistR')] },
  { date: '4 October 1943', options: [op('Frankfurt Morning', 'Propeller works', 'Frankfurt', 'm2', 2, 'top'), op('Saar Rail Yards', 'Marshalling yards', 'Saarbrücken', 'm1', 1, 'waistL')] },
  { date: '8 October 1943', options: [op('Bremen Docks', 'Port facilities', 'Bremen', 'm2', 2, 'top'), op('Vegesack', 'U-boat yards', 'Vegesack', 'm1', 2, 'waistR')] },
  { date: '9 October 1943', options: [op('The Baltic Run', 'Focke-Wulf plant', 'Marienburg', 'm11', 3, 'top'), op('Anklam', 'Arado aircraft works', 'Anklam', 'm2', 3, 'tail')] },
  { date: '10 October 1943', options: [op('Sunday at Münster', 'Rail yards', 'Münster', 'm3', 3, 'waistR')] },
  { date: '14 October 1943', options: [op('Black Thursday', 'Ball-bearing plants', 'Schweinfurt', 'm8', 5, 'ball')] },
  { date: '3 November 1943', options: [op('Through the Undercast', 'Port area', 'Wilhelmshaven', 'm2', 2, 'waistL', UNDERCAST)] },
  { date: '5 November 1943', options: [op('Gelsenkirchen', 'Synthetic oil plant', 'Gelsenkirchen', 'm3', 3, 'waistR'), op('Münster Again', 'Rail yards', 'Münster', 'm1', 2, 'tail')] },
  { date: '26 November 1943', options: [op('Bremen in the Clouds', 'Port facilities', 'Bremen', 'm2', 3, 'top', UNDERCAST), op('Paris Ball-Bearings', 'Ball-bearing works', 'Paris', 'm1', 2, 'waistL')] },
  { date: '1 December 1943', options: [op('Solingen', 'Industrial area', 'Solingen', 'm3', 3, 'waistR', WINTER)] },
  { date: '13 December 1943', options: [op('Kiel with the Mustangs', 'Naval yards', 'Kiel', 'm1', 3, 'tail', WINTER), op('Bremen Port Area', 'Port facilities', 'Bremen', 'm2', 3, 'top', UNDERCAST)] },
  { date: '22 December 1943', options: [op('Osnabrück', 'Marshalling yards', 'Osnabrück', 'm1', 3, 'waistL', WINTER), op('Christmas Week', 'Rail yards', 'Münster', 'm3', 3, 'ball')] },
  { date: '30 December 1943', options: [op('Flak Alley', 'Chemical works', 'Ludwigshafen', 'm3', 4, 'waistR')] },
  { date: '11 January 1944', options: [op('Oschersleben', 'Fighter assembly plant', 'Oschersleben', 'm12', 5, 'waistL', WINTER), op('Halberstadt', 'Junkers works', 'Halberstadt', 'm11', 4, 'top'), op('Brunswick', 'Aircraft works', 'Brunswick', 'm3', 4, 'tail', WINTER)] },
  { date: '29 January 1944', options: [op('Frankfurt by Radar', 'Industrial area', 'Frankfurt', 'm3', 3, 'waistR', UNDERCAST)] },
  { date: '4 February 1944', options: [op('Frankfurt Rail Yards', 'Marshalling yards', 'Frankfurt', 'm1', 3, 'ball', WINTER)] },
  { date: '20 February 1944', options: [op('Big Week: Leipzig', 'Aircraft assembly', 'Leipzig', 'dp3', 4, 'top'), op('Big Week: Brunswick', 'Aircraft works', 'Brunswick', 'm11', 4, 'waistL')] },
  { date: '22 February 1944', options: [op('Aschersleben', 'Junkers works', 'Aschersleben', 'm12', 4, 'waistR'), op('Bernburg', 'Aircraft works', 'Bernburg', 'm11', 4, 'tail')] },
  { date: '24 February 1944', options: [op('Schweinfurt Again', 'Ball-bearing plants', 'Schweinfurt', 'm5', 5, 'tail'), op('Gotha', 'Messerschmitt works', 'Gotha', 'm11', 5, 'top'), op('Rostock', 'Heinkel works', 'Rostock', 'm1', 3, 'waistL')] },
  { date: '25 February 1944', options: [op('Regensburg', 'Messerschmitt works', 'Regensburg', 'm11', 5, 'top'), op('Augsburg', 'Messerschmitt works', 'Augsburg', 'dp1', 5, 'waistL'), op('Stuttgart', 'Bearing works', 'Stuttgart', 'm3', 4, 'waistR')] },
  { date: '6 March 1944', options: [op('Big B', 'Industrial rail district', 'Berlin', 'dp4', 5, 'waistR')] },
  { date: '8 March 1944', options: [op('Erkner', 'Ball-bearing works', 'Berlin', 'dp4', 5, 'tail')] },
  { date: '22 March 1944', options: [op('Berlin by Daylight', 'Industrial area', 'Berlin', 'm12', 4, 'ball'), op('Oranienburg', 'Heinkel works', 'Oranienburg', 'm11', 4, 'top')] },
  { date: '11 April 1944', options: [op('Sorau', 'Focke-Wulf plant', 'Sorau', 'm12', 4, 'waistR'), op('Stettin', 'Aircraft works', 'Stettin', 'm11', 4, 'tail')] },
  { date: '24 April 1944', options: [{ ...op('Going Home', 'Dornier works', 'Friedrichshafen', 'm12', 5, 'waistL'), finale: true }] },
];

const BASES: Record<BaseId, Mission> = Object.fromEntries(
  [...CAMPAIGN, ...DEEP_PENETRATION].filter((m) => ['m1', 'm2', 'm3', 'm5', 'm8', 'm11', 'm12', 'dp1', 'dp3', 'dp4'].includes(m.id)).map((m) => [m.id, m]),
) as Record<BaseId, Mission>;

// Fighters in the air and their skill by danger; later in the tour they get a little sharper
const DANGER_ROUND: Record<Danger, { min: number; max: number; skill: [number, number]; rockets: number; flak: number }> = {
  1: { min: 4, max: 7, skill: [0.8, 1.0], rockets: 0, flak: 0.9 },
  2: { min: 5, max: 8, skill: [0.88, 1.08], rockets: 0.1, flak: 1.1 },
  3: { min: 5, max: 9, skill: [0.95, 1.15], rockets: 0.15, flak: 1.3 },
  4: { min: 6, max: 11, skill: [1.0, 1.22], rockets: 0.25, flak: 1.55 },
  5: { min: 7, max: 13, skill: [1.05, 1.3], rockets: 0.35, flak: 1.8 },
};
export const DANGER_LABEL: Record<Danger, string> = { 1: 'Milk run', 2: 'Light opposition', 3: 'Defended', 4: 'Heavily defended', 5: 'Deep penetration' };

export function effectiveDanger(stage: number, opt: TargetOption, maxEffort = false): Danger {
  return clamp(opt.danger + (maxEffort ? 1 : 0), 1, 5) as Danger;
}

/** Escort the date brings (CampaignState's baseline): none, to the border, or all the way. */
export function escortFor(date: string): 'none' | 'partial' | 'full' {
  const e = escortBaseline(date);
  return e >= 70 ? 'full' : e >= 40 ? 'partial' : 'none';
}

// ---------------- the crew ----------------

export const POSITIONS: CrewId[] = ['pilot', 'copilot', 'nav', 'bombardier', 'engineer', 'radio', 'ball', 'waistL', 'waistR', 'tail'];
export const POS_LABEL: Record<CrewId, string> = { pilot: 'Pilot', copilot: 'Co-Pilot', nav: 'Navigator', bombardier: 'Bombardier', engineer: 'Top Turret', radio: 'Radio Room', ball: 'Ball Turret', waistL: 'Left Waist', waistR: 'Right Waist', tail: 'Tail Gun' };
export const OFFICER = (p: CrewId) => p === 'pilot' || p === 'copilot' || p === 'nav' || p === 'bombardier';
export const ORIGINAL: Record<CrewId, ManId> = { pilot: 'brenner', copilot: 'doyle', nav: 'stern', bombardier: 'kessler', engineer: 'mendez', radio: 'gallo', ball: 'reilly', waistL: 'price', waistR: 'walsh', tail: 'dawson' };
export const RANKS = { enlisted: ['Sgt.', 'S/Sgt.', 'T/Sgt.'], officer: ['Lt.', 'Capt.', 'Maj.'] } as const;
const PROMOTE = { enlisted: [0, 6, 16], officer: [0, 12, 20] } as const;
// Replacements after the first one at each position (the first is CrewRoster's rookie there,
// whose name the recorded radio lines use)
const SPARE_OFFICERS = ['Whitfield', 'Delgado', 'Brennan', 'Lindqvist', 'Harlan', 'Mercer'];
const SPARE_ENLISTED = ['Jablonski', 'Moreno', "O'Neill", 'Petrakis', 'Sullivan', 'Carter', 'Henderson', 'Vance', 'Kowalczyk', 'Abbott'];
export const SHIP_NAMES = ['Second Chance', 'Lady Luck', 'Round Trip Ticket', 'Homeward Angel', 'Miss Deenethorpe', 'Last Ticket'];

export type ManStatus = 'fit' | 'wounded' | 'kia' | 'home' | 'missing' | 'done';
export interface TourMan {
  key: string;          // ManId for the original crew, 'r<n>' for replacements
  last: string;
  rank: number;         // index into RANKS.enlisted / RANKS.officer
  pos: CrewId;
  missions: number;     // credited missions he flew
  drill: number;        // practice flights (experience, not credit)
  status: ManStatus;
  out: number;          // missions he still misses while wounded
  wounds: number;
  medals: Record<string, number>;
  joined: number;       // credited tour missions when he joined (0 = original crew)
  left?: number;        // credited tour missions when he left the crew
}

export const rankName = (m: Pick<TourMan, 'pos' | 'rank'>) => (OFFICER(m.pos) ? RANKS.officer : RANKS.enlisted)[clamp(m.rank, 0, 2)];
/** "S/Sgt. Mendez": the English display name (ui/TourScreen.ts translates rank and name apart). */
export const manName = (m: Pick<TourMan, 'pos' | 'rank' | 'last'>) => `${rankName(m)} ${m.last}`;

function original(pos: CrewId): TourMan {
  const d = MEN.find((x) => x.id === ORIGINAL[pos])!;
  return { key: d.id, last: d.last, rank: d.rank === 'Capt.' ? 1 : 0, pos, missions: 0, drill: 0, status: 'fit', out: 0, wounds: 0, medals: {}, joined: 0 };
}

// ---------------- the ship ----------------

export const SHIP_ZONES = ['nose', 'cockpit', 'fuselageFwd', 'fuselageMid', 'fuselageAft', 'tail', 'engine1', 'engine2', 'engine3', 'engine4', 'wingL', 'wingLtip', 'wingR', 'wingRtip'] as const;
const CRITICAL = new Set(['cockpit', 'tail', 'wingL', 'wingR']);
export const ZONE_LABEL: Record<string, string> = {
  nose: 'Nose', cockpit: 'Cockpit', fuselageFwd: 'Forward fuselage', fuselageMid: 'Waist section', fuselageAft: 'Rear fuselage', tail: 'Tail',
  engine1: 'Engine 1', engine2: 'Engine 2', engine3: 'Engine 3', engine4: 'Engine 4', wingL: 'Left wing', wingLtip: 'Left wingtip', wingR: 'Right wing', wingRtip: 'Right wingtip',
};
export const REPAIR = 0.7;          // share of a sortie's damage the ground crew fixes overnight
export const ROUGH_ENGINE = 0.25;   // carried engine wear shown as "running rough"
export interface ShipState { name: string; serial: string; missions: number; patches: number; wear: Record<string, number> }

function newShip(name: string, r: () => number): ShipState {
  return { name, serial: `42-${31000 + Math.floor(r() * 8999)}`, missions: 0, patches: 0, wear: {} };
}

/** Zone strength (0..1) a mission starts with: the carried wear, never below a flyable floor. */
export function startHealth(zone: string, wear: number): number {
  return 1 - clamp(wear, 0, CRITICAL.has(zone) ? 0.4 : 0.6);
}
export const shipCondition = (s: ShipState) => {
  const w = SHIP_ZONES.reduce((a, z) => a + (s.wear[z] ?? 0), 0) / SHIP_ZONES.length;
  return clamp(Math.round(100 * (1 - w)), 0, 100);
};
export const roughEngines = (s: ShipState) => [1, 2, 3, 4].filter((i) => (s.wear[`engine${i}`] ?? 0) >= ROUGH_ENGINE);

// ---------------- state ----------------

export interface ReportLine { text: string; vars?: Record<string, string | number>; tone?: 'good' | 'bad' }
export interface TourReport { result: 'credited' | 'failed' | 'lost' | 'rest' | 'event'; title: string; lines: ReportLine[]; voice?: string }
export interface LogEntry { n: number; title: string; date: string; result: 'credited' | 'failed' | 'lost'; kills: number }

export interface TourState {
  v: 1;
  seed: number;
  done: number;         // credited missions (0..25)
  sorties: number;      // every sortie flown, credited or not
  morale: number;       // 5..100
  fatigue: number;      // 0..100
  ship: ShipState;
  lostShips: string[];
  crew: TourMan[];      // one man per position, POSITIONS order
  gone: TourMan[];      // killed, missing, sent home
  log: LogEntry[];
  event: string | null; // an event card waiting for the player's choice
  seen: string[];
  rested: boolean;      // a stand-down was taken since the last sortie
  maxEffort: boolean;   // the next mission is a maximum effort (danger +1, merit x1.5)
  player: { kills: number; medals: Record<string, number> };
  nextMan: number;
  complete: boolean;
  report: TourReport | null;
}

export function newTour(seed = 1 + Math.floor(Math.random() * 2147483646)): TourState {
  const r = rng(seed);
  return {
    v: 1, seed, done: 0, sorties: 0, morale: 70, fatigue: 0,
    ship: newShip(FIRST_SHIP, r), lostShips: [], crew: POSITIONS.map(original), gone: [], log: [],
    event: null, seen: [], rested: false, maxEffort: false, player: { kills: 0, medals: {} }, nextMan: 1, complete: false, report: null,
  };
}

export const stageOf = (s: TourState) => SCHEDULE[clamp(s.done, 0, TOUR_LENGTH - 1)];
export const manAt = (s: TourState, pos: CrewId) => s.crew.find((m) => m.pos === pos)!;
/** The man actually flying at a position next mission (null = a spare from the pool stands in). */
export const flyingAt = (s: TourState, pos: CrewId) => { const m = manAt(s, pos); return m.status === 'fit' ? m : null; };

// ---------------- the mission ----------------

/** A target flown as a variant of its base mission, re-dated, re-targeted and tuned to its danger. */
export function tourMission(s: TourState, stage: number, optIdx: number): Mission {
  const st = SCHEDULE[clamp(stage, 0, TOUR_LENGTH - 1)];
  const o = st.options[clamp(optIdx, 0, st.options.length - 1)];
  const src = BASES[o.base];
  const pristine = baseOf(src);
  const m: Mission = structuredClone({ ...src, bombers: pristine.bombers, maxBombersLost: pristine.maxBombersLost, objectives: pristine.objectives, escortArrive: pristine.escortArrive, round: pristine.round, waves: pristine.waves });
  const danger = effectiveDanger(stage, o, s.maxEffort && s.done === stage);
  const d = DANGER_ROUND[danger];
  const late = stage / (TOUR_LENGTH - 1);   // 0..1 through the tour
  const rounds = o.finale ? 4 : Math.max(2, Math.min(3, Number.isFinite(src.rounds ?? 2) ? src.rounds ?? 2 : 2));
  const duration = Math.round((m.round?.duration ?? 240) * (o.finale ? 1.1 : 1));
  const round: Round = {
    duration, start: m.round?.start ?? 7,
    min: d.min + Math.round(late), max: d.max + Math.round(late * 2),
    skill: [+(d.skill[0] + 0.06 * late).toFixed(3), +(d.skill[1] + 0.08 * late).toFixed(3)],
    rockets: d.rockets,
  };
  const esc = escortFor(st.date);
  const weather: Weather | undefined = o.weather ? { ...(m.weather ?? { sunEl: 30, sunAz: 190, low: 0.6, high: 0.5 }), ...o.weather, front: undefined } : m.weather;
  const maxLost = Math.max(5, Math.min(8, pristine.maxBombersLost ?? 6));
  Object.assign(m, {
    id: tourId(stage, optIdx), number: stage + 1, title: o.title, target: `${o.what}, ${o.city}`, date: st.date,
    role: 'gunner', station: o.station, playerDamaged: false, shuttle: false, waves: [],
    round, rounds, duration, maxBombersLost: maxLost, bombers: 12,
    boss: o.finale ? { first: rounds - 1 } : false,
    escortArrive: esc === 'full' ? Math.round(duration * 0.55) : esc === 'partial' ? Math.round(duration * 0.8) : undefined,
    flak: m.flak ? { ...m.flak, intensity: d.flak } : m.bombsAway !== undefined ? { start: Math.max(20, m.bombsAway - 45), end: m.bombsAway + 15, intensity: d.flak } : undefined,
    objectives: ['Defend the formation', o.finale ? 'Bring her home' : 'Survive the mission', `Lose no more than ${maxLost} bombers`],
    success: o.finale ? 'Twenty-five. Wheels down at Deenethorpe, and the crew climbs out for the last time. Tour complete.' : `Bombs on the ${o.what.toLowerCase()} at ${o.city}. Mission ${stage + 1} is in the books.`,
    briefing: tourBriefing(s, stage, o, danger),
    ...(weather ? { weather } : {}),
  } satisfies Partial<Mission>);
  return m;
}

const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five'];
export const numberWord = (n: number) => NUMBER_WORDS[clamp(Math.round(n), 1, 25) - 1];

const DANGER_BRIEF: Record<Danger, string> = {
  1: 'Intelligence expects light opposition: a few single-engine fighters near the coast. A milk run, if there is such a thing.',
  2: 'Expect fighters on the way in and out, and flak over the target. Keep the formation tight.',
  3: 'The target is well defended. Fighters will be waiting at the border, and the flak over the target is heavy.',
  4: 'This is a heavily defended target. Expect repeated attacks by single- and twin-engine fighters, with rockets from astern.',
  5: 'Deep penetration. Every fighter group in the Reich will be up, in relays, from the coast to the target and back. Some of us will not come home.',
};
const ESCORT_BRIEF = {
  none: 'There is no escort beyond the Dutch coast. From there on the formation is its own escort.',
  partial: 'Thunderbolts will take us as far as the German border. After that we are on our own until they meet us on the way home.',
  full: 'Mustangs will be with us all the way to the target. Hold out until the little friends arrive.',
} as const;

/** Briefing paragraphs: every one is a translatable template (i18n/ar/tour.ts). */
export function tourBriefing(s: TourState, stage: number, o: TargetOption, danger: Danger): string[] {
  const out: string[] = [];
  if (o.finale) {
    out.push('Mission twenty-five. When this one is over, the crew goes home.');
    out.push(`The target is the ${o.what.toLowerCase()} at ${o.city}, a long way south. The Luftwaffe knows the bombers are coming, and a battle group will meet us over the target.`);
  } else {
    out.push(`Mission ${stage + 1} of your tour. The group is going to ${o.city} today, and the target is the ${o.what.toLowerCase()}.`);
  }
  out.push(DANGER_BRIEF[danger]);
  out.push(ESCORT_BRIEF[escortFor(SCHEDULE[stage].date)]);
  const ship = s.ship;
  if (ship.patches > 0) out.push(`The ${ship.name} carries ${ship.patches} repair patches from earlier missions.`);
  else out.push(`The ${ship.name} is fresh from the depot. Treat her well.`);
  for (const e of roughEngines(ship)) out.push(`Number ${e} engine is running rough. The crew chief says she will hold.`);
  for (const p of POSITIONS) {
    const m = manAt(s, p);
    if (m.status === 'wounded') out.push(`${manName(m)} is in hospital. A spare man from the pool flies in his place.`);
  }
  const fresh = s.crew.filter((m) => m.status === 'fit' && m.joined > 0 && m.missions < 3);
  if (fresh.length) out.push(`${fresh.length === 1 ? 'One new man is' : `${fresh.length} new men are`} flying with the crew. Keep an eye on them.`);
  if (s.maxEffort && s.done === stage) out.push('Maximum effort: every ship that can fly goes today.');
  out.push(`You are on the ${POS_LABEL[stationCrew(o.station)].toLowerCase()} today. Use every position, one through five.`);
  return out;
}
const stationCrew = (st: StationId): CrewId => (st === 'top' ? 'engineer' : st);

// ---------------- sortie outcome ----------------

export interface SortieOutcome {
  success: boolean;
  kills: number;
  shipLost: boolean;           // shot down or ditched
  ditched?: boolean;
  wounded: CrewId[];           // positions hit this sortie (their man, if he flew)
  serious: CrewId[];           // of those, seriously
  escaped?: CrewId[];          // shot down: the positions that got out
  zones?: Record<string, number>; // zone strength 0..1 at the end (ship back home)
  danger?: Danger;
  title?: string;              // what was flown (for the log)
}

const AIR_MEDAL_AT = 5, CLUSTER_AT = [10, 15, 20], DFC_AT = TOUR_LENGTH;

/** Medals on the historical mission counts; returns the names of those awarded. */
function decorate(medals: Record<string, number>, missions: number): string[] {
  const out: string[] = [];
  const add = (name: string) => { medals[name] = (medals[name] ?? 0) + 1; out.push(name); };
  if (missions === AIR_MEDAL_AT) add('Air Medal');
  if (CLUSTER_AT.includes(missions)) add('Oak Leaf Cluster');
  if (missions === DFC_AT) add('Distinguished Flying Cross');
  return out;
}

function replacement(s: TourState, pos: CrewId, r: () => number): TourMan {
  const officer = OFFICER(pos);
  const used = new Set([...s.crew, ...s.gone].map((m) => m.last));
  const first = ROOKIES[pos].last;
  let last = first;
  if (used.has(last)) {
    const pool = officer ? SPARE_OFFICERS : SPARE_ENLISTED;
    const start = Math.floor(r() * pool.length);
    last = pool.map((_, i) => pool[(start + i) % pool.length]).find((n) => !used.has(n)) ?? `${pool[start]} ${s.nextMan}`;
  }
  return { key: `r${s.nextMan++}`, last, rank: 0, pos, missions: 0, drill: 0, status: 'fit', out: 0, wounds: 0, medals: {}, joined: s.done };
}

/**
 * One sortie's result applied to the tour. Pure: returns the new state and the report the
 * debrief shows. `rand` drives the wound/fate rolls (tests pass a seeded one).
 */
export function applySortie(s0: TourState, o: SortieOutcome, rand: () => number = Math.random): { state: TourState; report: TourReport } {
  if (s0.complete) return { state: s0, report: { result: 'failed', title: '', lines: [] } };   // the tour is over
  const s: TourState = structuredClone(s0);
  const lines: ReportLine[] = [];
  const stage = s.done;
  const credited = o.success;
  const lostShip = o.shipLost;
  const danger = o.danger ?? 3;
  s.sorties++;
  const ship = s.ship;
  const flew = new Set(s.crew.filter((m) => m.status === 'fit').map((m) => m.pos));

  // -- the result
  if (credited) lines.push({ text: 'Mission {n} of 25 credited.', vars: { n: stage + 1 }, tone: 'good' });
  else if (lostShip) lines.push({ text: o.ditched ? 'The {ship} went down in the sea. Air-Sea Rescue picked up the crew. The sortie is not credited.' : 'The {ship} was shot down. The sortie is not credited.', vars: { ship: ship.name }, tone: 'bad' });
  else lines.push({ text: 'The sortie is not credited. Mission {n} will be flown again.', vars: { n: stage + 1 }, tone: 'bad' });

  // -- wounds and deaths
  let kia = 0, hurt = 0;
  const fallen = new Set<CrewId>();
  for (const pos of new Set(o.wounded)) {
    if (!flew.has(pos)) continue;   // the spare standing in was hit, not our man
    const m = manAt(s, pos);
    m.wounds++; hurt++;
    m.medals['Purple Heart'] = (m.medals['Purple Heart'] ?? 0) + 1;
    if (o.serious.includes(pos)) {
      if (rand() < 0.2) { m.status = 'kia'; fallen.add(pos); lines.push({ text: '{who} died of his wounds.', vars: { who: manName(m) }, tone: 'bad' }); kia++; continue; }
      m.out = 2 + Math.floor(rand() * 3);
      if (m.out >= 4) { m.status = 'home'; fallen.add(pos); lines.push({ text: '{who} is badly wounded and is going home. Purple Heart.', vars: { who: manName(m) }, tone: 'bad' }); continue; }
      m.status = 'wounded';
      lines.push({ text: '{who} is seriously wounded: hospital for {n} missions. Purple Heart.', vars: { who: manName(m), n: m.out }, tone: 'bad' });
    } else if (rand() < 0.4) {
      lines.push({ text: '{who} was nicked by a splinter and stays on flying status. Purple Heart.', vars: { who: manName(m) } });
    } else {
      m.out = 1; m.status = 'wounded';
      lines.push({ text: '{who} is wounded and misses the next mission. Purple Heart.', vars: { who: manName(m) }, tone: 'bad' });
    }
  }
  // -- a lost ship: who got out
  if (lostShip && !o.ditched) {
    const out = new Set(o.escaped ?? POSITIONS);
    for (const pos of POSITIONS) {
      const m = manAt(s, pos);
      if (!flew.has(pos) || fallen.has(pos) || out.has(pos)) continue;
      m.status = rand() < 0.5 ? 'kia' : 'missing'; fallen.add(pos); kia++;
      lines.push({ text: m.status === 'kia' ? '{who} did not get out of the {ship}.' : '{who} is missing. Nobody saw a parachute.', vars: { who: manName(m), ship: ship.name }, tone: 'bad' });
    }
    lines.push({ text: 'The rest of the crew bailed out over the coast and is back at the base.', tone: 'good' });
  }

  // -- the ship
  if (lostShip) {
    s.lostShips.push(ship.name);
    const name = SHIP_NAMES.find((n) => !s.lostShips.includes(n) && n !== ship.name) ?? `${SHIP_NAMES[0]} ${s.lostShips.length + 1}`;
    s.ship = newShip(name, rng(s.seed + s.sorties * 7919));
    lines.push({ text: 'A replacement Fortress is assigned to the crew: the {ship}.', vars: { ship: s.ship.name }, tone: 'good' });
  } else {
    ship.missions++;
    let fresh = 0;
    for (const z of SHIP_ZONES) {
      const end = clamp(num(o.zones?.[z], startHealth(z, ship.wear[z] ?? 0)), 0, 1);
      const dmg = 1 - end;
      const was = 1 - startHealth(z, ship.wear[z] ?? 0);
      fresh += Math.max(0, dmg - was);
      ship.wear[z] = +(clamp(dmg * (1 - REPAIR) + (z.startsWith('engine') && dmg > 0.7 ? 0.15 : 0), 0, 0.6)).toFixed(3);
      if (ship.wear[z] < 0.01) delete ship.wear[z];
    }
    const patches = Math.round(fresh * 6);
    ship.patches += patches;
    if (patches) lines.push({ text: 'The ground crew put {n} new patches on the {ship}. She carries {total} now.', vars: { n: patches, ship: ship.name, total: ship.patches } });
    else lines.push({ text: 'The {ship} came home without a scratch.', vars: { ship: ship.name }, tone: 'good' });
    for (const e of roughEngines(ship)) lines.push({ text: 'Number {e} engine is still running rough.', vars: { e }, tone: 'bad' });
  }

  // -- credit, promotions and medals
  let promoted = 0;
  const awards: Record<string, string[]> = {};
  if (credited) {
    s.done++;
    for (const m of s.crew) {
      if (!flew.has(m.pos) || fallen.has(m.pos)) continue;
      m.missions++;
      const ladder = OFFICER(m.pos) ? PROMOTE.officer : PROMOTE.enlisted;
      const top = m.pos === 'copilot' || m.pos === 'nav' || m.pos === 'bombardier' ? 1 : 2;   // only the skipper makes major
      if (m.rank < top && m.missions >= ladder[m.rank + 1]) {
        const was = manName(m); m.rank++; promoted++;
        lines.push({ text: '{who} is promoted to {rank}.', vars: { who: was, rank: rankName(m) }, tone: 'good' });
      }
      for (const medal of decorate(m.medals, m.missions)) (awards[medal] ??= []).push(manName(m));
    }
    for (const medal of decorate(s.player.medals, s.done)) lines.push({ text: 'You are awarded the {medal}.', vars: { medal }, tone: 'good' });
    for (const [medal, who] of Object.entries(awards)) lines.push({ text: '{medal}: {who}', vars: { medal, who: who.join(', ') }, tone: 'good' });
  }
  s.player.kills += Math.max(0, Math.round(o.kills || 0));

  // -- the wounded heal, the fallen are replaced
  for (const m of s.crew) if (m.status === 'wounded' && !flew.has(m.pos)) { m.out = Math.max(0, m.out - 1); if (m.out === 0) m.status = 'fit'; }
  for (const pos of POSITIONS) {
    const m = manAt(s, pos);
    if (m.status === 'fit' || m.status === 'wounded') continue;
    m.left = s.done;
    s.gone.push(m);
    const r = replacement(s, pos, rng(s.seed + s.sorties * 131 + POSITIONS.indexOf(pos)));
    s.crew[POSITIONS.indexOf(pos)] = r;
    lines.push({ text: '{who} joins the crew at the {post}.', vars: { who: manName(r), post: POS_LABEL[pos] } });
  }

  // -- morale and fatigue
  let mo = credited ? 3 : -7;
  if (credited && hurt === 0 && kia === 0) mo += 1;
  mo -= kia * 9 + hurt * 3 + (lostShip ? 8 : 0);
  mo += Math.min(3, promoted);
  if (credited && s.done === 12) mo += 3;
  const before = { mo: s.morale, fa: s.fatigue };
  s.morale = clamp(Math.round(s.morale + mo), 5, 100);
  // the days until the next mission rest the crew (none when the same target is flown again)
  const days = credited && s.done < TOUR_LENGTH ? Math.round((Date.parse(SCHEDULE[s.done].date + ' UTC') - Date.parse(SCHEDULE[stage].date + ' UTC')) / 86400000) : 1;
  s.fatigue = clamp(Math.round(s.fatigue + 6 + danger * 2 + (credited ? 0 : 4) + (lostShip ? 10 : 0) - Math.min(16, Math.max(1, days) * 2)), 0, 100);
  lines.push({ text: 'Crew morale {a}% → {b}%. Fatigue {c}% → {d}%.', vars: { a: before.mo, b: s.morale, c: before.fa, d: s.fatigue }, tone: s.morale >= before.mo ? 'good' : 'bad' });

  // -- the log, the next event
  s.log.push({ n: stage + 1, title: o.title ?? SCHEDULE[stage].options[0].title, date: SCHEDULE[stage].date, result: credited ? 'credited' : lostShip ? 'lost' : 'failed', kills: Math.max(0, Math.round(o.kills || 0)) });
  if (s.log.length > 60) s.log.splice(0, s.log.length - 60);
  s.maxEffort = false;
  s.rested = false;
  if (s.done >= TOUR_LENGTH) { s.complete = true; s.event = null; for (const m of s.crew) if (m.status === 'fit' || m.status === 'wounded') m.status = 'done'; }
  else s.event = drawEvent(s, rand);

  const voice = s.complete ? 'tour_home' : credited ? (s.done === 12 ? 'tour_half' : s.done === TOUR_LENGTH - 1 ? 'tour_last' : `tour_count_${s.done}`) : lostShip ? 'tour_lost' : 'tour_failed';
  const report: TourReport = { result: credited ? 'credited' : lostShip ? 'lost' : 'failed', title: o.title ?? '', lines, voice };
  s.report = report;
  return { state: s, report };
}

/** Between missions: rest instead of flying (once per gap). */
export function standDown(s0: TourState): TourState {
  if (s0.rested || s0.complete) return s0;
  const s = structuredClone(s0);
  s.rested = true;
  s.fatigue = clamp(s.fatigue - 20, 0, 100);
  s.morale = clamp(s.morale + 2, 5, 100);
  for (const m of s.crew) if (m.status === 'wounded') { m.out = Math.max(0, m.out - 1); if (m.out === 0) m.status = 'fit'; }
  s.report = { result: 'rest', title: 'Stand-down', lines: [{ text: 'The crew is stood down for a day. Fatigue {a}% → {b}%.', vars: { a: s0.fatigue, b: s.fatigue }, tone: 'good' }] };
  return s;
}

// ---------------- crew effectiveness ----------------

/** AI gunner multiplier from experience, morale and fatigue (World.aiGunnerFactor): ~0.6..1.1. */
export function crewFactor(s: TourState): number {
  const gunners: CrewId[] = ['engineer', 'radio', 'ball', 'waistL', 'waistR', 'tail'];
  let exp = 0;
  for (const p of gunners) { const m = flyingAt(s, p); exp += m ? Math.min(10, m.missions + m.drill * 2 + (m.joined === 0 ? 4 : 0)) / 10 : 0.1; }
  exp /= gunners.length;
  const f = (0.86 + 0.14 * exp) * (0.9 + 0.2 * s.morale / 100) * (1 - 0.3 * Math.max(0, s.fatigue - 50) / 50);
  return +f.toFixed(3);
}
export const moraleLabel = (v: number) => (v >= 75 ? 'In good heart' : v >= 50 ? 'Holding steady' : v >= 30 ? 'Shaken' : 'Breaking');
export const fatigueLabel = (v: number) => (v < 30 ? 'Fresh' : v < 55 ? 'Tired' : v < 80 ? 'Worn out' : 'Flak-happy');

// ---------------- mid-tour events ----------------

export interface EventFx { morale?: number; fatigue?: number; repair?: number; engine?: boolean; heal?: number; maxEffort?: boolean; drill?: number }
export interface EventChoice { label: string; result: string; fx: EventFx }
export interface TourEvent { id: string; title: string; text: string; choices: EventChoice[]; voice?: string; when?: (s: TourState) => boolean; fixed?: number }

const present = (key: ManId) => (s: TourState) => s.crew.some((m) => m.key === key && m.status === 'fit');
export const EVENTS: TourEvent[] = [
  { id: 'flakhouse', fixed: 12, voice: 'tour_flakhouse', title: 'Flak house', text: 'Halfway. The flight surgeon sends the crew to a rest home in the country for a week: real beds, real eggs and no interphone.',
    choices: [{ label: 'Pack your bags', result: 'A week of sleep. The crew comes back rested.', fx: { fatigue: -40, morale: 5, heal: 1 } }] },
  { id: 'mail', voice: 'tour_mail', title: 'Mail call', text: 'Letters and parcels from home reach the hut. Nobody says much for an hour.',
    choices: [{ label: 'Read your letters', result: 'The hut is quiet and warm. Morale rises.', fx: { morale: 6 } }] },
  { id: 'engine', title: 'A new engine', text: 'The crew chief has found a factory-fresh Wright Cyclone and wants to hang it on the {ship}.', when: (s) => roughEngines(s.ship).length > 0 || SHIP_ZONES.some((z) => z.startsWith('engine') && (s.ship.wear[z] ?? 0) > 0.1),
    choices: [{ label: 'Hang the new engine', result: 'The tired engine is replaced. She runs like a watch.', fx: { engine: true } }] },
  { id: 'pass', title: 'Forty-eight hour pass', text: 'The crew has a pass to London. The ground crew could use extra hands on the {ship}.',
    choices: [
      { label: 'Go to London', result: 'Two days in London. The crew comes back tired but happy.', fx: { fatigue: -15, morale: 6 } },
      { label: 'Stay and help the ground crew', result: 'Extra hands on the line. The {ship} is in better shape.', fx: { repair: 0.6, morale: 1, fatigue: -5 } },
    ] },
  { id: 'bunks', title: 'Empty bunks', text: 'The crew in the next hut did not come back yesterday. Their bunks were stripped this morning.', when: (s) => s.done >= 3,
    choices: [{ label: 'Carry on', result: 'Nobody talks much at breakfast.', fx: { morale: -6 } }] },
  { id: 'maxeffort', voice: 'tour_maxeffort', title: 'Maximum effort', text: 'Group orders a maximum effort: every ship that can fly goes next. The crew chief wants the {ship} on the ground for repairs.', when: (s) => s.done >= 4 && s.done < TOUR_LENGTH - 1,
    choices: [
      { label: 'Volunteer the {ship}', result: 'The {ship} is on the board. The danger is higher, and so is the merit.', fx: { maxEffort: true, morale: 3 } },
      { label: 'Ground her for repairs', result: 'The ground crew works through the night.', fx: { repair: 0.5, fatigue: -8, morale: -2 } },
    ] },
  { id: 'charm', title: 'Lucky charm', text: 'Sergeant Walsh has lost the rabbit\'s foot he keeps in his flak vest. He swears he will not fly without it.', when: present('walsh'),
    choices: [
      { label: 'Search the dispersal', result: 'Found it under his bunk. Walsh grins all the way to the briefing.', fx: { morale: 4, fatigue: 3 } },
      { label: 'Tell him luck is for the Luftwaffe', result: 'Walsh flies without it. He does not say a word all day.', fx: { morale: -3 } },
    ] },
  { id: 'fog', voice: 'tour_fog', title: 'Fogbound', text: 'Fog sits on the field for three days. Nobody flies, and everybody sleeps.',
    choices: [{ label: 'Sleep', result: 'Three quiet days.', fx: { fatigue: -15, heal: 1 } }] },
  { id: 'dance', title: 'Dance in the hangar', text: 'A band from the States plays in the big hangar tonight.',
    choices: [{ label: 'Go dancing', result: 'The crew dances until the band packs up.', fx: { morale: 5, fatigue: 2 } }] },
  { id: 'practice', title: 'Green replacements', text: 'The new men have never fired at a moving target. You could take them up for gunnery practice over the Wash.', when: (s) => s.crew.some((m) => m.joined > 0 && m.status === 'fit' && m.missions < 4),
    choices: [
      { label: 'Fly a practice flight', result: 'The new men can lead a target now.', fx: { drill: 1, fatigue: 5 } },
      { label: 'Let them rest', result: 'They will learn over Germany.', fx: {} },
    ] },
  { id: 'general', title: 'The general visits', text: 'A general is visiting the group. The {ship} must shine.',
    choices: [
      { label: 'Polish her', result: 'The general shakes every hand. The crew stands a little taller.', fx: { morale: 4, fatigue: 4 } },
      { label: 'Hide in the hangar', result: 'Nobody notices you were missing.', fx: {} },
    ] },
  { id: 'letters', title: 'Letters home', text: 'The skipper sits up late writing to the families of the men the crew has lost.', when: (s) => s.gone.some((m) => m.status === 'kia' || m.status === 'missing'),
    choices: [{ label: 'Help him write', result: 'It is the hardest thing the crew has done. They will fly the next one for them.', fx: { morale: 3, fatigue: 3 } }] },
  { id: 'armorers', title: 'Armorers\' work', text: 'The armorers have new barrels and fresh belts for every gun aboard the {ship}.',
    choices: [{ label: 'Test fire over the sea', result: 'Every gun runs clean.', fx: { morale: 3, drill: 1 } }] },
];
export const eventById = (id: string | null) => EVENTS.find((e) => e.id === id) ?? null;

function drawEvent(s: TourState, rand: () => number): string | null {
  const fixed = EVENTS.find((e) => e.fixed === s.done && !s.seen.includes(e.id));
  if (fixed) return fixed.id;
  if (rand() >= 0.5) return null;
  const recent = new Set(s.seen.slice(-6));
  const pool = EVENTS.filter((e) => e.fixed === undefined && !recent.has(e.id) && (!e.when || e.when(s)));
  return pool.length ? pool[Math.floor(rand() * pool.length)].id : null;
}

export function resolveEvent(s0: TourState, choice: number): TourState {
  const e = eventById(s0.event);
  if (!e) return s0;
  const c = e.choices[clamp(choice, 0, e.choices.length - 1)];
  const s = structuredClone(s0);
  const fx = c.fx;
  const before = { mo: s.morale, fa: s.fatigue };
  if (fx.morale) s.morale = clamp(s.morale + fx.morale, 5, 100);
  if (fx.fatigue) s.fatigue = clamp(s.fatigue + fx.fatigue, 0, 100);
  if (fx.repair) for (const z of Object.keys(s.ship.wear)) { s.ship.wear[z] = +(s.ship.wear[z] * (1 - fx.repair)).toFixed(3); if (s.ship.wear[z] < 0.01) delete s.ship.wear[z]; }
  if (fx.engine) {
    const worst = [1, 2, 3, 4].map((i) => `engine${i}`).sort((a, b) => (s.ship.wear[b] ?? 0) - (s.ship.wear[a] ?? 0))[0];
    delete s.ship.wear[worst];
  }
  if (fx.heal) for (const m of s.crew) if (m.status === 'wounded') { m.out = Math.max(0, m.out - fx.heal); if (m.out === 0) m.status = 'fit'; }
  if (fx.drill) for (const m of s.crew) if (m.joined > 0) m.drill += fx.drill;
  if (fx.maxEffort) s.maxEffort = true;
  s.seen.push(e.id);
  if (s.seen.length > 40) s.seen.splice(0, s.seen.length - 40);
  s.event = null;
  const lines: ReportLine[] = [{ text: c.result, vars: { ship: s.ship.name } }];
  if (s.morale !== before.mo || s.fatigue !== before.fa) lines.push({ text: 'Crew morale {a}% → {b}%. Fatigue {c}% → {d}%.', vars: { a: before.mo, b: s.morale, c: before.fa, d: s.fatigue }, tone: s.morale >= before.mo && s.fatigue <= before.fa ? 'good' : 'bad' });
  s.report = { result: 'event', title: e.title, lines };
  return s;
}

// ---------------- the finale ----------------

export interface FinaleSummary { sorties: number; kills: number; ships: string[]; patches: number; home: TourMan[]; fallen: TourMan[]; wounded: TourMan[]; medals: Record<string, number> }
export function finale(s: TourState): FinaleSummary {
  return {
    sorties: s.sorties, kills: s.player.kills, ships: [...s.lostShips, s.ship.name], patches: s.ship.patches,
    home: s.crew, fallen: s.gone.filter((m) => m.status === 'kia' || m.status === 'missing'), wounded: s.gone.filter((m) => m.status === 'home'),
    medals: s.player.medals,
  };
}

// ---------------- storage ----------------

const STATUSES: ManStatus[] = ['fit', 'wounded', 'kia', 'home', 'missing', 'done'];
function cleanMan(raw: any, pos: CrewId): TourMan | null {
  if (!raw || typeof raw !== 'object' || typeof raw.last !== 'string') return null;
  const medals: Record<string, number> = {};
  if (raw.medals && typeof raw.medals === 'object') for (const [k, v] of Object.entries(raw.medals)) if (typeof v === 'number' && v > 0) medals[k] = Math.floor(v);
  return {
    key: String(raw.key ?? 'r0'), last: raw.last.slice(0, 24), rank: clamp(Math.floor(num(raw.rank, 0)), 0, 2), pos: POSITIONS.includes(raw.pos) ? raw.pos : pos,
    missions: clamp(Math.floor(num(raw.missions, 0)), 0, TOUR_LENGTH), drill: clamp(Math.floor(num(raw.drill, 0)), 0, 20),
    status: STATUSES.includes(raw.status) ? raw.status : 'fit', out: clamp(Math.floor(num(raw.out, 0)), 0, 4), wounds: Math.max(0, Math.floor(num(raw.wounds, 0))),
    medals, joined: clamp(Math.floor(num(raw.joined, 0)), 0, TOUR_LENGTH), ...(raw.left !== undefined ? { left: clamp(Math.floor(num(raw.left, 0)), 0, TOUR_LENGTH) } : {}),
  };
}

export function sanitizeTour(raw: unknown): TourState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, any>;
  if (o.v !== 1) return null;
  const s = newTour(Math.max(1, Math.floor(num(o.seed, 1))));
  s.done = clamp(Math.floor(num(o.done, 0)), 0, TOUR_LENGTH);
  s.sorties = Math.max(s.done, Math.floor(num(o.sorties, 0)));
  s.morale = clamp(num(o.morale, 70), 5, 100);
  s.fatigue = clamp(num(o.fatigue, 0), 0, 100);
  if (o.ship && typeof o.ship === 'object') {
    s.ship.name = typeof o.ship.name === 'string' ? o.ship.name.slice(0, 32) : FIRST_SHIP;
    s.ship.serial = typeof o.ship.serial === 'string' ? o.ship.serial.slice(0, 12) : s.ship.serial;
    s.ship.missions = Math.max(0, Math.floor(num(o.ship.missions, 0)));
    s.ship.patches = clamp(Math.floor(num(o.ship.patches, 0)), 0, 999);
    s.ship.wear = {};
    if (o.ship.wear && typeof o.ship.wear === 'object') for (const z of SHIP_ZONES) { const w = num(o.ship.wear[z], 0); if (w > 0) s.ship.wear[z] = clamp(w, 0, 0.6); }
  }
  s.lostShips = Array.isArray(o.lostShips) ? o.lostShips.filter((n: unknown) => typeof n === 'string').slice(-10) : [];
  if (Array.isArray(o.crew)) s.crew = POSITIONS.map((p, i) => cleanMan(o.crew.find((m: any) => m?.pos === p) ?? o.crew[i], p) ?? original(p));
  s.gone = Array.isArray(o.gone) ? o.gone.map((m: any) => cleanMan(m, POSITIONS.includes(m?.pos) ? m.pos : 'waistL')).filter((m: TourMan | null): m is TourMan => !!m).slice(-40) : [];
  s.log = Array.isArray(o.log) ? o.log.filter((l: any) => l && typeof l.title === 'string').slice(-60).map((l: any) => ({ n: clamp(Math.floor(num(l.n, 1)), 1, TOUR_LENGTH), title: l.title, date: String(l.date ?? ''), result: ['credited', 'failed', 'lost'].includes(l.result) ? l.result : 'failed', kills: Math.max(0, Math.floor(num(l.kills, 0))) })) : [];
  s.event = typeof o.event === 'string' && eventById(o.event) ? o.event : null;
  s.seen = Array.isArray(o.seen) ? o.seen.filter((x: unknown) => typeof x === 'string').slice(-40) : [];
  s.rested = !!o.rested;
  s.maxEffort = !!o.maxEffort;
  s.player = { kills: Math.max(0, Math.floor(num(o.player?.kills, 0))), medals: {} };
  if (o.player?.medals && typeof o.player.medals === 'object') for (const [k, v] of Object.entries(o.player.medals)) if (typeof v === 'number' && v > 0) s.player.medals[k] = Math.floor(v);
  s.nextMan = Math.max(1, Math.floor(num(o.nextMan, 1)));
  s.complete = s.done >= TOUR_LENGTH;
  const r = o.report;
  s.report = r && typeof r === 'object' && Array.isArray(r.lines) ? { result: r.result, title: String(r.title ?? ''), voice: typeof r.voice === 'string' ? r.voice : undefined, lines: r.lines.filter((l: any) => l && typeof l.text === 'string').map((l: any) => ({ text: l.text, vars: l.vars && typeof l.vars === 'object' ? l.vars : undefined, tone: l.tone === 'good' || l.tone === 'bad' ? l.tone : undefined })) } : null;
  return s;
}

export function loadTour(): TourState | null {
  try { return typeof localStorage === 'undefined' ? null : sanitizeTour(JSON.parse(localStorage.getItem(TOUR_KEY) ?? 'null')); } catch { return null; }
}
export function saveTour(s: TourState | null) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (s) localStorage.setItem(TOUR_KEY, JSON.stringify(s)); else localStorage.removeItem(TOUR_KEY);
  } catch { /* storage unavailable */ }
}
