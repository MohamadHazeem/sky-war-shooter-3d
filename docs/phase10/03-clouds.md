# Phase 10 · Goal 03 — Clouds & sky 2.0

Report: `docs/phase10/reports/03.md` · Port 5303 · Shots: `docs/phase10/shots/03/`
Read `docs/PHASE10.md`, `src/render/Clouds.ts`, `Sky.ts`, `Atmosphere.ts`, `StormWall.ts`, `Weather*.ts`,
`src/core/Engine.ts`, cloud bench tooling (`sws.cloudBench`).

Goal: MSFS / Horizon-Zero-Dawn (Nubis) quality clouds — the biggest single visual element at 25,000 ft.
Build: physically based volumetric cloud rendering (Beer–Powder, multiple-scattering approximation, phase function
with silver lining), cloud types (cumulus fields, towering cumulus, stratus decks, cirrus layers that look right —
remove the stretched-plane cirrus streak artefact), weather-map driven coverage tied to the existing moods/presets,
temporal reprojection + checkerboard/half-res raymarch for speed, cloud shadows on the ground and on aircraft,
aerial perspective (Bruneton-style sky/atmosphere LUTs), flying through clouds (wisps, light loss, droplets on glass),
contrails that self-shadow and catch sunset light, god rays through gaps. Works on the renderer 2.0 path if merged;
otherwise keep it compatible with both.
Frame budget: clouds ≤ 4 ms High, ≤ 7 ms Ultra at 1080p on this Mac; Low keeps today's clouds.

Done when: `npm run check` passes; rig captures before/after (sunset, overcast, fly-through, ball turret looking down,
formation over cumulus); perf table; report with pillar 3 self-score.
