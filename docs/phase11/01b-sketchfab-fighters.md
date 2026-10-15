# Phase 11 · 01b — Hero fighters from the Sketchfab models (Bf 109, Fw 190)

Report: `docs/phase11/reports/01b.md` · Port 5330 · Shots: `docs/phase11/shots/01b/`

Source models (CC BY 4.0, credits in `assets-src/sketchfab/CREDITS.md`): `assets-src/sketchfab/bf_109_f-2_messerschmitt.glb`
(GRIP420, 68k polys, 4K textures) and `assets-src/sketchfab/fw_190.glb` (Saman Salili, 202k polys). Run them through the
hero pipeline (`tools/hero/*`, see `docs/phase10/reports/05b.md`): correct scale/axes to the game's conventions, our
period paint (G-6/A-8 Defence of the Reich schemes, markings, weathering) using their UVs or a re-unwrap, LOD0/1/2,
KTX2 + WebP fallback, named parts for physical destruction (`docs/phase10/09-parts-contract.md`), pilot, prop discs,
control surfaces. They replace the current Bf 109 / Fw 190 only if clearly better in turntables and in the capture-rig
waist/tail/head-on shots (legacy | new sheets). Add the authors to `public/models/CREDITS.md` and the in-game credits.
Budget ≤ 8 MB per type lazy-loaded. Also replace the unlicensed FlightGear pilot figures (Augras collection) in all
aircraft with our own crew model (`public/interior/crew.glb` or a seated variant) and remove those credits.

Rules: read `AGENTS.md` (CI flow, `tools/heavy.sh`, quality gate), `docs/PHASE11.md`. Never `channel: 'chrome'`, never computer use.
