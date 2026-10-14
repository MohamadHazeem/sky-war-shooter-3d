"""Focke-Wulf Fw 190 A-8 (own work from published dimensions: span 10.506 m, length 8.95 m,
wing area 18.3 m2, BMW 801 D-2 cowl 1.29 m, VDM 3-blade 3.3 m). Frame anchored like the old model:
prop hub (0, -0.086, 1.979), cooling fan behind it, pilot eye ~ (0, 0.71, -1.59)."""
import math
from geom import Body, Section as S, loft, cockpit_tub, lerp, ellipsoid, tube, box, revolve
from model import Model, Surf, SKIN, GRILLE, GUNMETAL, INTERIOR
import parts as P


def build():
    m = Model('fw190')
    m.node('airframe')
    for n in ('part_fuselage', 'part_fuselage_aft', 'part_tail'):
        m.node(n, 'airframe', lod=True)
    fus = Body([
        S(2.02, -0.086, 0.645, 0.645, 0.645, 2.0, 2.0),
        S(1.55, -0.07, 0.665, 0.665, 0.665, 2.0, 2.0),
        S(0.80, -0.04, 0.635, 0.63, 0.68, 2.1, 2.1),
        S(0.15, -0.02, 0.56, 0.58, 0.70, 2.2, 2.2),
        S(-0.80, -0.02, 0.48, 0.52, 0.69, 2.3, 2.3),
        S(-1.60, -0.03, 0.445, 0.48, 0.66, 2.4, 2.3),
        S(-2.50, 0.01, 0.385, 0.42, 0.56, 2.3, 2.2),
        S(-4.00, 0.12, 0.255, 0.30, 0.37, 2.2, 2.1),
        S(-5.40, 0.25, 0.14, 0.20, 0.20, 2.1, 2.0),
        S(-6.15, 0.34, 0.05, 0.09, 0.07, 2.0, 2.0),
        S(-6.38, 0.37, 0.015, 0.03, 0.03, 2.0, 2.0),
    ])
    cut = (-2.05, -1.0, 0.95)
    split = -2.3
    fs = Surf('body', lines_s=[1.5, 1.0, 0.45, -0.25, -1.0, -2.3, -2.95, -3.6, -4.25, -4.9, -5.5],
              lines_t=[(0.8, -6.4, -2.2), (1.6, -6.4, 0.5), (2.4, -6.4, 2.1), (1.1, 0.5, 2.0), (2.0, 0.5, 2.0)],
              hatches=[(-3.1, -2.6, 1.2, 1.75), (-0.55, 0.05, 1.3, 1.95), (0.55, 1.35, 0.15, 0.8)], axis_y=0.0)
    m.add('part_fuselage', loft(fus, split, 2.02, rings=46, seg=48, cap0=None, cap1=None, opening=cut), SKIN, fs)
    m.add('part_fuselage_aft', loft(fus, -6.38, split, rings=34, seg=48, cap1=None), SKIN, fs)
    P.annular_cowl(m, 'part_fuselage', 0, -0.086, 2.02, 0.645, 0.5, 0.4, fan='cooling_fan', fan_blades=12)
    m.add('interior', cockpit_tub(fus, cut[0], cut[1], cut[2], depth=0.7), INTERIOR)
    # MG 131 humps ahead of the windscreen, cowl gun troughs
    for s in (1, -1):
        m.add('part_fuselage', ellipsoid((s * 0.17, 0.46, -0.65), 0.12, 0.09, 0.42, 14, 8), SKIN, fs)
        P.gun_barrel(m, 'part_fuselage', (s * 0.17, 0.56, 0.2), (s * 0.17, 0.555, 0.96), 0.015)
        m.marker(f"muzzle_cowl_{'left' if s > 0 else 'right'}", (s * 0.17, 0.555, 0.98))
    m.marker('eye_pilot', (0, 0.714, -1.588))
    # exhausts: two banks per side behind the cowl
    tips = []
    for s in (1, -1):
        tips += P.exhaust_row(m, 'part_fuselage', s, (s * 0.6, 0.12, 0.62), (0, -0.14, -0.02), 4, 0.04, 0.09, 0.9)
    m.info['exhausts'] = tips
    m.info['stain_len'] = 1.5
    m.info['stain_amt'] = 0.8

    can = [S(-0.72, 0.42, 0.35, 0.05, 0.1, 3.4, 2), S(-1.15, 0.42, 0.335, 0.45, 0.1, 3.0, 2),
           S(-1.55, 0.42, 0.33, 0.53, 0.1, 2.5, 2), S(-2.10, 0.42, 0.30, 0.47, 0.1, 2.4, 2),
           S(-2.60, 0.42, 0.24, 0.27, 0.1, 2.3, 2), S(-3.02, 0.42, 0.15, 0.03, 0.1, 2.2, 2)]
    P.canopy(m, can, 1.62, frames_z=[-1.15], rails_phi=[0.82], frame_r=0.016)
    P.cockpit_fittings(m, -1.0, -2.05, floor_y=-0.3, sill_y=0.42, width=0.36, panel_z=-1.05,
                       armour=(-2.12, 0.5, 0.92, 0.18), seat_z=-1.85)
    P.pilot(m, (0, 0.70, -1.65))
    P.antenna(m, 'part_fuselage_aft', (0, 0.41, -3.05), (0, 0.6, -3.1), (0, 1.15, -5.6))

    # wing: span 10.5 m, straight-tapered with rounded tips
    span = 4.95
    base_c = lambda e: 2.34 - 1.0 * e
    base_l = lambda e: math.tan(math.radians(4.5)) * e * span
    chord, le = P.round_tip(base_c, base_l, 0.88, 0.5)
    thick = lambda e: lerp(0.15, 0.10, e)
    ws_in = Surf('lift', lines_s=[0.45, 1.05, 1.7, 2.25], lines_t=[0.1, 0.38, 0.68],
                 hatches=[(0.6, 1.0, 0.15, 0.32), (1.35, 1.8, 0.45, 0.62)], name='wing')
    ws_out = Surf('lift', lines_s=[2.65, 3.2, 3.75, 4.3], lines_t=[0.1, 0.38, 0.68],
                  hatches=[(2.8, 3.3, 0.12, 0.3)], name='wing')
    for side in (1, -1):
        P.wing_half(m, side, (side * 0.3, -0.45, 0.62), span, 5.5, chord, le, thick, 0.02, split_e=0.46,
                    ail=(0.56, 0.93, 0.25), flap=(0.07, 0.5, 0.24), surf_in=ws_in, surf_out=ws_out)
        sfx = 'left' if side > 0 else 'right'
        inner = 'part_wingL' if side > 0 else 'part_wingR'
        outer = 'part_wingLtip' if side > 0 else 'part_wingRtip'
        P.gun_barrel(m, inner, (side * 0.95, -0.47, 0.3), (side * 0.95, -0.47, 0.72), 0.02)
        m.marker(f'muzzle_wingroot_{sfx}', (side * 0.95, -0.47, 0.74))
        P.gun_barrel(m, outer, (side * 2.3, -0.33, 0.25), (side * 2.3, -0.33, 0.45), 0.02)
        m.marker(f'muzzle_wingouter_{sfx}', (side * 2.3, -0.33, 0.47))
    m.add('part_wingLtip', tube([(4.3, -0.05, -0.1), (4.3, -0.08, 0.55)], 0.008, 6), GUNMETAL)

    ts = Surf('lift', lines_s=[0.4, 0.9, 1.35], lines_t=[0.22, 0.52], name='tail')
    rs = Surf('lift', lines_s=[0.3, 0.7], fabric=0.1, name='fabric')
    tch, tle = P.round_tip(lambda e: 1.05 - 0.3 * e, lambda e: 0.32 * e, 0.8, 0.5)
    for side in (1, -1):
        P.tailplane_half(m, side, (side * 0.02, 0.33, -5.2), 1.82, 0.0, tch, tle, lambda e: 0.1, 0.36, surf=ts)
    fch, fle = P.round_tip(lambda e: 1.42 - 0.62 * e, lambda e: 0.62 * e, 0.7, 0.55)
    P.fin(m, (0, 0.15, -4.85), 1.32, fch, fle, lambda e: 0.1, 0.42, surf=ts)

    P.propeller(m, 1, (0, -0.086, 1.979), 0.62, 0.36, 1.65, 3, chord=0.31, back=0.16, root_r=0.2, paddle=True)
    for side in (1, -1):
        P.main_gear(m, side, (side * 1.75, -0.55, 0.35), (side * 1.72, -2.0, 0.55), 0.35, 0.17)
    P.tail_wheel(m, (0, 0.15, -5.55), (0, -0.3, -5.6), 0.17, 0.08)

    m.info.update(
        scheme='7475',
        yellow=[('under_cowl', 2.05, 0.55)],
        band=(-4.0, -3.62, ['23']),                 # JG 1 red Defence-of-the-Reich band
        spinner=dict(style='spiral', hubs=[(0, -0.086, 1.979)], base='70'),
        crosses_fus=[(-3.05, 0.05, 0.82)],
        crosses_wing=[(3.35, -0.35, 1.05)],
        number=dict(text='8', z=-2.22, y=0.02, h=0.5, color='22', outline='21'),
        fuel_triangle=(-2.75, -0.38), walkway=[(0.3, 0.9, -0.2, 0.62)],
        oil=[(0.0, -0.65, 0.6, 0.7), (0.4, -0.55, 0.6, 0.5), (-0.4, -0.55, 0.6, 0.5)], wear=1.1, seed=190,
        emblem_at=(0.95, 0.1, 0.32),
        ace=dict(kills=62, emblem='spade', chevrons=True, spinner='white', band=(-4.0, -3.62, ['22', '21', '22'])),
        label='Fw 190 A-8',
    )
    return m
