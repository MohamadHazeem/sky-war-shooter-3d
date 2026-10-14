"""Messerschmitt Bf 110 G-2 (own work from published dimensions: span 16.25 m, length 12.07 m,
wing area 38.4 m2, DB 605 B, VDM 3-blade). Frame anchored like the old model: props at
(+-2.352, -0.214, 2.402), pilot eye (0, 0.65, 1.21), gunner eye (0, 0.62, -0.52), gun_rear MG 81Z at
(0, 0.629, -1.463) with muzzle_rear."""
import math
from geom import Body, Section as S, loft, cockpit_tub, lerp, ellipsoid, tube, box, revolve, Mesh
from model import Model, Surf, SKIN, GRILLE, GUNMETAL, INTERIOR, SEAT
import parts as P


def nacelle(m, side, ns):
    cx = side * 2.352
    node = 'part_engine1' if side > 0 else 'part_engine2'
    m.node(node, 'airframe', lod=True)
    b = Body([S(2.30, -0.214, 0.31, 0.31, 0.31, 2, 2, cx), S(1.95, -0.17, 0.41, 0.42, 0.5, 2.3, 2.2, cx),
              S(0.95, -0.12, 0.44, 0.42, 0.58, 2.5, 2.4, cx), S(-0.30, -0.15, 0.42, 0.33, 0.6, 2.5, 2.4, cx),
              S(-1.50, -0.25, 0.35, 0.20, 0.52, 2.4, 2.3, cx), S(-2.55, -0.34, 0.18, 0.08, 0.3, 2.2, 2.2, cx),
              S(-2.95, -0.37, 0.04, 0.03, 0.07, 2, 2, cx)])
    m.add(node, loft(b, rings=30, seg=36, cap1=None), SKIN, ns)
    m.add(node, ellipsoid((cx, -0.7, 1.45), 0.17, 0.11, 0.42, 14, 8), SKIN, ns)       # chin oil cooler
    m.add(node, box((cx, -0.7, 1.88), 0.12, 0.06, 0.01), GRILLE)
    out = side
    m.add(node, revolve([(-0.3, 0.06), (0.0, 0.07), (0.12, 0.075)], (cx + out * 0.43, -0.05, 0.9), (0, 0, 1), 12, cap0=True), SKIN, ns)
    tips = []
    for s in (1, -1):
        tips += P.exhaust_row(m, node, s, (cx + s * 0.42, 0.0, 1.85), (0, -0.003, -0.15), 6, 0.03, 0.09, 0.65)
    return tips


