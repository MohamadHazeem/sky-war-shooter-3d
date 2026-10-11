# Phase 6 · Goal 3 — Cloud-top shimmer just above the deck

Report to: `docs/phase6/reports/03.md`

## Problem
With the camera a little above the low cloud layer (e.g. ~6000 m at the end of the take-off climb in
`src/game/Bookends.ts`, or a P-51 skimming the cloud tops), grazing view rays run tens of km through the
cloud slab. The ray-march then takes steps ~1 km apart and the cloud tops show a grainy stipple /
speckle that crawls. Inside a layer this was fixed by limiting the march to 8 km with haze fade
(see the visual-QA notes in `tools/gallery/visual-qa/README.md`, lines ~80-95). Two earlier attempts
for the above-the-deck case failed: more steps for near-level rays changed nothing visible and drew a
hard thin line of far cloud on the horizon; capping the distance cut the visible cloud sea.

## Read first
- `src/render/Clouds.ts`: `marchLayer()` (~line 152), step length `dt = max(len / steps, 30)`,
  jitter, the temporal reprojection / history clamp, quality presets (steps 56 on High, ~line 507).
- `tools/gallery/visual-qa/README.md` (what was tried).

## What to do
Make grazing rays above the deck stable and smooth without cutting the cloud sea and without a global
cost increase. Approaches to consider (pick what works, combine if useful):
- Distance-adaptive sampling: march the first few km with fine steps and the far part with coarse
  steps whose density is pre-filtered (lower-frequency noise / mip-like LOD by distance), so far samples
  don't alias.
- Blue-noise / interleaved-gradient jitter per pixel *and* per frame for these rays, so the temporal
  accumulation averages the stipple out; check the history clamp doesn't reject it.
- Fade far cloud detail into a smooth "cloud sea" approximation (e.g. a cheap analytic layer-top
  colour) beyond a distance, blended so there is no visible seam or line.
Keep Low / Medium / High / Ultra working; High may not get slower in clear weather (estimate the
shader cost change and explain it in the report).

## Done when
- The change is in, `npm run check` passes, nothing else in the pipeline changes for views from below
  or inside a layer.
- Report explains the approach, expected visual result, which quality tiers it affects, and how the
  reviewer should check it: give exact dev-console steps (e.g. start m1 from its briefing so the take-off
  scene plays and seek to ~17-21 s; or place the camera at a given altitude/angle) so the reviewer can
  compare before/after screenshots.
