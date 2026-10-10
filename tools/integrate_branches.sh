#!/usr/bin/env bash
# Merge enhancement branches into the current branch one at a time.
# Each merge must apply cleanly AND keep `tsc --noEmit` + `vite build` green;
# otherwise it is rolled back and reported. Usage:
#   tools/integrate_branches.sh branch1 branch2 ...
set -u
cd "$(dirname "$0")/.."
merged=(); conflicted=(); broken=()
for b in "$@"; do
  if ! git rev-parse --verify --quiet "$b" >/dev/null; then echo "skip (missing): $b"; continue; fi
  if git merge-base --is-ancestor "$b" HEAD; then echo "skip (already merged): $b"; continue; fi
  before=$(git rev-parse HEAD)
  if ! git merge --no-ff --no-edit -q "$b" >/dev/null 2>&1; then
    git merge --abort >/dev/null 2>&1
    conflicted+=("$b"); echo "CONFLICT: $b"; continue
  fi
  if npx tsc --noEmit >/tmp/sws_tsc.log 2>&1 && npx vite build --logLevel error >/tmp/sws_build.log 2>&1; then
    merged+=("$b"); echo "merged: $b"
  else
    git reset --hard -q "$before"
    broken+=("$b"); echo "BROKEN (rolled back): $b"; head -5 /tmp/sws_tsc.log
  fi
done
echo
echo "merged:     ${#merged[@]}"
echo "conflicted: ${#conflicted[@]} ${conflicted[*]:-}"
echo "broken:     ${#broken[@]} ${broken[*]:-}"
