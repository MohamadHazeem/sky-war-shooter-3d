"""Texture synthesis for the hero aircraft (numpy, runs inside Blender's Python or plain Python).

Input: baked maps (H, W, 4) float32 in the atlas: 'pos' (position/40+0.5, Blender frame), 'nrm'
(normal*0.5+0.5), 'pinfo' (paint class/64, node index/255), 'pcoord' (surface coords s/40+0.5,
t/8+0.5, surface id/64), 'ao'. Output (H, W, 3) arrays in file colour space:
  base    sRGB base colour: RLM camouflage, markings, panel-line grime, exhaust / oil / gun soot,
          chipping to bare aluminium and primer, fading
  ace     the same with the ace's markings (kill bars, emblem, Kommandeur chevrons, spinner)
  orm     R occlusion (baked AO), G roughness, B metalness (glTF packing)
  normal  tangent-space normal map from the height field (panel-line grooves, rivet heads,
          fabric rib tapes), derived in the atlas's own UV frame
Everything is a function of the 3D position / surface coordinates, so markings and seams run
across UV islands without seams in the pattern.
"""
import math, os
import numpy as np

DEBUG = bool(os.environ.get('HERO_DEBUG'))

from model import (SKIN, INTERIOR, SUIT, FACE, HELMET, TYRE, GEAR, BLADE, SPINNER, EXHAUST, GUNMETAL,
                   FRAME, PANEL, GRILLE, SEAT, FANMETAL, BURNT, LENS)

# RLM colours as they look weathered in daylight (sRGB 0..1)
def _c(h):
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)
RLM = {
    '02': _c('7a7b6a'), '04': _c('e3ad22'), '21': _c('e9e8e1'), '22': _c('1e1e1d'), '23': _c('a8262a'),
    '24': _c('243a69'), '25': _c('3f7d43'), '65': _c('7b94a4'), '66': _c('34363a'), '70': _c('2c3327'),
    '71': _c('3c4430'), '74': _c('3c4041'), '75': _c('5c5c62'), '76': _c('9aa7ab'), '81': _c('544a3a'),
    '82': _c('4e5a3a'), '83': _c('3a4a37'), 'alu': _c('b9bcbf'), 'soot': _c('1b1917'),
    'od': _c('535441'), 'rafgreen': _c('434d40'), 'rafgrey': _c('626d72'), 'mediumgrey': _c('9a9e9e'), 'sky': _c('bec7ac'),
    'oil': _c('2a2216'), 'primer': _c('7d8170'), 'red': _c('b02a26'), 'green': _c('2f6b35'),
}


# ---------------------------------------------------------------- noise

def _hash(ix, iy, iz, seed):
    h = (ix.astype(np.uint32) * np.uint32(73856093)) ^ (iy.astype(np.uint32) * np.uint32(19349663)) \
        ^ (iz.astype(np.uint32) * np.uint32(83492791)) ^ np.uint32((seed * 2654435761) & 0xffffffff)
    h ^= h >> np.uint32(13)
    h *= np.uint32(1274126177)
    h ^= h >> np.uint32(16)
    return (h & np.uint32(0xffffff)).astype(np.float32) / np.float32(0xffffff)


