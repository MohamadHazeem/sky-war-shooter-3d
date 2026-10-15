// Dynamic in-mission events (Phase 11 goal 28): a library of short, readable moments that make a
// gunner mission feel like a real raid: a near miss, a friendly bomber blowing up, chutes to count,
// radio jamming, an oxygen fire, a gunner freezing, a crippled Bf 109 pilot saluting, a lost Mustang
// joining up, an ammunition cook-off, a weather wall ahead and more.
//
// This file is pure data plus the director's rules (no three.js, unit-tested in
// tests/missionEvents.test.ts). Each event is a list of timed beats: a radio line (recorded clip in
// tools/voice/lines.d/28-mission-events.json, Arabic in i18n/ar/missionEvents.ts) and/or an action
// from a small vocabulary that game/MissionEvents.ts carries out in the world. Adding an event means
// adding an entry here (and its lines); no new code unless it needs a new action.
//
// Pacing (eventDue): gunner missions only, never during a boss fight, the final wave, a set piece, a
// random event or a bonus objective, never in the first 30 s of a mission or at either end of a round,
// one at a time with a 50-90 s gap, at most EV_MAX a mission. 'calm' events want a quiet sky,
// 'tense' ones tolerate a few fighters, 'loss' ones (a B-17 goes down) share the set pieces' loss
// budget so scripted losses never fail a mission.

export type EvTone = 'calm' | 'tense' | 'loss';
export type EvPhase = 'build' | 'breather' | 'mid';
/** World conditions an event needs (MissionEvents works them out once a second) */
export type EvNeed =
  | 'neighbour'     // a friendly B-17 close enough to the player's ship to see clearly
  | 'lossOk'        // the loss budget allows another scripted B-17 loss
  | 'clearSky'      // no weather front this mission, daylight, not already stormy
  | 'box'           // four or more other B-17s in the formation
  | 'aiGunner';     // a crew gun station the player isn't manning (it can go quiet)

export type EvAction =
  | 'slide' | 'slideBack'              // the subject B-17 drifts toward the player's ship / back to its slot
  | 'burn' | 'explode' | 'fall'        // the subject: fire pouring out / blows up / sinks out of the box burning, then spins in
  | 'chute'                            // a parachute from the subject (counted on the card)
  | 'countChutes'                      // the tail gunner calls the count (CHUTE_LINES)
  | 'smoke'                            // the subject trails smoke from an engine (arg: seconds)
  | 'cookoff'                          // rounds cooking off in the subject's waist (arg: seconds)
  | 'boxes'                            // ammunition boxes thrown out of the subject's waist window
  | 'flare'                            // a red flare fired from the subject
  | 'tracers'                          // a nervous gunner's burst from the subject passes over the player
  | 'brass'                            // spent casings rain from the subject (arg: seconds)
  | 'jam' | 'unjam'                    // radar + interphone jamming on / off
  | 'cabinFire'                        // flash and sparks in the player's radio room
  | 'freeze' | 'unfreeze'              // an AI crew gun goes quiet / comes back
  | 'salute' | 'peel'                  // a crippled Bf 109 slides up alongside / turns away
  | 'join' | 'release'                 // a lost P-51 slides in alongside / takes up escort duty
  | 'limper'                           // a damaged P-51 passes trailing coolant and turns for home
  | 'crosser' | 'bail'                 // a burning Fw 190 crosses ahead / its pilot bails out
  | 'flak'                             // a flak burst walking toward the ship (arg: step 0..3)
  | 'evade' | 'shake'                  // the pilot jinks / the ship is rocked (arg: strength)
  | 'yellowNoses' | 'sunBandits'       // fighters spawned: Fw 190s head-on / Bf 109s high
  | 'chaff'                            // the lead ship scatters radar foil (arg: seconds)
  | 'weather'                          // a storm wall across the route (a weather front)
  | 'tighten' | 'loosen'               // the box closes up / opens out again
  | 'drama';                           // a short drama shot of the subject (kill-cam rules)

