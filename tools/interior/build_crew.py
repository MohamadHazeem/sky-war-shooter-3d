# B-17 crewman for the gunner's interior (Phase 10 goal 07, Crew 2.0 in Phase 11 goal 05), generated
# in Blender:
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/interior/build_crew.py -- out.glb [--no-bake]
# One skinned man built for close inspection (0.5-3 m):
#  - body lofted from superellipse sections along the rig (B-3 sheepskin jacket with a shawl fleece
#    collar, knit cuffs and fleece hem, bulky A-3 trousers, A-6 fleece-topped boots), with sewn seams,
#    sculpted folds at elbows, knees and waist, and a fitted zipper
#  - a sculpted face: brow ridge, eye sockets with eyeballs (sclera, iris, pupil) and blinking lids,
#    nose bridge and cheekbones, under an A-11 leather helmet with earphone cups and chin strap,
#    B-8 goggles pushed up on the forehead, an A-14 oxygen mask over nose and mouth with its valve,
#    straps and a corrugated hose to the chest clip
#  - gloves with modelled fingers and gauntlets (the index fingers have their own bones: pointing)
#  - B-4 Mae West, parachute harness with brass hardware; the M1 flak vest and the M4 steel helmet
#    as their own meshes (the game leaves them off some men)
#  - materials by surface: crewLeather (hide), crewFleece (sheepskin), crewCanvas (webbing, Mae West,
#    vest), crewSkin, crewHard (steel, rubber, brass, lenses), crewEye. Vertex colour RGB = the painted
#    key (the game recolours jacket / fleece / trousers / helmet / skin per man), alpha = shade
#    (ambient occlusion baked in Cycles x low-frequency wear).
# A 20-bone rig (+ lids, index.L/R), a low-detail LOD, the clips the game plays
#   idle, fire, hit, down, help, sit, kneel
# plus 'fpArm': a static first-person forearm and gloved fist around a grip (the player's own hands).
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix, Euler, Quaternion, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_util import reset_scene, material, use_vertex_colors, prim, free_tmp, trs, look_matrix, export_glb  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = next((a for a in ARGS if not a.startswith('--')), os.path.join(os.path.dirname(__file__), 'out', 'crew.glb'))
NO_BAKE = '--no-bake' in ARGS
reset_scene()
scene = bpy.context.scene
scene.render.fps = 30

# ---------------- colours (linear). Keys the game swaps per crewman: JACKET FLEECE TROUSERS HELMET SKIN ----------------
JACKET = (0.2, 0.11, 0.055)       # B-3 hide, brown (key)
FLEECE = (0.62, 0.55, 0.42)       # sheepskin (key)
TROUSERS = (0.17, 0.105, 0.06)    # A-3 trousers (key)
LEATHER_HELMET = (0.11, 0.065, 0.035)   # A-11 helmet (key)
SKIN = (0.55, 0.36, 0.27)         # skin (key: the game tints the whole crewSkin surface by look / SKIN)
BOOT = (0.06, 0.04, 0.028)
SOLE = (0.025, 0.022, 0.02)
GLOVE = (0.075, 0.05, 0.034)
GLOVE_CUFF = (0.1, 0.07, 0.045)
SEAM = (0.085, 0.046, 0.024)
STITCH = (0.33, 0.25, 0.15)
STEEL = (0.085, 0.095, 0.065)     # olive drab M4
RUBBER = (0.055, 0.07, 0.058)     # A-14 mask, olive-grey rubber
RUBBER_DARK = (0.03, 0.035, 0.03)
HOSE = (0.045, 0.05, 0.042)
LENS = (0.05, 0.06, 0.05)
GOGGLE = (0.04, 0.032, 0.026)
BRASS = (0.42, 0.3, 0.11)
WEB = (0.3, 0.27, 0.17)
MAEWEST = (0.6, 0.4, 0.05)
VEST = (0.12, 0.13, 0.08)
VEST_DARK = (0.065, 0.07, 0.042)
VEST_TAB = (0.42, 0.05, 0.035)
SCLERA = (0.62, 0.58, 0.54)
IRIS = (0.09, 0.12, 0.13)
PUPIL = (0.005, 0.005, 0.005)
LIP = (0.42, 0.22, 0.18)

M = {}
for name, rough, metal in (('crewLeather', 0.55, 0), ('crewFleece', 0.95, 0), ('crewCanvas', 0.85, 0),
                           ('crewSkin', 0.5, 0), ('crewHard', 0.42, 0.25), ('crewEye', 0.12, 0)):
    M[name] = material(name, (1, 1, 1), rough=rough, metal=metal)
    use_vertex_colors(M[name])
LEA, FLE, CAN, SKI, HRD, EYE = (M[n] for n in ('crewLeather', 'crewFleece', 'crewCanvas', 'crewSkin', 'crewHard', 'crewEye'))

# ---------------- rig ----------------
# Blender frame, man facing -Y, +X his left, Z up, origin on the floor between the feet.
HC = Vector((0, -0.005, 1.655))      # head centre
EYE_Z = HC.z + 0.008
EYE_X = 0.0315
EYE_Y = HC.y - 0.0695                # eyeball centre (radius 0.0122)
BONES = [
    # name, head, tail, parent, connected
    ('hips', (0, 0, 0.95), (0, 0, 1.06), None, False),
    ('spine', (0, 0, 1.06), (0, 0.0, 1.24), 'hips', True),
    ('chest', (0, 0, 1.24), (0, 0.0, 1.44), 'spine', True),
    ('neck', (0, 0, 1.44), (0, -0.01, 1.54), 'chest', True),
    ('head', (0, -0.01, 1.54), (0, -0.01, 1.76), 'neck', True),
    ('lids', (0, EYE_Y, EYE_Z), (0, EYE_Y - 0.03, EYE_Z), 'head', False),
]
for s, n in ((1, 'L'), (-1, 'R')):
    BONES += [
        (f'upperarm.{n}', (s * 0.19, 0.01, 1.42), (s * 0.39, 0.01, 1.215), 'chest', False),
        (f'forearm.{n}', (s * 0.39, 0.01, 1.215), (s * 0.575, 0.0, 1.025), f'upperarm.{n}', True),
        (f'hand.{n}', (s * 0.575, 0.0, 1.025), (s * 0.645, -0.005, 0.955), f'forearm.{n}', True),
        (f'thigh.{n}', (s * 0.1, 0, 0.93), (s * 0.1, -0.01, 0.5), 'hips', False),
        (f'shin.{n}', (s * 0.1, -0.01, 0.5), (s * 0.1, 0.02, 0.09), f'thigh.{n}', True),
        (f'foot.{n}', (s * 0.1, 0.02, 0.09), (s * 0.1, -0.13, 0.03), f'shin.{n}', True),
    ]


# hand frame: d along the hand (wrist -> knuckles), n out of the palm (palms face the thighs), f = d x n
def hand_frame(s):
    w = Vector((s * 0.575, 0.0, 1.025))
    d = (Vector((s * 0.645, -0.005, 0.955)) - w).normalized()
    n = Vector((-s, 0, 0))
    n = (n - d * n.dot(d)).normalized()
    f = d.cross(n).normalized()
    return w, d, n, f


for s, nm in ((1, 'L'), (-1, 'R')):
    w, d, n, f = hand_frame(s)
    k = w + d * 0.088 - f * s * 0.031 * 0 + f * 0.03 - n * 0.004   # index knuckle (the side of the thumb)
    BONES.append((f'index.{nm}', tuple(k), tuple(k + d * 0.045), f'hand.{nm}', False))

arm_data = bpy.data.armatures.new('crewRig')
arm = bpy.data.objects.new('crewRig', arm_data)
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name, h, t, parent, conn in BONES:
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = Vector(h), Vector(t)
    eb.roll = 0
    if parent:
        eb.parent = arm_data.edit_bones[parent]
        eb.use_connect = conn
bpy.ops.object.mode_set(mode='OBJECT')
REST = {b.name: (b.head_local.copy(), b.tail_local.copy(), b.matrix_local.copy()) for b in arm_data.bones}
PARENT = {name: parent for name, _, _, parent, _ in BONES}
ORDER = [b[0] for b in BONES]


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (a + ab * t - p).length


def weights_for(p, allowed, sharp=7.0):
    ds = sorted((seg_dist(p, REST[n][0], REST[n][1]), n) for n in allowed)[:3]
    w = [(1.0 / (d + 0.012) ** sharp, n) for d, n in ds]
    tot = sum(x for x, _ in w)
    return [(x / tot, n) for x, n in w if x / tot > 0.02]


# ---------------- mesh builder: per-vertex colour function, per-vertex bone set ----------------
class Builder:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Col')
        self.grp = self.bm.verts.layers.int.new('grp')     # index into GROUPS (bones allowed for skinning)
        self.mats = []

    def mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def add_bm(self, bm, mat, col, group, smooth=True):
        idx = self.mi(mat)
        gi = group_index(group)
        vmap = {}
        for v in bm.verts:
            nv = self.bm.verts.new(v.co)
            nv[self.grp] = gi
            vmap[v] = nv
        for fc in bm.faces:
            try:
                nf = self.bm.faces.new([vmap[v] for v in fc.verts])
            except ValueError:
                continue
            nf.material_index = idx
            nf.smooth = smooth
            for l in nf.loops:
                c = col(l.vert.co) if callable(col) else col
                l[self.col] = (*c, 1.0)

    def add(self, me, matrix, mat, col, group, smooth=None):
        tmp = bmesh.new()
        tmp.from_mesh(me)
        bmesh.ops.transform(tmp, matrix=matrix, verts=tmp.verts)
        sm = smooth if smooth is not None else all(p.use_smooth for p in me.polygons)
        self.add_bm(tmp, mat, col, group, sm)
        tmp.free()

    def finish(self):
        me = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        return ob


GROUPS = []


