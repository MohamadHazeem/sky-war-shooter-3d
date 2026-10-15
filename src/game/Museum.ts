// Museum (Phase 11 goal 30): the history, crew positions and collectable facts behind every
// aircraft on the hangar turntable (game/AircraftGallery.ts, ui/GalleryScreen.ts), and the
// encounter log that unlocks the facts as you meet each type in a mission.
// Facts: the first is always open; the others unlock by encounters (missions in which the type
// flew with or against you), kills of the type, or missions flown (the B-17).
// Encounters: World.spawnEnemy / spawnEscort note the type while a mission is armed
// (MissionFlow.startMission → encounters.arm()); the debrief counts each type once per mission
// (MissionFlow.showDebrief → museumDebrief).
// All shown text is English here and translated through tx() (i18n/ar/museum.ts).
// Pure data and logic apart from localStorage: unit-tested (tests/museum.test.ts).
import { AIRCRAFT_SPECS, specById, type AircraftId } from './AircraftData';

export type FactRule =
  | { kind: 'free' }
  | { kind: 'seen'; n: number }       // missions in which the type was met
  | { kind: 'kills'; n: number }      // shot down by you (bosses: battle groups downed)
  | { kind: 'missions'; n: number };  // missions flown (any)

export interface MuseumFact { text: string; rule: FactRule }

export interface MuseumEntry {
  history: string;
  crew: string[];        // positions on board
  facts: MuseumFact[];   // 4: the first free, the rest unlocked by the rules
}

const free: FactRule = { kind: 'free' };
const seen = (n: number): FactRule => ({ kind: 'seen', n });
const kills = (n: number): FactRule => ({ kind: 'kills', n });
const missions = (n: number): FactRule => ({ kind: 'missions', n });
// the usual ladders: an enemy (meet it, then shoot some down), a friend (fly with it), ours
const foe = [free, seen(1), kills(3), kills(10)];
const friend = [free, seen(1), seen(3), seen(6)];
const facts = (rules: FactRule[], texts: string[]): MuseumFact[] => texts.map((text, i) => ({ text, rule: rules[i] }));

