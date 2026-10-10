# Sky War Shooter 3D

A WWII air-combat game for desktop browsers. Man the .50-calibre guns of a B-17G Flying Fortress
in a combat box at 25,000 ft, or fly a P-51D Mustang as close escort, against Focke-Wulf Fw 190s.

![Left waist gunner](docs/screenshots/waist-gunner.jpg)

The look is modelled on the waist-gunner shot (0:54–0:58) of Yarnhub's animated short
*When a B-17 Pilot Attacked the Copilot*: the gunner's view down a Browning M2 with a ring-and-post
sight, the ammunition belt curling in from the left, the dark fuselage framing a bright window, and
the bomber formation above a sea of cumulus. Reference frames are in `reference/video-frames/`.

| | |
|---|---|
| ![Formation](docs/screenshots/formation.jpg) | ![P-51 cockpit](docs/screenshots/p51-cockpit.jpg) |
| ![Top turret](docs/screenshots/top-turret.jpg) | |

## Play

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173 in a desktop browser (Chrome, Edge, Firefox or Safari) with hardware
acceleration enabled. Mouse and keyboard only.

* Click the game to capture the mouse. If the browser refuses capture (some embedded views do), the game still works with a free cursor: move the mouse to aim, and hold the cursor near a screen edge to keep turning.
* **Esc** pauses.

### Modes
* **Campaign**: seven missions (Emden, Bremen, Ludwigshafen, Leipzig escort, Schweinfurt, a lone
  straggler fighting its way home, and the Berlin escort). Each mission unlocks the next; medals and
  best scores are saved in the browser.
* **Survival**: endless, escalating waves as a B-17 gunner or a P-51 escort pilot, with a local
  high-score table.

### Controls

**B-17 gunner**

| Input | Action |
|---|---|
| Mouse | Traverse the gun (heavy, sprung mount) |
| Left button | Fire (short bursts: the barrel overheats) |
| Right button | Look down the sight (zoom) |
| 1–5 | Left waist, right waist, top turret, ball turret, tail gun |
| R | Reload |

**P-51D pilot**

| Input | Action |
|---|---|
| Mouse | Mouse-aim flight: the aircraft flies where you look |
| Left button / Space | Fire the six .50s (harmonised at 300 yd) |
| W / S | Throttle |
| Q / E, A / D | Roll, rudder overrides |
| V | Cockpit / chase view |
| C (hold) | Free look |
| M | Toggle mouse aim / direct stick |
| Right button | Zoom |

Settings cover difficulty (Recruit adds a lead indicator; Ace is harsher), mouse sensitivity,
Y inversion, volume, music, radio voices, graphics quality (auto-lowered on slow machines),
target markers (switch off for a purer simulation) and the P-51 control mode.

## Combat design

* **You are the decisive gun.** Fighters attacking your bomber fly their passes *through the field of fire of the gun position you are manning*: they form up out beyond your window or turret, run in on a collision course while firing, flash past close by, and loop back for another pass.
* **Readable targets.** Enemy fighters are drawn and hit larger than life. A health bar appears on any fighter you are hitting, and it takes about 20 hits to bring one down, with smoke, then black smoke, then fire as it weakens.
* **Your allies don't do your job.** The other crews' fire and the escorts mostly keep heads down rather than scoring kills.
* **How they go down:** wings and tails are shot away and the pieces tumble apart (the model is cut with clipping planes), or the fighter blows up or spins in burning, and pilots sometimes bail out.

## How it works

* **Rendering**: Three.js (WebGL 2) with a reversed-Z depth buffer.
  * Raymarched volumetric clouds with depth-aware upsampling, and per-mission time of day (from high summer sun to golden-hour winter light).
  * Condensation trails streaming from every bomber engine.
  * A second pass draws transparent effects (contrails, tracers, smoke, glass) over the clouds.
  * HDR post-processing: bloom with lens dirt, sun lens flare (occluded by aircraft and clouds), camera motion blur, near-field depth of field, filmic grading and trauma-based camera shake.
  * Procedural riveted-aluminium interior and parkerised gun textures. Bullet holes let in pinpoints of daylight and dusty sunbeams.
  * Explosions with fireball, shockwave, burning debris and lingering smoke.
* **Simulation**:
  * Fixed-wing flight model: power and drag, lift from angle of attack with stall, AoA and G limiter in mouse-aim mode, G blackout.
  * Ballistic rounds with gravity and inherited aircraft velocity, so you have to lead your target.
  * Per-zone damage with fires that spread into the wing, the pilot's engine fire extinguishers, bail-outs, flak and Wgr. 21 rocket salvos fired into the formation.
