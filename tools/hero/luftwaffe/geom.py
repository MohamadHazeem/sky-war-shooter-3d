"""Parametric geometry for the Luftwaffe hero models (pure Python, no bpy).

Everything is built in the GAME frame: metres, +X left wing, +Y up, +Z nose (build.py converts to
Blender's Z-up frame when it makes the objects). A mesh is (verts, faces): verts a list of (x, y, z),
faces a list of index tuples (quads or triangles).

Primitives
  loft()      fuselage / nacelle / canopy body from cross-section stations (super-ellipse halves,
              PCHIP-interpolated along Z so nothing overshoots), optional cockpit opening
  panel()     a chord-wise slice of a lifting surface (wing, tailplane, fin, control surface)
              between two span stations, closed at every cut, NACA 4-digit section
  revolve()   bodies of revolution (spinners, wheels, exhausts, barrels, intake rings)
  tube()      a square or round profile swept along a polyline (canopy frames, struts, gear legs)
  ellipsoid() bulges, heads, blisters
  blade()     a twisted propeller blade
"""
import math

# ---------------------------------------------------------------- helpers

def v_add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def v_sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def v_mul(a, k): return (a[0] * k, a[1] * k, a[2] * k)
def v_dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def v_cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def v_len(a): return math.sqrt(v_dot(a, a))
def v_norm(a):
    l = v_len(a) or 1.0
    return (a[0] / l, a[1] / l, a[2] / l)
def lerp(a, b, t): return a + (b - a) * t
def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


class Mesh:
    """Accumulates verts/faces; merge() appends another mesh. attr: per-vertex surface coordinates
    (s, t, kind) used by the painter: kind 1 = body (s = station z, t = angle round the body),
    kind 2 = lifting surface (s = metres along the span, t = chord fraction), 0 = none."""
    def __init__(self, verts=None, faces=None, attr=None):
        self.verts = list(verts or [])
        self.faces = list(faces or [])
        self.attr = list(attr) if attr is not None else [(0.0, 0.0, 0.0)] * len(self.verts)

    def fill_attr(self):
        if len(self.attr) < len(self.verts):
            self.attr.extend([(0.0, 0.0, 0.0)] * (len(self.verts) - len(self.attr)))
        return self

    def merge(self, other):
        self.fill_attr(); other.fill_attr()
        o = len(self.verts)
        self.verts.extend(other.verts)
        self.attr.extend(other.attr)
        self.faces.extend(tuple(i + o for i in f) for f in other.faces)
        return self

    def transformed(self, fn):
        self.fill_attr()
        return Mesh([fn(v) for v in self.verts], self.faces, self.attr)

    def mirrored_x(self):
        """Mirror across the X=0 plane (left <-> right), flipping the winding."""
        self.fill_attr()
        return Mesh([(-v[0], v[1], v[2]) for v in self.verts], [tuple(reversed(f)) for f in self.faces],
                    [a for a in self.attr])

    def translated(self, d):
        return self.transformed(lambda v: v_add(v, d))

    def flipped(self):
        self.fill_attr()
        return Mesh(self.verts, [tuple(reversed(f)) for f in self.faces], self.attr)


def pchip(xs, ys):
    """Monotone cubic (Fritsch-Carlson) interpolant through (xs, ys), xs increasing."""
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    if n == 2:
        m = [d[0], d[0]]
    else:
        m[0], m[-1] = d[0], d[-1]
        for i in range(1, n - 1):
            if d[i - 1] * d[i] <= 0:
                m[i] = 0.0
            else:
                w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
                m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(x):
        if x <= xs[0]: return ys[0]
        if x >= xs[-1]: return ys[-1]
        i = 0
        while xs[i + 1] < x: i += 1
        t = (x - xs[i]) / h[i]
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
                + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1])
    return f


def spow(t, e):
    return math.copysign(abs(t) ** e, t)


# ---------------------------------------------------------------- loft

class Section:
    """A cross-section: centre (cx, cy), half width hw, half heights above/below (ht, hb) and
    super-ellipse exponents for the upper and lower halves (2 = ellipse, larger = boxier, <2 = pointed)."""
    __slots__ = ('z', 'cx', 'cy', 'hw', 'ht', 'hb', 'nt', 'nb')

    def __init__(self, z, cy, hw, ht, hb, nt=2.0, nb=2.0, cx=0.0):
        self.z, self.cy, self.hw, self.ht, self.hb, self.nt, self.nb, self.cx = z, cy, hw, ht, hb, nt, nb, cx


