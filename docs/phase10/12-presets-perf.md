# Phase 10 · Goal 12 — Presets & performance

Report: `docs/phase10/reports/12.md` · Port 5312 · Shots: `docs/phase10/shots/12/`
Read `docs/PHASE10.md`, every `docs/phase10/reports/*.md` (perf sections), `src/core/Engine.ts`, `src/game/AutoGraphics.ts`,
`src/render/*`, `tools/visual_rig.mjs`, `sws.bench`.

All Phase 10 features are now merged (renderer 2.0, clouds, ground, effects, destruction, cinematics/film look,
bomber stream, interior/crew, hero B-17, AI). Make the whole game run well at every preset:
- Budgets at 1080p on this M5 Pro: Low ≤ 5 ms, Medium ≤ 7 ms, High ≤ 9 ms, Ultra ≤ 14 ms, Cinematic ≤ 20 ms;
  p95 ≤ 1.5× the mean. Measure the full rig + a heavy combat autoplay per preset, find the top costs (ground ~1.4 ms
  on High, clouds, shadows/AO/TAA, stream, effects) and fix them (LOD, half-res, temporal amortisation, culling).
- Low must run on weak laptops: verify with a CPU/GPU throttle profile; Low keeps the old cheap paths.
- Dynamic resolution scaling on High+ to hold 60 fps; AutoGraphics picks a sensible default per device.
- No shader compiles mid-game; download size report (lazy assets) and first-load time.
Done when: `npm run check` passes; a perf table per preset before/after; report.
