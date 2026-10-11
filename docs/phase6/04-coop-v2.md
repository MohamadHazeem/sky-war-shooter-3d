# Phase 6 · Goal 4 — Co-op v2

Report to: `docs/phase6/reports/04.md` · Dev server ports: 5262 (and a second tab on the same server)

## Problem
Co-op (beta) works peer-to-peer (Firestore signalling + WebRTC, host-authoritative), but the guest's score
stays local (no shared result, no guest debrief/perks), and with STUN only some strict networks can't
connect (no TURN relay).

## Read first
`src/net/Coop.ts`, `src/net/Signal.ts`, `src/game/CoopSession.ts`, `src/ui/CoopScreen.ts`,
`src/game/MissionFlow.ts` (debrief), `src/net/Leaderboard.ts` (submitScore), `firestore.rules`
(coop_rooms rules — MERGE, never drop), `wrangler.jsonc` + `public/_headers` (the site is Cloudflare
Workers static assets), `src/i18n` (Arabic), the co-op limits in `docs/PHASE5.md` goal 9.

## What to build
1. **Shared crew score:** both players' kills/hits count toward one crew score shown on both HUDs; the
   guest's kills credited properly on the host (feed "Walsh (partner) destroyed…"), merit split sensibly.
2. **Guest debrief:** at mission end the host sends the full debrief data on the reliable channel; the guest
   sees a real debrief (crew score, own kills/accuracy, medals that apply, merit and career XP for the
   guest's own profile), then returns to the co-op lobby, ready for another round.
3. **Leaderboard:** co-op runs post one entry with both callsigns (new mode `coop-gunner`; update the rules
   regex and deploy with `npx firebase-tools deploy --only firestore:rules --project sky-war-shooter-3d`
   after fetching and merging the live rules).
4. **TURN relay, ready but optional:** add a tiny Cloudflare Worker route (in `wrangler.jsonc`, e.g.
   `/api/turn`) that mints short-lived Cloudflare Calls TURN credentials using secrets `TURN_KEY_ID` and
   `TURN_KEY_API_TOKEN` (set later by the owner with `wrangler secret put`); the client asks it for ICE
   servers before connecting and falls back to STUN only if the route fails or the secrets are missing.
   Document exactly how the owner creates the key (Cloudflare dashboard → Calls/Realtime → TURN keys)
   and sets the secrets. Do NOT deploy the Worker yourself.
5. Arabic for all new strings; tests for score merging, debrief payload and ICE fallback.

## Done when
`npm run check` passes; two-tab browser test on your dev server: host + guest play a short survival round,
both see the shared score, the guest gets a debrief and returns to the lobby; report with the rules diff
and the owner's TURN setup steps.