def vnoise(p, freq, seed=0):
    """Value noise 0..1 of points p (N, 3); freq scalar or (3,) per axis."""
    x = p * np.asarray(freq, np.float32)
    i = np.floor(x).astype(np.int64)
    f = x - i
    f = f * f * (3 - 2 * f)
    out = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out = out + w * _hash(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return out


def fbm(p, freq, octaves=4, seed=0, gain=0.5):
    a, s, n = 1.0, 0.0, 0.0
    f = np.asarray(freq, np.float32)
    for o in range(octaves):
        s += a * vnoise(p, f, seed + o * 17)
        n += a
        a *= gain
        f = f * 2.03
    return s / n


def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    t = t[..., None] if np.ndim(t) == np.ndim(a) - 1 else t
    return a + (b - a) * t


# ---------------------------------------------------------------- stencil font (unit box: x 0..1, y 0..1)

_G = {
    '0': [((0, 0), (1, 0)), ((1, 0), (1, 1)), ((1, 1), (0, 1)), ((0, 1), (0, 0))],
    '1': [((0.55, 0), (0.55, 1)), ((0.55, 1), (0.25, 0.8))],
    '2': [((0, 1), (1, 1)), ((1, 1), (1, 0.52)), ((1, 0.52), (0, 0.48)), ((0, 0.48), (0, 0)), ((0, 0), (1, 0))],
    '3': [((0, 1), (1, 1)), ((1, 1), (1, 0)), ((1, 0), (0, 0)), ((0.3, 0.5), (1, 0.5))],
    '4': [((0, 1), (0, 0.45)), ((0, 0.45), (1, 0.45)), ((0.75, 0.75), (0.75, 0))],
    '5': [((1, 1), (0, 1)), ((0, 1), (0, 0.52)), ((0, 0.52), (1, 0.48)), ((1, 0.48), (1, 0)), ((1, 0), (0, 0))],
    '6': [((1, 1), (0, 1)), ((0, 1), (0, 0)), ((0, 0), (1, 0)), ((1, 0), (1, 0.5)), ((1, 0.5), (0, 0.5))],
    '7': [((0, 1), (1, 1)), ((1, 1), (0.35, 0))],
    '8': [((0.22, 1), (0.78, 1)), ((0.78, 1), (0.95, 0.86)), ((0.95, 0.86), (0.95, 0.68)), ((0.95, 0.68), (0.72, 0.53)), ((0.72, 0.53), (0.28, 0.53)), ((0.28, 0.53), (0.05, 0.68)), ((0.05, 0.68), (0.05, 0.86)), ((0.05, 0.86), (0.22, 1)), ((0.28, 0.53), (0.0, 0.36)), ((0.0, 0.36), (0.0, 0.14)), ((0.0, 0.14), (0.16, 0)), ((0.16, 0), (0.84, 0)), ((0.84, 0), (1, 0.14)), ((1, 0.14), (1, 0.36)), ((1, 0.36), (0.72, 0.53))],
    '9': [((1, 0.5), (0, 0.5)), ((0, 0.5), (0, 1)), ((0, 1), (1, 1)), ((1, 1), (1, 0)), ((1, 0), (0, 0))],
    'A': [((0, 0), (0.5, 1)), ((0.5, 1), (1, 0)), ((0.22, 0.42), (0.78, 0.42))],
    'B': [((0, 0), (0, 1)), ((0, 1), (0.8, 1)), ((0.8, 1), (0.85, 0.55)), ((0, 0.52), (1, 0.48)), ((1, 0.48), (1, 0)), ((1, 0), (0, 0))],
    'C': [((1, 1), (0, 1)), ((0, 1), (0, 0)), ((0, 0), (1, 0))],
    'D': [((0, 0), (0, 1)), ((0, 1), (0.7, 1)), ((0.7, 1), (1, 0.7)), ((1, 0.7), (1, 0.3)), ((1, 0.3), (0.7, 0)), ((0.7, 0), (0, 0))],
    'J': [((0, 1), (1, 1)), ((0.75, 1), (0.75, 0.15)), ((0.75, 0.15), (0.55, 0)), ((0.55, 0), (0.15, 0)), ((0.15, 0), (0, 0.2))],
    'E': [((1, 1), (0, 1)), ((0, 1), (0, 0)), ((0, 0), (1, 0)), ((0, 0.5), (0.75, 0.5))],
    'H': [((0, 0), (0, 1)), ((1, 0), (1, 1)), ((0, 0.5), (1, 0.5))],
    'K': [((0, 0), (0, 1)), ((0, 0.45), (1, 1)), ((0.3, 0.6), (1, 0))],
    'M': [((0, 0), (0, 1)), ((0, 1), (0.5, 0.45)), ((0.5, 0.45), (1, 1)), ((1, 1), (1, 0))],
    'N': [((0, 0), (0, 1)), ((0, 1), (1, 0)), ((1, 0), (1, 1))],
    'P': [((0, 0), (0, 1)), ((0, 1), (1, 1)), ((1, 1), (1, 0.48)), ((1, 0.48), (0, 0.48))],
    'R': [((0, 0), (0, 1)), ((0, 1), (1, 1)), ((1, 1), (1, 0.5)), ((1, 0.5), (0, 0.5)), ((0.45, 0.5), (1, 0))],
    'S': [((1, 1), (0, 1)), ((0, 1), (0, 0.5)), ((0, 0.5), (1, 0.5)), ((1, 0.5), (1, 0)), ((1, 0), (0, 0))],
    'T': [((0, 1), (1, 1)), ((0.5, 1), (0.5, 0))],
    'U': [((0, 1), (0, 0)), ((0, 0), (1, 0)), ((1, 0), (1, 1))],
    'X': [((0, 0), (1, 1)), ((0, 1), (1, 0))],
    '+': [((0.15, 0.5), (0.85, 0.5)), ((0.5, 0.2), (0.5, 0.8))],
    '<': [((1, 1), (0.1, 0.5)), ((0.1, 0.5), (1, 0))],
    '-': [((0.1, 0.5), (0.9, 0.5))],
}


def _seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = np.clip(((px - ax) * dx + (py - ay) * dy) / max(dx * dx + dy * dy, 1e-9), 0, 1)
    return np.hypot(px - (ax + t * dx), py - (ay + t * dy))


def text_dist(u, v, text, h, aspect=0.62, gap=0.32):
    """Distance (in units of h) to the strokes of 'text' laid out from u=0, v=0 (baseline-centre at
    v=0.5h); returns (dist, total width)."""
    w = aspect * h
    d = np.full(u.shape, 9.0, np.float32)
    x0 = 0.0
    for ch in text:
        if ch == ' ':
            x0 += w * 0.7
            continue
        segs = _G.get(ch, [])
        lu, lv = (u - x0) / w, v / h + 0.5
        near = (lu > -0.6) & (lu < 1.6)
        if near.any():
            for (a, b) in segs:
                dd = _seg_dist(lu[near] * aspect, lv[near], a[0] * aspect, a[1], b[0] * aspect, b[1])
                d[near] = np.minimum(d[near], dd)
        x0 += w * (1 + gap)
    return d, x0 - w * gap


def balkenkreuz(u, v, L, style='full'):
    """Masks (black, white) of a Balkenkreuz of total width L centred at u=v=0.
    full: black cross with white borders; outline: white outline only (late-war, dark camo);
    black_outline: thin black outline only (on light surfaces)."""
    au, av = np.abs(u), np.abs(v)
    a = L / 2
    def cross(hl, hw):
        return ((au <= hl) & (av <= hw)) | ((av <= hl) & (au <= hw))
    inner = cross(a, L / 10)
    outer = cross(a, L / 5)
    if style == 'full':
        return inner.astype(np.float32), (outer & ~inner).astype(np.float32)
    # outline style: the late-war "hollow" cross: only the angle-brackets of the outer border
    ring = outer & ~cross(a - L * 0.035, L / 5 - L * 0.035)
    ring = ring & ~inner | (ring & ((au > L / 10) & (av > L / 10)))
    br = (outer & ~cross(a, L / 5 - L * 0.035))   # the 4 L-shaped brackets
    if style == 'outline':
        return inner.astype(np.float32) * 0.0, br.astype(np.float32)
    return br.astype(np.float32), inner.astype(np.float32) * 0.0


def heart(u, v, s):
    x, y = u / s, v / s + 0.15
    return ((x * x + y * y - 0.25) ** 3 - x * x * y ** 3 * 1.2) <= 0


# ---------------------------------------------------------------- derivatives on the atlas

def safe_grad(F, P, valid):
    """d F / d(col), d F / d(row) per texel using the neighbour on the same surface (position jump
    small); 0 where both neighbours are on another island."""
    out = []
    for ax in (1, 0):
        fwd = np.roll(F, -1, ax) - F
        bwd = F - np.roll(F, 1, ax)
        pf = np.linalg.norm(np.roll(P, -1, ax) - P, axis=-1)
        pb = np.linalg.norm(P - np.roll(P, 1, ax), axis=-1)
        ref = np.median(np.minimum(pf, pb)[valid]) if valid.any() else 0.01
        ok_f, ok_b = pf < 4 * ref, pb < 4 * ref
        g = np.where(ok_f & ok_b, 0.5 * (fwd + bwd), np.where(ok_f, fwd, np.where(ok_b, bwd, 0.0)))
        out.append(g.astype(np.float32))
    return out


# ---------------------------------------------------------------- main

def paint(m, maps, size):
    info = m.info
    seed = info.get('seed', 1)
    H = W = size
    pos = maps['pos']
    valid = pos[..., 3] > 0.5
    Pb = (pos[..., :3] - 0.5) * 40
    P = np.stack([Pb[..., 0], Pb[..., 2], -Pb[..., 1]], -1).astype(np.float32)      # game frame
    Nb = maps['nrm'][..., :3] * 2 - 1
    N = np.stack([Nb[..., 0], Nb[..., 2], -Nb[..., 1]], -1).astype(np.float32)
    N /= np.maximum(np.linalg.norm(N, axis=-1, keepdims=True), 1e-6)
    cls = np.rint(maps['pinfo'][..., 0] * 64).astype(np.int32)
    nid = np.rint(maps['pinfo'][..., 1] * 255).astype(np.int32)
    S = ((maps['pcoord'][..., 0] - 0.5) * 40).astype(np.float32)
    T = ((maps['pcoord'][..., 1] - 0.5) * 8).astype(np.float32)
    sid = np.rint(maps['pcoord'][..., 2] * 64).astype(np.int32)
    # surfaces measured on a FlightGear shape (fg.py) carry their map: exact S / T per texel instead of
    # the per-vertex values interpolated over long source triangles
    for k, s in enumerate(m.surfs):
        mp = getattr(s, 'mapper', None) if s is not None else None
        if mp is None:
            continue
        sel = (pos[..., 3] > 0.5) & (sid == k)
        if sel.any():
            S[sel], T[sel] = mp.st(P[sel].astype(np.float64))
    ao_map = maps['ao']
    ao = np.where(ao_map[..., 3] > 0.5, ao_map[..., 0], 1.0).astype(np.float32)

    names = m.order
    node_of = lambda prefix: np.isin(nid, [i for i, n in enumerate(names) if n.startswith(prefix)])

    # per-texel metric: metres per texel, surface-coordinate gradients (px) for crisp 1-px lines
    dPx = np.linalg.norm(np.roll(P, -1, 1) - P, axis=-1)
    tm_ref = float(np.median(dPx[valid])) if valid.any() else 0.005
    gSc, gSr = safe_grad(S, P, valid)
    gTc, gTr = safe_grad(T, P, valid)
    gS = np.maximum(np.hypot(gSc, gSr), 1e-6)
    gT = np.maximum(np.hypot(gTc, gTr), 1e-6)
    print(f'  texel ~{tm_ref * 1000:.1f} mm')

    flatP = P.reshape(-1, 3)
    up = N[..., 1]
    skin = valid & ((cls == SKIN) | (cls == FRAME))
    lift = np.zeros((H, W), bool)
    body = np.zeros((H, W), bool)
    for k, s in enumerate(m.surfs):
        if s is None:
            continue
        (lift if s.kind == 'lift' else body)[sid == k] = True
    vertical = lift & (np.abs(N[..., 0]) > 0.72)     # fins / rudders: painted like the fuselage sides
    # walls of the hinge slots (the cut faces of a fixed surface and its control surface, facing each
    # other a few mm apart): a clean dark slot instead of noisy AO
    slot = lift & (np.abs(N[..., 2]) > 0.75) & (T > 0.12)
    ao = np.where(slot, np.minimum(ao, 0.2), ao)

    # ---------------- camouflage
    scheme = info.get('scheme', '7475')
    noise_p = flatP
    def nz(freq, sd, octv=4):
        return fbm(noise_p, freq, octv, seed + sd).reshape(H, W)
    # splinter regions in plan view (x, z): parity of the sides of a few random lines
    rng = np.random.default_rng(seed)
    parity = np.zeros((H, W), np.float32)
    soft = np.zeros((H, W), np.float32)
    for i in range(9):
        ang = rng.uniform(0, math.pi)
        a, b = math.cos(ang), math.sin(ang)
        c = rng.uniform(-3, 3)
        d = a * np.abs(P[..., 0]) * (1 if i % 2 else -1) + b * P[..., 2] + c
        d = a * P[..., 0] + b * P[..., 2] + c
        parity += (d > 0)
    splinter = (parity % 2).astype(np.float32)
    big = nz(0.9, 3, 3)
    blot = sstep(0.47, 0.53, big)          # soft-edged blotches (fuselage spine, Me 262 / Bf 110)
    if scheme == 'raf':
        # RAF A-pattern: broad curved disruptive bands, not Luftwaffe mottling.
        blot = sstep(-0.08, 0.08, np.sin(P[..., 2] * 1.5 + 0.8 * np.sin(P[..., 0] * 1.1)) + 0.25 * np.sin(P[..., 0] * 2.0))
    cols = {'7475': ('74', '75', '76'), '7475m': ('74', '75', '76'), '8182': ('81', '82', '76'),
            '7071': ('70', '71', '65'), 'usod': ('od','od','mediumgrey'), 'raf': ('rafgreen','rafgrey','mediumgrey')}[scheme]
    c_a, c_b, c_lo = RLM[cols[0]], RLM[cols[1]], RLM[cols[2]]
    hard = sstep(0.35, 0.65, splinter)
    upper_wing = mix(c_a[None, None, :] * np.ones((H, W, 1), np.float32), c_b, hard if scheme in ('7475', '7071') else blot)
    upper_body = mix(c_a[None, None, :] * np.ones((H, W, 1), np.float32), c_b, blot if scheme != '7071' else hard)
    base = np.ones((H, W, 3), np.float32) * c_lo
    # mottles on the sides: spots of the upper colours (and RLM 02 on the 109/190), denser up high
    dens = sstep(-0.55, 0.55, up)
    mot_a = sstep(-0.02, 0.05, nz(6.5, 5) - (0.6 - 0.12 * dens)) * 0.88
    mot_b = sstep(-0.02, 0.05, nz(5.8, 7) - (0.61 - 0.12 * dens)) * 0.88
    mot_c = sstep(-0.02, 0.05, nz(5.0, 9) - 0.68) * 0.7 if scheme in ('7475',) else np.zeros((H, W), np.float32)
    if scheme == '8182':
        mot_a = sstep(0.0, 0.03, nz(4.5, 5) - (0.62 - 0.12 * dens))
        mot_b = sstep(0.0, 0.03, nz(4.0, 7) - (0.63 - 0.12 * dens))
    side = base.copy()
    if scheme in ('7071', 'usod', 'raf'):
        side = upper_body
    else:
        side = mix(side, RLM['02'], mot_c * 0.9)
        side = mix(side, c_a, mot_a)
        side = mix(side, c_b, mot_b)
    # demarcations: soft, a little wavy (sprayed)
    wav = (nz(2.2, 11, 2) - 0.5) * 0.25
    if scheme in ('7071', 'usod', 'raf'):
        w_up_body = sstep(-0.5, -0.3, up + wav)
        w_side_body = np.zeros((H, W), np.float32)
    else:
        w_up_body = sstep(0.28, 0.5, up + wav)
        w_side_body = sstep(-0.62, -0.3, up + wav) * (1 - w_up_body)
    w_up_lift = sstep(-0.12, 0.12, up) * ~vertical
    col = base.copy()
    bmask = body | (skin & ~lift)
    col = np.where(bmask[..., None], mix(mix(base, side, w_side_body), upper_body, w_up_body), col)
    col = np.where((lift & ~vertical)[..., None], mix(base, upper_wing, w_up_lift), col)
    vert_col = upper_body if scheme in ('7071', 'usod', 'raf') else side
    col = np.where((lift & vertical)[..., None], vert_col, col)

    # ---------------- markings (two passes: standard and ace)
    def markings(col, ace):
        col = col.copy()
        absx = np.abs(P[..., 0])
        sidek = np.abs(N[..., 0]) > 0.3
        for (kind, z1, z0) in info.get('yellow', []):
            zz = P[..., 2]
            m_ = bmask & (zz <= z1) & (zz >= z0)
            if kind == 'under_cowl':
                m_ &= up < -0.1 + 0.15 * (nz(2.0, 13, 2) - 0.5)
            col = np.where(m_[..., None], RLM['04'], col)
        band = info.get('band')
        if band:
            z0, z1, colors = band
            zz = P[..., 2]
            inb = bmask & (zz >= z0) & (zz <= z1) & (cls == SKIN)
            k = np.clip(((zz - z0) / (z1 - z0) * len(colors)).astype(np.int32), 0, len(colors) - 1)
            for i, cname in enumerate(colors):
                col = np.where((inb & (k == i))[..., None], RLM[cname], col)
        if info.get('allied'):
            from allied_paint import markings as allied_markings
            col = allied_markings(col, P, N, skin, lift, info['allied'],
                dict(blue=_c('172844'), white=RLM['21'], red=_c('a83931'), yellow=RLM['04'], sky=RLM['sky']))
        # fuselage crosses
        for (zc, yc, L) in info.get('crosses_fus', []):
            u, v = P[..., 2] - zc, P[..., 1] - yc
            near = bmask & sidek & (np.abs(u) < L) & (np.abs(v) < L)
            bk, wh = balkenkreuz(u, v, L, info.get('cross_style', 'full'))
            col = np.where((near & (wh > 0))[..., None], RLM['21'], col)
            col = np.where((near & (bk > 0))[..., None], RLM['22'], col)
        for (xc, zc, L) in info.get('crosses_wing', []):
            u, v = absx - xc, P[..., 2] - zc
            near = lift & ~vertical & (np.abs(u) < L) & (np.abs(v) < L)
            top = near & (up > 0)
            bot = near & (up <= 0)
            bk, wh = balkenkreuz(u, v, L, 'outline')
            col = np.where((top & (wh > 0))[..., None], RLM['21'], col)
            bk2, wh2 = balkenkreuz(u, v, L, 'full')
            col = np.where((bot & (wh2 > 0))[..., None], RLM['21'], col)
            col = np.where((bot & (bk2 > 0))[..., None], RLM['22'], col)
        for (yc, zc, L) in info.get('crosses_fin', []):
            pass  # no Hakenkreuz on the fin (omitted on purpose)
        # numbers / codes on the fuselage sides (read nose->tail on each side)
        num = info.get('number')
        chev = ace and info.get('ace', {}).get('chevrons')
        labels = list(info.get('labels', []))
        if num and not chev:
            labels.append(num)
        for lab in labels:
            sw = lab.get('stroke', 0.11)
            for sgn in (1, -1):
                sel = bmask & (np.sign(N[..., 0]) == sgn) & sidek
                if lab.get('side') and lab['side'] != sgn:
                    continue
                u = (lab['z'] - P[..., 2]) if sgn > 0 else (P[..., 2] - lab['z'])
                v = P[..., 1] - lab['y']
                _, wdt = text_dist(u[:1, :1], v[:1, :1], lab['text'], lab['h'], gap=lab.get('gap', 0.32))
                near = sel & (np.abs(u) < wdt * 0.6 + lab['h']) & (np.abs(v) < lab['h'])
                if not near.any():
                    continue
                d = np.full(u.shape, 9.0, np.float32)
                d[near], _ = text_dist(u[near] + wdt / 2, v[near], lab['text'], lab['h'], gap=lab.get('gap', 0.32))
                if lab.get('outline'):
                    col = np.where((near & (d < sw + 0.035))[..., None], RLM[lab['outline']], col)
                col = np.where((near & (d < sw))[..., None], RLM[lab['color']], col)
        if chev:
            num = info['number']
            for sgn in (1, -1):
                sel = bmask & (np.sign(N[..., 0]) == sgn) & sidek
                u = (P[..., 2] - num['z'])
                v = P[..., 1] - num['y']
                h = num['h'] * 0.8
                d = np.full(u.shape, 9.0, np.float32)
                for off in (0.0, 0.32 * h):
                    for (a, b) in _G['<']:
                        d = np.minimum(d, _seg_dist(u / h - off / h, v / h + 0.5, a[0] * 0.6, a[1], b[0] * 0.6, b[1]))
                col = np.where((sel & (d < 0.15))[..., None], RLM['21'], col)
                col = np.where((sel & (d < 0.1))[..., None], RLM['22'], col)
        bar = info.get('bar')
        if bar and not chev:
            sel = bmask & sidek & (np.abs(P[..., 2] - bar['z']) < bar['w'] / 2) & (np.abs(P[..., 1] - bar['y']) < bar['h'] / 2)
            col = np.where(sel[..., None], RLM[bar['color']], col)
        ft = info.get('fuel_triangle')
        if ft:
            zc, yc = ft
            u, v = P[..., 2] - zc, P[..., 1] - yc
            s_ = 0.11
            tri = (v > -s_ * 0.5) & (v < s_ * 0.6 - np.abs(u) * 1.5)
            tri_o = (v > -s_ * 0.5 - 0.012) & (v < s_ * 0.6 + 0.018 - np.abs(u) * 1.5)
            sel = bmask & (N[..., 0] > 0.3)
            col = np.where((sel & tri_o)[..., None], RLM['22'], col)
            col = np.where((sel & tri)[..., None], RLM['04'], col)
        # spinners
        sp = info.get('spinner')
        if sp:
            msk = valid & (cls == SPINNER)
            hubs = np.array(sp['hubs'], np.float32)
            dd = np.stack([np.linalg.norm(P - h, axis=-1) for h in hubs], -1)
            near = np.argmin(dd, -1)
            rel = P - hubs[near]
            th = np.arctan2(rel[..., 1], rel[..., 0]) / (2 * math.pi)
            style = sp['style']
            if ace:
                style = info.get('ace', {}).get('spinner', style)
            base_c = RLM[sp.get('base', '70')]
            scol = np.ones((H, W, 3), np.float32) * base_c
            if style in ('spiral', 'white_spiral'):
                ph = (th * (1 if near.ndim else 1) + rel[..., 2] / 0.55) % 1.0
                band_ = (ph < 0.32).astype(np.float32)
                c1, c2 = (RLM['21'], base_c) if style == 'spiral' else (RLM['22'], RLM['21'])
                scol = mix(c2 * np.ones((H, W, 3), np.float32), c1, band_)
            elif style == 'white':
                scol[:] = RLM['21']
            elif style == 'half':
                scol = np.where((th % 0.5 < 0.25)[..., None], RLM['21'], base_c)
            col = np.where(msk[..., None], scol, col)
        if ace:
            a = info.get('ace', {})
            # Abschussbalken on the rudder: rows of white bars, both sides
            rud = node_of('ctl_rudder') & valid & (np.abs(N[..., 0]) > 0.5)
            if rud.any():
                kills = a.get('kills', 30)
                rz = P[..., 2][rud]
                ry = P[..., 1][rud]
                zf, z_aft = rz.max(), rz.min()
                yb, yt = np.percentile(ry, 20), np.percentile(ry, 85)
                cols_n = 10
                bw = (zf - z_aft) * 0.62 / cols_n
                bh = min(0.11, (yt - yb) / 6)
                u = (zf - 0.08 - P[..., 2]) / bw
                v = (yt - P[..., 1]) / (bh * 1.35)
                ci, ri = np.floor(u), np.floor(v)
                idx = ri * cols_n + ci
                inside = rud & (u >= 0) & (ci < cols_n) & (v >= 0) & (idx < kills) & (idx >= 0)
                inbar = inside & ((u - ci) < 0.55) & ((v - ri) < 0.74)
                col = np.where(inbar[..., None], RLM['21'], col)
            em = a.get('emblem')
            pos_e = info.get('emblem_at')
            if em and pos_e:
                zc, yc, s_ = pos_e
                u, v = P[..., 2] - zc, P[..., 1] - yc
                sel = bmask & sidek & (np.abs(u) < s_) & (np.abs(v) < s_)
                if em == 'heart':
                    uu = np.where(N[..., 0] > 0, -u, u)
                    h = heart(uu, v, s_ * 0.55)
                    col = np.where((sel & heart(uu, v, s_ * 0.62))[..., None], RLM['21'], col)
                    col = np.where((sel & h)[..., None], RLM['green'], col)
                elif em == 'spade':
                    uu = np.where(N[..., 0] > 0, -u, u)
                    h = heart(uu, -v + s_ * 0.1, s_ * 0.55) | ((np.abs(uu) < s_ * 0.06) & (v < -s_ * 0.1) & (v > -s_ * 0.55))
                    ring = (np.hypot(u, v) < s_ * 0.85) & (np.hypot(u, v) > s_ * 0.74)
                    col = np.where((sel & (np.hypot(u, v) < s_ * 0.85))[..., None], RLM['21'], col)
                    col = np.where((sel & (h | ring))[..., None], RLM['22'], col)
                elif em == 'bars':
                    pass
            if a.get('band'):
                z0, z1, colors = a['band']
                zz = P[..., 2]
                inb = bmask & (zz >= z0) & (zz <= z1) & (cls == SKIN)
                k = np.clip(((zz - z0) / (z1 - z0) * len(colors)).astype(np.int32), 0, len(colors) - 1)
                for i, cname in enumerate(colors):
                    col = np.where((inb & (k == i))[..., None], RLM[cname], col)
            if a.get('rudder_white'):
                col = np.where((node_of('ctl_rudder') & valid & ~rud if rud.any() else node_of('ctl_rudder') & valid)[..., None] & False, RLM['21'], col)
        return col

    # ---------------- panel lines, rivets, fabric (height + line mask)
    height = np.zeros((H, W), np.float32)
    seam = np.zeros((H, W), np.float32)
    rivet = np.zeros((H, W), np.float32)
    texel = np.maximum(tm_ref, 1e-4)
    def line_px(F, gF, v0):
        return np.abs(F - v0) / gF
    for k, s in enumerate(m.surfs):
        if s is None:
            continue
        sel = (sid == k) & valid
        if not sel.any():
            continue
        Ss, Ts, gSs, gTs = S[sel], T[sel], gS[sel], gT[sel]
        Pk = P[sel]
        dmin = np.full(Ss.shape, 99.0, np.float32)
        rv = np.zeros(Ss.shape, np.float32)
        if s.kind == 'body':
            along_s = Ts * np.hypot(Pk[:, 0], Pk[:, 1] - s.axis_y)   # arc length round the body
        else:
            along_s = Pk[:, 2]
        along_t = Ss
        sp = s.rivet
        off = 0.016 / texel
        def rivets(dp, along):
            dperp = np.abs(dp - off)
            da = np.abs((along / sp) % 1.0 - 0.5) * sp / texel
            return 1 - sstep(0.45, 1.05, np.hypot(dperp, da))
        for ln in s.lines_s:
            v0, lo, hi = (ln, -99, 99) if not isinstance(ln, tuple) else ln
            d = line_px(Ss, gSs, v0)
            rng_ = (Ts >= lo) & (Ts <= hi)
            d = np.where(rng_, d, 99)
            dmin = np.minimum(dmin, d)
            rv = np.maximum(rv, np.where(rng_, rivets(d, along_s), 0))
        for ln in s.lines_t:
            v0, lo, hi = (ln, -99, 99) if not isinstance(ln, tuple) else ln
            d = line_px(Ts, gTs, v0)
            rng_ = (Ss >= lo) & (Ss <= hi)
            d = np.where(rng_, d, 99)
            dmin = np.minimum(dmin, d)
            rv = np.maximum(rv, np.where(rng_, rivets(d, along_t), 0))
        for (s0, s1, t0, t1) in s.hatches:
            inside = (Ss >= s0 - 0.01) & (Ss <= s1 + 0.01) & (Ts >= t0 - 0.01) & (Ts <= t1 + 0.01)
            d = np.minimum(np.minimum(line_px(Ss, gSs, s0), line_px(Ss, gSs, s1)),
                           np.minimum(line_px(Ts, gTs, t0), line_px(Ts, gTs, t1)))
            dmin = np.minimum(dmin, np.where(inside, d, 99))
            # fasteners at the corners and along the edges
            rv = np.maximum(rv, np.where(inside, rivets(d, along_s if s.kind == 'body' else along_t) * 0.8, 0))
        ln_mask = 1 - sstep(0.35, 1.15, dmin)
        h = -ln_mask * 0.6 + rv * (0.14 if texel < 0.008 else 0.0)
        if s.fabric > 0:
            ph = (Ss / s.fabric) % 1.0
            rib = 1 - sstep(0.0, 0.06, np.abs(ph - 0.5) - 0.0)
            sag = -0.35 * np.cos((ph - 0.5) * math.pi * 2) * 0.5 - 0.17
            h = h + rib * 0.45 + sag * 0.6
        height[sel] = h
        seam[sel] = ln_mask
        rivet[sel] = rv

    # ---------------- weathering
    def weather(col):
        col = col.copy()
        rough = np.full((H, W), 0.62, np.float32)
        metal = np.full((H, W), 0.08, np.float32)
        # class colours for everything that is not painted skin
        flatn = nz(14.0, 21, 3)
        def put(c_, rgb, r, mt, var=0.06):
            msk = valid & (cls == c_)
            v_ = (1 + (flatn - 0.5) * var * 2)[..., None]
            col[msk] = (np.asarray(rgb, np.float32) * v_)[msk]
            rough[msk] = r
            metal[msk] = mt
        put(INTERIOR, RLM['66'], 0.72, 0.1)
        put(SUIT, _c('4a3a2a'), 0.6, 0.0, 0.12)
        put(FACE, _c('c39478'), 0.62, 0.0)
        put(HELMET, _c('3a2a1c'), 0.5, 0.0, 0.1)
        put(TYRE, _c('1a1a1a'), 0.9, 0.0)
        put(GEAR, RLM['02'], 0.55, 0.15)
        put(BLADE, RLM['70'], 0.55, 0.08, 0.04)
        put(EXHAUST, _c('4a3428'), 0.75, 0.5, 0.2)
        put(GUNMETAL, _c('2a2b2e'), 0.38, 0.85)
        put(PANEL, _c('161616'), 0.45, 0.1)
        put(GRILLE, _c('1d1d1b'), 0.7, 0.4)
        put(SEAT, _c('51544f'), 0.5, 0.45)
        put(FANMETAL, _c('8e9196'), 0.35, 0.85)
        put(BURNT, _c('3b342f'), 0.6, 0.7, 0.2)
        spm = valid & (cls == SPINNER)
        rough[spm] = 0.48
        # instrument dials
        pm = valid & (cls == PANEL) & (N[..., 2] < -0.5)
        if pm.any():
            gx = (P[..., 0] / 0.085) % 1.0 - 0.5
            gy = ((P[..., 1] - 0.02) / 0.085) % 1.0 - 0.5
            r = np.hypot(gx, gy)
            dial = pm & (r < 0.38)
            col[dial] = _c('0b0b0b')
            col[pm & (r > 0.33) & (r < 0.4)] = _c('5a5a55')
            col[dial & (np.abs(gx) < 0.03) & (gy > 0) & (gy < 0.3)] = _c('e8e4d0')
            rough[dial] = 0.15
        # grille slats
        gm = valid & (cls == GRILLE)
        col[gm & ((P[..., 1] * 90) % 1.0 < 0.35)] *= 0.45
        skinm = skin
        # paint variation, sun fading on the upper surfaces, seam grime
        lowf = nz(0.7, 31, 3)
        fade = (1 + (lowf - 0.5) * 0.12)[..., None]
        sun = sstep(0.2, 0.9, up)[..., None] * 0.04
        lum = col.mean(-1, keepdims=True)
        pc = col * fade
        pc = pc + (lum * 1.08 - pc) * sun
        pc = pc + sun * 0.05
        col = np.where(skinm[..., None], pc, col)
        rough = np.where(skinm, 0.6 + (lowf - 0.5) * 0.12 + (nz(9, 33, 3) - 0.5) * 0.08, rough)
        col = np.where(skinm[..., None], col * (1 - 0.32 * seam)[..., None], col)
        # streaks aft of the seams (dirt drawn back by the airflow): stretched noise
        streak = fbm(flatP, (22, 22, 0.45), 3, seed + 41).reshape(H, W)
        dirt = sstep(0.58, 0.85, streak) * 0.05
        col = np.where(skinm[..., None], col * (1 - dirt)[..., None], col)
        # exhaust staining
        ex = info.get('exhausts', [])
        stain = np.zeros((H, W), np.float32)
        for (tx, ty, tz) in ex:
            da = tz - P[..., 2]
            sd = np.sign(tx)
            sel = (np.sign(P[..., 0]) == sd) & (da > -0.05) & bmask & (np.abs(N[..., 0]) > 0.15) & (np.abs(P[..., 1] - ty) < 0.6)
            spread = 0.06 + 0.13 * np.maximum(da, 0)
            band_ = np.exp(-((P[..., 1] - (ty - 0.07 * np.maximum(da, 0))) / spread) ** 2)
            amt = info.get('stain_amt', 1.3) * band_ * np.exp(-np.maximum(da, 0) / info.get('stain_len', 2.2)) * sstep(-0.05, 0.08, da)
            stain = np.maximum(stain, np.where(sel, amt, 0))
        if ex:
            st_noise = fbm(flatP, (3, 30, 2.0), 3, seed + 51).reshape(H, W)
            stain = stain * (0.6 + 0.8 * st_noise)
            stain = np.clip(stain, 0, 1) * (skinm | (valid & (cls == EXHAUST)))
            sootc = mix(_c('4b3d2f') * np.ones((H, W, 3), np.float32), RLM['soot'], sstep(0.3, 0.9, stain))
            col = mix(col, sootc, np.clip(stain * 0.95, 0, 0.92))
            rough = rough + stain * 0.2
        # gun soot behind/around muzzles (cowl, hub, wing, nose guns)
        for name in names:
            if not name.startswith('muzzle_') or name in ('muzzle_rear',):
                continue
            mp = np.array(m.nodes[name].pos, np.float32)
            rel = P - mp
            back = -rel[..., 2]
            lat = np.hypot(rel[..., 0], rel[..., 1])
            amt = np.exp(-(lat / (0.05 + 0.1 * np.clip(back, 0, 3))) ** 2) * np.exp(-np.clip(back, 0, 9) / 0.7) * sstep(-0.12, 0.05, back)
            amt = amt * skinm
            dbg['gun'] = np.maximum(dbg.get('gun', 0), amt)
            col = mix(col, RLM['soot'], np.clip(amt * 0.85, 0, 0.85))
        dbg['oil'] = np.zeros((H, W), np.float32)
        dbg['gun'] = np.zeros((H, W), np.float32)
        # oil streaks under the engine(s)
        for (ox, oy, oz, ol) in info.get('oil', []):
            da = oz - P[..., 2]
            lat = np.exp(-((P[..., 0] - ox) / 0.3) ** 2)
            o_n = fbm(flatP, (45, 45, 0.9), 3, seed + 61).reshape(H, W)
            amt = lat * sstep(-0.05, 0.1, da) * np.exp(-np.maximum(da, 0) / (ol * 2.5)) * sstep(0.5, 0.78, o_n) * (up < -0.15)
            amt = amt * (skinm & bmask) * 0.7
            dbg['oil'] = np.maximum(dbg['oil'], amt)
            col = mix(col, RLM['oil'], np.clip(amt * 0.8, 0, 0.8))
            rough = rough - amt * 0.3
        # paint chipping: wing roots / walkways, leading edges, seams, cockpit sill, prop blade tips
        wear = info.get('wear', 1.0)
        chipn = fbm(flatP, 38.0, 3, seed + 71).reshape(H, W)
        chipn2 = fbm(flatP, 90.0, 2, seed + 73).reshape(H, W)
        cn = chipn * 0.88 + chipn2 * 0.12
        expo = np.zeros((H, W), np.float32)
        for (x0, x1, z0, z1) in info.get('walkway', []):
            ax_ = np.abs(P[..., 0])
            expo = np.maximum(expo, ((ax_ >= x0) & (ax_ <= x1) & (P[..., 2] <= z1) & (P[..., 2] >= z0) & lift & (up > 0.3)) * 0.5)
        le_ = lift & (T < 0.05)
        expo = np.maximum(expo, le_ * 0.45)
        expo = np.maximum(expo, seam * 0.22)
        expo = np.maximum(expo, (valid & (cls == FRAME)) * 0.5)
        expo = np.maximum(expo, (valid & (cls == BLADE) & (np.linalg.norm(P - np.array((info.get('spinner') or {}).get('hubs', [(0, 0, 0)])[0], np.float32), axis=-1) > 1.2)) * 0.35)
        thr = 0.815 - 0.2 * expo * wear       # 05b: fewer isolated chips (read as snow at gun range)
        chip = sstep(0.0, 0.015, cn - thr) * (skinm | (valid & (cls == BLADE)))
        primer = sstep(0.0, 0.015, cn - (thr - 0.03)) * (1 - chip) * (skinm) * 0.8
        col = mix(col, RLM['primer'], primer * 0.6)
        col = mix(col, RLM['alu'] * (0.8 + 0.14 * chipn2[..., None]), chip)
        metal = metal + (0.88 - metal) * chip
        rough = rough + (0.32 - rough) * chip
        rough = np.where(skinm, rough + seam * 0.08, rough)
        dbg['stain'] = stain
        dbg['chip'] = chip
        dbg['dirt'] = dirt
        # baked occlusion into the colour, lightly (the material's aoMap does the rest)
        col = col * (0.72 + 0.28 * ao)[..., None]
        return np.clip(col, 0, 1), np.clip(rough, 0.05, 1), np.clip(metal, 0, 1)

    dbg = {}
    base_m = markings(col, False)
    ace_m = markings(col, True)
    base_c, rough, metal = weather(base_m)
    ace_c, _, _ = weather(ace_m)

    # ---------------- normal map from the height field (metres)
    hm = height * 0.0022
    dHc, dHr = safe_grad(hm, P, valid)
    nx = -dHc / texel
    ny = -dHr / texel
    nzv = np.ones_like(nx)
    nl = np.sqrt(nx * nx + ny * ny + 1)
    nrm = np.stack([nx / nl, ny / nl, nzv / nl], -1) * 0.5 + 0.5
    nrm[~valid] = (0.5, 0.5, 1.0)

    orm = np.stack([ao, rough, metal], -1)
    out = {'base': base_c, 'ace': ace_c, 'orm': orm.astype(np.float32), 'normal': nrm.astype(np.float32)}
    if DEBUG:
        rngc = np.random.default_rng(5).random((256, 3)).astype(np.float32)
        out['dbg_node'] = np.where(valid[..., None], rngc[np.clip(nid, 0, 255)], 0)
        dbg.update(seam=seam, rivet=rivet, height=height * 0.5 + 0.5, ao=ao, flap=node_of('ctl_flap_L') * 1.0, wingL=node_of('part_wingL') * 1.0)
        for k, v in dbg.items():
            out['dbg_' + k] = np.repeat(np.clip(v, 0, 1)[..., None], 3, -1).astype(np.float32)
    return out