def build():
    m = Model('bf110')
    m.node('airframe')
    for n in ('part_fuselage', 'part_fuselage_aft', 'part_tail'):
        m.node(n, 'airframe', lod=True)
    fus = Body([
        S(3.86, 0.12, 0.02, 0.02, 0.02, 2, 2),
        S(3.62, 0.10, 0.29, 0.27, 0.33, 2.0, 2.0),
        S(3.00, 0.07, 0.44, 0.40, 0.52, 2.2, 2.2),
        S(2.00, 0.04, 0.51, 0.45, 0.62, 2.4, 2.3),
        S(0.50, 0.02, 0.52, 0.45, 0.66, 2.5, 2.4),
        S(-1.00, 0.02, 0.50, 0.44, 0.63, 2.5, 2.3),
        S(-2.40, 0.05, 0.42, 0.40, 0.52, 2.4, 2.2),
        S(-4.50, 0.12, 0.30, 0.30, 0.38, 2.2, 2.1),
        S(-6.60, 0.22, 0.18, 0.20, 0.22, 2.1, 2.0),
        S(-7.90, 0.30, 0.07, 0.09, 0.09, 2.0, 2.0),
        S(-8.20, 0.32, 0.015, 0.02, 0.02, 2.0, 2.0),
    ])
    cut = (-2.0, 1.92, 0.95)
    split = -2.45
    fs = Surf('body', lines_s=[3.3, 2.6, 1.95, 1.0, 0.0, -1.0, -2.45, -3.2, -3.95, -4.7, -5.45, -6.2, -6.95, -7.6],
              lines_t=[(0.8, -8.2, -1.9), (1.6, -8.2, 3.6), (2.4, -8.2, 3.6)],
              hatches=[(2.3, 3.2, 0.9, 1.6), (-3.6, -3.0, 1.05, 1.6)], axis_y=0.05)
    m.add('part_fuselage', loft(fus, split, 3.86, rings=50, seg=44, cap0=None, opening=cut), SKIN, fs)
    m.add('part_fuselage_aft', loft(fus, -8.2, split, rings=36, seg=44, cap1=None), SKIN, fs)
    m.add('interior', cockpit_tub(fus, cut[0], cut[1], cut[2], depth=0.7), INTERIOR)
    for s in (1, -1):
        sfx = 'left' if s > 0 else 'right'
        P.gun_barrel(m, 'part_fuselage', (s * 0.11, 0.231, 3.25), (s * 0.11, 0.231, 3.6), 0.012)
        P.gun_barrel(m, 'part_fuselage', (s * 0.216, 0.106, 3.1), (s * 0.216, 0.106, 3.45), 0.012)
        P.gun_barrel(m, 'part_fuselage', (s * 0.128, -0.457, 2.55), (s * 0.128, -0.457, 2.87), 0.02)
        m.marker(f'muzzle_mg_top_{sfx}', (s * 0.11, 0.231, 3.61))
        m.marker(f'muzzle_mg_low_{sfx}', (s * 0.216, 0.106, 3.46))
        m.marker(f'muzzle_cannon_{sfx}', (s * 0.128, -0.457, 2.88))
    m.add('part_fuselage', loft(Body([S(2.6, -0.5, 0.2, 0.05, 0.08, 2, 3), S(2.2, -0.52, 0.24, 0.05, 0.14, 2, 3.5),
                     S(0.9, -0.52, 0.24, 0.05, 0.13, 2, 3.5), S(0.4, -0.5, 0.18, 0.05, 0.05, 2, 3)]),
               rings=12, seg=20, cap0='fan', cap1='fan'), SKIN, fs)      # cannon tray under the cockpit
    m.marker('eye_pilot', (0, 0.65, 1.209))
    m.marker('eye_gunner', (0, 0.62, -0.521))

    # long glasshouse: windscreen, pilot's hood, fixed centre, gunner's folding hood
    can = [S(2.02, 0.40, 0.36, 0.05, 0.1, 3.4, 2), S(1.55, 0.40, 0.355, 0.44, 0.1, 3.6, 2),
           S(1.0, 0.40, 0.35, 0.50, 0.1, 4.0, 2), S(-0.5, 0.40, 0.35, 0.50, 0.1, 4.0, 2),
           S(-1.6, 0.40, 0.33, 0.45, 0.1, 3.6, 2), S(-2.05, 0.40, 0.27, 0.22, 0.1, 3.0, 2),
           S(-2.25, 0.40, 0.2, 0.03, 0.1, 2.6, 2)]
    P.canopy(m, can, 1.62, frames_z=[1.55, 1.0, 0.5, 0.05, -0.45, -0.95, -1.45, -1.9], rails_phi=[0.52, 1.08],
             frame_r=0.016)
    P.cockpit_fittings(m, 1.92, 0.6, floor_y=-0.25, sill_y=0.4, width=0.36, panel_z=1.82,
                       armour=None, seat_z=0.95)
    P.pilot(m, (0, 0.6, 1.16))
    P.pilot(m, (0, 0.56, -0.6), node='crew', facing=-1)
    # MG 81Z on its mount: rest pose aft (RearGunners swings gun_rear)
    m.node('gun_rear', None, (0, 0.629, -1.463))
    m.add('gun_rear', tube([(0.035, 0.66, -1.5), (0.035, 0.78, -2.15)], 0.016, 8), GUNMETAL)
    m.add('gun_rear', tube([(-0.035, 0.66, -1.5), (-0.035, 0.78, -2.15)], 0.016, 8), GUNMETAL)
    m.add('gun_rear', box((0, 0.64, -1.5), 0.07, 0.06, 0.16), GUNMETAL)
    m.marker('muzzle_rear', (0, 0.79, -2.2), 'gun_rear')

    # wing
    span = 7.72
    base_c = lambda e: 3.05 - 1.62 * e
    base_l = lambda e: math.tan(math.radians(5.0)) * e * span
    chord, le = P.round_tip(base_c, base_l, 0.94, 0.5)
    thick = lambda e: lerp(0.16, 0.11, e)
    ws_in = Surf('lift', lines_s=[0.5, 1.1, 2.6, 3.1], lines_t=[0.12, 0.4, 0.68], hatches=[(0.6, 1.0, 0.18, 0.34)], name='wing')
    ws_out = Surf('lift', lines_s=[3.7, 4.4, 5.1, 5.8, 6.5, 7.1], lines_t=[(0.12, 4.4, 7.6), 0.4, 0.68], name='wing')
    ns = Surf('body', lines_s=[1.95, 1.3, 0.6, -0.3, -1.3, -2.2], lines_t=[0.9, 1.8, 2.5], axis_y=-0.2, name='nacelle')
    tips = []
    for side in (1, -1):
        P.wing_half(m, side, (side * 0.42, -0.42, 1.68), span, 5.0, chord, le, thick, 0.02, split_e=0.4,
                    ail=(0.62, 0.95, 0.25), flap=(0.05, 0.58, 0.24), surf_in=ws_in, surf_out=ws_out)
        tips += nacelle(m, side, ns)
        outer = 'part_wingLtip' if side > 0 else 'part_wingRtip'
        P.radiator(m, outer, side * 3.75, -0.17, -0.25, 0.95, 0.3, 0.2)
    m.info['exhausts'] = tips

    ts = Surf('lift', lines_s=[0.5, 1.1, 1.7], lines_t=[0.25, 0.55], name='tail')
    tch = lambda e: 1.32 - 0.22 * e
    tle = lambda e: 0.12 * e
    for side in (1, -1):
        P.tailplane_half(m, side, (side * 0.02, 0.27, -6.92), 2.08, 0.0, tch, tle, lambda e: 0.1, 0.36, surf=ts)
        fch, fle = P.round_tip(lambda e: 1.28 - 0.1 * e, lambda e: 0.08 * e, 0.62, 0.55)
        P.fin(m, (side * 2.14, -0.36, -6.86), 1.42, fch, fle, lambda e: 0.1, 0.4, surf=ts,
              name='ctl_rudder_L' if side > 0 else 'ctl_rudder_R')

    P.propeller(m, 1, (2.352, -0.214, 2.402), 0.62, 0.31, 1.55, 3, chord=0.24, back=0.12, root_r=0.17)
    P.propeller(m, 2, (-2.352, -0.214, 2.402), 0.62, 0.31, 1.55, 3, chord=0.24, back=0.12, root_r=0.17, spin_dir=-1)
    for side in (1, -1):
        P.main_gear(m, side, (side * 2.352, -0.7, 0.2), (side * 2.352, -2.25, 0.3), 0.45, 0.2)
    P.tail_wheel(m, (0, 0.2, -7.3), (0, -0.35, -7.35), 0.18, 0.08)

    m.info.update(
        scheme='7475m',
        yellow=[],
        band=None,
        spinner=dict(style='spiral', hubs=[(2.352, -0.214, 2.402), (-2.352, -0.214, 2.402)], base='70'),
        crosses_fus=[(-3.55, 0.12, 0.8)],
        crosses_wing=[(5.3, 0.25, 1.15)],
        labels=[dict(text='2N', z=-2.72, y=0.12, h=0.42, color='22', gap=0.35),
                dict(text='E', z=-4.22, y=0.14, h=0.42, color='21'),
                dict(text='P', z=-4.6, y=0.15, h=0.42, color='22')],
        walkway=[(0.4, 1.1, 0.2, 1.4)],
        oil=[(2.352, -0.75, 1.2, 0.6), (-2.352, -0.75, 1.2, 0.6)], wear=0.9, seed=110,
        stain_len=1.6,
        ace=dict(kills=34, emblem=None, chevrons=False, band=(-6.2, -5.75, ['21'])),
        label='Bf 110 G-2',
    )
    return m
