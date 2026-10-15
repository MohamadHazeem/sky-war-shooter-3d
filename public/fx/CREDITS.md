# Effect flipbooks

Original procedural assets generated for Sky War Shooter 3D; no third-party imagery or simulation caches.
Distributed under the repository's GPL-2.0-or-later licence.

`fx_a.webp` / `fx_b.webp`: four close-effect Mantaflow simulations at 192³ (previously 128³), projected into
64 frames at 256 px. Diffuse smoke/vapour retain 128³ / 128 px frames. Both packed atlases are 4096×5120. Five directional optical-depth integrals encode sun lighting
and internal shadowing; a separate channel encodes flame emission. `manifest.json` records
simulation settings and the packed layout.

Rebuild: `bash tools/fx/bake_all.sh`. The script uses the machine-wide heavy-job limiter and
content cache for each simulation and the final pack. Requires existing Blender with numpy.
