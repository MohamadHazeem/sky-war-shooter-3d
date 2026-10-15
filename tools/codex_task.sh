#!/usr/bin/env bash
# Run one phase task (PHASE=phase7, default phase6) with OpenAI Codex CLI in its own git worktree / branch.
#   tools/codex_task.sh 05-bombardier          # spec: docs/phase6/05-bombardier.md
# Codex works in .claude/worktrees/codex-<task> on branch phase6/<task>, follows AGENTS.md, commits there
# and writes docs/phase6/reports/<NN>.md. Runs unsandboxed (the sandbox blocked git commits and the
# browser tool); AGENTS.md sets the limits (no push / deploy / git config / other branches). Log: /tmp/codex-<task>.log. The reviewer merges.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
TASK="$1"; NN="${TASK%%-*}"; PHASE="${PHASE:-phase6}"; PN="${PHASE#phase}"
SPEC="docs/$PHASE/$TASK.md"
[ -f "$SPEC" ] || { echo "no spec $SPEC"; exit 1; }
WT=".claude/worktrees/codex-$TASK"
if [ ! -d "$WT" ]; then
  git worktree add -q "$WT" -b "$PHASE/$TASK" main
  ln -sf "$ROOT/node_modules" "$WT/node_modules"
fi
cd "$WT"
# EFFORT=medium|high (default high). A 429 rate-limit failure is retried after a pause (up to 6 times).
EXTRA=(); [ -n "${EFFORT:-}" ] && EXTRA=(-c "model_reasoning_effort=$EFFORT")
for attempt in 1 2 3 4 5 6; do
  set +e
  codex exec --dangerously-bypass-approvals-and-sandbox ${EXTRA[@]+"${EXTRA[@]}"} -C . -o "/tmp/codex-$TASK-final.txt" \
    "You are implementing Phase $PN goal $NN in this repository. Follow AGENTS.md strictly. Your task file is $SPEC — read it and do the work end to end: implement, add tests, verify visually with the capture rig / headless browser on the port named in the task file (save the screenshots you rely on under docs/$PHASE/shots/$NN/), compare against the live game (main) and keep improving until clearly better, commit on the current branch ($PHASE/$TASK), write the report to docs/$PHASE/reports/$NN.md (commit it too), then push your branch (git push -u origin HEAD) and wait until GitHub CI is green (fix and re-push if not). Never push main, never deploy." \
    < /dev/null > "/tmp/codex-$TASK.log" 2>&1
  rc=$?; set -e
  if [ $rc -ne 0 ] && grep -q "status: 429" "/tmp/codex-$TASK.log" && [ -z "$(git log --oneline main..HEAD -- . ':!docs/'"$PHASE"'/'"$TASK"'.md' 2>/dev/null)" ]; then
    echo "codex $TASK hit the rate limit (attempt $attempt); retrying in 5 min"; sleep 300; continue
  fi
  break
done
echo "codex $TASK exit $rc"
exit $rc