def group_index(g):
    key = tuple(g)
    if key not in GROUPS:
        GROUPS.append(key)
    return GROUPS.index(key)


TORSO = ['hips', 'spine', 'chest', 'neck', 'upperarm.L', 'upperarm.R']
HEAD = ['head']
NECK = ['neck', 'head', 'chest']
CHEST = ['chest', 'spine']
PELVIS = ['hips', 'spine', 'thigh.L', 'thigh.R']


def arm_g(n): return ['chest', f'upperarm.{n}', f'forearm.{n}', f'hand.{n}']
def hand_g(n): return [f'hand.{n}']
def leg_g(n): return ['hips', f'thigh.{n}', f'shin.{n}', f'foot.{n}']


# ---------------- loft: superellipse sections along a polyline ----------------
def superellipse(theta, p):
    c, s = math.cos(theta), math.sin(theta)
    return math.copysign(abs(c) ** (2 / p), c), math.copysign(abs(s) ** (2 / p), s)


def loft(sections, segs, cap0=False, cap1=False, seam_theta=None):
    """sections: list of (centre Vector, axis_x Vector, axis_y Vector, rx, ry_pos, ry_neg, power, disp_fn or None).
    Ring point = c + ax*rx*cx + ay*(ry_pos if cy>0 else ry_neg)*cy (+ displacement along the outward normal)."""
    bm = bmesh.new()
    rings = []
    for c, ax, ay, rx, ryp, ryn, p, disp in sections:
        ring = []
        for i in range(segs):
            th = 2 * math.pi * i / segs
            cx, cy = superellipse(th, p)
            off = ax * (rx * cx) + ay * ((ryp if cy > 0 else ryn) * cy)
            pt = c + off
            if disp:
                pt = pt + off.normalized() * disp(pt, th)
            ring.append(bm.verts.new(pt))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(segs):
            bm.faces.new([r0[i], r0[(i + 1) % segs], r1[(i + 1) % segs], r1[i]])
    if cap0:
        cv = bm.verts.new(sum((v.co for v in rings[0]), Vector()) / segs)
        for i in range(segs):
            bm.faces.new([rings[0][(i + 1) % segs], rings[0][i], cv])
    if cap1:
        cv = bm.verts.new(sum((v.co for v in rings[-1]), Vector()) / segs)
        for i in range(segs):
            bm.faces.new([rings[-1][i], rings[-1][(i + 1) % segs], cv])
    bm.normal_update()
    return bm


def chain(points, s):
    """Point and tangent at arc length s along a polyline."""
    acc = 0.0
    for a, b in zip(points, points[1:]):
        L = (b - a).length
        if s <= acc + L or b is points[-1]:
            t = max(0.0, min(1.0, (s - acc) / L)) if L > 0 else 0
            return a.lerp(b, t), (b - a).normalized()
        acc += L
    return points[-1], (points[-1] - points[-2]).normalized()


def chain_len(points):
    return sum((b - a).length for a, b in zip(points, points[1:]))


def frame_for(t, hint):
    ax = hint - t * hint.dot(t)
    if ax.length < 1e-4:
        ax = Vector((1, 0, 0)) - t * t.x
    ax.normalize()
    return ax, t.cross(ax).normalized()


def tube_sections(points, prof, hint, step=0.012, p=2.0, disp=None, s0=0.0):
    """Sections along a chain; prof(s) -> (rx, ry_pos, ry_neg). hint: the ring's x axis direction."""
    L = chain_len(points)
    out = []
    s = s0
    while s <= L + 1e-6:
        c, t = chain(points, max(0.0, s))
        if s < 0:
            c = points[0] + (points[1] - points[0]).normalized() * s
        ax, ay = frame_for(t, hint)
        rx, ryp, ryn = prof(s)
        out.append((c, ax, ay, rx, ryp, ryn, p, (lambda pt, th, s=s: disp(pt, th, s)) if disp else None))
        s += step
    return out


def orient_out(bm, centre):
    """Turn every face of a shell to face away from centre (the game culls back faces)."""
    for fc in bm.faces:
        if fc.normal.dot(fc.calc_center_median() - centre) < 0:
            fc.normal_flip()
    bm.normal_update()


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t): return a + (b - a) * t


def interp(table, x):
    """Piecewise-linear lookup in [(x, value-tuple)]"""
    if x <= table[0][0]:
        return table[0][1]
    for (x0, v0), (x1, v1) in zip(table, table[1:]):
        if x <= x1:
            t = (x - x0) / (x1 - x0)
            t = t * t * (3 - 2 * t)
            return tuple(lerp(a, b, t) for a, b in zip(v0, v1))
    return table[-1][1]


B = Builder('crewBody')
Hh = Builder('crewSteelHelmet')

# ================= torso: the B-3 jacket =================
# (z, rx, ry_front, ry_back): man faces -Y, so 'front' is the -Y half of each section
JACKET_T = [
    (0.855, (0.192, 0.142, 0.138)), (0.875, (0.196, 0.146, 0.142)), (0.9, (0.19, 0.14, 0.136)),
    (0.98, (0.183, 0.136, 0.128)), (1.06, (0.185, 0.14, 0.122)), (1.15, (0.193, 0.147, 0.122)),
    (1.25, (0.203, 0.153, 0.125)), (1.33, (0.208, 0.148, 0.126)), (1.38, (0.203, 0.138, 0.122)),
    (1.415, (0.185, 0.122, 0.112)), (1.445, (0.145, 0.1, 0.095)), (1.47, (0.095, 0.078, 0.075)),
    (1.49, (0.062, 0.06, 0.058)),
]


def jacket_disp(pt, th, s):
    z = pt.z
    # waist gathering above the hem, a crease band under the chest, a fleece hem roll
    fold = 0.004 * math.exp(-((z - 1.0) / 0.07) ** 2) * math.sin(z * 160 + 2.0 * math.sin(th * 3))
    fold += 0.0035 * math.exp(-((z - 1.17) / 0.05) ** 2) * math.sin(th * 9 + z * 40)
    # back yoke seam and side seams sink slightly
    fold -= 0.0025 * math.exp(-((abs(math.cos(th)) - 1.0) / 0.03) ** 2)
    return fold


secs = []
for z in [0.855 + 0.01 * i for i in range(64)]:
    if z > 1.495:
        break
    rx, ryf, ryb = interp(JACKET_T, z)
    secs.append((Vector((0, 0.004, z)), Vector((1, 0, 0)), Vector((0, 1, 0)), rx, ryb, ryf, 2.35, (lambda pt, th: jacket_disp(pt, th, 0))))


def jacket_col(p):
    if p.z < 0.885:
        return FLEECE           # fleece hem, turned out
    return JACKET


B.add_bm(loft(secs, 40), LEA, jacket_col, TORSO)
# the fleece hem roll
B.add(prim('torus', R=1.0, r=0.012, nu=40, nv=8), trs((0, 0.004, 0.868), (0, 0, 0), (0.198, 0.146, 1)), FLE, FLEECE, PELVIS)

# ================= neck and the shawl fleece collar =================
B.add_bm(loft(tube_sections([Vector((0, 0.004, 1.46)), Vector((0, -0.004, 1.565))], lambda s: (0.046, 0.043, 0.047), Vector((1, 0, 0)), step=0.015), 24), SKI, SKIN, NECK)


def collar_bm():
    # a thick fleece band round the back of the neck, turned down over the shoulders, its two
    # ends running down the front as open lapels to the zipper
    bm = bmesh.new()
    nu, nv = 44, 10
    rows = []
    for i in range(nu + 1):
        a = -0.62 * math.pi + 1.24 * math.pi * i / nu      # angle round the neck from the front-left (0 = back)
        back = math.cos(a)                                # 1 at the back, -1 at the front
        front = max(0.0, -back)
        # path: round the neck at the back, dropping down the chest at the front (lapels)
        R = 0.088 + 0.03 * front
        cx, cy = math.sin(a) * R * 1.02, math.cos(a) * R * 0.95
        cz = 1.492 - 0.125 * front ** 1.6
        t = Vector((math.cos(a), -math.sin(a), 0))
        out = Vector((math.sin(a), math.cos(a), 0)).normalized()
        row = []
        for j in range(nv):
            b = 2 * math.pi * j / nv
            # section: tall at the back (the collar stands up, then rolls down), flat on the lapels
            h = 0.06 - 0.032 * front
            w = 0.028 + 0.004 * back
            pz = math.sin(b) * h
            px = math.cos(b) * w
            # rolled over outward at the top
            px += 0.012 * max(0.0, math.sin(b)) * (0.5 + 0.5 * back)
            p = Vector((cx, cy, cz)) + out * (px + 0.008) + Vector((0, 0, pz)) + (-out) * 0.0
            # curly sheepskin: lumpy
            p += out * 0.003 * noise.noise(p * 90)
            row.append(bm.verts.new(p))
        rows.append(row)
    for r0, r1 in zip(rows, rows[1:]):
        for j in range(nv):
            bm.faces.new([r0[j], r1[j], r1[(j + 1) % nv], r0[(j + 1) % nv]])
    for r in (rows[0], rows[-1]):
        c = bm.verts.new(sum((v.co for v in r), Vector()) / nv)
        for j in range(nv):
            try:
                bm.faces.new([r[j], r[(j + 1) % nv], c])
            except ValueError:
                pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


B.add_bm(collar_bm(), FLE, FLEECE, ['chest', 'neck'])

# ================= arms: sleeves, knit cuffs, gloves =================
SLEEVE = [(-0.06, (0.03,)), (-0.045, (0.052,)), (-0.028, (0.064,)), (-0.01, (0.071,)), (0.03, (0.072,)), (0.12, (0.068,)),
          (0.22, (0.063,)), (0.287, (0.06,)), (0.36, (0.057,)), (0.46, (0.053,)), (0.52, (0.05,))]
