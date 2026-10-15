// Codex (Phase 11 goal 30): the museum's reading room. Three shelves: the crew roles of a B-17,
// the medals of the game (Career.ts MEDALS, with the real decorations' history), and the
// operations of the campaign (Missions.ts CAMPAIGN, with what happened on that day).
// Crew roles are always open; a medal shows how many you hold; an operation's file opens once
// you have flown it. Shown in the museum's Codex tab (ui/CodexPanel.ts).
// All shown text is English here and translated through tx() (i18n/ar/museum.ts).
// Pure data and logic: unit-tested (tests/museum.test.ts).
import { MEDALS } from './Career';
import { CAMPAIGN } from './Missions';

export type CodexShelf = 'crew' | 'medals' | 'ops';
export const CODEX_SHELVES: { id: CodexShelf; label: string }[] = [
  { id: 'crew', label: 'Crew roles' }, { id: 'medals', label: 'Medals' }, { id: 'ops', label: 'Operations' },
];

export interface CodexEntry {
  id: string;
  shelf: CodexShelf;
  title: string;      // translated through tx
  sub: string;        // one line under the title (translated)
  body: string;       // the history (translated)
  game: string;       // what it means in the game (translated)
  ribbon?: string;    // medals: CSS background of the ribbon
}

// ---------------- crew roles ----------------

const CREW: [string, string, string, string][] = [
  ['pilot', 'Pilot', 'The aircraft commander, usually a lieutenant, responsible for the ship and all ten men. Holding a heavy bomber in tight formation for eight hours was exhausting work.',
    'Your pilot jinks the bomber when fighters bore in; his nerve sets how soon.'],
  ['copilot', 'Co-pilot', 'Second in command, flying in turns with the pilot and ready to take over if he was hit. He watched the engines, fuel and the formation on his side.',
    'Shares the flying and the nerve of the cockpit with the pilot.'],
  ['navigator', 'Navigator', 'Kept track of the bomber\'s position by dead reckoning, radio fixes and the stars, and manned the cheek guns in the nose.',
    'One of the lookouts: calls fighters coming from the front.'],
  ['bombardier', 'Bombardier', 'Aimed the bombs through the Norden bombsight on the run to the target, and fired the twin-gun chin turret of the B-17G.',
    'Flies the bomb run: hold the crosshairs on the aiming point until bombs away.'],
  ['engineer', 'Flight engineer · top turret', 'The bomber\'s mechanic in the air: fuel transfers, engines and repairs. In combat he manned the power-driven top turret behind the cockpit.',
    'A station you can man: the top turret, best against high and head-on attacks. He also fights fires and repairs.'],
  ['radio', 'Radio operator', 'Kept the radio watch, sent position reports and worked the radio room; in the field he often gave first aid to the wounded.',
    'Dresses the wounded: his first aid shortens how long a gunner is out.'],
  ['ball', 'Ball turret gunner', 'Curled up in a steel and glass ball under the belly, usually the smallest man of the crew, with no room for his parachute inside.',
    'A station you can man: the ball turret covers every attack from below.'],
  ['waist', 'Waist gunners', 'Two gunners standing at open windows in the fuselage, in the bitter cold of high altitude. From 1944 many crews flew with only one.',
    'Two stations you can man: the left and right waist guns cover the beams.'],
  ['tail', 'Tail gunner', 'Kneeling on a bicycle-type seat in the tail, he faced the fighters that attacked from behind and reported what was happening to the formation.',
    'A station you can man: the tail guns meet attacks from six o\'clock.'],
];

// ---------------- medals ----------------

