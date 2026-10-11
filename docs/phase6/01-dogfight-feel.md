# Phase 6 · Goal 1 — P-51 dogfight feel: bandits that stay and fight

Report to: `docs/phase6/reports/01.md`

## Problem
In P-51 escort missions (m4, m7, m9, survival-pilot) the player spends most of the time chasing.
Measured (see `docs/BALANCE.md`, section on goal 34, lines ~240-300): in a 9-10 min mission the
chased bandit is inside 600 m for only ~2.5 min, 600-1500 m for ~4 min, beyond for ~3.5 min; firing
time is only 10-35 s; rounds almost always end on their time limit instead of the waves being killed.
Bomber attackers fly 1.5-2.3 km set-up runs between passes, the P-51 is only ~10-15 m/s faster than an
Fw 190, and bandits that are attacked extend away. Earlier quick tweaks (noticing the Mustang at
1200 m, longer turning fights, one extender at a time) gave no measurable gain with the scripted bot.

## Read first
- `src/world/AI.ts` (FighterPilot states: attack runs on bombers, `dogfightChance`, `bfm`),
  `src/world/DogfightAI.ts` (break, scissors, spiral, extend, zoom, head-on, wingman pairs, per-type
  styles), `src/game/PilotOps.ts` / `src/game/PilotRounds.ts` (scripted rounds, round end rules),
  `src/world/FlightModel.ts` (P-51 vs fighter performance), `tests/dogfight.test.ts`,
  `src/dev/autoplay.ts` (pilot bot, `swsDuel`), `docs/BALANCE.md`.

## What to do
Make escort combat a fight, not a chase, while bandits still threaten the bombers:
- When the Mustang engages a bandit (on its tail within ~1.2 km or shooting at it), that bandit should
  usually turn and fight (scissors / break turns / head-on reversals) rather than extend 2 km; only some
  types extend (Me 262 slashing, Fw 190 occasional zoom), and they come back sooner.
- Bomber-attack set-up runs should be shorter / tighter when escorts are around, so bandits stay near
  the box where the player is.
- Bandits not engaged by the player keep attacking bombers (the threat must remain).
- Keep per-type personality and skill scaling; do not make them suicidal or trivially easy.
- Measure headlessly: extend `tests/dogfight.test.ts` (or add a sim test) that runs short scripted
  engagements with the existing bot-style pursuit and asserts e.g. median time inside 600 m goes up and
  time-to-kill in a duel stays in a sane range (bandits must still evade sometimes).

## Done when
- `npm run check` passes; new/updated tests cover the engagement behaviour.
- Report gives before/after numbers from the headless sims, the changes (file:line), and how the
  reviewer can verify in the browser (e.g. `sws.autoplay(sws.CAMPAIGN.find(m => m.id === 'm4'), 30000)`
  expecting more kills and rounds ending on kills, and `swsDuel(...)` cases).
