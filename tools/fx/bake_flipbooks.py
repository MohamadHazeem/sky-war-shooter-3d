"""Offline volumetric flipbooks for Effects 2.0 (Phase 10 goal 06).

Blender (Mantaflow) simulates each effect as a real smoke/fire gas; this script then bakes the
simulated density and flame grids into relightable flipbook atlases with a small numpy volume
renderer (single + approximate multiple scattering, axis-aligned so it is exact and fast):

  <name>_a.webp  RGBA: R = light from +X (right), G = light from -X (left), B = light from +Y (top),
                       A = opacity (1 - camera transmittance)
  <name>_b.webp  RGBA: R = light from -Y (bottom), G = light from the front (the viewer's side),
                       B = flame emission (sqrt encoded), A = max(opacity, emission)

This directional lighting basis (five baked directions; light from behind, the silver lining, is
derived in game from the opacity) lets the game relight every frame with the live sun direction
and colour (and the sky from above), which a single baked normal cannot do for a translucent
volume. Light values are normalised by opacity (not premultiplied), so thin wisps keep precision.
WebP drops the colour of fully transparent pixels, so every alpha channel covers the colour data
it carries (B's alpha includes the flames, which can burn where there is almost no smoke).
Each atlas is 8 x 8 frames of FRAME px, read left to right, top to bottom.

Run headless (one effect per process, they run in parallel fine):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/fx/bake_flipbooks.py -- explosion
  ... -- all          (every effect, one after another)
Outputs go to public/fx/ (committed) and a lit preview contact sheet to tools/fx/out/ (not committed).
"""
import bpy
import numpy as np
import os
import sys
import time
import json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'fx')        # the packed atlases the game loads (committed)
PREVIEW = os.path.join(HERE, 'out')             # logs, previews, per-effect atlases (not committed)
ATLAS = os.path.join(PREVIEW, 'atlas')
CACHE = os.environ.get('FX_CACHE', os.path.join(PREVIEW, 'cache'))

GRID = 8            # atlas is GRID x GRID frames
FRAME = 128         # px per frame (= simulation resolution)

# Per effect: Mantaflow setup and bake settings. Velocities in m/s in a 2 m domain.
#   emit: (first, last) frame the emitter is live; grow: emitter radius at first/last emit frame
#   sigma: optical density for the bake (per domain width at density 1)
#   frames: (first, last) simulation frames spread over the 64 atlas frames
EFFECTS = {
    # Aircraft explosion: violent, lumpy fuel + ammunition blast that rolls into black smoke
    'explosion': dict(seed=3, frames=(2, 74), emit=(1, 6), grow=(0.06, 0.4), lumpy=0.7, loc=(0, 0, -0.05), gravity=3.0,
                      flow='BOTH', fuel=1.6, temp=2.0, dens=1.5, vel=1.6, burning_rate=0.75, flame_smoke=2.0,
                      flame_vorticity=2.0, vorticity=1.4, alpha=0.0, beta=0.35, dissolve=0, sigma=26),
    # Rolling fuel fireball: slower, rounder, climbs while it burns
    'fireball': dict(seed=11, frames=(2, 90), emit=(1, 12), grow=(0.1, 0.34), lumpy=0.25, loc=(0, 0, -0.3), gravity=4.0,
                     flow='BOTH', fuel=2.2, temp=2.2, dens=0.9, vel=0.8, burning_rate=0.5, flame_smoke=1.5,
                     flame_vorticity=1.6, vorticity=0.9, alpha=0.0, beta=0.8, dissolve=0, sigma=22),
    # 88 mm flak burst: a split-second orange core inside an instantly black, dense, lumpy puff
    'flak': dict(seed=27, frames=(1, 64), emit=(1, 3), grow=(0.12, 0.34), lumpy=0.55, loc=(0, 0, 0), gravity=2.0,
                 flow='BOTH', fuel=0.7, temp=1.5, dens=2.5, vel=1.2, burning_rate=1.6, flame_smoke=3.0,
                 flame_vorticity=0.6, vorticity=0.6, alpha=0.0, beta=0.15, dissolve=0, sigma=34),
    # Engine fire: a lick of burning fuel that turns to smoke (trail puffs play it from the start)
    'fire': dict(seed=41, frames=(2, 32), emit=(1, 9), grow=(0.12, 0.2), lumpy=0.3, loc=(0, 0, -0.5), gravity=4.0,
                 flow='BOTH', fuel=2.2, temp=2.0, dens=0.35, vel=0.6, burning_rate=0.7, flame_smoke=0.6,
                 flame_vorticity=1.4, vorticity=0.6, alpha=0.0, beta=1.2, dissolve=0, sigma=16),
    # Billowing smoke puff (oily black / grey trails, debris dust: the colour is set in game)
    'smoke': dict(seed=53, frames=(2, 80), emit=(1, 5), grow=(0.12, 0.3), lumpy=0.4, loc=(0, 0, -0.1), gravity=2.0,
                  flow='SMOKE', fuel=0.0, temp=0.5, dens=1.4, vel=0.9, burning_rate=0.0, flame_smoke=0.0,
                  flame_vorticity=0.0, vorticity=1.1, alpha=0.1, beta=0.2, dissolve=0, sigma=22),
    # Thin dissolving wisp (white glycol, dust, vapour)
    'wisp': dict(seed=67, frames=(2, 80), emit=(1, 4), grow=(0.1, 0.24), lumpy=0.5, loc=(0, 0, -0.1), gravity=2.0,
                 flow='SMOKE', fuel=0.0, temp=0.4, dens=0.9, vel=0.7, burning_rate=0.0, flame_smoke=0.0,
                 flame_vorticity=0.0, vorticity=1.0, alpha=0.1, beta=0.2, dissolve=55, sigma=14),
}


