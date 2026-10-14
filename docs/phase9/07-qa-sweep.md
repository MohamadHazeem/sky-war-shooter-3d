# Phase 9 · Goal 7 — Bug and balance sweep (runs after goals 1–6 are merged)

Report: `docs/phase9/reports/07.md` · Port 5297 · Shots: `docs/phase9/shots/07/`

Read first: `docs/TESTING.md`, `docs/BALANCE.md`, `tools/*autoplay*`/`sws.autoplay`, `src/dev/*`, Phase 8 reports.

Do: automated playthroughs of every gunner campaign mission (incl. the new chapter), gunner Survival to round
10+, each difficulty, Low and High, EN and AR; watch for errors, stuck states, softlocks, HUD overlaps
(`sws.hudOverlaps()`), false markers (`sws.markerAuditRun()`), audio voice overlaps, memory/shader growth, frame
spikes. Fix what you find. Balance: win rates and survival rounds per difficulty within sane targets (document).
Known leftovers to fix: the round number shown twice in the Standard HUD top-left; the Sturm wedge tip mentions
"chin or nose" (not playable seats) — say "top turret"; the "H — controls" chip lingers. Tests for each fix.

Done when: `npm run check` passes; a table of scenarios run, issues found/fixed; report.

Additional items from review (Phase 9 merges):
- **Sky streaks:** thin radial lines fan across the sky in normal gunner views (seen in Phase 9 goal 1
  screenshot `docs/phase9/shots/01/damage-waist.jpg`). Phase 7 traced the same artefact to the dome's stretched
  cirrus plane and only disabled it in Hold the Field (`Sky.ts` uniform). Fix it properly for every mode.
- **Interaction check:** living formation (goal 1) and bomb run (goal 2) both steer the formation and add B-17
  losses; verify a full campaign run with both (stragglers vs straight-and-level, ditching on the return leg vs
  bomb-run rally, no double-counted losses).
- **Ace difficulty:** after gun feel 2.0 removed Ace assist, the precise autoplay kills fell 62 → 30 on m1;
  confirm Ace is hard but winnable and tune if not.
