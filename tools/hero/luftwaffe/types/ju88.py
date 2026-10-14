"""Junkers Ju 88 A-4 (own work from published dimensions: span 20.08 m, length 14.36 m, wing area
54.7 m2, Jumo 211 J with annular radiators). Frame anchored like the old model: props at
(+-2.79, -0.344, 2.926), pilot eye (0.2, 0.816, 1.754)."""
import math
from geom import Body, Section as S, loft, cockpit_tub, lerp, ellipsoid, tube, box, revolve, Mesh
from model import Model, Surf, SKIN, GRILLE, GUNMETAL, INTERIOR, LENS, FRAME
import parts as P


def nacelle(m, side, ns):
    cx = side * 2.78
    node = 'part_engine1' if side > 0 else 'part_engine2'
    m.node(node, 'airframe', lod=True)
    b = Body([S(2.62, -0.344, 0.655, 0.655, 0.655, 2, 2, cx), S(2.25, -0.34, 0.675, 0.675, 0.675, 2, 2, cx),
              S(1.0, -0.33, 0.60, 0.56, 0.66, 2.3, 2.3, cx), S(-0.4, -0.37, 0.52, 0.40, 0.62, 2.4, 2.3, cx),
              S(-2.0, -0.45, 0.42, 0.24, 0.55, 2.3, 2.3, cx), S(-3.3, -0.55, 0.2, 0.09, 0.3, 2.2, 2.2, cx),
              S(-3.7, -0.58, 0.04, 0.03, 0.06, 2, 2, cx)])
    m.add(node, loft(b, rings=30, seg=40, cap1=None), SKIN, ns)
    P.annular_cowl(m, node, cx, -0.344, 2.62, 0.655, 0.44, 0.3)
    tips = []
    for s in (1, -1):
        tips += P.exhaust_row(m, node, s, (cx + s * 0.6, 0.02, 1.95), (0, -0.003, -0.16), 6, 0.035, 0.1, 0.7)
    return tips