for s, nm in ((1, 'L'), (-1, 'R')):
    sh, el, wr = REST[f'upperarm.{nm}'][0], REST[f'forearm.{nm}'][0], REST[f'hand.{nm}'][0]
    pts = [sh, el, wr]

    def sleeve_prof(t):
        r = interp(SLEEVE, t)[0]
        return r, r * 0.97, r * 1.0

    def sleeve_disp(pt, th, t, s=s):
        # elbow folds (on the inside of the bend), creases above the cuff
        elbow = math.exp(-((t - 0.29) / 0.06) ** 2)
        cuff = math.exp(-((t - 0.47) / 0.035) ** 2)
        inner = 0.5 + 0.5 * math.cos(th - math.pi / 2)
        return (0.006 * elbow * (0.3 + inner) + 0.003 * cuff) * math.sin(t * 190 + 1.3 * math.sin(th * 2))

    hint = Vector((0, -1, 0))
    B.add_bm(loft(tube_sections(pts, sleeve_prof, hint, step=0.011, disp=sleeve_disp, s0=-0.06), 28, cap0=True), LEA, JACKET, arm_g(nm))
    # sleeve seam down the back of the arm
    seam = [chain(pts, t)[0] + Vector((0, 0.064 - 0.012 * t, 0.012 * s)) for t in (0.0, 0.1, 0.2, 0.3, 0.4, 0.5)]
    B.add(prim('tube', pts=seam, r=0.0028, segs=5), Matrix.Identity(4), LEA, SEAM, arm_g(nm))
    # knit / fleece cuff at the wrist
    c, t = chain(pts, 0.535)
    B.add(prim('cyl', r1=0.05, r2=0.047, h=0.04, segs=24), Matrix.Translation(c) @ Vector((0, 0, 1)).rotation_difference(t).to_matrix().to_4x4(), FLE, FLEECE, arm_g(nm))

# ---------------- gloves ----------------
INDEX_GROUP = {}


def glove(bld, s, nm, w, d, n, f, mat=LEA, curl_index=False, group=None, index_group=None):
    """A gloved fist round a grip: palm, four fingers wrapped round (palm side = n), a thumb over them,
    a flared gauntlet. f runs across the knuckles (the index finger at +f)."""
    g = group or hand_g(nm)
    gi = index_group or [f'index.{nm}']
    rot = Matrix((f, -n, d)).transposed().to_4x4()   # local x = f, y = -n (back of hand), z = d
    def L(x, y, z): return w + f * x - n * y + d * z
    # palm: a rounded box
    pb = bmesh.new()
    bmesh.ops.create_cube(pb, size=1.0)
    bmesh.ops.subdivide_edges(pb, edges=pb.edges[:], cuts=2, use_grid_fill=True)
    for v in pb.verts:
        x, y, z = v.co
        r = Vector((x, y, z))
        sph = r.normalized() * 0.5
        v.co = r.lerp(sph, 0.55)
        v.co.x *= 0.088
        v.co.y *= 0.038
        v.co.z *= 0.092
    bmesh.ops.transform(pb, matrix=Matrix.Translation(L(0, 0.004, 0.052)) @ rot, verts=pb.verts)
    pb.normal_update()
    bld.add_bm(pb, mat, GLOVE, g)
    pb.free()
    # fingers curled round a grip of radius ~0.016 just in front of the palm
    for k in range(4):
        x = 0.031 - k * 0.0205
        r = 0.0098 - 0.0007 * k
        length = 1.0 - 0.08 * k
        k0 = L(x, 0.006, 0.094)
        if k == 0 and not curl_index:
            # the index finger: straight along d in the rest pose; its bone curls it (pointing = straight)
            pts = [k0 + d * (-0.004), k0 + d * 0.03, k0 + d * 0.05 + n * 0.008, k0 + d * 0.058 + n * 0.022]
            bld.add(prim('tube', pts=pts, r=r, segs=10), Matrix.Identity(4), mat, GLOVE, gi)
            bld.add(prim('sphere', r=r, u=10, v=6), Matrix.Translation(pts[-1]), mat, GLOVE, gi)
            continue
        pts = [k0 + d * (-0.004), k0 + d * 0.022 * length - n * 0.004, k0 + d * 0.036 * length + n * 0.016,
               k0 + d * 0.03 * length + n * 0.036, k0 + d * 0.012 + n * 0.042]
        bld.add(prim('tube', pts=pts, r=r, segs=10), Matrix.Identity(4), mat, GLOVE, g)
        bld.add(prim('sphere', r=r, u=10, v=6), Matrix.Translation(pts[-1]), mat, GLOVE, g)
        bld.add(prim('sphere', r=r * 1.12, u=10, v=6), Matrix.Translation(k0 + d * 0.004), mat, GLOVE, g)   # knuckle
    # thumb: from the base of the palm round over the fingers
    t0 = L(0.044, -0.004, 0.03)
    tp = [t0, t0 + f * 0.012 + d * 0.022 + n * 0.012, t0 + f * 0.002 + d * 0.045 + n * 0.028, t0 - f * 0.012 + d * 0.056 + n * 0.036]
    bld.add(prim('tube', pts=tp, r=0.0115, segs=10), Matrix.Identity(4), mat, GLOVE, g)
    bld.add(prim('sphere', r=0.0115, u=10, v=6), Matrix.Translation(tp[-1]), mat, GLOVE, g)
    # gauntlet, flared over the cuff, with a strap
    gb = loft(tube_sections([w + d * 0.03, w - d * 0.05], lambda t: (0.047 + 0.1 * t, 0.044 + 0.1 * t, 0.044 + 0.1 * t), f, step=0.01), 24)
    bld.add_bm(gb, mat, GLOVE_CUFF, g)
    gb.free()
    bld.add(prim('torus', R=0.05, r=0.004, nu=24, nv=4), Matrix.Translation(w - d * 0.02) @ Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4(), HRD, (0.05, 0.035, 0.02), g)


for s, nm in ((1, 'L'), (-1, 'R')):
    w, d, n, f = hand_frame(s)
    glove(B, s, nm, w, d, n, f)

# ================= trousers, pelvis, boots =================
PELV = [(0.79, (0.12, 0.11, 0.11)), (0.82, (0.165, 0.125, 0.135)), (0.86, (0.178, 0.13, 0.14)), (0.95, (0.178, 0.128, 0.13)), (0.99, (0.172, 0.125, 0.122))]
secs = []
for z in [0.79 + 0.01 * i for i in range(21)]:
    rx, ryf, ryb = interp(PELV, z)
    secs.append((Vector((0, 0.004, z)), Vector((1, 0, 0)), Vector((0, 1, 0)), rx, ryb, ryf, 2.2, None))
B.add_bm(loft(secs, 36, cap0=True), LEA, TROUSERS, PELVIS)

LEG = [(-0.02, (0.098, 0.1, 0.104)), (0.06, (0.098, 0.1, 0.106)), (0.2, (0.09, 0.092, 0.095)), (0.33, (0.08, 0.083, 0.08)),
       (0.43, (0.076, 0.08, 0.074)), (0.52, (0.075, 0.075, 0.08)), (0.62, (0.074, 0.072, 0.078)), (0.72, (0.072, 0.07, 0.072)),
       (0.75, (0.075, 0.072, 0.075))]
for s, nm in ((1, 'L'), (-1, 'R')):
    hp, kn, an = REST[f'thigh.{nm}'][0], REST[f'shin.{nm}'][0], REST[f'foot.{nm}'][0]

    def leg_disp(pt, th, t):
        knee = math.exp(-((t - 0.44) / 0.06) ** 2)
        back = 0.5 + 0.5 * math.cos(th + math.pi / 2)
        bunch = math.exp(-((t - 0.7) / 0.04) ** 2)
        seam = -0.003 * math.exp(-((math.cos(th)) / 0.06) ** 2)   # outer/inner seams
        return (0.007 * knee * (0.4 + back) + 0.006 * bunch) * math.sin(t * 150 + 1.5 * math.sin(th * 2)) + seam

    B.add_bm(loft(tube_sections([hp + Vector((0, 0, 0.02)), kn, an], lambda t: interp(LEG, t), Vector((1, 0, 0)), step=0.012, disp=leg_disp, s0=-0.02), 32), LEA, TROUSERS, leg_g(nm))
    # A-6 boot: fleece-topped shaft, zip down the front, rubber sole
    shaft = [Vector((s * 0.1, 0.022, 0.29)), Vector((s * 0.1, 0.02, 0.07))]
    B.add_bm(loft(tube_sections(shaft, lambda t: (0.078 - 0.03 * t, 0.075 - 0.02 * t, 0.08 - 0.02 * t), Vector((1, 0, 0)), step=0.012), 28, cap0=True), LEA, BOOT, leg_g(nm))
    B.add(prim('torus', R=1, r=0.014, nu=28, nv=8), trs((s * 0.1, 0.022, 0.288), (0, 0, 0), (0.08, 0.08, 1)), FLE, FLEECE, leg_g(nm))
    foot = []
    for i in range(16):
        y = 0.085 - i * 0.017
        u = i / 15
        wdt = 0.046 + 0.01 * math.sin(u * math.pi * 0.9) - 0.012 * u ** 3
        top = 0.12 - 0.075 * smoothstep(0.1, 0.75, u) - 0.012 * u
        cz = 0.02 + top * 0.5
        foot.append((Vector((s * 0.1, y, cz)), Vector((1, 0, 0)), Vector((0, 0, 1)), wdt, top * 0.5, top * 0.5 + 0.0, 2.6, None))
    fb = loft(foot, 24, cap0=True, cap1=True)
    for v in fb.verts:
        v.co.z = max(v.co.z, 0.012)
    B.add_bm(fb, LEA, lambda p: SOLE if p.z < 0.026 else BOOT, ['foot.' + nm, 'shin.' + nm])
    fb.free()
    zip_pts = [Vector((s * 0.1, -0.058 + 0.004 * k, 0.28 - 0.05 * k)) for k in range(5)]
    B.add(prim('tube', pts=zip_pts, r=0.0035, segs=5), Matrix.Identity(4), HRD, BRASS, leg_g(nm))

