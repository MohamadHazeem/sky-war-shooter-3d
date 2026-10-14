# Phase 9 · Goal 2 — Bomb run drama

Report: `docs/phase9/reports/02.md` · Port 5292 · Shots: `docs/phase9/shots/02/`

From the IP to "bombs away": the most tense part of a real mission, from the gunner's seat.

Read first: `src/game/Bombardier.ts`, `BombingMath.ts`, `src/ui/BombingReport.ts`, `src/world/TargetArea.ts`,
`GroundTargets.ts`, flak systems (`grep -r flak src`), `src/game/Missions.ts`, `Pacing.ts`, `Director.ts`,
`RadioChatter.ts`, `src/audio/*`, weather (`src/render/WeatherPresets.ts`).

Build: a clear bomb-run phase in gunner campaign missions: "IP inbound" → straight and level, no evasive action;
flak boxes that walk toward the formation (black bursts, near-miss shrapnel rattling the skin, a nearby B-17
hit by flak); fighters back off over the flak; crew interphone (bombardier counting down, pilot "steady…",
"bomb bay doors open", ice-cold wind through the open bays); the target visible below (smoke from earlier
waves, markers); "Bombs away!" with the aircraft lifting; then rally point and the fighters return. Gunner can
watch the bombs fall and see the strike; a short strike result (on/off target) in the debrief. Weather affects
it (cloud = bombing through overcast). Skippable for players who want only combat? No — keep it short (~45–75 s)
and tense. Arabic, voice lines (Chatterbox). Tests for the phase state machine and flak walk.

Done when: `npm run check` passes; screenshot sequence of a full bomb run from two gunner seats; report.