def setup_sim(name, p):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.frame_start = 1
    sc.frame_end = p['frames'][1] + 1
    sc.render.fps = 24
    # gentler buoyancy than Earth's in a 2 m box: the puff stays in frame, as a mid-air burst does
    sc.use_gravity = True
    sc.gravity = (0, 0, -p['gravity'])
    # domain: 2 m cube, open on every side
    bpy.ops.mesh.primitive_cube_add(size=2)
    dom = bpy.context.object
    md = dom.modifiers.new('Fluid', 'FLUID')
    md.fluid_type = 'DOMAIN'
    d = md.domain_settings
    d.domain_type = 'GAS'
    d.resolution_max = FRAME
    d.cache_type = 'REPLAY'
    d.cache_directory = os.path.join(CACHE, name)
    for side in ('front', 'back', 'left', 'right', 'top', 'bottom'):
        setattr(d, 'use_collision_border_' + side, False)
    d.vorticity = p['vorticity']
    d.alpha = p['alpha']
    d.beta = p['beta']
    if p['flow'] == 'BOTH':
        d.burning_rate = p['burning_rate']
        d.flame_smoke = p['flame_smoke']
        d.flame_vorticity = p['flame_vorticity']
    if p['dissolve']:
        d.use_dissolve_smoke = True
        d.dissolve_speed = p['dissolve']
        d.use_dissolve_smoke_log = True
    # lumpy emitter: displaced icosphere, scaled up while it emits, then removed from the domain
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=1.0, location=p['loc'])
    em = bpy.context.object
    tex = bpy.data.textures.new('lumps', 'CLOUDS')
    tex.noise_scale = 0.55
    tex.noise_depth = 2
    disp = em.modifiers.new('Disp', 'DISPLACE')
    disp.texture = tex
    disp.strength = p['lumpy']
    disp.mid_level = 0.5
    # a different lump pattern per effect
    em.rotation_euler = (p['seed'] * 0.37, p['seed'] * 0.71, p['seed'] * 1.13)
    mf = em.modifiers.new('Fluid', 'FLUID')
    mf.fluid_type = 'FLOW'
    f = mf.flow_settings
    f.flow_type = p['flow']
    f.flow_behavior = 'INFLOW'
    f.flow_source = 'MESH'
    f.volume_density = 1.0
    f.surface_distance = 1.2
    f.density = p['dens']
    f.temperature = p['temp']
    if p['flow'] == 'BOTH':
        f.fuel_amount = p['fuel']
    f.use_initial_velocity = True
    f.velocity_normal = p['vel']
    ntex = bpy.data.textures.new('emitnoise', 'CLOUDS')
    ntex.noise_scale = 0.3
    f.use_texture = True
    f.noise_texture = ntex
    f.texture_map_type = 'AUTO'
    f.texture_size = 1.0
    e0, e1 = p['emit']
    r0, r1 = p['grow']
    for fr in range(e0, e1 + 1):
        k = (fr - e0) / max(1, e1 - e0)
        k = 1 - (1 - k) ** 2
        r = r0 + (r1 - r0) * k
        em.scale = (r, r, r)
        em.keyframe_insert('scale', frame=fr)
        f.texture_offset = fr * 0.13
        f.keyframe_insert('texture_offset', frame=fr)
    em.scale = (0.0001, 0.0001, 0.0001)
    em.keyframe_insert('scale', frame=e1 + 1)
    em.location = (0, 0, 40)
    em.keyframe_insert('location', frame=e1 + 1)
    em.location = p['loc']
    em.keyframe_insert('location', frame=e1)
    for fc in (em.animation_data.action.fcurves if hasattr(em.animation_data.action, 'fcurves') else []):
        for kp in fc.keyframe_points:
            kp.interpolation = 'CONSTANT'
    return sc, dom