def build():
    m = Model('ju88')
    m.node('airframe')
    for n in ('part_fuselage', 'part_fuselage_aft', 'part_tail'):
        m.node(n, 'airframe', lod=True)
    fus = Body([
        S(3.88, 0.00, 0.03, 0.03, 0.03, 2, 2),
        S(3.65, 0.02, 0.42, 0.42, 0.40, 2.0, 2.0),
        S(3.10, 0.08, 0.66, 0.66, 0.60, 2.0, 2.1),
        S(2.30, 0.12, 0.76, 0.86, 0.72, 2.1, 2.3),
        S(1.50, 0.12, 0.78, 1.05, 0.76, 2.4, 2.3),
        S(0.60, 0.10, 0.76, 1.02, 0.78, 2.5, 2.3),
        S(-0.20, 0.08, 0.72, 0.80, 0.76, 2.4, 2.3),
        S(-1.30, 0.06, 0.64, 0.60, 0.72, 2.3, 2.3),
        S(-4.00, 0.12, 0.48, 0.46, 0.55, 2.2, 2.2),
        S(-7.00, 0.26, 0.30, 0.30, 0.32, 2.1, 2.1),
        S(-9.60, 0.45, 0.12, 0.13, 0.12, 2.0, 2.0),
        S(-10.45, 0.50, 0.02, 0.03, 0.03, 2.0, 2.0),
    ])
    # glazing: the stepped cockpit roof down to the sills, and the 'beetle's eye' nose wrapped down
    # to the chin (everything else of the forward fuselage is metal)
    roof, nose = (0.05, 2.62, 1.18), (2.62, 3.8, 2.25)
    split = -1.6
    fs = Surf('body', lines_s=[-0.05, -0.8, -1.6, -2.4, -3.2, -4.0, -4.8, -5.6, -6.4, -7.2, -8.0, -8.8, -9.6],
              lines_t=[(0.9, -10.4, 0.0), (1.7, -10.4, 3.8), (2.5, -10.4, 3.8), (1.6, 0.0, 2.6)],
              hatches=[(-3.9, -3.1, 1.0, 1.65), (-6.2, -5.7, 1.2, 1.7), (0.4, 1.4, 1.75, 2.3)], axis_y=0.1)
    m.add('part_fuselage', loft(fus, split, 3.88, rings=54, seg=56, cap0=None, opening=[roof, nose]), SKIN, fs)
    m.add('part_fuselage_aft', loft(fus, -10.45, split, rings=40, seg=56, cap1=None), SKIN, fs)
    for (za, zb, ph) in (roof, nose):
        m.add('glass', loft(fus, za, min(zb + 0.02, 3.86) if zb > 3 else zb + 0.02, rings=16, seg=28,
                            phi_range=(-ph, ph), grow=0.004), LENS)
    fr = Mesh()
    for z, ph in [(3.62, 2.25), (3.38, 2.25), (3.1, 2.25), (2.82, 2.25), (2.62, 2.25), (2.25, 1.18), (1.85, 1.18),
                  (1.45, 1.18), (1.05, 1.18), (0.62, 1.18), (0.07, 1.18)]:
        pts = [fus.point(z, lerp(-ph, ph, k / 30), 0.01) for k in range(31)]
        fr.merge(tube(pts, 0.016, 4))
    for (za, zb, ph), rails in ((roof, (0.0, 0.42, 0.82, 1.17)), (nose, (0.0, 0.55, 1.1, 1.65, 2.24))):
        zs = [lerp(za, zb, i / 24) for i in range(25)]
        for r in rails:
            for sg in ((1, -1) if r > 0 else (1,)):
                fr.merge(tube([fus.point(z, sg * r, 0.01) for z in zs], 0.016, 4))
    m.add('part_fuselage', fr, FRAME)
    m.add('interior', cockpit_tub(fus, roof[0] + 0.05, 2.7, 1.12, depth=0.62), INTERIOR)
    m.add('interior', cockpit_tub(fus, 2.6, 3.72, 2.2, depth=0.12, inset=0.03), INTERIOR)     # bomb-aimer's floor in the nose
    P.cockpit_fittings(m, 3.0, 0.4, floor_y=-0.35, sill_y=0.55, width=0.45, panel_z=2.65, armour=None, seat_z=1.45)
    P.pilot(m, (0.2, 0.76, 1.7))
    P.pilot(m, (-0.28, 0.45, 2.45), node='crew')
    P.pilot(m, (-0.05, 0.86, 0.75), node='crew', facing=-1)
    m.marker('eye_pilot', (0.2, 0.816, 1.754))
    # Bola gondola under the cockpit, offset to starboard, glazed at the back
    bola = Body([S(2.5, -0.62, 0.05, 0.05, 0.05, 2, 2, -0.18), S(2.25, -0.75, 0.28, 0.25, 0.22, 2.2, 3.0, -0.18),
                 S(1.2, -0.82, 0.32, 0.28, 0.3, 2.4, 3.5, -0.18), S(0.0, -0.82, 0.3, 0.28, 0.28, 2.4, 3.5, -0.18),
                 S(-0.55, -0.74, 0.22, 0.25, 0.18, 2.2, 3.0, -0.18)])
    m.add('part_fuselage', loft(bola, rings=20, seg=28, cap0='fan', cap1='fan'), SKIN, fs)
    m.add('part_fuselage', box((-0.18, -0.78, -0.56), 0.18, 0.12, 0.012), GRILLE)
    # guns: nose MG 81, twin rear MG 81 in the roof, the Bola's MG 81 (static; the Ju 88 is not a rear-gunner type in the game)
    for a, b in (((0.15, 0.45, 3.45), (0.15, 0.45, 3.95)), ((0.06, 1.05, 0.1), (0.06, 1.15, -0.5)),
                 ((-0.06, 1.05, 0.1), (-0.06, 1.15, -0.5)), ((-0.18, -0.8, -0.5), (-0.18, -0.85, -1.05))):
        P.gun_barrel(m, 'interior', a, b, 0.014)

    span = 9.4
    base_c = lambda e: 3.7 - 2.05 * e
    base_l = lambda e: math.tan(math.radians(2.5)) * e * span
    chord, le = P.round_tip(base_c, base_l, 0.93, 0.5)
    thick = lambda e: lerp(0.16, 0.11, e)
    ws_in = Surf('lift', lines_s=[0.5, 1.2, 3.0, 3.6], lines_t=[0.12, 0.4, 0.68], hatches=[(0.7, 1.2, 0.18, 0.34)], name='wing')
    ws_out = Surf('lift', lines_s=[4.3, 5.1, 5.9, 6.7, 7.5, 8.3], lines_t=[0.12, 0.4, 0.68], name='wing')
    ns = Surf('body', lines_s=[2.25, 1.6, 0.8, -0.2, -1.2, -2.2, -3.0], lines_t=[0.9, 1.8, 2.5], axis_y=-0.35, name='nacelle')
    tips = []
    for side in (1, -1):
        P.wing_half(m, side, (side * 0.62, -0.22, 1.3), span, 5.5, chord, le, thick, 0.02, split_e=0.4,
                    ail=(0.62, 0.95, 0.24), flap=(0.04, 0.6, 0.24), surf_in=ws_in, surf_out=ws_out)
        tips += nacelle(m, side, ns)
    m.info['exhausts'] = tips

    ts = Surf('lift', lines_s=[0.5, 1.2, 1.9, 2.5], lines_t=[0.25, 0.55], name='tail')
    tch, tle = P.round_tip(lambda e: 1.8 - 0.55 * e, lambda e: 0.3 * e, 0.78, 0.5)
    for side in (1, -1):
        P.tailplane_half(m, side, (side * 0.02, 0.5, -8.42), 3.05, 0.0, tch, tle, lambda e: 0.1, 0.36, surf=ts)
    fch, fle = P.round_tip(lambda e: 2.3 - 0.95 * e, lambda e: 0.95 * e ** 1.3, 0.66, 0.6)
    P.fin(m, (0, 0.3, -8.0), 2.1, fch, fle, lambda e: 0.1, 0.38, surf=ts)

    P.propeller(m, 1, (2.79, -0.344, 2.926), 0.75, 0.36, 1.72, 3, chord=0.27, back=0.15, root_r=0.2)
    P.propeller(m, 2, (-2.76, -0.344, 2.926), 0.75, 0.36, 1.72, 3, chord=0.27, back=0.15, root_r=0.2, spin_dir=-1)
    for side in (1, -1):
        P.main_gear(m, side, (side * 2.78, -0.75, 0.0), (side * 2.78, -2.45, 0.2), 0.55, 0.25)
    P.tail_wheel(m, (0, 0.3, -9.4), (0, -0.25, -9.45), 0.2, 0.09)

    m.info.update(
        scheme='7071',
        yellow=[],
        band=None,
        spinner=dict(style='plain', hubs=[(2.79, -0.344, 2.926), (-2.76, -0.344, 2.926)], base='70'),
        crosses_fus=[(-4.6, 0.15, 0.95)],
        crosses_wing=[(6.7, -0.1, 1.35)],
        labels=[dict(text='B3', z=-3.45, y=0.15, h=0.6, color='22', gap=0.35),
                dict(text='A', z=-5.65, y=0.2, h=0.6, color='21'),
                dict(text='H', z=-6.15, y=0.22, h=0.6, color='22')],
        walkway=[(0.6, 1.5, -0.5, 1.2)],
        oil=[(2.78, -0.95, 1.5, 0.8), (-2.78, -0.95, 1.5, 0.8)], wear=0.9, seed=88,
        stain_len=1.8,
        ace=dict(kills=21, emblem=None, chevrons=False, band=(-7.2, -6.75, ['21'])),
        label='Ju 88 A-4',
    )
    return m
