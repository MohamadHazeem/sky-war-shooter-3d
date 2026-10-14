# Bomber stream ↔ hero models: the LOD / impostor contract

The thousand-bomber stream (`src/render/BomberStream.ts`, goal 08) draws every B-17 outside our own
combat box, the escort flights and the Luftwaffe gaggles. It takes its looks from models it is given;
it never needs code changes when better models arrive. This is what a model has to provide, and how
goal 02 (hero B-17) and goal 05 (Luftwaffe hero models) plug in.

## The hook

```ts
import { DEFAULT_STREAM_MODELS } from './render/BomberStream';
engine.bomberStream.setModelSource({
  ...DEFAULT_STREAM_MODELS,
  bomber: () => heroB17('LOD1'),   // baked into the impostor atlas
  near:   () => heroB17('LOD2'),   // drawn instanced for boxes within ~1.1 km of the camera
});
```

`setModelSource` (or `engine.bomberStream.rebake()` after a lazy-loaded texture set lands) throws
away the atlases and the near LOD and rebuilds them over the next frames (16 atlas tiles a frame;
the old stream stays hidden for those few frames, nothing stalls). Each function returns a fresh
`THREE.Object3D` (a clone is fine; geometry may be shared) or `null` while it is not loaded yet; the
stream asks again every frame until it gets one.

| Field | Used for | Today (`DEFAULT_STREAM_MODELS`) | Hero target |
|---|---|---|---|
| `bomber()` | impostor atlas (16 azimuths × 8 elevations, albedo + normal/class) | `models/b17.glb` | B-17 **LOD1** |
| `near()` | instanced near LOD, merged to one draw per material | `models/b17.glb` minus crew, interior, guns (~38k tris) | B-17 **LOD2** (≤ ~10k tris) |
| `escort()` | escort impostors (P-51; P-47 flights are tinted olive drab) | `models/p51d.glb` | P-51 / P-47 LOD1 |
| `gaggle()` | gaggle impostors | `models/fw190.glb` | Fw 190 / Bf 109 LOD1 |
| `propRadius` | prop blur-disc radius per model (m) | 1.77 / 1.7 / 1.65 | same |
| `isSkin(m)` | which materials are the airframe skin (paint / natural-metal swap) | name `GD-L` or tagged by SurfaceDetail | the hero skin material(s) |
| `hide` | mesh names left out of the bake | `^crew$` | crew, cockpit interior |
| `nearSkip` | mesh names left out of the near LOD | crew, interior, guns | anything < 1 px at 1 km |

## What a model must look like

- Frame: metres, **+Z nose, +Y up, +X left wing** (as every model in `Models.ts`). The origin can be
  anywhere: the atlas centre and radius come from the bounding box.
- Propellers: nodes named `prop_1`…`prop_N` whose children are the blades. The bake hides the
  blades and puts a translucent blur disc of `propRadius` in the node's XY plane (the stream's prop
  discs). The near LOD drops the blades.
- Materials: `MeshStandardMaterial` (or anything with `color` / `map` / `roughness` / `metalness`).
  Transparent materials are glass: in the atlas they get the glass class (glinting, smooth); in the
  near LOD they are replaced by an opaque dark glass so the instanced mesh stays in the opaque pass.
  Panel lines from `SurfaceDetail` are not carried into the near LOD (its per-mesh transforms are
  merged away); at ≥ 1 km they are sub-pixel anyway.
- Paint: bake the **olive drab** scheme. Natural-metal ships are made at run time by turning the
  olive-drab / neutral-grey skin to aluminium (markings — white, blue, yellow, black — are kept), in
  both the impostor and the near-LOD shaders. A hero model with its own NMF texture set can instead
  supply two sources and the stream can bake a second albedo atlas (not needed today).
- Budget: LOD1 any size (baked once at load: 128 tiles × 2 passes). LOD2 is drawn for at most a few
  boxes (≤ ~70 instances), so keep it ≤ ~10k triangles and few materials (one draw per material).
  KTX2 textures are fine: the bake samples whatever the materials sample.

## What the stream guarantees in return

- Positions/orientations of every stream aircraft come from `StreamLayout.ts` (closed-form, mirrored
  in GLSL). A model never needs animation; prop discs are static in the bake.
- Impostors are lit by the same PBR path as the real aircraft (they are `MeshStandardMaterial`s with
  a patched vertex/fragment stage: sun, sky hemisphere, rim, environment map), so a hero model's
  albedo and roughness carry straight through.
- Atlas resolution follows the quality tier (`STREAM_TIERS[q].tile`: 64 px Low, 96 Medium, 128
  High/Ultra); Low draws a smaller stream (≈150 bombers) and one contrail per bomber.
