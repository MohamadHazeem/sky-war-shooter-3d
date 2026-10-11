# Phase 7 · Goal 2 — "Sea Strike": ships, U-boats and coastal defences

Report to: `docs/phase7/reports/02.md` · Dev server port: 5272 · Screenshots: `docs/phase7/shots/02/`

## Idea
The game is almost all air-to-air. Add a naval / coastal strike mode where the main targets are on the
water and the shore: fast E-boats, armed trawlers and flak ships, merchant convoys, destroyers, a heavy
cruiser, a HUGE battleship (Tirpitz-class) as the climax, U-boats that surface and crash-dive, and
onshore defence systems (coastal gun batteries in bunkers, flak towers, radar stations, searchlights).
Fighters still defend the fleet, but ships are the stars.

## Read first
`docs/ARCHITECTURE.md`, `src/game/Modes.ts`, `src/game/StrafeOps.ts` + `src/world/GroundTargets.ts`
(P-51 ground-attack mode: strafing, rockets/bombs if present, target kinds, flak guns — reuse its
patterns), `src/game/BossBattle.ts` + `src/world/BossShip.ts` (multi-part warships with turrets, weak
points, telegraphed attacks and break-in-two deaths — reuse the part/damage approach for sea ships),
`src/world/DitchingSea.ts` + `DitchingSpray.ts` (sea surface, spray), `src/world/Effects.ts`
(warshipBlast etc.), `src/game/PilotController.ts` / `PilotOps.ts` / `src/world/FlightModel.ts`,
`src/render/Weather.ts`, `src/net/Leaderboard.ts` + `firestore.rules` (MERGE), `src/i18n`.

## What to build
- **Sea world:** open sea with a stretch of enemy coastline (cliffs/beach, harbour mole, bunkers) built
  procedurally (no new downloaded models). Ship wakes, bow waves, spray, oil slicks and fires on the
  water, sinking animations (list, settle, break in two for big ships, bubbles, debris, survivors' rafts
  optional). Performance first: instancing/merged geometry, Low preset OK.
- **Player:** P-51 (existing flight model) armed for the job: .50s, HVAR rockets and a pair of 500 lb
  bombs (skip-bombing at low level works on ships), re-arm between waves. If a torpedo-bomber type is
  too much, skip it — note in the report.
- **Enemy roster (procedural low-poly models, part-based damage):**
  E-boat (fast, weaving, light flak, can be shredded with guns) · armed trawler / Vorpostenboot ·
  flak ship (dense flak, priority target) · merchant ship in convoy (score, slow) · destroyer (fast, 2–3
  gun turrets + flak, can be sunk with rockets/bombs on the waterline) · heavy cruiser (turrets, catapult
  aircraft optional) · **battleship boss** (huge, 4 main turrets that fire telegraphed salvos at the
  player's area, many flak mounts; destroy flak mounts and turrets, then hit the waterline/magazine
  weak points; sinks in a long dramatic sequence) · **U-boat** (surfaced on the way into harbour: deck
  gun + flak; crash-dives when attacked — must be hit before it submerges; periscope wake when
  submerged; bombs near a diving boat count) · **onshore defences**: coastal gun battery in a casemate,
  88 flak batteries, a flak tower, radar dish (kill it to reduce flak accuracy), searchlights at night.
  Plus Bf 109/Fw 190 fighter cover in later waves.
- **Structure:** Survival-style endless waves (mode id `survival-sea`) that escalate: patrol boats →
  convoy with escort → destroyer group + U-boat → coastal assault (shore batteries) → battleship group
  every 5th wave. Also expose it so a short campaign-style mission could use it later (no need to add
  campaign missions now).
- HUD: target markers per ship class with health bars for big ships, weak-point highlight, wave banner;
  radio lines (few, in `tools/voice/lines.json`, then `python3 tools/voice/generate.py --only <id-prefix>`).
- Weather: works with all moods; storm = rough sea (bigger swell, spray, ships pitch).
- Leaderboard mode `survival-sea` (change `firestore.rules` regex only; do NOT deploy rules — reviewer
  deploys). Menu entry under Survival. Arabic for all strings.

## Done when
`npm run check` passes with unit tests (ship part damage/sinking state machine, U-boat dive logic, wave
composition); browser check on your dev server with `sws.step`/autoplay: screenshots of a convoy attack,
a destroyer sinking, a U-boat diving, a shore battery, the battleship by day and in a storm; a
`sws.bench` number; report with what was built, files, anything not done.
