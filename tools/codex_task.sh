#!/usr/bin/env bash
# Run one Phase 6 task with OpenAI Codex CLI in its own git worktree / branch.
#   tools/codex_task.sh 05-bombardier          # spec: docs/phase6/05-bombardier.md
# Codex works in .claude/worktrees/codex-<task> on branch phase6/<task>, follows AGENTS.md, commits there
# and writes docs/phase6/reports/<NN>.md. Runs unsandboxed (the sandbox blocked git commits and the
# browser tool); AGENTS.md sets the limits (no push / deploy / git config / other branches). Log: /tmp/codex-<task>.log. The reviewer merges.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
TASK="$1"; NN="${TASK%%-*}"
SPEC="docs/phase6/$TASK.md"
[ -f "$SPEC" ] || { echo "no spec $SPEC"; exit 1; }
WT=".claude/worktrees/codex-$TASK"
if [ ! -d "$WT" ]; then
  git worktree add -q "$WT" -b "phase6/$TASK" main
  ln -sf "$ROOT/node_modules" "$WT/node_modules"
fi
cd "$WT"
codex exec --dangerously-bypass-approvals-and-sandbox -C . -o "/tmp/codex-$TASK-final.txt" \
  "You are implementing Phase 6 goal $NN in this repository. Follow AGENTS.md strictly. Your task file is $SPEC — read it and do the work end to end: implement, add tests, run npm run check until it passes, verify in your browser with your own dev server on the port named in the task file (save the screenshots you rely on under docs/phase6/shots/$NN/), commit on the current branch (phase6/$TASK), and write the report to docs/phase6/reports/$NN.md (commit it too). Do not push or deploy." \
  < /dev/null > "/tmp/codex-$TASK.log" 2>&1
echo "codex $TASK exit $?"
