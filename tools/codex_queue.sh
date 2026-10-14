#!/usr/bin/env bash
# Run Codex tasks with a concurrency cap (Codex returns 429 when too many sessions run at once).
#   MAX=4 tools/codex_queue.sh phase10:01-renderer phase10:02-hero-b17 phase9:07-qa-sweep
# Each item is <phase>:<task>; EFFORT may be set per item as <phase>:<task>:<effort>.
set -uo pipefail
cd "$(dirname "$0")/.."
MAX="${MAX:-4}"
running() { pgrep -f 'node .*/bin/codex exec' | wc -l | tr -d ' '; }
for item in "$@"; do
  IFS=: read -r phase task effort <<<"$item"
  while [ "$(running)" -ge "$MAX" ]; do sleep 60; done
  echo "$(date +%H:%M) start $phase/$task ${effort:-}"
  PHASE="$phase" EFFORT="${effort:-}" tools/codex_task.sh "$task" &
  sleep 90
done
wait
echo "queue finished"
