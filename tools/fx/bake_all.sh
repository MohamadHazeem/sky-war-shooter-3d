#!/bin/bash
# Each simulation owns a machine-wide slot and a content cache entry. No nested heavy.sh.
set -euo pipefail
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$DIR/../.." && pwd)
mkdir -p "$DIR/out"
NAMES=("$@")
if [ ${#NAMES[@]} -eq 0 ]; then NAMES=(flak explosion fire fireball smoke wisp); fi
pids=()
wait_batch() {
  local status=0
  for pid in "${pids[@]}"; do wait "$pid" || status=1; done
  pids=()
  return "$status"
}
for n in "${NAMES[@]}"; do
  "$ROOT/tools/cached.sh" "fx256-$n" "$DIR/bake_flipbooks.py" -- "$ROOT/tools/heavy.sh" \
    "$BLENDER" -b -t 4 --python-exit-code 1 --factory-startup -P "$DIR/bake_flipbooks.py" -- "$n" > "$DIR/out/$n.log" 2>&1 &
  pids+=("$!")
  # At most two simulations from this task; leave a global slot for other worktrees.
  if [ ${#pids[@]} -eq 2 ]; then
    wait_batch
  fi
done
wait_batch
"$ROOT/tools/cached.sh" fx256-pack "$DIR/bake_flipbooks.py" "$DIR/out/atlas" -- "$ROOT/tools/heavy.sh" \
  "$BLENDER" -b -t 4 --python-exit-code 1 --factory-startup -P "$DIR/bake_flipbooks.py" -- pack > "$DIR/out/pack.log" 2>&1
