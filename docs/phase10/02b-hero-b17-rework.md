# Phase 10 · Goal 02b — Hero B-17 rework (accuracy first)

Report: `docs/phase10/reports/02b.md` · Port 5302 · Shots: `docs/phase10/shots/02b/`
Continue on branch `phase10/02-hero-b17`. Read your report `docs/phase10/reports/02.md`, `docs/PHASE10.md`,
`tools/convert_models/*` (the FlightGear B-17 conversion), `public/models/CREDITS.md`.

## Review (lead)
`docs/phase10/shots/02/after-beauty.jpg` looks less like a B-17 than the old FlightGear model (`before-beauty.jpg`):
the fuselage is too short and fat, nacelles oversized, nose/canopy/turret shapes simplified — it reads as a toy. The
pipeline work is useful; the model built from scratch is not acceptable for a "hero" asset.
## Do
- Start from the **accurate FlightGear B-17 geometry** (GPL, already in the game) or another licence-clean accurate
  source as the shape reference/base mesh — never regress the silhouette. Verify proportions against public-domain
  B-17G three-view drawings (length 22.66 m, span 31.62 m, fuselage and nacelle sections) with an automated
  silhouette overlay check in the report.
- Then add the hero detail through your pipeline: high-poly panel lines, rivet rows, fasteners, de-icer boots,
  cowl flaps, exhaust/turbosupercharger, the Cheyenne tail, chin turret, staggered waist windows, ball turret,
  antennas and pitot; baked normal/AO/curvature; PBR olive drab/neutral grey with chalky fade, exhaust soot, oil
  streaks, walkway scuffs, chipped leading edges; and a natural-metal variant.
- Texture compression: you may install the Basis/KTX2 encoder (`npm i -D` of a Basis encoder package, or Homebrew
  `basisu`) — this task explicitly allows it. Keep WebP fallback.
- Keep LODs and named parts (also see `docs/phase10/09-parts-contract.md` from goal 09 on main, and the stream LOD
  contract in `docs/phase10/stream-lod-contract.md` if present).
Done when: `npm run check` passes; turntable + rig shots show a B-17 that is clearly better than the old model up
close and at formation distance; silhouette overlay within tolerance; report with honest pillar-1 score.
