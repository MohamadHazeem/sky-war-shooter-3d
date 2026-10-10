# FlightGear → glTF aircraft converter

Converts the open-source FlightGear aircraft models (AC3D `.ac` + PNG/SGI `.rgb`
textures + model XML) into the web-ready `.glb` files in `public/models/`.
The work is done by a headless Blender (5.x) script with its own AC3D parser,
so nothing in the aircraft packages (Nasal, shaders, effects) is run.

| File | Purpose |
|---|---|
| `convert_ac.py` | Blender script: AC3D/FG-XML → glb (+ preview renders + JSON report). See the docstring at the top for every option and config key. |
| `ac3d.py` | Pure-Python AC3D (`AC3Db`) parser that tolerates the quirks found in FG models. |
| `configs/*.json` | One config per output model: sub-models, exclusions, liveries, gear-up rotations, pivot nodes, markers, origin. |
| `build_all.sh` | Rebuilds every model (glb + preview + report). |
| `reports/*.json` | Generated: node pivots, marker positions, bounding boxes, triangle and primitive counts (all in the glTF frame). |

## Sources (not stored in this repo)

Clone them next to each other in one folder (folder names must stay as below):

```bash
mkdir -p ~/fg-src && cd ~/fg-src
git clone https://github.com/FGMEMBERS/B-17.git  && git -C B-17  checkout 949abb7615da96104a72c2b1a351a05d60a0bf3c
git clone https://github.com/FGMEMBERS/fw190.git && git -C fw190 checkout 49575361d5700466329e73d083867da5983451cd
git clone https://github.com/FGMEMBERS/p51d.git  && git -C p51d  checkout cb3bcd6ef41182f6b1bae91395f38d0dadd974e5
```

## Rebuild

```bash
FG_SRC=~/fg-src tools/convert_models/build_all.sh              # all models
FG_SRC=~/fg-src tools/convert_models/build_all.sh b17 fw190    # just some
```

Environment overrides: `BLENDER` (default `/Applications/Blender.app/Contents/MacOS/Blender`),
`PREVIEW_VIEWS` (default `34`, e.g. `34,top,bottom,side` plus the `preview_shots` names in the config),
`PREVIEW_DIR` (default `reference/model-previews`), `REPORT_DIR` (default `tools/convert_models/reports`).

Single model, by hand:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python tools/convert_models/convert_ac.py -- \
  ~/fg-src/B-17/Models/b17.xml public/models/b17.glb \
  --config tools/convert_models/configs/b17.json --fg-root ~/fg-src \
  --report tools/convert_models/reports/b17.json \
  --preview reference/model-previews/b17.png --preview-views 34
```

Add `--list` to print every object key (`<instance>/<object>`) the model contains. That is how the regexes in a config are written.

Output:

| Output | Input | Livery |
|---|---|---|
| `public/models/b17.glb` | `B-17/Models/b17.xml` | `Liveries/1024x1024/GD-L.png` (381st BG "L", olive drab, star-and-bar insignia) |
| `public/models/fw190.glb` | `fw190/Models/FW190-A8.xml` | `fw190-1.png` ("Green", RLM 74/75/76 grey-green, no swastika in any livery) |
| `public/models/p51d.glb` | `p51d/Models/p51d-jw-jsbsim.xml` | `Liveries/DD*.png` ("Delivery Day – March 1944", natural metal) |
| `public/models/p51d_cockpit.glb` | same XML, cockpit sub-models only | – |

To use a different livery, change `texture_files` / `texture_objects` in the config and rebuild.

## Conventions of every .glb (the game relies on these)

* Meters. **+Y up, nose toward +Z, aircraft LEFT wing on +X, right wing on −X.**
* The origin is at about 27 % of the wing-root chord on the fuselage centreline (≈ CG).
* Landing gear is retracted (B-17: the FG retraction rotations are applied, so the main wheels show under the nacelles as on the real aircraft). Fighters: struts and wheels are removed and the doors are closed.
* Dropped: blurred prop discs, LOD duplicates, shadow planes, light cones, hot-spots, effects, interior-only duplicate glass.
* Static meshes are merged per group, so each group is one mesh with one primitive per material: `airframe`, `glass` (alpha-blend, double-sided), `interior` / `crew` / `pilot`. Their node transforms are identity.
* Pivot nodes keep a transform, and their origin is the pivot:
  * `prop_N`: the origin is on the spin axis, and **local +Z is the spin axis (forward)** → spin with `prop.rotateZ(angle)`.
    B-17: `prop_1` = left outboard (+X) … `prop_4` = right outboard (−X).
  * B-17 turrets: `turret_top`, `turret_ball`, `turret_chin`. Yaw them about local Y. Each has a child `turret_*_guns` that pitches about local X.
    Flexible guns: `gun_waist_left/right` (rest pose points straight out of the window), `gun_tail` (twin, points aft), `gun_cheek_left/right`.
  * Fw 190: `prop_1`, `cooling_fan` (the engine fan; it spins faster than the prop).
* Markers are empty nodes (`muzzle_*`, `eye_*`, `window_*`). Muzzle markers are parented to their gun node, so they follow the aim. Find them with `gltf.scene.getObjectByName('muzzle_top_left')`.
* `p51d_cockpit.glb` contains **only** the detailed cockpit (instruments, consoles, levers, seat). It shares the frame of `p51d.glb`. For the first-person view, add both at the same transform and hide the `pilot` node of `p51d.glb`. The camera goes at `eye_pilot`.

Exact numbers are in `reports/<model>.json`.

## Adding another FG aircraft

1. Clone it into `$FG_SRC`, run the script with `--list` and read its model XML (`<model>` sub-models, `<animation>` gear/prop/turret definitions).
2. Copy a config. Config coordinates are FlightGear model coordinates (x aft, y right, z up, meters), which are the numbers in the FG XML files.
3. Add a line to `MODELS` in `build_all.sh`, build with extra preview views, and check the renders before you commit.