export interface EvBeat {
  at: number;                  // s after the event starts
  say?: [speaker: string, text: string];
  act?: EvAction;
  arg?: number;
}

export interface MissionEventDef {
  id: string;
  title: string;               // card headline (short, upper-case on screen)
  sub: string;                 // card line: what is happening, in a few words
  tone: EvTone;
  phases: EvPhase[];           // round phases it may start in
  needs: EvNeed[];
  weight: number;              // relative pick weight
  dur: number;                 // s; the event ends (and cleans up) here
  beats: EvBeat[];
}

export const CHUTE_SPEAKER = 'Tail';
export const CHUTE_LINES = ['I count four chutes!', 'I count five chutes!', 'I count six chutes!'];

const ALL: EvPhase[] = ['build', 'breather', 'mid'];
const QUIET: EvPhase[] = ['build', 'breather'];

export const MISSION_EVENTS: MissionEventDef[] = [
  {
    id: 'nearMiss', title: 'Near miss', sub: 'A Fortress slides right at us', tone: 'tense', phases: ALL, needs: ['neighbour'], weight: 1.2, dur: 11,
    beats: [
      { at: 0, act: 'slide' },
      { at: 0.4, say: ['Tail', 'Watch it — she\'s sliding right into us!'] },
      { at: 2.1, act: 'evade' }, { at: 2.2, act: 'shake', arg: 0.5 },
      { at: 2.6, say: ['Pilot', 'Pulling up! Hang on!'] },
      { at: 4.5, act: 'slideBack' },
      { at: 6.5, say: ['Co-Pilot', 'Missed us by a wingspan. Somebody buy that pilot a drink.'] },
    ],
  },
  {
    id: 'friendlyExplodes', title: 'Fortress lost', sub: 'A B-17 takes a hit in the fuel tanks', tone: 'loss', phases: ALL, needs: ['lossOk'], weight: 0.9, dur: 13,
    beats: [
      { at: 0, act: 'burn', arg: 2.6 },
      { at: 0.3, say: ['Top Turret', 'Ship in the high squadron — she\'s hit in the fuel tanks!'] },
      { at: 1.2, act: 'drama' },
      { at: 2.6, act: 'explode' }, { at: 2.7, act: 'shake', arg: 0.4 },
      { at: 5.5, say: ['Pilot', 'No chutes. God rest them.'] },
      { at: 9.5, say: ['Navigator', 'Logging it. Keep your eyes outside, everybody.'] },
    ],
  },
  {
    id: 'bailout', title: 'Bail out', sub: 'Count the chutes', tone: 'loss', phases: ALL, needs: ['lossOk'], weight: 1, dur: 16,
    beats: [
      { at: 0, act: 'fall' },
      { at: 0.3, say: ['Pilot', 'She\'s going down — count the chutes, everybody!'] },
      { at: 1.5, act: 'drama' },
      { at: 3.4, act: 'chute' }, { at: 4.0, act: 'chute' }, { at: 4.7, act: 'chute' },
      { at: 5.3, act: 'chute' }, { at: 6.0, act: 'chute' }, { at: 6.8, act: 'chute' },
      { at: 10.5, act: 'countChutes' },
      { at: 13.5, say: ['Co-Pilot', 'Good. They\'ll sit the war out in a camp. Better than the alternative.'] },
    ],
  },
  {
    id: 'jamming', title: 'Radio jammed', sub: 'Radar and interphone full of static', tone: 'tense', phases: ALL, needs: [], weight: 1, dur: 17,
    beats: [
      { at: 0, act: 'jam' },
      { at: 0.3, say: ['Radio', 'They\'re jamming us — the whole band\'s gone to static!'] },
      { at: 6.5, say: ['Pilot', 'Interphone\'s weak. Call bandits by the clock — loud and clear!'] },
      { at: 14, act: 'unjam' },
      { at: 14.3, say: ['Radio', 'Signal\'s back. The jamming\'s off.'] },
    ],
  },
  {
    id: 'oxygenFire', title: 'Oxygen fire', sub: 'Fire in the radio room', tone: 'tense', phases: ALL, needs: [], weight: 1, dur: 12,
    beats: [
      { at: 0, act: 'cabinFire' }, { at: 0.1, act: 'shake', arg: 0.3 },
      { at: 0.3, say: ['Radio', 'Fire! The oxygen line\'s burning in the radio room!'] },
      { at: 2.4, act: 'cabinFire' },
      { at: 4, say: ['Top Turret', 'Extinguisher\'s on it — shut that oxygen valve!'] },
      { at: 5.2, act: 'cabinFire' },
      { at: 8.5, say: ['Radio', 'It\'s out. Lost a bottle, but it\'s out.'] },
    ],
  },
  {
    id: 'gunnerFreezes', title: 'Gunner frozen', sub: 'A waist gun has gone quiet', tone: 'tense', phases: ALL, needs: ['aiGunner'], weight: 0.9, dur: 13,
    beats: [
      { at: 0, act: 'freeze' },
      { at: 0.5, say: ['Top Turret', 'Waist gun\'s quiet — he\'s frozen up on the gun!'] },
      { at: 4.5, say: ['Pilot', 'Snap out of it, son! Get back on that gun!'] },
      { at: 10, act: 'unfreeze' },
      { at: 10.3, say: ['Waist', 'I\'m okay… I\'m back on it. Sorry, sir.'] },
    ],
  },
  {
    id: 'salute', title: 'No shot', sub: 'A crippled Bf 109 pulls alongside', tone: 'calm', phases: QUIET, needs: [], weight: 1.1, dur: 19,
    beats: [
      { at: 0, act: 'salute' },
      { at: 0.8, say: ['Tail', 'One-oh-nine sliding up on our tail — he\'s hit bad!'] },
      { at: 5.5, say: ['Waist', 'He\'s not shooting. He\'s right off our wing…'] },
      { at: 9, say: ['Pilot', 'He\'s saluting us. Hold your fire. Let him go.'] },
      { at: 13, act: 'peel' },
    ],
  },
  {
    id: 'lostMustang', title: 'Little friend', sub: 'A lost Mustang joins the formation', tone: 'calm', phases: QUIET, needs: [], weight: 1, dur: 17,
    beats: [
      { at: 0, act: 'join' },
      { at: 0.6, say: ['Blue Four', 'Big friend, this is a lost little friend. Mind if I tag along?'] },
      { at: 5, say: ['Pilot', 'Come on in, little friend. Glad to have you.'] },
      { at: 14, act: 'release' },
      { at: 14.3, say: ['Blue Four', 'Bandits high — I\'m on them!'] },
    ],
  },
  {
    id: 'cookOff', title: 'Cook-off', sub: 'Ammunition burning in a neighbour\'s waist', tone: 'tense', phases: ALL, needs: ['neighbour'], weight: 1, dur: 12,
    beats: [
      { at: 0, act: 'cookoff', arg: 8 },
      { at: 0.4, say: ['Ball Turret', 'Her waist ammo\'s cooking off — rounds going everywhere!'] },
      { at: 4, act: 'boxes' },
      { at: 4.6, say: ['Waist', 'They\'re throwing the boxes out the window!'] },
      { at: 9.2, say: ['Pilot', 'She\'s still flying. Tough old girl.'] },
    ],
  },
  {
    id: 'weatherWall', title: 'Weather ahead', sub: 'A storm wall across the route', tone: 'calm', phases: QUIET, needs: ['clearSky'], weight: 0.7, dur: 11,
    beats: [
      { at: 0, act: 'weather' },
      { at: 1.2, say: ['Navigator', 'Weather wall dead ahead — tops above thirty thousand. No way over it.'] },
      { at: 6.5, say: ['Pilot', 'Then we go through. Close it up and watch your spacing.'] },
    ],
  },
  {
    id: 'flakWalk', title: 'Flak tracking', sub: 'The bursts are walking toward us', tone: 'tense', phases: ALL, needs: [], weight: 1, dur: 12,
    beats: [
      { at: 0.2, say: ['Bombardier', 'Flak\'s tracking us — they\'ve got our altitude!'] },
      { at: 0.6, act: 'flak', arg: 0 }, { at: 1.7, act: 'flak', arg: 1 }, { at: 2.8, act: 'flak', arg: 2 },
      { at: 3.9, act: 'flak', arg: 3 }, { at: 4.0, act: 'shake', arg: 0.6 },
      { at: 4.4, act: 'evade' },
      { at: 4.6, say: ['Pilot', 'Changing altitude — hang on!'] },
      { at: 9, say: ['Navigator', 'That threw them off. The bursts are falling behind.'] },
    ],
  },
  {
    id: 'runawayProp', title: 'Runaway prop', sub: 'A neighbour fights a failing engine', tone: 'calm', phases: ALL, needs: ['neighbour'], weight: 0.8, dur: 11,
    beats: [
      { at: 0, act: 'smoke', arg: 8 },
      { at: 0.3, say: ['Co-Pilot', 'Ship off our wing — runaway prop, she\'s smoking bad!'] },
      { at: 5.5, say: ['Co-Pilot', 'She got it feathered. She\'s holding formation.'] },
    ],
  },
  {
    id: 'redFlares', title: 'Wounded aboard', sub: 'Red flares from a neighbour', tone: 'calm', phases: ALL, needs: ['neighbour'], weight: 0.8, dur: 10,
    beats: [
      { at: 0.4, act: 'flare' }, { at: 1.5, act: 'flare' },
      { at: 0.8, say: ['Tail', 'Red flares from the ship off our wing — wounded aboard!'] },
      { at: 5.5, say: ['Pilot', 'She lands first. Let\'s get her home.'] },
    ],
  },
  {
    id: 'enemyBailout', title: 'He\'s out', sub: 'A burning Fw 190 pilot bails out', tone: 'tense', phases: ALL, needs: [], weight: 1, dur: 11,
    beats: [
      { at: 0, act: 'crosser' },
      { at: 0.3, say: ['Ball Turret', 'Burning Fw 190 coming across — he\'s in trouble!'] },
      { at: 2.6, act: 'bail' },
      { at: 5.4, say: ['Ball Turret', 'He\'s out! There\'s his chute!'] },
      { at: 8.4, say: ['Pilot', 'Let him go. His war\'s over.'] },
    ],
  },
  {
    id: 'yellowNoses', title: 'Yellow noses', sub: 'Veteran Fw 190s, head-on', tone: 'tense', phases: ['build', 'mid'], needs: [], weight: 0.9, dur: 14,
    beats: [
      { at: 0, say: ['Bombardier', 'Yellow noses at twelve o\'clock — the Abbeville boys! Head-on!'] },
      { at: 0.4, act: 'yellowNoses' },
      { at: 3.5, say: ['Pilot', 'Top turret, chin turret — get on them!'] },
    ],
  },
  {
    id: 'sunBandits', title: 'Out of the sun', sub: 'Bf 109s diving from the glare', tone: 'tense', phases: ['build', 'mid'], needs: [], weight: 0.9, dur: 13,
    beats: [
      { at: 0, say: ['Top Turret', 'Bandits in the sun! Coming down high — watch the glare!'] },
      { at: 0.3, act: 'sunBandits' },
      { at: 5, say: ['Tail', 'Squint and lead them. They have to come out of it sometime.'] },
    ],
  },
  {
    id: 'chaff', title: 'Window', sub: 'The lead ship scatters radar foil', tone: 'calm', phases: ALL, needs: [], weight: 0.7, dur: 10,
    beats: [
      { at: 0, act: 'chaff', arg: 6 },
      { at: 0.4, say: ['Navigator', 'Lead\'s dropping chaff — foil strips to blind their radar.'] },
      { at: 5.5, say: ['Bombardier', 'Look at it glitter. Christmas over Germany.'] },
    ],
  },
  {
    id: 'oxygenCheck', title: 'Oxygen check', sub: 'Crew check-in, station by station', tone: 'calm', phases: QUIET, needs: [], weight: 0.8, dur: 15,
    beats: [
      { at: 0, say: ['Pilot', 'Oxygen check. Sound off, tail to nose.'] },
      { at: 2.6, say: ['Tail', 'Tail, okay.'] },
      { at: 4.4, say: ['Waist', 'Waist, okay.'] },
      { at: 6.2, say: ['Ball Turret', 'Ball, okay.'] },
      { at: 8.0, say: ['Radio', 'Radio, okay.'] },
      { at: 9.8, say: ['Top Turret', 'Top turret, okay.'] },
      { at: 11.6, say: ['Navigator', 'Navigator, okay. Everybody\'s breathing.'] },
    ],
  },
  {
    id: 'tightenUp', title: 'Close it up', sub: 'The box tightens for mutual fire', tone: 'calm', phases: ALL, needs: ['box'], weight: 0.8, dur: 22,
    beats: [
      { at: 0, act: 'tighten' },
      { at: 0.3, say: ['Lead', 'All ships, close it up! Tight box — mass your guns!'] },
      { at: 6, say: ['Pilot', 'That\'s better. Every gun in the box covers us now.'] },
      { at: 17, act: 'loosen' },
    ],
  },
  {
    id: 'strayTracers', title: 'Watch your fire', sub: 'A jittery gunner sprays the formation', tone: 'tense', phases: ALL, needs: ['neighbour'], weight: 0.8, dur: 9,
    beats: [
      { at: 0, act: 'tracers' },
      { at: 0.5, say: ['Top Turret', 'Hey! Watch your fire — that\'s a friendly ship!'] },
      { at: 4.5, say: ['Waist', 'Some kid in the next ship\'s got the jitters.'] },
    ],
  },
  {
    id: 'escortHome', title: 'Escort hit', sub: 'A damaged P-51 turns for home', tone: 'calm', phases: ALL, needs: [], weight: 0.8, dur: 14,
    beats: [
      { at: 0, act: 'limper' },
      { at: 0.5, say: ['Blue Two', 'Big friend, I\'m hit — coolant\'s going. Turning for home.'] },
      { at: 5, say: ['Pilot', 'Good luck, little friend. Thanks for the company.'] },
    ],
  },
  {
    id: 'brassRain', title: 'Brass rain', sub: 'Spent casings fall from the ship above', tone: 'calm', phases: ALL, needs: ['neighbour'], weight: 0.6, dur: 9,
    beats: [
      { at: 0, act: 'brass', arg: 5 },
      { at: 0.4, say: ['Top Turret', 'Brass coming down from the ship above — it\'s raining shell casings!'] },
      { at: 5, say: ['Pilot', 'Keep your heads down and your guns up.'] },
    ],
  },
];

