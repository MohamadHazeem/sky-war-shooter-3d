# Phase 8 · Goal 6 — Gunner hit feedback and close-up damage

Report to: `docs/phase8/reports/06.md` · Dev server port: 5286 · Screenshots: `docs/phase8/shots/06/`

## Idea
When the gunner hits, it must be obvious and satisfying; when the B-17 is hit, the inside should show it.

## Read first
`src/world/DamageLook.ts`, `DamageStages.ts`, `FighterDeath.ts`, `Wrecks.ts`, `Effects.ts`, `AceLook.ts`,
`EnemyDress.ts`, `src/world/Ballistics.ts`, `src/game/CombatFeedback.ts`/`src/ui/CombatFeedback.ts`,
`src/game/InteriorFx.ts`, `LivingInterior.ts`, `GlassFx.ts`, `TurretGlass.ts`, `src/ui/Cracks.ts`,
`src/world/PlayerBomberDamage.ts`, `src/render/*` (prewarm rules).

## What to build
- **Enemy close-up damage:** hit sparks/flashes on the hit panel; panels/cowling pieces tearing off and
  tumbling; canopy shattering (glass glints); oil/coolant streams; engine smoke turning to fire; pilot slumping
  or bailing out; prop windmilling/stopping. Visible at typical gunner ranges (100–600 m). Pooled, no
  allocations, LOD by distance.
- **Oil on the enemy's windscreen** isn't visible to the gunner — instead **oil/glycol spray from a hit
  enemy can streak across the B-17 turret glass** when it passes close.
- **B-17 interior damage:** bullet holes with light shafts (exists — extend), torn insulation, sparking
  wires, hydraulic fluid, frost through holes at altitude, debris floating in the slipstream, a crewman's
  station visibly hit.
- **Turret glass cracks** at the impact point (radial cracks, spider-web for heavy hits), persisting for
  the mission.
- Hit confirmation for the gunner: subtle, readable (small flash on target, short tick sound), respecting
  HUD detail (goal 2).
- Keep Low preset fast; prewarm all new materials.

## Done when
`npm run check` passes; screenshots/sequences at 150 m and 400 m of each enemy damage stage, interior damage
and glass cracks; `sws.bench` before/after on High and Low; report.
