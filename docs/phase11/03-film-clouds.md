# Phase 11 · 03 — Film-grade clouds
Report: `docs/phase11/reports/03.md` · Port 5323 · Shots: `docs/phase11/shots/03/`

Pillar 3 from 6 → 8. Read `src/render/Clouds.ts`, `docs/phase10/reports/03.md`. Higher-frequency erosion detail (curl-noise distortion, wispy edges), better multiple scattering and ambient (blue-sky fill, dark bases), crisp silver linings, sunset/sunrise colour through cloud, cumulus towers with real depth at 5–30 km, cloud-to-cloud shadowing, dramatic god rays through gaps, believable flying-through (fog, droplets). Temporal reprojection to stay within budget. Compare with MSFS / reference photos.

Rules: read `AGENTS.md` (CI flow, `tools/heavy.sh`, quality gate), `docs/PHASE11.md`, `docs/phase10/scorecard-final.md`, `docs/phase10/reference.md`. Verify with the capture rig (`node tools/visual_rig.mjs`) before/after vs LIVE main; done only when clearly better in the touched shots and CI is green. Downloads of CC0/CC BY assets from no-login sources (Poly Haven, ambientCG, public-domain archives) are allowed; log licences in the CREDITS files. Never `channel: 'chrome'`, never computer use.
