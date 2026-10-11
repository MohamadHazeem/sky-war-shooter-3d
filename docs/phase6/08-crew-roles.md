# Phase 6 · Goal 8 — Crew that matters

Report to: `docs/phase6/reports/08.md` · Dev server port: 5259

## Idea
The 10 named crewmen have portraits, levels and wounds, but where they sit barely matters. Make crew
assignment a real decision: each position uses a skill, and losing a veteran hurts.

## Read first
`src/game/CrewRoster.ts`, `src/ui/CrewPanel.ts` (hangar seat assignment), `src/ui/Portraits.ts`,
`src/world/World.ts` (bomberGunners: the AI gunners at the other stations, accuracy; wounds),
`src/world/PlayerBomberDamage.ts` (repairs, fires, extinguishers), `src/game/Skills.ts` (player skill
tree — don't duplicate), `src/game/CrewRoom.ts` (lines referencing crew), `src/i18n`.

## What to build
- Crew stats: gunnery, spotting, mechanics, first aid, nerve; growing with XP; traits from their
  personalities (e.g. Walsh steady, Mendez sharp-eyed).
- Position effects (data-driven): AI gunner accuracy and reaction at each gun = that man's gunnery;
  spotting calls earlier (radar/incoming warning lead time); the engineer (top turret) speeds repairs
  and fire fighting; the radio operator gives first aid (faster field dressing, fewer serious wounds);
  pilots affect evasive jinks and formation keeping.
- Hangar UI: drag or tap to assign, stat bars, a recommended layout button; clear tooltips.
- Consequences: wounded men miss missions (hospital), rookies are weak, a veteran's death (rare, only on
  heavy losses) is marked in the crew room and the roster memorial.
- Keep balance sane (effects ±10-25 %), Arabic for all strings.

## Done when
`npm run check` passes with unit tests for the stat effects; browser check of the hangar crew screen and a
mission showing the difference (e.g. log AI gunner hit rates for a veteran vs rookie); screenshots.
