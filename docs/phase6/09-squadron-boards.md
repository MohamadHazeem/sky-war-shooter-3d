# Phase 6 · Goal 9 — Squadron leaderboards

Report to: `docs/phase6/reports/09.md` · Dev server port: 5260

## Idea
Let friends compete privately: create a squadron, share its 6-character code, and see a squadron board
for every mode plus a weekly rivalry, next to the global boards.

## Read first
`src/net/Leaderboard.ts` (lazy Firebase SDK, anonymous auth, fbConnect, submitScore, topScores, modes),
`src/ui/LeaderboardPanel.ts`, `firestore.rules` (scores validation, rate limit, modes regex — MERGE,
never drop rules), `src/net/CloudSave.ts` (transfer code pattern), `src/game/Modes.ts` (leaderboardMode),
`src/net/Signal.ts` (6-char codes), `src/i18n`.

## What to build
- Create / join / leave a squadron (name with a profanity-safe filter + 6-char code); the player's
  callsign (short name) set once; stored in the profile (cloud save mirrors sws3d.*).
- Scores submitted with the squadron id (validated in rules); squadron board tabs in every leaderboard
  panel; a "Squadron" screen: members, their best scores per mode, weekly challenge standings, a simple
  activity feed ("Reilly shot down an Experte").
- Firestore: `squadrons/{code}` (name, createdAt, member count), membership docs, query indexes
  (`firestore.indexes.json`); rules with field validation, size limits, members-only writes.
- Deploy rules + indexes with `npx firebase-tools deploy --only firestore:rules,firestore:indexes
  --project sky-war-shooter-3d` (the CLI is logged in). Fetch the live ruleset first and merge.
- Arabic for everything.

## Done when
`npm run check` passes (unit tests for code generation / validation); a live rules test script like
`tools/leaderboard_check.mjs` for squadron rules; browser check with two tabs (two anonymous users) joining
one squadron and seeing each other's scores; report with the rules diff.