class Body:
    """A smooth body interpolated through stations (sorted by z ascending internally)."""
    KEYS = ('cx', 'cy', 'hw', 'ht', 'hb', 'nt', 'nb')

    def __init__(self, stations):
        st = sorted(stations, key=lambda s: s.z)
        self.z0, self.z1 = st[0].z, st[-1].z
        zs = [s.z for s in st]
        self.f = {k: pchip(zs, [getattr(s, k) for s in st]) for k in self.KEYS}

    def at(self, z):
        return {k: self.f[k](z) for k in self.KEYS}

    def point(self, z, phi, grow=0.0):
        """phi: 0 = top, pi/2 = +X (left side), pi = bottom."""
        s = self.at(z)
        c, sn = math.cos(phi), math.sin(phi)
        up = c >= 0
        n = s['nt'] if up else s['nb']
        h = (s['ht'] if up else s['hb']) + grow
        x = s['cx'] + (s['hw'] + grow) * spow(sn, 2.0 / n)
        y = s['cy'] + h * spow(c, 2.0 / n)
        return (x, y, z)

    def surface_y(self, z, x, top=True):
        """y of the body surface above (top) or below the point at lateral offset x (approx)."""
        s = self.at(z)
        u = min(1.0, abs(x - s['cx']) / max(1e-6, s['hw']))
        n = s['nt'] if top else s['nb']
        # |sin|^(2/n) = u -> |cos| = sqrt(1 - u^n)
        cy = (max(0.0, 1 - u ** n)) ** 0.5
        return s['cy'] + (s['ht'] * spow(cy, 2.0 / n) if top else -s['hb'] * spow(cy, 2.0 / n))


def z_samples(z0, z1, n, dense_ends=0.35):
    """n+1 samples from z0 to z1, a little denser at both ends (noses and tails curve fastest)."""
    out = []
    for i in range(n + 1):
        t = i / n
        t = (1 - dense_ends) * t + dense_ends * (0.5 - 0.5 * math.cos(math.pi * t))
        out.append(lerp(z0, z1, t))
    return out


def loft(body, z0=None, z1=None, rings=48, seg=40, cap0='pole', cap1='pole', opening=None,
         phi_range=None, grow=0.0, zs=None):
    """Skin of a Body between z0 and z1 (ascending z: z0 = rear).
    cap0/cap1: 'pole' (collapse to a point), 'fan' (flat cap) or None (open).
    opening: (za, zb, phi_half) leaves the top quads out between za..zb within +-phi_half of the
             top (cockpit cut-out); the edge is closed by a lip (see cockpit_tub()).
    phi_range: (a, b) builds only that arc (canopy glass), open edges.
    """
    z0 = body.z0 if z0 is None else z0
    z1 = body.z1 if z1 is None else z1
    zs = zs or z_samples(z0, z1, rings)
    closed = phi_range is None
    openings = ([opening] if isinstance(opening[0], (int, float)) else list(opening)) if opening else []
    a, b = phi_range or (0.0, 2 * math.pi)
    nphi = seg if closed else seg + 1
    phis = [a + (b - a) * j / seg for j in range(nphi)]
    m = Mesh()
    for z in zs:
        for p in phis:
            m.verts.append(body.point(z, p, grow))
            m.attr.append((z, abs((p + math.pi) % (2 * math.pi) - math.pi), 1.0))  # folded: 0 top .. pi keel
    R = len(phis)
    for i in range(len(zs) - 1):
        for j in range(seg):
            j2 = (j + 1) % R if closed else j + 1
            if opening:
                zm = 0.5 * (zs[i] + zs[i + 1])
                pm = 0.5 * (phis[j] + (phis[j2] if j2 else 2 * math.pi))
                pm = (pm + math.pi) % (2 * math.pi) - math.pi
                if any(za <= zm <= zb and abs(pm) < ph for za, zb, ph in openings):
                    continue
            # outward winding (verts ordered rear->front, phi increasing toward +X)
            m.faces.append((i * R + j, i * R + j2, (i + 1) * R + j2, (i + 1) * R + j))
    if closed:
        for cap, ring, front in ((cap0, 0, False), (cap1, len(zs) - 1, True)):
            if not cap:
                continue
            s = body.at(zs[ring])
            c = len(m.verts)
            off = 0.0
            if cap == 'pole':
                # pull the pole a little past the last ring so the tip is round, not flat
                off = (0.25 if front else -0.25) * min(s['hw'], 0.5 * (s['ht'] + s['hb']))
            m.verts.append((s['cx'], s['cy'] + 0.5 * (s['ht'] - s['hb']), zs[ring] + off))
            m.attr.append((zs[ring] + off, 0.0, 1.0))
            for j in range(seg):
                j2 = (j + 1) % R
                if front:
                    m.faces.append((ring * R + j, ring * R + j2, c))
                else:
                    m.faces.append((ring * R + j2, ring * R + j, c))
    return m