def border_mask(n):
    # smooth falloff over the outer 10 % of the domain so nothing is cut off at the frame edge
    x = (np.arange(n) + 0.5) / n
    e = np.minimum(x, 1 - x) / 0.1
    m = np.clip(e, 0, 1)
    m = m * m * (3 - 2 * m)
    return m[:, None, None] * m[None, :, None] * m[None, None, :]


def ms(tau):
    # approximate multiple scattering (sum of octaves with softer extinction), max 1
    return (np.exp(-tau) + 0.5 * np.exp(-tau * 0.35) + 0.25 * np.exp(-tau * 0.12)) / 1.75


def excl_cumsum(a, axis, reverse):
    if reverse:
        a = np.flip(a, axis)
    c = np.cumsum(a, axis=axis) - a * 0.5
    return np.flip(c, axis) if reverse else c


def bake_frame(rho, flame, sigma):
    """rho, flame: [z, y, x] grids (z up, camera looks along +y). Returns 8 float images [z, x]."""
    n = rho.shape[0]
    dz = 1.0 / n
    tau = rho * (sigma * dz)
    t_front = excl_cumsum(tau, 1, False)            # optical depth from the viewer's side
    cam_T = np.exp(-t_front)
    a = 1.0 - np.exp(-tau)
    w = cam_T * a
    alpha = 1.0 - np.exp(-tau.sum(axis=1))
    lights = [
        excl_cumsum(tau, 2, True),    # +X: light arrives from the right face
        excl_cumsum(tau, 2, False),   # -X
        excl_cumsum(tau, 0, True),    # +Y up (grid z top)
        excl_cumsum(tau, 0, False),   # -Y
        t_front,                      # front (viewer side)
        excl_cumsum(tau, 1, True),    # back
    ]
    safe = np.maximum(alpha, 1e-4)
    imgs = [(w * ms(L * 0.8)).sum(axis=1) / safe for L in lights]
    emis = (cam_T * flame * dz).sum(axis=1)
    return imgs, alpha, emis


def run(name):
    p = EFFECTS[name]
    t0 = time.time()
    sc, dom = setup_sim(name, p)
    f0, f1 = p['frames']
    picks = [int(round(f0 + (f1 - f0) * i / (GRID * GRID - 1))) for i in range(GRID * GRID)]
    mask = border_mask(FRAME)
    frames = {}
    emax = 0.0
    for fr in range(1, f1 + 1):
        sc.frame_set(fr)
        if fr not in picks:
            continue
        dg = bpy.context.evaluated_depsgraph_get()
        dd = dom.evaluated_get(dg).modifiers['Fluid'].domain_settings
        rx, ry, rz = dd.domain_resolution
        rho = np.array(dd.density_grid[:], dtype=np.float32)[:rx * ry * rz].reshape(rz, ry, rx)
        if p['flow'] == 'BOTH':
            fl = np.array(dd.flame_grid[:], dtype=np.float32)[:rx * ry * rz].reshape(rz, ry, rx)
        else:
            fl = np.zeros_like(rho)
        rho = np.clip(rho, 0, None) * mask
        fl = np.clip(fl, 0, None) * mask
        imgs, alpha, emis = bake_frame(rho, fl, p['sigma'])
        frames[fr] = (imgs, alpha, emis)
        emax = max(emax, float(np.percentile(emis, 99.7)) if emis.max() > 0 else 0)
        print(f'[{name}] frame {fr} alpha max {alpha.max():.2f} emis max {emis.max():.3f}', flush=True)
    S = FRAME * GRID
    A = np.zeros((S, S, 4), np.float32)
    B = np.zeros((S, S, 4), np.float32)
    for i, fr in enumerate(picks):
        imgs, alpha, emis = frames[fr]
        gx, gy = i % GRID, i // GRID
        ys, xs = slice(gy * FRAME, (gy + 1) * FRAME), slice(gx * FRAME, (gx + 1) * FRAME)
        flip = lambda im: im[::-1, :]   # grid z up -> image row 0 at the top
        A[ys, xs, 0] = flip(imgs[0]); A[ys, xs, 1] = flip(imgs[1]); A[ys, xs, 2] = flip(imgs[2]); A[ys, xs, 3] = flip(alpha)
        e = np.sqrt(np.clip(emis / emax, 0, 1)) if emax > 0 else emis * 0
        B[ys, xs, 0] = flip(imgs[3]); B[ys, xs, 1] = flip(imgs[4]); B[ys, xs, 2] = flip(e); B[ys, xs, 3] = flip(np.maximum(alpha, e))
    os.makedirs(ATLAS, exist_ok=True)
    np.savez_compressed(os.path.join(ATLAS, f'{name}.npz'), A=A.astype(np.float16), B=B.astype(np.float16))
    save(A, os.path.join(ATLAS, f'{name}_a.webp'), quality=100)
    save(B, os.path.join(ATLAS, f'{name}_b.webp'), quality=100)
    preview(A, B, os.path.join(PREVIEW, f'{name}_preview.png'), fire=p['flow'] == 'BOTH')
    meta = dict(frames=GRID * GRID, grid=GRID, frame=FRAME, simFrames=[f0, f1], fps=24, emissionMax=emax)
    with open(os.path.join(PREVIEW, f'{name}.json'), 'w') as fh:
        json.dump(meta, fh)
    print(f'[{name}] done in {time.time() - t0:.0f} s', flush=True)


