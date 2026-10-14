# Phase 9 · Goal 1 — The living formation

Report: `docs/phase9/reports/01.md` · Port 5291 · Shots: `docs/phase9/shots/01/`

The owner loves the B-17 gunner game. Make the bomber stream around the player feel alive and costly.

Read first: `src/world/World.ts`, `Raid.ts`, `BomberDeath.ts`, `Wrecks.ts`, `Effects.ts`, `src/game/SetPieces.ts`,
`Director.ts`, `RadioChatter.ts`, `Ditching*.ts`, `Missions.ts`, `docs/ARCHITECTURE.md`; voice via `tools/voice/lines.json` +
`python3 tools/voice/generate.py --only <prefix>` (Chatterbox).

Build: other B-17s visibly take damage (holes, feathered props, engine fires, smoke trails), fall out of
formation as stragglers that fighters swarm, go down in varied ways (spin, break in two, explode, controlled
glide with chutes — count the chutes, crew calls "I see 4… 5 chutes!"), ditch in the sea on the way home;
formation tightens/re-forms after losses; lead ship/deputy lead changes; squadron names and nose art on
nearby ships; radio chatter from other ships; the formation reacts to fighters (gunners from neighbouring
bombers fire visible tracers and score kills). Data-driven, pooled, LOD by distance, Low preset fast. Keep the
HUD clean (Phase 8). Arabic for any text. Tests for loss/straggler state machines and re-forming.

Done when: `npm run check` passes; screenshots/sequences from gunner seats; `sws.bench` before/after; report.
