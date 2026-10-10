# Phase 4 — "Overnight v1.0" (started 2026-10-10 21:37 +03, runs until 08:00)

Order: Tier A → Tier G → Tier B → Tier C. If everything is done before 08:00, create
Phase 5 (more goals, focus on graphics and gameplay) and keep going.

Every milestone: type-check + build + unit tests + headless campaign playtest (built-in
browser) + perf bench → commit → push → `npm run deploy` (live: https://sky-war-shooter-3d.mhamadhazeem2001.workers.dev).

Player notes given at the start:
- Slow motion only for big kills (done: heavies, bosses, aces, triple streaks).
- Boss fights must be very hard and very engaging: not one big plane but a battle group of
  several giant flying warships.

## Tier A — shippable foundation
| # | Goal | Status |
|---|---|---|
| 1 | Public release: <10 s load, compressed assets, installable (PWA) || Done — models 15→4.6 MB (meshopt+WebP), menu after 2.6 MB (was 16 MB; ~6.5 s at 10 Mbit/s vs 20 s), PWA + offline service worker, cache headers |
| 2 | First-time player experience: tutorial round, controls overlay, hints || Done — Gunnery School (8 steps), H controls card, 6 first-time hints, title prompt |
| 3 | Automated quality gate: unit tests + CI (tsc, build, tests) + playtest script | Done — 79 unit tests (Vitest), `npm run check`, GitHub Actions CI on every push |
| 4 | Performance & stability: 60 fps mid laptop, 30-min soak no growth, presets verified | |

## Tier G — gameplay fun
| # | Goal | Status |
|---|---|---|
| 31 | Game feel (freeze-frame, flashes, popups, pulses) | Done — hit-stop, flashes, camera punch, zoom pulse, escalating popups, hit ring |
| 32 | Combo meter + "On Fire" mode | Done — streak meter, ON FIRE (+50% score, hot tracers, fiery frame, swell) |
| 33 | Active abilities: Call the Mustangs, Overdrive, Focus || Done — Mustang sweep (Q), Overdrive (E), Focus (G); pilot Z/X/G |
| 34 | Boss fights: battle group of giant flying warships, very hard || Done — battle group of 3–4 giant Luftkreuzer warships: 12–17 weak points each, armour breach, telegraphed salvos, enrage, last stand, ramming, break-in-two deaths; survival every 3rd round, campaign m5/m7 finales |
| 35 | Bonus objectives mid-round || Done — 6 objective types, 1–2 per round, merit rewards |
| 36 | Random events (engine fire, jammed gun, oxygen, straggler) || Done — engine fire (X), jammed gun (R), oxygen (O), straggler |
| 37 | Loot crates | |
| 38 | Bomber customisation (name, nose art, paint) | |
| 39 | Crew with personalities | |
| 40 | Pacing + final-wave climax | |
| 41 | Modes: Ace Hunt, Time Attack, Daily Run | |
| 42 | Combat feedback: damage direction, lock-on warning, weapon kill feed | Done — damage-direction arcs, "ON YOU" lock warning + beep, weapon in kill feed |

## Tier B — should
| # | Goal | Status |
|---|---|---|
| 5 | Progression depth (crew levels, medals, dailies, stats, online leaderboard) | Partly — online leaderboard live (Firebase); crew/medals/dailies pending |
| 6 | Campaign 7 → 12 missions with story | |
| 7 | Special events (ace squadrons, Zerstörer waves, rocket barrages) | |
| 8 | Visual match to Yarnhub reference | |
| 9 | Cinematics (kill cam, replay, fly-by) | |
| 10 | Pilot mode overhaul | |
| 11 | Audio pass 2 | |
| 12 | Controls & accessibility (gamepad, colour-blind, subtitles, remap) | |
| 13 | Phone/tablet touch support | |
| 14 | Arabic (RTL) | |
| 15 | Cloud save (Firebase) | Done — Firestore profile under a private transfer code; auto-push after missions |
| 16 | Secure leaderboard | Done — append-only, validated, plausibility-checked, 1 entry / 20 s; live rules test passes |
| 17 | Smarter enemy tactics | |
| 18 | Own bomber visible damage + bail-out | |
| 19 | Weather & time of day | Done — overcast, storm (lightning/thunder), dusk; survival cycles weather per round |
| 20 | Bombing-run payoff | |
| 21 | Adaptive difficulty | Done — fighter count and skill ease/push with player performance |

## Tier C — could
| # | Goal | Status |
|---|---|---|
| 22 | Online co-op prototype | |
| 23 | 40 achievements + trophy screen | |
| 24 | Living sky | |
| 25 | Story briefings (voiced) | |
| 26 | Gameplay analytics | |
| 27 | Ultra preset, FPS counter, 120 Hz | |
| 28 | Menu/front-end polish | |
| 29 | Share + trailer + social card | |
| 30 | Code health: split Game.ts, unit tests, README | |

## Log
- 21:40 slow-motion fix committed.
- 21:45 memory/GPU leak fixed (shared geometries, owned resources disposed); 30-min soak stable.
- 21:48 leaderboard backend + rules deployed; rules test 6/6 (read pending index build).
- 21:52 cloud save, adaptive difficulty, weather moods; tests+CI merged; game feel merged.
- 21:54 deploy #1 to Cloudflare.
- 21:58 tutorial, abilities, objectives/events merged; deploy #2 (22:04).
- 22:10 fast loading + PWA merged; deploy #3; live manifest/sw/headers verified.
- 22:13 boss battle group merged; deploy #4. Launched tactics/special events + pacing/modes agents.
