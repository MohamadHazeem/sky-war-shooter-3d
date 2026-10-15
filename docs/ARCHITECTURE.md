# Architecture: the game loop and where to hook in

`src/main.ts` builds the `Engine` (renderer and frame pipeline), `Input` and `UI`, then one `Game`
(`src/game/Game.ts`). `Engine` calls `Game.frame(dt)` once per frame through `engine.onFrame`, and
renders afterwards. Everything in a mission runs from that one call.

## Game and its modules

`Game` is the hub. It owns the world, the controllers and every gameplay system, runs the frame loop
and the menus, and keeps the settings and the mission state that several modules share. The large
pieces are separate modules. Each one gets a reference to the `Game` in its constructor, and `Game`
delegates to it:

| Module | Field on `Game` | What it does |
|---|---|---|
| `Director.ts` | `game.director` | `direct(dt)`, the battle director. It runs the tutorial and co-op gates, field promotions, the P-51 scripted rounds, the round director (with the boss director, pacing and adaptive difficulty), the classic wave list and survival waves. Then it handles flak, bombs away, the escort, crew chatter and the end conditions. It owns the wave and group state and the next group shown on the radar (`incoming`). |
| `MissionFlow.ts` | `game.flow` | The mission life cycle: `startMission`, `endRound` / `startNextRound` (the hangar break), `finish`, the `ending` state with bail-out and fly-by (`updateEnding`), and `showDebrief` (score, medals, progress, merit, leaderboard). |
| `WorldEvents.ts` | `game.worldEvents` | Handlers for `world.events.*`: crew radio and subtitles, kill scoring (combo, streaks, ace in a day), slow-motion rules, kill cam, losses, and hits on the player. It owns the streak state. |
| `GameHud.ts` | `game.hud` | The DOM HUD panels (refreshed every 0.08 s) and the 2D canvas overlay drawn every frame: markers, health bars, radar, lead pip, reticles, gunsights, hit and kill markers. |
| `MenuScene.ts` | `game.menuScene` | The cinematic camera behind the menus. |

The public API stays on `Game`, so other modules and the dev hooks (`window.sws`, `src/dev/*`)
never need to know about the split: `startMenu`, `startMission`, `finish`, `showDebrief`, `pause`,
`resume`, `state`, `mission`, `world`, `gunner`, `pilot`, `prog`, `boss`, `specials`, `coop` and so on.
The shared mission state is made of plain public fields on `Game`, grouped under one comment:
`score`, `roundIdx`, `roundT0`, `killsSincePerk`, `endResult`, `menuMode`, `slowmo`, `trauma`,
`damageT`, `loadout`, `combo`, `feel`, `tally` and the rest.

Some files read private-looking fields through `as any`: `(game as any).score` in
`SpecialEvents.ts` and `dev/autoplay.ts`, and `(g as any).weatherKey` and `(g as any).endResult` in
`CoopSession.ts`. Those fields have to stay on `Game` under the same names.

## One frame (`Game.frame`)

The order matters. Several systems read values that an earlier step wrote in the same frame.

1. Surface detail sync, `input.active`, `onboarding.update`, the cursor, `storm` (lightning).
2. Berserk timer, then the slow-motion beat (`engine.timeScale`).
3. `cine.preFrame`, `abilities.update`, `skills.update`.
4. Photo mode: draw only the free camera, then return. Take-off / landing scene (`bookends.frame`):
   the scene owns the frame, then return. Paused: draw the overlay only, then return.
5. `world.update(dt)` (AI, flight, ballistics, damage; this fires `world.events`, handled in
   `WorldEvents`), then `coop.update` and the bomb run (`target.update`).
6. Menu: `menuScene.update`. In a mission: `director.direct(dt)` (not on the debrief screen), then
   the gunner or pilot controller. In the `ending` state, `flow.updateEnding(dt)` counts down to the
   debrief.
7. Trauma camera shake. It comes after the controllers, so it is applied on top of their camera.
8. `feel`, `combat` and `cine` updates, auto quality, floating origin, audio listener, tracers,
   distant battle, wind and fighter voices.
