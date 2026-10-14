# Phase 10 · Goal 05 — Luftwaffe hero models

Report: `docs/phase10/reports/05.md` · Port 5305 · Shots: `docs/phase10/shots/05/`
Read `docs/PHASE10.md`, `docs/phase10/02-hero-b17.md` (the B-17 hero pipeline being built in parallel on branch
`phase10/02-hero-b17` — follow the same standards: PBR, baked AO/normal from high-poly, weathering, decals, 3 LODs,
KTX2 + meshopt, named parts), `docs/phase10/09-destruction.md` (named structural parts contract for physical
breakup, being built in parallel), `src/world/Models.ts`, `EnemyTypes.ts`, `EnemyDress.ts`, `AceLook.ts`,
`DamageLook.ts`, `FighterDeath.ts`, `public/models/CREDITS.md`, `tools/convert_models/*`, `tools/compress_models.mjs`.
Blender: `/Applications/Blender.app/Contents/MacOS/Blender -b -P script.py`.

The gunner sees German fighters at 50–600 m all game long; they must look real. Build hero models (same pipeline
quality as the B-17) for Bf 109G-6, Fw 190A-8, Me 262A-1a, Bf 110G and Ju 88A-4 (Me 410 if time): accurate shapes,
cockpit with pilot figure and canopy framing, period camouflage schemes (RLM 74/75/76 mottles, Defence of the Reich
bands, yellow cowlings, unit markings, Balkenkreuz/Hakenkreuz omitted or per local law — use Balkenkreuz only),
exhaust staining, oil streaks, chipped wing roots, prop spinners with spirals, moving control surfaces, gear,
named parts for destruction. Ace variants (kill markings, personal emblems). Replace the FlightGear models in game
with LODs. Licence-clean sources only (CC0/CC BY/GPL-compatible or own work from public-domain drawings), logged.
Budget ≤ ~8 MB per type lazy-loaded; Low uses LOD2.
Done when: `npm run check` passes; turntables + in-game captures (waist view at 150 m, tail view of a diving 109,
head-on wedge of 190s) before/after; perf; licence log; pillar 1 self-score.