export const EVENT_IDS = MISSION_EVENTS.map((e) => e.id);
export const eventDef = (id: string) => MISSION_EVENTS.find((e) => e.id === id) ?? null;

// ------------------------------------------------------------------ the director's rules
export const EV_FIRST = 30;                        // s into the mission before the first one
export const EV_GAP: [number, number] = [50, 90];  // s between the start of one event and the next
export const EV_MAX = 6;                           // per mission
export const EV_EDGE = 15;                         // s at either end of a round kept clear
export const EV_AFTER = 8;                         // s of quiet after another system's moment ends
export const EV_BOMB_LEAD = 30;                    // s before bombs away the bomb-run lead-in starts (IP, bombsight offer)
export const EV_BOMB_CLEAR = 14;                   // s an event (with its staging) must end before that lead-in
const NEAR_CALM = 2, NEAR_TENSE = 6, NEAR_SPAWN = 4;

export interface EvGate {
  role: 'gunner' | 'pilot';
  coop: boolean;
  scripted: boolean;           // a signature mission or one that turns mid-round extras off
  boss: boolean;
  busy: boolean;               // a set piece, random event or bonus objective is on (or just ended)
  phase: string;               // Pacing phase ('none' outside round missions)
  missionT: number; roundT: number; roundLeft: number;
  sinceLast: number; gap: number; count: number;
}

