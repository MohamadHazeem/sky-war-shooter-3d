# Phase 8 · Goal 7 — Fix false enemy markers (serious bug)

Report to: `docs/phase8/reports/07.md` · Dev server port: 5287 · Screenshots: `docs/phase8/shots/07/`

## Owner bug report (verbatim intent)
"The indicator for an enemy plane is basically false: I can see a red indicator and a small rectangle
telling me there is an enemy aircraft here, but in fact there is none." Seen while playing (mostly the
B-17 gunner). Treat as a serious bug: find every root cause, fix it, and prove it with an automated audit.

## Read first
Every place that draws an enemy marker or threat indicator: `src/game/GameHud.ts` (target boxes / labels /
off-screen arrows), `src/ui/ThreatRing.ts` (red incoming arcs), `src/ui/Radar.ts` (+ `Incoming`),
`src/ui/CombatFeedback.ts`, `src/ui/SpecialHud.ts`, `src/ui/BossHud.ts`, `src/game/Director.ts`,
`src/world/World.ts` (aircraft lists, removal, wrecks, floating origin / rebasing), `src/world/Aircraft.ts`
(alive/dying/wreck states), `src/world/FighterDeath.ts`, `Wrecks.ts`, `src/game/GunnerController.ts`
(camera, viewmodel FOV vs scene camera), `src/core/Engine.ts` (render order, camera update timing),
`src/render/WeatherPresets.ts` (Phase 7 fog/rain marker fade), co-op snapshot interpolation
(`src/game/CoopSession.ts`, `CoopPilot.ts`), `src/game/SeaOps.ts`, `AADefence.ts` (their own markers).

## Investigate (check each hypothesis; keep what's real)
- Markers for aircraft that are dead / dying / wrecks / bailed out / despawned but still in a list, or
  pooled objects reused with stale `visible`/position.
- Marker positions from simulation state that is a frame (or more) out of step with the rendered mesh, or
  computed before the camera / floating-origin rebase for that frame, or with a different camera (gun-sight
  zoom / viewmodel FOV / shake) than the one that rendered the scene.
- Points behind the camera projected onto the screen (w < 0 not rejected), or off-screen clamping that
  leaves an on-screen box.
- Aircraft that exist but are invisible: hidden by LOD/culling, model not loaded yet, scale 0, inside cloud
  or beyond fog visibility (markers should fade/hide consistently with what can be seen — decide a rule:
  e.g. show a small off-screen/"heard" cue, never a box over empty sky).
- The red threat ring pointing at attackers of other positions or other bombers that aren't visible from
  this seat; incoming warnings that persist after the attacker broke off or died.
- Friendly/foe classification errors; co-op guest seeing the host's markers with a different camera;
  replay/photo/bookend cameras.

## What to build
1. Fix every root cause found (minimal, targeted fixes in the right place).
2. A dev **marker audit**: `sws.markerAudit()` (and a vitest-friendly pure function) that, for the current
   frame, lists every drawn marker/arc with its target id and checks: target exists, alive (or intentionally
   shown as dying), in front of the camera, on-screen position within N px of the projected rendered mesh
   centre (same camera, same frame), and visible under the current fog/cloud rule. Runs headless with
   `sws.step` across: gunner campaign mission, gunner survival (heavy waves), P-51 survival, Defend the Field,
   Sea Strike, Hold the Field, night, fog/heavy rain, after many kills/despawns, after floating-origin rebases,
   with the gun-sight zoom on and off.
3. Unit tests for projection/visibility rules and stale-target removal.

## Done when
`npm run check` passes; the audit reports **0 false markers** over a long automated run (state the number of
frames/markers checked per scenario); before/after screenshots of at least one reproduced false marker; report
listing each root cause, the fix (file:line) and evidence.
