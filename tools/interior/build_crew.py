# B-17 crewman for the gunner's interior (Phase 10 goal 07), generated in Blender.
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/interior/build_crew.py -- out.glb
# One skinned man (B-3 sheepskin jacket with fleece collar and cuffs, A-3 trousers, A-6 boots,
# M4 flak helmet over a leather helmet, B-8 goggles, A-14 oxygen mask and hose, B-4 Mae West,
# parachute harness, M1 flak vest as its own mesh so the game can leave it off), a simple
# 18-bone rig, a low-detail LOD, and the clips the game plays:
#   idle, fire, hit, down, help, sit, kneel
# plus 'fpArm': a static first-person forearm and gloved fist around a grip (the player's own
# hands on the guns). Everything is vertex-coloured: the game recolours the jacket per crewman.
import bpy
import math
import os
import sys
from mathutils import Vector, Matrix, Euler, Quaternion

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_util import reset_scene, material, use_vertex_colors, MeshBuilder, prim, free_tmp, trs, look_matrix, export_glb  # noqa: E402

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.path.join(os.path.dirname(__file__), 'out', 'crew.glb')
reset_scene()
scene = bpy.context.scene
scene.render.fps = 30

# ---------------- colours (linear). The game swaps JACKET / FLEECE / TROUSERS per crewman ----------------
JACKET = (0.20, 0.11, 0.055)      # B-3 horsehide, brown
FLEECE = (0.62, 0.55, 0.42)       # sheepskin lining (collar, cuffs, hem)
TROUSERS = (0.17, 0.105, 0.06)    # A-3 sheepskin trousers
BOOT = (0.075, 0.05, 0.035)
GLOVE = (0.09, 0.06, 0.04)
SKIN = (0.55, 0.36, 0.27)
LEATHER_HELMET = (0.11, 0.065, 0.035)
STEEL = (0.10, 0.11, 0.075)       # olive drab M4 flak helmet
RUBBER = (0.07, 0.09, 0.07)       # A-14 mask, olive-grey rubber
HOSE = (0.06, 0.065, 0.055)
LENS = (0.03, 0.035, 0.04)
BRASS = (0.45, 0.33, 0.12)
WEB = (0.36, 0.33, 0.22)          # harness webbing
MAEWEST = (0.62, 0.42, 0.06)      # B-4 life preserver, chrome yellow, faded
VEST = (0.13, 0.14, 0.085)        # M1 flak vest, olive canvas
VEST_TAB = (0.45, 0.06, 0.04)     # red quick-release tab

cloth = material('crewCloth', (1, 1, 1), rough=0.85, metal=0.0)
leather = material('crewLeather', (1, 1, 1), rough=0.65, metal=0.0)
hard = material('crewHard', (1, 1, 1), rough=0.42, metal=0.25)
for m in (cloth, hard, leather):
    use_vertex_colors(m)

