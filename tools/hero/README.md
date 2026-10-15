# FlightGear-based B-17G hero pipeline

Goals 02b/02c replace the rejected procedural exterior with the retained FlightGear B-17G surfaces. The source silhouette, canopy, nose, nacelles, turrets, radial engines, crew, propellers and livery UVs are retained. A small dimensional normalization sets span to **31.62 m** and overall length (including tail guns) to **22.66 m**. The source is GPL, explicitly authorized by the 02b task.

## Rebuild

Requires Blender 5.x, the repository's npm dependencies, Python with NumPy/Pillow for the silhouette gate, and either `basisu` or `toktx`. No command here installs dependencies. Obtain the pinned source without executing any FlightGear code:

```sh
mkdir -p /tmp/hero-fg/B-17
curl -fL https://codeload.github.com/FGMEMBERS/B-17/tar.gz/949abb7615da96104a72c2b1a351a05d60a0bf3c -o /tmp/b17-source.tar.gz
tar -xzf /tmp/b17-source.tar.gz -C /tmp/hero-fg/B-17 --strip-components=1
FG_SRC=/tmp/hero-fg BASISU=/path/to/basisu HERO_PYTHON=/path/to/python tools/hero/build.sh
```

`BLENDER` overrides `/Applications/Blender.app/Contents/MacOS/Blender`. `TOKTX` is an alternative encoder. `HERO_WEBP=1` builds WebP only; the shipped release and tests require KTX2 plus fallback. The validated encoder is **Basis Universal 2.50.0**, Homebrew's arm64 bottle, extracted locally when the system Homebrew prefix was not writable. The npm package `basis_universal@1.16.4-1` ships a Linux binary and is not a macOS solution. No repo dependency or shared `node_modules` was changed.

## Source and licence