# ================= head: a sculpted face under the A-11 helmet =================
HA, HB, HCZ = 0.074, 0.099, 0.114     # half width, half depth, half height


def gauss2(x, z, cx, cz, rx, rz):
    return math.exp(-(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2))


def head_shape(x, y, z):
    """Displacement (m) of the base ellipsoid surface at a head-local point (front = -y)."""
    front = smoothstep(0.0, -0.06, y)
    dz = 0.0
    # eye sockets
    for sx in (-1, 1):
        dz -= 0.0108 * gauss2(x, z, sx * EYE_X, EYE_Z - HC.z, 0.016, 0.0115) * front
        # cheekbones
        dz += 0.006 * gauss2(x, z, sx * 0.047, EYE_Z - HC.z - 0.03, 0.02, 0.016) * front
    # brow ridge and the forehead's slope
    dz += 0.0055 * gauss2(x, z, 0, EYE_Z - HC.z + 0.022, 0.05, 0.011) * front
    # nose: bridge between the eyes to a tip under the mask
    nb = math.exp(-(x / 0.0085) ** 2) * front
    nz = (EYE_Z - HC.z + 0.012 - z)
    if -0.0 < nz < 0.066:
        dz += nb * (0.004 + 0.3 * nz) * smoothstep(0.066, 0.05, nz)
    # jaw and chin
    if z < -0.03:
        dz -= 0.012 * smoothstep(-0.03, -0.1, z) * (abs(x) / HA)
    # temples
    dz -= 0.004 * gauss2(abs(x), z, 0.068, 0.025, 0.012, 0.03)
    return dz


def head_point(th, ph, extra=0.0, shaped=True):
    """th: angle round the vertical (0 = front, -Y), ph: elevation. Returns a world point on the head."""
    x = HA * math.cos(ph) * math.sin(th)
    y = -HB * math.cos(ph) * math.cos(th)
    z = HCZ * math.sin(ph)
    # narrower jaw, flatter face, fuller back of the skull
    if z < 0:
        k = 1 - 0.22 * smoothstep(0.0, -HCZ, z)
        x *= k
        if y > 0:
            y *= 1 - 0.25 * smoothstep(0.0, -HCZ, z)
    if y < 0:
        y *= 1 - 0.07 * (x / HA) ** 2
    nrm = Vector((x / HA ** 2, y / HB ** 2, z / HCZ ** 2)).normalized()
    p = Vector((x, y, z))
    p += nrm * ((head_shape(x, y, z) if shaped else 0.0) + extra)
    return HC + p, nrm


def head_bm(extra=0.0, keep=None, nu=80, nv=56, ph0=-math.pi / 2, ph1=math.pi / 2):
    bm = bmesh.new()
    grid = []
    for j in range(nv + 1):
        ph = ph0 + (ph1 - ph0) * j / nv
        row = []
        for i in range(nu):
            th = 2 * math.pi * i / nu - math.pi
            p, _ = head_point(th, ph, extra)
            row.append(bm.verts.new(p))
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            q = [grid[j][i], grid[j][(i + 1) % nu], grid[j + 1][(i + 1) % nu], grid[j + 1][i]]
            th = 2 * math.pi * (i + 0.5) / nu - math.pi
            ph = ph0 + (ph1 - ph0) * (j + 0.5) / nv
            if keep and not keep(th, ph):
                continue
            try:
                bm.faces.new(q)
            except ValueError:
                pass
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    return bm


def skin_col(p):
    q = p - HC
    c = Vector(SKIN)
    # cold-reddened cheeks and nose, darker around the eyes, a little grey stubble lower down
    for sx in (-1, 1):
        k = gauss2(q.x, q.z, sx * 0.045, EYE_Z - HC.z - 0.03, 0.02, 0.02)
        c = c.lerp(Vector((0.6, 0.3, 0.24)), 0.4 * k)
        e = gauss2(q.x, q.z, sx * EYE_X, EYE_Z - HC.z, 0.02, 0.014)
        c = c.lerp(Vector((0.36, 0.22, 0.18)), 0.35 * e)
    c = c.lerp(Vector((0.6, 0.32, 0.26)), 0.35 * math.exp(-(q.x / 0.01) ** 2) * smoothstep(-0.005, -0.03, q.z - (EYE_Z - HC.z)))
    if q.z < -0.04:
        c = c.lerp(Vector((0.36, 0.28, 0.24)), 0.3 * smoothstep(-0.04, -0.09, q.z))
    return tuple(c)


B.add_bm(head_bm(), SKI, skin_col, HEAD)

# eyes: sclera, iris and pupil painted round the front pole
for sx in (-1, 1):
    c = Vector((sx * EYE_X, EYE_Y, EYE_Z))
    eb = bmesh.new()
    bmesh.ops.create_uvsphere(eb, u_segments=20, v_segments=16, radius=0.0122)
    # pole forward (-Y), a little outward as eyes are
    R = Euler((math.pi / 2, 0, -sx * 0.08)).to_matrix().to_4x4()
    bmesh.ops.transform(eb, matrix=Matrix.Translation(c) @ R, verts=eb.verts)
    def eye_col(p, c=c, sx=sx):
        dirv = (p - c).normalized()
        a = dirv.angle(Vector((-sx * 0.03, -1, 0.06)).normalized())
        if a < 0.2:
            return PUPIL
        if a < 0.47:
            return tuple(Vector(IRIS) * (0.8 + 0.6 * (a - 0.2) / 0.27))
        if a < 0.53:
            return (0.04, 0.045, 0.045)        # limbal ring
        return SCLERA if a < 1.3 else (0.42, 0.3, 0.28)
    B.add_bm(eb, EYE, eye_col, HEAD)
    eb.free()
    # upper lid: a skin shell round the eye, from above down to the lid line; it rotates with 'lids'
    lb = bmesh.new()
    rows = []
    for j in range(7):
        el = math.radians(80 - 12.3 * j)        # elevation from 80 down to 6 degrees
        row = []
        for i in range(15):
            az = math.radians(-75 + 150 * i / 14)
            r = 0.0143 + 0.0009 * (j == 6)
            v = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * r
            row.append(lb.verts.new(c + v))
        rows.append(row)
    for r0, r1 in zip(rows, rows[1:]):
        for i in range(14):
            lb.faces.new([r0[i], r0[i + 1], r1[i + 1], r1[i]])
    lb.normal_update()
    orient_out(lb, c)
    B.add_bm(lb, SKI, lambda p: (0.48, 0.29, 0.22), ['lids'])
    lb.free()
    # lower lid: a skin shell from below the eye up to its margin (static, on the head)
    lb = bmesh.new()
    rows = []
    for j in range(5):
        el = math.radians(-80 + 13 * j)         # -80 up to -28 degrees
        row = []
        for i in range(13):
            az = math.radians(-70 + 140 * i / 12)
            r = 0.0141 + 0.0008 * (j == 4)
            v = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * r
            row.append(lb.verts.new(c + v))
        rows.append(row)
    for r0, r1 in zip(rows, rows[1:]):
        for i in range(12):
            lb.faces.new([r0[i], r1[i], r1[i + 1], r0[i + 1]])
    lb.normal_update()
    orient_out(lb, c)
    B.add_bm(lb, SKI, lambda p: (0.5, 0.3, 0.24), HEAD)
    lb.free()
    # eyebrow: a dark ridge of hair
    bpts = [c + Vector((sx * x, -0.0145 + 0.004 * abs(x) / 0.02, 0.0175 + 0.0035 * math.cos(x / 0.02 * 1.4))) for x in (-0.014, -0.006, 0.003, 0.012, 0.019)]
    B.add(prim('tube', pts=bpts, r=0.0026, segs=6), Matrix.Identity(4), SKI, (0.09, 0.06, 0.04), HEAD)


# A-11 leather helmet: the head pushed out 7 mm, open over the face
def helmet_keep(th, ph):
    # the face opening: forehead line just above the brows, down past the chin, cheeks covered by flaps
    if abs(th) < 0.8 and ph < math.asin((EYE_Z - HC.z + 0.03) / HCZ):
        return False
    if ph < -1.0:
        return False
    return True


def helmet_col(p):
    q = p - HC
    # stitched panel seams over the crown, front to back
    if abs(abs(q.x) - 0.026) < 0.0025 and q.z > 0.02:
        return SEAM
    return LEATHER_HELMET


hb = head_bm(0.0075, helmet_keep, nu=56, nv=36)
B.add_bm(hb, LEA, helmet_col, HEAD)
hb.free()
# padded edge round the face opening
edge = []
for i in range(25):
    a = -0.8 + 1.6 * i / 24
    ph = math.asin((EYE_Z - HC.z + 0.03) / HCZ)
    edge.append(head_point(a, ph, 0.009)[0])
side = []
for sx in (-1, 1):
    side.append([head_point(sx * 0.8, math.asin((EYE_Z - HC.z + 0.03) / HCZ) - k * 0.1, 0.009)[0] for k in range(10)])
