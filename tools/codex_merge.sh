#!/usr/bin/env bash
# Merge lane on Codex (used while the second Claude account is out of quota): merge finished task branches into
# `integration`, resolve conflicts keeping every feature, push `integration` so CI checks it.
#   tools/codex_merge.sh phase11/01-aircraft-detail [more branches]
set -euo pipefail
cd "$(dirname "$0")/.."; ROOT="$(pwd)"; WT=".claude/worktrees/integration"
if [ ! -d "$WT" ]; then git worktree add -q "$WT" -B integration main; ln -sf "$ROOT/node_modules" "$WT/node_modules"; fi
cd "$WT"; git merge -q --ff-only main 2>/dev/null || git merge -q --no-edit main
codex exec --dangerously-bypass-approvals-and-sandbox -c model_reasoning_effort=medium -C . -o /tmp/codex-merge-final.txt \
  "You are the integration engineer for this repo, on branch 'integration' (up to date with main). Read AGENTS.md. Merge these finished task branches one at a time with 'git merge --no-ff <branch>' (message 'Merge <branch>' + trailer 'Co-Authored-By: OpenAI Codex <noreply@openai.com>'): $*. Read each branch's report to understand it. Resolve every conflict so ALL features keep working (union of i18n tables in src/i18n/phrases.ts; union of voice lines in tools/voice/lines.json before the briefings group; union of clips in public/audio/voice/manifest.json then run 'PYTORCH_ENABLE_MPS_FALLBACK=1 python3 tools/voice/generate.py'; for code combine both sides' hooks). After each merge run npx tsc --noEmit and related tests. Then push: 'git push -f origin integration' and wait for CI: '~/.local/bin/gh run watch --exit-status \$(~/.local/bin/gh run list --branch integration --limit 1 --json databaseId --jq .[0].databaseId)'. Fix any failure with minimal commits and push again until CI is green. Never touch main. Finish with a summary: merged, conflicts, fixes, CI result." \
  < /dev/null > "/tmp/codex-merge-$(date +%H%M).log" 2>&1
echo "merge lane done; integration $(git rev-parse --short HEAD)"
