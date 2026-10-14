#!/bin/sh
# Bake every effect flipbook in parallel (one Blender process each), then build the lit previews.
# Usage: sh tools/fx/bake_all.sh [effect ...]   (default: all six). Logs in tools/fx/out/<name>.log
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
DIR=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$DIR/out"
NAMES=${*:-explosion fireball flak fire smoke wisp}
for n in $NAMES; do
  "$BLENDER" -b --factory-startup -P "$DIR/bake_flipbooks.py" -- "$n" > "$DIR/out/$n.log" 2>&1 &
done
wait
"$BLENDER" -b --factory-startup -P "$DIR/bake_flipbooks.py" -- preview $NAMES > "$DIR/out/preview.log" 2>&1
# one pair of atlases for the game (needs every effect's per-effect atlas in tools/fx/out/atlas)
"$BLENDER" -b --factory-startup -P "$DIR/bake_flipbooks.py" -- pack > "$DIR/out/pack.log" 2>&1
ls -l "$DIR/../../public/fx"
