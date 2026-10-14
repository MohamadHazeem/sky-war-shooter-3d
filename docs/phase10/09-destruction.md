# Phase 10 · Goal 09 — Physical destruction

Report: `docs/phase10/reports/09.md` · Port 5309 · Shots: `docs/phase10/shots/09/`
Read `docs/PHASE10.md`, `src/world/FighterDeath.ts`, `BomberDeath.ts`, `DamageLook.ts`, `DamagePanel.ts`, `DamageStages.ts`,
`Wrecks.ts`, `Aircraft.ts`, `Ballistics.ts`, `src/world/World.ts`, Phase 8 goal 6 report (`docs/phase8/reports/06.md`).

Today kills use clipping-plane cuts and canned sequences. Target: aircraft that come apart physically where they are
hit. Build: hit-location damage accumulation per structural part (wing roots, outer wings, tail, engine, cockpit,
fuel tanks) driving failures; real mesh separation along part boundaries (pre-split meshes or runtime cut with capped
sections) into rigid bodies with simple flight-physics tumbling (lift loss, spin, flutter), fuel-tank fires that spread
and trail, explosions that fragment into many pooled pieces, pilots bailing out when the aircraft is doomed,
debris that can hit other aircraft (rare), and matching sounds. Works with today's models and with the future hero
models (named parts contract documented). Pooled, deterministic enough for co-op snapshots (send part-state bits).
Done when: `npm run check` passes with tests for the failure model; captured sequences (wing shot off, tail
separation, fuel-tank explosion, engine fire → bail-out) from gunner seats; perf; pillar 9 self-score.
