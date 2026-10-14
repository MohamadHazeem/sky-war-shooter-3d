# Phase 10 · Goal 08 — The thousand-bomber stream (scale & spectacle)

Report: `docs/phase10/reports/08.md` · Port 5308 · Shots: `docs/phase10/shots/08/`
Read `docs/PHASE10.md`, `src/world/World.ts`, `Raid.ts`, `LivingFormation.ts`, `FormationRules.ts`, `FormationDress.ts`
(Phase 9 goal 1), `Models.ts`, `Exhaust.ts`, contrail code, `src/render/*`, escort code (`Wingman.ts`, `MustangSweep.ts`).

Real raids put hundreds of bombers in the sky. Build a stream renderer: combat boxes of 18–36 B-17s (lead/high/low
squadrons) repeated into a stream stretching to the horizon (300–1,000 aircraft) via GPU instancing with LODs
(impostor billboards rendered from the model at distance), each with prop discs, contrails that merge into a
persistent contrail field, glints of sun on metal, distant flak walking through other boxes, distant losses
(a far bomber spiralling down with smoke), P-47/P-51 escort flights weaving above with their own contrails,
Luftwaffe gaggles attacking other boxes in the distance. The near boxes stay the existing gameplay formation; the
rest is spectacle with negligible CPU cost. Must plug into the hero B-17 LODs when they land (goal 02: document the
contract). Low: a smaller stream.
Done when: `npm run check` passes; captures (top turret toward the stream, tail looking back over following boxes,
sunset contrail field); perf on High/Low; pillar 8 self-score.
