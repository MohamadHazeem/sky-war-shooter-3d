"""Assembles the structural parts of a hero aircraft from its FlightGear shape (fg.py) according to a
per-type spec (types/<kind>.py): plane cuts at the part joints and hinge lines, then every face goes to
a node (docs/phase10/hero-parts.md), a paint class and a panel-line layout.

spec keys (game frame, metres):
  fus_split      z of the forward / aft fuselage joint
  tail_z         z aft of which everything is part_tail (fin, tailplanes, tail cone)
  tail_half      |x| of the tail cone: outboard of it in the tail region = tailplane
  fin            (half thickness |x|, base y): fin faces in the tail region; twin fins: 'fins' = [x, ...]
  wing           dict(root=|x|, joint=|x|, y=(y0, y1), z=(z0, z1)): wing faces outboard of root
  nacelles       [dict(name, x=(x0, x1), y=(y0, y1), z=(z0, z1))]  twins: part_engineN
  hinges         [fg.Hinge]  control surfaces (checked first)
  cls_mats       {source material name: paint class}; drop_mats: (names) removed
  cls_boxes      [((x0, y0, z0), (x1, y1, z1), cls)] paint class by region (after cls_mats; mirrored in x
                 when 'mirror' is True in the tuple's 4th slot)
  drop_boxes     [((x0, y0, z0), (x1, y1, z1))] faces removed (source details replaced by ours)
  surfs          dict(fus=, wing_in=, wing_out=, tail=, fin=, rudder=, nacelle=) model.Surf layouts
"""
import copy
import fg as F
from fg import Plane
from model import SKIN, LENS


def _inb(p, lo, hi):
    return all(lo[i] <= p[i] <= hi[i] for i in range(3))


