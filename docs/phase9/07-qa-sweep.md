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
