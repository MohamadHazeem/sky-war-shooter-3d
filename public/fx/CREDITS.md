# Effect flipbooks

Original procedural assets generated for Sky War Shooter 3D; no third-party imagery or simulation caches.
Distributed under the repository's GPL-2.0-or-later licence.

`fx_a.webp` / `fx_b.webp`: explosion and flak use 256 px frames from 192³ Mantaflow simulations.
The four supporting effects use 128 px frames (fire/fireball downsample their existing 192³ bakes;
smoke/vapour use 128³). All effects retain 64 frames. Both packed atlases are 4096×3072,
128 MiB total RGBA8 including mipmaps, down from 213.3 MiB. Five directional optical-depth
integrals encode sun lighting and internal shadowing; a separate channel encodes flame emission.
`manifest.json` records the simulation settings, source grid resolutions and packed frame sizes.

Rebuild: `bash tools/fx/bake_all.sh`. The script uses the machine-wide heavy-job limiter and
content cache for each simulation and the final pack. Requires existing Blender with numpy.
