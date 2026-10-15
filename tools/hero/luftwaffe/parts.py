"""Shared builders for the hero aircraft: canopy + frames, cockpit fittings, pilot figure,
propeller, undercarriage, exhaust stubs, radiators, guns. All in the game frame."""
import math
from geom import (Mesh, Body, Section, loft, cockpit_tub, panel, Surface, revolve, tube, ellipsoid, box,
                  blade, wheel, lerp, v_add, v_sub, v_mul, v_norm, tip_spacing)
from model import (SKIN, INTERIOR, SUIT, FACE, HELMET, TYRE, GEAR, BLADE, SPINNER, EXHAUST, GUNMETAL,
                   FRAME, PANEL, GRILLE, SEAT, FANMETAL, BURNT, LENS, Surf)

GAP = 0.007   # hinge gap between a control surface and its fixed surface (m)


def canopy(m, stations, phi0, frames_z, rails_phi, node='glass', frame_node='part_fuselage', frame_r=0.016,
           seg=28, rings=30, extra_frames=()):
    """Glass skin over 'stations' (Sections) from -phi0..phi0 (0 = top) and its frames: rings at
    frames_z, longitudinal rails at rails_phi (+-), plus the sills at +-phi0."""
    body = Body(stations)
    glass = loft(body, phi_range=(-phi0, phi0), rings=rings, seg=seg)
    m.add(node, glass, LENS)
    fr = Mesh()
    zs = [lerp(body.z0, body.z1, i / 40) for i in range(41)]
    for z in frames_z:
        pts = [body.point(z, lerp(-phi0, phi0, k / 24), 0.006) for k in range(25)]
        fr.merge(tube(pts, frame_r, 4, frame_r * 0.8))
    for ph in list(rails_phi) + [phi0 * 0.985]:
        for sgn in (1, -1):
            pts = [body.point(z, sgn * ph, 0.006) for z in zs]
            fr.merge(tube(pts, frame_r * (1.25 if ph >= phi0 * 0.98 else 1.0), 4))
    for pts in extra_frames:
        fr.merge(tube(pts, frame_r, 4))
    m.add(frame_node, fr, FRAME)
    return body


def _cap(center, rx, ry, rz, keep, seg=20, rings=14):
    """Part of an ellipsoid: quads whose centre direction (phi round Y from +Z = forward, theta from the
    top) passes keep(theta, phi). Used for the helmet shell."""
    cx, cy, cz = center
    m = Mesh()
    for i in range(rings + 1):
        th = math.pi * i / rings
        for j in range(seg):
            ph = 2 * math.pi * j / seg
            m.verts.append((cx + rx * math.sin(th) * math.sin(ph), cy + ry * math.cos(th), cz + rz * math.sin(th) * math.cos(ph)))
    for i in range(rings):
        for j in range(seg):
            j2 = (j + 1) % seg
            th = math.pi * (i + 0.5) / rings
            ph = 2 * math.pi * (j + 0.5) / seg
            if keep(th, (ph + math.pi) % (2 * math.pi) - math.pi):
                m.faces.append((i * seg + j, (i + 1) * seg + j, (i + 1) * seg + j2, i * seg + j2))
    return m