9. Music threat (`computeThreat`). It runs before `boss.update` and `pacing.frame`, because those
   two override the music for boss battles and the final wave.
10. Engine health and cabin wind sounds, the damage flash, the wounded desaturation, then
    `midRound.update` and `specials.update`, the glass cracks, the red vignette and post settings.
11. `hud.tickMarkers`, `combo.update`, then `hud.frame` (score pop-ups, the HUD panels and the 2D
    overlay), `input.endFrame`, and the station-change fade.

Inside `Director.direct()` the order matters too. The co-op guest and the tutorial return first. The
P-51 scripted rounds (`pilotOps.direct`) come before the round director. Inside the round director,
`boss.director` runs first, and while a boss battle is on it replaces the normal director entirely.
The end conditions are checked last, and only while `endResult` is unset.

## Where to hook a new feature

Most features need one line in one of these places:

| You want to… | Add one line in |
|---|---|
| Run something every frame of a mission | `Game.frame()`, next to `midRound.update` / `specials.update` (step 10). Pass `this.roundIdx, this.roundT0` if it follows rounds. |
| Change who spawns and when | `Director.direct()` or `Director.director()`. Use `this.spawnWave(wave)` to spawn a group. Rule layers such as `Pacing`, `SpecialEvents` (`specials.onGroup`) and `ModeRunner` already hook in there. |
| Do something when a mission starts | `MissionFlow.startMission()`, next to the `onboarding/service/skills.onMissionStart` calls at the end. Reset per-mission state in your own module's reset, called from the reset block. |
| React to a round ending or starting | `MissionFlow.endRound()` / `startNextRound()`. |
| Add a music cue (stinger) for a game event | A rule in `audio/ScoreDirector.ts` (cooldown, duck, grid), a file key in `Music.ts` `CUE_FILE`, the sound in `tools/audio/score2_build.mjs`, and one call at the event (e.g. `sound.music.bomberLost` in `WorldEvents`, `sound.music.setBombRun` in `BombRun.update`). |
| React to the mission ending | `MissionFlow.finish()` (the moment it ends) or `MissionFlow.showDebrief()` (the debrief screen, next to `service.onDebrief` / `specials.nemesis.onDebrief`). |
| Play a scene before or after the mission | `Bookends.ts` holds the pattern: `bookends.takeoff()` at the top of `MissionFlow.startMission`, `bookends.landing()` at the top of `MissionFlow.showDebrief`, and `bookends.frame()` in `Game.frame()` before the paused check. Each one returns `true` while the scene runs and calls back when it ends. After a landing the parked field stays behind the debrief until `bookends.release()` (top of `Game.startMenu` / `showBriefing`). The P-51 escort missions' scenes live in `FighterBookends.ts`; `Bookends` hands each hook to it first and shares its airfield (`sharedBase()`). |
| Play a scene before or after the mission | `Bookends.ts` holds the pattern: `bookends.takeoff()` at the top of `MissionFlow.startMission`, `bookends.landing()` at the top of `MissionFlow.showDebrief`, and `bookends.frame()` in `Game.frame()` before the paused check. Each one returns `true` while the scene runs and calls back when it ends. |
| Play a scene between the debrief and the campaign map | `ui/CrewRoomScene.ts` (the crew-room interludes, content in `game/CrewRoom.ts`): `crewRoomScene.capture(g, m, d)` at the end of `MissionFlow.showDebrief`, and the debrief's map buttons go through `crewRoomScene.play(m, done)`. A DOM/canvas overlay, so it needs no frame hook. |
| React to a kill, a loss or a hit on the player | `WorldEvents.wire()`, in the matching `world.events` handler. |
| Draw on the 2D overlay | `GameHud.drawOverlay()`. Mind the order: the cracked glass is drawn last. |
| Show a value in the HUD panels | `GameHud.updateHud()`. |
| Add something to the title screen | `Game.startMenu()`, next to `coop/onboarding/service/skills.onTitle`. |
| Explain a feature to players | `game/FieldManual.ts` (the Field Manual's chapters, pure data; Arabic in `i18n/ar/manual.ts`, coverage in `tests/manual.test.ts`). The screen is `ui/FieldManualScreen.ts`; its entry points (title, pause, Settings) live in `game/ManualHooks.ts`, owned by `TitleExtras`, so `Game.ts` has no manual code. |
| Change the menu background camera | `MenuScene.update()`. |
| Change how the graphics preset is picked on first launch | `render/QualityPick.ts` (pure decision, `tests/qualityPick.test.ts`). The benchmark itself is `game/AutoGraphics.ts`, created in `main.ts`. It takes over the animation loop via `engine.loopOverride`. `Game`'s constructor only marks a first launch (`firstRunGraphics`). |
| Show a screen with a 3D scene of its own | Take over `engine.onFrame` (as `Theatre.ts` does) and set `engine.renderOverride` to draw it with `engine.renderStudio(scene, camera, dt)`: the world's MSAA target and post stack. Copy the world's light counts so the aircraft materials keep their compiled programs, and compile anything new with `engine.compileStudio()` before showing it (`AircraftGallery.ts`). Title-menu screens of this kind hook in through `TitleExtras.ts`. |

Formation set pieces (`SetPieces.ts`: a neighbouring B-17 downed by flak, a mid-air collision, a
bomb-bay explosion, the straggler, P-51s diving past) are owned by `MidRound` and scheduled from its
`update`, in the round's breather (`pacing.phase`); `Pacing.hushUntil` holds new groups back while one
plays and `Cinematics.drama()` gives them a short drama shot. Their losses go through
`World.scriptedLoss` and are left out of `world.combatLosses`, which the mission's loss limit uses.
Trigger one with `sws.drama('flakHit')` (or `collision`, `bombBay`, `straggler`, `littleFriends`).

Enemy aircraft break up where they are hit (`world/destruction/`, owned by `World.destruction`).
`World.onHit` books every round on an axis fighter to a structural part (the failure model). It decides
whether a wingtip, wing or tail comes off, or a tank catches fire and cooks off.
`FighterDeath.startFighterDeath` asks `destruction.plan()` before it picks an ending at random. Pieces are the real
mesh cut along the part boundaries and fly flat-plate physics. The parts contract for new models is in
[phase10/09-parts-contract.md](phase10/09-parts-contract.md). To play the captured sequences:
`sws.destruction.capture('wing' | 'tail' | 'fuel' | 'engine' | 'all')`. For frame times: `sws.destruction.perf()`.

A bigger system belongs in its own class that takes the `Game` (or a small host interface) in its
constructor, like `MidRound`, `SpecialEvents`, `SkillRuntime` or `CoopSession`. Create it in the
`Game` constructor and call it from one of the places above.

## Testing a change

Run `npm run check` (type check, build, unit tests). For gameplay, run the scripted autoplay
regression in [TESTING.md](TESTING.md) on a frozen build (`tools/regression_server.sh`). Runs are
not bit-for-bit repeatable, even with `Math.random` seeded, because some state depends on
wall-clock time, such as the menu frames that run before the mission and the audio and voice cooldowns. To check a refactor, compare a campaign run before the change with
one after it. Look at completions, console errors, and the spread of kills, bombers lost and mission
times. Don't diff the logs.

## Strategic air war (Phase 11 goal 10)

`game/StrategicWar.ts` is the German war industry under the campaign: 21 real sites in four sectors
(aircraft factories, ball bearings, oil, rail), weekly production, damage that reaches the lines after
a sector's lag (aircraft 3 weeks, bearings 5, oil 1, rail at once) and weekly repairs. Pure, seeded,
saved in `sws3d.strategic.v1` (bound to the campaign seed, rebuilt from the operations log when
missing). `CampaignState.recordCampaignOutcome` records each current operation's strike and returns
the week's newsreel; `strategicModifiersFor` / `prepareCampaignMission` fold the industry into the
enemy count and skill and filter second-tour enemy types; `ui/StrategicPanel.ts` registers the
spawn-time `ENEMY_MIX` hook (types whose factories were hit are swapped) and draws the campaign map's
"War industry" card, the industry map and the debrief newsreel. Nothing hit = every factor exactly 1.
Another campaign layer (The Tour) can call `recordStrike` / `industryFactors` directly.

## Weather conditions (Phase 7)

Modes use `game.setWeather('lightRain' | 'heavyRain' | 'snow' | 'fog' | 'thunderstorm' | 'clear')`.
The string API retains the mission's sun elevation, azimuth and night/dusk mood and removes its old
front. For explicit time, cover, or wind, pass a `Weather` object:

```ts
game.setWeather({
  sunEl: 14, sunAz: 250, low: .8, high: .9, preset: 'lightRain',
  wind: { speed: 10, direction: 90 }, // m/s; clockwise from world +Z (90 = +X), capped at 12
  front: { at: 60, to: 'overcast', preset: 'snow', duration: 45 },
});
```

Read `game.weatherNow` or import `weatherNow` from `render/WeatherState`. Its identity is stable;
`rain`, `snow`, `fog` (extinction per metre), `windX/Z`, `spotting`, `aimError`, `traverse`,
`turbulence`, `wetness`, `swell`, and `lightning` blend continuously through fronts. `preset` changes
at the midpoint; use the numeric fields for effects. `WeatherPresets.ts` owns the data and pure
visibility/wind math. Omitted presets retain legacy skies; legacy `storm` means `thunderstorm`.
`presetWeather(preset, base)` builds a full Weather object without changing night/dusk or sun angles.

`Engine.precipitation` draws one instanced camera-centred volume in the existing transparent pass
(160 flakes/streaks on Low, 960 on High), with pooled rare lightning strokes. `World.prewarm` warms
both materials. Fog uses the existing cloud composite, including on Low; no extra render targets
or passes. Canopy/turret glass reuses `GlassFx`, and Airbase reuses its ground shaders for wet sheen.
`DitchingSea` consumes `weatherNow.swell`; Sea Strike can use the same scalar for its ocean.

`Game.storm` owns overhead lightning and distance-delayed thunder; `Weather` owns distant storm-wall
flashes. `Sound.updateWind` mixes a synthesised rain bed and storm gusts on the ambience bus. Fog/rain
reduce marker and acquisition ranges by at most 20%; AI firing range and aim are also affected.
Snow slows traverse 10%. Both sides' bullets drift with wind, and Bombardier scoring, sight drift,
and TargetArea's falling bombs use the same wind. Gameplay modifiers follow this shared state.
The Settings “Weather effects” switch removes precipitation, glass weather, wet sheen and lightning
visuals while retaining fog, spotting and other gameplay rules. Glass overlays remain off on Low.

## Combat director and film look (Phase 10 goal 10)

`Cinematics` (game/Cinematics.ts) owns every cinematic camera: the special-kill cam, set-piece drama
shots, the fly-by, the best-moment replay and, since goal 10, the **combat director's shots**
(`game/CombatDirector.ts`: close passes in slow motion through the waist window, from a wing-tip camera
or on a long lens from a neighbouring B-17; kill follows on the 16 mm gun camera, a handheld chase or the
long lens). `CombatDirector.poll()` runs once a frame with nothing else playing; the pure rules
(`game/CineDirectorRules.ts`, tests in `tests/cinema.test.ts`) keep it rare (Settings "Combat director":
off / rare / often) and out of critical moments. `ShotRig` places the camera from the live aircraft each
frame (no stored scene positions, so floating-origin rebases are safe). The mission-end **combat film**
is `Theatre.openReel()` (debrief button "▶ Combat film"): the recording's best moments cut together by
the theatre director, which also has long-lens and wing-tip shots.

The **film look** is `render/FilmLook.ts` (parameters in `render/FilmParams.ts`), owned by
`PostFX.film`. Three self-contained passes hook into `PostFX.render`: `film.pre()` (per-object motion
blur from a velocity pass of the objects `film.heroes` hands in, then bokeh DOF) before bloom,
`film.target()` as the composite's render target, and `film.present()` (grain, gate weave, halation,
lens ghosts, Kodachrome / newsreel / gun-camera grades, vignette, flicker, dust). Cameras ask for a
look with `post.film.setShot('cinema' | 'telephoto' | 'gunCamera' | 'reel' | 'reelColour', focus)`
and `post.film.focusTarget`; play uses `post.film.setLook()` from Settings "Film look" (goal 12's
Cinematic preset should set it). Reduce motion removes slow motion, handheld sway, grain, weave,
flicker and dust; Low drops DOF and per-object blur. Each pass is a texture-in/texture-out function
with plain uniforms, so a Renderer 2.0 port re-implements them one at a time (the velocity pass only
needs "draw these objects with this material" plus each mesh's previous world matrix).
Dev hooks: `sws.cine.pass('waist' | 'wingtip' | 'telephoto')`, `sws.cine.kill('gunCam' | 'chase' |
'telephoto')`, `sws.cine.reel()`, `sws.cine.film(look)`, `sws.cine.status()`, `sws.cine.save(name)`.

## Phase 10 renderer foundation

`Engine` retains WebGL2 (including ordinary depth when `EXT_clip_control` is absent). Its pipeline is
opaque HDR/depth → clouds → transparent HDR effects → object/camera velocity → half-resolution temporal
GTAO → HDR TAA → metered exposure, bloom, ACES fit, mood LUT, sharpening/lens effects → display.
`TemporalFrame.begin/end` jitter and restore the projection; its histories reset on resize, quality
changes, camera cuts and floating-origin shifts. Mesh transforms include prop rotations; transparent
sprites use neighbourhood clipping and an HDR reactive weight rather than fabricated object velocity.
Camera blur explicitly subtracts TAA jitter. Transparent/velocity passes reuse the opaque pass's scene matrices; a `finally` block restores automatic updates and the camera projection.

`SunCascades` owns three nested, texel-snapped PCF maps: the camera/interior, formation, and distant
aircraft out to 2 km. Mid/far maps refresh every 4/12 frames. Light counts stay constant across presets;
Low uses the original close map and disables temporal post. `World.prewarm` calls `Engine.warmRenderer`
with its effect/aircraft variants present, including all three surface-detail shader variants.

`Sky.buildEnvironment` retains the PMREM generator and capture materials. Weather fronts refresh sky
IBL every three seconds; replaced render targets are disposed after detached material references have
been retargeted. The sun disk is excluded from IBL to avoid counting direct light twice. Light values
are scene-referred (25,000 lux/unit for the direct sun); eye adaptation remains bounded to preserve
night visibility/art direction. `MaterialAudit` preserves existing shader hooks and dynamic cache keys,
clamps PBR scalar inputs, and leaves deliberately unlit effects alone.

Medium/High use TAA without MSAA, Ultra adds 2× MSAA, Cinematic adds 4× and larger cloud/pixel budgets.
AutoGraphics caps automatic picks at Ultra; Cinematic is a manual advanced option. `PostFX.lensDirt`
is controlled by the saved Settings option. LUTs are preloaded and blend with weather fronts.

Renderer verification: start `npx vite --port 5301 --strictPort`, then run
`PLAYWRIGHT_MODULE=/existing/playwright/index.mjs node tools/renderer_smoke.mjs` and
`node tools/renderer_check.mjs after` with the same environment variable. The latter consumes the
committed baseline camera/root-pose snapshots. See `docs/phase10/reports/01.md` for measurements and limits.

### Goal 01b visible lighting and render cost

Sun cascades blend visibility before a single sun BRDF evaluation. PCF depth bias follows
ordinary/reversed depth, with smaller near normal bias; mid/far refreshes are staggered.
`CloudSurfaceShadow.ts` samples the existing upper-deck transmittance map at each receiver's
sun-ray intersection (both decks: R upper, G low). The camera probe no longer dims the aircraft sun; it
only feeds `weatherNow.cloudInside` (glass condensation, in-cloud sun dimming) and SoftDepth. `World.prewarm`
continues to warm the complete pipeline, including `LensScatter.ts` (quarter-resolution lens
flare/light shafts). The sky draws last at the far plane, allowing early depth rejection behind
opaque aircraft/interiors. High retains a 1080p main image, with 0.45-scale / 56-step clouds.

`TemporalFrame` integrates three bidirectional horizon slices for contact GTAO. Reconstructed
positions are snapped to the depth texel actually sampled, avoiding false self-occlusion on
sloping panels. Closer depth rejection and less history weight keep moving cockpit details crisp.
Lower environment-floor/hemi/rim fill and satin paint roughness separate sunlit metal from shadow;
print contrast and cool shadows are graded per mood while the existing bounded exposure remains.

The full goal-00 fixture rig is now available on this branch: run `node tools/visual_rig.mjs
--url http://127.0.0.1:5301 --out docs/phase10/shots/01b/after` (one shell line). It uses installed
Playwright/Chrome and creates 16 isolated 1080p fixtures; `--quality ultra` selects Ultra.
`tools/renderer_visible_contact.mjs` asserts matching poses/weather before making the comparison.
`tools/renderer_visible_runtime.mjs` verifies flat-plane/crevice AO and actual geometric/cloud
shadow attenuation on the GPU, with and without reversed depth. Existing renderer smoke/perf
scripts accept `RENDERER_OUTPUT` so new runs do not overwrite goal 01 evidence.
See [the 01b report](phase10/reports/01b.md) for measured budgets and remaining limits.


### Goal 12b CPU submission

`Engine.render` prepares a render-only scene with `AircraftSubmission` before the opaque pass.
Gameplay retains the original hierarchy for animation, raycasts, damage and film cameras.
A cached flat traversal is invalidated by attachment/removal events. Visible matrices and LOD selection run once; hidden pools and inactive LODs are skipped. Authored
aircraft static nodes have `matrixAutoUpdate=false`; mechanical pivots retain their live transforms.
Whole-aircraft spheres reject off-screen roots before traversal, retaining off-camera casters
when a sun cascade refreshes. Aircraft and attached interior parts share `BatchedMesh` draws by material, vertex layout and
shadow/culling state. The main-camera multi-draw list is reused for temporal velocity; shadow
cameras and each new pose rebuild it. Fighter soot uses a shared surface plus an instance tint; ace livery changes
fall back to the owned material. Individual visibility, material and geometry swaps remain independent.
Skinned meshes, custom callbacks, partial draw ranges and mirrored transforms use the ordinary
path. Transparent prop sweeps share a sorted batch; other transparent objects retain sorting.
`TemporalFrame` reads each batch instance's previous matrix for object velocity. `World.reset`
releases submission buffers; source geometries/materials remain owned by their existing systems.

Low uses a compact B-17 beyond 120 m; Medium does so beyond 350 m. Player aircraft, falling ships,
open bomb bays and near aircraft retain the articulated model; Medium film shots also use it.
Compact ships retain per-instance damage tint and the world smoke/fire effects. Film velocity
submits only its selected heroes instead of traversing the whole formation again.
Low keeps the three shadow shader slots with neutral one-pixel maps but stops refreshing them,
disables the distant bomber stream and film passes, uses one bloom level, 20-step/.18-scale
clouds and a 0.65 MP main image with half-size background shading. Low caps legacy smoke/glow pools at 512/256 new particles.
Medium retains cloud shadows and full effects but omits heat haze, screen-space AO and TAA;
its clouds use 28 steps at .24 scale, its main image is 1.25 MP and its close shadow map is 1024. High, Ultra and Cinematic retain their visual budgets.

Detached structural pieces use the same batch path and fighter damage material/tint binding.
Flipbook/volume depth ordering uses a stable merge sort with persistent scratch arrays; the
old insertion sort rebuilt its input order every frame and grew quadratically in combat.

Bullet collision uses persistent opposing-team lists and a conservative segment AABB before
sphere/zone tests, preserving the wider player near-miss checks.

CPU verification uses port 5312 and the bundled headless shell: `tools/cpu_profile.mjs`,
`tools/presets_profile.mjs`, `tools/presets_perf.mjs`, `tools/submission_compare.mjs` and
`tools/submission_validate.mjs`. The preset tools accept `PERF_OUTPUT`; combat also accepts
`PERF_CPU=4`, `PERF_BREAKDOWN=1` and `PERF_STEPS` (600 = 1,800 rendered frames,
1,800 = 5,400 frames). The bot advances three 1/60 s frames per step. `PLAYWRIGHT_EXECUTABLE`, when needed, must identify an
already-installed **headless shell**, never the desktop Chrome application.
