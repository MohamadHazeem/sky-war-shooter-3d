# Phase 10 · Goal 12b — CPU-bound frame time: make every preset hit budget

Report: `docs/phase10/reports/12b.md` · Port 5312 · Shots: `docs/phase10/shots/12b/`
Read `docs/phase10/reports/12.md` (your previous pass), `docs/PHASE10.md`.

## Review (lead)
Goal 12 removed every mid-game shader compile (great) and cut GPU pass time ~41%, but frame time is CPU-bound and
**every preset misses its budget**: Low ~11–12 ms (target 5), Medium ~15 (7), High ~16–18 (9). Low must run on weak
laptops. Your profile names the cost: scene traversal/projection, matrix updates and draw submission.
## Do (measure first, then cut the biggest costs)
- Draw calls: merge/instance static and repeated meshes (formation B-17s via InstancedMesh or BatchedMesh with per-
  instance damage state, interior props, flak/particles already pooled), material sharing, avoid per-object uniforms.
- Matrix work: `matrixAutoUpdate=false` + manual updates for static/attached objects; avoid updating invisible
  objects; cheaper frustum culling (bounding spheres, layers); skip off-screen interior/exterior groups per station.
- Low preset: switch off or heavily reduce the new heavy systems (hero LOD0, interior 2.0 assets, bomber stream size,
  ground 2.0 detail path, film look, AO/TAA, cloud quality) — Low must stay close to the pre-Phase-10 cost.
- Medium/High: per-system budget table; dynamic resolution doesn't help CPU — reduce work instead.
- Keep visuals at High/Ultra/Cinematic; Low may look simpler.
Done when: `npm run check` passes; rig + heavy-combat tables per preset meet Low ≤ 6, Medium ≤ 9, High ≤ 11,
Ultra ≤ 14, Cinematic ≤ 20 ms (CPU+GPU, this M5 Pro); throttled-CPU (4×) Low run ≤ 16.7 ms; report.
