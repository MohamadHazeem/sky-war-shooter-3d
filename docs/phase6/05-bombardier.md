# Phase 6 · Goal 5 — Bombardier seat (Norden bombsight)

Report to: `docs/phase6/reports/05.md` · Dev server port: 5253

## Idea
Gunner campaign missions with a bomb run (`bombsAway` in `src/game/Missions.ts`) currently drop bombs
automatically (`src/world/TargetArea.ts`, `TargetGround.ts`, Director bomb logic). Let the player take
the bombardier's seat for the run: a short, tense mini-game that decides how well the target is hit.

## Read first
`src/game/Missions.ts` (bombsAway, flak windows), `src/world/TargetArea.ts` + `TargetGround.ts`
(target city, carpet impacts, fires), `src/game/Director.ts` + `src/game/MissionFlow.ts`
(bomb-run flow, see `docs/ARCHITECTURE.md`), `src/game/GunnerController.ts` (stations; the nose is
not a station yet), `src/world/B17Layout.ts`, `src/render/Clouds.ts` (cloud cover over the target),
`src/game/Bookends.ts` (how a scene takes over the camera), `src/i18n` (Arabic).

## What to build
- ~30 s before bombs away the pilot calls "Bombardier, she's all yours" and the player is offered the
  bombsight (key/button, e.g. `N`, gamepad and touch too); declining keeps the automatic drop.
- Bombsight view from the B-17 nose: magnified, stabilised downward view through the Norden eyepiece,
  reticle with the drift/rate cross-hairs, the target city sliding up the view, flak bursts and the cloud
  layer drifting through (gaps matter: if the target is covered, the player can wait for a gap).
- Controls: steer the course (small left/right corrections, which the autopilot link flies), adjust the
  rate knob so the cross-hair stays on the aiming point; bombs release automatically when the sighting
  angle is reached, or manually.
- Result: impact pattern computed from the player's corrections + wind + flak jolts; show it with the
  existing carpet impacts and a strike photo in the debrief ("67 % within 1,000 ft of the aiming point"),
  with merit/score and a radio line; the career gets a "best bombing" stat.
- Tie-ins: an achievement ("Pickle Barrel": >80 % on target), Arabic for every string, voice lines via
  `tools/voice/lines.json` + `generate.py`, autoplay keeps the automatic drop.

## Done when
`npm run check` passes with unit tests for the scoring maths; works in m1 (Emden) and m3 (Ludwigshafen,
flak); report with exact steps + screenshots from your browser check.
