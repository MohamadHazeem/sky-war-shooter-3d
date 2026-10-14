# Phase 8 · Goal 4 — Luftwaffe tactics pack (against the bomber gunner)

Report to: `docs/phase8/reports/04.md` · Dev server port: 5284 · Screenshots: `docs/phase8/shots/04/`

## Idea
Make enemy attacks on the B-17 formation varied and readable. Each tactic has a clear warning (crew
callout + visual tell) and a counter the gunner can learn.

## Read first
`src/world/AI.ts`, `Tactics.ts`, `DogfightAI.ts`, `EnemyTypes.ts`, `src/game/Director.ts`, `Pacing.ts`,
`SpecialEvents.ts`, `RandomEvents.ts`, `SetPieces.ts`, `src/game/RadioChatter.ts`, `src/world/Raid.ts`,
`src/world/PlayerBomberDamage.ts`, `src/game/Missions.ts`, existing rocket/Zerstörer specials — check what
already exists and extend rather than duplicate. Voice: `tools/voice/lines.json`, Chatterbox `--only`.

## What to build (only what does not already exist; upgrade the rest)
- **Sturm wedge head-on attack:** 6–12 armoured Fw 190A-8 in a tight wedge from 12 o'clock level, closing
  fast; the top turret / chin / nose positions must fire early; crew calls "Wedge at twelve!".
- **Me 410 stand-off:** heavy fighters holding at 800–1,200 m firing 21 cm rockets or 50 mm cannon at the
  formation; tell = rocket smoke trails / slow cannon tracers; counter = sustained long-range fire.
- **Air-to-air bombing:** Bf 109s above the formation dropping time-fused bombs; tell = fighters holding
  high at 12 o'clock, bomb flash; counter = top turret.
- **Me 262 slashing pass:** very fast pass from 6 o'clock low/high; brief window; tail gunner focus.
- **Coordinated multi-axis attack:** two groups from different clocks at once (forces target choice).
- **Ram/close Sturm finisher** optional.
- Director integration: introduced progressively across the campaign and survival waves, with a short
  "new tactic" card the first time each appears (one line, gunner-friendly, respecting HUD detail).
- Arabic for strings, new radio lines per tactic.

## Done when
`npm run check` passes with unit tests (formation geometry, timing, warning lead times, director
scheduling); browser screenshots/sequence of each tactic from a gunner seat; report with tuning numbers.
