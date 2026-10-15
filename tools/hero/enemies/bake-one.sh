#!/bin/sh
set -eu
"${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}" -b -t 6 --python-exit-code 1 -P tools/hero/luftwaffe/build.py -- "$1" --size 2048 --ao-samples 48
node tools/hero/luftwaffe/finish.mjs "$1"
