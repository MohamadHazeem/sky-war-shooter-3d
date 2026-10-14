# Far terrain: real Europe below the formation (Phase 10 goal 04)

Offline pipeline for the ground seen from altitude (`src/render/FarTerrain.ts`). Sources and
licences: `public/terrain/CREDITS.md`.

```sh
# 1. raw public data into a scratch directory OUTSIDE the repo (~150 MB, resumable)
node tools/terrain/fetch_raw.mjs /tmp/sws-terrain-raw
# 2. build public/terrain/*.bin and src/world/TerrainIndex.ts (~2 min)
node tools/terrain/build_terrain.mjs /tmp/sws-terrain-raw
#    one tile only, with debug PNGs: TERRAIN_PNG=/tmp/png node tools/terrain/build_terrain.mjs <raw> --only 12_11
# 3. map preview of a built tile, the way the shader reads it
node tools/terrain/preview.mjs 9_9 /tmp/9_9.png
# ground rig captures from the dev build (sws.ground.setup/save) land in docs/phase10/shots/04/
node tools/terrain/save-shots.mjs 5314
```

## Grid and tiles (`src/world/TerrainGrid.ts`)

Fixed equirectangular grid (x east, y north of 4°W 47°N, east-west scale of 52°N), 64 km tiles.
`plan.mjs` lists the tiles every chart place needs: the 3×3 block around any mission track up to
26 km long (`placeView`: outbound missions end on the target, approached on the real final leg;
homeward legs cross the coast just past mid-mission). 102 tiles, ~16 MB in all; a mission loads 9.

Tile file `t<i>_<j>.bin`: gzip of `'SWT1'`, then three images, each `u16 size, u8 channels` and
the channel planes with every row delta coded (byte-wise). Row 0 is the south edge.

| Image | Size (texel) | R | G | B | A |
|---|---|---|---|---|---|
| lines | 512² (125 m) | coast signed distance, land +, ±2 km | river signed side distance ±600 m | land: river half-width / 2 (m) near a mapped river; water: shallowness | rail signed side distance ±600 m |
| cover | 256² (250 m) | towns (1940s extent) | woods share | meadow / pasture share | heath, dunes, bare share |
| relief | 128² (500 m) | slope east (±0.35) | slope north | elevation, √ scaled to 1500 m | lowland (polder / marsh) |

`overview.bin`: gzip of `'SWO1'`, u16 width, u16 height, RGBA bytes at 2 km over the whole tile
grid (land share, woods, towns, elevation): the coastline out to the horizon beyond the 3×3 block.

Side distances keep their sign per feature, so their bilinear zero crossing is the line itself at
any texel size; the shader drops the false crossings far from a line (where nearest features
flip side) by the field's screen-space gradient.

The land/water mask comes from WorldCover (water class; tidal flats = bare ground outside the
Natural Earth coastline), falling back to Natural Earth polygons, at 62.5 m, then an exact
distance transform. Natural Earth rivers are drawn only where WorldCover shows no open water
nearby (wide rivers already come from WorldCover at their true position).

`TerrainIndex.ts` (generated) lists the tiles, the overview's placement and, per place, the
mission focus: the target moved onto the nearest real river (≤ 2.5 km) or harbour shore
(≤ 4 km), with the water's direction, so the target city's docks, works and bridges
(`render/TargetGround.ts`) follow it.
