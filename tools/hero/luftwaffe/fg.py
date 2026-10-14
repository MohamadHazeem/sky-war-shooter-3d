"""FlightGear shape base for the hero aircraft (runs inside Blender, goal 05b).

The airframe surfaces come from the converted FlightGear model (tools/convert_models/output/<kind>.glb,
GPL-2.0-or-later, see public/models/CREDITS.md): it has the right proportions, which the from-scratch
lofts of goal 05 did not. This module imports it, welds its loose panels, cuts it with planes into the
named structural parts and hinged control surfaces of docs/phase10/hero-parts.md, classifies the faces
into paint classes, and gives every vertex the surface coordinates the painter lays panel lines with
(body: station z + angle round the fuselage axis; lift: metres along the span + chord fraction from the
leading edge, measured on the FlightGear surface itself). The FlightGear textures are not used: UVs,
bakes, paint, decals and LODs are ours (build.py, paint.py).

All coordinates here are the game frame (x left wing, y up, z nose, metres), like model.py.
"""
import math, os
import bpy, bmesh
import numpy as np
from mathutils import Vector
from geom import Mesh

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../..'))
SRC = os.path.join(REPO, 'tools/convert_models/output')


def _game(v):
    """Blender (x, y back, z up) -> game (x, y up, z nose)"""
    return (v[0], v[2], -v[1])


class FG:
    """The FlightGear model's meshes by node name ('airframe', 'glass', 'prop_1', ...) as bmeshes in the
    game frame, plus its markers. warp(np.ndarray (n, 3)) -> (n, 3) corrects a source that is out of
    proportion (Me 262)."""

    def __init__(self, kind, warp=None, weld=0.0012, refine_edge=0.0):
        self.kind = kind
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, f'{kind}.glb'))
        new = [o for o in bpy.data.objects if o not in before]
        bpy.context.view_layer.update()
        self.meshes, self.markers, self.origins = {}, {}, {}
        for o in new:
            if o.type != 'MESH':
                p = _game(o.matrix_world.translation)
                if warp:
                    p = tuple(warp(np.array([p]))[0])
                self.markers[o.name] = p
                continue
            me = o.data
            M = o.matrix_world
            org = _game(M.translation)
            self.origins[o.name.split('.')[0]] = tuple(warp(np.array([org]))[0]) if warp else org
            V = np.array([_game(M @ v.co) for v in me.vertices], np.float64)
            if warp is not None and len(V):
                V = warp(V)
            F = [tuple(p.vertices) for p in me.polygons]
            mats = [me.materials[p.material_index].name if me.materials else '' for p in me.polygons]
            name = o.name.split('.')[0]
            self.meshes[name] = self._bm(V, F, mats, weld)
            if name == 'airframe':
                cull_hidden(self.meshes[name])
                if refine_edge > 0:
                    refine(self.meshes[name], refine_edge)
        for o in new:
            bpy.data.objects.remove(o, do_unlink=True)
        for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.textures):
            for d in list(coll):
                if d.users == 0:
                    coll.remove(d)

    @staticmethod
    def _bm(V, F, mats, weld):
        bm = bmesh.new()
        vs = [bm.verts.new(tuple(p)) for p in V]
        lay = bm.faces.layers.int.new('mat')
        names = sorted(set(mats))
        for f, mn in zip(F, mats):
            try:
                face = bm.faces.new([vs[i] for i in f])
            except ValueError:      # duplicate face (double-sided copies in the source)
                continue
            face[lay] = names.index(mn)
        bm.verts.ensure_lookup_table()
        if weld > 0:
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld)
        # double-sided copies collapse onto the same vertices after welding: keep one
        seen = set()
        dup = []
        for f in bm.faces:
            key = frozenset(v.index for v in f.verts)
            if key in seen:
                dup.append(f)
            seen.add(key)
        if dup:
            bmesh.ops.delete(bm, geom=dup, context='FACES_ONLY')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        return Src(bm, names)


class Src:
    """a bmesh (game frame) and the names of its per-face 'mat' indices"""
    def __init__(self, bm, mats):
        self.bm, self.mats = bm, mats


