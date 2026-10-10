#!/usr/bin/env bash
# Rebuild all aircraft .glb files from the FlightGear sources into tools/convert_models/output/
# (uncompressed), then compress them into public/models/ (tools/compress_models.mjs).
#
#   FG_SRC=/path/to/folder/with/the/FlightGear/clones  tools/convert_models/build_all.sh [model ...]
#
# Optional env: BLENDER (path to Blender 5.x), PREVIEW_VIEWS (default "34"),
#               PREVIEW_DIR (default reference/model-previews), REPORT_DIR (default tools/convert_models/reports)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
: "${FG_SRC:?set FG_SRC to the folder containing the FlightGear aircraft clones (see README)}"
PREVIEW_VIEWS="${PREVIEW_VIEWS:-34}"
PREVIEW_DIR="${PREVIEW_DIR:-$REPO/reference/model-previews}"
REPORT_DIR="${REPORT_DIR:-$HERE/reports}"

# name | input model (relative to FG_SRC) | output
MODELS=(
  "b17|B-17/Models/b17.xml|tools/convert_models/output/b17.glb"
  "fw190|fw190/Models/FW190-A8.xml|tools/convert_models/output/fw190.glb"
  "p51d|p51d/Models/p51d-jw-jsbsim.xml|tools/convert_models/output/p51d.glb"
  "p51d_cockpit|p51d/Models/p51d-jw-jsbsim.xml|tools/convert_models/output/p51d_cockpit.glb"
  "bf110|Messerschmitt-BF110/Models/bf110.xml|tools/convert_models/output/bf110.glb"
  "me262|ME-262/Models/me262.xml|tools/convert_models/output/me262.glb"
  "bf109|bf109/Models/bf109g14.ac|tools/convert_models/output/bf109.glb"
  "ju88|Ju-88/Models/ju88a4.ac|tools/convert_models/output/ju88.glb"
  "me163|me163/Models/me163.ac|tools/convert_models/output/me163.glb"
  "he111|Heinkel-He-111/Models/he111.xml|tools/convert_models/output/he111.glb"
  "do335|DO-335/Models/do335.xml|tools/convert_models/output/do335.glb"
)

want=("$@")
for entry in "${MODELS[@]}"; do
  IFS='|' read -r name input output <<<"$entry"
  if [ ${#want[@]} -gt 0 ] && [[ ! " ${want[*]} " == *" $name "* ]]; then continue; fi
  views="$PREVIEW_VIEWS"
  [ "$name" = "p51d_cockpit" ] && views="cockpit"
  echo "== $name"
  "$BLENDER" -b --factory-startup --python "$HERE/convert_ac.py" -- \
    "$FG_SRC/$input" "$REPO/$output" \
    --config "$HERE/configs/$name.json" \
    --fg-root "$FG_SRC" \
    --report "$REPORT_DIR/$name.json" \
    --preview "$PREVIEW_DIR/$name.png" --preview-views "$views" 2>&1 \
    | grep -E "^\[convert_ac\]|Error|Traceback" || true
  test -s "$REPO/$output"
done

# web versions: meshopt + quantization + WebP textures -> public/models/
names=()
for entry in "${MODELS[@]}"; do
  IFS='|' read -r name _ _ <<<"$entry"
  if [ ${#want[@]} -gt 0 ] && [[ ! " ${want[*]} " == *" $name "* ]]; then continue; fi
  names+=("$name")
done
node "$REPO/tools/compress_models.mjs" "${names[@]}"
