# Phase 10 · Goal 06 — Effects 2.0 (fire, smoke, explosions, flak, tracers, contrails)

Report: `docs/phase10/reports/06.md` · Port 5306 · Shots: `docs/phase10/shots/06/`
Read `docs/PHASE10.md`, `src/world/Effects.ts`, `src/render/Particles*`, `src/world/FighterDeath.ts`, `BomberDeath.ts`,
`DamageStages.ts`, flak code (`grep -rn flak src`), `src/world/Ballistics.ts` (tracers), contrail code, `World.prewarm`.
Blender is at `/Applications/Blender.app` (headless: `.../Contents/MacOS/Blender -b -P script.py`).

Effects today are simple sprites. Target: film-quality fire and smoke. Build:
- Offline-simulated volumetric flipbooks (Blender Mantaflow smoke/fire, rendered with lighting baked as normal/
  emission/density atlases so they can be relit in-game by the sun): fireballs, aircraft explosions, flak bursts
  (black 88 mm puffs with the orange core), engine fire, oily black smoke, white glycol, debris dust. Commit the
  generator scripts + compressed atlases (KTX2/WebP), ≤ ~12 MB total, lazy-loaded.
- In-game: lit soft particles (depth-faded, sun-lit with the baked normals, shadowed by clouds where cheap), smoke
  trails as camera-facing ribbon volumes that widen/thin with wind, fire that flickers and lights nearby geometry,
  sparks and burning debris, tracers with HDR cores + glow + heat shimmer, contrails that form/condense correctly
  and catch sunset light, flak box density that reads at distance.
- Pooled, no per-frame allocations, prewarmed; Low keeps cheaper sprites.
Done when: `npm run check` passes; captures before/after (explosion close, flak barrage, burning neighbour, contrails
at sunset); perf; pillar 5 self-score.