def pilot(m, head, node='pilot', lean=0.0, vest=False, facing=1):
    """Seated airman, head centre 'head' (x, y, z), real proportions (head 16 x 22 x 20 cm, shoulders
    46 cm): lofted torso with sloping shoulders, neck, leather flying helmet with ear cups and chin strap,
    goggles pushed up on the brow with their strap, jacket collar, parachute harness, arms on the stick
    and throttle. facing -1 turns him round (rear gunner)."""
    hx, hy, hz = head
    m.node(node)
    if facing < 0:
        outer = m
        class _Turn:
            def node(self, *a, **k): return outer.node(*a, **k)
            def add(self, name, mesh, cls=SKIN, surf=None):
                return outer.add(name, mesh.transformed(lambda v: (2 * hx - v[0], v[1], 2 * hz - v[2])), cls, surf)
        m = _Turn()
    # head: skull + jaw (face forward = +z)
    m.add(node, ellipsoid((hx, hy, hz), 0.078, 0.1, 0.094, 24, 16), FACE)
    m.add(node, ellipsoid((hx, hy - 0.058, hz + 0.02), 0.06, 0.056, 0.068, 18, 10), FACE)
    m.add(node, ellipsoid((hx, hy - 0.012, hz + 0.086), 0.011, 0.02, 0.013, 8, 6), FACE)         # nose
    # helmet shell: over the crown, down the back to the nape, over the ears, open face
    def keep(th, ph):
        front = math.cos(ph)                      # 1 = forward
        lim = 1.05 + 0.85 * (1 - max(front, 0)) + 0.6 * max(-front, 0)   # brow high, sides/back low
        return th < lim and not (front > 0.55 and th > 0.95)
    m.add(node, _cap((hx, hy + 0.012, hz - 0.006), 0.086, 0.104, 0.1, keep), HELMET)
    for sd in (1, -1):    # ear cups (radio earphones under the leather)
        m.add(node, revolve([(-0.012, 0.0), (-0.012, 0.034), (0.008, 0.036), (0.016, 0.026), (0.018, 0.0)],
                            (hx + sd * 0.082, hy - 0.022, hz - 0.004), (sd, 0, 0), 14), HELMET)
        m.add(node, tube([(hx + sd * 0.08, hy - 0.05, hz + 0.01), (hx + sd * 0.058, hy - 0.1, hz + 0.045),
                          (hx, hy - 0.115, hz + 0.06)], 0.006, 5), HELMET)                     # chin strap
    # goggles pushed up on the helmet brow: two lens cups, bridge, elastic strap round the helmet
    gy, gz = hy + 0.07, hz + 0.062
    for sd in (1, -1):
        c = (hx + sd * 0.034, gy, gz)
        ax = (sd * 0.2, 0.8, 0.75)
        m.add(node, revolve([(-0.008, 0.0), (-0.008, 0.02), (0.004, 0.022), (0.011, 0.019)], c, ax, 14), PANEL)
        m.add(node, revolve([(0.0, 0.0), (0.0, 0.016), (0.012, 0.0)], c, ax, 14), GUNMETAL)
    strap = [(hx + 0.089 * math.sin(a), gy - 0.012 - 0.03 * (1 - math.cos(a)), hz + 0.004 + 0.101 * math.cos(a))
             for a in [math.pi * (k / 12 - 0.0) * 2 for k in range(13)]]
    m.add(node, tube(strap, 0.011, 4, 0.004, cap=False), SUIT)
    # neck and collar
    m.add(node, tube([(hx, hy - 0.08, hz - 0.012), (hx, hy - 0.2, hz - 0.03)], 0.05, 12), FACE)
    m.add(node, revolve([(0.0, 0.072), (0.035, 0.08), (0.075, 0.068)], (hx, hy - 0.225, hz - 0.03), (0, 1, 0.15), 18), SUIT)
    # torso: lofted along its height (local z up), mapped so x = across, y = front/back depth
    tz = hz - 0.035 - lean
    sy0 = hy - 0.235                              # shoulder line
    torso = Body([
        Section(-0.62, 0.0, 0.17, 0.12, 0.12, 2.6, 2.6),
        Section(-0.35, 0.0, 0.185, 0.125, 0.12, 2.8, 2.8),
        Section(-0.12, 0.0, 0.215, 0.12, 0.11, 3.0, 3.0),
        Section(-0.02, 0.0, 0.228, 0.11, 0.1, 3.2, 3.0),
        Section(0.035, 0.0, 0.2, 0.09, 0.085, 2.8, 2.6),
        Section(0.07, 0.0, 0.12, 0.07, 0.065, 2.2, 2.2),
        Section(0.085, 0.0, 0.06, 0.055, 0.055, 2.0, 2.0),
    ])
    t = loft(torso, rings=16, seg=22, cap0='fan', cap1=None)
    t = t.transformed(lambda v: (hx + v[0], sy0 + v[2], tz + v[1] - 0.005))
    m.add(node, t, SUIT)
    if vest:
        m.add(node, ellipsoid((hx, sy0 - 0.12, tz + 0.1), 0.18, 0.13, 0.05, 14, 8), HELMET)
    # parachute harness: straps over the shoulders and down the chest
    for sd in (1, -1):
        m.add(node, tube([(hx + sd * 0.11, sy0 - 0.3, tz + 0.118), (hx + sd * 0.12, sy0 - 0.06, tz + 0.11),
                          (hx + sd * 0.125, sy0 + 0.055, tz + 0.0), (hx + sd * 0.12, sy0 - 0.06, tz - 0.11)], 0.018, 4, 0.005), SEAT)
    # arms: shoulder -> elbow -> hand (right on the stick, left on the throttle)
    for sd in (1, -1):
        sh = (hx + sd * 0.205, sy0 - 0.03, tz - 0.01)
        el = (hx + sd * 0.235, sy0 - 0.27, tz + 0.15)
        ha = (hx + sd * 0.07, sy0 - 0.27, tz + 0.36) if sd < 0 else (hx + 0.25, sy0 - 0.17, tz + 0.33)
        m.add(node, ellipsoid(sh, 0.062, 0.06, 0.065, 12, 8), SUIT)
        m.add(node, tube([sh, el], 0.052, 10), SUIT)
        m.add(node, tube([el, ha], 0.043, 10), SUIT)
        m.add(node, ellipsoid(ha, 0.04, 0.034, 0.05, 10, 6), HELMET)     # leather gauntlet


