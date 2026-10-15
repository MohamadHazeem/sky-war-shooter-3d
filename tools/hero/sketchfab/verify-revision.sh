#!/usr/bin/env bash
# One sequential heavy slot; Vite must already be running on 5330.
set -euo pipefail
export PLAYWRIGHT_EXECUTABLE="${PLAYWRIGHT_EXECUTABLE:-$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell}"
node tools/hero/sketchfab/crew-shots.mjs
VISUAL_FIGHTER_BASELINE=/tmp/01b-baseline node tools/hero/sketchfab/shots.mjs before
node tools/hero/sketchfab/shots.mjs after
node tools/hero/sketchfab/compare.mjs
node tools/hero/sketchfab/runtime.mjs
node tools/hero/luftwaffe/silhouette/check.mjs bf109 fw190 --set hero=public/models --out docs/phase11/shots/01b/silhouette --gate
node tools/hero/sketchfab/b17-project.mjs
HERO_SILHOUETTE_OUT=docs/phase11/shots/01b/b17-silhouette "${SILHOUETTE_PYTHON:-../../../.venv-tts/bin/python}" tools/hero/silhouette.py
