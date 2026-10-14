"""Messerschmitt Bf 109 G-6 (own work from published dimensions: span 9.925 m, length 9.02 m,
wing area 16.05 m2, VDM 9-12087 prop 3.0 m). Frame anchored like the old model: prop hub at
(0, -0.02, 2.43), pilot eye ~ (0, 0.59, -1.0)."""
import math
from geom import Body, Section as S, loft, cockpit_tub, lerp, ellipsoid, tube, box, revolve, Mesh
from model import Model, Surf, SKIN, GRILLE, GUNMETAL, EXHAUST, INTERIOR, FRAME
import parts as P


def build():
    m = Model('bf109')
    m.node('airframe')
    for n in ('part_fuselage', 'part_fuselage_aft', 'part_tail'):
        m.node(n, 'airframe', lod=True)

    # ---------------- fuselage: z, cy, hw, ht, hb, nt, nb
    fus = Body([
        S(2.36, -0.02, 0.31, 0.31, 0.31, 2.0, 2.0),
        S(2.18, -0.01, 0.37, 0.39, 0.42, 2.1, 2.1),
        S(1.70, 0.02, 0.40, 0.45, 0.50, 2.3, 2.2),
        S(0.90, 0.03, 0.415, 0.47, 0.56, 2.5, 2.35),
        S(0.00, 0.00, 0.42, 0.47, 0.60, 2.6, 2.4),
        S(-0.55, -0.03, 0.42, 0.46, 0.60, 2.6, 2.4),
        S(-1.45, -0.05, 0.405, 0.45, 0.58, 2.6, 2.3),
        S(-2.20, -0.03, 0.355, 0.40, 0.50, 2.5, 2.2),
        S(-3.50, 0.05, 0.27, 0.31, 0.37, 2.3, 2.1),
        S(-4.80, 0.17, 0.175, 0.23, 0.23, 2.2, 2.0),
        S(-5.50, 0.27, 0.10, 0.16, 0.13, 2.1, 2.0),
        S(-5.88, 0.33, 0.025, 0.07, 0.04, 2.0, 2.0),
    ])
    cut = (-1.45, -0.52, 0.98)
    split = -1.75   # forward fuselage (engine + cockpit) / rear fuselage joint
    fs = Surf('body', lines_s=[2.18, 1.62, 0.95, 0.12, -0.52, -1.75, -2.35, -2.95, -3.55, -4.15, -4.75, -5.3],
              lines_t=[(0.75, -5.9, -1.5), (1.55, -5.9, 0.1), (2.35, -5.9, 2.2), (1.2, 0.1, 2.2)],
              hatches=[(-2.85, -2.25, 1.15, 1.75), (0.35, 0.95, 1.25, 1.9), (1.15, 1.6, 0.25, 0.95)], axis_y=0.0)
    m.add('part_fuselage', loft(fus, split, 2.36, rings=44, seg=44, cap0=None, opening=cut), SKIN, fs)
    m.add('part_fuselage_aft', loft(fus, -5.88, split, rings=34, seg=44, cap1=None), SKIN, fs)
    m.node('interior')
    m.add('interior', cockpit_tub(fus, cut[0], cut[1], cut[2], depth=0.62), INTERIOR)
    # Beulen (MG 131 breech bulges) ahead of the windscreen, chin oil cooler, supercharger intake
    for s in (1, -1):
        m.add('part_fuselage', ellipsoid((s * 0.215, 0.405, -0.02), 0.14, 0.1, 0.36, 16, 10), SKIN, fs)
    chin = Body([S(1.75, -0.48, 0.12, 0.05, 0.08, 2, 3), S(1.55, -0.52, 0.2, 0.05, 0.16, 2, 3.5),
                 S(1.0, -0.52, 0.21, 0.05, 0.17, 2, 3.5), S(0.55, -0.5, 0.17, 0.05, 0.08, 2, 3)])
    m.add('part_fuselage', loft(chin, rings=12, seg=20, cap0='fan', cap1='fan'), SKIN, fs)
    m.add('part_fuselage', box((0, -0.62, 1.53), 0.17, 0.11, 0.012), GRILLE)
    intake = revolve([(-0.25, 0.07), (0.0, 0.085), (0.18, 0.095), (0.2, 0.08)], (0.43, 0.05, 0.62), (0, 0, 1), 16, cap0=True)
    m.add('part_fuselage', intake, SKIN, fs)
    m.add('part_fuselage', box((0.43, 0.05, 0.815), 0.07, 0.07, 0.008), GRILLE)
    # cowl MG 131 troughs and barrels
    for s in (1, -1):
        P.gun_barrel(m, 'part_fuselage', (s * 0.12, 0.47, 0.55), (s * 0.12, 0.47, 1.18), 0.014)
        m.marker(f"muzzle_cowl_{'left' if s > 0 else 'right'}", (s * 0.12, 0.47, 1.2))
    m.marker('muzzle_hub', (0, -0.02, 3.08))
    m.marker('eye_pilot', (0, 0.6, -1.0))
    # exhaust stubs (6 per side, DB 605)
    tips = []
    for s in (1, -1):
        tips += P.exhaust_row(m, 'part_fuselage', s, (s * 0.405, 0.16, 1.62), (0, -0.004, -0.165), 6, 0.032, 0.1, 0.65)
    m.info['exhausts'] = tips

    # ---------------- canopy (G-6 framed hood) + windscreen, head armour, fittings, pilot
    # windscreen (sloped flat panes), hinged hood with a flat roof, fixed rear glazing down to the spine
    can = [S(-0.38, 0.27, 0.32, 0.05, 0.1, 5.0, 2), S(-0.52, 0.27, 0.31, 0.3, 0.1, 5.0, 2),
           S(-0.68, 0.27, 0.30, 0.47, 0.1, 5.5, 2), S(-1.05, 0.27, 0.295, 0.49, 0.1, 6.0, 2),
           S(-1.42, 0.27, 0.285, 0.47, 0.1, 5.5, 2), S(-1.70, 0.27, 0.25, 0.3, 0.1, 4.0, 2),
           S(-1.98, 0.27, 0.2, 0.06, 0.1, 3.0, 2)]
    P.canopy(m, can, 1.6, frames_z=[-0.68, -1.42, -1.71], rails_phi=[0.62], frame_r=0.016)
    P.cockpit_fittings(m, -0.52, -1.45, floor_y=-0.37, sill_y=0.25, width=0.33, panel_z=-0.58,
                       armour=(-1.52, 0.3, 0.78, 0.17), seat_z=-1.2)
    P.pilot(m, (0, 0.59, -1.05))
    P.antenna(m, 'part_fuselage_aft', (0, 0.33, -2.12), (0, 0.62, -2.2), (0, 1.25, -5.05))

    # ---------------- wing
    def chord(e):
        c = 2.02 - 0.88 * e
        return c * (math.sqrt(max(0.0, 1 - ((e - 0.84) / 0.16) ** 2)) if e > 0.84 else 1.0) + (0.02 if e < 1 else 0)
    def le(e):
        base = 0.11 * e * 4.78
        if e > 0.84:
            c84 = 2.02 - 0.88 * 0.84
            k = (e - 0.84) / 0.16
            base += c84 * (1 - math.sqrt(max(0.0, 1 - k * k))) * 0.45
        return base
    thick = lambda e: lerp(0.145, 0.11, e)
    ws_in = Surf('lift', lines_s=[0.35, 0.9, 1.45, 2.0], lines_t=[0.12, 0.42, 0.72],
                 hatches=[(0.55, 0.85, 0.2, 0.36), (1.2, 1.5, 0.48, 0.62)], name='wing')
    ws_out = Surf('lift', lines_s=[2.3, 2.85, 3.4, 3.95, 4.4], lines_t=[0.12, 0.42, 0.72], name='wing')
    for side in (1, -1):
        P.wing_half(m, side, (side * 0.18, -0.47, 0.16), 4.80, 6.5, chord, le, thick, 0.02, split_e=0.45,
                    ail=(0.53, 0.92, 0.24), flap=(0.05, 0.5, 0.26), surf_in=ws_in, surf_out=ws_out)
        # under-wing radiator bath
        nm = 'part_wingL' if side > 0 else 'part_wingR'
        P.radiator(m, nm, side * 1.25, -0.38, -1.0, -0.15, 0.24, 0.17)
        # wing MG 151/20 gondolas are not on the standard G-6: none
    m.marker('pitot', (2.9, -0.52, 0.2))
    m.add('part_wingLtip', tube([(3.9, -0.12, -0.35), (3.9, -0.15, 0.25)], 0.008, 6), GUNMETAL)

    # ---------------- tail
    ts = Surf('lift', lines_s=[0.35, 0.8, 1.2], lines_t=[0.2, 0.5], name='tail')
    rs = Surf('lift', lines_s=[0.25, 0.55, 0.85], lines_t=[], fabric=0.09, name='fabric')
    tch = lambda e: 0.98 - 0.36 * e
    tle = lambda e: 0.18 * e
    for side in (1, -1):
        P.tailplane_half(m, side, (side * 0.02, 0.36, -4.88), 1.55, 0.0, tch, tle, lambda e: 0.1, 0.38, surf=ts)
    fch, fle = P.round_tip(lambda e: 1.34 - 0.42 * e, lambda e: 0.42 * e ** 1.5, 0.62, 0.62)
    P.fin(m, (0, 0.18, -4.62), 1.22, fch, fle, lambda e: 0.1, 0.5, surf=ts, rud_e=(0.0, 1.0))

    # ---------------- propeller, gear
    P.propeller(m, 1, (0, -0.02, 2.43), 0.74, 0.31, 1.5, 3, chord=0.25, back=0.12, root_r=0.16)
    for side in (1, -1):
        P.main_gear(m, side, (side * 0.45, -0.55, -0.05), (side * 1.0, -1.85, 0.15), 0.33, 0.15)
    P.tail_wheel(m, (0, 0.12, -5.25), (0, -0.25, -5.3), 0.15, 0.07)

    # ---------------- paint / weathering layout
    m.info.update(
        scheme='7475',
        yellow=[('under_cowl', 1.95, 0.4)],        # RLM 04 under the cowling (z from .. to)
        band=None,
        spinner=dict(style='spiral', hubs=[(0, -0.02, 2.43)], base='70', spiral='21'),
        crosses_fus=[(-3.05, 0.05, 0.78)],         # fuselage Balkenkreuz centres (z, y, size)
        crosses_wing=[(3.25, -0.65, 0.95)],        # (|x|, z, size) on top and bottom
        number=dict(text='7', z=-2.3, y=0.06, h=0.55, color='04', outline='22'),
        bar=dict(z=-3.85, y=0.06, h=0.12, w=0.5, color='04'),
        fin_cross=None, fuel_triangle=(-1.95, -0.32), walkway=[(0.18, 0.75, 0.2, 0.65)],
        oil=[(0.0, -0.55, 1.8, 0.6)], wear=1.0, seed=109, emblem_at=(1.15, -0.12, 0.26),
        ace=dict(kills=48, emblem='heart', chevrons=True, rudder_white=False, spinner='white_spiral'),
        label='Bf 109 G-6',
    )
    return m
