"""Messerschmitt Me 262 A-1a. Shape: the FlightGear ME-262 model (GPL, tools/convert_models/output/me262.glb),
which is out of proportion (span 10.55 m, length 12.48 m): it is scaled to the published span 12.56 m
(x 1.19) and length 10.60 m (z 0.849) about its origin - only published dimensions, so the 1945 Journal of
Recognition three-view stays an independent check (goal 05b silhouette gate). Parts, controls, paint and
detail are ours. Every anchor (fans, muzzles, eye, exhausts) is scaled with the shape."""
import numpy as np
from geom import tube, wheel
from model import Model, Surf, SKIN, GUNMETAL, INTERIOR, LENS, GEAR, TYRE, FANMETAL, EXHAUST
import parts as P
import airframe as A
from fg import FG, Hinge
import fg as F

SX, SZ = 12.56 / 10.546, 10.60 / 12.481


def warp(V):
    V = np.array(V, np.float64)
    V[:, 0] *= SX
    V[:, 2] *= SZ
    return V


def W(p):
    """a point given in FlightGear (unscaled) coordinates"""
    return (p[0] * SX, p[1], p[2] * SZ)


def build():
    m = Model('me262')
    fg = FG('me262', warp=warp, refine_edge=0.15)
    fs = Surf('body', lines_s=[W((0, 0, z))[2] for z in (3.0, 2.0, 1.0, 0.0, -1.0, -2.4, -3.2, -4.0, -4.8, -5.6, -6.4)],
              lines_t=[(0.8, -7.5, 3.0), (1.6, -7.5, 3.0), (2.4, -7.5, 3.0)],
              hatches=[(W((0, 0, 2.6))[2], W((0, 0, 3.4))[2], 0.9, 1.6)], axis_y=0.0)
    ws_in = Surf('lift', lines_s=[0.5, 1.1, 1.9, 2.5], lines_t=[0.1, 0.35, 0.65], name='wing')
    ws_out = Surf('lift', lines_s=[3.0, 3.6, 4.2, 4.8], lines_t=[0.1, 0.35, 0.65], name='wing')
    ts = Surf('lift', lines_s=[0.4, 0.9, 1.3], lines_t=[0.2, 0.5], name='tail')
    rs = Surf('lift', lines_s=[0.3, 0.7], fabric=0.1, name='fabric')
    ns = Surf('body', lines_s=[W((0, 0, z))[2] for z in (1.2, 0.2, -0.8, -1.8)], lines_t=[0.9, 2.0], axis_y=-0.86)

    hinges = []
    for s in (1, -1):
        sfx = 'L' if s > 0 else 'R'
        def hg(name, parent, a, b, **k):
            a, b = W(a), W(b)
            a2, b2 = (a, b) if s > 0 else ((-b[0], b[1], b[2]), (-a[0], a[1], a[2]))
            hinges.append(Hinge(f'{name}_{sfx}', parent.replace('L', sfx, 1) if parent.startswith('part_wing') else parent, a2, b2, **k))
        hg('ctl_aileron', 'part_wingLtip', (3.02, -0.22, -1.66), (5.0, -0.05, -1.97), depth=0.6)
        hg('ctl_flap', 'part_wingL', (2.33, -0.31, -1.45), (2.92, -0.28, -1.55), depth=0.7)
        hg('ctl_elevator', 'part_tail', (0.3, 0.69, -7.06), (1.62, 0.69, -7.24), depth=0.55, off=0.12)
    hinges.append(Hinge('ctl_rudder', 'part_tail', W((0, 0.76, -7.55)), W((0, 1.94, -7.62)), depth=0.7, rudder=True, off=0.12))

    nac = []
    for s, nm in ((1, 'part_engine1'), (-1, 'part_engine2')):
        x0, x1 = sorted((s * 1.4 * SX, s * 2.32 * SX))
        nac.append(dict(name=nm, x=(x0, x1), y=(-1.35, -0.33), z=(W((0, 0, -2.8))[2], W((0, 0, 2.0))[2])))
    A.assemble(m, fg.meshes['airframe'], dict(
        fus_split=W((0, 0, -2.4))[2], tail_z=W((0, 0, -5.65))[2], tail_half=0.3 * SX, fin=(0.15, 0.45),
        wing=dict(root=0.72 * SX, joint=2.97 * SX, y=(-0.65, 0.1), z=(W((0, 0, -2.75))[2], W((0, 0, 1.0))[2]),
                  le=(1.2 * SX, 0.48 * SZ, 5.1 * SX, -1.233 * SZ), te=(1.2 * SX, -2.16 * SZ, 5.1 * SX, -2.27 * SZ)),
        nacelles=nac, hinges=hinges,
        surfs=dict(fus=fs, wing_in=ws_in, wing_out=ws_out, tail=ts, fin=ts, rudder=rs, nacelle=ns),
    ))
    A.add_simple(m, 'glass', fg.meshes['glass'], LENS)
    A.add_simple(m, 'interior', fg.meshes['interior'], INTERIOR)
    for nm in ('fan_1', 'fan_2'):
        m.node(nm, None, fg.origins[nm])
        A.add_simple(m, nm, fg.meshes[nm], FANMETAL)

    for nm, p in fg.markers.items():
        if nm.startswith('muzzle_') or nm.startswith('eye_') or nm.startswith('exhaust_'):
            m.marker(nm, p)
    for nm, p in fg.markers.items():
        if nm.startswith('muzzle_'):
            P.gun_barrel(m, 'part_fuselage', (p[0], p[1], p[2] - 0.22), p, 0.02)
    eye = fg.markers['eye_pilot']
    P.pilot(m, (eye[0], eye[1] - 0.01, eye[2] - 0.05))
    for side in (1, -1):
        P.main_gear(m, side, W((side * 1.2, -0.45, 0.0)), W((side * 1.25, -1.85, 0.0)), 0.42, 0.17)
    m.node('gear_nose')
    m.add('gear_nose', tube([W((0, -0.5, 2.6)), W((0, -1.75, 2.75))], 0.05, 10), GEAR)
    m.add('gear_nose', wheel(W((0, -1.85, 2.75)), 0.3, 0.13, (1, 0, 0), 18), TYRE)

    m.info.update(
        scheme='8182',
        yellow=[],
        band=(W((0, 0, -5.0))[2], W((0, 0, -4.55))[2], ['23', '24']),          # JG 7 red / blue band
        spinner=None,
        crosses_fus=[(W((0, 0, -3.6))[2], 0.05, 0.78)],
        crosses_wing=[(3.9 * SX, W((0, 0, -1.25))[2], 1.0)],
        number=dict(text='3', z=W((0, 0, 1.6))[2], y=0.0, h=0.42, color='21', outline='22'),
        labels=[],
        fuel_triangle=(W((0, 0, -2.05))[2], -0.25), walkway=[(0.72 * SX, 1.3, -1.6, 0.4)],
        oil=[(s * 1.86 * SX, -1.2, -2.2, 0.5) for s in (1, -1)], wear=0.8, seed=262,
        emblem_at=(W((0, 0, 1.0))[2], 0.12, 0.32),
        exhausts=[], nose_soot=True,
        ace=dict(kills=42, emblem='heart', chevrons=True, band=(W((0, 0, -5.0))[2], W((0, 0, -4.55))[2], ['21', '23', '21'])),
        label='Me 262 A-1a',
    )
    return m
