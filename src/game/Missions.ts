import type { AttackType } from '../world/AI';
import type { StationId } from '../world/B17Layout';

export type SpawnFrom = 'front' | 'rear' | 'left' | 'right' | 'high' | 'mixed';

export interface Wave {
  at: number;                 // mission time (s) when the wave appears (or after previous cleared if afterClear)
  afterClear?: boolean;
  count: number;
  attack?: AttackType;
  from: SpawnFrom;
  skill: number;
  radio?: [string, string];
}

export interface Mission {
  id: string;
  number: number;
  title: string;
  target: string;
  date: string;
  role: 'gunner' | 'pilot';
  station?: StationId;
  briefing: string[];
  objectives: string[];
  bombers: number;
  escorts?: number;
  escortArrive?: number;      // time when friendly fighters arrive (gunner missions)
  waves: Wave[];
  flak?: { start: number; end: number; intensity: number };
  bombsAway?: number;
  duration: number;           // minimum mission time before it can complete
  maxBombersLost?: number;
  playerDamaged?: boolean;    // start with two engines out (straggler)
  success?: string;           // debrief line on success
  playerArmor?: number;       // incoming damage scale on the player's aircraft
  sun?: { el: number; az: number };
  coverage?: number;
}

export const CAMPAIGN: Mission[] = [
  {
    id: 'm1', success: "Emden's U-boat pens took a beating. Good shooting, gunner — you'll make a veteran yet.", number: 1, title: 'Baptism of Fire', target: 'U-boat yards, Emden', date: '27 September 1943', role: 'gunner', station: 'waistL',
    briefing: [
      'Gentlemen, this is your first one. The group puts up eighteen ships against the U-boat yards at Emden. Bombing altitude twenty-five thousand feet.',
      'You are left waist gunner aboard the Sky Queen, number two ship in the lead element. Expect single-engine fighters over the Frisian coast. They will come in fast and they will come in close.',
      'Lead your target. A fighter crossing at three hundred miles an hour needs a lot of lead — watch your tracers and walk them in. Short bursts. Keep that barrel cool.',
    ],
    objectives: ['Defend the formation', 'Survive the mission', 'Lose no more than 3 bombers'],
    bombers: 9, waves: [
      { at: 18, count: 3, from: 'left', attack: 'beam', skill: 0.75, radio: ['Navigator', 'Fighters coming up from the coast, nine o\'clock low. Stay sharp.'] },
      { at: 0, afterClear: true, count: 4, from: 'front', attack: 'headon', skill: 0.8, radio: ['Pilot', 'More of them up ahead. Twelve o\'clock — here they come.'] },
      { at: 0, afterClear: true, count: 4, from: 'mixed', skill: 0.85 },
    ],
    duration: 120, maxBombersLost: 3,
  },
  {
    id: 'm2', success: "The head-on attacks broke against a wall of fifty-calibre fire. Bremen's docks are burning.", number: 2, title: 'Twelve O\'Clock High', target: 'Port facilities, Bremen', date: '8 October 1943', role: 'gunner', station: 'top',
    briefing: [
      'The Luftwaffe has learned that the nose of a Fortress is its weak spot. Their fighters are making head-on passes at closing speeds of six hundred miles an hour.',
      'You are flying the top turret today. Twin fifties, three hundred and sixty degrees of traverse. When they come in from twelve o\'clock high you are the man who has to stop them.',
      'Bremen is heavily defended. Expect repeated attacks before and after the target.',
    ],
    objectives: ['Break up the head-on attacks', 'Survive the mission', 'Lose no more than 4 bombers'],
    bombers: 12, waves: [
      { at: 15, count: 4, from: 'front', attack: 'headon', skill: 0.9, radio: ['Bombardier', 'Bandits! Twelve o\'clock high, a whole Staffel of them!'] },
      { at: 0, afterClear: true, count: 5, from: 'front', attack: 'headon', skill: 0.95 },
      { at: 0, afterClear: true, count: 4, from: 'high', attack: 'high', skill: 1.0, radio: ['Tail', 'Fighters up high, coming out of the sun!'] },
      { at: 0, afterClear: true, count: 6, from: 'mixed', skill: 1.0 },
    ],
    duration: 180, maxBombersLost: 4,
  },
  {
    id: 'm3', success: "Bombs on target through the worst flak of the war. The chemical works at Ludwigshafen are in flames.", number: 3, title: 'Flak Alley', target: 'Chemical works, Ludwigshafen', date: '30 December 1943', role: 'gunner', station: 'waistR',
    briefing: [
      'The I.G. Farben works at Ludwigshafen is ringed by more than two hundred heavy flak guns. There is nothing you can do about flak but pray — and keep the fighters off us.',
      'You are right waist gunner. Fighters will hit us on the way in, then pull off when we reach the flak belt. Once bombs are away, they will be back for the cripples.',
      'Stay at your gun through the bomb run. Do not get out of position.',
    ],
    objectives: ['Fight through to the target', 'Survive the flak belt over the target', 'Defend the formation on the way home'],
    bombers: 12, waves: [
      { at: 12, count: 4, from: 'right', attack: 'beam', skill: 0.95, radio: ['Ball Turret', 'Fighters, three o\'clock level! Coming in from the right!'] },
      { at: 0, afterClear: true, count: 4, from: 'rear', attack: 'stern', skill: 1.0 },
      { at: 150, count: 6, from: 'mixed', skill: 1.05, radio: ['Pilot', 'We\'re through the flak. Here come the fighters again — watch the cripples.'] },
      { at: 0, afterClear: true, count: 5, from: 'mixed', skill: 1.1 },
    ],
    flak: { start: 75, end: 140, intensity: 1.6 }, bombsAway: 112, duration: 200, maxBombersLost: 5,
  },
  {
    id: 'm4', success: "The Big Friends made it to Leipzig and back. Outstanding work, Blue Leader.", number: 4, title: 'Little Friends', target: 'Escort — Leipzig', date: '20 February 1944', role: 'pilot',
    briefing: [
      'Big Week. The whole Eighth Air Force is going after the German aircraft industry, and this time the bombers will not go alone.',
      'You are flying a P-51D Mustang on close escort for a box of twelve Fortresses. Your job is to break up the fighter attacks before they reach the bombers. Do not chase the enemy all over Germany — stay with the big friends.',
      'Mouse aim flies the aircraft toward where you look. W and S for throttle. Your six fifties are harmonised at three hundred yards.',
    ],
    objectives: ['Protect the bombers', 'Destroy the attacking fighters', 'Lose no more than 4 bombers'],
    bombers: 12, escorts: 3, waves: [
      { at: 20, count: 4, from: 'front', attack: 'headon', skill: 1.0, radio: ['Lead', 'Bandits twelve o\'clock low, climbing for the bombers. Let\'s go get them.'] },
      { at: 0, afterClear: true, count: 6, from: 'mixed', skill: 1.0 },
      { at: 0, afterClear: true, count: 7, from: 'rear', attack: 'stern', skill: 1.05, radio: ['Big Friend', 'Little friends, little friends, we have bandits at our six o\'clock!'] },
    ],
    duration: 150, maxBombersLost: 4,
  },
  {
    id: 'm5', success: "The Sturmgruppe paid for every pass. The tail gun held, and so did the formation.", number: 5, title: 'Sturmgruppe', target: 'Ball-bearing plants, Schweinfurt', date: '24 February 1944', role: 'gunner', station: 'tail',
    briefing: [
      'Intelligence reports a new kind of German unit: the Sturmgruppe. Heavily armoured Fw 190 A-8s that close to point-blank range from astern, in line abreast, and do not break off.',
      'You are the tail gunner. They will be coming straight at you. Open fire early and keep firing — armour glass in their windscreens will stop a lot of what you throw at them.',
    ],
    objectives: ['Stop the Sturmgruppe attack from astern', 'Survive the mission', 'Lose no more than 4 bombers'], playerArmor: 0.45,
    bombers: 12, waves: [
      { at: 15, count: 3, from: 'rear', attack: 'stern', skill: 1.0, radio: ['Navigator', 'Fighters assembling behind us, six o\'clock level. Lots of them.'] },
      { at: 0, afterClear: true, count: 8, from: 'rear', attack: 'stern', skill: 1.15, radio: ['Pilot', 'Here comes the whole gaggle! Tail, they\'re all yours!'] },
      { at: 0, afterClear: true, count: 6, from: 'mixed', skill: 1.1 },
    ],
    duration: 160, maxBombersLost: 4,
  },
  {
    id: 'm6', success: "The Mustangs drove them off. The Sky Queen limps home across the North Sea on two engines.", number: 6, title: 'The Long Way Home', target: 'Return leg — over the Netherlands', date: '6 March 1944', role: 'gunner', station: 'waistL',
    briefing: [
      'Flak over Berlin knocked out two of our engines. We cannot hold formation and the group is pulling away from us. A lone Fortress is exactly what the Jagdflieger are looking for.',
      'Every gun aboard is manned. Switch positions as they come in — one through five. P-51s are on the way to pick us up, but we have to hold out until they get here.',
    ],
    objectives: ['Keep the Sky Queen in the air', 'Hold out until the escort arrives'],
    bombers: 6, playerDamaged: true, escortArrive: 150, waves: [
      { at: 10, count: 2, from: 'rear', attack: 'stern', skill: 1.0, radio: ['Tail', 'Two fighters closing from six o\'clock. They\'ve spotted us.'] },
      { at: 45, count: 3, from: 'mixed', skill: 1.05 },
      { at: 90, count: 4, from: 'mixed', skill: 1.1, radio: ['Radio', 'Escort reports sixty seconds out. Hang on!'] },
      { at: 125, count: 4, from: 'mixed', skill: 1.15 },
    ],
    duration: 170, maxBombersLost: 99,
  },
  {
    id: 'm7', success: "Berlin has been hit, and the Luftwaffe lost more than it can replace. The air war has turned.", number: 7, title: 'Big Week', target: 'Escort — Berlin', date: '8 March 1944', role: 'pilot',
    briefing: [
      'This is the big one. The Luftwaffe is throwing everything it has left at the bomber stream over Berlin.',
      'You lead the escort for our box. There will be more fighters than you can count — pick your targets, protect the bombers, and keep your speed up. Ammunition is limited: six hundred seconds of combat will not last six hundred seconds.',
    ],
    objectives: ['Protect the bombers', 'Destroy as many attackers as possible', 'Lose no more than 6 bombers'],
    bombers: 12, escorts: 4, waves: [
      { at: 15, count: 6, from: 'front', attack: 'headon', skill: 1.1, radio: ['Lead', 'Here they come. Big gaggle at twelve o\'clock — drop tanks and go!'] },
      { at: 0, afterClear: true, count: 8, from: 'mixed', skill: 1.15 },
      { at: 0, afterClear: true, count: 8, from: 'high', attack: 'high', skill: 1.2 },
      { at: 0, afterClear: true, count: 10, from: 'mixed', skill: 1.25, radio: ['Big Friend', 'More bandits! They\'re everywhere!'] },
    ],
    flak: { start: 100, end: 135, intensity: 1.0 }, bombsAway: 120, duration: 200, maxBombersLost: 6,
  },
];

export function survivalMission(role: 'gunner' | 'pilot'): Mission {
  return {
    id: 'survival-' + role, number: 0, title: role === 'gunner' ? 'Survival — Gunner' : 'Survival — Escort', target: 'Endless waves', date: 'Somewhere over the Reich', role,
    station: 'waistL', briefing: ['Endless waves of fighters, growing stronger every time. How long can you hold out?'],
    objectives: ['Survive as many waves as possible'], bombers: 12, escorts: role === 'pilot' ? 2 : 0, waves: [], duration: Infinity, maxBombersLost: 99,
  };
}
