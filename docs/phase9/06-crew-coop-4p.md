# Phase 9 · Goal 6 — 4-player crew co-op

Report: `docs/phase9/reports/06.md` · Port 5296 · Shots: `docs/phase9/shots/06/`

Read first: `src/net/Coop.ts`, `Signal.ts`, `Ice.ts`, `src/game/CoopSession.ts`, `CoopPilot.ts`, `src/ui/CoopScreen.ts`,
`docs/phase6/reports/04.md`, `docs/phase7/reports/04.md`, `firestore.rules` (MERGE; you MAY deploy rules with
`npx firebase-tools deploy --only firestore:rules --project sky-war-shooter-3d` after fetching and merging live),
`src/net/Leaderboard.ts`, `src/i18n`.

Build: up to 4 players crewing one B-17 (host + 3 guests), star topology (host holds one CoopLink per guest),
room code shared as today; lobby shows 4 seats (left waist, right waist, top turret, ball, tail…) with seat
picking and ready states; AI crew covers empty seats; snapshots to each guest (bandwidth per guest < 30 KB/s);
guests' fire resolved on host; **ping system**: a key/button marks a target or clock direction for the whole
crew ("Bandit, 3 o'clock high!") with a short voiced callout and marker that obeys the Phase 8 marker rules
(`src/ui/MarkerProjection.ts`); shared crew score; debrief for all; leaderboard `coop-gunner` keeps working
(crew names up to 4, update rule limits). Late join/leave handling. Tests for multi-link session, seat
allocation, pings, encoding.

Done when: `npm run check` passes; browser test with 3–4 tabs on real WebRTC; bandwidth numbers; report.
