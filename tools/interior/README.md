# B-17 interior 2.0 assets (Phase 10 goal 07)

Own-made, generated entirely by the Blender scripts in this folder (no downloaded models or
textures). One command rebuilds both shipped files:

```
sh tools/interior/build.sh      # Blender 4.2+ (BLENDER=... to override), then meshopt compression
```

| Script | Output | What |
|---|---|---|
| `build_crew.py` | `public/models/crew.glb` (~155 KB) | Skinned crewman: B-3 sheepskin jacket, A-3 trousers, A-6 boots, M4 flak helmet, B-8 goggles, A-14 mask and hose, B-4 Mae West, harness, fitted M1 flak vest (own mesh). 18-bone rig, LOD (28 %), clips `idle fire hit down help sit kneel`, and `fpArm` (the player's own forearm and glove). Vertex-coloured; the game recolours jacket / fleece / trousers / helmet per crewman. |
| `build_interior.py` | `public/models/b17_interior.glb` (~395 KB) | `kitWaist` (Z-section formers, hat stringers, window doublers, walkway, G-1 oxygen bottles, A-12 regulators, ammunition boxes and chutes, interphone boxes, flak curtains, flak suit, chest packs, extinguisher, first-aid kit, cables and pulleys, dome lamps), `kitRadio` (table, BC-348, BC-375, tuning units, seat, lamp, roof hatch, bulkhead with the door open), `kitBay` (bomb bay shell, catwalk and keel truss, racks, doors with light at the seams), `kitBombs` (twelve 500 lb bombs). Ambient occlusion baked into the vertex colours in Cycles against a stand-in of the procedural shell. |
| `blender_util.py` | | Shared mesh builder / primitives / export. |
| `compress.mjs` | | Painted colour layer to `COLOR_0`, mesh names = node names, prune, meshopt (as `tools/compress_models.mjs`). |
| `preview.py` | | Workbench renders of a glb (every clip at start / middle / end, or fixed interior views) for checking. |
| `inspect_colors.mjs` | | Lists the vertex colours of a glb. |

Frames: the kit is modelled in the game's bomber frame (metres, +X left, +Y up, +Z nose) around
the procedural shell of `src/game/Viewmodels.ts` (ellipse 1.08 x 1.12 at y 0.15, waist windows
at z -7.44) and turned to Blender's Z-up only for the export. Change those numbers together.
Raw Blender outputs go to `tools/interior/out/` (ignored).

The game side: `src/game/InteriorAssets.ts` (lazy load, materials, bounce light),
`InteriorKit.ts` (dressing the waist group), `CrewActor.ts` (skinned crewman + IK),
`PlayerHands.ts`, `InteriorFx.ts` (ray-marched shafts), `render/InteriorSkin.ts` (aluminium skin).
Low keeps the procedural interior.
