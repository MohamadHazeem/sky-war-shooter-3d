# Phase 11 · 06 — Night and sunset polish
Report: `docs/phase11/reports/06.md` · Port 5326 · Shots: `docs/phase11/shots/06/`

Pillar 7 from 6 → 8. Read weather/mood code, `src/render/PostFX.ts`, `FilmLook.ts`. Night: moonlight, searchlight cones in haze, flak flashes lighting clouds, exhaust flames, tracers lighting the airframe, burning aircraft lighting the formation, fires on the ground. Sunset/dawn: low sun colour, long shadows, rim lights, contrails catching gold light. Grade so night is dark but readable.

Rules: read `AGENTS.md` (CI flow, `tools/heavy.sh`, quality gate), `docs/PHASE11.md`, `docs/phase10/scorecard-final.md`, `docs/phase10/reference.md`. Verify with the capture rig (`node tools/visual_rig.mjs`) before/after vs LIVE main; done only when clearly better in the touched shots and CI is green. Downloads of CC0/CC BY assets from no-login sources (Poly Haven, ambientCG, public-domain archives) are allowed; log licences in the CREDITS files. Never `channel: 'chrome'`, never computer use.
