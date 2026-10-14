"""Model assembly for the hero aircraft (pure Python): a tree of named nodes holding meshes in the
game frame, each mesh with a paint class (what it is made of) and an optional surface id (which
panel-line / decal layout the painter uses on it).

Node naming is the contract the game relies on (see docs/phase10/hero-parts.md):
  airframe/part_*            structural parts (LOD'ed: <name>_lod0/1, part_fuselage_lod2 = whole airframe)
  part_*/ctl_*               hinged control surfaces (rotate about local X)
  prop_N/spinner_N, blades_N  propeller (blades hidden while the disc shows)
  glass, pilot, crew, interior, gear_*, gun_rear/muzzle_rear, fan_N, eye_*, muzzle_*, exhaust_*
"""
from geom import Mesh, v_norm, v_cross, v_sub

# paint classes (painter colours them; skin = camouflage by position)
SKIN, INTERIOR, SUIT, FACE, HELMET, TYRE, GEAR, BLADE, SPINNER, EXHAUST, GUNMETAL, FRAME, PANEL, \
    GRILLE, SEAT, FANMETAL, BURNT, LENS = range(18)


class Surf:
    """Panel-line layout of one surface: body (s = station z, t = folded angle 0 top .. pi keel) or
    lift (s = metres along the span, t = chord fraction).
    lines_s / lines_t: [value] or [(value, lo, hi)] seams (limited to lo..hi of the other coordinate);
    hatches: [(s0, s1, t0, t1)] access panels; rivet: row spacing (m); fabric: rib-tape spacing (m) for
    fabric-covered control surfaces; axis_y: nominal body axis height (rivet spacing along frames)."""
    def __init__(self, kind, lines_s=(), lines_t=(), hatches=(), rivet=0.045, fabric=0.0, axis_y=0.0, name=''):
        self.kind, self.lines_s, self.lines_t, self.hatches = kind, list(lines_s), list(lines_t), list(hatches)
        self.rivet, self.fabric, self.axis_y, self.name = rivet, fabric, axis_y, name
        self.sid = 0


class Node:
    def __init__(self, name, parent, pos, axes, lod, material):
        self.name, self.parent, self.pos, self.axes, self.lod, self.material = name, parent, pos, axes, lod, material
        self.meshes = []   # [(Mesh, cls)]


class Model:
    def __init__(self, kind):
        self.kind = kind
        self.nodes = {}
        self.order = []
        self.surfs = [None]          # sid -> Surf (0 = none)
        self.info = {}               # free-form data for the painter (exhausts, markings...)

    def node(self, name, parent=None, pos=(0.0, 0.0, 0.0), axes=None, lod=False, material='skin'):
        """axes: (x_axis, y_axis) of the node's local frame in the game frame (z = x cross y)."""
        if name in self.nodes:
            return self.nodes[name]
        n = Node(name, parent, tuple(pos), axes, lod, material)
        self.nodes[name] = n
        self.order.append(name)
        return n

    def surf(self, s):
        if s.sid == 0:
            s.sid = len(self.surfs)
            self.surfs.append(s)
        return s

    def add(self, name, mesh, cls=SKIN, surf=None):
        m = Mesh(mesh.verts, mesh.faces, mesh.attr).fill_attr()
        if surf is not None:
            sid = self.surf(surf).sid
            m.attr = [(a[0], a[1], float(sid)) if a[2] else a for a in m.attr]
        else:
            m.attr = [(a[0], a[1], 0.0) for a in m.attr]
        if name not in self.nodes:
            self.node(name)
        self.nodes[name].meshes.append((m, cls))
        return m

    def marker(self, name, pos, parent=None):
        return self.node(name, parent, pos)

    def hinge_axes(self, a, b, up=(0, 1, 0)):
        """Local frame for a control surface hinged on the line a->b: local X along the hinge."""
        x = v_norm(v_sub(b, a))
        z = v_norm(v_cross(x, up))
        y = v_cross(z, x)
        return (x, y)
