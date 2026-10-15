#!/usr/bin/env bash
# Machine-wide slot limit for heavy jobs (Blender bakes, capture rig, full builds, long autoplay).
#   tools/heavy.sh npm run check        HEAVY_SLOTS=3 (default) jobs run at once; others wait their turn.
SLOTS="${HEAVY_SLOTS:-3}"; DIR="/tmp/sws-heavy"; mkdir -p "$DIR"
while :; do
  for i in $(seq 1 "$SLOTS"); do
    if mkdir "$DIR/slot$i" 2>/dev/null; then
      echo $$ > "$DIR/slot$i/pid"; trap 'rm -rf "$DIR/slot'"$i"'"' EXIT INT TERM
      "$@"; exit $?
    fi
    # reclaim a slot whose owner died
    pid=$(cat "$DIR/slot$i/pid" 2>/dev/null); [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null && rm -rf "$DIR/slot$i"
  done
  sleep 5
done
