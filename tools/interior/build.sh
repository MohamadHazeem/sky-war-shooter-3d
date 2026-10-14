#!/bin/sh
# Rebuilds the B-17 interior 2.0 assets (Phase 10 goal 07) from the Blender generators:
#   sh tools/interior/build.sh            -> public/models/crew.glb, public/models/b17_interior.glb
# Needs Blender 4.2+ (BLENDER=/path/to/Blender to override) and the repo's node_modules.
set -e
cd "$(dirname "$0")/../.."
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
mkdir -p tools/interior/out
"$BLENDER" -b -P tools/interior/build_crew.py -- tools/interior/out/crew.glb
"$BLENDER" -b -P tools/interior/build_interior.py -- tools/interior/out/b17_interior.glb
node tools/interior/compress.mjs tools/interior/out/crew.glb public/models/crew.glb
node tools/interior/compress.mjs tools/interior/out/b17_interior.glb public/models/b17_interior.glb