/** May the director start an event now? (which one: pickEvent) */
export function eventDue(g: EvGate): boolean {
  if (g.role !== 'gunner' || g.coop || g.scripted || g.boss || g.busy || g.count >= EV_MAX) return false;
  if (g.missionT < EV_FIRST || g.sinceLast < g.gap) return false;
  if (g.roundT < EV_EDGE || g.roundLeft < EV_EDGE) return false;
  return g.phase === 'build' || g.phase === 'breather' || g.phase === 'mid' || g.phase === 'none';
}

export interface EvContext {
  phase: string;
  near: number;                // enemy fighters within 1.2 km of the player
  roundLeft: number;
  bombIn?: number;             // s until the bomb-run lead-in (bombLeadIn); absent: no bomb run ahead
  have: Partial<Record<EvNeed, boolean>>;
}

/** Seconds until the bomb run's lead-in (the IP call and the bombsight offer) begins: 0 once it has
 *  (or while the run is on), Infinity with no bomb run ahead. Events never run into it. */
export function bombLeadIn(time: number, bombsAway: number | undefined, dropped: boolean, runActive: boolean): number {
  if (runActive) return 0;
  if (!bombsAway || dropped) return Infinity;
  return Math.max(0, bombsAway - EV_BOMB_LEAD - time);
}

