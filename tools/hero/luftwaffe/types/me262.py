"""Messerschmitt Me 262 A-1a (own work from published dimensions: span 12.65 m, length 10.6 m,
wing area 21.7 m2, outer-wing sweep 18.5 deg, Jumo 004 B nacelles). Frame anchored like the old
model: intake fans fan_1/fan_2 at (+-1.858, -0.86, 1.629), nozzles exhaust_left/right at z -2.63,
pilot eye ~ (0, 0.74, -0.85), four MK 108 in the nose."""
import math
from geom import Body, Section as S, loft, cockpit_tub, lerp, ellipsoid, tube, box, revolve, Mesh, wheel
from model import Model, Surf, SKIN, GRILLE, GUNMETAL, INTERIOR, FANMETAL, BURNT, EXHAUST, GEAR, TYRE
import parts as P


def nacelle(m, side, ns):
    cx, cy = side * 1.86, -0.86
    node = 'part_engine1' if side > 0 else 'part_engine2'
    m.node(node, 'airframe', lod=True)
    b = Body([S(1.80, cy, 0.40, 0.40, 0.40, 2, 2, cx), S(1.55, cy, 0.46, 0.46, 0.46, 2, 2, cx),
              S(0.80, cy + 0.02, 0.49, 0.50, 0.48, 2, 2, cx), S(-0.6, cy + 0.03, 0.47, 0.50, 0.45, 2, 2, cx),
              S(-1.9, cy + 0.02, 0.38, 0.40, 0.36, 2, 2, cx), S(-2.55, cy, 0.30, 0.30, 0.30, 2, 2, cx)])
    m.add(node, loft(b, rings=30, seg=36, cap0=None, cap1=None), SKIN, ns)
    # intake lip + dark duct, the Riedel starter bullet on the fan node (spins like the old fans)
    lip = [(-0.08, 0.40), (0.0, 0.392), (0.03, 0.36), (0.0, 0.33), (-0.15, 0.31), (-0.45, 0.30)]
    m.add(node, revolve(lip, (cx, cy, 1.80), (0, 0, 1), 32), SKIN, ns)
    m.add(node, revolve([(-0.45, 0.3), (-0.45, 0.02)], (cx, cy, 1.80), (0, 0, 1), 24), GRILLE)
    fan = 'fan_1' if side > 0 else 'fan_2'
    m.node(fan, None, (cx, cy, 1.629))
    bullet = revolve([(-0.1, 0.17), (0.0, 0.165), (0.08, 0.12), (0.13, 0.05), (0.15, 0.0)], (cx, cy, 1.629), (0, 0, 1), 20, cap0=True)
    m.add(fan, bullet, FANMETAL)
    vanes = Mesh()
    for k in range(6):
        a = 2 * math.pi * k / 6
        vanes.merge(tube([(cx + math.cos(a) * 0.16, cy + math.sin(a) * 0.16, 1.58), (cx + math.cos(a) * 0.29, cy + math.sin(a) * 0.29, 1.58)],
                         0.03, 4, 0.006, up_hint=(0, 0, 1)))
    m.add(fan, vanes, FANMETAL)
    # nozzle + the 'Zwiebel' (onion) exit cone
    noz = [(0.12, 0.30), (0.0, 0.29), (-0.18, 0.25), (-0.17, 0.22), (0.05, 0.25)]
    m.add(node, revolve(noz, (cx, cy, -2.55), (0, 0, 1), 28), BURNT)
    m.add(node, revolve([(0.15, 0.2), (-0.05, 0.16), (-0.22, 0.06), (-0.26, 0.0)], (cx, cy, -2.55), (0, 0, 1), 20, cap0=True), BURNT)
    m.marker('exhaust_left' if side > 0 else 'exhaust_right', (cx, cy + 0.007, -2.629))


