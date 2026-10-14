# Phase 9 · Goal 3 — Gun feel 2.0 (the .50 cal must feel like a beast)

Report: `docs/phase9/reports/03.md` · Port 5293 · Shots: `docs/phase9/shots/03/`

Read first: `src/game/GunnerController.ts`, `Viewmodels.ts`, `KeyAim.ts`, `GameFeel.ts`, `WeaponMods.ts`,
`src/world/Ballistics.ts`, `src/render/PostFX.ts`, `src/audio/Sound.ts` (+ Phase 8 soundscape), `docs/BALANCE.md`.

Build: heavier, readable firing: recoil with mount spring-back per station (flexible waist gun vs turret),
camera vibration tuned to rate of fire (respect accessibility shake scale), muzzle flash/smoke that briefly
obscures, hot barrel haze, tracer burn-out at range (every 5th round), realistic-ish bullet drop and travel
time with the period ring sight's lead logic, turret twin-gun convergence, spent links/casings, ammo-belt
jiggle; satisfying hit confirmation already exists (Phase 8 goal 6) — keep consistent. Difficulty: Recruit gets
gentler drift/lead assist; Ace no assist. Tune so hit rates stay sane (measure with autoplay before/after).
Tests for ballistics, convergence and recoil models.

Done when: `npm run check` passes; screenshot sequences per station; hit-rate numbers before/after; report.
