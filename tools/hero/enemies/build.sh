#!/bin/sh
set -eu
cd "$(dirname "$0")/../../.."
[ "$#" -gt 0 ] || set -- me410 me163 ju88g
exec tools/heavy.sh sh tools/hero/enemies/bake.sh "$@"
