# Phase 10 · Goal 11 — Enemy AI 2.0 (aces and real tactics)

Report: `docs/phase10/reports/11.md` · Port 5311 · Shots: `docs/phase10/shots/11/`
Read `docs/PHASE10.md`, `src/world/AI.ts`, `DogfightAI.ts`, `Tactics.ts`, `LuftwaffeTactics.ts`, `EnemyTypes.ts`,
`src/game/Director.ts`, `Nemesis*.ts`, `AceLook.ts`, `src/game/Pacing.ts`, Phase 8 goal 4 report.

Make enemy fighters feel like skilled human pilots, from the gunner's point of view. Build: energy-based flight
decisions (dive, zoom, extend, re-attack) within real performance envelopes per type; attack geometry chosen per
target bomber weakness (dead turret, straggler, damaged engine side), coordinated passes in Schwärme (pairs, fours,
staggered), evasive breaks when the gunner's fire gets close (jinking, split-S), wounded aircraft limping home or
pressing on; named aces with personalities (aggressive, cunning, cautious) and signature moves the crew learns to
recognise; difficulty scales decision quality not just accuracy; respect the Phase 8 marker rules. Readable, fair,
deterministic in tests.
Done when: `npm run check` passes with tests (energy model, attack selection, evasion triggers); captured sequences
from gunner seats; hit-rate / survival numbers before/after per difficulty; report.
