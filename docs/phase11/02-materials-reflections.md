# Phase 11 · 02 — Materials, reflections and contact shadows
Report: `docs/phase11/reports/02.md` · Port 5322 · Shots: `docs/phase11/shots/02/`

Pillar 2 from 6 → 8. Read `src/render/*`, `docs/phase10/reports/01b.md`. Physically plausible materials everywhere the gunner looks: painted metal sheen, natural-metal anisotropic-ish highlights, glass reflections of sky/clouds/formation (planar or SSR-lite for the turret glass and canopies, env-map otherwise), screen-space contact shadows / better cascade fit for aircraft at 10–200 m, specular occlusion, sun glints on neighbours, warmer/colder grading per mood from real HDR skies (Poly Haven CC0) used as look references. Keep budgets from goal 12b.

Rules: read `AGENTS.md` (CI flow, `tools/heavy.sh`, quality gate), `docs/PHASE11.md`, `docs/phase10/scorecard-final.md`, `docs/phase10/reference.md`. Verify with the capture rig (`node tools/visual_rig.mjs`) before/after vs LIVE main; done only when clearly better in the touched shots and CI is green. Downloads of CC0/CC BY assets from no-login sources (Poly Haven, ambientCG, public-domain archives) are allowed; log licences in the CREDITS files. Never `channel: 'chrome'`, never computer use.
