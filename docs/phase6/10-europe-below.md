# Phase 6 · Goal 10 — Europe below the clouds

Report to: `docs/phase6/reports/10.md` · Dev server port: 5255

## Idea
At 25,000 ft the world below the cloud deck is mostly a flat haze. Through cloud gaps the player should
see real-looking terrain: patchwork fields, forests, rivers, towns, coastlines over the North Sea legs,
and, near the target, the target city burning with smoke columns rising through the clouds.

## Read first
`src/render/Clouds.ts` (layers, cloud shadows, gaps), `src/render/Sky.ts` + `Atmosphere.ts` (haze,
aerial perspective), `src/world/Countryside.ts` (low-level procedural ground used by Train Busting — reuse
ideas, but this is a far-view layer), `src/world/TargetArea.ts` / `TargetGround.ts` (bombing target),
`src/game/Missions.ts` (each mission's target/route, dates; `src/ui/BriefingMap.ts` has the coastlines),
`src/core/Engine.ts` (quality presets, floating origin), `docs/ARCHITECTURE.md`.

## What to build
- A far-terrain layer at ground level under the formation: large procedural texture/mesh (clipmap or a
  few LOD rings) with fields, woods, rivers and towns, coloured by season/mission date (summer greens,
  autumn browns, winter snow for Dec/Jan missions), heavy aerial perspective so it sits 7.6 km below.
- Route awareness: sea vs land along the mission route (North Sea crossing, Dutch/German coast), using the
  coastline data from BriefingMap so the coast passes underneath at the right time.
- Target area: the mission's target city drawn denser; after bombs away, fires and smoke columns rising
  (smoke reaching the cloud layer); flak bursts' ground flashes optional.
- Cloud shadows should fall on it (Clouds.ts already computes a shadow map).
- Cost: ≤1 ms on High, a simpler version on Medium, off or very cheap on Low; no shader stalls.

## Done when
`npm run check` passes; screenshots from your browser check: a gap over farmland, the coast crossing,
the burning target from altitude; report with frame-time numbers (`sws.bench`).