# ---------------- rig ----------------
# Blender frame, man facing -Y, +X his left, Z up, origin on the floor between the feet.
BONES = [
    # name, head, tail, parent, connected
    ('hips', (0, 0, 0.95), (0, 0, 1.06), None, False),
    ('spine', (0, 0, 1.06), (0, 0.0, 1.24), 'hips', True),
    ('chest', (0, 0, 1.24), (0, 0.0, 1.44), 'spine', True),
    ('neck', (0, 0, 1.44), (0, -0.01, 1.54), 'chest', True),
    ('head', (0, -0.01, 1.54), (0, -0.01, 1.76), 'neck', True),
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


def weights_for(p, allowed=None, sharp=7.0):
    names = allowed or ORDER
    ds = [(seg_dist(p, REST[n][0], REST[n][1]), n) for n in names]
    ds.sort()
    ds = ds[:3]
    w = [(1.0 / (d + 0.012) ** sharp, n) for d, n in ds]
    tot = sum(x for x, _ in w)
    return [(x / tot, n) for x, n in w if x / tot > 0.02]


# ---------------- body: a skin-modifier hull over a joint skeleton ----------------
SK = []   # (pos, (rx, ry))
EDGES = []


def sk(p, r):
    SK.append((Vector(p), r))
    return len(SK) - 1


pel = sk((0, 0.005, 0.93), (0.175, 0.125))
bel = sk((0, 0.0, 1.1), (0.205, 0.155))
che = sk((0, 0.0, 1.29), (0.235, 0.17))
up = sk((0, 0.01, 1.41), (0.18, 0.13))
nec = sk((0, 0.0, 1.5), (0.06, 0.06))
EDGES += [(pel, bel), (bel, che), (che, up), (up, nec)]
for s in (1, -1):
    sh = sk((s * 0.2, 0.01, 1.41), (0.098, 0.098))
    el = sk((s * 0.39, 0.01, 1.215), (0.08, 0.08))
    wr = sk((s * 0.56, 0.0, 1.04), (0.06, 0.056))
    EDGES += [(up, sh), (sh, el), (el, wr)]
    hp = sk((s * 0.1, 0.0, 0.9), (0.115, 0.12))
    kn = sk((s * 0.1, -0.01, 0.5), (0.092, 0.095))
    an = sk((s * 0.1, 0.02, 0.12), (0.08, 0.08))
    toe = sk((s * 0.1, -0.11, 0.055), (0.064, 0.055))
    EDGES += [(pel, hp), (hp, kn), (kn, an), (an, toe)]

me = bpy.data.meshes.new('bodyHull')
me.from_pydata([p for p, _ in SK], EDGES, [])
body = bpy.data.objects.new('bodyHull', me)
scene.collection.objects.link(body)
mod = body.modifiers.new('skin', 'SKIN')
mod.branch_smoothing = 0.6
mod.use_smooth_shade = True
for i, (_, r) in enumerate(SK):
    body.data.skin_vertices[0].data[i].radius = r
body.data.skin_vertices[0].data[pel].use_root = True
sub = body.modifiers.new('sub', 'SUBSURF')
sub.levels = 3
sub.render_levels = 3
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.modifier_apply(modifier='skin')
bpy.ops.object.modifier_apply(modifier='sub')
hull = body.data

# Sewn sheepskin compresses at elbows, knees, cuffs and the waist. Sculpt actual
# silhouette relief in the bind pose, before skin weights / LODs are generated.
# Millimetres of relief, not a repeating whole-body displacement.
for v in hull.vertices:
    p = v.co.copy()
    if p.z < 0.24 or p.z > 1.46:
        continue
    ax = abs(p.x)
    fold = 0.0
    if ax > 0.24 and p.z > 0.95:
        side = 'L' if p.x > 0 else 'R'
        a, b, _ = REST['forearm.' + side]
        along = (p - a).dot((b - a).normalized())
        around = math.atan2(p.y, abs(p.x) - abs(a.x))
        elbow = math.exp(-((along - 0.015) / 0.105) ** 2)
        cuff = math.exp(-((along - 0.205) / 0.06) ** 2)
        fold = (0.010 * elbow + 0.006 * cuff) * math.sin(along * 100 + 1.7 * math.sin(around))
    elif p.z < 0.9:
        around = math.atan2(p.y, ax - 0.10)
        knee = math.exp(-((p.z - 0.50) / 0.12) ** 2)
        ankle = math.exp(-((p.z - 0.29) / 0.055) ** 2)
        fold = (0.011 * knee + 0.007 * ankle) * math.sin(p.z * 95 + 1.4 * math.sin(around))
    else:
        waist = math.exp(-((p.z - 1.03) / 0.095) ** 2)
        fold = 0.009 * waist * math.sin(p.z * 90 + p.x * 13)
    v.co += v.normal * fold
hull.update()


def body_colour(p):
    if p.z < 0.2:
        return BOOT
    if p.z < 0.24 and abs(p.x) > 0.03:
        return FLEECE      # boot tops
    if p.z < 0.9 and abs(p.x) > 0.02:
        return TROUSERS
    if abs(p.x) > 0.52:
        return FLEECE      # knit/fleece cuffs
    if 0.86 < p.z < 0.95:
        return FLEECE      # jacket hem
    return JACKET


B = MeshBuilder('crewBody')
B.add_object_data(hull, Matrix.Identity(4), leather)
# per-loop colours by region
for f in B.bm.faces:
    for l in f.loops:
        l[B.col] = (*body_colour(l.vert.co), 1.0)
bpy.data.objects.remove(body)


def add(m, matrix, mat, col):
    B.add_object_data(m, matrix, mat, col)


# head: face, ears under a leather flying helmet
add(prim('sphere', r=0.1, u=18, v=12, scale=(0.92, 1.0, 1.08)), trs((0, -0.015, 1.64)), cloth, SKIN)
add(prim('sphere', r=0.108, u=18, v=10, scale=(0.95, 1.02, 1.0)), trs((0, 0.01, 1.665)), cloth, LEATHER_HELMET)
for s in (1, -1):   # ear flaps of the leather helmet with the earphone cups
    add(prim('cyl', r1=0.042, h=0.03, segs=14), trs((s * 0.095, -0.0, 1.625), (0, math.pi / 2, 0)), cloth, LEATHER_HELMET)
# M4 flak helmet: a steel bowl with hinged ear-flap plates
bowl = prim('sphere', r=0.135, u=20, v=10, scale=(0.95, 1.08, 0.82))
add(bowl, trs((0, 0.005, 1.69)), hard, STEEL)
for s in (1, -1):
    add(prim('box', size=(0.014, 0.1, 0.09)), trs((s * 0.122, 0.0, 1.615), (0, s * 0.12, 0)), hard, STEEL)
add(prim('box', size=(0.2, 0.012, 0.016)), trs((0, -0.13, 1.66)), hard, STEEL)   # brow lip
# B-8 goggles pushed up on the helmet front, strap round it
for s in (1, -1):
    add(prim('cyl', r1=0.03, h=0.03, segs=14), trs((s * 0.042, -0.118, 1.725), (math.pi / 2 - 0.5, 0, 0)), hard, LENS)
add(prim('torus', R=0.122, r=0.008, nu=28, nv=5), trs((0, 0.0, 1.715), (0.12, 0, 0), (1, 1.1, 1)), cloth, (0.05, 0.04, 0.03))
# A-14 oxygen mask over nose and mouth, valve boss, hose down to the chest regulator clip
add(prim('sphere', r=0.06, u=14, v=10, scale=(0.95, 1.05, 1.15)), trs((0, -0.085, 1.59)), hard, RUBBER)
add(prim('cyl', r1=0.024, r2=0.02, h=0.035, segs=12), trs((0, -0.14, 1.57), (math.pi / 2 + 0.3, 0, 0)), hard, RUBBER)
for s in (1, -1):
    add(prim('box', size=(0.1, 0.012, 0.012)), trs((s * 0.07, -0.05, 1.6), (0, 0, s * 0.5)), cloth, (0.05, 0.05, 0.04))
hose = [Vector((0, -0.155, 1.555)), Vector((0.02, -0.17, 1.49)), Vector((0.05, -0.19, 1.4)), Vector((0.07, -0.19, 1.3)), Vector((0.08, -0.185, 1.22))]
add(prim('tube', pts=hose, r=0.017, segs=8), Matrix.Identity(4), hard, HOSE)
for i in range(1, 12):   # corrugation rings
    p = hose[0].lerp(hose[-1], i / 12)
    add(prim('torus', R=0.017, r=0.004, nu=10, nv=4), look_matrix(p - Vector((0, 0, 0.001)), p), hard, HOSE)
add(prim('box', size=(0.05, 0.02, 0.06)), trs((0.08, -0.175, 1.2)), hard, BRASS)   # clip / blinker connector
# fleece collar of the B-3, folded over the shoulders
add(prim('torus', R=0.115, r=0.05, nu=24, nv=8), trs((0, 0.01, 1.455), (0.15, 0, 0), (1.15, 1.05, 1.0)), cloth, FLEECE)
# B-4 Mae West: two yellow lobes on the chest and the collar ring behind the neck
for s in (1, -1):
    add(prim('sphere', r=0.1, u=14, v=10, scale=(0.9, 0.45, 1.25)), trs((s * 0.085, -0.135, 1.3)), cloth, MAEWEST)
add(prim('torus', R=0.13, r=0.04, nu=22, nv=8, arc=math.pi * 1.2), trs((0, 0.02, 1.43), (0, 0, math.pi * 1.4 - math.pi / 2), (1.1, 1.0, 1.0)), cloth, MAEWEST)
# parachute harness: chest strap, shoulder straps and leg loops, with brass fittings
add(prim('box', size=(0.3, 0.012, 0.035)), trs((0, -0.175, 1.17)), cloth, WEB)
for s in (1, -1):
    add(prim('box', size=(0.035, 0.012, 0.42)), trs((s * 0.1, -0.165, 1.22), (0.05, 0, 0)), cloth, WEB)
    add(prim('torus', R=0.1, r=0.012, nu=18, nv=4), trs((s * 0.1, -0.01, 0.82), (0, math.pi / 2, 0), (1, 1.15, 1)), cloth, WEB)
    add(prim('box', size=(0.04, 0.015, 0.04)), trs((s * 0.1, -0.18, 1.04)), hard, BRASS)
add(prim('box', size=(0.06, 0.02, 0.06)), trs((0, -0.185, 1.17)), hard, BRASS)
# gloves: fists with a thumb, gauntlet cuff
for s, n in ((1, 'L'), (-1, 'R')):
    h0, h1 = REST[f'hand.{n}'][0], REST[f'hand.{n}'][1]
    d = (h1 - h0).normalized()
    q = Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
    add(prim('sphere', r=0.05, u=12, v=8, scale=(0.95, 0.62, 1.25)), Matrix.Translation(h0 + d * 0.055) @ q, cloth, GLOVE)
    add(prim('sphere', r=0.022, u=8, v=6, scale=(1, 1, 1.6)), Matrix.Translation(h0 + d * 0.035 + Vector((-s * 0.02, -0.035, 0))) @ q, cloth, GLOVE)
    add(prim('cyl', r1=0.056, r2=0.05, h=0.06, segs=12), Matrix.Translation(h0 - d * 0.005) @ q, cloth, GLOVE)
# A-6 boot straps
for s in (1, -1):
    add(prim('torus', R=0.075, r=0.007, nu=16, nv=4), trs((s * 0.1, 0.02, 0.16), (0.1, 0, 0), (0.95, 1.05, 1)), hard, BRASS)

# Raised sewn seams, leather pocket flaps and a narrow zipper tape. All are
# merged into the skinned body, so no additional runtime draw calls or materials.
SEAM = (0.10, 0.055, 0.028)
STITCH = (0.37, 0.28, 0.16)
for side in (-1, 1):
    seam = [Vector((side * x, -0.055, z)) for x, z in [(0.22,1.40),(0.31,1.30),(0.40,1.205),(0.49,1.11),(0.55,1.045)]]
    add(prim('tube', pts=seam, r=0.0035, segs=5), Matrix.Identity(4), cloth, SEAM)
    seam = [Vector((side * 0.17, -0.04, z)) for z in (0.86,0.72,0.55,0.38,0.25)]
    add(prim('tube', pts=seam, r=0.003, segs=5), Matrix.Identity(4), cloth, SEAM)
    add(prim('box', size=(0.105,0.012,0.085)), trs((side*0.125,-0.142,1.055), (0,side*0.08,0)), cloth, JACKET)
    add(prim('box', size=(0.11,0.014,0.022)), trs((side*0.125,-0.15,1.10)), cloth, SEAM)
    for i in range(10):
        add(prim('box', size=(0.003,0.002,0.005)), trs((side*0.125-0.045+i*0.01,-0.158,1.10)), cloth, STITCH)
add(prim('box', size=(0.018,0.01,0.34)), trs((0,-0.165,1.16)), cloth, SEAM)
for i in range(34):
    add(prim('box', size=(0.009,0.003,0.0025)), trs((0,-0.172,0.99+i*0.01)), hard, BRASS)
add(prim('box', size=(0.012,0.005,0.023)), trs((0,-0.176,1.32)), hard, BRASS)
body_ob = B.finish()

# ---------------- flak vest (own mesh: the game leaves it off some crewmen) ----------------
# M1 flak vest fitted over the jacket: the torso of the body hull, pushed out 3.5 cm, with the
# quilted rows of its steel plates painted in, shoulder straps and the red quick-release tab
import bmesh as _bm
vb = _bm.new()
vb.from_mesh(hull)
_bm.ops.delete(vb, geom=[v for v in vb.verts if not (1.0 < v.co.z < 1.47 and abs(v.co.x) < 0.235)], context='VERTS')
vb.normal_update()
for v in vb.verts:
    v.co += v.normal * 0.035
vme = bpy.data.meshes.new('tmpvest')
vb.to_mesh(vme)
vb.free()
V = MeshBuilder('crewFlakVest')
V.add_object_data(vme, Matrix.Identity(4), cloth, VEST)
for f in V.bm.faces:
    for l in f.loops:
        z = l.vert.co.z
        dark = (z * 12.5) % 1.0 < 0.14 or abs(l.vert.co.x) > 0.215
        l[V.col] = (*((0.07, 0.075, 0.045) if dark else VEST), 1.0)
for s in (1, -1):
    V.add_object_data(prim('box', size=(0.07, 0.3, 0.025)), trs((s * 0.13, -0.0, 1.475), (0, s * 0.2, 0)), cloth, VEST)
V.add_object_data(prim('box', size=(0.05, 0.02, 0.06)), trs((-0.12, -0.215, 1.1)), cloth, VEST_TAB)
vest_ob = V.finish()

# ---------------- skinning ----------------
ALLOW = {}   # per-vertex override: anything above the shoulders on the head goes rigid


def skin(ob, rigid_fn=None):
    for n in ORDER:
        ob.vertex_groups.new(name=n)
    for v in ob.data.vertices:
        p = v.co
        allowed = rigid_fn(p) if rigid_fn else None
        for w, n in weights_for(p, allowed):
            ob.vertex_groups[n].add([v.index], w, 'REPLACE')
    mod = ob.modifiers.new('rig', 'ARMATURE')
    mod.object = arm
    ob.parent = arm


def body_rule(p):
    if p.z > 1.5 and abs(p.x) < 0.18:
        return ['head', 'neck'] if p.z < 1.56 else ['head']
    if abs(p.x) > 0.5 and p.z > 0.85:
        return [b for b in ORDER if 'hand' in b or 'forearm' in b]
    if p.z > 1.12 and abs(p.x) < 0.16:
        return ['chest', 'spine', 'neck']
    return None


skin(body_ob, body_rule)
skin(vest_ob, lambda p: ['chest', 'spine'])

# LOD1: the same man at a quarter of the triangles (for the far glimpses: radio room, tail)
lod = body_ob.copy()
lod.data = body_ob.data.copy()
lod.name = 'crewBodyLod'
scene.collection.objects.link(lod)
for m in list(lod.modifiers):
    if m.type == 'ARMATURE':
        continue
dec = lod.modifiers.new('dec', 'DECIMATE')
dec.ratio = 0.12
lod.modifiers.move(len(lod.modifiers) - 1, 0)
bpy.context.view_layer.objects.active = lod
bpy.ops.object.select_all(action='DESELECT')
lod.select_set(True)
bpy.ops.object.modifier_apply(modifier='dec')

# ---------------- poses ----------------
# A pose: hips location + world rotation (Euler XYZ, relative to the rest pose), then per bone either a
# world direction (Vector: the bone is turned the shortest way from its inherited direction) or
# ('rot', Euler) for an absolute world rotation relative to rest. Unlisted bones inherit their parent.
D = lambda x, y, z: Vector((x, y, z)).normalized()  # noqa: E731
R = lambda x, y, z: ('rot', Euler((x, y, z), 'XYZ'))  # noqa: E731


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
            if isinstance(spec, Vector):
                cur = Rw[n] @ (t0 - h0).normalized()
                Rw[n] = cur.rotation_difference(spec).to_matrix() @ Rw[n]
            elif isinstance(spec, tuple) and spec[0] == 'rot':
                Rw[n] = spec[1].to_matrix()
            elif isinstance(spec, tuple) and spec[0] == 'drot':   # extra rotation on top of the inherited one
                Rw[n] = spec[1].to_matrix() @ Rw[n]
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
# lying on his back on the walkway, head turned aside
DOWN = {
    'hips': ((0, 0.0, 0.15), (-1.45, 0.25, 0)),
    'spine': D(0.02, 1, 0.07), 'chest': D(0.05, 1, 0.05), 'neck': D(0.1, 1, 0.25), 'head': D(0.45, 1, 0.3),
    'upperarm.L': D(0.9, 0.3, -0.1), 'forearm.L': D(0.6, -0.8, 0.05), 'hand.L': D(0.5, -0.9, -0.05),
    'upperarm.R': D(-0.4, -0.2, 0.25), 'forearm.R': D(0.5, -0.8, 0.5), 'hand.R': D(0.7, -0.5, 0.1),
    'thigh.L': D(0.18, -1, 0.05), 'shin.L': D(0.08, -1, -0.08), 'foot.L': D(0.4, -0.2, 1),
    'thigh.R': D(-0.25, -1, 0.35), 'shin.R': D(0.0, -0.9, -0.45), 'foot.R': D(-0.4, -0.3, 1),
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


def breath(p, k, amp=0.025):
    q = dict(p)
    q['chest'] = ('drot', Euler((-amp * k, 0, 0)))
    return q


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
               upperarm_L=D(0.5, -0.1, -1), forearm_L=D(0.3, -0.3, -1), upperarm_R=D(-0.3, -0.2, -1), forearm_R=D(-0.1, -0.4, -1))
FALL = lerp_pose(BUCKLE, DOWN, 0.55)
FALL['hips'] = ((0.0, 0.05, 0.28), (-0.8, 0.3, 0.05))
clip('hit', [(0, GUN), (4, JERK), (13, BUCKLE), (24, FALL), (34, DOWN), (40, DOWN)])


# down: lying wounded, shallow breathing, an arm stirring (3 s loop)
def down_key(t):
    p = dict(DOWN)
    p['chest'] = DOWN['chest'].lerp(Vector((0.05, 1, 0.12)).normalized(), 0.5 + 0.5 * math.sin(t * math.pi * 2 / 1.5))
    p['forearm.R'] = DOWN['forearm.R'].slerp(D(0.4, -0.6, 0.8), 0.5 + 0.5 * math.sin(t * math.pi * 2 / 3))
    return p


clip('down', [(int(i * 15), down_key(i * 0.5)) for i in range(7)])


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
# aft), fingers wrapped round the front, the forearm dropping back and down toward the elbow
# (out of the sight picture) and a little out (+X: the left hand; the game mirrors it).
F = MeshBuilder('fpArm')
for k, z in enumerate((-0.03, -0.01, 0.01, 0.03)):          # four fingers round the grip
    F.add_object_data(prim('torus', R=0.025, r=0.0105 - 0.0008 * abs(k - 1.5), nu=14, nv=6, arc=math.pi * 1.35),
                      trs((0, 0, z), (0, 0, math.pi / 2 + math.pi * 0.325)), cloth, GLOVE)
F.add_object_data(prim('sphere', r=0.04, u=14, v=10, scale=(0.85, 0.65, 1.1)), trs((0.004, 0.034, 0.0)), cloth, GLOVE)    # back of the hand
F.add_object_data(prim('sphere', r=0.014, u=8, v=6, scale=(1, 1, 2.2)), trs((-0.026, 0.006, 0.042), (0.5, 0.3, 0)), cloth, GLOVE)   # thumb over the top
F.add_object_data(prim('cyl', r1=0.04, r2=0.047, h=0.075, segs=16), look_matrix(Vector((0.006, 0.055, -0.012)), Vector((0.016, 0.105, -0.06))), cloth, GLOVE)   # gauntlet
F.add_object_data(prim('cyl', r1=0.051, r2=0.051, h=0.035, segs=16), look_matrix(Vector((0.016, 0.105, -0.06)), Vector((0.021, 0.122, -0.088))), cloth, FLEECE)  # fleece cuff
F.add_object_data(prim('cyl', r1=0.048, r2=0.057, h=0.27, segs=16), look_matrix(Vector((0.021, 0.12, -0.085)), Vector((0.06, 0.22, -0.33))), cloth, JACKET)    # sleeve
fp_ob = F.finish()
fp_ob.location = (0, 0, 0)

free_tmp()
for ob in (body_ob, vest_ob, lod, fp_ob):
    for p in ob.data.polygons:
        p.use_smooth = True
    # cylindrical UVs round the body axis, 4 repeats per metre (the game's fabric detail normal map)
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
export_glb(OUT, objects=[arm, body_ob, vest_ob, lod, fp_ob], animations=True,
           extra=dict(export_animation_mode='NLA_TRACKS', export_skins=True, export_def_bones=False,
                      export_force_sampling=True, export_frame_step=1, export_optimize_animation_size=True))
print('crew written', OUT, len(body_ob.data.polygons), 'faces;', len(lod.data.polygons), 'lod faces')
