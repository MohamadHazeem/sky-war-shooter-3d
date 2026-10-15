#!/bin/sh
# Called inside one heavy slot. Each aircraft is independently cached; outputs are not inputs.
set -eu
[ "$#" -gt 0 ] || set -- me410 me163 ju88g
for kind do
  case "$kind" in me410) base=bf110;; me163) base=me163;; ju88g) base=ju88;; *) exit 2;; esac
  tools/cached.sh "enemy24-$kind" tools/hero/luftwaffe/*.py tools/hero/luftwaffe/types/"$kind".py tools/hero/luftwaffe/types/"$base".py tools/hero/luftwaffe/finish.mjs tools/hero/enemies/bake.sh tools/hero/enemies/bake-one.sh tools/convert_models/output/"$base".glb -- sh tools/hero/enemies/bake-one.sh "$kind"
done
