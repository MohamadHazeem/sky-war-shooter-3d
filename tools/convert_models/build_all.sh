#!/usr/bin/env bash
# Rebuild all aircraft .glb files from the FlightGear sources.
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
  "b17|B-17/Models/b17.xml|public/models/b17.glb"
  "fw190|fw190/Models/FW190-A8.xml|public/models/fw190.glb"
  "p51d|p51d/Models/p51d-jw-jsbsim.xml|public/models/p51d.glb"
  "p51d_cockpit|p51d/Models/p51d-jw-jsbsim.xml|public/models/p51d_cockpit.glb"
  "bf110|Messerschmitt-BF110/Models/bf110.xml|public/models/bf110.glb"
  "me262|ME-262/Models/me262.xml|public/models/me262.glb"
  "bf109|bf109/Models/bf109g14.ac|public/models/bf109.glb"
  "ju88|Ju-88/Models/ju88a4.ac|public/models/ju88.glb"
  "me163|me163/Models/me163.ac|public/models/me163.glb"
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