def cockpit_tub(body, za, zb, phi_half, depth=0.55, seg=10, rings=10, inset=0.02):
    """Inner walls + floor of the cockpit cut into a loft (an open box seen through the canopy)."""
    m = Mesh()
    zs = [lerp(za, zb, i / rings) for i in range(rings + 1)]
    # side walls follow the hull just inside the cut edge, dropping 'depth' down to a floor
    for side in (1, -1):
        base = len(m.verts)
        for z in zs:
            top = body.point(z, side * phi_half, -inset)
            m.verts.append(top)
            m.verts.append((top[0] * 0.92, top[1] - depth, z))
        for i in range(rings):
            a, b, c, d = base + 2 * i, base + 2 * i + 1, base + 2 * i + 3, base + 2 * i + 2
            m.faces.append((a, d, c, b) if side > 0 else (a, b, c, d))
    # floor
    base = len(m.verts)
    for z in zs:
        l = body.point(z, phi_half, -inset)
        m.verts.append((l[0] * 0.92, l[1] - depth, z))
        m.verts.append((-l[0] * 0.92, l[1] - depth, z))
    for i in range(rings):
        a, b, c, d = base + 2 * i, base + 2 * i + 1, base + 2 * i + 3, base + 2 * i + 2
        m.faces.append((a, b, c, d))
    # front and rear bulkheads
    for z, sgn in ((za, 1), (zb, -1)):
        base = len(m.verts)
        pts = [body.point(z, p, -inset) for p in [phi_half * (1 - 2 * k / seg) for k in range(seg + 1)]]
        bot = pts[0][1] - depth
        for p in pts:
            m.verts.append(p)
            m.verts.append((p[0] * 0.92, bot, z))
        for k in range(seg):
            a, b, c, d = base + 2 * k, base + 2 * k + 1, base + 2 * k + 3, base + 2 * k + 2
            m.faces.append((a, b, c, d) if sgn > 0 else (a, d, c, b))
    return m


# ---------------------------------------------------------------- lifting surfaces

def naca(c, t, m=0.0, p=0.4):
    """NACA 4-digit: (camber line y, half thickness) at chord fraction c."""
    c = min(1.0, max(0.0, c))
    yt = 5 * t * (0.2969 * math.sqrt(c) - 0.1260 * c - 0.3516 * c * c + 0.2843 * c ** 3 - 0.1036 * c ** 4)
    if m <= 0:
        yc = 0.0
    elif c < p:
        yc = m / (p * p) * (2 * p * c - c * c)
    else:
        yc = m / ((1 - p) ** 2) * ((1 - 2 * p) + 2 * p * c - c * c)
    return yc, max(yt, 0.0015)


class Surface:
    """A lifting surface. root: LE point of the root section (game frame). span_dir: unit vector of the
    span (includes dihedral and side). up: thickness direction. chord_dir: LE->TE (usually -Z).
    chord(e), le(e) (LE offset along chord_dir), thick(e) thickness ratio, camber; e in 0..1 of span."""
    def __init__(self, root, span, span_dir, up, chord, le, thick, camber=0.0, chord_dir=(0, 0, -1),
                 sweep_up=None, flip=False):
        self.root, self.span = root, span
        self.sd, self.up, self.cd = v_norm(span_dir), v_norm(up), v_norm(chord_dir)
        self.chord, self.le, self.thick, self.camber = chord, le, thick, camber
        self.sweep_up = sweep_up    # optional e -> offset along 'up' (gull / anhedral tweaks)
        self.flip = flip            # mirror winding (left-handed frames)

    def point(self, e, c, side):
        """side +1 upper surface, -1 lower surface."""
        ch = self.chord(e)
        yc, yt = naca(c, self.thick(e), self.camber)
        base = v_add(self.root, v_mul(self.sd, e * self.span))
        base = v_add(base, v_mul(self.cd, self.le(e) + c * ch))
        h = (yc + side * yt) * ch
        if self.sweep_up:
            h += self.sweep_up(e)
        return v_add(base, v_mul(self.up, h))

    def hinge(self, e, c):
        """Point on the camber line (hinge lines of control surfaces)."""
        ch = self.chord(e)
        yc, _ = naca(c, self.thick(e), self.camber)
        p = v_add(self.root, v_mul(self.sd, e * self.span))
        p = v_add(p, v_mul(self.cd, self.le(e) + c * ch))
        h = yc * ch + (self.sweep_up(e) if self.sweep_up else 0.0)
        return v_add(p, v_mul(self.up, h))


