#!/usr/bin/env bash
# Run via tools/heavy.sh tools/cached.sh ... (see README.md). No dependency installs.
set -euo pipefail
cd "$(dirname "$0")/../../.."
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
: "${BASISU:?Set BASISU to an existing Basis Universal encoder}"
export BASISU
# The checked-in conversion outputs preserve the exact upstream geometry inputs.
"$BLENDER" -b -t 4 --python-exit-code 1 -P tools/hero/luftwaffe/build.py -- p47d spitfire9 --size 2048 --ao-samples 48
node tools/hero/luftwaffe/finish.mjs p47d spitfire9
