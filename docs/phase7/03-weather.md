# Phase 7 · Goal 3 — More weather: rain, snow, fog, thunderstorms, wind

Report to: `docs/phase7/reports/03.md` · Dev server port: 5273 · Screenshots: `docs/phase7/shots/03/`

## Idea
Weather today is sky moods (clear / overcast / storm / dusk / night) and mid-battle fronts. Add real
precipitation and visibility weather that changes how fights look AND play, in every mode (bomber
gunner, P-51 pilot, Defend the Field, Train Busting, and the two new Phase 7 modes when they land —
expose a small API they can call).

## Read first
`src/render/Weather.ts` + `WeatherState.ts` (Weather, moods, fronts, ROUND_WEATHER, stormStrike,
weatherEvents.thunder), `src/render/Atmosphere.ts`, `src/render/StormWall.ts`, `src/render/Sky*`,
cloud rendering (`src/render/*Cloud*`), `src/core/Engine.ts`, `src/game/CustomBattle.ts` +
`src/ui/CustomBattleScreen.ts` (Mood list), `src/game/Missions.ts`, `src/game/GlassFx.ts` /
`TurretGlass.ts` / `InteriorFx.ts` (canopy/turret glass), `src/audio/Sound.ts` (ambience),
`src/game/AutoGraphics.ts` + graphics presets (Low must stay fast), `src/i18n`.

## What to build
- **New conditions** (as data-driven presets that combine with time of day): light rain, heavy rain,
  snow, fog / low cloud, thunderstorm (lightning flashes lighting clouds, thunder with distance delay,
  rare lightning strikes), sleet/hail optional. Wind strength/direction.
- **Visuals:** GPU particle precipitation around the camera (streaks for rain scaled by airspeed, flakes
  for snow), drops/streaks running on canopy and turret glass, frost at the glass edges in snow, fog
  density and colour that reduce visibility, darker/greyer lighting under heavy cloud, wet runway/ground
  sheen at the airfield, sea swell stronger in storms (hook for DitchingSea / Sea Strike).
- **Gameplay effects (small, fair):** fog/rain cut spotting range (enemies appear later, markers fade
  in), wind adds gentle drift to tracers and bombs, turbulence bumps in storms, icing in snow reduces
  turret traverse a little; AI also affected (less accurate in heavy rain). Keep within ±10–20 %.
- **Audio:** rain on the airframe/glass, wind gusts, thunder rolls (synthesised or existing assets).
- **Where it applies:** Custom Battle weather options (add the new ones), Survival picks random weather
  per run/front, campaign missions get fitting weather where historically sensible (data only), the
  weather front system can turn into rain/snow/storm. Settings: a "Weather effects" quality toggle.
- **API for new modes:** `setWeather(preset)` / `weatherNow` read by modes; document it in
  `docs/ARCHITECTURE.md`.
- Arabic for all new strings. Low preset: precipitation count scaled down, no extra passes. No runtime
  shader recompiles (prewarm), no per-frame allocations.

## Done when
`npm run check` passes with tests (preset data, visibility/spotting math, wind drift); browser
screenshots of each condition from the gunner seat and the P-51 cockpit, and `sws.bench` numbers for
clear vs heavy rain vs thunderstorm on High and Low; report with files and anything not done.