def cockpit_fittings(m, za, zb, floor_y, sill_y, width, panel_z, node='interior', armour=None, revi=True,
                     seat_z=None):
    """Instrument panel, seat, stick, gunsight, head armour plate (armour=(z, y0, y1, half width))."""
    m.node(node)
    pz = panel_z
    m.add(node, box((0, sill_y - 0.07, pz), width * 0.8, 0.12, 0.02), PANEL)
    m.add(node, box((0, sill_y + 0.03, pz + 0.04), width * 0.85, 0.025, 0.07), INTERIOR)   # coaming
    if revi:
        m.add(node, box((0, sill_y + 0.09, pz + 0.02), 0.035, 0.05, 0.05), GUNMETAL)
    sz = seat_z if seat_z is not None else zb + 0.3
    m.add(node, box((0, floor_y + 0.18, sz), 0.2, 0.05, 0.2), SEAT)
    m.add(node, box((0, floor_y + 0.42, sz - 0.2), 0.2, 0.28, 0.035), SEAT)
    m.add(node, tube([(0, floor_y + 0.03, pz - 0.35), (0, floor_y + 0.3, pz - 0.28)], 0.016, 6), GUNMETAL)
    # side consoles
    for s in (1, -1):
        m.add(node, box((s * width * 0.8, sill_y - 0.2, 0.5 * (za + zb)), 0.04, 0.05, 0.5 * abs(za - zb) * 0.8), INTERIOR)
    if armour:
        z, y0, y1, hw = armour
        # curved-top armour plate behind the head
        pts = []
        prof = Mesh()
        n = 10
        verts = []
        for i in range(n + 1):
            a = math.pi * i / n
            verts.append((hw * math.cos(a), y1 - 0.09 + 0.09 * math.sin(a), z))
        verts.append((-hw, y0, z)); verts.append((hw, y0, z))
        # extrude the outline 1.5 cm
        top = [(x, y, z) for x, y, z in verts]
        bot = [(x, y, z - 0.015) for x, y, z in verts]
        L = len(top)
        prof.verts = top + bot
        prof.faces = [tuple(range(L)), tuple(reversed(range(L, 2 * L)))]
        for i in range(L):
            j = (i + 1) % L
            prof.faces.append((i, j, L + j, L + i))
        prof.fill_attr()
        m.add(node, prof, SEAT)


def propeller(m, idx, hub, spinner_len, spinner_r, radius, blades=3, chord=0.24, back=0.12, root_r=0.17,
              pitch_root=0.95, pitch_tip=0.32, paddle=False, spin_dir=1):
    """prop_<idx> node at 'hub' with spinner_<idx> (ogive) and blades_<idx>."""
    name = f'prop_{idx}'
    m.node(name, None, hub)
    hx, hy, hz = hub
    # spinner: ogive from the back plate to the tip, in the node frame converted to world positions
    prof = []
    n = 16
    for i in range(n + 1):
        t = i / n
        r = spinner_r * (1 - t ** 1.7) ** 0.62
        prof.append((-back + t * spinner_len, max(r, 0.0)))
    prof.insert(0, (-back - 0.03, spinner_r * 0.96))
    sp = revolve(prof, hub, (0, 0, 1), 28, cap0=True)
    m.node(f'spinner_{idx}', name)
    m.add(f'spinner_{idx}', sp, SPINNER)
    m.node(f'blades_{idx}', name)
    bl = Mesh()
    for k in range(blades):
        ang = 2 * math.pi * k / blades
        cfn = (lambda t: chord * (0.75 + 0.6 * math.sin(math.pi * min(1, t * 1.15)) - (0.45 * t ** 3 if not paddle else 0.1 * t ** 4)))
        tfn = (lambda t: spin_dir * lerp(pitch_root, pitch_tip, t ** 0.8))
        bl.merge(blade((hx, hy, hz), radius, root_r, cfn, tfn, 0.07, ang, 14, 8))
    m.add(f'blades_{idx}', bl, BLADE)


