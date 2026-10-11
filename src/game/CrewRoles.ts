// Crew expertise is separate from the player's purchased skill tree. All role multipliers
// stay within 0.75..1.25; 50 is neutral. Recomputed only on roster events.
import type { ManId, Post } from './CrewRoster';
import type { CrewId } from '../world/Crew';
export const ROLE_STATS = ['gunnery', 'spotting', 'mechanics', 'firstAid', 'nerve'] as const;
export type RoleStat = typeof ROLE_STATS[number];
export const ROLE_LABEL: Record<RoleStat, string> = { gunnery: 'Gunnery', spotting: 'Spotting', mechanics: 'Mechanics', firstAid: 'First aid', nerve: 'Nerve' };
export const ROLE_HELP: Record<RoleStat, string> = {
  gunnery: 'Tighter AI fire and faster target reaction at the assigned gun.',
  spotting: 'Lookouts and navigator give earlier incoming warnings on radar.',
  mechanics: 'The top turret engineer speeds repairs and extinguisher response.',
  firstAid: 'The radio operator speeds field dressing and reduces serious wounds.',
  nerve: 'Pilots jink sooner and keep a steadier formation.',
};
// Personality bonuses are included in these level-one values, not stacked at runtime.
export const TALENTS: Record<ManId, { trait: string; stats: Record<RoleStat, number> }> = {
  brenner: { trait: 'Cool-headed', stats: { gunnery: 45, spotting: 55, mechanics: 45, firstAid: 40, nerve: 72 } },
  doyle: { trait: 'Spirited', stats: { gunnery: 45, spotting: 50, mechanics: 50, firstAid: 45, nerve: 62 } },
  stern: { trait: 'Observant', stats: { gunnery: 40, spotting: 72, mechanics: 45, firstAid: 50, nerve: 55 } },
  kessler: { trait: 'Methodical', stats: { gunnery: 62, spotting: 60, mechanics: 50, firstAid: 40, nerve: 58 } },
  mendez: { trait: 'Sharp-eyed mechanic', stats: { gunnery: 52, spotting: 68, mechanics: 74, firstAid: 42, nerve: 60 } },
  gallo: { trait: 'Caretaker', stats: { gunnery: 46, spotting: 52, mechanics: 48, firstAid: 74, nerve: 50 } },
  reilly: { trait: 'Fearless', stats: { gunnery: 56, spotting: 50, mechanics: 42, firstAid: 40, nerve: 72 } },
  price: { trait: 'Marksman', stats: { gunnery: 70, spotting: 58, mechanics: 40, firstAid: 42, nerve: 56 } },
  walsh: { trait: 'Steady', stats: { gunnery: 52, spotting: 50, mechanics: 46, firstAid: 55, nerve: 74 } },
  dawson: { trait: 'Hawkeye', stats: { gunnery: 64, spotting: 76, mechanics: 42, firstAid: 40, nerve: 60 } },
};
export const roleMultiplier = (skill: number) => 0.75 + Math.max(0, Math.min(100, skill)) * 0.005;
export const roleStat = (id: ManId, stat: RoleStat, level: number) => Math.min(100, TALENTS[id].stats[stat] + 4 * (level - 1));
export const POSITION_WEIGHTS: Record<Post, Partial<Record<RoleStat, number>>> = {
  top: { gunnery: 0.3, mechanics: 1, spotting: 0.1 }, radio: { firstAid: 1 },
  ball: { gunnery: 0.85, spotting: 0.15 }, waistL: { gunnery: 0.85, spotting: 0.15 },
  waistR: { gunnery: 0.85, spotting: 0.15 }, tail: { gunnery: 0.6, spotting: 0.4 },
};
export interface CrewEffects { repair: number; fireDelay: number; dressing: number; seriousWound: number; warning: number; jink: number; formation: number }
export const NEUTRAL_EFFECTS: Readonly<CrewEffects> = Object.freeze({ repair: 1, fireDelay: 1, dressing: 1, seriousWound: 1, warning: 1, jink: 1, formation: 1 });
// Position duties are data, so balance changes need no World/Game branching.
export const ROLE_DUTIES: Record<keyof CrewEffects, { stat: RoleStat; positions: readonly CrewId[]; inverse: boolean }> = {
  repair: { stat: 'mechanics', positions: ['engineer'], inverse: false },
  fireDelay: { stat: 'mechanics', positions: ['engineer'], inverse: true },
  dressing: { stat: 'firstAid', positions: ['radio'], inverse: true },
  seriousWound: { stat: 'firstAid', positions: ['radio'], inverse: true },
  warning: { stat: 'spotting', positions: ['nav', 'bombardier', 'engineer', 'ball', 'waistL', 'waistR', 'tail'], inverse: false },
  jink: { stat: 'nerve', positions: ['pilot', 'copilot'], inverse: false },
  formation: { stat: 'nerve', positions: ['pilot', 'copilot'], inverse: true },
};
const EFFECTS = Object.keys(ROLE_DUTIES) as (keyof CrewEffects)[];
export function roleEffects(at: (position: CrewId, stat: RoleStat) => number): CrewEffects {
  const effects = { ...NEUTRAL_EFFECTS };
  for (const key of EFFECTS) {
    const duty = ROLE_DUTIES[key];
    let skill = 0;
    for (const position of duty.positions) skill += at(position, duty.stat);
    const mult = roleMultiplier(skill / duty.positions.length);
    effects[key] = duty.inverse ? 2 - mult : mult;
  }
  return effects;
}
