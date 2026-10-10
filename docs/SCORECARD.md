# Playtest Scorecard

How we improve the game: each round, the player plays ~5 minutes and rates each area 1–5,
with one sentence on what felt worst. Lowest scores become the next round's targets.
Every target gets a measurable check so "done" is not a matter of opinion.

| Area | What it covers |
|---|---|
| Gun feel | Sound weight, recoil, tracers, hit feedback |
| Visibility | Can you see and aim at the target; HUD clarity |
| Engagement | Enemies stay in the fight long enough to duel |
| Challenge | Enemies are big, tough and dangerous, not trivial |
| Readability | Friend vs foe, where threats come from |
| Progression | Reasons to keep playing: upgrades, perks, unlocks |
| Graphics | Visual quality, effects, destruction |
| Audio | Mix, engines, music, ambience |

## Round 1 — 2026-10-10 (player feedback)

| # | Complaint | Target (measurable) | Status |
|---|---|---|---|
| 1 | .50 cal sounds like a pistol | Layered shot: sub-bass thump (<120 Hz) + body + crack + mechanical action; peak level ≥ +6 dB over previous; audible low end per round | Done — recorded report + synthesized pitch-dropping blast (34–150 Hz) + bolt clack; other sounds dip under each burst |
| 2 | Gun/fuselage covers half the screen | Waist view: ≥ 75% of screen is open sky; gun receiver below the sight, ≤ 15% of screen | Done — over-the-gun head position, ring sight only on RMB, small HUD reticle; ~85% sky in waist view |
| 3 | Enemies pass by in 2 s and vanish | Each attacker spends ≥ 8 s inside 800 m per pass; re-attacks instead of leaving | Done — new "duel" weave: attackers hold 300–800 m in your arc for 10–16 s, firing bursts, then re-attack. Measured: each enemy ~44 s within 800 m per mission; enemies in view 66 of 90 s |
| 4 | Red flash + shake too strong | Max red overlay ≤ 0.25 opacity; shake ≤ 0.35° and settles < 0.4 s; sight stays usable | Done — red overlay ≤ 0.23 (0.35 only with wounded crew), shake ~0.3° smooth and gone in ~0.4 s; cracked glass only in turrets, away from the sight |
| 5 | Enemies too small, too easy | Fw 190 apparent size +40%; ~35–45 hits to kill (was ~20) | Done — scale 2.4× (was 1.7), structure 460 (was 260), vital zones ×2.2 |
| 6 | Friendly bombers too close; hard to tell friend/foe | Formation spacing ×1.8; friendly markers blue, enemy red, always distinct | Done — formation spacing ×1.8; friendlies blue chevrons, enemies red brackets with type + range |
| 7 | No upgrades between rounds | Between waves/missions: spend points on gun upgrades + perks; persists across campaign | Done — Armory (6 upgrades × 5 levels, bought with merit = mission score) + pick 1 of 3 perks after each cleared wave (9 perks) |
| 8 | Can't see where enemies come from | Radar mini-map with expand key (Tab): shows incoming waves before they arrive | Done — radar plot bottom-left; Tab opens the 8 km map with incoming-wave marker + countdown up to 25 s before arrival |

## Round 2 — 2026-10-10 (player feedback)

| # | Complaint | Target (measurable) | Status |
|---|---|---|---|
| 1 | Low, inconsistent frame rate | ≥ 60 fps on a Retina MacBook; no frame > 50 ms on a kill | Done — render capped at a 2.3 MP pixel budget (was full 4K: 34 ms → ~10–14 ms), dynamic resolution keeps frame time < 17 ms, shaders pre-compiled before the first kill (550 ms freeze → ~30 ms), cheaper clouds |
| 2 | Sound suddenly disappears | Audio self-recovers from suspend/interrupt/NaN; voice budget | Done — resume watchdog, NaN-safe params, silence/NaN detector rebuilds the audio graph, 48-voice limit, HRTF budget, node cleanup |
| 3 | Shooting is very hard | Aim assist on by default | Done — sight magnetism + friction toward the lead point, +40% hit radius for your rounds, lead indicator on; Settings: Aim assist Off/Low/High |
| 4 | Enemies too small | Median on-screen size ≥ 75 px at 1512×982 (was 32 px) | Done — 4.2× scale, dogfights at 160–440 m, default FOV 55°: median 79 px, p75 106 px |
| 5 | Own aircraft blocks the view (seat 3) | Turret view free of struts/ring/sight body | Done — dome struts removed, ring dropped below eye line, sight body hidden, guns lowered and wider |
| 6 | Damage should build up visibly | 4 visible stages before destruction | Done — wisps → torn skin + dark trail → oily sputter, canopy gone, wobble → fire, explosions, glowing holes → breakup |
| 7 | Not a swarm; want 3–5 min continuous rounds, unlimited shooting | 4–14 fighters in the air at once, rounds 180–300 s, no reloads | Done — spawn director keeps the sky full (ramping), incoming groups on the radar, unlimited belts |

## Round 3 — 2026-10-10 (player feedback)

| # | Request | Status |
|---|---|---|
| 1 | Perks interrupt play; want random, automatic, more of them | Done — a random perk every 6 kills, shown as a small card (no pause); 20 perks |
| 2 | New enemy types (heavy/tough, fast/fragile, more ideas) | Done — real models: Bf 110 & Ju 88 (heavy, 2.6–3.4× health, bigger), Me 262 jet & Me 163 rocket (very fast, fragile), Bf 109 (agile); mix grows heavier each round; first-sighting radio calls |
| 3 | Own aircraft flies too steady | Done — formation weave and climbs, evasive jinks (more under attack), turbulence, lurch on heavy hits |
| 4 | Pilot/crew should talk on the radio | Done — 450 recorded radio clips (macOS voices, radio filter, queue), every callout voiced, new instruction lines |
| 5 | Rounds that get harder, even in survival; change aircraft/weapons/upgrades between rounds | Done — campaign 2–3 rounds per mission, survival endless rounds; hangar between rounds: 3 bomber + 3 fighter variants, 4 gunner + 3 pilot weapons, upgrades |
| 6 | Shooting view too close to own aircraft (~60% sky) | Done — waist head position out past the window frame, wider default FOV (65°) |
| 7 | Enemies bigger | Done — 6× scale (heavies normalised to ~1.3× a fighter) |
| 8 | Destruction the same for every aircraft | Done — 6 death types (fireball breakup, wing off, tail off + dive, engine fire dive + explode, bail-out, dead pilot spin) |
| 9 | Seat 3 POV unplayable | Done — raised eye, no struts/ring/sight body/cracked glass, HUD reticle |
| 10 | Only seats 1–2 get used | Done — half the incoming groups attack another gun position; radio names the seat; seat finder badges |
| 11 | Graphics to the next level | Done (pass 1) — tracers actually render now (were never drawn), hot-core tracer streaks, real fireball explosions with lingering smoke and cook-off pops, less sun glare, cleaner HUD |
| 12 | Satisfying hit sound | Done — layered clank/tick/thud with streak escalation, damage-stage crunch, big kill sound |