* **AI**:
  * Luftwaffe pilots run head-on, stern, beam and high-side attacks, each pass with its own aiming error. They drop their belly tanks, break away under the box, extend and come back. They turn to fight escorts that jump them.
  * Turrets on every bomber visibly track their crews' targets.
* **Audio**: fully procedural Web Audio.
  * Engines are synthesised from firing pulses and propeller blade-pass: four beating Wright Cyclones inside the bomber, BMW 801s on the Fw 190s, and the Merlin in the P-51.
  * HRTF positioning, Doppler fly-bys with an air rush, and convolution reverb: a metallic fuselage inside, open air outside.
  * Layered weapons and impacts, flak shrapnel rattling on the skin, and speed-of-sound delays.
  * Crew radio with interphone squelch and static, and quiet-time intercom chatter.
  * A dynamic D-minor score (strings, horn, snare, timpani) that rises with combat intensity, with victory and defeat stingers.

```
src/
  core/      Engine (renderer + frame pipeline), Input
  render/    Sky, volumetric Clouds, PostFX, Particles/tracers, noise, atmosphere
  world/     Aircraft, FlightModel, AI, Ballistics, Effects, World, B-17 station layout
  game/      Game (menus, director, scoring), Missions, Gunner/Pilot controllers, Viewmodels
  audio/     Sound (procedural)
  ui/        UI (DOM screens, HUD)
  dev/       autoplay harness for automated playtests (dev builds only)
tools/
  convert_models/   FlightGear AC3D -> glTF converter (Blender), configs, reports, uncompressed output/
  compress_models.mjs  output/*.glb -> public/models/*.glb (meshopt + quantization + WebP)
  model_compare.html   uncompressed vs compressed model, side by side (dev server)
  size_report.mjs   size breakdown of dist/ (npm run size)
  serve_throttled.mjs  static server with a simulated slow network (time-to-menu tests)
  test_sw.mjs       runs dist/sw.js against a mock service-worker runtime (install, offline, update)
  make_icons.mjs    PWA icons from tools/icons/icon.svg (npm run icons)
  frame2jpg.py      decode a canvas capture saved by the playtest tooling
```

### Build

```bash
npm run build      # type-check + production bundle in dist/
npm run preview
```

`dist/` is a static site and can be hosted anywhere (GitHub Pages, Netlify, S3); `npm run deploy`
publishes it to Cloudflare (`wrangler.jsonc`, cache rules in `public/_headers`).

### Loading and offline play

* **Progressive loading** (`src/core/Preload.ts`, `src/core/Assets.ts`): the loading screen waits only
  for the menu's essentials (B-17, P-51, Fw 190, the core gun/hit/UI sounds: about 2.6 MB with the
  script). Everything else streams in behind the menu, a few files at a time: menu music, the other
  one-shots, the other enemy models and the P-51 cockpit, the engine loops, the mission music.
  A mission starts once every model and one-shot is in (a short loading screen with byte progress
  if the player is quicker than the network). Voice clips load on first use.
* **Installable PWA**: `public/manifest.webmanifest`, icons in `public/icons/`, and a service worker
  generated by the build (`src/pwa/sw-template.js` → `dist/sw.js`, see `vite.config.ts`). It is
  registered after the first full load and caches the app shell (per build) and every model/audio
  file (by content hash, so a deploy downloads only what changed). Page: network first; bundles,
  models, audio: cache first. Second visits start from the cache and the game plays offline.
* `npm run size` prints the size breakdown of `dist/`;
  `node tools/serve_throttled.mjs dist --mbps 10 --rtt 60` serves it over a simulated connection
  (the page sets `performance.mark('menu')` when the menu appears).

### Automated playtests

Headless browser tabs don't fire `requestAnimationFrame`, so the dev build exposes hooks on
`window.sws`:
* `sws.step(n, dt)` advances the simulation.
* `sws.shot()` returns a JPEG data URL of the current frame.
* `sws.autoplay(sws.CAMPAIGN[i])` plays a whole mission with a scripted gunner or pilot and returns a log.
  It appears once all models and sounds are loaded (`sws.assetsReady()`), since missions wait for them.

## Credits and licence

* **Aircraft models:** from the FlightGear open-source hangar, converted with `tools/convert_models`. Authors are listed in [public/models/CREDITS.md](public/models/CREDITS.md):
  * B-17G: Emmanuel Baranger et al.
  * Fw 190 A-8: Detlef Faber.
  * P-51D: Jim Wilson, Hal V. Engel et al.
* **Licence:** the models are GPL v2, so the whole game is distributed under the
  **GNU General Public License v2 or later** (see `LICENSE`).
* **Visual reference:** Yarnhub. No footage or assets from the video are used.
* **Names:** all characters, crews and bomber names are fictional.
