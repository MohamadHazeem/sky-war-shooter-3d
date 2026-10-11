# Phase 6 — "Polish what you played, then go bigger"

Implementation by OpenAI Codex CLI (the player's ChatGPT Pro plan); Claude writes the task specs
(`docs/phase6/NN-*.md`), audits each branch, runs the browser regressions, merges and deploys.
Repo rules for Codex: `AGENTS.md`.

## Tier A — finish the overnight loose ends
| # | Goal | Status |
|---|---|---|
| 1 | P-51 dogfight feel: bandits that stay and fight instead of extending 2 km between passes, so escort missions end on kills | Done (Codex) — engaged bandits turn and fight; compact bomber set-ups near the escort; jets extend ≤5.5 s then reverse. Headless sims: time <600 m up 10–40 s per type, Me 262 kills 1/5 → 3/5; bomber threat kept |
| 2 | Weak-laptop pass: simulated low-end GPU, tuned first-launch quality thresholds, a Low preset that looks good | |
| 3 | Cloud-top shimmer: the speckle just above the cloud deck (end of the take-off climb) | Done (Codex) — footprint-selected noise mip levels + fading jitter for grazing rays above the deck: banding gone, flicker −55–58 %, no frame-time cost, views from below/inside unchanged |
| 4 | Co-op v2: shared score + guest debrief; TURN relay (needs a Cloudflare TURN key from the player) | |

## Tier G — new gameplay
| # | Goal | Status |
|---|---|---|
| 5 | Bombardier seat: the Norden bombsight on the bomb run, accuracy scores the mission | Codex working |
| 6 | Ditching in the Channel: ditch a badly damaged Sky Queen, dinghy + air-sea rescue | Codex working |
| 7 | Second tour: endless generated campaign after mission 12 | Codex working |
| 8 | Crew that matters: assign crewmen to positions, skills change accuracy / repairs / spotting | |
| 9 | Squadron leaderboards: share a squadron code for a private board | |

## Tier C — graphics and immersion
| # | Goal | Status |
|---|---|---|
| 10 | Europe below the clouds: terrain, rivers, cities, burning targets through cloud gaps | Codex revising — first pass works (coast, rivers, burning target with smoke through the clouds, cloud shadows, ≤0.3 ms) but fields looked like a regular checkerboard; sent back for irregular parcels, muted palette, real town shapes |
| 11 | Ball and tail turret interiors at the waist's "living interior" standard | |
| 12 | Music: adaptive tracks for night, raids, Train Busting and the crew room | |

## Log
- Codex signed in as the Pro account; trial widened to a first wave: goals 1, 3, 5, 6, 10 running in parallel worktrees (tools/codex_task.sh). Goal 2 (performance) waits for a quiet GPU.
- Goal 1 merged (428 tests). Codex couldn't commit or open a browser in its sandbox; launcher now runs it unsandboxed.
- Goal 3 merged (reviewed before/after crops). Started goal 7 in its slot.