export const MUSEUM: Record<AircraftId, MuseumEntry> = {
  b17: {
    history: 'The backbone of the Eighth Air Force\'s daylight bombing from England. Bristling with guns and famous for bringing its crews home with terrible damage, the Fortress flew in tight combat boxes so that its gunners could cover one another.',
    crew: ['Pilot', 'Co-pilot', 'Navigator', 'Bombardier', 'Flight engineer · top turret', 'Radio operator', 'Ball turret gunner', 'Left waist gunner', 'Right waist gunner', 'Tail gunner'],
    facts: facts([free, missions(1), missions(5), missions(10)], [
      'Boeing built the prototype, the Model 299, in under a year; a newspaper caption called it a "flying fortress" and the name stuck.',
      'More than 12,700 B-17s were built, by Boeing, Douglas and Lockheed-Vega.',
      'An Eighth Air Force tour was 25 missions; in 1944 it was raised to 30 and then 35.',
      'The chin turret of the B-17G, two remote-controlled .50s under the nose, was the answer to the head-on attacks.',
    ]),
  },
  p51d: {
    history: 'Designed for the British in 1940 and transformed by the Rolls-Royce Merlin engine, the Mustang had the range to fly to Berlin and back. From early 1944 it escorted the bombers all the way, and the Luftwaffe\'s day fighters never recovered.',
    crew: ['Pilot'],
    facts: facts(friend, [
      'The prototype, the NA-73X, was designed and built in just over a hundred days.',
      'The bubble canopy of the D model gave its pilot a clear view all round, above all to the rear.',
      'With two drop tanks it could escort the bombers to Berlin and back, more than 1,800 km.',
      'More than 15,000 Mustangs were built; the D model was the most numerous, with about 8,000.',
    ]),
  },
  p47d: {
    history: 'The heaviest single-engine fighter of the war, built around a 2,000 hp radial engine and a turbo-supercharger. It escorted the Eighth\'s bombers through 1943, then became a feared ground-attack aircraft.',
    crew: ['Pilot'],
    facts: facts(friend, [
      'Pilots called it the "Jug". Empty, it weighed almost twice as much as a Spitfire.',
      'Its eight .50-calibre guns together fired more than a hundred rounds a second.',
      'It could out-dive any German piston fighter, and its pilots used the dive to attack and to escape.',
      'Republic built 15,636 Thunderbolts, more than any other American fighter.',
    ]),
  },
  spitfire9: {
    history: 'Reginald Mitchell\'s elegant fighter defended Britain in 1940. The Mk IX, rushed into service in 1942 to answer the Fw 190, gave it a two-stage Merlin engine; Spitfires covered the American bombers on the first and last legs of their raids.',
    crew: ['Pilot'],
    facts: facts(friend, [
      'Its thin elliptical wing was very efficient at high speed, and became its signature.',
      'More than 20,000 Spitfires were built, more than any other British aircraft.',
      'The Mk IX was meant as a stopgap, yet more than 5,600 were built.',
      'The Spitfire was in production before the war began and after it ended: from 1938 to 1948.',
    ]),
  },
  fw190: {
    history: 'Kurt Tank\'s rugged radial-engined fighter shocked the RAF in 1941. The heavily armed and armoured A-8 was the Luftwaffe\'s main bomber destroyer: the Sturmgruppen flew it right up to the Fortresses.',
    crew: ['Pilot'],
    facts: facts(foe, [
      'Its wide undercarriage made it far easier to land than the Bf 109.',
      'German pilots called it the "Würger": the butcher-bird, or shrike.',
      'Sturm pilots swore to close in until they could not miss, and to ram the bomber if they had to.',
      'More than 20,000 Fw 190s were built, thousands of them for ground attack.',
    ]),
  },
  bf109: {
    history: 'Willy Messerschmitt\'s light fighter flew in Spain, over Britain and on every front. By 1944 the G model was outclassed by the newest Allied fighters, but it remained the most numerous fighter in the Luftwaffe.',
    crew: ['Pilot'],
    facts: facts(foe, [
      'About 34,000 were built: more than any other fighter in history.',
      'Its narrow undercarriage made take-offs and landings tricky; many were wrecked on the ground.',
      'The bulges over the guns of the G-6 earned it the nickname "Beule": the bump.',
      'Erich Hartmann, the highest-scoring ace in history with 352 victories, flew the Bf 109.',
    ]),
  },
  bf110: {
    history: 'Designed as a long-range Zerstörer to clear the way for the bombers, it was mauled by single-seat fighters over Britain. It found a new life as a night fighter and, by day, as a rocket-armed destroyer of unescorted bombers.',
    crew: ['Pilot', 'Radio operator · rear gunner', 'Radar operator (night fighters)'],
    facts: facts(foe, [
      'Zerstörer means "destroyer": the heavy fighter was meant to escort bombers deep into enemy land.',
      'Its 21 cm rockets were adapted army mortar rounds, fired into the bomber boxes to break them up.',
      'Once American escorts could reach Germany, the slow Bf 110 day units suffered terrible losses.',
      'As a night fighter it served the most successful night aces, such as Heinz-Wolfgang Schnaufer.',
    ]),
  },
  ju88: {
    history: 'Junkers\' fast twin-engined "Schnellbomber" was the Luftwaffe\'s most versatile aircraft: bomber, dive bomber, reconnaissance aircraft, night fighter and even a flying bomb.',
    crew: ['Pilot', 'Observer · bomb aimer', 'Radio operator · gunner', 'Flight engineer · ventral gunner'],
    facts: facts(foe, [
      'Its four crew sat close together in the glazed nose, the "Kampfkopf" or combat head.',
      'About 15,000 Ju 88s of all versions were built.',
      'Dive brakes under the wings let it bomb in a steep dive.',
      'Late in the war worn-out Ju 88s were flown as Mistel flying bombs, with a fighter riding on top.',
    ]),
  },
  ju88g: {
    history: 'The ultimate Ju 88 night fighter, with a bigger tail and SN-2 radar. Its Schräge Musik cannon fired upwards into the unarmoured bellies of the bombers.',
    crew: ['Pilot', 'Radar operator', 'Flight engineer · gunner'],
    facts: facts(foe, [
      'Schräge Musik, "slanted music", was German slang for jazz.',
      'It crept in below the bomber, where the gunners could rarely see it.',
      'In July 1944 a Ju 88 G landed in England by mistake and gave its radar secrets away.',
      'Its SN-2 radar could see through the "Window" foil strips that blinded earlier sets.',
    ]),
  },
  me262: {
    history: 'The first operational jet fighter. Faster than anything the Allies had, it came too late and in too small numbers: its engines lasted only hours, and fuel and trained pilots were short.',
    crew: ['Pilot'],
    facts: facts(foe, [
      'Its Jumo 004 jet engines needed an overhaul after as little as ten to twenty-five hours.',
      'Three or four hits from its 30 mm cannon could bring down a B-17.',
      'Allied pilots caught it where it was slow: taking off and landing.',
      'About 1,400 were built, but only a fraction ever reached combat.',
    ]),
  },
  me163: {
    history: 'A tiny tailless rocket fighter, the only one ever to see combat. It climbed to the bombers in under four minutes, made a pass or two, and glided home with empty tanks.',
    crew: ['Pilot'],
    facts: facts(foe, [
      'Its rocket burned two violently reactive fuels, T-Stoff and C-Stoff, which could kill the pilot on contact.',
      'It took off from a wheeled dolly that it dropped, and landed on a skid.',
      'Its speed was so high that its pilots had only a split second to aim at a bomber.',
      'For all its speed it shot down only a handful of Allied aircraft.',
    ]),
  },
  he111: {
    history: 'Developed in secret as an "airliner", the Heinkel was the Luftwaffe\'s main bomber of 1940. By 1944 it was obsolete, but it still flew as a transport, a torpedo bomber and a launcher of V-1 flying bombs.',
    crew: ['Pilot', 'Observer · bomb aimer', 'Radio operator · dorsal gunner', 'Flight engineer · ventral gunner', 'Waist gunner'],
    facts: facts(foe, [
      'Its fully glazed nose put the pilot beside the bomb aimer, with no stepped cockpit.',
      'Spain built it after the war with Merlin engines, as the CASA 2.111.',
      'More than 6,500 were built.',
      'In 1944 He 111s launched V-1 flying bombs at England from over the North Sea.',
    ]),
  },
  me410: {
    history: 'The troubled Me 210 rebuilt into a fast heavy fighter. Over Germany it hunted the bomber boxes; some carried a 50 mm BK 5 cannon to fire from beyond the gunners\' reach.',
    crew: ['Pilot', 'Radio operator · rear gunner'],
    facts: facts(foe, [
      'Hornisse means "hornet".',
      'The rear gunner aimed two remote barbettes, one on each side of the fuselage.',
      'The BK 5 was an adapted tank gun with only 21 rounds.',
      'About 1,200 were built.',
    ]),
  },
  do335: {
    history: 'The fastest piston fighter Germany built, with one engine in the nose and one in the tail. Only a few dozen were finished before the war ended.',
    crew: ['Pilot'],
    facts: facts(foe, [
      'Pfeil means "arrow".',
      'It had an ejection seat; the tail fin and rear propeller were blown off first.',
      'Its push-pull layout gave twin-engine power with the drag of a single-engine fighter.',
      'The only surviving Do 335 is in the Smithsonian\'s collection in Virginia.',
    ]),
  },
  boss: {
    history: 'Invented for the game: a flying warship built on the Ju 88 hull at three times its size, with gun turrets, flak and rocket pods.',
    crew: ['Fictional'],
    facts: facts([free, kills(1), kills(2), kills(3)], [
      'No such aircraft ever flew; the real giants of the Luftwaffe were transports such as the Me 323.',
      'Every turret, engine and flak gun you shoot away weakens the armour around the hull.',
      'Its 8.8 cm dorsal flak gun fires bursts into the formation: kill it first.',
      'Bringing one down earns the Giant Killer medal.',
    ]),
  },
};