B.add(prim('tube', pts=edge, r=0.0045, segs=6), Matrix.Identity(4), LEA, (0.07, 0.04, 0.022), HEAD)
# earphone cups (ANB-H-1 receivers in their rubber cups) and the chin strap
for sx in (-1, 1):
    ec = HC + Vector((sx * 0.083, 0.006, -0.008))
    R = Vector((0, 0, 1)).rotation_difference(Vector((sx, 0, 0))).to_matrix().to_4x4()
    B.add(prim('cyl', r1=0.034, r2=0.03, h=0.022, segs=24), Matrix.Translation(ec) @ R, LEA, LEATHER_HELMET, HEAD)
    B.add(prim('torus', R=0.03, r=0.004, nu=24, nv=6), Matrix.Translation(ec + Vector((sx * 0.011, 0, 0))) @ R, LEA, SEAM, HEAD)
    # mask straps: from the cup's sides over the cheeks to snaps on the helmet, hugging the face
    for (t0, p0), (t1, p1) in (((0.42, -0.3), (1.2, 0.02)), ((0.36, -0.72), (1.3, -0.42))):
        sp = [head_point(sx * lerp(t0, t1, k / 8), lerp(p0, p1, k / 8), 0.011 if k > 5 else 0.005)[0] for k in range(9)]
        B.add(prim('tube', pts=sp, r=0.0035, segs=6), Matrix.Identity(4), HRD, RUBBER_DARK, HEAD)
        B.add(prim('sphere', r=0.0045, u=10, v=6), Matrix.Translation(sp[-1]), HRD, BRASS, HEAD)
        B.add(prim('sphere', r=0.0035, u=8, v=6), Matrix.Translation(sp[0]), HRD, RUBBER_DARK, HEAD)
chin = [HC + Vector((0.075 * math.sin(a), -0.075 * math.cos(a) * 0.85 + 0.01, -0.1 + 0.03 * abs(math.sin(a)))) for a in [(-1.25 + 0.25 * i) for i in range(11)]]
B.add(prim('tube', pts=chin, r=0.004, segs=6), Matrix.Identity(4), LEA, (0.08, 0.05, 0.03), HEAD)

# B-8 goggles pushed up on the helmet front, strap round the helmet
gz = EYE_Z + 0.036
for sx in (-1, 1):
    gc = HC + Vector((sx * 0.032, 0, 0))
    gp, nrm = head_point(sx * 0.33, math.asin((gz - HC.z) / HCZ), 0.021)
    nrm = (nrm + Vector((0, 0, 0.6))).normalized()   # lying back on the forehead
    R = Vector((0, 0, 1)).rotation_difference(nrm).to_matrix().to_4x4() @ Matrix.Diagonal((1.25, 0.95, 1.0, 1.0))
    B.add(prim('torus', R=0.019, r=0.0062, nu=24, nv=8), Matrix.Translation(gp) @ R, HRD, GOGGLE, HEAD)
    B.add(prim('cyl', r1=0.0185, h=0.004, segs=24), Matrix.Translation(gp + nrm * 0.002) @ R, HRD, LENS, HEAD)
    B.add(prim('cyl', r1=0.021, r2=0.016, h=0.012, segs=24), Matrix.Translation(gp - nrm * 0.006) @ R, HRD, GOGGLE, HEAD)
bridge = [head_point(a, math.asin((gz - HC.z) / HCZ), 0.028)[0] for a in (-0.12, 0.0, 0.12)]
B.add(prim('tube', pts=bridge, r=0.004, segs=6), Matrix.Identity(4), HRD, GOGGLE, HEAD)
strap = [head_point(a, math.asin((gz - HC.z) / HCZ) + 0.12 * (1 - math.cos(a)) * 0.5, 0.0115)[0] for a in [0.55 + i * (2 * math.pi - 1.1) / 30 for i in range(31)]]
B.add(prim('tube', pts=strap, r=0.0065, segs=4, smooth=False), Matrix.Identity(4), CAN, (0.12, 0.1, 0.07), HEAD)


# A-14 oxygen mask: a rubber cup over nose and mouth with its rolled rim, valve boss and hose
def mask_bm():
    bm = bmesh.new()
    nu, nv = 20, 16
    rows = []
    top_z, bot_z = EYE_Z - HC.z - 0.016, -0.112
    for j in range(nv + 1):
        v = j / nv
        z = lerp(top_z, bot_z, v)
        halfw = 0.012 + 0.04 * math.sin(min(1.0, v * 1.55) * math.pi / 2) - 0.012 * smoothstep(0.75, 1.0, v)
        row = []
        for i in range(nu + 1):
            u = -1 + 2 * i / nu
            x = u * halfw
            # face surface below, then the bulge of the cup
            th = math.atan2(x, 0.09)
            ph = math.asin(max(-1.0, min(1.0, z / HCZ)))
            fp, nrm = head_point(th, ph, 0.0, shaped=False)
            bulge = 0.012 + 0.024 * (1 - u * u) ** 0.8 * math.sin(min(1.0, 0.1 + v * 1.05) * math.pi) ** 0.6
            if j in (0, nv) or i in (0, nu):
                bulge = 0.004
            row.append(bm.verts.new(fp + Vector((0, -1, 0)).lerp(nrm, 0.4).normalized() * bulge))
        rows.append(row)
    for r0, r1 in zip(rows, rows[1:]):
        for i in range(nu):
            bm.faces.new([r0[i], r1[i], r1[i + 1], r0[i + 1]])
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # outward: away from the head centre
    for fc in bm.faces:
        if fc.normal.dot(fc.calc_center_median() - HC) < 0:
            fc.normal_flip()
    bm.normal_update()
    return bm, rows


mb, mrows = mask_bm()
B.add_bm(mb, HRD, RUBBER, HEAD)
rim = [v.co.copy() for v in mrows[0]] + [r[-1].co.copy() for r in mrows[1:]] + [v.co.copy() for v in reversed(mrows[-1][:-1])] + [r[0].co.copy() for r in reversed(mrows[:-1])]
B.add(prim('tube', pts=rim, r=0.0032, segs=6), Matrix.Identity(4), HRD, RUBBER_DARK, HEAD)
mb.free()
# the valve boss low on the front of the cup, the hose connector below it
vb = HC + Vector((0, -0.106, -0.078))
B.add(prim('cyl', r1=0.019, r2=0.017, h=0.02, segs=20), Matrix.Translation(vb) @ Euler((math.pi / 2 + 0.5, 0, 0)).to_matrix().to_4x4(), HRD, RUBBER_DARK, HEAD)
B.add(prim('cyl', r1=0.012, h=0.006, segs=16), Matrix.Translation(vb + Vector((0, -0.009, -0.005))) @ Euler((math.pi / 2 + 0.5, 0, 0)).to_matrix().to_4x4(), HRD, (0.12, 0.12, 0.1), HEAD)
B.add(prim('cyl', r1=0.016, h=0.03, segs=16), Matrix.Translation(HC + Vector((0, -0.104, -0.1))), HRD, HOSE, HEAD)

# corrugated hose down the chest to the clip on the harness (head end rigid, chest end on the chest)
hose = [HC + Vector((0, -0.104, -0.112)), Vector((0.012, -0.175, 1.49)), Vector((0.04, -0.2, 1.42)), Vector((0.065, -0.205, 1.34)), Vector((0.08, -0.198, 1.26)), Vector((0.085, -0.19, 1.21))]


def hose_bm():
    L = chain_len(hose)
    sec = []
    s = 0.0
    while s <= L:
        c, t = chain(hose, s)
        ax, ay = frame_for(t, Vector((1, 0, 0)))
        r = 0.0155 * (1 + 0.14 * math.sin(s * 2 * math.pi / 0.011))
        sec.append((c, ax, ay, r, r, r, 2.0, None))
        s += 0.0022
    return loft(sec, 12)


hb = hose_bm()
B.add_bm(hb, HRD, HOSE, ['head', 'neck', 'chest'])
hb.free()
B.add(prim('box', size=(0.045, 0.022, 0.06)), trs((0.085, -0.19, 1.195)), HRD, BRASS, CHEST)   # clip / connector

# ================= B-4 Mae West, harness, jacket details =================
for s in (1, -1):
    mw = bmesh.new()
    bmesh.ops.create_uvsphere(mw, u_segments=20, v_segments=14, radius=1.0)
    for v in mw.verts:
        x, y, z = v.co
        v.co = Vector((x * 0.092, y * 0.042, z * 0.12))
        # vertical baffle seams
        v.co.y -= 0.004 * math.cos(x * 30) * (y < 0)
    bmesh.ops.transform(mw, matrix=trs((s * 0.088, -0.142, 1.29), (0.12, 0, s * -0.12)), verts=mw.verts)
    mw.normal_update()
    B.add_bm(mw, CAN, MAEWEST, CHEST)
    mw.free()
    # inflation tube and the CO2 pull cord
    B.add(prim('cyl', r1=0.006, h=0.07, segs=8), trs((s * 0.04, -0.19, 1.37), (0.4, 0, 0)), HRD, (0.04, 0.04, 0.035), CHEST)
B.add(prim('torus', R=0.125, r=0.038, nu=28, nv=10, arc=math.pi * 1.2), trs((0, 0.018, 1.452), (0, 0, math.pi * 1.4 - math.pi / 2), (1.08, 1.0, 1.0)), CAN, MAEWEST, ['chest', 'neck'])
# parachute harness: chest strap, shoulder straps and leg loops, with brass fittings
B.add(prim('box', size=(0.32, 0.012, 0.038)), trs((0, -0.19, 1.165)), CAN, WEB, CHEST)
for s in (1, -1):
    st = [Vector((s * 0.1, -0.17, 0.98)), Vector((s * 0.1, -0.188, 1.15)), Vector((s * 0.11, -0.17, 1.33)), Vector((s * 0.12, -0.09, 1.45)), Vector((s * 0.12, 0.05, 1.44)), Vector((s * 0.11, 0.13, 1.3))]
    B.add(prim('tube', pts=st, r=0.016, segs=6), Matrix.Identity(4) @ Matrix.Diagonal((1, 1, 1, 1)), CAN, WEB, TORSO)
    B.add(prim('torus', R=0.104, r=0.012, nu=24, nv=5), trs((s * 0.1, -0.005, 0.81), (0, math.pi / 2, 0), (1, 1.2, 1)), CAN, WEB, leg_g('L' if s > 0 else 'R'))
    B.add(prim('box', size=(0.044, 0.016, 0.044)), trs((s * 0.1, -0.192, 1.03)), HRD, BRASS, PELVIS)
    B.add(prim('torus', R=0.016, r=0.004, nu=12, nv=4), trs((s * 0.1, -0.2, 1.165), (math.pi / 2, 0, 0)), HRD, BRASS, CHEST)
