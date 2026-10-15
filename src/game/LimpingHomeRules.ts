// Limping home (Phase 11 goal 12): the pure rules behind a damaged B-17's return leg.
// LimpingHome.ts runs the leg in the game; everything here is plain data and maths (tests/limpingHome.test.ts).
//
// The leg is narrative geography on top of the compressed mission: no real route exists in World, so the
// distances below are estimates that only have to be consistent with each other and with the fuel model.

export type LimpChoice = 'home' | 'divert' | 'ditch' | 'neutral';
export type Neutral = 'Sweden' | 'Switzerland';

/** Fuel is a fraction of the full tanks. A sound ship starts the return leg with about a third left. */
export const FUEL = {
  start: 0.34,        // at the start of the return leg, nothing leaking
  leakLoss: 0.07,     // already lost through the holes by the time the crew checks the gauges
  engineLoss: 0.03,   // per dead engine: the cross-feed and the drag of a windmilling prop
  leakPerS: 0.0015,   // per second while a tank is still leaking
  engineDrag: 0.12,   // each dead engine makes the rest burn this much more per kilometre
} as const;

/** Seconds of game time the crew flies each choice for, and the fuel it needs on four good engines. */
export const ROUTE: Record<LimpChoice, { time: number; need: number; km: number }> = {
  home: { time: 42, need: 0.24, km: 420 },     // stay with the box, back to the home field
  divert: { time: 36, need: 0.17, km: 330 },   // straight for the emergency strip on the English coast
  neutral: { time: 30, need: 0.06, km: 140 },  // the nearest neutral border
  ditch: { time: 20, need: 0.07, km: 120 },    // as far as the sea, Mayday with a fix, then put her down
};
/** The crew talks for this long before the gunner is asked; the decision waits this long for a vote. */
export const ASK_AT = 6;
export const DECIDE_TIME = 15;
/** The player's vote counts as this many crew votes: the crew listens to the gunner. */
export const PLAYER_WEIGHT = 3;
export const CHOICE_KEYS = ['Digit7', 'Digit8', 'Digit9', 'Digit0'] as const;
/** German fighters look for stragglers at these leg times (s), one pair each; none over neutral air. */
export const HUNTER_TIMES = [12, 30, 50] as const;

export const NEUTRAL_KM: Record<Neutral, number> = { Sweden: 160, Switzerland: 130 };
const NORTH = /bremen|kiel|hamburg|wilhelmshaven|berlin|oschersleben|rostock|stettin|anklam|marienburg|gdynia|leipzig|merseburg/i;
const SOUTH = /regensburg|schweinfurt|augsburg|stuttgart|friedrichshafen|munich|münchen|ludwigshafen|mannheim|frankfurt|nuremberg|nürnberg|ulm/i;
/** The neutral country a crippled crew could reach from this target, or none (targets near the coast). */
export function neutralFor(target: string): Neutral | null {
  if (NORTH.test(target)) return 'Sweden';
  if (SOUTH.test(target)) return 'Switzerland';
  return null;
}

export interface LimpTrigger {
  campaign: boolean; gunner: boolean; coop: boolean; alive: boolean;
  enginesOut: number; initialEnginesOut: number;
  integrity: number; initialIntegrity: number;
  leaking: boolean;
}
/** The return leg becomes a decision when the ship is hurt worse than she started: an engine gone with
 *  a leaking tank, two engines gone, or the airframe badly shot up. A sound ship just lands. */
export function limpingDue(s: LimpTrigger): boolean {
  if (!s.campaign || !s.gunner || s.coop || !s.alive) return false;
  const lost = s.enginesOut - s.initialEnginesOut;
  if (s.enginesOut >= 4) return false;   // nothing to decide: she is going down
  return (s.leaking && s.enginesOut >= 1) || lost >= 2 || (s.leaking && lost >= 1) || s.integrity < Math.min(0.45, s.initialIntegrity - 0.2);
}

export interface LimpState {
  fuel: number;          // tanks fraction now
  enginesOut: number;
  leaking: boolean;
  wounded: number;       // wounded crewmen aboard (cold water is deadly for them)
  neutral: Neutral | null;
  straggling: boolean;   // already out of the formation
}
export function startFuel(leaking: boolean, enginesOut: number): number {
  return Math.max(0.05, FUEL.start - (leaking ? FUEL.leakLoss : 0) - FUEL.engineLoss * enginesOut);
}
/** Fuel burned per second flying `choice` (route share plus whatever is pouring out of the holes). */
export function burnRate(choice: LimpChoice, enginesOut: number, leaking: boolean): number {
  const r = ROUTE[choice];
  const route = (r.need / r.time) * (1 + FUEL.engineDrag * enginesOut);
  return route + (leaking ? FUEL.leakPerS : 0);
}
/** Fuel left on arrival (negative: the tanks run dry first). */
export function fuelMargin(choice: LimpChoice, s: Pick<LimpState, 'fuel' | 'enginesOut' | 'leaking'>): number {
  return s.fuel - burnRate(choice, s.enginesOut, s.leaking) * ROUTE[choice].time;
}
/** What the crew can be asked. Home means keeping station: impossible once she can't keep up. */
export function options(s: LimpState): LimpChoice[] {
  const out: LimpChoice[] = [];
  if (!s.straggling && s.enginesOut < 2) out.push('home');
  out.push('divert');
  if (s.neutral) out.push('neutral');
  out.push('ditch');
  return out;
}

