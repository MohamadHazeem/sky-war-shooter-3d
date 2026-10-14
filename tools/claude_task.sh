#!/usr/bin/env bash
# Run one phase task with a SECOND Claude Code account (headless) in its own git worktree / branch,
# mirroring tools/codex_task.sh. The second account's login lives in ~/.claude-account2 (one-time:
#   CLAUDE_CONFIG_DIR=~/.claude-account2 claude   then /login with the other account).
#   PHASE=phase10 tools/claude_task.sh 05-luftwaffe-models
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
TASK="$1"; NN="${TASK%%-*}"; PHASE="${PHASE:-phase10}"; PN="${PHASE#phase}"
SPEC="docs/$PHASE/$TASK.md"
[ -f "$SPEC" ] || { echo "no spec $SPEC"; exit 1; }  # may be uncommitted: copied into the worktree
WT=".claude/worktrees/claude2-$TASK"
if [ ! -d "$WT" ]; then
  git worktree add -q "$WT" -b "$PHASE/$TASK" main
  ln -sf "$ROOT/node_modules" "$WT/node_modules"
fi
[ -f "$WT/$SPEC" ] || { mkdir -p "$WT/$(dirname "$SPEC")"; cp "$SPEC" "$WT/$SPEC"; }
cd "$WT"
export CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude-account2}"
export PATH="$HOME/.local/node/bin:$PATH"
claude -p --dangerously-skip-permissions --model "${MODEL:-opus}" \
  "You are implementing Phase $PN goal $NN of the Sky War Shooter 3D browser game in this git worktree. Read AGENTS.md (repo rules; use the commit trailer 'Co-Authored-By: Claude <noreply@anthropic.com>' instead of the Codex one), docs/PHASE$PN.md and your task file $SPEC, then do the work end to end: implement, add tests, run npm run check until it passes, verify visually with your own dev server on the port named in the task file (headless Chrome via an existing Playwright install, or the browser tools you have; save the screenshots you rely on under docs/$PHASE/shots/$NN/), commit on the current branch ($PHASE/$TASK), and write the report to docs/$PHASE/reports/$NN.md (commit it too). Never push, deploy or change git config." \
  < /dev/null > "/tmp/claude2-$TASK.log" 2>&1
echo "claude2 $TASK exit $?"
