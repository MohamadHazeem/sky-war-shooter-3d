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
  leakLoss: 0.1,     // already lost through the holes by the time the crew checks the gauges
  engineLoss: 0.03,   // per dead engine: the cross-feed and the drag of a windmilling prop
  leakPerS: 0.002,   // per second while a tank is still leaking
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
/** Each man weighs the same facts his own way. `caution` is the fuel he wants to land with; `lean` is his
 *  personality, sized like the fuel terms in utility() (about 0.1–0.2) so it decides the close calls. */
export const CREW_BIAS: Record<CrewSeat, { caution: number; lean: Partial<Record<LimpChoice, number>> }> = {
  'Pilot': { caution: 0.02, lean: { home: 0.1, divert: 0.12, neutral: -0.2 } },        // his ship: he wants her in England
  'Co-Pilot': { caution: 0.03, lean: { divert: 0.08, neutral: 0.06 } },               // a wife at home: he wants them all alive
  'Navigator': { caution: 0.04, lean: {} },                                            // goes by the numbers
  'Bombardier': { caution: 0, lean: { home: 0.12, divert: 0.16, ditch: -0.06 } },      // a gambler: "she'll make it"
  'Engineer': { caution: 0.08, lean: { neutral: 0.12, divert: -0.04 } },               // reads the gauges, wants dry land
  'Radio': { caution: 0.04, lean: { ditch: 0.18, neutral: -0.04 } },                   // has the Mayday drill and the fix
  'Ball Turret': { caution: 0.03, lean: { ditch: -0.18, neutral: 0.12 } },             // the ball fills first
  'Tail': { caution: 0.04, lean: { neutral: 0.16, home: -0.04 } },                     // has had enough of the war
  'Waist': { caution: 0.03, lean: { ditch: 0.1, divert: 0.04 } },                      // a swimmer, wants England
};
export const CREW_SEATS = Object.keys(CREW_BIAS) as CrewSeat[];

/** How well a route's fuel works out for a man who wants `caution` left over. Short of fuel is a gamble,
 *  not a death sentence: a ship that runs dry on the way to England ditches in the North Sea instead. */
function reach(margin: number): number {
  return margin >= 0 ? 0.1 + Math.min(0.1, margin) : 0.1 + 3 * margin;
}
/** How good one choice looks to one crewman. Fuel to spare, then the ending: England beats everything,
 *  the sea is cold and the wounded may not survive it, and internment ends the war for the whole crew.
 *  Where England is clearly in reach the sea and internment are poor choices; where it isn't, the leans
 *  of the nine men decide (so a borderline ship splits the crew and the gunner's vote counts). */
export function utility(choice: LimpChoice, s: LimpState, seat: CrewSeat): number {
  const b = CREW_BIAS[seat];
  const lean = b.lean[choice] ?? 0;
  const england = Math.max(fuelMargin('home', s), fuelMargin('divert', s)) - b.caution;
  const spare = Math.max(0, Math.min(0.1, england));   // how comfortably England is in reach for him
  let u = reach(fuelMargin(choice, s) - b.caution);
  if (choice === 'home') u += s.straggling ? -0.1 : 0.14;        // the box's guns
  if (choice === 'divert') u += 0.08;                            // a long runway, shorter over enemy air
  if (choice === 'ditch') u += -0.07 - 0.06 * s.wounded - (england >= 0 ? 0.12 + spare : 0);
  if (choice === 'neutral') u += -0.12 - (england >= 0 ? 0.12 + spare : 0);
  return u + lean;
}
export function crewVote(s: LimpState, seat: CrewSeat, opts = options(s)): LimpChoice {
  let best = opts[0], bu = -Infinity;
  for (const c of opts) { const u = utility(c, s, seat); if (u > bu) { bu = u; best = c; } }
  return best;
}
export interface Tally { votes: Record<LimpChoice, number>; voters: Record<LimpChoice, CrewSeat[]>; seat: Record<CrewSeat, LimpChoice> }
export function tally(s: LimpState, opts = options(s)): Tally {
  const votes = { home: 0, divert: 0, ditch: 0, neutral: 0 }, voters = { home: [], divert: [], ditch: [], neutral: [] } as Record<LimpChoice, CrewSeat[]>;
  const seat = {} as Record<CrewSeat, LimpChoice>;
  for (const k of CREW_SEATS) { const v = seat[k] = crewVote(s, k, opts); votes[v]++; voters[v].push(k); }
  return { votes, voters, seat };
}
/** Choices that end the tour (internment) need the gunner's own vote and a clear majority of all hands. */
export const TOUR_ENDING: readonly LimpChoice[] = ['neutral'];
export const ALL_HANDS = CREW_SEATS.length + PLAYER_WEIGHT;
/** The crew decides by show of hands with the gunner's vote weighted; the pilot breaks a tie. A choice
 *  that ends the tour is never the silent default: it needs the gunner's vote and more than half of all
 *  hands (7 of 12), otherwise the crew takes its best other choice. */
