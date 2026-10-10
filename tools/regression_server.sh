#!/usr/bin/env bash
# Frozen test build for in-browser regressions: a development-mode bundle (keeps the window.sws
# autoplay hooks) served by `vite preview` on port 4173, so merges and hot reloads on the dev
# server can't interrupt a long autoplay run. Re-run to refresh the snapshot.
set -e
cd "$(dirname "$0")/.."
OUT=/tmp/sws-regression
rm -rf "$OUT"
NODE_ENV=development npx vite build --mode development --outDir "$OUT" --logLevel error
kill $(lsof -tiTCP:4173 -sTCP:LISTEN) 2>/dev/null || true
nohup npx vite preview --outDir "$OUT" --port 4173 --strictPort > /tmp/sws-regression.log 2>&1 &
sleep 2
echo "regression build at http://localhost:4173/"