def to_image(arr, name):
    h, w, _ = arr.shape
    img = bpy.data.images.new(name, w, h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    img.alpha_mode = 'STRAIGHT'
    img.pixels.foreach_set(np.ascontiguousarray(np.clip(arr[::-1], 0, 1), dtype=np.float32).reshape(-1))   # Blender rows go bottom-up
    return img


def save(arr, path, quality=90):
    img = to_image(arr, os.path.basename(path))
    sc = bpy.context.scene
    st = sc.render.image_settings
    st.file_format = 'WEBP'
    st.color_mode = 'RGBA'
    st.quality = quality
    sc.view_settings.view_transform = 'Standard'
    sc.display_settings.display_device = 'sRGB'
    img.filepath_raw = path
    img.file_format = 'WEBP'
    img.save(filepath=path, quality=quality)
    print('saved', path, os.path.getsize(path) // 1024, 'KB', flush=True)


def pack(quality):
    # every effect's 8 x 8 block into one pair of atlases: 2 blocks wide, 3 high, in EFFECTS order
    # (src/render/Flipbooks.ts FLIP_KINDS must list them in the same order)
    S = FRAME * GRID
    names = list(EFFECTS)
    for suffix in ('a', 'b'):
        big = np.zeros((S * 3, S * 2, 4), np.float32)
        for k, nm in enumerate(names):
            bx, by = k % 2, k // 2
            big[by * S:(by + 1) * S, bx * S:(bx + 1) * S] = load(os.path.join(ATLAS, f'{nm}_{suffix}.webp'))
        os.makedirs(OUT, exist_ok=True)
        save(big, os.path.join(OUT, f'fx_{suffix}.webp'), quality)


def load(path):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)[::-1].copy()


def preview(A, B, path, fire):
    # lit with a sun from upper left-front over a sky-grey background, emission on top
    sun = np.array([-0.55, 0.6, 0.58])
    sun = sun / np.linalg.norm(sun)
    L = [max(sun[0], 0), max(-sun[0], 0), max(sun[1], 0), max(-sun[1], 0), max(sun[2], 0)]
    ch = [A[..., 0], A[..., 1], A[..., 2], B[..., 0], B[..., 1]]
    lit = sum(l * l * c for l, c in zip(L, ch)) * 1.6 + 0.3 * A[..., 2] + 0.08
    alb = 0.35
    col = np.stack([lit * alb] * 3, -1)
    e = np.minimum(B[..., 2:3], B[..., 3:4]) ** 2
    # roughly the game's blackbody ramp, Reinhard-mapped
    ramp = np.concatenate([e * 9.0, e * e * 6.0, e ** 3 * 4.0], -1)
    fire_c = ramp / (1 + ramp) if fire else 0
    a = A[..., 3:4]
    bg = np.array([0.52, 0.62, 0.75], np.float32)
    out = bg * (1 - a) + col * a + fire_c
    out = np.concatenate([np.clip(out, 0, 1) ** (1 / 2.2), np.ones_like(a)], -1)
    img = to_image(out, 'preview')
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['all']
    if argv[0] == 'preview':
        # lit contact sheets straight from the committed atlases (checks the WebP round trip too)
        for nm in (list(EFFECTS) if len(argv) < 2 else argv[1:]):
            A, B = load(os.path.join(ATLAS, f'{nm}_a.webp')), load(os.path.join(ATLAS, f'{nm}_b.webp'))
            os.makedirs(PREVIEW, exist_ok=True)
            preview(A, B, os.path.join(PREVIEW, f'{nm}_preview.png'), fire=EFFECTS[nm]['flow'] == 'BOTH')
        sys.exit(0)
    if argv[0] == 'pack':
        pack(int(argv[1]) if len(argv) > 1 else 88)
        sys.exit(0)
    names = list(EFFECTS) if argv[0] == 'all' else argv
    for nm in names:
        run(nm)
