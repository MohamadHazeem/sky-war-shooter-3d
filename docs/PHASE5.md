# Phase 5 — "Next level: graphics & gameplay" (auto-created overnight, 2026-10-10/11)

Created because Phase 4 is nearly done with hours left before 08:00. Focus (player's request):
graphics and gameplay. Same process as Phase 4: helper agents in worktrees, gated merges
(tools/merge_agent.sh), frozen-build regressions (tools/regression_server.sh), deploys.

## Graphics
| # | Goal | Status |
|---|---|---|
| 1 | Cloud quality: temporal reprojection (more detail at the same cost), sharper silver linings, cloud shadows on the cloud sea | Done — quarter-res temporal reprojection with jitter + neighbourhood clamp (High 12–20 % faster), sharp forward-scatter silver linings, cloud shadows on the cloud sea and on the formation |
| 2 | Aircraft surfaces: procedural panel lines, rivets, weathering, oil streaks, chipped paint, roughness variation (B-17 + fighters) | Done — procedural panel lines + rivets (object-space projection), panel tone patchwork, chipped leading edges and walkways, exhaust/oil streaks per engine, grime, roughness wear; per model, composes with tints/paint/nose art/damage; distance fade (no shimmer); Low off, Medium lines, High/Ultra all |
| 3 | Volumetric-looking explosions: raymarched or flipbook fireballs, shockwave distortion | Done — raymarched noise fireballs (white core → orange → red → sunlit black smoke), shock shells, burning debris with smoke trails, cook-off pops, multi-stage heavy and warship blasts, lumpy flak puffs; pooled + LOD, no new shader compiles |
| 4 | Heat haze and distortion: engine exhausts, explosions, muzzle blast (screen-space refraction) | Done — screen-space heat haze: B-17 nacelle plumes, P-51 / Fw 190 exhausts, muzzle-blast shimmer, explosion shock ripples (off on Low, halved with reduced motion) |
| 5 | Explosion and muzzle light on clouds and aircraft; glowing tracers lighting the scene | Done — 4 pooled combat lights (explosions, heavy-gun muzzle flashes, hits) tint nearby aircraft and the player\'s gun; fixed light count, no recompiles. Tracer glow sprites not done |
| 6 | Night mission: moonlight, searchlights, flares, flak flashes in cloud, exhaust flames, night-fighter attacks | Done — moonlight, searchlights, exhaust flames, night fighters; pathfinder parachute flares (Flares.ts: light the clouds and the aircraft under them through the fixed light pool) and green/red target markers; searchlight-directed AA whose bursts glow orange in the cloud (CloudLights.ts: point lights in the cloud march); brighter, wider tracers at night; muzzle flashes light the canopy / turret glass and the cockpit; night grade without the black lift so it reads as night |
| 7 | Living interior: the other waist gunner and crew visible and animated, spent brass piles, breath fog at altitude | Done — the other waist gunner (tracks and fires with flash, recoil and brass; slumps when wounded, rookie replaces him), radio room through the open door, ball turret top turning in the floor, tail gunner down the tunnel, brass piling up (900 cap), breath fog in ADS, frost growing on the windows, swinging sun shafts, free look (hold C) |
| 8 | Canopy/turret glass effects: frost, rain streaks in storms, scratches catching the sun, oil smears | Done — P-51 canopy/windscreen + B-17 top dome, ball port and tail window: airspeed-driven rain streaks in storms, scratches that glint near the sun, oil build-up from engine damage, frost in cold missions, persistent bullet cracks; faded around the gunsight |

## Gameplay
| # | Goal | Status |
|---|---|---|
| 9 | Online co-op prototype: two players in one bomber (different seats) via Firebase signalling + WebRTC | Done (beta) — 6-character room codes over Firestore (validated, expiring rules), WebRTC data channels, host-authoritative world, guest mans another gun (its shots are real on the host), 20 Hz snapshots + 100 ms interpolation, PARTNER seat tags, latency bars, disconnect handling. Limits: no TURN relay, guest score local only |
| 10 | Custom battle: pick role, enemies, numbers, weather, time of day, boss on/off | Done — Custom Battle screen (role/seat, enemy types, counts, skill, rounds/endless, weather, sun, boss round, events/flak/escorts), saved setup, no leaderboard |
| 11 | Role reversal: P-51 interceptor mission against a Ju 88 / He 111 raid, and a night-fighter defence | Done — "Defend the Field" (Ju 88 raid with Bf 109 cover on your airfield) and "Night Fighter" (moonlit, searchlight cones, exhaust flames, Bf 110 night fighters, lit gunsight), 3 rounds each, own leaderboards |
| 12 | Wingman commands in pilot mode (attack my target, cover me, protect bombers) | Done — AI wingman in every P-51 mission: 1 attack my target, 2 cover me, 3 protect the bombers, 4 form up; radio acknowledgements, HUD panel, replacement if lost; keys/gamepad/touch |
| 13 | Persistent pilot/gunner skill tree (perk points from rank-ups) | Done — 18 nodes in 3 branches (Marksman / Gunnery Sergeant / Survivor) with capstones (Deadeye, Iron Lungs, Fortress), points from promotions + every 3,000 XP past Major, respec for merit, blueprint screen + hangar section |
| 14 | Dynamic campaign map: choose the next target, consequences (losses, morale, Luftwaffe strength) | Done — procedural 1943–44 strategic map, Luftwaffe strength / squadron / morale / escort gauges with real effects, 2–3 side raids per gap (rail, airfields, oil, U-boat pens, factories), intelligence reports, tour summary, save migration |
| 15 | Weekly challenge event with its own leaderboard and a special reward | Done — seeded ISO-week scenario, its own online leaderboard per role, +2000 merit + weekly ribbon + exclusive "Lightning Shield" nose art, countdown card |
| 16 | Replay theatre: save best moments, scrub, free camera, export screenshots | Done — 90 s recorder (12 Hz, 48 aircraft, tracers, explosions, auto-marked moments), timeline scrub + speeds, player/orbit/free/auto-director cameras, photo mode (FOV, DOF, exposure, 1–3× PNG), 5 saved moments (IndexedDB) in a title-menu Theatre |

## Extra goals (added overnight)
| # | Goal | Status |
|---|---|---|
| 17 | New German aircraft from FlightGear (He 111 bomber, Me 410 with BK 5 cannon, optionally He 219 / Ta 152 / Do 335) as new enemy types | Done — He 111 (raid bomber formations, dorsal gunner) and Do 335 (diving slashing interceptor) converted from FlightGear (GPL v2); Me 410 with telegraphed BK 5 50 mm cannon runs and rear barbettes on the Bf 110 airframe (no GPL Me 410 model exists); He 219 / Ta 152 not available |
| 18 | P-51 ground attack: strafing trains, flak towers and airfields at low level | Done — "Train Busting" special operation: procedural countryside (fields, rivers, railway, village, 9,800 trees), 3 rounds (train with boiler burst, convoy, airfield with parked aircraft), 20 mm flak and a quad flak tower firing back, low-level Fw 190s, PULL UP warning, crash rules, wingman ground attacks, own leaderboard |
| 19 | Arabic for every screen added overnight (campaign map, skills, custom battle, weekly, co-op, theatre, wingman) | Done — campaign map, skills, custom battle, weekly, theatre, FPS counter, raid missions + wingman, co-op, canvas HUDs, special events and tactics; RTL mirroring, Arabic number agreement, coverage tests |
| 21 | Nemesis system: persistent named Luftwaffe aces with traits, grudges, scars, promotions and a dossier screen | Done — 8 Experten (name, rank, unit, aircraft, colours/emblem, trait-driven AI), appearances with radio memory + dossier card, outcomes persist (victories, promotions, escapes with patches and grudges, deaths, hospital), replacements, bounties + medal + achievements, "Luftwaffe Experten" screen |
| 22 | Audio pass 3: engine voices for the new aircraft and warships, BK 5 / flak sounds, distance-aware explosions, waist ambience (wind, creaks, brass), ducking and mix check | Done — synthesised engine voices per type (Jumo/DB 603 twins, Do 335 push-pull, Me 262 turbine whine, Me 163 rocket, warship engine groups + hull throb), BK 5 thump, MG 81Z, 20 mm flak, distance-delayed/filtered explosions with stages, waist wind/rattles/other gunner/brass, ducking, Audio detail + breathing settings; 0 bytes added |
| 23 | Mission bookends: dawn takeoff from the English base and landing afterwards (belly landing with fire trucks when badly damaged), skippable | Done — 24 s dawn take-off at Deenethorpe (runways, tower, hangars, taxiing B-17s, climb through the clouds into the slot) and 21 s landing on the player\'s real damaged bomber (clean / rough with red flares / belly landing with sparks, fire tender and ambulances); skippable, setting, autoplay skips |
| 24 | QA sweep: phone/touch, gamepad, first-time player flow, console errors across all new features | Done — phone/tablet layouts (scrolling title menu, campaign map order, co-op lobby), ≥40 px touch targets, 7 HUD overlaps fixed, Arabic + touch HUD, LOOK button + touchable event prompts, gamepad menu navigation + abilities + free look, Training no longer buried in tips, controls card complete, console warnings fixed. Open: theatre cramped on phones, some gamepad gaps |
| 25 | Weather fronts mid-mission (storm wall approaching, smooth transitions) + night flares, flak glow in cloud, night tracers | Done — `weather.front: { at, to, duration }` (Weather.ts) blends cover, sun, sky, haze and rain on the glass per frame without history resets; a cumulonimbus wall (StormWall.ts) closes in over the last 95 s and lightning starts once the storm is overhead; m9 flies from clear air into the front, m3's overcast breaks up before the bomb run; Survival rounds roll for an occasional front; Custom Battle has a "Weather front" option |
| 26 | Balance pass: autoplay statistics at near-perfect and human-like bot skill across all modes; tune boss length, raid fairness, round lengths; docs/BALANCE.md | In progress |
| 20 | Code health: split Game.ts into focused modules, README for the v1.0 feature set | In progress |

## Log
- 23:00 started co-op (9), custom battle + weekly (10, 15), skill tree (13), living interior (7), campaign map (14).
- 23:10 started role reversal + wingman commands (11, 12), replay theatre (16).
- 23:20 started volumetric explosions + combat light (3, 5). Goals 1, 2, 4, 6, 8 wait for the Phase 4 graphics pass (same files).
- 23:22 campaign map, skill tree, custom battle + weekly merged (226 tests); debrief "Next mission" now opens the campaign map.
- 23:30 replay theatre merged (247 tests); started cloud quality + heat haze (1, 4), aircraft surface detail (2), new FlightGear aircraft (17).
- 23:32 co-op prototype merged (255 tests); started Arabic for the new screens (19).
- 23:48 wingman + role reversal merged (Arabic added; wingman is Blue Four in escort missions to avoid the clash with the player's own Blue Two callsign); started P-51 ground attack (18).
- 23:53 volumetric explosions + combat light merged. Known: the first Bf 109 / Fw 190 wing-off or blow-up kill still compiles 1–3 shader variants (clip-plane count); warm-up fixes tried and reverted.
- 00:01 living interior merged; full regression running; started canopy/turret glass effects (8).
- 00:04 aircraft surface detail merged; checking B-17 bullet-hole placement (possible quantized-space bug).
- 00:04 Arabic catch-up merged (272 tests).
- 00:11 new aircraft + clouds/haze merged (274 tests).
- 00:48 nemesis system merged (302 tests).
- 01:00 ground attack merged (311 tests).
- 01:05 audio pass 3 merged (326 tests).
- 01:08 glass effects merged.
- 01:34 QA sweep merged.
- 01:44 take-off/landing bookends merged.
- 01:58 theatre phone + gamepad gaps merged (332 tests); night fixes (searchlight blobs, glass NaN).
- 02:10 bookend sounds merged (343 tests).
