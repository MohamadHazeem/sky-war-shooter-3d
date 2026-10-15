#!/usr/bin/env bash
# Ship integration: require green CI on the integration head, fast-forward main, deploy, push.
set -euo pipefail
cd "$(dirname "$0")/.."; GH=~/.local/bin/gh; H=$(git rev-parse integration)
st=$($GH run list --branch integration --limit 5 --json headSha,conclusion --jq ".[] | select(.headSha==\"$H\") | .conclusion" | head -1)
[ "$st" = "success" ] || { echo "CI not green for integration $H ($st)"; exit 1; }
git merge -q --ff-only integration || git merge -q --no-edit integration
npm run deploy 2>&1 | grep -E "Version|error"; git push -q origin main; echo "shipped $(git rev-parse --short HEAD)"