def exhaust_row(m, node, side, start, step, n, r=0.035, length=0.12, angle=0.5, cls=EXHAUST, stack=None):
    """n exhaust stubs from 'start' stepping by 'step' (vector), pointing out (side) and aft.
    Returns the stub tip positions (stain origins)."""
    tips = []
    for i in range(n):
        p = v_add(start, v_mul(step, i))
        d = v_norm((side * math.sin(angle) * 0.8, -0.1, -math.cos(angle)))
        a = v_add(p, v_mul(d, -0.02))
        b = v_add(p, v_mul(d, length))
        m.add(node, tube([a, b], r, 8, r * 0.7), cls)
        tips.append(b)
    return tips


def radiator(m, node, cx, top_y, z0, z1, hw, depth, flap=True):
    """Shallow under-wing / chin radiator bath: body + front grille."""
    st = [Section(z1 + 0.04, top_y - 0.02, hw * 0.92, 0.04, depth * 0.5, 2.0, 4.0, cx),
          Section(z1 - 0.05, top_y - depth * 0.4, hw, 0.03, depth * 0.6, 2.0, 5.0, cx),
          Section(lerp(z1, z0, 0.6), top_y - depth * 0.45, hw, 0.03, depth * 0.55, 2.0, 5.0, cx),
          Section(z0, top_y - 0.03, hw * 0.95, 0.02, 0.03, 2.0, 4.0, cx)]
    b = Body(st)
    m.add(node, loft(b, rings=10, seg=20, cap0='fan', cap1='fan'), SKIN)
    m.add(node, box((cx, top_y - depth * 0.42, z1 - 0.02), hw * 0.9, depth * 0.36, 0.01), GRILLE)


def gun_barrel(m, node, a, b, r=0.018, cls=GUNMETAL):
    m.add(node, tube([a, b], r, 8), cls)


def main_gear(m, side, attach, wheel_c, wheel_r, wheel_w, leg_r=0.045, name=None, door=None):
    """Oleo leg from 'attach' to the wheel centre (wheel axis along X) + optional door plate."""
    n = name or ('gear_left' if side > 0 else 'gear_right')
    m.node(n)
    m.add(n, tube([attach, v_add(wheel_c, (side * -0.08, 0.04, 0))], leg_r, 10), GEAR)
    m.add(n, wheel(v_add(wheel_c, (0, 0, 0)), wheel_r, wheel_w, (1, 0, 0), 22), TYRE)
    if door:
        m.add(n, door, GEAR)


def tail_wheel(m, attach, wheel_c, r=0.17, w=0.08):
    m.node('gear_tail')
    m.add('gear_tail', tube([attach, wheel_c], 0.03, 8), GEAR)
    m.add('gear_tail', wheel(wheel_c, r, w, (1, 0, 0), 16), TYRE)


def antenna(m, node, mast_base, mast_top, wire_end=None):
    m.add(node, tube([mast_base, mast_top], 0.012, 6, 0.006), SKIN)
    if wire_end:
        m.add(node, tube([mast_top, wire_end], 0.0035, 4), GUNMETAL)


# ---------------------------------------------------------------- lifting surfaces with control surfaces

