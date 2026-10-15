# Luftwaffe hero models (Phase 10 goals 05 / 05b)

Bf 109 G-6, Fw 190 A-8, Me 262 A-1a, Bf 110 G-2 and Ju 88 A-4. Since goal 05b the **shapes are the FlightGear
models** (GPL, `tools/convert_models/output/<kind>.glb`, already in the repository) - the from-scratch lofts of
goal 05 were out of proportion. Everything else is ours: parts and hinged controls, UV atlas, bakes, paint,
markings, weathering, ace liveries, props, crew, gear, LODs, KTX2. See `public/models/CREDITS.md`.

## Rebuild

```
sh tools/hero/luftwaffe/build.sh                 # all five: Blender + finish -> public/models/<kind>.glb (+ ace, ktx2)
sh tools/hero/luftwaffe/build.sh bf109 fw190     # some
BLENDER=/path/to/blender BASISU=/path/to/basisu sh tools/hero/luftwaffe/build.sh
```

About 25-30 s per type on an M5 Pro. Intermediates go to `tools/hero/luftwaffe/out/` (not committed).
Without a Basis encoder (`BASISU` or `basisu` on PATH) only the WebP textures are written. The validated encoder
is Basis Universal 2.50.0 (Homebrew bottle `basis_universal`, extracted locally); no npm dependency.

## Pipeline

| Step | File | What |
|---|---|---|
| Source shape | `fg.py` | Imports the converted FlightGear glb; welds its loose panels; **visibility pass** (BVH rays from both sides of every face: faces nobody can see are deleted, faces seen only from behind are flipped, open sheets get a reversed copy 2 mm off); **curved refinement** (edges over 9-20 cm split on the PN-triangle curve through the end normals, bulge capped at 12 mm; source vertices never move, so the silhouette cannot shrink). The Me 262 is scaled to its published span / length first. |
| Parts | `airframe.py`, `types/<kind>.py` | Plane cuts at the part joints and along each hinge line (`fg.Hinge`), then every face goes to a node of `docs/phase10/hero-parts.md` (`part_*`, `ctl_*`, nacelles, interior), a paint class (by source material / region) and a panel-line layout (`Surf`). Panel coordinates are measured on the FlightGear surface (`BodyMap`: station + angle round the sliced section centre; `LiftMap`: span + chord fraction between the sliced leading / trailing edges) and recomputed per texel in the painter. |
| Detail | `parts.py`, `types/<kind>.py` | Pilot and crew figures (lofted torso, leather helmet with ear cups, goggles on the brow, harness), propellers with ogive spinners, cooling fan, gun barrels at the source muzzles, gear for parked aircraft. |
| UV + bakes | `build.py` | Smart UV atlas over every opaque mesh; Cycles bakes of position / normal / class / surface coordinates / AO on **one joined proxy** (a multi-object bake spreads each object's margin over the others' islands). |
| Paint | `paint.py` | Camouflage, markings, panel lines, rivets, fabric ribs, weathering, AO, ace livery (unchanged from goal 05). |
| LODs | `build.py` | LOD0 = parts; LOD1 = merged airframe, 40 % capped at 10-13k triangles; LOD2 = merged, 2.6-4.2k. |
| Finish | `finish.mjs` | PBR set (base 2048, normal + ORM 1024) embedded as WebP, meshopt; `<kind>_ace.webp`; with basisu also `<kind>_{base,normal,orm}.ktx2` (UASTC, Zstandard, mipmaps). |

## QA

- `silhouette/` - the shape gate: `extract.mjs` pulls the outline masks out of public-domain US recognition
  three-views (`refs.json`: FM 30-30 1943, Journal of Recognition Jan 1945; page scans cached in `out/refs/`),
  `check.mjs [kind] [--set label=dir] [--gate]` projects GLBs (top / side / front), registers them at the
  captioned span by translation only and reports raw and boundary-tolerant IoU + overlay sheets.
  `tests/heroModels.test.ts` runs the same gate on the shipped files.
- `preview.py` - Blender renders of a fresh build (`--close`, `--pilot`, `--dbg node`, `--lod 1`).
- `turntable.html`, `hero_shots.mjs` (turntables + in-game rig shots, Playwright headless shell only),
  `hero_bench.mjs`.
- `HERO_DEBUG=1` dumps the paint masks; `HERO_UVCHECK=1` reports UV-island overlap between objects.

## Phase 11

`parts.finish_fittings` adds original-window boundary seals, hollow exhaust rims and the
Fw 190's two cylinder rows without replacing the FlightGear skin. Paint now includes
metric oil-canning, slotted service fasteners, separate fabric roughness and CC0 scan
variation (`../references/CREDITS.md`). Markings retain 2048 resolution with quality-95
WebP fallback. Glass receives a tinted clearcoat/IOR material; the existing prewarm
includes the intact and damaged variants.

`build.bake_relief` displaces the actual subdivided airframe from the metre-valued height
field and bakes tangent normals/AO at **1024**, 48 samples. The editable high-poly sources
are `out/<kind>-relief-source.blend`; curvature maps are build intermediates. All shipped
LODs share the atlas, with the previous 10–13k / 2.6–4.2k far-level caps and named parts.
Use `tools/heavy.sh sh tools/hero/luftwaffe/build.sh` and supply the existing Basis encoder.
