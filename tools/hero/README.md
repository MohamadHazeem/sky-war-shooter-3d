# Original B-17G hero pipeline

Rebuild from this repository, without an external mesh, texture library or login:

```sh
TOKTX=/path/to/toktx tools/hero/build.sh
```

Requires the existing npm dependencies, Blender (default `/Applications/Blender.app/Contents/MacOS/Blender`), and the official Khronos KTX tools. `BLENDER` overrides the executable. **This command never installs anything.** Where installing an encoder is not authorized, `HERO_WEBP=1 tools/hero/build.sh` explicitly builds the browser-compatible WebP fallback. `npm run check` validates the shipped artifact, not only the source scripts.

## Source and licence

The exterior mesh and all texture pixels are original procedural work in `build.py`, distributed with this repository under GPL-2.0-or-later. No FlightGear geometry, livery, crew model or reference photograph is incorporated. This satisfies Phase 10's own-made asset rule; the legacy FlightGear B-17 remains in `public/models/b17.glb` solely as a historical/reference asset and is no longer the runtime B-17.

Shape reference links (links only, no third-party images committed):

- [National Park Service B-17G 44-83690](https://www.nps.gov/articles/b17g-flying-fortress-no-4483690.htm): overall dimensions, radial engines, raised cockpit, chin turret, cheek guns, staggered waist stations and swept dorsal fin. Its photograph credits belong to the Grissom Air Museum/NASA, not this project.
- [NASM B-17G archive catalogue](https://airandspace.si.edu/collection-archive-item/boeing-b-17g-flying-fortress/sova-nasm-xxxx-0356-ref620): reference provenance for the aircraft type.
- [USAF B-17 overview](https://www.airmanmagazine.af.mil/Features/Display/Article/2599058/airframe-the-b-17-flying-fortress/): 31.62 m wingspan.

The 31.62 m span is exact. Sections are an original visual reconstruction, **not a dimensionally certified restoration model or a scan**. The CG, engine spacing and gun stations follow this game's established metre-scale contract. The starboard waist moves 0.9 m forward, including `B17Layout.ts`, to represent a late G. `231702` and the group triangle are fictional markings. Existing ship names/nose art still come from the game's translated customisation system.

## Build stages

1. Generate the base ring-loft fuselage with open cockpit, cheek and staggered waist apertures; tapered airfoil wings with dihedral; fin, stabilisers, radial nacelles, nine-cylinder engine faces and glazing. Add a Norden sight representation, chin/top/ball turrets, cheek/waist/tail guns and the Cheyenne-style aft fairing.
2. Generate a 262,144-vertex metal relief coupon: recessed seams and raised rivets. Bake its tangent-space normal and AO with Cycles selected-to-active projection. Curvature comes from the same sampled height surface. A fixed seed supplies faded olive paint, edge chipping and directional oil staining; exhaust soot and walkways are additional authored surfaces. AO/roughness/metalness share an ORM texture. Neutral-grey undersides have a separate material. Glass exports `KHR_materials_transmission` with IOR 1.46.
3. Assign explicit continuous UVs for lofts/airfoils and dominant-axis UVs elsewhere. Weld duplicate seam/pole vertices, remove degenerate edges, merge static meshes per material **within** damage/motion pivots, and decimate to three levels. Markings use original vector geometry; they need no copyrighted texture atlas. Invasion stripes are a separate selectable decal group.
4. Convert every mesh and local transform into Blender's basis before glTF export. This preserves identity local axes after export: props spin around local +Z, turrets yaw about +Y, guns pitch about +X. Quantization is confined to unnamed mesh holders; it never alters a mechanical pivot.
5. Meshopt-compress geometry. Embed 128 px startup textures; export 1024 px optional textures as Basis UASTC KTX2 with mipmaps (or explicit WebP fallback). KTX decoder files come from the installed Three.js package. The budget gate includes the runtime mesh and detail maps and rejects >15 MiB.
6. Re-import the exported GLB in `render.py` and render front/rear/side/nose turntable views. `output/` contains the editable Blender source, high-poly coupon, AO/curvature/normal maps, GLB and triangle report; these reproducible intermediates are ignored by git.

## Runtime contract

- `Models.ts`: one B-17 path for player, formation, menu, gallery and hangar. Preserve authored PBR values; do not apply the legacy procedural surface overlay.
- `HeroB17.ts`: shared-pivot LOD trees (0 / 180 / 650 metres, 10% hysteresis). Low forces LOD2, including clones and studio scenes. The existing distant stream uses a single instanced draw of the merged LOD2 silhouette.
- `HeroTextures.ts`: low-priority optional texture upgrade after menu startup. Low defers the request until a higher preset is selected. Failed detail downloads retain startup maps. All material slots already exist, so the upgrade does not change shader defines. Paint and player-damage clones participate in upgrades.
- Props/blur and turret/gun aiming keep the existing controllers. `HeroB17Controls` drives gear, flaps and bomb-bay doors. `Airbase.makeGear` delegates to the authored gear when attached to a hero; `TargetArea` opens doors during the existing bomb-run window.
- `World.prewarm` exposes every LOD material variant; `PlayerBomberDamage` excludes hero glazing, weapons and decals from skin-void materials. Wreck clipping continues to operate on the cloned hierarchy.

## Browser QA

Run `npx vite --port 5302 --strictPort`, then open `/tools/hero/qa.html`. The page uses the existing seeded `sws.gallery`/`sws.vqa` hooks and explicitly steps hidden frames. Its capture receiver is:

```sh
node tools/hero/save.mjs
```

The receiver only writes JPEG/JSON names under `docs/phase10/shots/02/`. Buttons capture matching formation, waist and exterior cameras, Low, and mechanical/LOD diagnostics. The Phase 10 goal-00 capture rig is not on this branch, so this uses the established repository rig. Do not overwrite the committed baseline unless intentionally changing the comparison.