def wing_half(m, side, root, span, dihedral_deg, chord, le, thick, camber, split_e, ail=(0.55, 0.95, 0.25),
              flap=(0.04, 0.5, 0.25), inner='part_wingL', outer='part_wingLtip', surf_in=None, surf_out=None,
              sweep_up=None, nspan=14):
    """One wing: inner panel (root..split_e) with its flap, outer panel with its aileron.
    side +1 = left (+X). Returns the Surface."""
    d = math.radians(dihedral_deg)
    sd = (side * math.cos(d), math.sin(d), 0.0)
    up = (-side * math.sin(d), math.cos(d), 0.0)
    s = Surface(root, span, sd, up, chord, le, thick, camber, sweep_up=sweep_up, flip=side < 0)
    sfx = 'L' if side > 0 else 'R'
    if side < 0:
        inner, outer = inner.replace('wingL', 'wingR'), outer.replace('wingL', 'wingR')
    m.node(inner, 'airframe', lod=True)
    m.node(outer, 'airframe', lod=True)
    f0, f1, fc = flap
    a0, a1, ac = ail
    # inner panel: full chord inboard of the flap, cut where the flap is, up to the part joint;
    # a flap running past the joint continues on the outer panel as a second flap section
    fi1 = min(f1, split_e)
    segs_in = ([(0.0, f0, 1.0)] if f0 > 0 else []) + [(f0, fi1, 1 - fc)]
    if fi1 < split_e:
        segs_in.append((fi1, split_e, 1.0))
    for e0, e1, c1 in segs_in:
        n = max(2, int(nspan * (e1 - e0) * 1.6))
        m.add(inner, panel(s, e0, e1, 0.0, c1, n, 16), SKIN, surf_in)
    segs_out = []
    lo = split_e
    if f1 > split_e:
        segs_out.append((split_e, f1, 1 - fc)); lo = f1
    if a0 > lo:
        segs_out.append((lo, a0, 1.0)); lo = a0
    segs_out.append((lo, a1, 1 - ac))
    for e0, e1, c1 in segs_out:
        n = max(2, int(nspan * (e1 - e0) * 1.6))
        m.add(outer, panel(s, e0, e1, 0.0, c1, n, 16), SKIN, surf_out)
    # rounded tip
    m.add(outer, panel(s, a1, 1.0, 0.0, 1.0, 10, 16, espace=tip_spacing), SKIN, surf_out)
    # control surfaces, hinged on their leading edge line
    ctl = [(f0, fi1, fc, inner, f'ctl_flap_{sfx}'), (lo, a1, ac, outer, f'ctl_aileron_{sfx}')]
    if f1 > split_e:
        ctl.append((split_e, f1, fc, outer, f'ctl_flap_{sfx}_outer'))
    for (e0, e1, cf, parent, nm) in ctl:
        h0, h1 = s.hinge(e0, 1 - cf), s.hinge(e1, 1 - cf)
        if side < 0:
            h0, h1 = h1, h0
        mid = v_mul(v_add(h0, h1), 0.5)
        m.node(nm, parent, mid, m.hinge_axes(h0, h1), lod=True)
        m.add(nm, panel(s, e0 + 0.002, e1 - 0.002, 1 - cf + GAP / s.chord(0.5 * (e0 + e1)), 1.0, max(3, int(nspan * (e1 - e0) * 1.6)), 8), SKIN,
              surf_out if parent == outer else surf_in)
    return s


def tailplane_half(m, side, root, span, dihedral_deg, chord, le, thick, elev_c, node='part_tail', surf=None, elev_e=(0.06, 1.0)):
    d = math.radians(dihedral_deg)
    sd = (side * math.cos(d), math.sin(d), 0.0)
    up = (-side * math.sin(d), math.cos(d), 0.0)
    s = Surface(root, span, sd, up, chord, le, thick, 0.0, flip=side < 0)
    sfx = 'L' if side > 0 else 'R'
    e0, e1 = elev_e
    if e0 > 0:
        m.add(node, panel(s, 0.0, e0, 0.0, 1.0, 2, 12), SKIN, surf)
    m.add(node, panel(s, e0, min(e1, 0.86), 0.0, 1 - elev_c, 8, 12), SKIN, surf)
    m.add(node, panel(s, min(e1, 0.86), 1.0, 0.0, 1 - elev_c, 6, 12, espace=tip_spacing), SKIN, surf)
    h0, h1 = s.hinge(e0, 1 - elev_c), s.hinge(1.0 - 1e-3, 1 - elev_c)
    if side < 0:
        h0, h1 = h1, h0
    nm = f'ctl_elevator_{sfx}'
    m.node(nm, node, v_mul(v_add(h0, h1), 0.5), m.hinge_axes(h0, h1), lod=True)
    m.add(nm, panel(s, e0 + 0.004, 1.0, 1 - elev_c + GAP / s.chord(0.5), 1.0, 10, 8, espace=tip_spacing), SKIN, surf)
    return s


