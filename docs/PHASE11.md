# Phase 11 — from 60 to 80+

Strict scorecard 60/100 after Phase 10 → target 80+. B-17 gunner first. Speed + quality pipeline: tasks push their
branch, GitHub CI (public repo) runs the full check; heavy local jobs via `tools/heavy.sh`; quality gate vs LIVE main;
merge lane (`tools/codex_merge.sh` / `tools/claude_merge.sh`) → `tools/ship.sh` deploys on green CI.

| # | Goal | Target | Lane | Status |
|---|---|---|---|---|
| 01 | Aircraft detail 2.0 | models 6→8 | Codex | Building |
| 02 | Materials, reflections, contact shadows | lighting 6→8 | Codex | Building |
| 03 | Film-grade clouds | clouds 6→8 | Codex | Building |
| 04 | Explosions, flak, fire 2.0 | effects 6→8 | Codex | Building |
| 05 | Crew 2.0 | interior 5→7 | Claude | Building |
| 06 | Night and sunset polish | post 6→8 | Claude | Building |
| 07 | The Tour (25 missions) | gameplay | Claude | Building |
| 08 | Gunner mastery | gameplay | Claude | Building |
| 09 | Final scorecard and fixes | 80+ | Codex | After 01–08 |
