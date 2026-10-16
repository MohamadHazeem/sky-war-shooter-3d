#!/usr/bin/env bash
# Render the whole Arabic voice-over in small batches, each through tools/heavy.sh (the machine-wide
# slot limit), so other heavy jobs get their turn between batches. Resumable: finished clips are skipped.
#   tools/voice/arabic_batches.sh            one worker
#   tools/voice/arabic_batches.sh 0/2 &      two workers sharing the run (and 1/2)
#   TTS_DEVICE=cpu tools/voice/arabic_batches.sh 2/3 &   a worker on the CPU (6 threads) next to two GPU ones
# BATCH clips per heavy slot (default 30). Pass 1 retries the clips pass 0 rejected, with other seeds.
set -u
cd "$(dirname "$0")/../.."
SHARD="${1:-0/1}"
BATCH="${BATCH:-30}"
PY="${TTS_PYTHON:-$(git rev-parse --path-format=absolute --git-common-dir)/../.venv-tts/bin/python}"
LOG="tools/voice/.cache/arabic_batches.${SHARD/\//of}.log"
mkdir -p tools/voice/.cache
for pass in 0 1 2; do
  for role in pilot copilot nav tail top ball bombardier radio waist lead bigfriend blue2 blue3 blue4 control tower briefing; do
    while :; do
      out=$(tools/heavy.sh "$PY" tools/voice/generate.py --lang ar --only "$role" --shard "$SHARD" --reseed "$pass" --max-render "$BATCH" 2>&1 | grep -a -v -E 'Sampling|[Ww]arn|self.gen')
      { echo "== pass $pass, role $role, shard $SHARD, $(date +%H:%M)"; echo "$out" | grep -a -E 'to render|FAILED|wrote|Error|Traceback'; } | tee -a "$LOG"
      echo "$out" | grep -q ' 0 to render' && break
      echo "$out" | grep -q 'to render' || break   # crashed before selecting: next role
    done
  done
done
echo "== done shard $SHARD $(date +%H:%M)" | tee -a "$LOG"