# ---------------------------------------------------------------- cutting

class Plane:
    """Cutting plane through co with normal no; 'box' = ((x0, y0, z0), (x1, y1, z1)) limits the faces it
    cuts (game frame), so a hinge line does not slice the whole aircraft."""
    def __init__(self, co, no, box=None):
        self.co, self.no, self.box = Vector(co), Vector(no).normalized(), box

    def side(self, p):
        return (Vector(p) - self.co).dot(self.no)


def _in_box(p, box, pad=0.05):
    (x0, y0, z0), (x1, y1, z1) = box
    return x0 - pad <= p[0] <= x1 + pad and y0 - pad <= p[1] <= y1 + pad and z0 - pad <= p[2] <= z1 + pad


def cut(bm, planes):
    for pl in planes:
        if pl.box is not None:
            faces = [f for f in bm.faces if any(_in_box(v.co, pl.box) for v in f.verts)]
        else:
            faces = list(bm.faces)
        if not faces:
            continue
        edges = list({e for f in faces for e in f.edges})
        verts = list({v for f in faces for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=faces + edges + verts, dist=1e-5, plane_co=pl.co, plane_no=pl.no)


class Hinge:
    """A control surface: the region aft of the hinge line a->b (game frame) between the planes through
    a and b square to the hinge, no deeper than 'depth' from it and inside 'box'. a->b runs towards +x
    for wings and tailplanes (local X of the node, like parts.wing_half) and upwards for rudders."""
    def __init__(self, name, parent, a, b, aft=(0, 0, -1), depth=0.9, box=None, rudder=False, off=0.3):
        self.name, self.parent, self.off = name, parent, off
        self.a, self.b = Vector(a), Vector(b)
        self.dir = (self.b - self.a).normalized()
        aft = Vector(aft)
        self.n = (aft - self.dir * aft.dot(self.dir)).normalized()      # in the chord plane, square to the hinge
        self.depth, self.rudder = depth, rudder
        lo = [min(self.a[i], self.b[i]) for i in range(3)]
        hi = [max(self.a[i], self.b[i]) for i in range(3)]
        span_pad = 0.6
        self.box = box or ((lo[0] - span_pad if not rudder else -0.6, lo[1] - 0.6, lo[2] - depth - 0.5),
                           (hi[0] + span_pad if not rudder else 0.6, hi[1] + 0.6, hi[2] + 0.3))

    def planes(self):
        return [Plane(self.a, self.n, self.box), Plane(self.a, self.dir, self.box), Plane(self.b, self.dir, self.box)]

    def contains(self, p):
        r = Vector(p) - self.a
        t = r.dot(self.dir)
        L = (self.b - self.a).length
        d = r.dot(self.n)
        # distance off the chord plane (thickness direction)
        off = (r - self.dir * t - self.n * d).length
        return 0.0 <= t <= L and 0.0 < d <= self.depth and off < self.off and _in_box(p, self.box, 0.0)

    def axes(self):
        """node frame like Model.hinge_axes: local X along the hinge"""
        up = (0, 0, 1) if self.rudder else (0, 1, 0)
        x = self.dir
        z = x.cross(Vector(up)).normalized()
        y = z.cross(x)
        return (tuple(x), tuple(y))

    def mid(self):
        return tuple((self.a + self.b) * 0.5)


# ---------------------------------------------------------------- surface coordinates for the painter

def slice_tris(T, d):
    """points where the triangle edges (T: (n, 3, 3)) cross the zero set of the per-vertex values d (n, 3)"""
    out = []
    for a, b in ((0, 1), (1, 2), (2, 0)):
        m = (d[:, a] * d[:, b]) < 0
        if m.any():
            t = d[m, a] / (d[m, a] - d[m, b])
            out.append(T[m, a] + (T[m, b] - T[m, a]) * t[:, None])
    return np.concatenate(out) if out else np.zeros((0, 3))


class BodyMap:
    """Fuselage / nacelle coordinates: s = station z, t = angle from the top (0) to the keel (pi) round the
    section centre (mid-height of the section's centreline crossings, sliced from the triangles)."""
    kind = 'body'

    def __init__(self, T, cx=0.0, half=0.2, nbins=60):
        T = np.asarray(T)
        z0, z1 = T[:, :, 2].min(), T[:, :, 2].max()
        zs, ys = [], []
        for z in np.linspace(z0, z1, nbins + 2)[1:-1]:
            p = slice_tris(T, T[:, :, 2] - z)
            p = p[np.abs(p[:, 0] - cx) < half]
            if len(p) >= 2:
                zs.append(z)
                ys.append(0.5 * (p[:, 1].max() + p[:, 1].min()))
        self.zs, self.ys = np.array(zs), np.array(ys)
        if len(self.ys) > 6:
            k = np.ones(5) / 5
            pad = np.concatenate([[self.ys[0]] * 2, self.ys, [self.ys[-1]] * 2])
            self.ys = np.convolve(pad, k, 'valid')
        self.cx = cx

    def centre(self, z):
        return float(np.interp(z, self.zs, self.ys)) if len(self.zs) else 0.0

    def attr(self, p):
        x, y, z = p
        return (z, math.atan2(abs(x - self.cx), y - self.centre(z)), 1.0)

    def st(self, P):
        """vectorised (S, T) for the painter, per texel"""
        yc = np.interp(P[:, 2], self.zs, self.ys) if len(self.zs) else 0.0
        return P[:, 2].astype(np.float32), np.arctan2(np.abs(P[:, 0] - self.cx), P[:, 1] - yc).astype(np.float32)


class LiftMap:
    """Wing / tailplane / fin coordinates: s = metres along span_dir from root, t = chord fraction from
    the leading edge (+z most) of the local section, sliced from the triangles."""
    kind = 'lift'

    def __init__(self, T, root, span_dir, nbins=48):
        T = np.asarray(T)
        self.root = np.array(root, np.float64)
        self.sd = np.array(span_dir, np.float64) / np.linalg.norm(span_dir)
        D = (T - self.root) @ self.sd
        s0, s1 = D.min(), D.max()
        ss, le, te = [], [], []
        for sv in np.linspace(s0, s1, nbins + 2)[1:-1]:
            p = slice_tris(T, D - sv)
            if len(p) >= 2:
                ss.append(sv)
                le.append(p[:, 2].max())
                te.append(p[:, 2].min())
        self.ss, self.le, self.te = np.array(ss), np.array(le), np.array(te)

    def attr(self, p):
        s = float((np.array(p) - self.root) @ self.sd)
        le = float(np.interp(s, self.ss, self.le))
        te = float(np.interp(s, self.ss, self.te))
        t = (le - p[2]) / max(le - te, 0.05)
        return (max(s, 0.0), min(max(t, 0.0), 1.0), 2.0)

    def st(self, P):
        s = (P - self.root) @ self.sd
        le = np.interp(s, self.ss, self.le)
        te = np.interp(s, self.ss, self.te)
        t = (le - P[:, 2]) / np.maximum(le - te, 0.05)
        return np.maximum(s, 0).astype(np.float32), np.clip(t, 0, 1).astype(np.float32)


# ---------------------------------------------------------------- splitting into model meshes

def split(src, classify):
    """classify(centroid, normal, material) -> (node, cls, group) or None (drop).
    Returns {(node, cls, group): (verts list, faces list)} with vertices copied per key."""
    out = {}
    bm = src.bm
    lay = bm.faces.layers.int['mat']
    for f in bm.faces:
        c = f.calc_center_median()
        key = classify(tuple(c), tuple(f.normal), src.mats[f[lay]])
        if key is None:
            continue
        V, F, idx = out.setdefault(key, ([], [], {}))
        loop = []
        for v in f.verts:
            i = idx.get(v.index)
            if i is None:
                i = idx[v.index] = len(V)
                V.append(tuple(v.co))
            loop.append(i)
        F.append(tuple(loop))
    return {k: (V, F) for k, (V, F, _) in out.items()}


def to_mesh(V, F, mapper=None):
    m = Mesh(list(V), list(F))
    m.fixed = True          # winding already set by the visibility pass: build.py keeps it
    m.attr = [mapper.attr(v) for v in V] if mapper is not None else [(0.0, 0.0, 0.0)] * len(V)
    return m


def points(bm, pred=None):
    """vertex positions (np array) of the faces whose centroid passes pred"""
    out = []
    for f in bm.faces:
        if pred is None or pred(tuple(f.calc_center_median())):
            out.extend(tuple(v.co) for v in f.verts)
    return np.array(out) if out else np.zeros((0, 3))


def mirror_x(p):
    return (-p[0], p[1], p[2])


# ---------------------------------------------------------------- curved refinement of the low-poly source

def refine(src, max_edge=0.12, passes=2, sharp_deg=48.0, bulge=0.06, bulge_max=0.012):
    """Splits edges longer than max_edge (red-green: 1, 2 or 3 split edges per triangle, no cracks). The
    new mid-edge vertex sits on the curved PN-triangle edge through the two end vertices and their
    smooth normals, so curved surfaces get rounder while every source vertex (and so the silhouette the
    source gets right) stays put. Edges across a crease (corner normals differ) split straight."""
    for _ in range(passes):
        bm = src.bm
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new('_refine')
        bm.to_mesh(me)
        try:
            me.set_sharp_from_angle(angle=math.radians(sharp_deg))
        except Exception:
            pass
        lay_name = 'mat'
        mat_attr = me.attributes.get(lay_name)
        nt = len(me.polygons)
        V = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
        L = np.empty(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', L)
        CN = np.array([tuple(c.vector) for c in me.corner_normals]).reshape(-1, 3)
        LS = np.empty(nt, np.int64); me.polygons.foreach_get('loop_start', LS)
        MI = np.zeros(nt, np.int64)
        if mat_attr is not None and mat_attr.domain == 'FACE':
            mat_attr.data.foreach_get('value', MI)
        bpy.data.meshes.remove(me)
        tri = np.stack([L[LS], L[LS + 1], L[LS + 2]], 1)
        cn = np.stack([CN[LS], CN[LS + 1], CN[LS + 2]], 1)
        # edges: key (i, j) i<j -> [ (tri, a, b) ]
        edges = {}
        for t in range(nt):
            for a in range(3):
                b = (a + 1) % 3
                i, j = tri[t, a], tri[t, b]
                key = (i, j) if i < j else (j, i)
                edges.setdefault(key, []).append((t, a, b))
        mid = {}
        newV = [tuple(p) for p in V]
        for key, inc in edges.items():
            i, j = key
            P1, P2 = V[i], V[j]
            Ln = np.linalg.norm(P2 - P1)
            if Ln <= max_edge:
                continue
            # corner normals at i and j from every incident triangle: smooth if they agree
            ni = [cn[t, a] if tri[t, a] == i else cn[t, b] for (t, a, b) in inc]
            nj = [cn[t, b] if tri[t, b] == j else cn[t, a] for (t, a, b) in inc]
            # open edges (seams between the source's loose panels) split straight so both sides agree
            smooth = len(inc) == 2 and all(np.dot(n, ni[0]) > 0.999 for n in ni) and all(np.dot(n, nj[0]) > 0.999 for n in nj)
            m = 0.5 * (P1 + P2)
            if smooth:
                N1, N2 = ni[0], nj[0]
                b210 = (2 * P1 + P2 - np.dot(P2 - P1, N1) * N1) / 3
                b120 = (2 * P2 + P1 - np.dot(P1 - P2, N2) * N2) / 3
                pm = (P1 + 3 * b210 + 3 * b120 + P2) / 8
                d = pm - m
                dl = np.linalg.norm(d)
                lim = min(bulge * Ln, bulge_max)
                if dl > lim:
                    d *= lim / dl
                m = m + d
            mid[key] = len(newV)
            newV.append(tuple(m))
        if not mid:
            break
        faces, fmat = [], []
        for t in range(nt):
            v = tri[t]
            ms = []
            for a in range(3):
                i, j = v[a], v[(a + 1) % 3]
                ms.append(mid.get((i, j) if i < j else (j, i)))
            k = sum(x is not None for x in ms)
            if k == 0:
                out = [tuple(v)]
            elif k == 3:
                a, b, c = v
                ab, bc, ca = ms
                out = [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]
            elif k == 1:
                e = [x is not None for x in ms].index(True)
                a, b, c = v[e], v[(e + 1) % 3], v[(e + 2) % 3]
                mm = ms[e]
                out = [(a, mm, c), (mm, b, c)]
            else:
                e = [x is None for x in ms].index(True)      # the unsplit edge: v[e] -> v[e+1]
                a, b, c = v[e], v[(e + 1) % 3], v[(e + 2) % 3]
                m1, m2 = ms[(e + 1) % 3], ms[(e + 2) % 3]   # on b-c and c-a
                out = [(m1, c, m2)]
                # quad a, b, m1, m2: shorter diagonal
                pa, pb = np.array(newV[a]), np.array(newV[b])
                p1, p2 = np.array(newV[m1]), np.array(newV[m2])
                if np.linalg.norm(pa - p1) < np.linalg.norm(pb - p2):
                    out += [(a, b, m1), (a, m1, m2)]
                else:
                    out += [(a, b, m2), (b, m1, m2)]
            faces += out
            fmat += [int(MI[t])] * len(out)
        bm2 = bmesh.new()
        vs = [bm2.verts.new(p) for p in newV]
        lay = bm2.faces.layers.int.new('mat')
        for f, mi in zip(faces, fmat):
            try:
                face = bm2.faces.new([vs[i] for i in f])
            except ValueError:
                continue
            face[lay] = mi
        bm.free()
        src.bm = bm2
    return src


def cull_hidden(src, rays=256, eps=0.003):
    """Visibility pass over the source skin (its panels are loose and their winding is arbitrary): from
    just off each side of a face, rays over the sphere; a side is visible if a ray escapes. Hidden on
    both sides (spars, root caps, doubled panels inside the closed skin): deleted. Visible only from
    behind: flipped. Visible from both sides (open sheets: gear doors, frames, flaps' edges): a reversed
    copy is added so both sides render and bake. The glass is not an occluder, so the cockpit stays."""
    from mathutils.bvhtree import BVHTree
    bm = src.bm
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm)
    ga = math.pi * (3 - math.sqrt(5))
    dirs = []
    for i in range(rays):
        y = 1 - 2 * (i + 0.5) / rays
        r = math.sqrt(1 - y * y)
        dirs.append(Vector((math.cos(ga * i) * r, y, math.sin(ga * i) * r)))

    def visible(c, n, s):
        o = c + n * (s * eps)
        for d in dirs:
            if d.dot(n) * s < 0.01:
                continue
            if tree.ray_cast(o, d, 60.0)[0] is None:
                return True
        return False

    dead, flip, both = [], [], []
    for f in bm.faces:
        c = f.calc_center_median()
        n = f.normal
        if n.length < 0.5:
            dead.append(f)
            continue
        # the centroid and a point near each corner: a face partly showing through a thin gap stays
        pts = [c] + [c.lerp(v.co, 0.85) for v in f.verts]
        vp = any(visible(p, n, 1) for p in pts)
        vm = any(visible(p, n, -1) for p in pts)
        if not vp and not vm:
            dead.append(f)
        elif vm and not vp:
            flip.append(f)
        elif vm and vp:
            both.append(f)
    lay = bm.faces.layers.int['mat']
    for f in both:
        # the reversed copy sits 2 mm off the sheet: coincident faces would bake each other's normal
        off = -f.normal * 0.002
        vs = [bm.verts.new(v.co + off) for v in reversed(f.verts)]
        g = bm.faces.new(vs)
        g[lay] = f[lay]
    if flip:
        bmesh.ops.reverse_faces(bm, faces=flip)
    if dead:
        bmesh.ops.delete(bm, geom=dead, context='FACES')
    print(f'  visibility: {len(dead)} hidden faces removed, {len(flip)} flipped, {len(both)} made two-sided')
    return src