def build():
    m = Model('me262')
    m.node('airframe')
    for n in ('part_fuselage', 'part_fuselage_aft', 'part_tail'):
        m.node(n, 'airframe', lod=True)
    # rounded-triangle section: wide flat-ish chine low down, a narrow rounded spine
    fus = Body([
        S(3.36, 0.12, 0.02, 0.02, 0.02, 2, 2),
        S(3.15, 0.11, 0.25, 0.25, 0.25, 2.0, 2.0),
        S(2.50, 0.06, 0.44, 0.42, 0.42, 1.8, 2.5),
        S(1.30, 0.00, 0.56, 0.56, 0.52, 1.6, 3.0),
        S(0.00, -0.06, 0.60, 0.62, 0.55, 1.55, 3.2),
        S(-1.00, -0.06, 0.585, 0.60, 0.55, 1.55, 3.2),
        S(-2.50, -0.01, 0.48, 0.50, 0.46, 1.6, 3.0),
        S(-4.50, 0.11, 0.30, 0.34, 0.30, 1.75, 2.6),
        S(-6.30, 0.30, 0.14, 0.18, 0.15, 2.0, 2.0),
        S(-7.10, 0.40, 0.04, 0.06, 0.05, 2.0, 2.0),
        S(-7.24, 0.42, 0.01, 0.02, 0.02, 2.0, 2.0),
    ])
    cut = (-1.55, -0.32, 0.72)
    split = -2.2
    fs = Surf('body', lines_s=[2.75, 2.05, 1.25, 0.45, -0.3, -1.6, -2.2, -2.9, -3.6, -4.3, -5.0, -5.7, -6.4],
              lines_t=[(0.9, -7.2, -1.4), (1.7, -7.2, 3.3), (2.5, -7.2, 3.3), (0.9, 0.0, 3.0)],
              hatches=[(1.6, 2.6, 0.25, 1.05), (-3.6, -3.0, 1.0, 1.6), (0.3, 1.2, 1.25, 1.85)], axis_y=0.0)
    m.add('part_fuselage', loft(fus, split, 3.36, rings=48, seg=48, cap0=None, opening=cut), SKIN, fs)
    m.add('part_fuselage_aft', loft(fus, -7.24, split, rings=34, seg=48, cap1=None), SKIN, fs)
    m.add('interior', cockpit_tub(fus, cut[0], cut[1], cut[2], depth=0.72), INTERIOR)
    # four MK 108: ports in the nose top, short barrels
    for s in (1, -1):
        sfx = 'left' if s > 0 else 'right'
        P.gun_barrel(m, 'part_fuselage', (s * 0.125, 0.25, 2.95), (s * 0.125, 0.254, 3.22), 0.022)
        P.gun_barrel(m, 'part_fuselage', (s * 0.307, 0.077, 2.7), (s * 0.307, 0.077, 2.94), 0.022)
        m.marker(f'muzzle_top_{sfx}', (s * 0.125, 0.254, 3.223))
        m.marker(f'muzzle_low_{sfx}', (s * 0.307, 0.077, 2.944))
    m.marker('eye_pilot', (0, 0.74, -0.851))

    can = [S(-0.18, 0.5, 0.30, 0.05, 0.1, 3.0, 2), S(-0.52, 0.5, 0.29, 0.36, 0.1, 3.0, 2),
           S(-0.95, 0.5, 0.285, 0.42, 0.1, 2.7, 2), S(-1.55, 0.5, 0.27, 0.38, 0.1, 2.5, 2),
           S(-2.05, 0.5, 0.22, 0.22, 0.1, 2.3, 2), S(-2.45, 0.5, 0.14, 0.03, 0.1, 2.2, 2)]
    P.canopy(m, can, 1.6, frames_z=[-0.52, -1.55, -1.95], rails_phi=[0.7], frame_r=0.016)
    P.cockpit_fittings(m, -0.32, -1.55, floor_y=-0.12, sill_y=0.5, width=0.34, panel_z=-0.38,
                       armour=(-1.62, 0.55, 0.98, 0.17), seat_z=-1.3)
    P.pilot(m, (0, 0.74, -0.92))
    P.antenna(m, 'part_fuselage_aft', (0, 0.48, -3.6), (0, 0.62, -3.62))

    # wing: straight TE, swept LE, low on the chine; nacelles slung under it
    span = 5.9
    base_c = lambda e: 2.75 - 1.65 * e
    base_l = lambda e: math.tan(math.radians(17.0)) * e * span - 0.25 * (1 - e) ** 3
    chord, le = P.round_tip(base_c, base_l, 0.93, 0.5)
    thick = lambda e: lerp(0.11, 0.09, e)
    ws_in = Surf('lift', lines_s=[0.4, 0.95, 1.4, 2.0, 2.55], lines_t=[0.12, 0.35, 0.65],
                 hatches=[(0.6, 1.0, 0.15, 0.3)], name='wing')
    ws_out = Surf('lift', lines_s=[2.95, 3.6, 4.2, 4.8, 5.3], lines_t=[(0.12, 2.6, 5.6), 0.35, 0.65], name='wing')
    ns = Surf('body', lines_s=[1.45, 0.95, 0.2, -0.6, -1.4, -2.1], lines_t=[1.5, 2.6], axis_y=-0.86, name='nacelle')
    for side in (1, -1):
        P.wing_half(m, side, (side * 0.45, -0.42, 1.25), span, 6.0, chord, le, thick, 0.015, split_e=0.42,
                    ail=(0.62, 0.95, 0.25), flap=(0.08, 0.58, 0.24), surf_in=ws_in, surf_out=ws_out)
        nacelle(m, side, ns)
    m.add('part_wingLtip', tube([(5.1, -0.0, 0.0), (5.1, -0.02, 0.5)], 0.008, 6), GUNMETAL)

    ts = Surf('lift', lines_s=[0.4, 0.9, 1.3], lines_t=[0.2, 0.5], name='tail')
    tch, tle = P.round_tip(lambda e: 1.2 - 0.45 * e, lambda e: math.tan(math.radians(22)) * e * 1.9, 0.82, 0.5)
    for side in (1, -1):
        P.tailplane_half(m, side, (side * 0.02, 0.62, -5.55), 1.95, 0.0, tch, tle, lambda e: 0.09, 0.34, surf=ts)
    fch, fle = P.round_tip(lambda e: 1.7 - 0.85 * e, lambda e: 0.95 * e ** 1.15, 0.72, 0.6)
    P.fin(m, (0, 0.32, -5.2), 1.42, fch, fle, lambda e: 0.09, 0.4, surf=ts)

    # tricycle undercarriage (hidden in flight)
    for side in (1, -1):
        P.main_gear(m, side, (side * 1.2, -0.45, 0.0), (side * 1.25, -1.85, 0.0), 0.42, 0.17)
    m.node('gear_nose')
    m.add('gear_nose', tube([(0, -0.5, 2.2), (0, -1.75, 2.35)], 0.05, 10), GEAR)
    m.add('gear_nose', wheel((0, -1.85, 2.35), 0.3, 0.13, (1, 0, 0), 18), TYRE)

    m.info.update(
        scheme='8182',
        yellow=[],
        band=(-4.95, -4.55, ['23', '24']),          # JG 7 red / blue band
        spinner=None,
        crosses_fus=[(-3.55, 0.12, 0.8)],
        crosses_wing=[(3.9, -0.95, 1.0)],
        number=dict(text='3', z=1.85, y=0.1, h=0.42, color='21', outline='22'),
        labels=[],
        fuel_triangle=(-1.95, -0.25), walkway=[(0.45, 1.0, -0.6, 0.6)],
        oil=[(1.86, -1.2, -0.5, 0.5), (-1.86, -1.2, -0.5, 0.5)], wear=0.8, seed=262,
        emblem_at=(1.15, 0.15, 0.32),
        exhausts=[], nose_soot=True,
        ace=dict(kills=42, emblem='heart', chevrons=True, band=(-4.95, -4.55, ['21', '23', '21'])),
        label='Me 262 A-1a',
    )
    return m