// ---------------- unlocks ----------------

/** What the museum knows about the player. */
export interface MuseumStats {
  seen(id: AircraftId): number;    // missions in which the type was met
  kills(id: AircraftId): number;
  missions: number;
}

export function factOpen(rule: FactRule, id: AircraftId, s: MuseumStats): boolean {
  switch (rule.kind) {
    case 'free': return true;
    case 'seen': return s.seen(id) >= rule.n || s.kills(id) >= rule.n;   // a kill is an encounter too
    case 'kills': return s.kills(id) >= rule.n;
    case 'missions': return s.missions >= rule.n;
  }
}

export const openFacts = (id: AircraftId, s: MuseumStats) => MUSEUM[id].facts.filter((f) => factOpen(f.rule, id, s)).length;

/** The line under a locked fact: how to open it (English, for tx with {n}). */
export function ruleText(rule: FactRule): [string, Record<string, number>] {
  switch (rule.kind) {
    case 'free': return ['', {}];
    case 'seen': return rule.n === 1 ? ['Meet it in a mission', {}] : ['Meet it in {n} missions', { n: rule.n }];
    case 'kills': return rule.n === 1 ? ['Shoot one down', {}] : ['Shoot down {n}', { n: rule.n }];
    case 'missions': return rule.n === 1 ? ['Fly a mission', {}] : ['Fly {n} missions', { n: rule.n }];
  }
}

