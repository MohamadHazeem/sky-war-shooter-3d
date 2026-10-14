# Phase 10 · Goal 01 — Renderer 2.0

Report: `docs/phase10/reports/01.md` · Port 5301 · Shots: `docs/phase10/shots/01/`
Read `docs/PHASE10.md`, `docs/ARCHITECTURE.md`, `src/core/Engine.ts`, `src/render/*` (PostFX, Atmosphere, Sky,
Clouds, Particles), `src/world/World.ts` (prewarm), `src/game/AutoGraphics.ts`, three r186 docs for
`WebGPURenderer`/TSL (in node_modules/three).

Goal: the lighting/rendering foundation for a 100/100 look. You may move to Three.js **WebGPURenderer + TSL**
(with an automatic **WebGL2 fallback** path that keeps today's look) if it's the best route — decide with
evidence (prototype + measurements on this M5 Pro Mac in Chrome).
Build:
- Physically based lighting: sun + sky IBL generated from the dynamic sky (PMREM/irradiance updated when the sun or
  weather changes), correct units/exposure (auto-exposure with eye adaptation), AgX or ACES-fit tonemapping with a
  film-like LUT grading pipeline (per mood: Yarnhub warm/cold, overcast, dusk, night).
- Shadows: cascaded shadow maps tuned for aircraft at 10–2,000 m (self-shadowing on wings/fuselage, turret
  shadows on the interior), soft PCF/PCSS; contact shadows if cheap.
- Ambient occlusion: GTAO (or SSAO) at half-res with temporal accumulation.
- Anti-aliasing: TAA with motion vectors (or a temporal upscaler) so thin geometry (props, antennas, guns, tracers)
  is stable; sharpening.
- Bloom (energy-conserving), lens dirt option; keep tracers/fires HDR-correct.
- A quality ladder: Low (today) / Medium / High / Ultra / Cinematic; AutoGraphics picks a default.
- Material audit: every existing material converted to correct PBR parameters so goals 02/05/07 slot in.
Use the capture rig (goal 00, if merged; otherwise a minimal set of the same shots) before/after. Frame-time budget
on this Mac: High ≤ 8 ms, Ultra ≤ 14 ms at 1080p. No shader recompiles mid-game (prewarm).

Done when: `npm run check` passes; before/after captures for all rig shots; perf table per preset; WebGL2 fallback
proven; report with pillar self-scores (2, 7, 10).
