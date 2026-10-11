// Generated operations are pure seed/index data; never retain an unbounded mission cache.
import { CAMPAIGN, type Mission } from './Missions';
import { RAID_TEMPLATES, rng, type RaidKind } from './SideRaids';
import type { Fighter } from '../world/Aircraft';

export const SECOND_TOUR_LENGTH = 25;
export const SECOND_TOUR_MEDAL = 'Second Tour Medal';
export const isSecondTourId = (id: string) => /^tour2-\d+-\d+$/.test(id);
export const secondTourKind = (seed: number, index: number): RaidKind | 'city' =>
  [...RAID_TEMPLATES.map(t => t.kind), 'city' as const][(index + (seed >>> 0) % 6) % 6];

/** Smooth, bounded escalation: strength still changes the result by ±20%. */
export const secondTourDifficulty = (index: number) => 1 + 0.85 * (1 - Math.exp(-Math.max(0, index) / 28));

export function secondTourMission(seed: number, index: number): Mission {
  const r = rng((Math.imul(seed, 2654435761) + Math.imul(index, 40503)) >>> 0);
  const kind = secondTourKind(seed, index);
  const tpl = RAID_TEMPLATES.find(t => t.kind === kind);
  const target = tpl ? tpl.targets[Math.floor(r() * tpl.targets.length)] : { name: 'Industrial district', city: ['Berlin', 'Bremen', 'Frankfurt'][Math.floor(r() * 3)] };
  const role = index % 2 ? 'pilot' : 'gunner';
  const mood = (['clear', 'overcast', 'dusk', 'storm', 'night'] as const)[(index + (seed >>> 0) % 5) % 5];
  const difficulty = secondTourDifficulty(index);
  const duration = 200 + Math.round(40 * (difficulty - 1));
  // The endless extension is a fictional continuation in late 1945.
  const date = new Date(Math.min(Date.UTC(1945, 11, 31), Date.parse(CAMPAIGN.at(-1)!.date + ' UTC') + (index + 1) * 14 * 86400000));
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const jets = index >= 8, rockets = index >= 12, sturm = index >= 6;
  const boss = (index + 1) % 5 === 0;
  return {
    id: `tour2-${seed >>> 0}-${index}`, number: index + 1,
    title: `Second tour — ${tpl?.label ?? 'Cities'} — ${target.city}`,
    target: `${target.name}, ${target.city}`,
    date: `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
    role, station: role === 'gunner' ? (['waistL', 'top', 'tail', 'waistR', 'ball'] as const)[index % 5] : undefined,
    briefing: [
      `Second tour operation ${index + 1}: strike the ${target.name.toLowerCase()} at ${target.city}.`,
      'Each successful operation changes enemy strength, replacements and morale. Twenty-five victories earn the Second Tour Medal; operations continue afterwards.',
      role === 'pilot' ? 'You are flying close escort in a P-51D. Stay with the bombers until they are off the target, then you may go down and hunt.' : 'Defend the formation',
      ...(sturm ? ['Armoured Sturmböcke are joining the defence. Expect close attacks from astern.'] : []),
      ...(jets ? ['Me 262 jets are operational; later sorties also face Me 163 rocket fighters.'] : []),
      ...(boss ? ['A battle group guards this target. Destroy it in the final round.'] : []),
      ...(index >= 25 ? ['Extended service: a fictional continuation of the air war through late 1945.'] : []),
    ],
    objectives: [role === 'pilot' ? 'Defend the formation' : tpl?.objective ?? 'Bomb the industrial district', 'Survive the mission', 'Lose no more than 6 bombers'],
    success: tpl ? tpl.success(target) : `The industrial district at ${target.city} has been hit.`,
    bombers: 12, maxBombersLost: 6, escorts: role === 'pilot' ? Math.min(6, 3 + Math.floor(index / 8)) : undefined,
    escortArrive: role === 'gunner' ? Math.max(50, 110 - index * 2) : undefined,
    waves: [], duration, rounds: 2, boss: boss ? { first: 1 } : false,
    enemyTypes: ['fw190', 'bf109', ...(index >= 3 ? ['bf110' as const, 'ju88' as const] : []), ...(jets ? ['me262' as const] : []), ...(rockets ? ['me163' as const] : [])],
    round: { duration, start: 6, min: Math.round(5 * difficulty), max: Math.round(9 * difficulty), skill: [0.9 + (difficulty - 1) * 0.45, 1.12 + (difficulty - 1) * 0.5], rockets: index >= 3 ? Math.min(0.4, 0.12 + index * 0.008) : 0 },
    flak: role === 'gunner' ? { start: 65, end: 115, intensity: (tpl?.flak ?? 1) * difficulty } : undefined,
    bombsAway: role === 'gunner' ? 90 : undefined,
    weather: { mood, sunEl: mood === 'dusk' ? 5 : 30, sunAz: 190 + r() * 50, low: mood === 'storm' ? 0.95 : 0.6, high: mood === 'overcast' ? 0.9 : 0.4, contrails: mood === 'clear',
      front: index % 3 === 1 && mood !== 'night' ? { at: 55, to: mood === 'storm' ? 'clear' : 'storm', duration: 35 } : undefined },
  };
}

/** Spawn-time only; reuses the existing armoured Fw 190 treatment without new materials. */
export function secondTourSturmbock(m: Mission | null, f: Fighter) {
  if (!m || !isSecondTourId(m.id) || m.number < 7 || f.enemyType !== 'fw190') return;
  f.structure *= 1.4; f.maxStructure *= 1.4;
  for (const z of f.zones) { z.hp *= 1.3; z.maxHp *= 1.3; }
}