def fin(m, root, span, chord, le, thick, rud_c, node='part_tail', surf=None, rud_e=(0.0, 1.0), name='ctl_rudder',
        x_side=0.0, cant=0.0):
    """Vertical fin + rudder; x_side offsets twin fins; rudder hinged about its LE line (local X = up)."""
    s = Surface(root, span, (math.sin(cant), 1, 0), (1, -math.sin(cant), 0), chord, le, thick, 0.0, flip=True)
    e0, e1 = rud_e
    if e0 > 0:
        m.add(node, panel(s, 0.0, e0, 0.0, 1.0, 3, 12), SKIN, surf)
    m.add(node, panel(s, e0, 0.82, 0.0, 1 - rud_c, 8, 12), SKIN, surf)
    m.add(node, panel(s, 0.82, 1.0, 0.0, 1 - rud_c, 6, 12, espace=tip_spacing), SKIN, surf)
    h0, h1 = s.hinge(e0, 1 - rud_c), s.hinge(0.999, 1 - rud_c)
    m.node(name, node, v_mul(v_add(h0, h1), 0.5), m.hinge_axes(h0, h1, (0, 0, 1)), lod=True)
    m.add(name, panel(s, e0 + 0.004, 1.0, 1 - rud_c + GAP / s.chord(0.5), 1.0, 10, 8, espace=tip_spacing), SKIN, surf)
    return s


def round_tip(chord, le, er, k=0.45):
    """Wrap chord/LE functions so the planform rounds off on an ellipse from span station er to the
    tip; the LE recedes by k of the chord lost (k=0.5: symmetric rounding)."""
    def c2(e):
        if e <= er:
            return chord(e)
        t = min(1.0, (e - er) / (1 - er))
        return max(0.03 * chord(er), chord(e) * math.sqrt(max(0.0, 1 - t * t)))
    def l2(e):
        if e <= er:
            return le(e)
        return le(e) + (chord(e) - c2(e)) * k
    return c2, l2


def annular_cowl(m, node, cx, cy, z_front, r_out, r_in, depth=0.35, fan=None, fan_blades=12, fan_r=None):
    """Open front of a radial / annular-radiator cowling: rolled lip from r_out in to r_in, a dark
    back wall 'depth' inside, and optionally a cooling fan node ('fan' = node name) spinning in it."""
    lip = [(-0.06, r_out * 0.995), (0.0, r_out * 0.985), (0.02, (r_out + r_in) * 0.5), (0.0, r_in * 1.01),
           (-0.08, r_in * 0.98), (-depth * 0.5, r_in * 0.9)]
    m.add(node, revolve(lip, (cx, cy, z_front), (0, 0, 1), 36), SKIN)
    wall = revolve([(-depth, r_in * 0.92), (-depth, 0.02)], (cx, cy, z_front), (0, 0, 1), 28)
    m.add(node, wall, GRILLE)
    if fan:
        fz = z_front - depth * 0.55
        m.node(fan, None, (cx, cy, fz))
        bl = Mesh()
        fr = fan_r or r_in * 0.86
        for k in range(fan_blades):
            a = 2 * math.pi * k / fan_blades
            c, s = math.cos(a), math.sin(a)
            p0 = (cx + c * fr * 0.35, cy + s * fr * 0.35, fz)
            p1 = (cx + c * fr, cy + s * fr, fz)
            bl.merge(tube([p0, p1], 0.035, 4, 0.006, up_hint=(0, 0, 1)))
        bl.merge(revolve([(-0.05, fr * 0.36), (0.03, fr * 0.36)], (cx, cy, fz), (0, 0, 1), 20, cap0=True, cap1=True))
        m.add(fan, bl, FANMETAL)


def annular_fan(m, node, centre, fr, blades=12):
    """Fw 190 cooling fan: 'blades' flat blades round a hub, its own node at 'centre' (spins about Z)."""
    cx, cy, fz = centre
    m.node(node, None, centre)
    bl = Mesh()
    for k in range(blades):
        a = 2 * math.pi * k / blades
        c, s = math.cos(a), math.sin(a)
        p0 = (cx + c * fr * 0.35, cy + s * fr * 0.35, fz)
        p1 = (cx + c * fr, cy + s * fr, fz)
        bl.merge(tube([p0, p1], 0.035, 4, 0.006, up_hint=(0, 0, 1)))
    bl.merge(revolve([(-0.05, fr * 0.36), (0.03, fr * 0.36)], (cx, cy, fz), (0, 0, 1), 20, cap0=True, cap1=True))
    m.add(node, bl, FANMETAL)
