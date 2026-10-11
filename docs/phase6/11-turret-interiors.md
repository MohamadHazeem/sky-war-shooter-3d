# Phase 6 · Goal 11 — Ball and tail turret interiors

Report to: `docs/phase6/reports/11.md` · Dev server port: 5257

## Idea
The waist got a "living interior" overnight (other gunner, brass, breath fog, frost, sun shafts, free
look). The ball turret and the tail gun position are still sparse. Bring them to the same standard.

## Read first
`src/game/GunnerController.ts` (stations, hip/ADS views, free look C, interiors), `src/game/Viewmodels.ts`
(buildTurret, buildTailInterior, buildM2, AmmoBelt), `src/game/LivingInterior.ts` + `InteriorFx.ts` +
`Brass.ts` + `CrewFigure.ts` (the waist systems to reuse), `src/game/GlassFx.ts` (turret glass rain /
frost / cracks), `src/world/B17Layout.ts`, `docs/ARCHITECTURE.md`.

## What to build
- **Ball turret:** the cramped foetal position — the gunner's knees and boots visible at the edges, the
  two .50s' breeches and ammo chutes either side, the reflector sight between the knees, the armoured
  glass with the ground / cloud sea below, the turret rotating with the hydraulic hum, brass ejecting
  out of the turret (not piling up), the hatch above with the fuselage glimpsed when looking up.
- **Tail:** the kneeling position on the bicycle seat, the twin .50s with the cartridge belts running
  forward along the fuselage, the ring-and-bead sight, the narrowing tail cone with the tail wheel well
  and control cables, a glimpse forward down the fuselage to the waist, brass piling around the knees.
- Reuse breath fog / frost / sun shafts / muzzle light where they fit; free look (C) works in both.
- Never obstruct the default aim view; detail matters in free look and ADS.
- Performance: instanced/merged meshes, prewarm in `World.prewarm`, no per-frame allocations.

## Done when
`npm run check` passes; browser screenshots of both stations (aim view, free look, firing); m4 is a P-51
mission so verify with gunner missions (e.g. m2, m5 tail gun) in autoplay; report with steps.
