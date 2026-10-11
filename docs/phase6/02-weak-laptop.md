# Phase 6 · Goal 2 — Weak-laptop pass

Report to: `docs/phase6/reports/02.md` · Dev server port: 5256

## Problem
The game was tuned on an Apple M5 Pro. A first-launch benchmark (`src/game/AutoGraphics.ts`,
`src/render/QualityPick.ts`, thresholds explained in `docs/PHASE5.md` goal 33) picks Low–Ultra, but its
thresholds were never tried on a weak GPU, and the Low preset was only checked for "not broken".

## Read first
`src/core/Engine.ts` (presets, pixel budget, dynamic resolution, `drsAbsorb`, FrameTiming.ts),
`src/render/QualityPick.ts`, `src/game/AutoGraphics.ts`, `src/render/Clouds.ts`, `src/render/PostFX.ts`,
`src/render/SurfaceDetail.ts`, `src/render/LivingSky.ts`, `src/world/Countryside.ts`,
`tools/gallery/visual-qa/README.md` (notes on how Low looks).

## What to do
- Simulate weak hardware: e.g. force a high device-pixel workload, throttle with an artificial GPU cost
  (extra full-screen passes) or CPU throttling in your browser, and measure what each preset costs
  relative to High. Document a cost model per preset and feature (clouds, shadows, post, surface
  detail, living sky, explosions, countryside).
- Re-tune `QualityPick` thresholds from that model; make sure dynamic resolution recovers before the
  picker drops a whole tier; add a "Low+" path if it helps (e.g. half-res clouds, no reprojection, no
  heat haze, simplified explosions).
- Make Low look good: clouds still volumetric-looking (cheaper steps), basic shadows or a blob
  shadow under aircraft, no light leaking through the hull interior on Low (noted in the visual-QA
  README), readable HUD. Keep Medium a clear step up.
- Unit tests for the new thresholds; frame-time table per preset in the report.

## Done when
`npm run check` passes; report with the cost table, before/after screenshots of Low, and the new
thresholds with reasoning.
