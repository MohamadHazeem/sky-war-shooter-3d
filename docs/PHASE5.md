# Phase 5 — "Next level: graphics & gameplay" (auto-created overnight, 2026-10-10/11)

Created because Phase 4 is nearly done with hours left before 08:00. Focus (player's request):
graphics and gameplay. Same process as Phase 4: helper agents in worktrees, gated merges
(tools/merge_agent.sh), frozen-build regressions (tools/regression_server.sh), deploys.

## Graphics
| # | Goal | Status |
|---|---|---|
| 1 | Cloud quality: temporal reprojection (more detail at the same cost), sharper silver linings, cloud shadows on the cloud sea | |
| 2 | Aircraft surfaces: procedural panel lines, rivets, weathering, oil streaks, chipped paint, roughness variation (B-17 + fighters) | |
| 3 | Volumetric-looking explosions: raymarched or flipbook fireballs, shockwave distortion | In progress |
| 4 | Heat haze and distortion: engine exhausts, explosions, muzzle blast (screen-space refraction) | |
| 5 | Explosion and muzzle light on clouds and aircraft; glowing tracers lighting the scene | In progress |
| 6 | Night mission: moonlight, searchlights, flares, flak flashes in cloud, exhaust flames, night-fighter attacks | |
| 7 | Living interior: the other waist gunner and crew visible and animated, spent brass piles, breath fog at altitude | In progress |
| 8 | Canopy/turret glass effects: frost, rain streaks in storms, scratches catching the sun, oil smears | |

## Gameplay
| # | Goal | Status |
|---|---|---|
| 9 | Online co-op prototype: two players in one bomber (different seats) via Firebase signalling + WebRTC | In progress |
| 10 | Custom battle: pick role, enemies, numbers, weather, time of day, boss on/off | In progress |
| 11 | Role reversal: P-51 interceptor mission against a Ju 88 / He 111 raid, and a night-fighter defence | In progress |
| 12 | Wingman commands in pilot mode (attack my target, cover me, protect bombers) | In progress |
| 13 | Persistent pilot/gunner skill tree (perk points from rank-ups) | In progress |
| 14 | Dynamic campaign map: choose the next target, consequences (losses, morale, Luftwaffe strength) | In progress |
| 15 | Weekly challenge event with its own leaderboard and a special reward | In progress |
| 16 | Replay theatre: save best moments, scrub, free camera, export screenshots | In progress |

## Log
- 23:00 started co-op (9), custom battle + weekly (10, 15), skill tree (13), living interior (7), campaign map (14).
- 23:10 started role reversal + wingman commands (11, 12), replay theatre (16).
- 23:20 started volumetric explosions + combat light (3, 5). Goals 1, 2, 4, 6, 8 wait for the Phase 4 graphics pass (same files).
