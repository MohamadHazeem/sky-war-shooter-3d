"""bf109: CC BY 4.0 Sketchfab airframe, original period paint/crew/controls.
See ../sketchfab.py and assets-src/sketchfab/CREDITS.md. Frame: metres, +Z nose, +X left."""
from model import Model, Surf, SKIN, GUNMETAL, INTERIOR, PANEL, LENS
import parts as P
import airframe as A
from fg import Hinge
from sketchfab import Sketchfab as FG
import fg as F


def build():
    m = Model('bf109')
    fg = FG('bf109', refine_edge=0.11)
    fs = Surf('body', lines_s=[2.18, 1.62, 0.95, 0.12, -0.52, -1.75, -2.35, -2.95, -3.55, -4.15, -4.75, -5.3],
              lines_t=[(0.75, -5.9, -1.5), (1.55, -5.9, 0.1), (2.35, -5.9, 2.2), (1.2, 0.1, 2.2)],
              hatches=[(-2.85, -2.25, 1.15, 1.75), (0.35, 0.95, 1.25, 1.9), (1.15, 1.6, 0.25, 0.95)], axis_y=0.0)
    ws_in = Surf('lift', lines_s=[0.35, 0.9, 1.45, 2.0], lines_t=[0.12, 0.42, 0.72],
                 hatches=[(0.55, 0.85, 0.2, 0.36), (1.2, 1.5, 0.48, 0.62)], name='wing')
    ws_out = Surf('lift', lines_s=[2.3, 2.85, 3.4, 3.95], lines_t=[0.12, 0.42, 0.72], name='wing')
    ts = Surf('lift', lines_s=[0.35, 0.8, 1.2], lines_t=[0.2, 0.5], name='tail')
    rs = Surf('lift', lines_s=[0.25, 0.55, 0.85], fabric=0.09, name='fabric')

    hinges = []
    for s in (1, -1):
        sfx = 'L' if s > 0 else 'R'
        def hg(name, parent, a, b, **k):
            a2, b2 = (a, b) if s > 0 else ((-b[0], b[1], b[2]), (-a[0], a[1], a[2]))
            hinges.append(Hinge(f'{name}_{sfx}', parent.replace('L', sfx, 1) if parent.startswith('part_wing') else parent, a2, b2, **k))
        hg('ctl_aileron', 'part_wingLtip', (2.7, 0.08, -0.70), (4.65, 0.20, -0.25), depth=0.5)
        hg('ctl_flap', 'part_wingL', (0.78, -0.12, -.95), (2.62, .07, -.70), depth=0.55)
        hg('ctl_elevator', 'part_tail', (0.24, .91, -4.96), (1.40, .91, -4.98), depth=0.5, off=0.12)
    hinges.append(Hinge('ctl_rudder', 'part_tail', (0, .35, -5.22), (0, 1.58, -5.08), depth=0.65, rudder=True, off=0.12))

    A.assemble(m, fg.meshes['airframe'], dict(
        nose_z=1.15, fus_split=-1.75, tail_z=-4.2, tail_half=0.2, fin=(0.15, 0.5),
        wing=dict(root=0.6, joint=2.66, y=(-.5, .6), z=(-1.7, 1.4)),
        hinges=hinges,
        surfs=dict(fus=fs, wing_in=ws_in, wing_out=ws_out, tail=ts, fin=ts, rudder=rs),
    ))
    A.add_simple(m, 'glass', fg.meshes['glass'], LENS)
    m.node('interior')
    P.cockpit_fittings(m, -.2, -1.1, -.05, .5, .28, -.12, seat_z=-.9)
    from geom import ellipsoid
    for side in (-1, 1):
        m.add('part_fuselage', ellipsoid((side*.29,.38,.65), .16,.16,.30), SKIN, fs)
    parts = F.split(fg.meshes['interior'], lambda c, n, mat: ('interior', PANEL if (mat == 'cockpit' and n[2] < -0.6 and c[2] > -0.65) else INTERIOR, 0))
    for (nd, k, _), (V, Fc) in parts.items():
        m.add(nd, F.to_mesh(V, Fc), k)

    for nm, p in fg.markers.items():
        if nm.startswith('muzzle_') or nm.startswith('eye_'):
            m.marker(nm, p)
    for s in (1, -1):
        mz = fg.markers[f"muzzle_cowl_{'left' if s > 0 else 'right'}"]
        P.gun_barrel(m, 'part_fuselage', (mz[0], mz[1], mz[2] - 0.5), mz, 0.014)
    m.info['exhausts'] = [(s * 0.43, 0.16 - 0.004 * i, 1.62 - 0.165 * i) for s in (1, -1) for i in range(6)]
    P.pilot(m, (0, .76, -.85))
    P.propeller(m, 1, fg.origins['prop_1'], 0.74, 0.31, 1.5, 3, chord=0.25, back=0.12, root_r=0.16)
    for side in (1, -1):
        P.main_gear(m, side, (side * 0.45, -0.55, -0.05), (side * 1.0, -1.85, 0.15), 0.33, 0.15)
    P.tail_wheel(m, (0, 0.12, -5.25), (0, -0.25, -5.3), 0.15, 0.07)

    m.info.update(
        scheme='7475',
        yellow=[('under_cowl', 1.95, 0.4)],        # RLM 04 under the cowling (z from .. to)
        band=(-3.95, -3.60, ['21']),
        spinner=dict(style='spiral', hubs=[fg.origins['prop_1']], base='70', spiral='21'),
        crosses_fus=[(-3.05, .55, 0.74)],          # fuselage Balkenkreuz centres (z, y, size)
        crosses_wing=[(3.25, -0.3, 0.9)],          # (|x|, z, size) on top and bottom
        number=dict(text='7', z=-2.3, y=.53, h=0.55, color='04', outline='22'),
        bar=dict(z=-3.4, y=.55, h=0.12, w=0.5, color='04'),
        fin_cross=None, fuel_triangle=(-1.95, -0.3), walkway=[(0.6, 1.05, -0.4, 0.5)],
        oil=[(0.0, -0.55, 1.8, 0.6)], wear=.65, mottle_soft=True, seed=109, emblem_at=(1.15, -0.05, 0.26),
        ace=dict(kills=48, emblem='heart', chevrons=True, rudder_white=False, spinner='white_spiral'),
        label='Bf 109 G-6',
    )
    return m