def chord_samples(c0, c1, n):
    out = []
    for i in range(n + 1):
        t = i / n
        # cosine spacing about the leading edge; linear-ish elsewhere
        if c0 == 0.0:
            t = 1 - math.cos(t * math.pi / 2)
        out.append(lerp(c0, c1, t))
    return out


def panel(s, e0, e1, c0=0.0, c1=1.0, nspan=8, nchord=14, cap0=True, cap1=True, espace=None):
    """Closed slice of a Surface between span stations e0..e1 and chord fractions c0..c1."""
    cs = chord_samples(c0, c1, nchord)
    es = espace(e0, e1, nspan) if espace else [lerp(e0, e1, i / nspan) for i in range(nspan + 1)]
    m = Mesh()
    loop_len = None
    for e in es:
        loop = [s.point(e, c, +1) for c in reversed(cs)]            # upper TE->LE
        start = 1 if c0 == 0.0 else 0                                # share the LE point
        loop += [s.point(e, c, -1) for c in cs[start:]]             # lower LE->TE
        loop_len = len(loop)
        m.verts.extend(loop)
        m.attr.extend([(e * s.span, c, 2.0) for c in list(reversed(cs)) + cs[start:]])
    L = loop_len
    for i in range(len(es) - 1):
        for j in range(L):
            j2 = (j + 1) % L
            f = (i * L + j, (i + 1) * L + j, (i + 1) * L + j2, i * L + j2)
            m.faces.append(tuple(reversed(f)) if s.flip else f)
    for cap, ring, end in ((cap0, 0, False), (cap1, len(es) - 1, True)):
        if not cap:
            continue
        pts = m.verts[ring * L:(ring + 1) * L]
        cen = v_mul(tuple(map(sum, zip(*pts))), 1.0 / L)
        ci = len(m.verts)
        m.verts.append(cen)
        m.attr.append((es[ring] * s.span, 0.5 * (c0 + c1), 2.0))
        for j in range(L):
            j2 = (j + 1) % L
            f = (ring * L + j2, ring * L + j, ci) if end else (ring * L + j, ring * L + j2, ci)
            m.faces.append(tuple(reversed(f)) if s.flip else f)
    return m


def tip_spacing(e0, e1, n):
    """Span stations crowding toward e1 (rounded tips need many)."""
    return [lerp(e0, e1, math.sin(0.5 * math.pi * i / n)) for i in range(n + 1)]


# ---------------------------------------------------------------- revolve / tube / ellipsoid

def frame_from_axis(axis):
    a = v_norm(axis)
    ref = (0, 1, 0) if abs(a[1]) < 0.9 else (1, 0, 0)
    u = v_norm(v_cross(ref, a))
    w = v_cross(a, u)
    return a, u, w


def revolve(profile, origin=(0, 0, 0), axis=(0, 0, 1), seg=24, cap0=False, cap1=False, phase=0.0, sx=1.0, sy=1.0):
    """profile: [(t, r)] along the axis (t increasing). Returns a closed body of revolution.
    sx/sy squash the cross-section (oval nacelle intakes etc.)."""
    a, u, w = frame_from_axis(axis)
    m = Mesh()
    for t, r in profile:
        for j in range(seg):
            th = phase + 2 * math.pi * j / seg
            p = v_add(origin, v_mul(a, t))
            p = v_add(p, v_mul(u, r * math.cos(th) * sx))
            p = v_add(p, v_mul(w, r * math.sin(th) * sy))
            m.verts.append(p)
    n = len(profile)
    for i in range(n - 1):
        for j in range(seg):
            j2 = (j + 1) % seg
            m.faces.append((i * seg + j, i * seg + j2, (i + 1) * seg + j2, (i + 1) * seg + j))
    for cap, i, end in ((cap0, 0, False), (cap1, n - 1, True)):
        if not cap or profile[i][1] <= 1e-5:
            continue
        c = len(m.verts)
        m.verts.append(v_add(origin, v_mul(a, profile[i][0])))
        for j in range(seg):
            j2 = (j + 1) % seg
            m.faces.append((i * seg + j, i * seg + j2, c) if end else (i * seg + j2, i * seg + j, c))
    return m