export type CrewSeat = 'Pilot' | 'Co-Pilot' | 'Navigator' | 'Bombardier' | 'Engineer' | 'Radio' | 'Ball Turret' | 'Tail' | 'Waist';
/** Each man weighs the same facts his own way. `caution` is the fuel he wants to land with (negative: a
 *  gambler); `lean` is what he thinks of each choice, on the same scale as VALUE below, so a man's
 *  personality decides whenever the gauges leave room for doubt. */
export const CREW_BIAS: Record<CrewSeat, { caution: number; lean: Partial<Record<LimpChoice, number>> }> = {
  'Pilot': { caution: 0.02, lean: { home: 0.06, divert: 0.06, neutral: -0.2 } },     // his ship, his crew, his war
  'Co-Pilot': { caution: 0.02, lean: { divert: 0.08, neutral: -0.08 } },             // follows the pilot
  'Navigator': { caution: 0.03, lean: {} },                                            // goes by the numbers
  'Bombardier': { caution: -0.03, lean: { home: 0.1, divert: 0.06, neutral: -0.1 } }, // wants his 25 missions
  'Engineer': { caution: 0.09, lean: {} },                                             // he reads the gauges
  'Radio': { caution: 0.03, lean: { ditch: 0.15 } },                                   // trusts Air-Sea Rescue
  'Ball Turret': { caution: 0.03, lean: { ditch: -0.2 } },                             // the ball fills first
  'Tail': { caution: 0.04, lean: { neutral: 0.12 } },                                  // has had enough of the war
  'Waist': { caution: 0.03, lean: { neutral: 0.05, ditch: -0.05 } },                   // solid ground under him
};
export const CREW_SEATS = Object.keys(CREW_BIAS) as CrewSeat[];

/** What each ending is worth to a crewman before his own leanings: an English runway is everything, a
 *  neutral field is safe but ends the war for them, a planned ditching is cold water and a dinghy, and
 *  running dry on the way is the worst of all (an unplanned ditching, or worse). */
export const VALUE = { england: 1, neutral: 0.55, ditch: 0.52, dry: 0.3, perWounded: 0.08, straggler: -0.15, box: 0.05 } as const;
/** How sure a man is of making `choice`: one half when the margin is exactly the fuel he wants to keep,
 *  certain 4 % above it, hopeless 4 % below. */
export function reach(choice: LimpChoice, s: LimpState, caution: number): number {
  return Math.max(0, Math.min(1, 0.5 + (fuelMargin(choice, s) - caution) / 0.08));
}
export function utility(choice: LimpChoice, s: LimpState, seat: CrewSeat): number {
  const b = CREW_BIAS[seat];
  const p = reach(choice, s, b.caution);
  const lean = b.lean[choice] ?? 0;
  const made = choice === 'ditch' ? VALUE.ditch - VALUE.perWounded * s.wounded : choice === 'neutral' ? VALUE.neutral : VALUE.england;
  let u = p * made + (1 - p) * VALUE.dry;
  if (choice === 'home') u += s.straggling ? VALUE.straggler : VALUE.box;   // the box's guns, or alone at its pace
  return u + lean;
}
export function crewVote(s: LimpState, seat: CrewSeat, opts = options(s)): LimpChoice {
  let best = opts[0], bu = -Infinity;
  for (const c of opts) { const u = utility(c, s, seat); if (u > bu) { bu = u; best = c; } }
  return best;
}
export interface Tally { votes: Record<LimpChoice, number>; voters: Record<LimpChoice, CrewSeat[]> }
export function tally(s: LimpState, opts = options(s)): Tally {
  const votes = { home: 0, divert: 0, ditch: 0, neutral: 0 }, voters = { home: [], divert: [], ditch: [], neutral: [] } as Record<LimpChoice, CrewSeat[]>;
  for (const seat of CREW_SEATS) { const v = crewVote(s, seat, opts); votes[v]++; voters[v].push(seat); }
  return { votes, voters };
}
/** Choices that end the tour (internment) need more than half of all the hands, the gunner's included. */
export const TOUR_ENDING: readonly LimpChoice[] = ['neutral'];
export const majorityNeeded = (voted: boolean) => Math.floor((CREW_SEATS.length + (voted ? PLAYER_WEIGHT : 0)) / 2) + 1;
/** The crew decides by show of hands with the gunner's vote weighted; the pilot breaks a tie. Internment
 *  is never the silent default: without the gunner's vote the crew won't take itself out of the war, and
 *  with it, it needs a clear majority. Otherwise its hands go to each man's next choice and the most hands win. */
