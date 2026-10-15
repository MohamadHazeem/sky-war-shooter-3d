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
