#!/usr/bin/env bash
# Ship integration: require green CI on the integration head, fast-forward main, deploy (game + Firestore rules if
# they changed), push.
set -euo pipefail
cd "$(dirname "$0")/.."; GH="$HOME/.local/bin/gh"; H=$(git rev-parse integration)
st=$("$GH" run list --branch integration --limit 5 --json headSha,conclusion --jq ".[] | select(.headSha==\"$H\") | .conclusion" | head -1)
[ "$st" = "success" ] || { echo "CI not green for integration $H ($st)"; exit 1; }
OLD=$(git rev-parse HEAD)
git merge -q --ff-only integration || git merge -q --no-edit integration
if ! git diff --quiet "$OLD" HEAD -- firestore.rules firestore.indexes.json; then
  npx firebase-tools deploy --only firestore:rules,firestore:indexes --project sky-war-shooter-3d 2>&1 | tail -1
fi
npm run deploy 2>&1 | grep -E "Version|error"; git push -q origin main; echo "shipped $(git rev-parse --short HEAD)"
