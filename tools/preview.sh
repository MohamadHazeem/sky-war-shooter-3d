#!/usr/bin/env bash
# Preview link per goal: build a worktree/branch and upload it as a Cloudflare Worker *version* (NOT deployed to
# production) with a stable alias URL: https://<alias>-sky-war-shooter-3d.mhamadhazeem2001.workers.dev
#   tools/preview.sh <worktree-dir> <alias>
set -euo pipefail
WT="$1"; ALIAS=$(echo "$2" | tr 'A-Z/_.' 'a-z---' | cut -c1-40)
cd "$WT"
npx vite build --logLevel error >/dev/null
npx wrangler versions upload --preview-alias "$ALIAS" --message "preview $ALIAS" 2>&1 | grep -oE "https://[^ ]*workers.dev" | sort -u | tail -1
