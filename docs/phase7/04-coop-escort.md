# Phase 7 · Goal 4 — Co-op in Escort (two P-51 pilots)

Report to: `docs/phase7/reports/04.md` · Dev server port: 5274 (two tabs on the same server)
Screenshots: `docs/phase7/shots/04/`

## Idea
Co-op (beta) today is two gunners on one B-17 (`coop-gunner`). The owner wants multiplayer in the P-51
**Escort** game too: two friends each fly their own Mustang as a pair (lead + wingman) escorting the
bomber stream against German fighters — same lobby/code flow, same host-authoritative model.

## Read first
`src/net/Coop.ts` (WebRTC link: unreliable 'state' + reliable 'events' channels, TURN fallback),
`src/net/Signal.ts` (Firestore signalling, 6-char room codes), `src/game/CoopSession.ts` (host/guest
roles, snapshots at 20 Hz, input at 30 Hz, shared score, guest debrief, `coop-gunner` leaderboard),
`src/ui/CoopScreen.ts` (lobby), `docs/phase6/04-coop-v2.md` + `docs/phase6/reports/04.md`,
`src/game/PilotController.ts`, `PilotOps.ts`, `PilotRounds.ts`, `src/world/FlightModel.ts`,
`src/game/Wingman.ts` (AI wingman — the partner replaces it), `src/world/Aircraft.ts`, `Ballistics.ts`,
`src/game/Modes.ts`, `src/net/Leaderboard.ts` + `firestore.rules` (MERGE, never drop; do NOT deploy),
`src/i18n`, `docs/ARCHITECTURE.md`.

## What to build
1. **Lobby:** the co-op screen gets a mode choice: "B-17 crew (gunners)" (existing) or "P-51 escort
   (pilots)". Host picks; guest sees it. Arabic for every string. Callsigns shown as Blue One / Blue Two.
2. **Networking model (host-authoritative world, guest owns its own flight):**
   - Each player flies their own P-51 locally with the existing flight model and controls (no input lag on
     your own aircraft). The guest sends its aircraft state (position, quaternion, velocity, throttle,
     gear/flaps if any, trigger, rocket/bomb fire events) at ~30 Hz on the unreliable channel; fire
     events on the reliable channel.
   - The host spawns a remote-driven Fighter for the guest (replacing the AI wingman), smooths it with
     interpolation/extrapolation, and fires the guest's real .50 rounds/rockets from it so hits, kills and
     damage are resolved on the host. Enemy AI targets both Mustangs.
   - The host sends snapshots (all aircraft incl. the host's P-51, bombers, enemies, tracers bursts,
     explosions/kills, damage states) at 20 Hz; the guest renders everything except its own plane from
     interpolated snapshots (~100 ms buffer), reusing the gunner co-op snapshot code where possible.
   - Damage to the guest's P-51 is decided on the host and sent as events; the guest applies it locally
     (engine damage, fire, death → bail-out/spectate partner until the round ends).
   - Bandwidth target < 30 KB/s each way; reuse quantisation from the gunner co-op.
3. **Gameplay:** works in P-51 **Survival** (escort waves) and the P-51 **campaign / Custom Battle escort**
   rounds where feasible; if a mode is not feasible (e.g. Sea Strike, Hold the Field, Train Busting) keep it
   single-player and say so in the report. Shared crew score on both HUDs, partner marker + name tag +
   distance, partner kills in the feed ("Blue Two destroyed a Bf 109"), formation callouts. Partner
   down → revive at next round (respawn on the bombers' flank).
4. **Debrief + leaderboard:** both players get a debrief with own stats and shared score; one leaderboard
   entry with both callsigns, new mode `coop-pilot` (update `firestore.rules` regex locally — the
   reviewer deploys; keep every existing mode, including `survival-sea` and `survival-aa`).
5. **Robustness:** partner disconnect → host continues with the AI wingman, guest gets a clean "host left"
   screen; pause disabled in co-op; works with STUN only and with TURN when configured.
6. Tests: snapshot/input encoding round-trips, interpolation, remote-fighter firing, damage events,
   leaderboard mode routing, Arabic coverage.

## Done when
`npm run check` passes; two-tab browser test on your dev server (host + guest, real WebRTC between the
tabs, `sws.step` to drive frames if tabs are hidden): both fly a P-51 survival round, see each other's
aircraft move smoothly, guest's kills credited on the host, shared score on both HUDs, both debriefs,
disconnect fallback; measured bandwidth; screenshots; report with files and anything not done.
