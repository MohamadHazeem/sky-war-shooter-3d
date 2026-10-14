# Phase 10 · Goal 04 — Ground from altitude 2.0 (Europe 1943–44)

Report: `docs/phase10/reports/04.md` · Port 5304 · Shots: `docs/phase10/shots/04/`
Read `docs/PHASE10.md` (the bar), `src/world/Countryside.ts`, `TargetArea.ts`, `EuropeChart.ts`, `FarTerrainData.ts`,
`src/render/FarTerrain*`, `Atmosphere.ts`, `Clouds.ts` (cloud shadows hook), Phase 6 goal 10 report
(`docs/phase6/reports/10.md`, "Europe below the clouds").

From 25,000 ft the gunner sees Europe through cloud gaps: today it reads as a flat procedural pattern. Make it look
like aerial reconnaissance photos / MSFS from altitude: real elevation (public-domain/CC data such as SRTM/Copernicus
GLO-90 or EU-DEM, preprocessed offline into compact tiles under the size budget) along the actual routes (England →
North Sea/Channel → Netherlands/Germany), coastlines and rivers from public data (Natural Earth / OSM-derived
extracts with licence logged), procedural 1940s land use on top (strip fields and bocage, forests, towns with
dense centres and roads, railways, rivers with sun glint), seasonal palettes (summer/autumn/winter snow), cloud
shadows, aerial perspective/haze that matches goal 03, sea with proper glint and swell from altitude, target cities
with smoke from earlier raids. Distant detail via tiled LODs/streaming; ≤ ~20 MB lazy data; Low keeps today's ground.
Done when: `npm run check` passes; rig-style captures (ball turret looking down, waist view of horizon, coast
crossing, target city) before/after; perf; licence log; pillar 4 self-score.