- Geometry/UVs: [FGMEMBERS/B-17](https://github.com/FGMEMBERS/B-17/tree/949abb7615da96104a72c2b1a351a05d60a0bf3c), Emmanuel Baranger, Detlef Faber, Fabien Barbier; GPL v2. Crew: Bertrand Augras, through that source.
- Livery: GD-L, Brett Harrison (2009/2011), from the same GPL package. Existing markings, localized exhaust staining and service-panel artwork are retained and reprocessed. This is a **derivative**, not original-only geometry or texture artwork.
- New relief, weathering, fittings, material variants, build/validation code: project work, GPL-2.0-or-later.
- Dimensional reference: USAAF **AN 01-20EG-2, 15 February 1945, Figure 1, printed page 2**, [public sample scan](https://app.aircorpslibrary.com/document/getsamplepage/tsteven3/6), [catalogue](https://app.aircorpslibrary.com/document/viewer/tsteven3). The underlying US military drawing is public-domain US government work. The scan remains at its source: only manually digitized outline coordinates and computed overlay images are committed; no scan pixels or archive watermark are redistributed.
- The source files remain available at the pinned upstream URL. `flightgear.json`, `tools/convert_models/convert_ac.py` and `build.py` are the complete derivative recipe. `output/` is ignored and contains the intermediate GLB, editable Blender source and bake maps.

## Stages and limitations

1. Convert the pinned AC3D/XML assets with `flightgear.json`, retaining individual source surfaces, source pivots and station markers. Do not use the old goal-02 ring-loft exterior.
2. Normalize dimensions; preserve UVs; split the source surfaces into all seven `part_*` structural owners with `joint_*`/`fuel_*` markers. Retain legacy aliases, props, turrets and guns. Move the starboard waist aperture, glazing, gun and eye markers forward 0.9 m. Add Cheyenne-style sight enclosure/framing, pitot tubes, cowl-flap plates, exhaust/wastegate/turbo housings, conforming de-icer strips and antenna wire. Separate original curved belly skins into bay doors and preserve source gear/flap surfaces under shared controls, including the source main-gear retraction direction.
3. Retain and reprocess the GD-L atlas with panel-varied olive drab, neutral grey, exposed seam chips, localized source soot and oil staining, leading-edge chips and scuffed wing-root walkways. Aircraft atlas regions receive recessed panel seams, domed rivet rows and slotted access fasteners. Subdivide/displace the actual skin into **1,364,112 relief vertices**, then Cycles selected-to-active bake tangent normals and AO. Derive curvature from the same height field. Generate an independent natural-metal base and ORM atlas, preserving insignia. This is a procedural material rework, not a hand-painted restoration asset; close rivet layout and fittings remain approximations.
4. Merge static siblings by material inside their owners; create three geometry LODs. Retain the economical exterior surfaces at all levels; remove cabin/crew at distance and simplify mechanical detail. Bounds-clamp QEM extrapolation instead of shrinkwrapping decimated vertices across opposite skin surfaces. Low deliberately retains more geometry than goal 02 because the aggressive reduction broke the silhouette. All pivots retain their local axes.
5. Meshopt geometry; embedded 512 px startup maps; optional 2048 px colour and 1024 px normal/ORM maps. Basis UASTC KTX2 includes mipmaps; **all five WebP fallback maps are always emitted**. Decoder files and Apache licence ship locally. The manifest budget includes both formats and the decoder, capped at 15 MiB. Unnamed geometry gets unique non-pivot names so GLTFLoader cannot create extra `prop_N` nodes.
6. Reimport/exported-asset turntables and automated three-view projection. The silhouette gate uses the manually traced contours in `silhouette-reference.json`, a fixed metre/pixel scale, the same manually registered view transform for legacy and hero, and 4 scan pixels of contour uncertainty. Raw IoU is reported alongside tolerance-adjusted overlap. The front view is less conclusive than top/side; it is not a dimensionally certified reconstruction. No model body section is independently fitted to make the overlay pass.

## 02c material and marking polish

`markings.mjs` rasterizes SVG text on a dedicated **1024 × 512 lossless alpha atlas** (requires a system Arial/sans-serif font). `build.py` clips small patches from the original skin triangles in UV space, preserving structural ownership and all three LODs. Squadron **GD** and serial **23772** are no longer part of the reduced skin atlas. `compress.mjs` excludes the stencil by both name and URI from startup resizing and exports alpha MASK. Personalized nose art uses its own **1024 × 512** canvas decal; its hull-conforming geometry is cached separately for legacy and hero.

The paint classifier excludes light markings and yellow prop tips; factory nose lettering is removed before the player's nose art is applied. Darker olive paint varies by panel, with baked seam/rivet relief, localized turbo soot and nacelle oil trails, worn walkways and sparse chips. These are art-directed approximations, not measured ANA colour samples or restored factory panel drawings. Silver retains its independent ORM and now carries seam/stain contrast. LOD triangle budgets are **71,818 / 34,252 / 24,535**; readable props and stencils account for the modest increase. Low remains below 26,000 triangles per complete model.

## Runtime

`HeroB17.ts` keeps shared-pivot LODs at 0 / 180 / 650 m, 10% hysteresis; Low forces level 2. The distant stream uses merged level-2 geometry. Named parts follow goal 09's contract read from `main`; no stream-LOD contract was present there during this task. A legacy model without hero LODs returns `null` to retain the existing distant-stream stand-in.

`HeroTextures.ts` upgrades existing texture slots after the menu, including paint/damage clones. Failed KTX2 download **or transcoding** loads WebP; failure of both keeps embedded startup maps. The natural-metal paint selects independent base/ORM textures. Low keeps a 512 px diffuse-only atlas (including neutral undersides and markings) and recolours it locally for silver/desert without fetching optional detail. `World.prewarm` continues to expose all material variants; no new per-frame allocations or player-visible UI strings are added. Hero props retain their three yellow-tipped blades from idle to cruise, with a faint disc blended in above idle; engine loss hides the disc. Other aircraft retain their existing prop behavior.

## QA

Start the worktree server with `npx vite --port 5302 --strictPort`, then:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/installed/playwright/index.mjs node tools/hero/browser-qa.mjs
```

This uses an existing Playwright/Chrome installation, explicitly drives frames, and writes small JPEGs and JSON to `docs/phase10/shots/02c/`. It compares the retained legacy GLB and hero under matching gallery cameras, captures Low, silver and mechanics, tests corrupt/failed KTX2 requests and fresh Low startup, and checks shader stability after LOD transitions. It creates legacy-left/hero-right sheets for close, beauty, waist, wide and near formation, silver, Low and Low silver, plus idle and mechanical evidence. Render time is fixed and temporal passes are settled; mission wall-clock timing can still shift clouds/background aircraft slightly. The established gallery/VQA rig is used because goal 00's rig is absent on this branch.

`render.py` supports `HERO_RENDER_LOD=2`, `HERO_RENDER_PREFIX=low-turntable`, and `HERO_RENDER_MODEL=tools/convert_models/output/b17.glb` for matching studio comparisons. `npm run check` validates the shipped artifact as well as runtime code.

## Phase 11 detail pass

Run every Blender/compression/capture job through `tools/heavy.sh`. The existing accurate
silhouette and shared mechanical owners are preserved. `detail.py` supplies metric sheet
relief and CC0 scan residuals (licence and source hashes in `references/CREDITS.md`).
The B-17 adds service covers, shallow dents, oil-canning, 45 mm rivet pitch on calibrated
atlas charts, fabric rib tapes, satin paint, and dark steel radial fins/pushrods.
These are plausible material details, not a factory rivet-plan reconstruction.
Normals/AO now bake at the shipped 1024 resolution with 48 samples; colour remains 2048.
Curvature controls roughness and is retained as a build intermediate. Basis normal mipmaps
use normal-map mode and lower RDO loss. Glass has restrained tint and a clearcoat layer.

Phase 11 QA (port **5321**, bundled headless shell, no desktop browser):

```sh
node tools/visual_rig.mjs --url http://127.0.0.1:5321 --out docs/phase11/shots/01/after --shots b17-beauty,waist-fw190,tail-bf109
node tools/hero/detail-qa.mjs after
```

Set `PLAYWRIGHT_EXECUTABLE` only to an existing bundled **chrome-headless-shell** if the
installed Playwright package expects another revision. `detail-qa.mjs` uses the production
rig scene for six 15–17 m model-space detail views; `DETAIL_BASELINE=/path/to/models`
serves preserved baseline assets, `DETAIL_QUALITY=low` exercises Low, and
`DETAIL_FALLBACK=1` aborts KTX2 to exercise fallback. All pages and contexts close in `finally`.
`HERO_SILHOUETTE_OUT=docs/phase11/shots/01` preserves the historical goal-02c gate.

### Review revision: pose-locked evidence

`detail-qa.mjs` now captures the three production rig fixtures as well as close views,
30 m B-17/Fw 190 views, and a lit dusk B-17. It locks every bomber pose, animated
model pivots, gunner aim and target pose before deriving the camera. Do not replay
a world-space camera onto a separately simulated bomber: model construction consumes
random numbers, so the eye can otherwise land inside the cabin wall.

```sh
DETAIL_BASELINE=/path/to/live/models tools/heavy.sh node tools/hero/detail-qa.mjs before
tools/heavy.sh node tools/hero/detail-qa.mjs after
node tools/hero/detail-compare.mjs
```

`before/detail.json` and `after/detail.json` are the authoritative capture records;
the obsolete camera-only fixture manifests/contact sheets were removed. The comparison
gate checks completion, presets, seed, weather, range, camera, aircraft and articulated
part poses. Close daylight pairs use matched frontal light; dusk uses the production
dusk weather with the low sun facing the visible aircraft surfaces. No extra light or
exposure override is added.