// History for each award of Career.MEDALS (real decorations, and the game's own awards)
const MEDAL_NOTES: Record<string, [string, string]> = {
  'Air Medal': ['US decoration', 'Created in 1942 for meritorious achievement in flight. Bomber crews of the Eighth Air Force usually received it after their first five missions, and an oak-leaf cluster for every five after that.'],
  'Distinguished Flying Cross': ['US decoration', 'Created in 1926 for heroism or extraordinary achievement in flight. Many bomber crewmen received it on completing their tour.'],
  'Silver Star': ['US decoration', 'The third-highest American award for gallantry in combat, given for bravery against an armed enemy.'],
  'Purple Heart': ['US decoration', 'Given to every serviceman wounded or killed by enemy action. It was revived in 1932 from George Washington\'s Badge of Military Merit of 1782.'],
  'Ace in a Day': ['Game award', 'Not a medal but a title of honour: five enemy aircraft shot down in a single day. Only a few dozen American airmen managed it.'],
  'Gunner\'s Wings': ['Game award', 'In 1943 the real Aerial Gunner badge, silver wings around a winged bullet, was given to the graduates of gunnery school.'],
  'Fortress Defender': ['Game award', 'An award of this game for the whole formation coming home. In 1943 the Eighth Air Force often lost one bomber in ten on a deep raid.'],
  'Experten Killer': ['Game award', 'An award of this game. The Luftwaffe called its aces "Experten"; some scored dozens of bombers.'],
  'Giant Killer': ['Game award', 'An award of this game for bringing down a Luftkreuzer, the fictional flying warship.'],
  'Second Tour Medal': ['Game award', 'An award of this game. Few airmen volunteered for a second tour: by late 1943 fewer than half the crews survived their first.'],
};

// ---------------- operations ----------------

// What happened on the day of each campaign operation (Missions.ts ids)
const OPS_NOTES: Record<string, string> = {
  m1: 'On 27 September 1943 the Eighth Air Force bombed Emden through cloud, led by pathfinders with H2S radar for the first time, and P-47s with drop tanks escorted the bombers all the way to the target.',
  m2: 'On 8 October 1943 the bombers hit Bremen and the U-boat yards at Vegesack. Head-on attacks and flak brought down about thirty bombers.',
  m3: 'On 30 December 1943 more than six hundred heavy bombers struck the IG Farben chemical works at Ludwigshafen.',
  m4: 'On 20 February 1944 more than a thousand bombers took off to attack the German aircraft industry around Leipzig: the first day of "Big Week", Operation Argument.',
  m5: 'On 24 February 1944, during Big Week, the bombers went back to the ball-bearing plants of Schweinfurt.',
  m6: 'On 6 March 1944 the Eighth Air Force made its first great daylight raid on Berlin and lost sixty-nine bombers, its worst day of the war.',
  m7: 'On 8 March 1944 the bombers returned to Berlin and the ball-bearing works at Erkner. The Luftwaffe was losing pilots faster than it could train them.',
  m8: 'On 14 October 1943, "Black Thursday", sixty of the bombers sent to Schweinfurt were lost. Unescorted deep raids stopped until long-range fighters arrived.',
  m9: 'On 13 December 1943 P-51 Mustangs flew their first long-range escort, to the port of Kiel.',
  m10: 'On 29 January 1944 more than eight hundred heavy bombers set out for Frankfurt, the largest force the Eighth had yet sent.',
  m11: 'On 25 February 1944, the last day of Big Week, bombers from England and Italy struck the Messerschmitt works at Regensburg.',
  m12: 'On 11 April 1944 the bombers hit aircraft plants across central Germany, among them the Fw 190 factory at Oschersleben; sixty-four bombers were lost.',
};

export function codexEntries(): CodexEntry[] {
  const out: CodexEntry[] = [];
  for (const [id, title, body, game] of CREW) out.push({ id: `crew:${id}`, shelf: 'crew', title, sub: 'B-17 crew', body, game });
  for (const m of MEDALS) {
    const [sub, body] = MEDAL_NOTES[m.name] ?? ['Game award', ''];
    out.push({ id: `medal:${m.name}`, shelf: 'medals', title: m.name, sub, body, game: m.desc, ribbon: m.ribbon });
  }
  for (const m of CAMPAIGN) {
    const body = OPS_NOTES[m.id];
    if (body) out.push({ id: `op:${m.id}`, shelf: 'ops', title: m.title, sub: m.target, body, game: m.date });
  }
  return out;
}

/** What the codex knows about the player. */
export interface CodexCtx {
  medals(name: string): number;   // times awarded
  flown(missionId: string): boolean;
}

/** Locked entries show only their title: operations not yet flown. */
export const entryOpen = (e: CodexEntry, c: CodexCtx) => e.shelf !== 'ops' || c.flown(e.id.slice(3));

/** Every shown text of the codex (i18n coverage test). */
export function codexTexts(): string[] {
  const out = new Set<string>(CODEX_SHELVES.map((s) => s.label));
  for (const e of codexEntries()) {
    out.add(e.title); out.add(e.sub); if (e.body) out.add(e.body);
    if (e.shelf !== 'ops') out.add(e.game);   // operations show the mission date (missions table)
  }
  return [...out];
}
