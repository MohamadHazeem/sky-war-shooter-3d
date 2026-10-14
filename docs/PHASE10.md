# Phase 10 — "From 10 to 100": graphics and gameplay

Owner (2026-10-14): today's graphics are **10/100**; the target is **100/100 or more**. Use anything that gets there
— new renderer, new assets, offline simulation, invented techniques. Focus: graphics and gameplay, B-17 gunner first.

## What "100" means (the bar)
A screenshot from the gunner's seat should be mistaken for a frame of a high-end WWII film/animation (Yarnhub,
*Masters of the Air*, *Memphis Belle*) or a top flight sim (IL-2 Great Battles, War Thunder, MSFS clouds) — in a browser.

## Visual scorecard (10 pillars × 10 points)
Every graphics goal is judged on fixed camera shots from the capture rig (goal 0) — same shots before and after.
| Pillar | Today (est.) | Target |
|---|---|---|
| 1 Aircraft models & materials (shape, PBR, panel lines, rivets, weathering, decals) | 1 | 10 |
| 2 Lighting & shadows (sun, sky IBL, self-shadowing, AO, exposure) | 1 | 10 |
| 3 Clouds & sky (volumetric, multiple scattering, shadows, fly-through) | 2 | 10 |
| 4 Ground from altitude (Europe 1943–44, haze, rivers, towns, cloud shadows) | 1 | 10 |
| 5 Effects (fire, smoke, explosions, flak, tracers, contrails, debris) | 1 | 10 |
| 6 B-17 interior & crew (detail, light shafts, people) | 1 | 10 |
| 7 Camera & post (TAA, motion blur, DOF, film grade, lens) | 1 | 10 |
| 8 Scale & spectacle (hundreds of bombers, escorts, contrail fields) | 1 | 10 |
| 9 Destruction (physical breakup, fragments, fire spread) | 1 | 10 |
| 10 Performance & polish (smooth on this Mac at High/Ultra; Low still works) | 1 | 10 |

## Waves (OpenAI Codex implements, max 3 sessions at once; Claude reviews, merges, deploys)
**Wave A — foundations**
- 00 Visual capture rig + reference board + scorecard tooling
- 01 Renderer 2.0: WebGPU path (WebGL2 fallback), TAA, GTAO, cascaded shadows, PBR + sky IBL, exposure, LUT grading
- 02 Hero asset pipeline (Blender) + the B-17 hero model (exterior, PBR, LODs, KTX2)
- 03 Clouds & sky 2.0 (Nubis-grade volumetrics, temporal reprojection, cloud shadows)

**Wave B — the world**
- 04 Ground from altitude 2.0 (real elevation + procedural 1940s Europe, rivers, towns, haze, cloud shadows)
- 05 Luftwaffe hero models (Bf 109G, Fw 190A, Me 262, Bf 110, Ju 88) through the pipeline
- 06 Effects 2.0 (offline-simulated volumetric flipbooks, lit soft particles, smoke ribbons, flak)
- 07 B-17 interior 2.0 + crew characters

**Wave C — gameplay & spectacle**
- 08 The thousand-bomber stream (massive instanced formations, escorts, contrail fields)
- 09 Physical destruction (mesh fracture by hit location, fragments, fire spread, bail-outs)
- 10 Cinematic combat director (kill cams, slow-mo close passes, film camera moments) + post (DOF, motion blur, lens, grain)
- 11 Enemy AI 2.0 (aces with personalities, energy tactics, coordinated passes)

**Wave D — finish**
- 12 Presets & performance (Low…Ultra/Cinematic, dynamic resolution, budgets) + graphics QA
- 13 Final scorecard: before/after board for all pillars, fixes for any pillar below target

## Rules for every Phase 10 goal
- Before/after captures from the rig (goal 0) in the report, plus a self-score per pillar touched.
- Low preset must keep working; WebGL2 fallback must keep working if WebGPU is used.
- Asset licences: CC0 / CC BY / own-made only, logged in `public/models/CREDITS.md` / `public/audio/CREDITS.md`;
  no login-walled downloads; no copyrighted reference images committed (links only).
- Download size: lazy-load heavy assets; KTX2/Basis textures; meshopt geometry.

| # | Goal | Spec | Status |
|---|---|---|---|
| 00 | Capture rig + reference board | [00](phase10/00-capture-rig.md) | Done — live |
| 01 | Renderer 2.0 | [01](phase10/01-renderer.md) | Done — live |
| 02 | Hero asset pipeline + B-17 | [02](phase10/02-hero-b17.md) | Done — live |
| 03 | Clouds & sky 2.0 | [03](phase10/03-clouds.md) | Done — live |
| 04, 06, 07, 08, 09, 10, 11 | Wave B–C goals | specs in docs/phase10 | Done — live |
| 05 | Luftwaffe hero models | [05](phase10/05-luftwaffe-models.md) | Done — live |
| 12, 12b, 13 | Presets & performance, CPU pass, final scorecard | [12](phase10/12-presets-perf.md), [12b](phase10/12b-cpu-perf.md), [13](phase10/13-final-scorecard.md) | Done — live |