def assemble(m, src, spec):
    """src: fg.Src of the FlightGear airframe. Creates the part / ctl nodes and adds their meshes."""
    bm = src.bm
    W = spec['wing']
    hinges = spec.get('hinges', [])
    nac = spec.get('nacelles', [])
    big = 30.0
    planes = [
        Plane((0, 0, spec['fus_split']), (0, 0, 1), ((-W['root'] - 0.4, -3, spec['fus_split'] - 0.5), (W['root'] + 0.4, 3, spec['fus_split'] + 0.5))),
        Plane((0, 0, spec['tail_z']), (0, 0, 1), ((-big, -big, spec['tail_z'] - 0.5), (big, big, spec['tail_z'] + 0.5))),
    ]
    wbox = lambda x0, x1: ((x0, W['y'][0], W['z'][0]), (x1, W['y'][1], W['z'][1]))
    for s in (1, -1):
        for x in (W['root'], W['joint']):
            planes.append(Plane((s * x, 0, 0), (1, 0, 0), wbox(s * x - 0.3, s * x + 0.3) if s > 0 else wbox(s * x - 0.3, s * x + 0.3)))
    for n in nac:
        for x in n['x']:
            planes.append(Plane((x, 0, 0), (1, 0, 0), ((x - 0.3, n['y'][0], n['z'][0]), (x + 0.3, n['y'][1], n['z'][1]))))
    for h in hinges:
        planes += h.planes()
    F.cut(bm, planes)

    # nodes
    m.node('airframe')
    for n in ('part_fuselage', 'part_fuselage_aft', 'part_tail', 'part_wingL', 'part_wingLtip', 'part_wingR', 'part_wingRtip'):
        m.node(n, 'airframe', lod=True)
    for n in nac:
        m.node(n['name'], 'airframe', lod=True)
    for h in hinges:
        m.node(h.name, h.parent, h.mid(), h.axes(), lod=True)

    drop_mats = set(spec.get('drop_mats', ()))
    cls_mats = spec.get('cls_mats', {})
    cls_boxes = spec.get('cls_boxes', [])
    drop_boxes = spec.get('drop_boxes', [])
    fin_half, fin_y = spec['fin']
    fins = spec.get('fins', [0.0])
    tail_half = spec['tail_half']

    def in_nacelle(c):
        for n in nac:
            if n['x'][0] <= c[0] <= n['x'][1] and n['y'][0] <= c[1] <= n['y'][1] and n['z'][0] <= c[2] <= n['z'][1]:
                return n['name']
        return None

    def lin(spec_, x):
        x0, z0, x1, z1 = spec_
        return z0 + (z1 - z0) * (x - x0) / (x1 - x0)

    def in_wing(c, n=(0, 1, 0)):
        # fuselage sides next to the root are not wing, however low they sit
        if abs(c[0]) < W['root'] + W.get('root_band', 0.35) and abs(n[0]) > 0.8:
            return False
        if not (abs(c[0]) > W['root'] and W['y'][0] <= c[1] <= W['y'][1] and W['z'][0] <= c[2] <= W['z'][1]):
            return False
        ax = abs(c[0])
        if 'le' in W and c[2] > lin(W['le'], ax) + 0.12:
            return False
        if 'te' in W and c[2] < lin(W['te'], ax) - 0.12:
            return False
        return True

    def is_fin(c):
        return any(abs(c[0] - fx) < fin_half for fx in fins) and c[1] > fin_y

    def region(c, n=(0, 1, 0)):
        """(node, surface group)"""
        for h in hinges:
            if h.contains(c):
                g = 'rudder' if h.rudder else ('elev' if h.parent == 'part_tail' else ('wing_out' if 'tip' in h.parent else 'wing_in'))
                return h.name, g
        nn = in_nacelle(c)
        if nn:
            return nn, 'nacelle'
        if c[2] < spec['tail_z']:
            if is_fin(c):
                return 'part_tail', 'fin'
            if abs(c[0]) > tail_half:
                return 'part_tail', 'tail'
            return 'part_tail', 'fus'
        if in_wing(c, n):
            side = 'L' if c[0] > 0 else 'R'
            if abs(c[0]) > W['joint']:
                return f'part_wing{side}tip', 'wing_out'
            return f'part_wing{side}', 'wing_in'
        return ('part_fuselage' if c[2] >= spec['fus_split'] else 'part_fuselage_aft'), 'fus'

    def classify(c, n, mat):
        if mat in drop_mats:
            return None
        for lo, hi in drop_boxes:
            if _inb(c, lo, hi):
                return None
        cls = cls_mats.get(mat, SKIN)
        for b in cls_boxes:
            lo, hi, k = b[:3]
            mir = len(b) > 3 and b[3]
            if _inb(c, lo, hi) or (mir and _inb((-c[0], c[1], c[2]), lo, hi)):
                cls = k
        ib = spec.get('interior')
        if ib and cls in ib[2] and _inb(c, ib[0], ib[1]):
            return 'interior', cls, 'none'
        node, grp = region(c, n)
        return node, cls, grp

    parts = F.split(src, classify)

    # surface-coordinate maps, measured on the classified faces
    pts = {}
    for (node, cls, grp), (V, Fc) in parts.items():
        side = None
        if grp in ('wing_in', 'wing_out') or (grp == 'tail') or grp == 'elev':
            side = 'L' if sum(v[0] for v in V) > 0 else 'R'
        key = (grp if grp not in ('wing_in', 'wing_out') else 'wing', side)
        if grp == 'rudder':
            key = ('fin', None)
        if grp == 'elev':
            key = ('tail', side)
        tris = [(V[f[0]], V[f[i]], V[f[i + 1]]) for f in Fc for i in range(1, len(f) - 1)]
        pts.setdefault(key, []).extend(tris)
        if grp == 'nacelle':
            pts.setdefault(('nacelle', node), []).extend(tris)
    import numpy as np
    maps = {}
    for key, P in pts.items():
        P = np.array(P)
        grp, side = key
        if grp == 'fus':
            maps[key] = F.BodyMap(P)
        elif grp == 'wing':
            sg = 1 if side == 'L' else -1
            maps[key] = F.LiftMap(P, (sg * W['root'], 0, 0), (sg, 0, 0))
        elif grp == 'tail':
            sg = 1 if side == 'L' else -1
            maps[key] = F.LiftMap(P, (sg * tail_half, 0, 0), (sg, 0, 0))
        elif grp == 'fin':
            maps[key] = F.LiftMap(P, (0, fin_y, 0), (0, 1, 0))
    for n in nac:
        P = np.array(pts.get(('nacelle', n['name']), [((0, 0, 0),) * 3]))
        cx = 0.5 * (n['x'][0] + n['x'][1])
        maps[('nacelle', n['name'])] = F.BodyMap(P, cx=cx, half=0.12)
    # twin fins: one map per fin
    if len(fins) > 1:
        allfin = np.array(pts.get(('fin', None), [((0, 0, 0),) * 3]))
        cxs = allfin[:, :, 0].mean(1)
        maps['fins'] = [F.LiftMap(allfin[np.abs(cxs - fx) < fin_half + 0.3], (fx, fin_y, 0), (0, 1, 0)) for fx in fins]

    S = spec['surfs']
    surf_copies = {}
    if any(k[0] == 'interior' for k in parts):
        m.node('interior')
    for (node, cls, grp), (V, Fc) in parts.items():
        if grp == 'none':
            m.add(node, F.to_mesh(V, Fc), cls)
            continue
        if grp == 'fus':
            mp, sf = maps[('fus', None)], S['fus']
        elif grp in ('wing_in', 'wing_out'):
            side = 'L' if sum(v[0] for v in V) > 0 else 'R'
            mp, sf = maps[('wing', side)], S[grp]
        elif grp in ('tail', 'elev'):
            side = 'L' if sum(v[0] for v in V) > 0 else 'R'
            mp, sf = maps[('tail', side)], S['tail']
        elif grp in ('fin', 'rudder'):
            if 'fins' in maps:
                cx = sum(v[0] for v in V) / len(V)
                mp = maps['fins'][min(range(len(fins)), key=lambda i: abs(fins[i] - cx))]
            else:
                mp = maps[('fin', None)]
            sf = S['rudder'] if grp == 'rudder' else S.get('fin', S['tail'])
        else:
            mp, sf = maps[('nacelle', node)], S.get('nacelle', S['fus'])
        mesh = F.to_mesh(V, Fc, mp if cls == SKIN else None)
        if cls == SKIN:
            # one Surf per (layout, map): the painter recomputes S / T per texel with the map
            key = (id(sf), id(mp))
            if key not in surf_copies:
                c = copy.copy(sf)
                c.sid, c.mapper = 0, mp
                surf_copies[key] = c
            sf = surf_copies[key]
        m.add(node, mesh, cls, sf if cls == SKIN else None)
    return parts


def add_simple(m, node, src, cls, keep=None, mapper=None, surf=None):
    """Adds a whole source mesh (e.g. glass) to node."""
    parts = F.split(src, lambda c, n, mat: (node, cls, 0) if (keep is None or keep(c, mat)) else None)
    for (nd, k, _), (V, Fc) in parts.items():
        m.add(nd, F.to_mesh(V, Fc, mapper), k, surf)
