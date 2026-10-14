# Phase 9 · Goal 5 — B-17 damage and crew in action

Report: `docs/phase9/reports/05.md` · Port 5295 · Shots: `docs/phase9/shots/05/`

Read first: `src/world/PlayerBomberDamage.ts`, `src/game/Ditching*.ts`, `BailOutCinematic.ts`, `CrewRoles.ts`,
`CrewRoster.ts`, `LivingInterior.ts`, `CrewFigure.ts`, `InteriorDamage.ts` (Phase 8), `GunnerSurvival.ts` (Phase 8),
`src/game/RadioChatter.ts`, `src/i18n`.

Build: the player's B-17 as a living machine: engines that can be feathered/catch fire/run away; fire in the
fuselage/bomb bay that the player (or crew) fights with an extinguisher (short hold action at the right spot);
control damage (pilot struggling, formation drift); crewmen visibly moving through the fuselage to help
(ammo, first aid, fire), wounded crewmen replaced at guns by others; if the ship is lost, a "bail out!" sequence
where the player gets out (chute view) and the debrief records who made it. Pacing: dramatic but not constant;
respect difficulty. Arabic, Chatterbox voice lines. Tests for damage/fire/bail-out state.

Done when: `npm run check` passes; screenshots of each state at gunner seats; report.
