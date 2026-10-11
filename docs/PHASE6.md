# Phase 6 — "Polish what you played, then go bigger"

Implementation by OpenAI Codex CLI (the player's ChatGPT Pro plan); Claude writes the task specs
(`docs/phase6/NN-*.md`), audits each branch, runs the browser regressions, merges and deploys.
Repo rules for Codex: `AGENTS.md`.

## Tier A — finish the overnight loose ends
| # | Goal | Status |
|---|---|---|
| 1 | P-51 dogfight feel: bandits that stay and fight instead of extending 2 km between passes, so escort missions end on kills | Codex working |
| 2 | Weak-laptop pass: simulated low-end GPU, tuned first-launch quality thresholds, a Low preset that looks good | |
| 3 | Cloud-top shimmer: the speckle just above the cloud deck (end of the take-off climb) | Codex working |
| 4 | Co-op v2: shared score + guest debrief; TURN relay (needs a Cloudflare TURN key from the player) | |

## Tier G — new gameplay
| # | Goal | Status |
|---|---|---|
| 5 | Bombardier seat: the Norden bombsight on the bomb run, accuracy scores the mission | Codex working |
| 6 | Ditching in the Channel: ditch a badly damaged Sky Queen, dinghy + air-sea rescue | Codex working |
| 7 | Second tour: endless generated campaign after mission 12 | |
| 8 | Crew that matters: assign crewmen to positions, skills change accuracy / repairs / spotting | |
| 9 | Squadron leaderboards: share a squadron code for a private board | |

## Tier C — graphics and immersion
| # | Goal | Status |
|---|---|---|
| 10 | Europe below the clouds: terrain, rivers, cities, burning targets through cloud gaps | Codex working |
| 11 | Ball and tail turret interiors at the waist's "living interior" standard | |
| 12 | Music: adaptive tracks for night, raids, Train Busting and the crew room | |

## Log
- Codex signed in as the Pro account; trial widened to a first wave: goals 1, 3, 5, 6, 10 running in parallel worktrees (tools/codex_task.sh). Goal 2 (performance) waits for a quiet GPU.
