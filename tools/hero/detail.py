"""Shared offline aircraft finish. Metre-valued relief; CC0 scan variation only.
The scan's corrugation is deliberately excluded: each row is detrended before sampling.
"""
from pathlib import Path
import numpy as np


def scan_variation(u, v):
    import bpy
    channels = []
    for name in ('diffuse', 'rough'):
        im = bpy.data.images.load(str(Path(__file__).parent / 'references' / f'painted_metal_shutter_{name}.jpg'), check_existing=True)
        w, h = im.size
        a = np.empty(w * h * 4, np.float32)
        im.pixels.foreach_get(a)
        a = a.reshape(h, w, 4)[..., :3].mean(-1)
        # Remove the shutter's broad horizontal shading; retain scratches / paint mottling.
        a -= a.mean(axis=1, keepdims=True)
        a /= max(float(a.std()) * 3, .01)
        channels.append(np.clip(a[(np.asarray(v) * h).astype(int) % h, (np.asarray(u) * w).astype(int) % w], -1, 1))
    return channels


def sheet_relief(s, t, pitch_s=.65, pitch_t=.42):
    """Thin sheet between frames/stringers: restrained 0.3–0.8 mm oil-canning.
    Separate deterministic panel phases avoid the inflated checkerboard appearance.
    """
    a, b = s / pitch_s, t / pitch_t
    phase = np.sin(np.floor(a) * 12.9898 + np.floor(b) * 7.233)
    envelope = np.sin(np.pi * (a % 1)) ** 2 * np.sin(np.pi * (b % 1)) ** 2
    wave = np.sin(s * 23 + t * 9) * np.sin(t * 17 - s * 7)
    return envelope * (.00055 * phase + .00018 * wave)


def curvature(height):
    """Signed relief curvature, used in roughness/edge wear, never an extra runtime map."""
    dy, dx = np.gradient(height)
    return np.clip(.5 + 260 * (np.gradient(dx, axis=1) + np.gradient(dy, axis=0)), 0, 1)


def finish_normals(baked, height, metric, strength=1.0, filter_slopes=False):
    """Resolve sculpt detail below the subdivided mesh's vertex pitch at ship resolution.
    Analytic tangent slopes complement the geometric bake; no colour is added. metric is
    metres per source texel (x, y), measured from position bakes or calibrated UV charts.
    """
    size = baked.shape[0]
    factor = height.shape[0] // size
    def down(a):
        return a.reshape(size, factor, size, factor).mean(axis=(1, 3))
    if filter_slopes:
        # The B-17's 45 mm pitch approaches two shipped texels: differentiate
        # before filtering so central differences do not cancel those rows.
        dy, dx = np.gradient(height)
        mx, my = (np.maximum(m, .002) for m in metric)
        sx = down(np.clip(dx / mx, -.65, .65))
        sy = down(np.clip(dy / my, -.65, .65))
    else:
        dy, dx = np.gradient(down(height))
        mx, my = (np.maximum(down(m) * factor, .002) for m in metric)
        sx, sy = np.clip(dx / mx, -.65, .65), np.clip(dy / my, -.65, .65)
    n = baked * 2 - 1
    n[..., 0] -= strength * sx
    n[..., 1] -= strength * sy
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), .001)
    return np.clip(n * .5 + .5, 0, 1)
