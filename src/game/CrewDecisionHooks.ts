// Game glue for the between-mission decisions (CrewDecisions.ts): two calls from MissionFlow.
//   beginCrewDecisions — startMission, before applyLoadout: freeze the plan, toughen the engines,
//                        sharpen the fighters on a volunteer mission.
//   endCrewDecisions   — showDebrief, after the merit is paid: fatigue, leave, the next break.
import { crewDecisions, workEffects, VOLUNTEER } from './CrewDecisions';
import { crewRoster } from './CrewRoster';
import { tx } from '../i18n';
import type { Mission } from './Missions';
import type { World } from '../world/World';

/** Gunner missions of the player's own crew (not the Gunnery School, the AA mode or co-op). */
export const decisionsApply = (m: Mission, coop: boolean) => m.role === 'gunner' && !m.tutorial && m.id !== 'survival-aa' && !coop;

export function beginCrewDecisions(world: World, m: Mission, coop: boolean) {
  if (!decisionsApply(m, coop)) { crewDecisions.skip(); return; }
  const plan = crewDecisions.begin(crewRoster.men);
  const k = workEffects(plan.work).engines;
  const pb = world.playerBomber;
  if (pb && k !== 1) for (const z of pb.zones) if (z.engine !== undefined) { z.hp *= k; z.maxHp *= k; }
  if (plan.volunteer) world.difficulty *= VOLUNTEER.enemy;
}

export function endCrewDecisions(world: World) {
  if (!crewDecisions.flying) return;
  const volunteer = crewDecisions.flying.volunteer;
  const pb = world.playerBomber;
  const flew = crewDecisions.end(crewRoster.men, pb?.alive ? pb.integrity : 0);
  if (volunteer && flew.length) {
    for (const id of flew) crewRoster.men[id].missions++;   // a volunteer mission counts double
    crewRoster.notes.unshift(tx('Volunteer mission: it counts double for {n} men', { n: flew.length }));
    crewRoster.notes.length = Math.min(crewRoster.notes.length, 4);
    crewRoster.save();
  }
}