B.add(prim('box', size=(0.064, 0.022, 0.064)), trs((0, -0.2, 1.165)), HRD, BRASS, CHEST)
# zipper tape, seams and the slash-pocket welts of the B-3
B.add(prim('box', size=(0.016, 0.01, 0.42)), trs((0, -0.157, 1.11)), LEA, SEAM, TORSO)
for i in range(40):
    B.add(prim('box', size=(0.008, 0.003, 0.0025)), trs((0, -0.163, 0.9 + i * 0.0105)), HRD, BRASS, TORSO)
for s in (1, -1):
    B.add(prim('box', size=(0.012, 0.008, 0.13)), trs((s * 0.13, -0.142, 1.0), (0, s * 0.35, 0)), LEA, SEAM, TORSO)
    for i in range(12):
        B.add(prim('box', size=(0.003, 0.002, 0.005)), trs((s * 0.13 + s * 0.035 * (i / 11 - 0.5), -0.149, 0.94 + i * 0.01)), LEA, STITCH, TORSO)
    seam = [Vector((s * x, -0.06 + 0.5 * (x - 0.2) * 0, z)) for x, z in [(0.205, 1.4), (0.21, 1.3), (0.2, 1.2), (0.19, 1.1), (0.187, 1.0), (0.19, 0.9)]]
    B.add(prim('tube', pts=seam, r=0.003, segs=5), Matrix.Identity(4), LEA, SEAM, TORSO)
body_ob = B.finish()

# ================= M1 flak vest (own mesh) =================
V = Builder('crewFlakVest')
secs = []
for z in [1.0 + 0.0125 * i for i in range(38)]:
    if z > 1.462:
        break
    rx, ryf, ryb = interp(JACKET_T, z)
    secs.append((Vector((0, 0.004, z)), Vector((1, 0, 0)), Vector((0, 1, 0)), rx + 0.032, ryb + 0.03, ryf + 0.038, 2.6,
                 (lambda pt, th: 0.004 * math.sin(pt.z * 2 * math.pi / 0.08) ** 8)))
vb = loft(secs, 40)
V.add_bm(vb, CAN, lambda p: VEST_DARK if (p.z * 12.5) % 1.0 < 0.12 or abs(p.x) > 0.228 else VEST, CHEST)
vb.free()
# apron (groin plate) hanging at the front, shoulder straps, the red quick-release tab
V.add(prim('box', size=(0.27, 0.025, 0.2)), trs((0, -0.175, 0.92), (0.1, 0, 0)), CAN, VEST, PELVIS)
for s in (1, -1):
    st = [Vector((s * 0.13, -0.17, 1.4)), Vector((s * 0.135, -0.1, 1.47)), Vector((s * 0.14, 0.0, 1.49)), Vector((s * 0.135, 0.09, 1.46)), Vector((s * 0.13, 0.16, 1.39))]
    sb = loft(tube_sections(st, lambda t: (0.036, 0.011, 0.011), Vector((1, 0, 0)), step=0.02), 8)
    V.add_bm(sb, CAN, VEST, CHEST)
    sb.free()
V.add(prim('box', size=(0.05, 0.02, 0.07)), trs((-0.12, -0.2, 1.1)), CAN, VEST_TAB, CHEST)
vest_ob = V.finish()

# ================= M4 steel helmet (own mesh) =================
hm = bmesh.new()
nu, nv = 40, 14
rows = []
for j in range(nv + 1):
    ph = math.radians(-8 + 98 * j / nv)
    row = []
    for i in range(nu):
        th = 2 * math.pi * i / nu
        x = 0.1 * math.cos(ph) * math.sin(th)
        y = -0.122 * math.cos(ph) * math.cos(th)
        z = 0.088 * math.sin(ph)
        row.append(hm.verts.new(HC + Vector((x, y + 0.004, z + 0.064))))
    rows.append(row)
for r0, r1 in zip(rows, rows[1:]):
    for i in range(nu):
        hm.faces.new([r0[i], r0[(i + 1) % nu], r1[(i + 1) % nu], r1[i]])
hm.normal_update()
Hh.add_bm(hm, HRD, STEEL, HEAD)
hm.free()
Hh.add(prim('torus', R=1, r=0.006, nu=40, nv=6), trs(HC + Vector((0, 0.004, 0.052)), (0, 0, 0), (0.102, 0.125, 1)), HRD, STEEL, HEAD)
for s in (1, -1):   # hinged ear-flap plates over the earphones: curved shells continuing the bowl down
    eb = bmesh.new()
    rows = []
    for j in range(7):
        ph = math.radians(-6 - 9 * j)
        row = []
        for i in range(9):
            th = s * math.radians(90 + (-34 + 68 * i / 8) * (1 - 0.25 * j / 6))
            x = 0.104 * math.cos(ph) * math.sin(th)
            y = -0.122 * math.cos(ph) * math.cos(th)
            z = 0.1 * math.sin(ph)
            row.append(eb.verts.new(HC + Vector((x, y + 0.004, z + 0.06))))
        rows.append(row)
    for r0, r1 in zip(rows, rows[1:]):
        for i in range(8):
            f = [r0[i], r0[i + 1], r1[i + 1], r1[i]] if s > 0 else [r0[i], r1[i], r1[i + 1], r0[i + 1]]
            eb.faces.new(f)
    eb.normal_update()
    sh = bmesh.ops.solidify(eb, geom=eb.faces[:], thickness=0.004)
    eb.normal_update()
    Hh.add_bm(eb, HRD, STEEL, HEAD)
    eb.free()
    Hh.add(prim('cyl', r1=0.005, h=0.02, segs=8), trs(HC + Vector((s * 0.104, 0.006, 0.055)), (0, math.pi / 2, 0)), HRD, (0.03, 0.03, 0.025), HEAD)
helmet_ob = Hh.finish()

# ================= shade: baked AO x wear (vertex colour alpha) =================


def bake_ao(ob, others):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 64
    sc.render.bake.target = 'VERTEX_COLORS'
    sc.world = sc.world or bpy.data.worlds.new('w')
    sc.world.light_settings.distance = 0.12
    for o in others:
        o.hide_render = True
    me = ob.data
    ao = me.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = ao
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO')
    vals = [sum(ao.data[i].color[:3]) / 3 for i in range(len(me.vertices))]
    me.color_attributes.remove(me.color_attributes['AO'])
    me.color_attributes.active_color = me.color_attributes['Col']
    for o in others:
        o.hide_render = False
    return vals


def apply_shade(ob, ao):
    me = ob.data
    col = me.color_attributes['Col']
    for poly in me.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices):
            p = me.vertices[vi].co
            a = ao[vi] if ao else 1.0
            wear = 0.88 + 0.12 * noise.noise(p * 7.0) + 0.05 * noise.noise(p * 31.0)
            k = max(0.18, min(1.0, (0.22 + 0.78 * a) * wear))
            c = col.data[li].color
            col.data[li].color = (c[0], c[1], c[2], k)


for ob, others in ((body_ob, [vest_ob, helmet_ob]), (vest_ob, [helmet_ob]), (helmet_ob, [vest_ob])):
    apply_shade(ob, None if NO_BAKE else bake_ao(ob, others))

# ---------------- skinning ----------------


def skin(ob, grp_layer=True, rigid=None):
    me = ob.data
    for n in ORDER:
        ob.vertex_groups.new(name=n)
    attr = me.attributes.get('grp')
    for v in me.vertices:
        allowed = rigid or list(GROUPS[attr.data[v.index].value]) if attr else rigid
        if rigid:
            allowed = rigid
        if len(allowed) == 1:
            ob.vertex_groups[allowed[0]].add([v.index], 1.0, 'REPLACE')
            continue
        if tuple(allowed) == tuple(TORSO):
            # the jacket's torso: spine bones, with the upper arms only round the shoulder joints
            # (a flank weighted to the arm would be dragged along when he raises it)
            ws = weights_for(v.co, ['hips', 'spine', 'chest', 'neck'])
            for side, nm in ((1, 'L'), (-1, 'R')):
                d = (v.co - REST[f'upperarm.{nm}'][0]).length
                t = 0.55 * smoothstep(0.13, 0.05, d) * (1.0 if v.co.x * side > 0.08 else 0.0)
                if t > 0.01:
                    ws = [(w * (1 - t), n) for w, n in ws] + [(t, f'upperarm.{nm}')]
            for w, n in ws:
                ob.vertex_groups[n].add([v.index], w, 'REPLACE')
            continue
        for w, n in weights_for(v.co, allowed):
            ob.vertex_groups[n].add([v.index], w, 'REPLACE')
    mod = ob.modifiers.new('rig', 'ARMATURE')
    mod.object = arm
    ob.parent = arm


skin(body_ob)
skin(vest_ob)
skin(helmet_ob, rigid=['head'])
for ob in (body_ob, vest_ob, helmet_ob):
    if ob.data.attributes.get('grp'):
        ob.data.attributes.remove(ob.data.attributes['grp'])

# LOD1: the same man at an eighth of the triangles (for the far glimpses: radio room, tail)
lod = body_ob.copy()
lod.data = body_ob.data.copy()
lod.name = 'crewBodyLod'
scene.collection.objects.link(lod)
dec = lod.modifiers.new('dec', 'DECIMATE')
dec.ratio = 0.12
lod.modifiers.move(len(lod.modifiers) - 1, 0)
bpy.context.view_layer.objects.active = lod
bpy.ops.object.select_all(action='DESELECT')
lod.select_set(True)
bpy.ops.object.modifier_apply(modifier='dec')
# the LOD has no eyes / lids (sub-pixel at its range): drop those faces
bmL = bmesh.new()
bmL.from_mesh(lod.data)
eye_i = [i for i, m in enumerate(lod.data.materials) if m == EYE]
bmesh.ops.delete(bmL, geom=[f for f in bmL.faces if f.material_index in eye_i], context='FACES')
bmL.to_mesh(lod.data)
bmL.free()

