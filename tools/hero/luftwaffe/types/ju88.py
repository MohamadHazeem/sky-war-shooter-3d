"""Junkers Ju 88 A-4. Shape: the FlightGear Ju-88 model (GPL, tools/convert_models/output/ju88.glb), checked
against the FM 30-30 Ju 88 A-6 three-view (goal 05b silhouette gate); parts, controls, paint and detail are
ours. Frame as the game expects: props (2.79 / -2.76, -0.344, 2.926), pilot eye (0.2, 0.816, 1.754)."""
from model import Model, Surf, SKIN, GUNMETAL, INTERIOR, LENS, GEAR, TYRE, GRILLE
import parts as P
import airframe as A
from fg import FG, Hinge


def build():
    m = Model('ju88')
    fg = FG('ju88', refine_edge=0.16)
    fs = Surf('body', lines_s=[2.6, 1.6, 0.6, -0.6, -1.7, -2.8, -3.9, -5.0, -6.1, -7.2, -8.3, -9.4],
              lines_t=[(0.8, -10.6, -0.6), (1.6, -10.6, 3.6), (2.4, -10.6, 3.6)],
              hatches=[(-5.4, -4.7, 1.2, 1.8)], axis_y=0.1)
    ws_in = Surf('lift', lines_s=[0.6, 1.4, 2.2, 3.0], lines_t=[0.1, 0.35, 0.65],
                 hatches=[(0.8, 1.4, 0.15, 0.3)], name='wing')
    ws_out = Surf('lift', lines_s=[3.6, 4.6, 5.6, 6.6, 7.6], lines_t=[0.1, 0.35, 0.65], name='wing')
    ts = Surf('lift', lines_s=[0.6, 1.4, 2.2], lines_t=[0.22, 0.5], name='tail')
    rs = Surf('lift', lines_s=[0.4, 0.9, 1.4], fabric=0.11, name='fabric')
    ns = Surf('body', lines_s=[2.4, 1.6, 0.6, -0.6, -1.8], lines_t=[0.9, 2.0], axis_y=-0.34)

    hinges = []
    for s in (1, -1):
        sfx = 'L' if s > 0 else 'R'
        def hg(name, parent, a, b, **k):
            a2, b2 = (a, b) if s > 0 else ((-b[0], b[1], b[2]), (-a[0], a[1], a[2]))
            hinges.append(Hinge(f'{name}_{sfx}' if not name.endswith('_outer') else name.replace('_outer', f'_{sfx}_outer'),
                                parent.replace('L', sfx, 1) if parent.startswith('part_wing') else parent, a2, b2, **k))
        hg('ctl_aileron', 'part_wingLtip', (6.0, 0.2, -1.75), (9.6, 0.62, -1.47), depth=0.8)
        hg('ctl_flap', 'part_wingL', (0.98, -0.25, -2.0), (2.0, -0.22, -2.0), depth=0.8)
        hg('ctl_flap_outer', 'part_wingLtip', (3.62, 0.0, -1.98), (5.92, 0.17, -1.85), depth=0.75)
        hg('ctl_elevator', 'part_tail', (0.3, 0.29, -9.0), (3.42, 0.29, -8.9), depth=0.6, off=0.14)
    hinges.append(Hinge('ctl_rudder', 'part_tail', (0, 0.42, -9.95), (0, 2.45, -9.8), depth=0.9, rudder=True, off=0.14))

    nac = [dict(name='part_engine1', x=(2.05, 3.5), y=(-1.1, 0.42), z=(-3.3, 3.0)),
           dict(name='part_engine2', x=(-3.5, -2.05), y=(-1.1, 0.42), z=(-3.3, 3.0))]
    A.assemble(m, fg.meshes['airframe'], dict(
        fus_split=-0.6, tail_z=-8.1, tail_half=0.25, fin=(0.15, 0.45),
        wing=dict(root=0.9, joint=3.58, y=(-0.55, 0.85), z=(-3.2, 1.0), le=(0.9, 0.81, 9.3, -0.46), te=(3.6, -2.63, 9.3, -1.886)),
        nacelles=nac, hinges=hinges,
        cls_mats={'tire': TYRE, 'DefaultWhite': GEAR, 'grey_2s': GRILLE},
        surfs=dict(fus=fs, wing_in=ws_in, wing_out=ws_out, tail=ts, fin=ts, rudder=rs, nacelle=ns),
    ))
    A.add_simple(m, 'glass', fg.meshes['glass'], LENS)
    for nm, p in fg.markers.items():
        if nm.startswith('muzzle_') or nm.startswith('eye_'):
            m.marker(nm, p)
    e = fg.markers['eye_pilot']
    P.cockpit_fittings(m, 2.7, 0.9, floor_y=0.0, sill_y=0.5, width=0.45, panel_z=2.25, revi=True, seat_z=1.5)
    P.pilot(m, (e[0], e[1] - 0.05, e[2] - 0.05))
    P.pilot(m, (-0.28, 0.45, 2.45), node='crew')
    P.pilot(m, (-0.05, 0.86, 0.75), node='crew', facing=-1)
    for s, i in ((1, 1), (-1, 2)):
        P.propeller(m, i, fg.origins[f'prop_{i}'], 0.75, 0.36, 1.72, 3, chord=0.27, back=0.15, root_r=0.2, spin_dir=s)
        P.main_gear(m, s, (s * 2.78, -0.75, 0.0), (s * 2.78, -2.45, 0.2), 0.55, 0.25)
    P.tail_wheel(m, (0, 0.3, -9.4), (0, -0.25, -9.45), 0.2, 0.09)
    hubs = [fg.origins['prop_1'], fg.origins['prop_2']]
    m.info['exhausts'] = [(h[0] + s * 0.42, h[1] + 0.25, 2.2 - 0.18 * i) for h, s in zip(hubs, (1, -1)) for i in range(5)]
    m.info.update(
        scheme='7071',
        yellow=[],
        band=None,
        spinner=dict(style='plain', hubs=hubs, base='70'),
        crosses_fus=[(-4.6, 0.12, 0.92)],
        crosses_wing=[(6.7, -0.75, 1.35)],
        labels=[dict(text='B3', z=-3.45, y=0.12, h=0.6, color='22', gap=0.35),
                dict(text='A', z=-5.65, y=0.15, h=0.6, color='21'),
                dict(text='H', z=-6.15, y=0.17, h=0.6, color='22')],
        walkway=[(0.9, 2.0, -1.5, 0.6)],
        oil=[(2.78, -0.95, 1.5, 0.8), (-2.78, -0.95, 1.5, 0.8)], wear=0.9, seed=88,
        stain_len=1.8,
        ace=dict(kills=21, emblem=None, chevrons=False, band=(-7.2, -6.75, ['21'])),
        label='Ju 88 A-4',
    )
    return m
