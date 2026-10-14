# Phase 10 · Goal 02 — Hero asset pipeline + the B-17 hero model

Report: `docs/phase10/reports/02.md` · Port 5302 · Shots: `docs/phase10/shots/02/`
Read `docs/PHASE10.md`, `tools/convert_models/*`, `tools/compress_models.mjs`, `public/models/CREDITS.md`,
`src/world/Models.ts`, `Aircraft.ts`, `DamageLook.ts`, `B17Layout.ts`, `NoseArt.ts`. Blender is installed at
`/Applications/Blender.app` (run headless: `/Applications/Blender.app/Contents/MacOS/Blender -b -P script.py`).

Goal: aircraft that look real up close. Today's FlightGear models are low-poly with flat textures.
Build:
1. **Pipeline** (`tools/hero/`): Blender Python scripts that take a base mesh (best available licence-clean source:
   CC0/CC BY/GPL-compatible models downloadable without login, or rebuilt from public-domain 3-view drawings and
   NASM/NARA references — document the choice) and produce: clean topology at 3 LODs, UV unwrap, baked AO/curvature/
   normal maps from a high-poly pass (panel lines, rivets, fasteners modelled or procedurally generated on the
   high-poly), PBR texture sets (base colour with olive drab + neutral grey or natural metal, roughness, metalness,
   normal), weathering (exhaust stains, oil streaks, paint chipping on walkways/edges, faded paint), national
   insignia/group markings/serials as decals, glass with proper transmission; exports glTF with KTX2 (Basis)
   textures + meshopt; one command to rebuild.
2. **B-17G hero model** through the pipeline: accurate shape (Norden nose, chin turret, cheek guns, staggered waist
   windows, Sperry ball turret, Cheyenne tail), moving parts (props with blur discs, turrets, guns, flaps, bomb bay
   doors, gear), damage-ready (named sub-meshes for wings/tail/engines matching `DamageLook`/`BomberDeath`), nose art
   per ship. Replace the B-17 everywhere (player, formation, menu, hangar) with LODs and instancing for the stream.
3. Keep download reasonable (lazy-load hero textures; ≤ ~15 MB for the B-17 set) and Low preset on LOD2.

Done when: `npm run check` passes; turntable renders + in-game rig shots before/after (exterior beauty, formation,
waist view of neighbours); perf; licence log; report with pillar 1 self-score.
