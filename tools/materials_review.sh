#!/usr/bin/env bash
# Run via tools/heavy.sh. Baseline is a verified live-source archive with the same rig overlay.
set -euo pipefail
workspace="$PWD"
baseline="${1:?Pass the verified live-source snapshot directory}"
review_server=''
stop_server() {
  if [[ -n "$review_server" ]]; then
    kill "$review_server" 2>/dev/null || true
    wait "$review_server" 2>/dev/null || true
    review_server=''
  fi
}
trap stop_server EXIT
start_server() {
  (cd "$1"; exec node node_modules/vite/bin/vite.js --port 5322 --strictPort) > /tmp/sws02-final-review-vite.log 2>&1 &
  review_server=$!
  for attempt in {1..60}; do
    kill -0 "$review_server" 2>/dev/null || { cat /tmp/sws02-final-review-vite.log; exit 1; }
    if curl -fsS http://127.0.0.1:5322/ > /dev/null 2>&1; then return; fi
    sleep .25
  done
  exit 1
}
shots=b17-beauty,top-formation,p51-cockpit,waist-interior,sunset,night-flak,turret-glass,close-shadow,formation-glints
start_server "$baseline"
node tools/visual_rig.mjs --url http://127.0.0.1:5322 --shots "$shots" --out docs/phase11/shots/02/before
stop_server
start_server "$workspace"
node tools/visual_rig.mjs --url http://127.0.0.1:5322 --shots "$shots" --camera-from docs/phase11/shots/02/before/manifest.json --out docs/phase11/shots/02/after
node tools/materials_compare.mjs
node tools/materials_details.mjs
node tools/materials_gunner.mjs
node tools/materials_runtime.mjs
node tools/visual_rig.mjs --url http://127.0.0.1:5322 --quality low --shots b17-beauty,top-formation,waist-interior --out docs/phase11/shots/02/low
RENDERER_URL=http://127.0.0.1:5322 RENDERER_OUTPUT=docs/phase11/shots/02 node tools/renderer_visible_runtime.mjs
node --input-type=module <<'JS'
import fs from 'node:fs'; import os from 'node:os'; import {execFileSync} from 'node:child_process';
const processes=execFileSync('ps',['-Ao','command'],{encoding:'utf8'}).split('\n');
fs.writeFileSync('docs/phase11/shots/02/performance-environment.json',JSON.stringify({
  capturedAt:new Date().toISOString(),heavySlotLimit:Number(process.env.HEAVY_SLOTS??3),
  taskConcurrentBrowsers:1,otherHeadlessGPUProcesses:processes.filter(s=>s.startsWith('/')&&s.includes('chrome-headless-shell --type=gpu-process')).length,
  voiceGenerationProcesses:processes.filter(s=>s.startsWith('/')&&s.includes('/python tools/voice/generate.py')).length,
  loadAverage:os.loadavg(),logicalCPUs:os.cpus().length,
},null,2)+'\n');
JS
node tools/materials_perf.mjs high
node tools/materials_perf.mjs low
PERF_URL=http://127.0.0.1:5322 PERF_OUTPUT=docs/phase11/shots/02/combat PERF_STEPS=600 MATERIALS_ISOLATED_OUTPUT=docs/phase11/shots/02/combat/combat.json node tools/materials_isolate.mjs node tools/presets_perf.mjs final
PERF_URL=http://127.0.0.1:5322 PERF_OUTPUT=docs/phase11/shots/02/combat-throttled PERF_TIERS=low PERF_CPU=4 PERF_STEPS=600 MATERIALS_ISOLATED_OUTPUT=docs/phase11/shots/02/combat-throttled/combat.json node tools/materials_isolate.mjs node tools/presets_perf.mjs final
node tools/materials_budget.mjs
