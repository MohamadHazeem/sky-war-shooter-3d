# Phase 10 · Goal 00 — Visual capture rig, reference board and scorecard

Report: `docs/phase10/reports/00.md` · Port 5300 · Shots: `docs/phase10/shots/00/`
Read `docs/PHASE10.md` first (the bar, the 10 pillars).

Build:
1. `tools/visual_rig.mjs` + a dev page: deterministic captures (seeded, frozen time, fixed sun/weather) of ~16
   named shots covering every pillar: waist gunner view with Fw 190 at 150 m; tail gun with a 109 diving; top
   turret looking at the formation; ball turret looking down at Europe; close B-17 exterior beauty shot (sun
   behind/side); formation from a chase camera; cloud fly-through; sunset; overcast/rain; night with flak and
   searchlights; explosion close; flak barrage; damaged neighbour burning; interior waist compartment with
   light shafts; bomb run over the target; P-51 cockpit. Output 1920×1080 PNG + small JPEGs, and a contact sheet.
   Works on WebGL2 now and on the future WebGPU path (goal 01) via a flag.
2. `docs/phase10/reference.md`: a reference board — links (not images) to public reference frames/photos
   (Yarnhub videos with timestamps, Masters of the Air stills, IL-2/War Thunder/MSFS screenshots, real WWII
   photos from public archives such as NARA/IWM) per pillar, with what to learn from each.
3. `tools/visual_score.mjs`: produces `docs/phase10/scorecard.md` — a table of shots × pillars with image links
   and a place for scores; plus objective metrics per shot (luminance histogram, contrast, colourfulness,
   sharpness/edge aliasing estimate, frame time).
4. Run it on the current game: baseline captures in `docs/phase10/shots/baseline/` (commit JPEGs only, ≤250 KB each).

Done when: `npm run check` passes; baseline contact sheet committed; report with how other goals use the rig
(`node tools/visual_rig.mjs --out docs/phase10/shots/<goal>/after`).
