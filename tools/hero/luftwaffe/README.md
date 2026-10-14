# Luftwaffe hero models (Phase 10 goal 05)

Bf 109 G-6, Fw 190 A-8, Me 262 A-1a, Bf 110 G-2 and Ju 88 A-4, built from scratch in Blender
(headless, Python) and finished with glTF Transform. Own work: nothing third-party goes in
(see `public/models/CREDITS.md`).

## Rebuild

```
sh tools/hero/luftwaffe/build.sh                 # all five: Blender bake + finish -> public/models/<kind>.glb
sh tools/hero/luftwaffe/build.sh bf109 fw190     # some
BLENDER=/path/to/blender sh tools/hero/luftwaffe/build.sh
```

About 70-90 s per type on an M5 Pro (Cycles on Metal). Intermediates go to `tools/hero/out/` (not committed).

## Pipeline

| Step | File | What |
|---|---|---|
| Shape | `types/<kind>.py`, `geom.py`, `parts.py` | Fuselage, nacelles and canopies are lofted through cross-section stations (super-ellipse halves, monotone-cubic between stations). Wings, tailplanes and fins are NACA 4-digit sections swept along a planform (`chord(e)`, `le(e)`, rounded tips), split into the named structural parts with the control surfaces cut out on their hinge lines (7 mm gap). Cockpit cut-out + tub, instrument panel, seat, head armour, gunsight, pilot / crew figures, canopy frames, propellers with ogive spinners, exhaust stubs, radiators, guns, undercarriage. Frame and anchor points match the FlightGear models they replace. |
| Assembly | `model.py` | Node tree in the game frame with paint classes and per-surface panel-line layouts (`Surf`): see `docs/phase10/hero-parts.md`. |
| UV + bakes | `build.py` | One shared atlas over every opaque mesh (Smart UV + pack, low-priority islands - pilot, interior, gear, blades - at 45 % density). Cycles bakes position, normal, paint class / node and surface-coordinate maps (emission) and ambient occlusion (48 samples, gear and blades hidden). |
| Paint | `paint.py` | numpy, per texel from the baked maps: RLM camouflage (splinter regions in plan view, soft blotches, side mottles, sprayed demarcations), Balkenkreuz (no Hakenkreuz), unit bands, yellow under-cowl, numbers / codes (stencil font), fuel triangle, spinner spirals; panel lines, access hatches, rivet rows and fabric rib tapes (height field -> tangent-space normal map in the atlas's own UV frame); exhaust staining, gun soot, oil streaks, streaks aft of seams, sun fading, chipping to aluminium and primer at walkways / leading edges / seams / blade tips; baked AO in the ORM map and lightly in the colour. A second base colour carries the ace livery (kill bars on the rudder, emblem, Kommandeur chevrons, white spinner, band). |
| LODs | `build.py` | LOD0 as built (26-44k triangles, separate parts); LOD1 = the whole airframe merged and decimated to 40 %; LOD2 = merged and decimated to 2.6-4.2k triangles. All share the atlas. |
| Finish | `finish.mjs` | Attaches the PBR set (base 2048, normal + ORM 1024), glass material, keeps pivots off quantized nodes, WebP textures, meshopt geometry. Writes `public/models/<kind>.glb` and `<kind>_ace.webp`. |

KTX2/Basis: not used. No Basis encoder (toktx / basisu) is installed on this machine and the task rules forbid
network installs; `finish.mjs` is where a `toktx` step would go (gltf-transform `toktx()`).

## QA

- `turntable.html` (served by Vite): `/tools/hero/luftwaffe/turntable.html?kind=bf109&lod=0&close=1&ace=1`, or one
  view with `&cam=x,y,z&at=x,y,z&fov=30`.
- `hero_shots.mjs`: turntables + in-game captures (waist 150 m, tail view of a diving 109, head-on wedge of
  190s) + bench into `docs/phase10/shots/05/`.
- `HERO_DEBUG=1` dumps the paint masks (`dbg_*.png`, `dbg_node` = one colour per node; `HERO_BASE=dbg_node`
  in finish.mjs puts it on the model). `HERO_UVCHECK=1` reports UV-island overlap between objects.
- `tests/heroModels.test.ts` checks the node contract, LOD levels, materials and the size budget of the
  shipped files.
