"""fw190: CC BY 4.0 Sketchfab airframe, original period paint/crew/controls.
See ../sketchfab.py and assets-src/sketchfab/CREDITS.md. Frame: metres, +Z nose, +X left."""
from geom import tube
from model import (Model, Surf, SKIN, GRILLE, GUNMETAL, INTERIOR, PANEL, SEAT, EXHAUST, GEAR, LENS, FRAME)
import parts as P
import airframe as A
from fg import Hinge
from sketchfab import Sketchfab as FG


def build():
    m = Model('fw190')
    fg = FG('fw190', refine_edge=0.09)
    fs = Surf('body', lines_s=[1.45, 0.95, 0.45, -0.25, -1.0, -2.4, -2.95, -3.6, -4.25, -4.9, -5.5],
              lines_t=[(0.8, -6.4, -2.2), (1.6, -6.4, 0.5), (2.4, -6.4, 2.1), (1.1, 0.5, 2.0), (2.0, 0.5, 2.0)],
              hatches=[(-3.1, -2.6, 1.2, 1.75), (-0.55, 0.05, 1.3, 1.95), (0.55, 1.35, 0.15, 0.8)], axis_y=0.0)
    ws_in = Surf('lift', lines_s=[0.45, 1.05, 1.6], lines_t=[0.1, 0.38, 0.68],
                 hatches=[(0.6, 1.0, 0.15, 0.32), (1.2, 1.6, 0.45, 0.62)], name='wing')
    ws_out = Surf('lift', lines_s=[2.6, 3.15, 3.7, 4.2], lines_t=[0.1, 0.38, 0.68],
                  hatches=[(2.75, 3.25, 0.12, 0.3)], name='wing')
    ts = Surf('lift', lines_s=[0.4, 0.9, 1.35], lines_t=[0.22, 0.52], name='tail')
    rs = Surf('lift', lines_s=[0.3, 0.7, 1.1], fabric=0.1, name='fabric')

    hinges = []
    for s in (1, -1):
        sfx = 'L' if s > 0 else 'R'
        def hg(name, parent, a, b, **k):
            a2, b2 = (a, b) if s > 0 else ((-b[0], b[1], b[2]), (-a[0], a[1], a[2]))
            hinges.append(Hinge(f'{name}_{sfx}', parent.replace('L', sfx, 1) if parent.startswith('part_wing') else parent, a2, b2, **k))
        hg('ctl_aileron', 'part_wingLtip', (2.72, -0.30, -0.98), (4.78, -0.07, -0.86), depth=0.55)
        hg('ctl_flap', 'part_wingL', (0.95, -0.47, -1.15), (2.62, -0.35, -1.03), depth=0.6)
        hg('ctl_elevator', 'part_tail', (0.2, -.13, -5.10), (1.80, -.13, -5.12), depth=0.5, off=0.15)
    hinges.append(Hinge('ctl_rudder', 'part_tail', (0, -.4, -5.90), (0, 1.1, -5.45), depth=0.6, rudder=True, off=0.12))

    A.assemble(m, fg.meshes['airframe'], dict(
        nose_z=0.7, fus_split=-2.4, tail_z=-4.85, tail_half=0.18, fin=(0.15, 0.45),
        wing=dict(root=0.6, joint=2.68, y=(-.85, .20), z=(-1.75, 1.8)),
        hinges=hinges,
        cls_mats={'GunMat': GUNMETAL, 'lambert1': GUNMETAL, 'interiour': INTERIOR, 'metal': INTERIOR, 'misc': PANEL, 'panels': PANEL, 'misc.002': PANEL,
                  'misc.003': GRILLE, 'exhaust': EXHAUST, 'gear': GEAR, 'misc.004': SEAT},
        interior=((-0.5, -0.7, -3.2), (0.5, 0.95, -0.35), (INTERIOR, PANEL, SEAT)),
        surfs=dict(fus=fs, wing_in=ws_in, wing_out=ws_out, tail=ts, fin=ts, rudder=rs),
    ))
    A.add_simple(m, 'glass', fg.meshes['glass'], LENS)
    # The source hood has glass but no visible edge seals. Retain its shape and add slim frames.
    for edge in fg.meshes['glass'].bm.edges:
        if len(edge.link_faces) == 1 and max(v.co.z for v in edge.verts) < -.8:
            m.add('part_fuselage', tube([tuple(v.co) for v in edge.verts], .013, 6), FRAME)
    m.node('interior')
    A.add_simple(m, 'interior', fg.meshes['interior'], INTERIOR)

    # Original project fittings on the Sketchfab shape.
    P.annular_fan(m, 'cooling_fan', (0, -0.086, 1.637), 0.4, 12)
    for nm, p in fg.markers.items():
        if nm.startswith('muzzle_') or nm.startswith('eye_'):
            m.marker(nm, p)
    for s in (1, -1):
        sfx = 'left' if s > 0 else 'right'
        # Source FrontGun islands are removed with the parked details: restore
        # the two MG 131 barrels at the retained gameplay muzzle anchors.
        cowl = fg.markers[f'muzzle_cowl_{sfx}']
        P.gun_barrel(m, 'part_fuselage', (cowl[0], cowl[1], cowl[2] - .45), cowl, .025)
        mz = fg.markers[f'muzzle_wingroot_{sfx}']
        P.gun_barrel(m, 'part_wingL' if s > 0 else 'part_wingR', (mz[0], mz[1], mz[2] - 0.3), mz, 0.02)
        mz = fg.markers[f'muzzle_wingouter_{sfx}']
        P.gun_barrel(m, 'part_wingLtip' if s > 0 else 'part_wingRtip', (mz[0], mz[1], mz[2] - 0.18), mz, 0.02)
    m.info['exhausts'] = [(s * 0.6, y, 0.6) for s in (1, -1) for y in (-0.12, 0.0, 0.12, 0.24)]
    m.info['stain_len'] = 1.5
    m.info['stain_amt'] = 0.8
    P.pilot(m, (0, .46, -1.50))
    P.propeller(m, 1, fg.origins['prop_1'], 0.62, 0.36, 1.65, 3, chord=0.31, back=0.16, root_r=0.2, paddle=True)
    for side in (1, -1):
        P.main_gear(m, side, (side * 1.75, -0.55, 0.35), (side * 1.72, -2.0, 0.55), 0.35, 0.17)
    P.tail_wheel(m, (0, 0.15, -5.55), (0, -0.3, -5.6), 0.17, 0.08)

    m.info.update(
        scheme='7475',
        yellow=[('under_cowl', 1.75, 0.55)],
        band=(-4.0, -3.62, ['23']),                 # JG 1 red Defence-of-the-Reich band
        spinner=dict(style='spiral', hubs=[fg.origins['prop_1']], base='70'),
        crosses_fus=[(-3.05, 0.0, 0.8)],
        crosses_wing=[(3.35, -0.45, 1.0)],
        number=dict(text='8', z=-2.2, y=0.0, h=0.56, color='22', outline='21'),
        fuel_triangle=(-2.75, -0.38), walkway=[(0.6, 1.1, -1.2, 0.5)],
        oil=[(0.0, -0.65, 0.6, 0.7), (0.4, -0.55, 0.6, 0.5), (-0.4, -0.55, 0.6, 0.5)], wear=.65, mottle_soft=True, seed=190,
        emblem_at=(0.95, 0.1, 0.32),
        ace=dict(kills=62, emblem='spade', chevrons=True, spinner='white', band=(-4.0, -3.62, ['22', '21', '22'])),
        label='Fw 190 A-8',
    )
    return m
