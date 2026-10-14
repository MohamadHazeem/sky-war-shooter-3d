"""Messerschmitt Bf 110 G-2. Shape: the FlightGear Messerschmitt-BF110 model (GPL,
tools/convert_models/output/bf110.glb), checked against the FM 30-30 three-view (goal 05b silhouette gate);
parts, controls, paint and detail are ours. Frame as the game expects: props (+-2.352, -0.214, 2.402),
pilot eye (0, 0.65, 1.209), gunner eye (0, 0.521, 0.62 -> see markers), gun_rear MG 81Z at (0, 0.629, -1.463)
with muzzle_rear."""
from model import Model, Surf, SKIN, GUNMETAL, INTERIOR, LENS
import parts as P
import airframe as A
from fg import FG, Hinge


def build():
    m = Model('bf110')
    fg = FG('bf110', refine_edge=0.2)
    fs = Surf('body', lines_s=[3.0, 2.2, 1.4, 0.4, -0.6, -1.9, -2.8, -3.7, -4.6, -5.5, -6.4, -7.3],
              lines_t=[(0.8, -8.7, -1.9), (1.6, -8.7, 3.6), (2.4, -8.7, 3.6)],
              hatches=[(-3.5, -2.9, 1.2, 1.8), (2.4, 3.0, 0.9, 1.6)], axis_y=0.0)
    ws_in = Surf('lift', lines_s=[0.5, 1.2, 1.9, 2.4], lines_t=[0.1, 0.35, 0.65],
                 hatches=[(0.6, 1.1, 0.15, 0.3)], name='wing')
    ws_out = Surf('lift', lines_s=[3.0, 3.8, 4.6, 5.4, 6.2], lines_t=[0.1, 0.35, 0.65], name='wing')
    ts = Surf('lift', lines_s=[0.5, 1.1, 1.7], lines_t=[0.22, 0.5], name='tail')
    rs = Surf('lift', lines_s=[0.3, 0.7, 1.1], fabric=0.1, name='fabric')
    ns = Surf('body', lines_s=[1.9, 1.2, 0.4, -0.6], lines_t=[0.9, 2.0], axis_y=-0.21)

    hinges = []
    for s in (1, -1):
        sfx = 'L' if s > 0 else 'R'
        def hg(name, parent, a, b, **k):
            a2, b2 = (a, b) if s > 0 else ((-b[0], b[1], b[2]), (-a[0], a[1], a[2]))
            hinges.append(Hinge(f'{name}_{sfx}' if not name.endswith('_outer') else name.replace('_outer', f'_{sfx}_outer'),
                                parent.replace('L', sfx, 1) if parent.startswith('part_wing') else parent, a2, b2, **k))
        hg('ctl_aileron', 'part_wingLtip', (4.3, -0.05, -1.28), (7.9, 0.17, -0.86), depth=0.7)
        hg('ctl_flap', 'part_wingL', (0.66, -0.45, -1.8), (1.92, -0.4, -1.64), depth=0.8)
        hg('ctl_flap_outer', 'part_wingLtip', (2.88, -0.2, -1.62), (4.24, -0.1, -1.43), depth=0.7)
        hg('ctl_elevator', 'part_tail', (0.25, 0.48, -8.08), (2.08, 0.48, -8.0), depth=0.65, off=0.12)
        fx = s * 2.25
        hinges.append(Hinge(f'ctl_rudder_{sfx}', 'part_tail', (fx, -0.12, -7.95), (fx, 1.33, -7.95), depth=0.6,
                            rudder=True, off=0.12, box=((fx - 0.3, -0.3, -8.8), (fx + 0.3, 1.5, -7.6))))

    nac = [dict(name='part_engine1', x=(1.9, 2.8), y=(-1.05, 0.45), z=(-2.3, 2.3)),
           dict(name='part_engine2', x=(-2.8, -1.9), y=(-1.05, 0.45), z=(-2.3, 2.3))]
    A.assemble(m, fg.meshes['airframe'], dict(
        fus_split=-1.9, tail_z=-6.95, tail_half=0.22, fin=(0.12, -0.2), fins=[2.25, -2.25],
        wing=dict(root=0.6, joint=2.85, y=(-0.7, 0.35), z=(-2.6, 1.05), le=(0.6, 0.94, 7.8, 0.15), te=(0.6, -2.47, 7.8, -1.226)),
        nacelles=nac, hinges=hinges,
        surfs=dict(fus=fs, wing_in=ws_in, wing_out=ws_out, tail=ts, fin=ts, rudder=rs, nacelle=ns),
    ))
    A.add_simple(m, 'glass', fg.meshes['glass'], LENS)
    A.add_simple(m, 'interior', fg.meshes['interior'], INTERIOR)
    m.node('gun_rear', None, fg.origins['gun_rear'])
    A.add_simple(m, 'gun_rear', fg.meshes['gun_rear'], GUNMETAL)
    for nm, p in fg.markers.items():
        if nm == 'muzzle_rear':
            m.marker(nm, p, 'gun_rear')
        elif nm.startswith('muzzle_') or nm.startswith('eye_'):
            m.marker(nm, p)
    for nm, p in fg.markers.items():
        if nm.startswith('muzzle_') and nm != 'muzzle_rear':
            P.gun_barrel(m, 'part_fuselage', (p[0], p[1], p[2] - 0.25), p, 0.016)
    e = fg.markers['eye_pilot']
    P.pilot(m, (e[0], e[1] - 0.05, e[2] - 0.05))
    g = fg.markers['eye_gunner']
    P.pilot(m, (g[0], g[1] - 0.04, g[2] + 0.05), node='crew', facing=-1)

    for s, i in ((1, 1), (-1, 2)):
        P.propeller(m, i, fg.origins[f'prop_{i}'], 0.62, 0.31, 1.55, 3, chord=0.24, back=0.12, root_r=0.17, spin_dir=s)
        P.main_gear(m, s, (s * 2.352, -0.7, 0.2), (s * 2.352, -2.25, 0.3), 0.45, 0.2)
    P.tail_wheel(m, (0, 0.2, -7.3), (0, -0.35, -7.35), 0.18, 0.08)
    hubs = [fg.origins['prop_1'], fg.origins['prop_2']]
    m.info['exhausts'] = [(s * 2.352 + s * 0.3, -0.1, 1.2 - 0.17 * i) for s in (1, -1) for i in range(5)]
    m.info.update(
        scheme='7475m',
        yellow=[],
        band=None,
        spinner=dict(style='spiral', hubs=hubs, base='70'),
        crosses_fus=[(-3.55, 0.1, 0.78)],
        crosses_wing=[(5.3, -0.55, 1.15)],
        labels=[dict(text='2N', z=-2.72, y=0.08, h=0.42, color='22', gap=0.35),
                dict(text='E', z=-4.22, y=0.1, h=0.42, color='21'),
                dict(text='P', z=-4.6, y=0.1, h=0.42, color='22')],
        walkway=[(0.6, 1.8, -1.0, 0.8)],
        oil=[(2.352, -0.75, 1.2, 0.6), (-2.352, -0.75, 1.2, 0.6)], wear=0.9, seed=110,
        stain_len=1.6,
        ace=dict(kills=34, emblem=None, chevrons=False, band=(-6.2, -5.75, ['21'])),
        label='Bf 110 G-2',
    )
    return m
