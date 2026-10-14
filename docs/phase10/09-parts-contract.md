# Named-parts contract for aircraft models (Phase 10 goal 09)

The physical destruction (`src/world/destruction/`) works with today's models and with the hero
models from goals 02 and 05. This page says what a model has to provide.

## Frame

As for every model in `public/models`: metres, +Z nose, +X **left** wing, +Y up, origin near the
centre of gravity. The game scales enemies up (`ENEMY_SCALE`). The physics uses the model's real size.

## Parts

Every fighter-sized aircraft has the same seven structural parts (`Parts.ts`, `PART_NAMES`):

| Part | What it is | Hangs from | Can come off |
|---|---|---|---|
| `core` | centre fuselage, cockpit, wing centre section | — | never (it is the hulk) |
| `nose` | engine and cowling (twins: glazed nose) | core | only in an explosion |
| `tail` | rear fuselage, tailplane, fin (Do 335: with the pusher prop) | core | yes, fatal |
| `wingL` / `wingR` | wing from the root to the outer-panel joint (twins: with the nacelle) | core | yes, fatal |
| `wingLtip` / `wingRtip` | outer wing panel | wingL / wingR | yes, **not** fatal |

## Two ways to supply the parts

**1. Automatic (today's models).** No extra nodes. The meshes under the `airframe` node are cut
triangle by triangle: each triangle goes to the part that its centroid lies in. The cut positions
are shares of the model's bounding box, per kind, in `Parts.ts` (`KINDS[kind].shares`:
`root`, `tip` as shares of the semi-span; `tail`, `nose` as shares of the length; `tailX` as the
half-span of the tailplane box). Add a row to `KINDS` for a new type (mass, mass share per part,
fuel per part).

**2. Named (hero models).** If the model has any node named `part_<name>` (for example
`part_wingLtip`), all meshes under that node belong to that part. Automatic cutting is then off
for the whole model. Model the break lines where the real aircraft failed: the wing root fillet,
the outer-panel joint and the rear fuselage joint ahead of the tailplane. Give each part a
closed edge (or let the engine draw the inside of the skin, below).

Optional markers (empties) for either way:

| Node | Meaning | Default |
|---|---|---|
| `joint_<part>` | Centre of the break line. Smoke, fire and the tearing sound come from here. | the cut plane at the part's centre of mass |
| `fuel_<part>` | Fuel tank in that part: the seat of fires and explosions | the part's centre of mass |

Other existing node names keep their meaning and travel with their part when it comes off:
`prop_N` (by position: nose, nacelle or tail), `pilot`, `glass`, `interior`, `eye_*` (core),
and any un-named child mesh or group (rocket tubes, drop tank, torn-skin patches), classified by position.

## What the engine does with them

- **Hit location.** Each round is booked to the part at the hit point (`SplitModel.classify`). Named
  models use the part bounding boxes. Part strength is a share of the matching hit zone's hp
  (`HP_SHARE`, `PART_ZONE`). Kill timing therefore stays with the game's zones (balance unchanged).
- **Geometry.** Each part is drawn with the source primitives' own vertex buffers and its own index
  (no vertex copy, no new shader program). A reversed-winding copy in a dark material shows the
  inside of the skin through the hole. Explosions shatter the part that held the burning tank into
  seeded clusters of its triangles (`SHARDS` per part).
- **Mass and aerodynamics.** Centre of mass, inertia, and projected areas (top, side, front) come
  from the part's triangles, with the kind's mass split by `massShare`. Wings lift at their rigging
  incidence. Detached pieces fly flat-plate physics (`Aero.ts`).
- **Materials.** Pieces use the dead aircraft's own material copies. Hero materials need nothing
  special. A hero model with transparent airframe parts should keep them out of `part_*` nodes:
  transparent meshes are skipped by the automatic cut.

## Co-op

Part state goes in the snapshot flags (`flags >> 8`, `FailureModel.bits()`: detached, burning and
exploded bits). The ending that played (`Destruction.deathCode`) goes in the kill event (`d`). The
guest plays the same break-up.