def tube(points, r=0.02, seg=6, ry=None, up_hint=None, cap=True):
    """Sweep a round (seg>=6) or square (seg=4) profile of radius r (and ry) along a polyline."""
    ry = ry if ry is not None else r
    m = Mesh()
    n = len(points)
    for i, p in enumerate(points):
        t = v_norm(v_sub(points[min(i + 1, n - 1)], points[max(i - 1, 0)]))
        ref = up_hint or ((0, 1, 0) if abs(t[1]) < 0.9 else (1, 0, 0))
        u = v_norm(v_cross(ref, t))
        w = v_cross(t, u)
        for j in range(seg):
            th = 2 * math.pi * (j + 0.5) / seg
            m.verts.append(v_add(p, v_add(v_mul(u, r * math.cos(th)), v_mul(w, ry * math.sin(th)))))
    for i in range(n - 1):
        for j in range(seg):
            j2 = (j + 1) % seg
            m.faces.append((i * seg + j, i * seg + j2, (i + 1) * seg + j2, (i + 1) * seg + j))
    if cap:
        m.faces.append(tuple(reversed(range(seg))))
        m.faces.append(tuple((n - 1) * seg + j for j in range(seg)))
    return m


def ellipsoid(center, rx, ry, rz, seg=16, rings=10, yaw=0.0):
    m = Mesh()
    cyw, syw = math.cos(yaw), math.sin(yaw)
    for i in range(rings + 1):
        th = math.pi * i / rings
        for j in range(seg):
            ph = 2 * math.pi * j / seg
            x = rx * math.sin(th) * math.cos(ph)
            y = ry * math.cos(th)
            z = rz * math.sin(th) * math.sin(ph)
            m.verts.append((center[0] + x * cyw + z * syw, center[1] + y, center[2] - x * syw + z * cyw))
    for i in range(rings):
        for j in range(seg):
            j2 = (j + 1) % seg
            m.faces.append((i * seg + j, i * seg + j2, (i + 1) * seg + j2, (i + 1) * seg + j))
    return m


def box(center, hx, hy, hz):
    cx, cy, cz = center
    v = [(cx + sx * hx, cy + sy * hy, cz + sz * hz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return Mesh(v, f)


def blade(hub, radius, root_r, chord_fn, twist_fn, thick=0.08, angle=0.0, n=12, nc=8, axis_sign=1):
    """One propeller blade from the hub out along +Y (rotated by 'angle' about +Z), section
    chord_fn(t) and pitch twist_fn(t) (radians) for t in 0..1 of the blade, at hub (game frame)."""
    m = Mesh()
    ca, sa = math.cos(angle), math.sin(angle)
    loopL = None
    for i in range(n + 1):
        t = i / n
        r = lerp(root_r, radius, t)
        ch = chord_fn(t)
        tw = twist_fn(t) * axis_sign
        loop = []
        cs = chord_samples(0.0, 1.0, nc)
        pts = [(c, +1) for c in reversed(cs)] + [(c, -1) for c in cs[1:]]
        for c, sd in pts:
            _, yt = naca(c, thick * (1.4 - 0.8 * t))
            # section in the (tangential, axial) plane, chord centred at 30 %
            u = (c - 0.3) * ch
            v = sd * yt * ch
            tu = u * math.cos(tw) - v * math.sin(tw)
            tv = u * math.sin(tw) + v * math.cos(tw)
            # blade frame: radial = +Y, tangential = +X, axial = +Z
            x, y, z = tu, r, tv
            loop.append((hub[0] + x * ca - y * sa, hub[1] + x * sa + y * ca, hub[2] + z))
        loopL = len(loop)
        m.verts.extend(loop)
    L = loopL
    for i in range(n):
        for j in range(L):
            j2 = (j + 1) % L
            m.faces.append((i * L + j, i * L + j2, (i + 1) * L + j2, (i + 1) * L + j))
    # tip cap
    ci = len(m.verts)
    tip = m.verts[n * L:(n + 1) * L]
    m.verts.append(v_mul(tuple(map(sum, zip(*tip))), 1.0 / L))
    for j in range(L):
        m.faces.append((n * L + j, n * L + (j + 1) % L, ci))
    return m


def wheel(center, r, w, axis=(1, 0, 0), seg=20):
    """Tyre + hub as a body of revolution about 'axis'."""
    prof = [(-w * 0.5, r * 0.35), (-w * 0.5, r * 0.82), (-w * 0.42, r * 0.97), (0, r),
            (w * 0.42, r * 0.97), (w * 0.5, r * 0.82), (w * 0.5, r * 0.35)]
    return revolve(prof, center, axis, seg, cap0=True, cap1=True)