/** Every shown text of the museum (i18n coverage test). */
export function museumTexts(): string[] {
  const out = new Set<string>();
  for (const e of Object.values(MUSEUM)) { out.add(e.history); for (const c of e.crew) out.add(c); for (const f of e.facts) out.add(f.text); }
  return [...out];
}

// ---------------- the save ----------------

export interface MuseumSave { seen: Record<string, number>; known: Record<string, number> }
const KEY = 'sws3d.museum.v1';

export function loadMuseum(): MuseumSave {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const rec = (v: unknown) => {
      const r: Record<string, number> = {};
      if (v && typeof v === 'object') for (const [k, n] of Object.entries(v)) if (Number(n) > 0) r[k] = Math.floor(Number(n));
      return r;
    };
    return { seen: rec(o?.seen), known: rec(o?.known) };
  } catch { return { seen: {}, known: {} }; }
}

export function saveMuseum(m: MuseumSave) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage unavailable */ }
}

/** Facts the player has not looked at yet, per aircraft (the list's "new" marks). */
export function freshFacts(s: MuseumStats, save: MuseumSave = loadMuseum()): Partial<Record<AircraftId, number>> {
  const out: Partial<Record<AircraftId, number>> = {};
  for (const sp of AIRCRAFT_SPECS) {
    const n = openFacts(sp.id, s) - Math.max(1, save.known[sp.id] ?? 1);   // the free fact is never news
    if (n > 0) out[sp.id] = n;
  }
  return out;
}

/** The player opened an aircraft's facts: what is open now is no longer news. */
export function markKnown(id: AircraftId, s: MuseumStats) {
  const m = loadMuseum();
  m.known[id] = Math.max(m.known[id] ?? 0, openFacts(id, s));
  saveMuseum(m);
}

// ---------------- encounters ----------------

/** Types met in the current mission (a Set add per spawn; nothing is saved until the debrief). */
export class EncounterLog {
  private armed = false;
  private met = new Set<string>();
  arm() { this.armed = true; this.met.clear(); }
  note(kind: string) { if (this.armed) this.met.add(kind); }
  /** The mission ended: each type met counts once. Returns the types (ids of the museum). */
  flush(): AircraftId[] {
    if (!this.armed) return [];
    this.armed = false;
    const ids = [...this.met].filter((k): k is AircraftId => k in MUSEUM);
    this.met.clear();
    if (!ids.length) return ids;
    const m = loadMuseum();
    for (const id of ids) m.seen[id] = (m.seen[id] ?? 0) + 1;
    saveMuseum(m);
    return ids;
  }
}

export const encounters = new EncounterLog();

/**
 * Debrief: count the encounters, then name the aircraft with facts opened by this mission
 * (stats read after the career recorded the kills). `before` is the open count per type at
 * mission start.
 */
export function museumDebrief(before: Partial<Record<AircraftId, number>>, stats: () => MuseumStats): AircraftId[] {
  encounters.flush();
  const s = stats();
  return AIRCRAFT_SPECS.filter((sp) => openFacts(sp.id, s) > (before[sp.id] ?? 0)).map((sp) => sp.id);
}

/** Open facts per type (taken at mission start for museumDebrief). */
export function openSnapshot(s: MuseumStats): Partial<Record<AircraftId, number>> {
  const out: Partial<Record<AircraftId, number>> = {};
  for (const sp of AIRCRAFT_SPECS) out[sp.id] = openFacts(sp.id, s);
  return out;
}

export const museumTotals = (s: MuseumStats) => {
  let open = 0, total = 0;
  for (const sp of AIRCRAFT_SPECS) { open += openFacts(sp.id, s); total += MUSEUM[sp.id].facts.length; }
  return { open, total };
};

export const nickOf = (id: AircraftId) => specById(id).nick;