export function decide(s: LimpState, player: LimpChoice | null, opts = options(s)): LimpChoice {
  const t = tally(s, opts);
  const voted = !!player && opts.includes(player);
  if (voted) t.votes[player!] += PLAYER_WEIGHT;
  const allowed = (c: LimpChoice) => !TOUR_ENDING.includes(c) || (voted && t.votes[c] >= majorityNeeded(true));
  for (const c of opts) if (TOUR_ENDING.includes(c) && allowed(c)) return c;
  // no majority for internment: those hands go to each man's next choice
  const open = opts.filter((c) => !TOUR_ENDING.includes(c));
  for (const c of opts) if (!open.includes(c)) for (const seat of t.voters[c]) t.votes[crewVote(s, seat, open)]++;
  const pilot = crewVote(s, 'Pilot', open);
  let best = pilot;
  for (const c of open) if (t.votes[c] > t.votes[best]) best = c;
  return best;
}

/** Narrative distances shown on the card (km): they shrink as the leg is flown. */
export function distanceLeft(choice: LimpChoice, flown: number, neutral: Neutral | null): number {
  const total = choice === 'neutral' ? (neutral ? NEUTRAL_KM[neutral] : 0) : ROUTE[choice].km;
  const r = ROUTE[choice];
  return Math.max(0, Math.round(total * (1 - Math.min(1, flown / Math.max(1, r.time)))));
}

export const LIMP_TEXT = {
  title: 'LIMPING HOME', sub: 'Badly damaged, and a long way from England',
  fuel: 'Fuel', leak: 'fuel leak', engines: 'Engines {n} of 4', behind: 'falling behind the formation',
  ask: 'CREW DECISION · where do we take her?', yourVote: 'Your vote: {choice}', crewDecided: 'Crew decision: {choice}',
  votes: '{n} votes', vote1: '1 vote', you: 'You ×{n}', majority: 'Internment needs {n} of {total} votes', press: 'Press {keys} to vote · {s} s', tap: 'Tap a choice to vote · {s} s',
  home: 'Home with the formation', divert: 'Emergency field · RAF Woodbridge', ditch: 'Ditch in the Channel · Air-Sea Rescue',
  Sweden: 'Neutral Sweden · interned', Switzerland: 'Neutral Switzerland · interned',
  kmTo: '{km} km to go', dry: 'Tanks dry',
  divertReason: 'Objectives met. Diverted to the emergency field at RAF Woodbridge on failing engines.',
  internTag: 'INTERNED', internSweden: 'Landed in neutral Sweden. Bomber and crew interned; the tour is over.',
  internSwitzerland: 'Landed in neutral Switzerland. Bomber and crew interned; the tour is over.',
  internNote: 'Interned in a neutral country · the crew sits out the war · the tour ends here',
  tourEnded: 'Tour ended · interned', tourOver: 'The crew is interned. The tour is over; the campaign summary is ready.',
  newTourOnly: 'An interned crew cannot volunteer for a second tour. Begin a new tour.',
} as const;
export const choiceLabel = (c: LimpChoice, n: Neutral | null) => c === 'neutral' ? LIMP_TEXT[n ?? 'Switzerland'] : LIMP_TEXT[c];
export const internReason = (n: Neutral) => n === 'Sweden' ? LIMP_TEXT.internSweden : LIMP_TEXT.internSwitzerland;

/** Radio lines (speaker, text). Unrecorded: they play as interphone subtitles with the speech fallback. */
export const LIMP_RADIO = {
  start: ['Pilot', "Pilot to crew: she's hurt bad. Engineer, give me a fuel check."],
  leak: ['Engineer', "We're losing gas from a holed tank. I'm transferring what I can."],
  noLeak: ['Engineer', 'Tanks are holding, but the dead engines are costing us.'],
  behind: ['Co-Pilot', "We can't hold formation. We're dropping behind the box."],
  ask: ['Pilot', 'Navigator, give me the options. Gunner, you get a vote too.'],
  home: ['Pilot', "We stay with the box. Close up and keep those guns hot."],
  divert: ['Navigator', 'New heading for Woodbridge. Their emergency strip is three miles long.'],
  neutral: ['Pilot', "We'll never make England. Heading for the neutral border. Burn the papers."],
  ditch: ['Radio', 'Mayday, Mayday. Position fixed and sent. Air-Sea Rescue is on the way.'],
  hunters: ['Tail', 'Fighters at six! They have spotted a straggler!'],
  dry: ['Engineer', "Engines are starving, the tanks are dry! We're going in the water!"],
  border: ['Navigator', "We're over neutral territory. Their fighters are rocking their wings: follow them down."],
  coast: ['Navigator', 'English coast dead ahead. Air-Sea Rescue has us on the plot.'],
} as const;
