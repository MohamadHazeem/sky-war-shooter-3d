# Phase 7 · Goal 2b — Sea Strike visual pass (ships and coast)

Report to: `docs/phase7/reports/02b.md` · Dev server port: 5272 · Screenshots: `docs/phase7/shots/02b/`

## Review findings (reviewer looked at your 02 screenshots)
Gameplay is good, but the art is far below the rest of the game:
- `battleship-day.jpg`: the Tirpitz-class battleship reads as a flat grey box with a block on top; it looks
  small. Turrets are tiny lumps. No funnel, mast, bridge tower, rangefinders, secondary batteries, boats,
  deck colour, sheer or bow flare. It must look HUGE and menacing (≈250 m long, 36 m beam; scale it right
  relative to the P-51 and other ships — destroyer ≈120 m, merchant ≈130 m, E-boat ≈33 m, U-boat ≈67 m).
- `shore-battery.jpg`: the coast is large flat-shaded pale-beige polygons with no texture/detail; bunkers
  are plain slabs. It looks unfinished.
- Merchant ships / trawlers / flak ships are acceptable but plain.

## What to do (visuals only; keep the gameplay, tests and APIs working)
- **Ships:** rebuild the procedural models with real silhouettes: shaped hulls (pointed bow with flare,
  sheer line, rounded stern, waterline boot-topping stripe, red/dark antifouling hint), wooden/teak or
  grey decks, superstructure tiers, bridge with windows, funnel(s) with caps and smoke, tripod/pole masts
  with yards, rangefinders, searchlights, lifeboats, railings suggested by thin lines, anchor details.
  Battleship: 4 twin main turrets (A, B fore; C, D aft) with long barrels that train and elevate toward
  the threat, 6 secondary twin turrets, many flak mounts, tall tower bridge, single funnel, aircraft
  catapult amidships. Optional Baltic/dazzle camouflage pattern (vertex colours or a small procedural
  canvas texture). Destroyer: raked bow, two funnels, 4–5 single gun mounts, torpedo tubes. U-boat Type VII:
  cigar hull, conning tower with railing and flak platform, deck gun, saddle tanks. E-boat: low fast hull,
  bridge, gun fore/aft. Merchant: well-deck, cargo hatches, derricks, upright funnel. Use shared/merged
  geometry and instancing; detail LOD (fewer parts at distance / on Low).
- **Muzzle flashes and smoke** for ship guns, battleship salvos with big flashes and a smoke cloud,
  tracer streams from flak mounts, splashes when shells miss near the player.
- **Coast:** proper terrain with noise (cliffs with rock strata, beaches with sand and surf foam line,
  grass/scrub on top, darker rocks), vertex colours + a procedural detail texture, shoreline foam where the
  sea meets land, harbour mole with blocks, a lighthouse, a few buildings, AA emplacements with sandbag
  rings, concrete casemates with gun slits and camo netting, radar dish (Würzburg) that rotates, flak
  tower that is clearly a tall concrete tower with corner gun platforms.
- Fit the existing look (hazed, lit like the rest of the game, ACES/HDR safe). Keep Low preset fast and no
  runtime shader recompiles (prewarm). Measure `sws.bench` again (High/Low, battleship wave in storm).

## Done when
`npm run check` passes; new screenshots (same views as 02 plus close-ups of battleship, destroyer, U-boat,
coast/battery) in `docs/phase7/shots/02b/`; report with before/after links and bench numbers. Commit on
the current branch.
