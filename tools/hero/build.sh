#!/usr/bin/env bash
# Pinned FlightGear source -> baked PBR, shared-pivot LODs, KTX2 + WebP, renders.
set -euo pipefail
cd "$(dirname "$0")/../.."
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
BASISU="${BASISU:-$(command -v basisu || true)}"
TOKTX="${TOKTX:-$(command -v toktx || true)}"
if [[ "${HERO_WEBP:-0}" == 1 ]]; then BASISU=""; TOKTX=""; fi
if [[ -z "$BASISU$TOKTX" && "${HERO_WEBP:-0}" != 1 ]]; then
  echo 'Set BASISU or TOKTX to an installed encoder (or HERO_WEBP=1 for fallback only).' >&2; exit 1
fi
if [[ -z "${FG_SRC:-}" ]]; then
  echo 'Set FG_SRC to the directory containing the pinned B-17 source. See tools/hero/README.md.' >&2; exit 1
fi
export BASISU TOKTX
mkdir -p tools/hero/output docs/phase10/shots/02c
"$BLENDER" -b -t 8 --python-exit-code 1 -P tools/convert_models/convert_ac.py -- \
  "$FG_SRC/B-17/Models/b17.xml" tools/hero/output/flightgear.glb \
  --config tools/hero/flightgear.json --fg-root "$FG_SRC"
node tools/hero/markings.mjs
"$BLENDER" -b -t 8 --python-exit-code 1 -P tools/hero/build.py
node tools/hero/compress.mjs
"$BLENDER" -b -t 8 --python-exit-code 1 -P tools/hero/render.py
"$BLENDER" -b -t 8 --python-exit-code 1 -P tools/hero/silhouette-export.py
"${HERO_PYTHON:-python3}" tools/hero/silhouette.py
