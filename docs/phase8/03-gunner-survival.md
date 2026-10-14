# Phase 8 · Goal 3 — Gunner survival systems (oxygen, cold, jams, ammo, wounds)

Report to: `docs/phase8/reports/03.md` · Dev server port: 5283 · Screenshots: `docs/phase8/shots/03/`

## Idea
At 25,000 ft a B-17 gunner fought the cold and thin air as much as the Luftwaffe. Add light, fair systems
that make the gun position feel alive without becoming chores. The HUD must stay clean (Phase 8 goal 2 —
show these through the world and small icons, not big panels).

## Read first
`src/game/GunnerController.ts`, `Viewmodels.ts`, `WeaponMods.ts`, `Upgrades.ts`, `src/world/PlayerBomberDamage.ts`,
`src/world/Crew.ts`, `src/game/CrewRoster.ts`, `CrewRoles.ts`, `GlassFx.ts`, `TurretGlass.ts`, `InteriorFx.ts`,
`src/render/WeatherState.ts` (cold/snow), `src/game/RadioChatter.ts`, `tools/voice/lines.json` (+ AGENTS.md voice
rule; voice engine is Chatterbox: `python3 tools/voice/generate.py --only <prefix>`), `src/i18n`, `docs/BALANCE.md`.

## What to build
- **Oxygen:** the mask hose can be hit/kinked by damage; a small O2 blinker icon; hypoxia slowly blurs and
  darkens vision and slows aim; press a key (O) to reconnect / switch to a walk-around bottle. Crew call it.
- **Cold:** heated-suit circuit can fail with electrical damage; frost creeps over the glass/gun sight; at
  -40° the gun can freeze if not fired for a long time (short, visible frost on the receiver, first burst
  clears it). Snow/cold weather makes this more likely.
- **Gun jams:** rare stoppages (heat + damage + cold raise the chance); clear with a short charging-handle
  action (hold R / tap twice) with a satisfying animation and sound; never more than 1 jam per ~2 min base.
- **Ammo management:** belts per gun station with realistic-ish counts; waist/radio guns reload from ammo cans
  (short animation); turrets have fixed boxes; teammates/AI can pass ammo when low (key or automatic); ammo
  status shown on the gun (belt visibly shortening) + tiny counter.
- **Wounds:** a wounded gunner has aim sway/tunnel vision depending on severity; field dressing (existing
  system) restores most of it.
- Difficulty: Recruit = mostly off/forgiving, Veteran = default, Ace = full. All values data-driven.
- Arabic for strings; a few new radio lines (oxygen check, "my gun's jammed!", "need ammo at the waist!").

## Done when
`npm run check` passes with unit tests (jam probability, freeze timing, oxygen/hypoxia curve, ammo flow);
browser screenshots of each effect at a real gun station; a short balance note with numbers; report.
