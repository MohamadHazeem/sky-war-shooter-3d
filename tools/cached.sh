#!/usr/bin/env bash
# Asset build cache: skip a heavy build (Blender bake, simulation, encode) when its inputs and command are unchanged.
#   tools/cached.sh <name> <input files/dirs...> -- <command...>
# Stores the input hash in .cache/builds/<name>.hash after a successful run (git-ignored).
set -euo pipefail
cd "$(dirname "$0")/.."
NAME="$1"; shift; INPUTS=()
while [ "$1" != "--" ]; do INPUTS+=("$1"); shift; done; shift
H=$( { printf '%s\n' "$*"; find "${INPUTS[@]}" -type f -print0 | sort -z | xargs -0 shasum; } | shasum | cut -d' ' -f1 )
F=".cache/builds/$NAME.hash"; mkdir -p .cache/builds
if [ -f "$F" ] && [ "$(cat "$F")" = "$H" ]; then echo "cached: $NAME (inputs unchanged)"; exit 0; fi
"$@" && echo "$H" > "$F"