# ---------------- poses ----------------
# A pose: hips location + world rotation (Euler XYZ, relative to the rest pose), then per bone either a
# world direction (Vector: the bone is turned the shortest way from its inherited direction) or
# ('rot', Euler) for an absolute world rotation relative to rest. Unlisted bones inherit their parent.
D = lambda x, y, z: Vector((x, y, z)).normalized()  # noqa: E731
CURL = {'index.L': ('local', Euler((0, 0, 0))), 'index.R': ('local', Euler((0, 0, 0)))}


def curl_matrix(nm):
    # the index finger curled round the grip: rotate about the hand's f axis (local to the hand)
    s = 1 if nm == 'L' else -1
    w, d, n, f = hand_frame(s)
    return Quaternion(f, 1.45).to_matrix()


def solve(pose):
    Rw, head_pos, mats = {}, {}, {}
    for n in ORDER:
        h0, t0, M0 = REST[n]
        par = PARENT[n]
        if par is None:
            loc, rot = pose['hips']
            Rw[n] = Euler(rot, 'XYZ').to_matrix()
            head_pos[n] = Vector(loc)
        else:
            ph0 = REST[par][0]
            head_pos[n] = head_pos[par] + Rw[par] @ (h0 - ph0)
            Rw[n] = Rw[par].copy()
            spec = pose.get(n)
            if n.startswith('index.') and spec is None:
                # curled in the fist unless a pose straightens it: rotate in the hand's rest frame
                Rw[n] = Rw[par] @ curl_matrix(n[-1])
            elif isinstance(spec, Vector):
                cur = Rw[n] @ (t0 - h0).normalized()
                Rw[n] = cur.rotation_difference(spec).to_matrix() @ Rw[n]
            elif isinstance(spec, tuple) and spec[0] == 'rot':
                Rw[n] = spec[1].to_matrix()
            elif isinstance(spec, tuple) and spec[0] == 'drot':   # extra rotation on top of the inherited one
                Rw[n] = spec[1].to_matrix() @ Rw[n]
            elif isinstance(spec, tuple) and spec[0] == 'local':  # rotation in the parent's rest frame
                Rw[n] = Rw[par] @ spec[1].to_matrix()
        mats[n] = Matrix.Translation(head_pos[n]) @ (Rw[n] @ M0.to_3x3()).to_4x4()
    return mats


def apply_key(pose, frame, prev):
    mats = solve(pose)
    for n in ORDER:
        pb = arm.pose.bones[n]
        M0 = REST[n][2]
        par = PARENT[n]
        if par is None:
            basis = M0.inverted() @ mats[n]
        else:
            rel = REST[par][2].inverted() @ M0
            basis = rel.inverted() @ mats[par].inverted() @ mats[n]
        loc, q, _ = basis.decompose()
        if n in prev and prev[n].dot(q) < 0:
            q.negate()
        prev[n] = q.copy()
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = q
        pb.keyframe_insert('rotation_quaternion', frame=frame, group=n)
        if par is None:
            pb.location = loc
            pb.keyframe_insert('location', frame=frame, group=n)


def lerp_pose(a, b, k):
    out = {}
    la, ra = a['hips']; lb, rb = b['hips']
    out['hips'] = (Vector(la).lerp(Vector(lb), k), tuple(x + (y - x) * k for x, y in zip(ra, rb)))
    for n in set(a) | set(b):
        if n == 'hips':
            continue
        sa, sb = a.get(n), b.get(n)
        if isinstance(sa, Vector) and isinstance(sb, Vector):
            out[n] = sa.slerp(sb, k) if sa.angle(sb) > 1e-4 else sa
        else:
            out[n] = sb if k > 0.5 else sa
    return out


def merge(base, **over):
    p = dict(base)
    for k, v in over.items():
        p[k.replace('_L', '.L').replace('_R', '.R')] = v
    return p


STAND = {
    'hips': ((0, 0.0, 0.95), (0, 0, 0)),
    'spine': D(0, -0.04, 1), 'chest': D(0, 0.0, 1), 'neck': D(0, -0.1, 1), 'head': D(0, 0, 1),
    'upperarm.L': D(0.18, 0.02, -1), 'forearm.L': D(0.1, -0.35, -1), 'hand.L': D(0.08, -0.3, -1),
    'upperarm.R': D(-0.18, 0.02, -1), 'forearm.R': D(-0.1, -0.35, -1), 'hand.R': D(-0.08, -0.3, -1),
    'thigh.L': D(0.03, 0.0, -1), 'shin.L': D(0.0, 0.05, -1), 'foot.L': D(0, -1, -0.35),
    'thigh.R': D(-0.03, 0.0, -1), 'shin.R': D(0.0, 0.05, -1), 'foot.R': D(0, -1, -0.35),
}
# braced at the gun: knees bent, leaning into the grips, head down on the sight
GUN = merge(STAND,
            hips=((0, 0.06, 0.86), (0.1, 0, 0)),
            spine=D(0, -0.32, 1), chest=D(0, -0.42, 1), neck=D(0, -0.6, 1), head=('drot', Euler((0.25, 0, 0))),
            upperarm_L=D(0.15, -0.75, -0.5), forearm_L=D(-0.15, -1, 0.15), hand_L=D(-0.1, -1, 0.0),
            upperarm_R=D(-0.15, -0.75, -0.5), forearm_R=D(0.15, -1, 0.15), hand_R=D(0.1, -1, 0.0),
            thigh_L=D(0.08, -0.38, -1), shin_L=D(0.0, 0.32, -1), foot_L=D(0, -1, -0.3),
            thigh_R=D(-0.06, -0.1, -1), shin_R=D(0.0, 0.42, -1), foot_R=D(0, -1, -0.3))
# lying on his back on the walkway, head turned aside, the right hand pressed on the wound in his
# side, the left knee drawn up
DOWN = {
    'hips': ((0, 0.0, 0.15), (-1.45, 0.25, 0)),
    'spine': D(0.02, 1, 0.07), 'chest': D(0.05, 1, 0.05), 'neck': D(0.1, 1, 0.25), 'head': D(0.45, 1, 0.3),
    'upperarm.L': D(0.9, 0.3, -0.1), 'forearm.L': D(0.6, -0.8, 0.05), 'hand.L': D(0.5, -0.9, -0.05),
    'upperarm.R': D(-0.35, -0.75, 0.25), 'forearm.R': D(0.85, -0.2, 0.45), 'hand.R': D(0.9, -0.3, 0.1),
    'thigh.L': D(0.15, -0.75, 0.6), 'shin.L': D(0.05, -0.6, -0.8), 'foot.L': D(0.2, -0.3, 1),
    'thigh.R': D(-0.2, -1, 0.15), 'shin.R': D(-0.05, -0.95, -0.25), 'foot.R': D(-0.4, -0.3, 1),
}
KNEEL_HELP = {
    'hips': ((0, 0.12, 0.45), (0.15, 0, 0)),
    'spine': D(0, -0.6, 1), 'chest': D(0, -0.9, 1), 'neck': D(0, -1, 0.5), 'head': ('drot', Euler((0.35, 0, 0))),
    'upperarm.L': D(0.1, -0.55, -1), 'forearm.L': D(-0.25, -0.5, -1), 'hand.L': D(-0.3, -0.6, -1),
    'upperarm.R': D(-0.1, -0.55, -1), 'forearm.R': D(0.25, -0.5, -1), 'hand.R': D(0.3, -0.6, -1),
    'thigh.L': D(0.12, -0.35, -1), 'shin.L': D(0.0, 1, -0.06), 'foot.L': D(0, 0.35, -1),
    'thigh.R': D(-0.1, -0.85, -0.5), 'shin.R': D(0.0, 0.08, -1), 'foot.R': D(0, -1, -0.2),
}
SIT = {
    'hips': ((0, 0.04, 0.5), (0, 0, 0)),
    'spine': D(0, -0.2, 1), 'chest': D(0, -0.35, 1), 'neck': D(0, -0.55, 1), 'head': ('drot', Euler((0.35, 0, 0))),
    'upperarm.L': D(0.15, -0.55, -1), 'forearm.L': D(-0.2, -1, 0.05), 'hand.L': D(-0.2, -1, -0.15),
    'upperarm.R': D(-0.15, -0.55, -1), 'forearm.R': D(0.2, -1, 0.08), 'hand.R': D(0.2, -1, -0.2),
    'thigh.L': D(0.08, -1, 0.02), 'shin.L': D(0.0, -0.12, -1), 'foot.L': D(0, -1, -0.25),
    'thigh.R': D(-0.08, -1, 0.02), 'shin.R': D(0.0, -0.2, -1), 'foot.R': D(0, -1, -0.25),
}
KNEEL = {   # tail gunner: knees on the pads, sat back on the bicycle seat, hands up on the gun handles
    'hips': ((0, 0.12, 0.5), (0.05, 0, 0)),
    'spine': D(0, -0.25, 1), 'chest': D(0, -0.35, 1), 'neck': D(0, -0.5, 1), 'head': ('drot', Euler((0.1, 0, 0))),
    'upperarm.L': D(0.15, -0.9, -0.35), 'forearm.L': D(-0.2, -1, 0.35), 'hand.L': D(-0.2, -1, 0.2),
    'upperarm.R': D(-0.15, -0.9, -0.35), 'forearm.R': D(0.2, -1, 0.35), 'hand.R': D(0.2, -1, 0.2),
    'thigh.L': D(0.15, -0.55, -1), 'shin.L': D(0.0, 1, -0.05), 'foot.L': D(0, 0.3, -1),
    'thigh.R': D(-0.15, -0.55, -1), 'shin.R': D(0.0, 1, -0.05), 'foot.R': D(0, 0.3, -1),
}