/** Can this event play now? */
export function eventFits(e: MissionEventDef, c: EvContext): boolean {
  if (c.phase !== 'none' && !e.phases.includes(c.phase as EvPhase)) return false;
  if (c.roundLeft < e.dur + EV_EDGE * 0.5) return false;
  if ((c.bombIn ?? Infinity) < e.dur + EV_BOMB_CLEAR) return false;
  for (const n of e.needs) if (!c.have[n]) return false;
  const spawns = e.beats.some((b) => b.act === 'yellowNoses' || b.act === 'sunBandits');
  const cap = spawns ? NEAR_SPAWN : e.tone === 'calm' ? (c.phase === 'breather' ? NEAR_CALM + 2 : NEAR_CALM) : NEAR_TENSE;
  return c.near <= cap;
}

/** Weighted pick among the events that fit and haven't played this mission (rng in [0,1)). */
export function pickEvent(c: EvContext, played: readonly string[], rng: () => number, lastTone?: EvTone): MissionEventDef | null {
  const pool = MISSION_EVENTS.filter((e) => !played.includes(e.id) && eventFits(e, c));
  if (!pool.length) return null;
  // variety: a second B-17 loss in a row is less likely
  const w = pool.map((e) => e.weight * (lastTone === 'loss' && e.tone === 'loss' ? 0.3 : 1));
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r < 0) return pool[i]; }
  return pool[pool.length - 1];
}

/** Every radio line of the library (speaker, exact subtitle text), for the voice and i18n checks */
export function eventLines(): [string, string][] {
  const out: [string, string][] = [];
  for (const e of MISSION_EVENTS) for (const b of e.beats) {
    if (b.act === 'countChutes') for (const t of CHUTE_LINES) out.push([CHUTE_SPEAKER, t]);
    if (b.say) out.push(b.say);
  }
  return out;
}
