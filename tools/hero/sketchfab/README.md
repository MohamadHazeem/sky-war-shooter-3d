# Phase 11 fighters and original exterior crew

The Bf 109 and Fw 190 use the supplied CC BY 4.0 Sketchfab shapes. Attribution and source links are in `assets-src/sketchfab/CREDITS.md` and `public/models/CREDITS.md`.

`../luftwaffe/sketchfab.py` imports those GLBs, converts to metres (+Z nose, +X left, +Y up), removes parked gear and costly bolt/spring islands, replaces the source propellers, and normalizes the Fw 190's parked pitch. Span is 9.924 / 10.5 m. The Bf 109's prop axis is already level; it needs an axis rotation, not a pitch correction. `anchors.json` retains the gameplay prop/muzzle anchors independently of the archived FlightGear files.

The two type specifications supply the actual hinge locations, seven structural owners, joint/fuel markers, original cockpit/pilot/props, G-6 cowl blisters, and representative 74/75/76 Defence-of-the-Reich paint. The Bf 109 retains the F-2 source's canopy and small airframe details; this is a G-6 adaptation, not a certified G-6 reconstruction. The shared pipeline cuts controls, unwraps, bakes AO and position maps, paints, makes LOD0/1/2, and emits meshopt GLB/WebP and UASTC KTX2. The Fw 190's hood edge seals follow its source glazing boundaries. Soft sprayed mottling and reduced chips apply only to these two types.

Run from the repository root using installed tools (no dependency downloads):

```sh
HERO_CPU=1 tools/heavy.sh /Applications/Blender.app/Contents/MacOS/Blender -b -t 6 --python-exit-code 1 -P tools/hero/luftwaffe/build.py -- bf109 fw190 --size 2048 --ao-samples 48
BASISU=/path/to/basisu tools/heavy.sh node tools/hero/luftwaffe/finish.mjs bf109 fw190
```

`HERO_CPU=1` avoids a Blender 5.2 Metal compiler crash seen on this shared Mac. Both render paths produce the same atlas dimensions. `BASISU` must identify an existing encoder; the shipped texture tests require KTX2.

## Original crew

`public/models/crew.glb` is the project's own crew (the task's `public/interior/crew.glb` path does not exist here). `seated.py` freezes its sit clip, brings the head forward, removes the interior flak vest, preserves vertex colours, and reduces it to about 3,500 triangles. The result's origin is at the eyes. `replace-crew.mjs` copies its decoded geometry with the source **and destination** transforms, places it at the eye markers, and prunes the inherited figures/materials/textures. It is repeatable and can upgrade existing replacements. Archived conversion outputs remain unquantized so their mechanical pivots stay usable as source data.

```sh
tools/heavy.sh node tools/hero/sketchfab/build-seated.mjs
node tools/hero/sketchfab/replace-crew.mjs public/models/b17.glb public/models/hero/b17.glb public/models/p51d.glb public/models/do335.glb public/models/he111.glb tools/convert_models/output/*.glb
```

Both `tools/compress_models.mjs` and `tools/hero/compress.mjs` apply the replacement when rebuilding from upstream. The Luftwaffe hero figures were already original project geometry. The B-17 cockpit crew visibility hook uses the renamed original-crew LOD group.

## Verification

Use port **5330**, an existing Playwright install, and its bundled **headless shell**. `PLAYWRIGHT_EXECUTABLE` can identify the installed shell when its revision differs from Playwright's default; never select desktop Chrome.

```sh
npx vite --port 5330 --strictPort
tools/heavy.sh node tools/hero/sketchfab/shots.mjs after
tools/heavy.sh node tools/visual_rig.mjs --url http://127.0.0.1:5330 --out docs/phase11/shots/01b/after --shots waist-fw190,tail-bf109 --camera-from docs/phase11/shots/01b/live/manifest.json
tools/heavy.sh node tools/hero/sketchfab/runtime.mjs
tools/heavy.sh node tools/hero/sketchfab/crew-shots.mjs
node tools/hero/luftwaffe/silhouette/check.mjs bf109 fw190 --set hero=public/models --out docs/phase11/shots/01b/silhouette --gate
node tools/hero/sketchfab/b17-project.mjs
HERO_SILHOUETTE_OUT=docs/phase11/shots/01b/b17-silhouette /path/to/existing/python-with-numpy-pillow tools/hero/silhouette.py
npx tsc --noEmit
npx vitest run tests/heroModels.test.ts tests/heroB17.test.ts tests/sketchfabFighters.test.ts tests/destruction.test.ts tests/i18n.test.ts
```

`live-baseline.mjs` compares the deployed fighter GLBs and all four texture files against `BASELINE_DIR` (default `/tmp/01b-baseline`, populated from the starting commit). The committed receipt proves those assets matched before replacement. Use matching `before`/`after` captures and `compare.mjs` for review. The fixed visual rig covers waist/tail; `shots.mjs` adds the head-on wedge and turntables. All evidence is in `docs/phase11/shots/01b/`.