def clip(name, keys):
    """keys: list of (frame, pose)."""
    arm.animation_data_create()
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    prev = {}
    for f, p in keys:
        apply_key(p, f, prev)
    for fc in getattr(act, 'fcurves', []) or []:
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, int(keys[0][0]), act)
    strip.name = name
    track.mute = True
    arm.animation_data.action = None
    return act


# idle: breathing, a look round and a weight shift (4 s)
def idle_key(t):
    p = merge(STAND)
    lx, ly = STAND['hips'][0][0], STAND['hips'][0][1]
    p['hips'] = ((lx + 0.015 * math.sin(t * math.pi * 2 / 4), ly, 0.95 - 0.004 * math.sin(t * math.pi * 2 / 4) ** 2), (0, 0.02 * math.sin(t * math.pi * 2 / 4), 0))
    p['head'] = ('drot', Euler((0.06 * math.sin(t * 1.3), 0, 0.35 * math.sin(t * math.pi * 2 / 4))))
    p['chest'] = ('drot', Euler((-0.025 * math.sin(t * math.pi * 2 / 2), 0, 0)))
    return p


clip('idle', [(int(i * 15), idle_key(i * 0.5)) for i in range(9)])


# fire: braced, the M2 shaking the man at ~12 Hz (0.5 s loop)
def fire_key(i):
    p = dict(GUN)
    j = (-1) ** i
    p['chest'] = ('drot', Euler((0.03 * j, 0.0, 0.02 * j)))
    p['head'] = ('drot', Euler((0.25 + 0.02 * j, 0.015 * j, 0)))
    (x, y, z), r = GUN['hips']
    p['hips'] = ((x, y + 0.006 * j, z), r)
    return p


clip('fire', [(i * 1.25, fire_key(i)) for i in range(13)])
# hit: jerked back by the round, knees go, he crumples onto the walkway (1.3 s, plays once)
JERK = merge(GUN, hips=((0, 0.12, 0.84), (-0.25, 0, 0.05)), chest=D(0.05, 0.25, 1), neck=D(0, 0.3, 1),
             head=('drot', Euler((-0.4, 0, 0.2))), upperarm_L=D(0.6, -0.3, 0.2), forearm_L=D(0.5, 0.2, 0.6),
             upperarm_R=D(-0.4, -0.5, -0.3), forearm_R=D(0.2, -0.6, 0.6))
BUCKLE = merge(KNEEL_HELP, hips=((0.05, 0.08, 0.5), (0.25, 0.25, 0.1)), chest=D(0.1, -0.5, 1), neck=D(0.2, -0.6, 1),
               upperarm_L=D(0.5, -0.1, -1), forearm_L=D(0.3, -0.3, -1), upperarm_R=D(-0.3, -0.2, -1), forearm_R=D(0.6, -0.4, 0.3))
FALL = lerp_pose(BUCKLE, DOWN, 0.55)
FALL['hips'] = ((0.0, 0.05, 0.28), (-0.8, 0.3, 0.05))
clip('hit', [(0, GUN), (4, JERK), (13, BUCKLE), (24, FALL), (34, DOWN), (40, DOWN)])


# down: lying wounded (4 s loop): laboured breathing, the hand pressing the wound, the drawn-up knee
# rocking, the head rolling, the free hand lifting and falling back
def down_key(t):
    p = dict(DOWN)
    br = 0.5 + 0.5 * math.sin(t * math.pi * 2 / 1.0)
    w = math.sin(t * math.pi * 2 / 4)
    p['chest'] = DOWN['chest'].lerp(Vector((0.05, 1, 0.16)).normalized(), br)
    p['head'] = DOWN['head'].slerp(D(-0.2, 1, 0.35), 0.5 + 0.5 * math.sin(t * math.pi * 2 / 4 + 1.2))
    p['thigh.L'] = DOWN['thigh.L'].slerp(D(0.3, -0.5, 0.8), 0.5 + 0.5 * w)
    lift = max(0.0, math.sin(t * math.pi * 2 / 4 - 0.8)) ** 2
    p['upperarm.L'] = DOWN['upperarm.L'].slerp(D(0.5, 0.1, 0.9), lift)
    p['forearm.L'] = DOWN['forearm.L'].slerp(D(0.2, -0.3, 1), lift)
    p['forearm.R'] = DOWN['forearm.R'].slerp(D(0.9, -0.15, 0.35), br * 0.5)
    return p


clip('down', [(int(i * 7.5), down_key(i * 0.25)) for i in range(17)])


# help: kneeling over a wounded man, pressing a dressing on him (2 s loop)
def help_key(t):
    k = 0.5 + 0.5 * math.sin(t * math.pi * 2 / 1.0)
    p = dict(KNEEL_HELP)
    (x, y, z), r = KNEEL_HELP['hips']
    p['hips'] = ((x, y, z - 0.015 * k), r)
    p['chest'] = KNEEL_HELP['chest'].lerp(D(0, -1, 0.8), k)
    p['head'] = ('drot', Euler((0.35, 0, 0.25 * math.sin(t * math.pi * 2 / 2))))
    return p


clip('help', [(int(i * 7.5), help_key(i * 0.25)) for i in range(9)])


# sit: radio operator at his table, writing in the log and glancing at the sets (4 s loop)
def sit_key(t):
    p = dict(SIT)
    p['forearm.R'] = SIT['forearm.R'].slerp(D(0.05, -1, 0.0), 0.5 + 0.5 * math.sin(t * math.pi * 2 / 0.8))
    p['head'] = ('drot', Euler((0.35 - 0.3 * max(0.0, math.sin(t * math.pi * 2 / 4)), 0, 0.3 * math.sin(t * math.pi * 2 / 4 + 1))))
    return p


clip('sit', [(int(i * 6), sit_key(i * 0.2)) for i in range(21)])


# kneel: tail gunner at his guns, swaying with the airframe (4 s loop)
def kneel_key(t):
    p = dict(KNEEL)
    (x, y, z), r = KNEEL['hips']
    p['hips'] = ((x + 0.01 * math.sin(t * math.pi * 2 / 4), y, z), (r[0], 0.04 * math.sin(t * math.pi * 2 / 4), r[2]))
    p['head'] = ('drot', Euler((0.1, 0, 0.12 * math.sin(t * math.pi * 2 / 2.7))))
    return p


clip('kneel', [(int(i * 15), kneel_key(i * 0.5)) for i in range(9)])

# rest pose back in place for export
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.rotation_quaternion = Quaternion()
    pb.location = Vector()

# ---------------- first-person forearm and gloved fist round a grip ----------------
# Origin on the grip axis (grip along Blender Z = game +Y), the hand behind it (Blender +Y = game
# aft), the forearm dropping back and down toward the elbow (out of the sight picture) and a little
# out (+X: the left hand; the game mirrors it).
F = Builder('fpArm')
FG = ['hand.L']
# fist frame: the grip axis is f (Blender Z); the hand lies behind it (d toward -Y... the knuckles face aft-up)
fw = Vector((0.004, 0.075, -0.012))
fd = Vector((0.0, -1.0, 0.18)).normalized()       # wrist -> knuckles, toward the grip
ff = Vector((0, 0, 1))                             # across the knuckles = along the grip
fn = fd.cross(ff).normalized() * -1                # out of the palm
glove(F, 1, 'L', fw, fd, fn, ff, mat=LEA, curl_index=True, group=FG, index_group=FG)
F.add(prim('cyl', r1=0.05, r2=0.05, h=0.035, segs=20), look_matrix(Vector((0.012, 0.115, -0.04)), Vector((0.017, 0.135, -0.065))), FLE, FLEECE, FG)
F.add(prim('cyl', r1=0.05, r2=0.058, h=0.27, segs=20), look_matrix(Vector((0.017, 0.132, -0.06)), Vector((0.056, 0.232, -0.305))), LEA, JACKET, FG)
fp_ob = F.finish()
fp_ob.location = (0, 0, 0)
apply_shade(fp_ob, None)
if fp_ob.data.attributes.get('grp'):
    fp_ob.data.attributes.remove(fp_ob.data.attributes['grp'])

free_tmp()
for ob in (body_ob, vest_ob, helmet_ob, lod, fp_ob):
    for p in ob.data.polygons:
        p.use_smooth = True
    # cylindrical UVs round the body axis, 4 repeats per metre (the game's fabric detail maps)
    uv = ob.data.uv_layers.new(name='UVMap')
    for poly in ob.data.polygons:
        cx = sum((ob.data.vertices[v].co for v in poly.vertices), Vector()) / len(poly.vertices)
        a0 = math.atan2(cx.x, cx.y)
        for li, vi in zip(poly.loop_indices, poly.vertices):
            co = ob.data.vertices[vi].co
            a = math.atan2(co.x, co.y)
            if a - a0 > math.pi: a -= 2 * math.pi
            if a0 - a > math.pi: a += 2 * math.pi
            uv.data[li].uv = (a / (2 * math.pi) * 4 * 1.2, co.z * 4)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
export_glb(OUT, objects=[arm, body_ob, vest_ob, helmet_ob, lod, fp_ob], animations=True,
           extra=dict(export_animation_mode='NLA_TRACKS', export_skins=True, export_def_bones=False,
                      export_force_sampling=True, export_frame_step=1, export_optimize_animation_size=True))
print('crew written', OUT, len(body_ob.data.polygons), 'faces;', len(lod.data.polygons), 'lod faces;', len(vest_ob.data.polygons), 'vest;', len(helmet_ob.data.polygons), 'helmet')
