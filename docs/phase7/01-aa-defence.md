# Phase 7 · Goal 1 — "Hold the Field": fixed-gun airbase defence (new Survival mode)

Report to: `docs/phase7/reports/01.md` · Dev server port: 5271 · Screenshots: `docs/phase7/shots/01/`

## Idea
A new endless Survival mode where the player does NOT fly. You man anti-aircraft guns in sandbagged pits
on an Allied airfield and hold off escalating swarms of German aircraft attacking the base. Different
feel from every existing mode: grounded, looking up, tracking diving and strafing aircraft, leading
targets with a ring sight, managing heat/ammo and choosing which threat to kill first.

## Read first
`docs/ARCHITECTURE.md`, `src/game/Modes.ts` (registerMode, survival/acehunt/timeattack, leaderboardMode),
`src/game/RaidDefence.ts` (Defend the Field — airfield-defence logic from the air; reuse ideas, don't
break it), `src/world/Airbase.ts` (Deenethorpe airfield scenery: runways, hangars, huts — reuse as the
battlefield), `src/game/GunnerController.ts` + `src/game/Viewmodels.ts` + `src/world/Ballistics.ts`
(aiming, gun feel, tracers, hits), `src/world/AI.ts` / `DogfightAI.ts` / `EnemyTypes.ts`, `src/world/Effects.ts`,
`src/world/GroundTargets.ts` (flak guns on the ground, explosions on terrain), `src/render/Weather.ts`
(moods + fronts), `src/net/Leaderboard.ts` + `firestore.rules` (mode regex — MERGE, never drop),
`src/i18n` (Arabic), `src/audio/Sound.ts`.

## What to build
- **The position:** 2–3 gun pits around the airfield (e.g. a quad .50 M45 "meat chopper" for close
  swarms and a 40 mm Bofors with slow, heavy, proximity-ish bursts for bombers). Switch pits with keys
  1/2/3 (short camera move). First-person view from the gun with a period ring-and-bead sight, the gun
  model/shield visible, recoil, shell casings, muzzle flash at night. Mouse aims the mount with
  realistic traverse/elevation speed limits (heavier gun = slower). Overheat / reload cycle.
- **Things to protect:** hangars, parked B-17s on hardstands, the fuel dump, the control tower, and your
  pits. Each has health; destroyed assets burn and smoke; losing all parked bombers or the tower = game
  over; a pit hit hard takes the gun out for a few seconds (crew wounded, repair timer).
- **Enemy waves (escalating, endless):** strafing Bf 109 / Fw 190 swarms coming in low across the
  field; Ju 88 dive bombers in steep dives (siren-like scream as they dive, bombs walk across the field);
  He 111 level bombers in formation dropping bomb sticks; Bf 110 with rockets/cannon; later waves mix
  jets (Me 262 fast passes) and Me 163 rocket fighters; occasional big wave with a "Major raid" banner.
  Enemies use existing models and AI building blocks; new attack profiles (strafe run, dive bomb, level
  bomb run) as small data-driven behaviours. Enemies shoot back at pits (dust/sand spray, near misses).
- **Feedback:** wave counter, base integrity bar, threat arrows for incoming groups, radio lines from the
  base (new lines in `tools/voice/lines.json` per AGENTS.md — keep them few; the voice engine is now
  Chatterbox, so for new clips run `python3 tools/voice/generate.py --only <id-prefix>`), kill feed,
  combo/score, between-wave repair/upgrade choice (e.g. faster traverse, more ammo, repair hangar,
  extra pit). Explosions, debris, craters, burning wrecks on the field.
- **Weather:** pick from the existing moods (clear/overcast/storm/dusk/night). Night = searchlights
  coning targets + tracer-heavy look.
- **Leaderboard:** new mode id `survival-aa` (update Modes, Leaderboard, rules regex, deploy rules is
  NOT allowed — just change `firestore.rules` and say so in the report; the reviewer deploys).
- Menu entry under Survival (mode select), Arabic for all strings, mobile/touch controls if the mode
  framework supports them, Low preset working, no per-frame allocations.

## Done when
`npm run check` passes with unit tests (wave generation/escalation, asset damage, gun traverse limits);
browser check on your dev server: play/auto-drive several waves (`sws.step`), screenshots of the gun
view by day and night, a dive-bomb attack, a destroyed hangar; a `sws.bench` number vs. a normal mission;
report with what was built, files, and anything not done.
