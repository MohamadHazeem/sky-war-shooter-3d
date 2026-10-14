# Phase 10 · Goal 01b — Renderer 2.0: make it visible, make it fast

Report: `docs/phase10/reports/01b.md` · Port 5301 · Shots: `docs/phase10/shots/01b/`
Continue on branch `phase10/01-renderer`. Read your report `docs/phase10/reports/01.md`, `docs/PHASE10.md`.

## Review (lead)
The foundation is in, but `docs/phase10/shots/01/comparison.jpg` shows before and after are almost identical in all
16 shots, and High misses the 8 ms budget. A renderer upgrade that the player can't see is not done. The owner rates
the graphics 10/100 and wants 100.
## Do
1. Make the lighting change obvious and film-like in every rig shot, judged against the reference board
   (`docs/phase10/reference.md`): strong sun-driven shading on aircraft (clear terminator on fuselage curvature,
   specular sheen on painted metal / natural metal, sky-coloured fill from IBL), **visible self-shadowing and
   formation shadows** (wings on fuselage, turret/gun shadows inside the gunner's view, cloud shadows on aircraft),
   GTAO in crevices (nacelles, wing roots, cockpit frames), crisp TAA without smearing, a confident film grade per
   mood (not a washed-out grey look — current shots are low-contrast and hazy), exposure that keeps cloud tops
   bright without blowing out aircraft. Tune materials so olive drab, neutral grey and natural metal read correctly.
2. Performance: High ≤ 8 ms, Ultra ≤ 14 ms at 1080p (find and fix the outliers). If WebGPU is not faster or not
   stable, ship WebGL2 as the default and keep WebGPU behind the Ultra/Cinematic preset or a flag — decide with data.
3. Re-run the full rig (`node tools/visual_rig.mjs`), produce a new comparison sheet, and in the report score each
   pillar touched honestly against the reference board.
Done when: `npm run check` passes; the before/after sheet shows an obvious improvement in every shot; perf targets met.
