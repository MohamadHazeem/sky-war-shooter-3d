#!/usr/bin/env bash
# Autopilot (speed items 3+4): for each task branch listed in .claude/autopilot.list
#   1. wait until its report is committed and GitHub CI is green on its head,
#   2. automatic review (`claude -p`): APPROVE or REJECT against the spec, the report and the before/after shots,
#   3. APPROVE -> merge lane (tools/codex_merge.sh) -> CI green on integration -> tools/ship.sh (deploy + push main),
#      REJECT  -> Codex branches are sent back automatically with the reasons (max 2 rounds); others are flagged.
# State: /tmp/sws-autopilot/<branch>.{approved,rejected,shipped,round}. Log: /tmp/sws-autopilot/log.
set -uo pipefail
cd "$(dirname "$0")/.."; ROOT="$(pwd)"; GH=~/.local/bin/gh; S=/tmp/sws-autopilot; mkdir -p "$S"
export PATH="$HOME/.local/node/bin:$PATH"
log(){ echo "$(date +%H:%M:%S) $*" | tee -a "$S/log"; }
key(){ echo "$1" | tr '/' '_'; }
while :; do
  pending=0
  while IFS='|' read -r branch report wt lane; do
    [ -z "$branch" ] && continue; k=$(key "$branch")
    [ -f "$S/$k.shipped" ] && continue; pending=1
    head=$(git rev-parse -q --verify "refs/remotes/origin/$branch" 2>/dev/null); git fetch -q origin "$branch" 2>/dev/null; head=$(git rev-parse -q --verify "refs/remotes/origin/$branch" 2>/dev/null) || continue
    git cat-file -e "$head:$report" 2>/dev/null || continue
    ci=$($GH run list --branch "$branch" --limit 5 --json headSha,conclusion --jq ".[] | select(.headSha==\"$head\") | .conclusion" | head -1)
    [ "$ci" = "success" ] || continue
    [ -f "$S/$k.reviewed-$head" ] && continue
    # cloud-lane branches have no local worktree yet: check the branch out for review/preview
    if [ ! -d "$wt" ]; then git worktree add -q --detach "$wt" "$head" && ln -sf "$ROOT/node_modules" "$wt/node_modules"; fi
    [ "$lane" = "cloud" ] && git -C "$wt" checkout -q --detach "$head"
    url=$(tools/preview.sh "$wt" "$(echo "$branch" | sed 's#.*/##')" 2>/dev/null | tail -1)
    [ -n "$url" ] && { echo "$url" > "$S/$k.preview"; echo "- $branch: $url" >> "$S/previews.md"; log "preview $branch: $url"; }
    log "review $branch @ ${head:0:7}"
    verdict=$(cd "$wt" && claude -p --model opus "You are the quality gate for the Sky War Shooter 3D game (owner wants 100/100 graphics, B-17 gunner focus). Review task branch $branch. Read its spec (docs/phase11/ file matching the report number), the report $report, and LOOK at the before/after screenshots it links (Read the image files). Decide whether the result is clearly better than the live game in the shots it touches and meets the spec's Done-when. Reply with the FIRST line exactly 'APPROVE' or 'REJECT', then up to 8 short lines of concrete reasons / required fixes." 2>/dev/null < /dev/null)
    touch "$S/$k.reviewed-$head"; echo "$verdict" > "$S/$k.verdict"
    if echo "$verdict" | head -1 | grep -q APPROVE; then
      log "APPROVED $branch"; touch "$S/$k.approved"
      ( flock 9 2>/dev/null || true
        tools/codex_merge.sh "$branch" >> "$S/log" 2>&1
        for i in $(seq 1 40); do tools/ship.sh >> "$S/log" 2>&1 && { touch "$S/$k.shipped"; log "SHIPPED $branch"; break; }; sleep 30; done
      ) 9>"$S/merge.lock"
    else
      r=$(( $(cat "$S/$k.round" 2>/dev/null || echo 0) + 1 )); echo $r > "$S/$k.round"; log "REJECTED $branch (round $r)"
      echo "$verdict" > "$S/$k.rejected"
      if [ "$lane" = "codex" ] && [ $r -le 2 ]; then
        ( cd "$wt" && codex exec --dangerously-bypass-approvals-and-sandbox -C . -o "/tmp/codex-$k-fix$r.txt" "Follow AGENTS.md. The automatic quality review REJECTED your work on this branch ($branch). Reasons: $(echo "$verdict" | tail -n +2 | tr '\n' ' ') Fix all of them, re-capture the affected shots, update $report, commit, push your branch and wait for green CI. Never push main, never deploy." < /dev/null > "/tmp/codex-$k-fix$r.log" 2>&1 ) &
      fi
    fi
  done < .claude/autopilot.list
  [ $pending -eq 0 ] && { log "all branches shipped"; exit 0; }
  sleep 120
done
