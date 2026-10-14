#!/usr/bin/env bash
# Rebuild original source, baked textures, three LODs and compressed runtime assets.
set -euo pipefail
cd "$(dirname "$0")/../.."
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
if [[ -z "${TOKTX:-}" ]]; then
  TOKTX="$(command -v toktx || true)"
fi
if [[ "${HERO_WEBP:-0}" == 1 ]]; then TOKTX=""; fi
if [[ -z "$TOKTX" && "${HERO_WEBP:-0}" != 1 ]]; then
  echo 'Set TOKTX to the installed Khronos toktx executable. HERO_WEBP=1 explicitly builds the WebP fallback.' >&2
  exit 1
fi
export TOKTX
"$BLENDER" -b -t 8 -P tools/hero/build.py
node tools/hero/compress.mjs
"$BLENDER" -b -t 8 -P tools/hero/render.py
