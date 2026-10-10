#!/usr/bin/env bash
# Merge a helper branch: append-style conflicts are union-resolved, then the full quality gate
# (tsc + build + unit tests) must pass before anything is committed. On failure the merge is
# left in place (uncommitted) with the errors printed, for manual fixing.
set -u
cd "$(dirname "$0")/.."
b="$1"
git merge --no-ff --no-edit -q "$b" >/dev/null 2>&1
files=$(git diff --name-only --diff-filter=U)
if [ -n "$files" ]; then
  echo "conflicts: $files"
  tools/union_all.sh $files
  git add $files
fi
if npm run check > /tmp/sws_check.log 2>&1; then
  git commit -qm "Merge $b" --no-edit 2>/dev/null || git commit -qm "Merge $b"
  echo "MERGED $b ($(grep -o 'Tests  [0-9]* passed' /tmp/sws_check.log))"
else
  echo "CHECK FAILED for $b — merge left uncommitted"; grep -E "error|Error|FAIL" /tmp/sws_check.log | head -15
fi
