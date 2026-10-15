#!/usr/bin/env bash
# Run one code-only goal as a Claude Code CLOUD session (no load on the Mac).
#   PHASE=phase11 tools/cloud_task.sh <task> [account2]
# Uses an HTTPS clone (/tmp/sws-cloud) so the CLI recognises GitHub; needs a TTY (provided via `script`).
# The session works on branch <phase>/<task>, pushes it and waits for green CI; register it in .claude/autopilot.list.
set -euo pipefail
cd "$(dirname "$0")/.."; TASK="$1"; PHASE="${PHASE:-phase11}"; SPEC="docs/$PHASE/$TASK.md"; NN="${TASK%%-*}"
[ -f "$SPEC" ] || { echo "no spec $SPEC"; exit 1; }
export PATH="$HOME/.local/node/bin:$PATH"
# default: the second account (mahazeem@netways.com) so the shared main account stays uncluttered; pass "main" to override
[ "${2:-account2}" = "account2" ] && export CLAUDE_CONFIG_DIR="$HOME/.claude-account2"
[ -d /tmp/sws-cloud ] || git clone -q https://github.com/MohamadHazeem/sky-war-shooter-3d.git /tmp/sws-cloud
git -C /tmp/sws-cloud pull -q
LOG="/tmp/cloud-$TASK.log"
( cd /tmp/sws-cloud && (sleep 6; printf '\r'; sleep 40) | script -q "$LOG" claude --cloud "Implement $SPEC in this repository end to end. Read AGENTS.md first (commit trailer 'Co-Authored-By: Claude <noreply@anthropic.com>'; this cloud machine has no Blender/voice tools and no GPU — skip steps that need them and say so). Work on a new branch named exactly $PHASE/$TASK, run npx tsc --noEmit and the relevant tests, write docs/$PHASE/reports/$NN.md, commit, push the branch and confirm GitHub CI is green. Never push to main." > /dev/null 2>&1 & pid=$!; sleep 45; kill $pid 2>/dev/null ) || true
URL=$(sed 's/\x1b\[[0-9;?]*[a-zA-Z]//g' "$LOG" | tr -s ' \r' | grep -oE "https://claude.ai/code/session_[A-Za-z0-9]+" | head -1)
echo "$URL"; echo "$(date +%F\ %H:%M) ${2:-account2} $PHASE/$TASK $URL" >> .claude/cloud-sessions.log
grep -q "^$PHASE/$TASK|" .claude/autopilot.list || echo "$PHASE/$TASK|docs/$PHASE/reports/$NN.md|.claude/worktrees/cloud-$TASK|cloud" >> .claude/autopilot.list
