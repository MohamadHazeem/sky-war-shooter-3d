# Phase 6 · Goal 6 — Ditching in the Channel

Report to: `docs/phase6/reports/06.md` · Dev server port: 5254

## Idea
When the Sky Queen is badly damaged on the way home (engines out / fuel leaking / low integrity) and
can't make England, the crew ditches in the North Sea / Channel. A dramatic, survivable ending instead
of a plain "shot down" failure, followed by an air-sea rescue.

## Read first
`src/game/Bookends.ts` + `src/world/Airbase.ts` + `src/game/FighterBookends.ts` (how the landing scenes
take over the camera, damage severity, skip/setting/autoplay rules), `src/world/PlayerBomberDamage.ts`,
`src/game/BailOutCinematic.ts`, `src/game/MissionFlow.ts` (finish/showDebrief, success vs failure),
`src/audio/SynthField.ts` / `Field.ts` (synthesised sounds), `src/i18n`.

## What to build
- Trigger: at mission end (success or a "can't make it home" condition), if the bomber's state is beyond
  belly-landing territory, or late-mission when two engines are out and the coast is far, the pilot calls
  "We're not going to make it — prepare for ditching".
- Scene (~25-35 s, skippable, same setting as take-off/landing): descent over a grey, wind-streaked sea
  (a new cheap ocean shader: waves, foam streaks, sun/moon glint, fog), crew in ditching positions, the
  impact with spray, the bomber settling, the crew launching the yellow dinghies.
- Rescue: a short epilogue — dinghies drifting, a flare fired, an RAF Walrus amphibian or an RAF high-speed
  launch arriving (simple models from primitives are fine), "Picked up by the RAF Air-Sea Rescue".
- Outcome: the mission counts as completed if the objectives were met (bombs dropped) but the bomber is
  lost; crew survive (CrewRoster: possible injuries); campaign state records the loss; merit with a
  "ditched" note; an achievement ("Goldfish Club" — the real club for airmen saved from the sea).
- Arabic for all strings; radio lines via lines.json + generate.py; autoplay skips the scene.

## Done when
`npm run check` passes (unit tests for the trigger rules); report with screenshots and exact steps to
force a ditching (e.g. a dev hook `sws.ditch()`).
