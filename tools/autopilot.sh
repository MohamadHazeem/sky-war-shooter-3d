#!/usr/bin/env bash
# Autopilot (speed items 3+4): for each task branch listed in .claude/autopilot.list
#   1. wait until its report is committed and GitHub CI is green on its head,
#   2. automatic review (`claude -p`): APPROVE or REJECT against the spec, the report and the before/after shots,
#   3. APPROVE -> merge lane (tools/codex_merge.sh) -> CI green on integration -> tools/ship.sh (deploy + push main),
#      REJECT  -> Codex branches are sent back automatically with the reasons (max 2 rounds); others are flagged.
# State: /tmp/sws-autopilot/<branch>.{approved,rejected,shipped,round}. Log: /tmp/sws-autopilot/log.
set -uo pipefail
cd "$(dirname "$0")/.."; ROOT="$(pwd)"; GH="$HOME/.local/bin/gh"; S=/tmp/sws-autopilot; mkdir -p "$S"
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
    ci=$("$GH" run list --branch "$branch" --limit 5 --json headSha,conclusion --jq ".[] | select(.headSha==\"$head\") | .conclusion" | head -1)
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
      log "APPROVED $branch"; touch "$S/$k.approved"; echo "$branch" >> "$S/merge.queue"
    else
      r=$(( $(cat "$S/$k.round" 2>/dev/null || echo 0) + 1 )); echo $r > "$S/$k.round"; log "REJECTED $branch (round $r)"
      echo "$verdict" > "$S/$k.rejected"
      if [ "$lane" = "cloud" ] && [ $r -le 2 ]; then
        acct=""; [ "$(date +%s)" -ge "${ACCOUNT2_FROM:-9999999999}" ] && acct=account2
        echo "$verdict" > "/tmp/sws-autopilot/$k.fixnote"
        ( cd /tmp/sws-cloud && git pull -q; export PATH="$HOME/.local/node/bin:$PATH"; [ -n "$acct" ] && export CLAUDE_CONFIG_DIR="$HOME/.claude-account2"
          (sleep 6; printf '\r'; sleep 40) | script -q "/tmp/cloud-fix-$k.log" claude --cloud "Branch $branch was REJECTED by the automatic quality review. Check out that branch, read AGENTS.md and docs/phase11/reference-pack.md, fix every point: $(echo "$verdict" | tail -n +2 | tr '\n' ' ') Update $report, commit, push the same branch and confirm GitHub CI is green. Never push main." > /dev/null 2>&1 & p=$!; sleep 45; kill $p 2>/dev/null ) &
      fi
      if [ "$lane" = "codex" ] && [ $r -le 2 ]; then
        ( cd "$wt" && codex exec --dangerously-bypass-approvals-and-sandbox -C . -o "/tmp/codex-$k-fix$r.txt" "Follow AGENTS.md. The automatic quality review REJECTED your work on this branch ($branch). Reasons: $(echo "$verdict" | tail -n +2 | tr '\n' ' ') Fix all of them, re-capture the affected shots, update $report, commit, push your branch and wait for green CI. Never push main, never deploy." < /dev/null > "/tmp/codex-$k-fix$r.log" 2>&1 ) &
      fi
    fi
  done < .claude/autopilot.list
  if [ -s "$S/merge.queue" ]; then
    batch=$(sort -u "$S/merge.queue" | tr '\n' ' '); : > "$S/merge.queue"; log "merging batch: $batch"
    tools/codex_merge.sh $batch >> "$S/log" 2>&1
    for i in $(seq 1 40); do tools/ship.sh >> "$S/log" 2>&1 && { for b in $batch; do touch "$S/$(key "$b").shipped"; done; log "SHIPPED batch: $batch"; break; }; sleep 30; done
  fi
  if [ ! -f "$S/scorecard.started" ] && [ -f docs/phase11/09-scorecard.md ]; then
    left=$(grep -v "^phase11/09" .claude/autopilot.list | grep -c . ); done_n=$(ls "$S"/*.shipped 2>/dev/null | wc -l | tr -d ' ')
    if [ "$done_n" -ge "$left" ]; then touch "$S/scorecard.started"; log "starting final scorecard (09)"
      echo "phase11/09-scorecard|docs/phase11/reports/09.md|.claude/worktrees/codex-09-scorecard|codex" >> .claude/autopilot.list
      ( PHASE=phase11 tools/codex_task.sh 09-scorecard >> "$S/log" 2>&1 ) & pending=1; fi
  fi
  [ $pending -eq 0 ] && { log "all branches shipped"; exit 0; }
  sleep 120
done
