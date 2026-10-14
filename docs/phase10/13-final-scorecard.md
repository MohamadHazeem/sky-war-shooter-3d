# Phase 10 · Goal 13 — Final scorecard and the weakest pillars

Report: `docs/phase10/reports/13.md` · Port 5313 · Shots: `docs/phase10/shots/13/`
Read `docs/PHASE10.md` (10 pillars), `docs/phase10/reference.md`, all `docs/phase10/reports/*.md`.

1. Run the full capture rig (`node tools/visual_rig.mjs`) on High and Cinematic; produce the final before (baseline)
   vs after board for all 16 shots and an honest per-pillar score against the reference board.
2. Fix the known weak spots (each as its own commit): flak puffs read soft/blobby; the contrail field should become the
   milky sheet seen in WWII photos; thin white ice-crystal streaks over the top-turret sky; distant boxes > 5 km are
   dots; distant fights lack tracer streaks; crew figures lack cloth/folds detail; B-17 and P-51 still use the old
   break-ups (port goal 09's physical destruction); contrail shading after the clouds merge needs a visual check at
   sunset; the Luftwaffe hero models if merged.
3. Then take the two lowest-scoring pillars and push each up by ≥2 points with focused work.
Done when: `npm run check` passes; final board + scorecard committed; report with before/after scores per pillar.