export function decide(s: LimpState, player: LimpChoice | null, opts = options(s)): LimpChoice {
  const t = tally(s, opts);
  if (player && opts.includes(player)) t.votes[player] += PLAYER_WEIGHT;
  else player = null;
  const allowed = (c: LimpChoice) => !TOUR_ENDING.includes(c) || (player === c && t.votes[c] * 2 > ALL_HANDS);
  const pilot = crewVote(s, 'Pilot', opts);
  let best: LimpChoice | null = allowed(pilot) ? pilot : null;
  for (const c of opts) if (allowed(c) && (best === null || t.votes[c] > t.votes[best])) best = c;
  return best ?? opts[opts.length - 1];
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
  votes: '{n} votes', vote1: '1 vote', press: 'Press {keys} to vote · {s} s', tap: 'Tap a choice to vote · {s} s',
  home: 'Home with the formation', divert: 'Emergency field · RAF Woodbridge', ditch: 'Ditch in the Channel · Air-Sea Rescue',
  Sweden: 'Neutral Sweden · interned', Switzerland: 'Neutral Switzerland · interned',
  kmTo: '{km} km to go', dry: 'Tanks dry',
  // short names for the per-man votes on the card ("Engineer: Woodbridge")
  shortHome: 'Home field', shortDivert: 'Woodbridge', shortDitch: 'Channel', shortSweden: 'Sweden', shortSwitzerland: 'Switzerland',
  crewVotes: 'How the crew votes', seatVote: '{seat}: {choice}', you: 'You (gunner)', undecided: 'not voted',
  majority: 'Internment needs your vote and {n} of {all} hands',
  divertReason: 'Objectives met. Diverted to the emergency field at RAF Woodbridge on failing engines.',
  internTag: 'INTERNED', internSweden: 'Landed in neutral Sweden. Bomber and crew interned; the tour is over.',
  internSwitzerland: 'Landed in neutral Switzerland. Bomber and crew interned; the tour is over.',
  internNote: 'Interned in a neutral country · the crew sits out the war · the tour ends here',
  tourEnded: 'Tour ended · interned', tourOver: 'The crew is interned. The tour is over; the campaign summary is ready.',
  newTourOnly: 'An interned crew cannot volunteer for a second tour. Begin a new tour.',
} as const;
export const choiceLabel = (c: LimpChoice, n: Neutral | null) => c === 'neutral' ? LIMP_TEXT[n ?? 'Switzerland'] : LIMP_TEXT[c];
export const shortLabel = (c: LimpChoice, n: Neutral | null) =>
  c === 'home' ? LIMP_TEXT.shortHome : c === 'divert' ? LIMP_TEXT.shortDivert : c === 'ditch' ? LIMP_TEXT.shortDitch : n === 'Sweden' ? LIMP_TEXT.shortSweden : LIMP_TEXT.shortSwitzerland;
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
