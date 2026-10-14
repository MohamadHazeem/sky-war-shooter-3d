#!/usr/bin/env bash
# Integration lane: the second Claude account merges finished task branches into the `integration` branch
# (its own worktree), resolves conflicts keeping every feature, re-renders voice clips if needed, runs the
# full check and commits. The lead then fast-forwards main to `integration` and deploys.
#   tools/claude_merge.sh phase10/06-effects phase10/09-destruction
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
WT=".claude/worktrees/integration"
if [ ! -d "$WT" ]; then git worktree add -q "$WT" -B integration main; ln -sf "$ROOT/node_modules" "$WT/node_modules"; fi
cd "$WT"
git merge -q --ff-only main 2>/dev/null || git merge -q --no-edit main
export CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude-account2}"
export PATH="$HOME/.local/node/bin:$PATH"
LOG="/tmp/claude2-merge-$(date +%H%M).log"
claude -p --dangerously-skip-permissions --model "${MODEL:-opus}" \
  "You are the integration engineer for the Sky War Shooter 3D repo, working in this git worktree on branch 'integration' (already up to date with main). Read AGENTS.md. Merge these finished task branches one at a time with 'git merge --no-ff <branch>' (commit message 'Merge <branch>' plus trailer 'Co-Authored-By: Claude <noreply@anthropic.com>'): $*. For each: read its report (docs/<phase>/reports/<NN>.md) and spec so you understand what it adds; resolve every conflict so ALL features keep working (union of i18n table registrations in src/i18n/phrases.ts; union of voice lines in tools/voice/lines.json keeping each group before the briefings group; for public/audio/voice/manifest.json take the union of clips, then run 'PYTORCH_ENABLE_MPS_FALLBACK=1 python3 tools/voice/generate.py' to regenerate the manifest and src/audio/voiceLines.ts; for code, combine both sides' hooks and adapt signatures that changed). After each merge run 'npx tsc --noEmit' and the relevant tests; after the last one run the full 'npm run check' and fix anything broken (minimal fixes, committed separately with a clear message). If a branch cannot be merged cleanly without redesign, skip it with 'git merge --abort' and explain. Never push, deploy or touch main. Finish with a short summary: merged branches, conflicts and how you resolved them, fixes, final test count, skipped branches." \
  < /dev/null > "$LOG" 2>&1
echo "integration done: log $LOG; integration head $(git rev-parse --short HEAD)"
