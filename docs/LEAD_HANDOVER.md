# Lead handover — how this project is run

For a fresh lead session (Claude) taking over orchestration. Read this, `AGENTS.md`, `docs/PHASE11.md` (current
phase) and `docs/playbook/agent-playbook.html`.

## Owner preferences (must follow)
- Focus: the **B-17 gunner** game; graphics target 100/100 (strict scorecard: 60/100 after Phase 10).
- Work autonomously; deploy/push without asking; no planning questionnaires — **but** when the owner asks to align
  first, start nothing until an explicit "go".
- Never use computer use; never launch the real Chrome app (`channel: 'chrome'`) — it hijacked the owner's mouse.
  Browser automation: Playwright bundled headless shell or the built-in browser pane (own tab).
- Concise status updates; honest about weak results.

## Lanes
| Lane | How | Limits |
|---|---|---|
| Codex CLI (mahazeem@netways.com Pro) | `PHASE=phaseN tools/codex_task.sh <task>` / `MAX=4 tools/codex_queue.sh phaseN:<task> …` | ~4 sessions; 429 → auto-retry |
| Claude subagents (this account) | Agent tool, `isolation: worktree`, prompt points to the spec | ~4 at once (Mac load) |
| Claude cloud sessions (m.hazeem@digitalnext.io CLI) | from `/tmp/sws-cloud` (HTTPS clone, `git pull` first): `script -q log claude --cloud "<task>"` (needs a TTY; answer the trust prompt with Enter) | code-only goals (no Blender/voice/GPU) |
| Second Claude account | `CLAUDE_CONFIG_DIR=~/.claude-account2`, `tools/claude_task.sh`, merge lane `tools/claude_merge.sh` | weekly quota |

## Pipeline (per goal)
1. Spec in `docs/phaseN/NN-*.md` (read-first list, build, done-when, port, report path).
2. Agent works in its worktree, pushes its own branch; GitHub CI (public repo, ~2 min) runs `npm run check`.
3. `tools/autopilot.sh` (reads `.claude/autopilot.list`: `branch|report|worktree|lane`): CI green → preview link
   (`tools/preview.sh`, Cloudflare version alias, not production) → automatic review (`claude -p`) → APPROVE: merge lane
   (`tools/codex_merge.sh`) → CI green on `integration` → `tools/ship.sh` (deploy + push main); REJECT: Codex branches
   are re-run with the reasons (max 2), Claude-lane rejects are flagged in `/tmp/sws-autopilot/*.rejected`.
4. Lead spot-checks shots and previews, especially art goals (from-scratch models failed before: always start from
   accurate shapes / reference assets).

## Useful facts
- Heavy local jobs through `tools/heavy.sh`; capture rig `node tools/visual_rig.mjs`; scorecard docs in `docs/phase10/`.
- Voice: Chatterbox (`.venv-tts`), `python3 tools/voice/generate.py --only <prefix>`.
- Firestore rules: merge, never drop; deploy with `npx firebase-tools deploy --only firestore:rules --project sky-war-shooter-3d`.
- Live site: https://sky-war-shooter-3d.mhamadhazeem2001.workers.dev · repo https://github.com/MohamadHazeem/sky-war-shooter-3d (public).
- CC BY source models: `assets-src/sketchfab/` (credits there).
