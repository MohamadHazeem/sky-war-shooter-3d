#!/bin/sh
# Rebuilds the Luftwaffe hero models: Blender (shape, UVs, bakes, paint, LODs) then glTF Transform
# (textures, WebP, meshopt) into public/models. See README.md.
#   sh tools/hero/luftwaffe/build.sh [bf109 fw190 me262 bf110 ju88]
set -e
cd "$(dirname "$0")/../../.."
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
"$BLENDER" -b -P tools/hero/luftwaffe/build.py -- "$@" --size 2048 --ao-samples 48
node tools/hero/luftwaffe/finish.mjs "$@"
