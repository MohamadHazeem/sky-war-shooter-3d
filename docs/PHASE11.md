# Phase 11 — from 60 to 80+ (expanded: "go wild", 39 goals)

Strict scorecard 60/100 after Phase 10 → target 80+. B-17 gunner first. Speed + quality pipeline: tasks push their
branch, GitHub CI (public repo) runs the full check; heavy local jobs via `tools/heavy.sh`; quality gate vs LIVE main;
merge lane (`tools/codex_merge.sh` / `tools/claude_merge.sh`) → `tools/ship.sh` deploys on green CI.

| # | Goal | Target | Lane | Status |
|---|---|---|---|---|
| 01 | Aircraft detail 2.0 | models 6→8 | Codex | Building |
| 02 | Materials, reflections, contact shadows | lighting 6→8 | Codex | Closed — 8 review rounds, over perf budget, no visible gain; redo in Phase 12 |
| 03 | Film-grade clouds | clouds 6→8 | Codex | Closed — only fly-through improved; redo in Phase 12 with a new approach |
| 04 | Explosions, flak, fire 2.0 | effects 6→8 | Codex | Building |
| 05 | Crew 2.0 | interior 5→7 | Claude | Building |
| 06 | Night and sunset polish | post 6→8 | Claude | Building |
| 07 | The Tour (25 missions) | gameplay | Claude | Building |
| 08 | Gunner mastery | gameplay | Claude | Building |
| 01b | Hero fighters from Sketchfab models (+ replace unlicensed pilot figures) | models | Codex | Queued |
| 00 | Conflict-free registries | process | Cloud | Building |
| 10 | Strategic air war | gameplay | Cloud | Queued |
| 11 | Crew stories and morale | gameplay | Cloud | Queued |
| 12 | Limping home (diversions, internment, ASR) | gameplay | Cloud | Queued |
| 13 | Between-mission decisions | gameplay | Cloud | Queued |
| 14 | Gamepad and accessibility | UX | Cloud | Queued |
| 15 | Touch and phone gunner | UX | Cloud | Queued |
| 16 | Adaptive score 2.0 | audio | Cloud | Queued |
| 17 | Spatial audio 2.0 | audio | Cloud | Queued |
| 18 | Co-op lobbies and quick join | multiplayer | Cloud | Queued |
| 19 | Seasons and fair leaderboards | online | Cloud | Queued |
| 20 | Replay and photo mode 2.0 | features | Cloud | Queued |
| 21 | Station tutorials | onboarding | Cloud | Queued |
| 22 | Nightly QA in CI | quality | Cloud | Queued |
| 23 | Escort fighters (P-47, Spitfire) | art | Codex | Queued |
| 24 | New enemies (Me 410, Me 163, Ju 88 G) | art + AI | Codex | Queued |
| 25 | The ground war below | art + FX | Codex | Queued |
| 26 | Arabic voice-over | audio | Claude (local) | Queued |
| 27 | Mission editor and sharing | features | Cloud (2nd account) | Queued |
| 28 | Dynamic in-mission events | gameplay | Cloud (2nd account) | Queued |
| 29 | Adaptive difficulty director | gameplay | Cloud (2nd account) | Queued |
| 30 | Museum and codex | content | Cloud (2nd account) | Queued |
| 31 | Historical raid mode | content | Cloud (2nd account) | Queued |
| 32 | More languages (FR/DE/ES) | reach | Cloud (2nd account) | Queued |
| 33 | Co-op crew intercom (voice) | multiplayer | Cloud (2nd account) | Queued |
| 34 | Spectator and streamer mode | multiplayer | Cloud (2nd account) | Queued |
| 35 | Gunnery range 2.0 | gameplay | Cloud (2nd account) | Queued |
| 36 | Save system 2.0 | platform | Cloud (2nd account) | Queued |
| 37 | Share cards and stats | features | Cloud (2nd account) | Queued |
| 38 | Mod support (JSON) | platform | Cloud (2nd account) | Queued |
| 09 | Final scorecard and fixes | 80+ | Codex | After 01–08 |
