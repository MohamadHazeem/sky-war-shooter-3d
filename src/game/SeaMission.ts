import type { Mission } from './Missions';
import { registerMode, type ModeDef } from './Modes';

export const SEA_BRIEFING = [
  'Strike the enemy fleet and coastal defences. R fires an HVAR rocket; N releases a 500 lb bomb. Fly low and level to skip bombs into a ship.',
  'Destroy flak mounts and main turrets on the battleship to expose its waterline and magazines. Attack U-boats before they crash-dive; nearby bombs still hit a diving boat.',
  'Clear each wave to rearm in the hangar. Sink the fleet, evade the marked salvos, and destroy radar stations to spoil enemy flak accuracy.',
];
/** Finite rounds and a different id can be supplied by future campaign missions. */
export function seaMission(rounds = Infinity): Mission {
  return { id: 'survival-sea', number: 0, title: 'Sea Strike', target: 'Enemy fleet and coastal defences', date: 'Norwegian coast, 1944', role: 'pilot', station: 'waistL',
    briefing: [...SEA_BRIEFING], objectives: ['Sink the fleet and silence the shore batteries', 'Survive and rearm between waves'],
    bombers: 0, escorts: 0, waves: [], duration: rounds === Infinity ? Infinity : 0, rounds, naval: true,
    round: { duration: Infinity, start: 0, min: 0, max: 0, skill: [1, 1] },
    boss: false, specials: false, midRound: false, maxBombersLost: 99,
    weather: { sunEl: 32, sunAz: 225, low: .35, high: .4, mood: 'clear', contrails: false },
    success: 'The sea lanes are clear.',
  };
}
export const SEA_MODE: ModeDef = {
  id: 'survival-sea', title: 'Sea Strike', roles: ['pilot'],
  blurb: 'Endless naval strikes: patrol boats, convoys, U-boats, coastal guns and a battleship every fifth wave. Fly a P-51 with guns, HVAR rockets and skip bombs.',
  mission: () => seaMission(), matches: m => m.id === 'survival-sea', board: () => 'survival-sea',
};
registerMode(SEA_MODE, 1);
export const SEA_RADIO = {
  start: 'Blue flight, ships ahead. Rockets for the escorts; save your bombs for the waterline.',
  dive: 'U-boat crash-diving! Put a bomb alongside before she gets deep!',
  boss: 'Battleship ahead! Silence her guns, then hit the magazines at the waterline.',
  salvo: 'Main guns tracking us! Break away from the marked area!',
  radar: 'Radar is down. Their flak crews are aiming by eye now.',
} as const;
