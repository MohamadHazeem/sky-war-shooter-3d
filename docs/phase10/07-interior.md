# Phase 10 · Goal 07 — B-17 interior 2.0 and crew characters

Report: `docs/phase10/reports/07.md` · Port 5307 · Shots: `docs/phase10/shots/07/`
Read `docs/PHASE10.md`, `src/game/LivingInterior.ts`, `InteriorProps.ts`, `InteriorFx.ts`, `InteriorDamage.ts`,
`TurretInteriors.ts`, `CrewFigure.ts`, `Viewmodels.ts`, `src/world/B17Layout.ts`, `src/render/*` (prewarm, shafts).
Blender: `/Applications/Blender.app/Contents/MacOS/Blender -b -P script.py`.

The gunner spends the whole game inside the B-17. Make every station look like a museum aircraft come alive: modelled
formers/stringers/skin with rivet normal detail and zinc-chromate/bare-aluminium PBR, oxygen bottles and regulators,
ammo boxes and chutes with brass, intercom boxes, flak curtains/vests, the radio room, the bomb bay catwalk, the
ball turret and tail interiors; wear, dirt, frost; volumetric sun shafts through windows and bullet holes with dust;
crew characters (sheepskin B-3 jackets, flak helmets, oxygen masks, Mae Wests) built in Blender with a simple rig
and idle/firing/hit/helping animations — replacing today's simple figures; the player's own hands/arms on the
grips. Lazy-loaded, LODs, ≤ ~15 MB; Low keeps today's interior.
Done when: `npm run check` passes; captures per station before/after; perf; pillar 6 self-score.
