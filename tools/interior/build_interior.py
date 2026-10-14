# B-17G interior kit (Phase 10 goal 07), generated in Blender:
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/interior/build_interior.py -- out.glb
# Modelled in the game's bomber frame (metres, +X left, +Y up, +Z nose; turned to Blender's Z-up
# only for the export) around the procedural fuselage shell of src/game/Viewmodels.ts
# (ellipse A x B centred at YC, walkway top at FLOOR_TOP, waist windows at WAIST_Z):
#   kitWaist   formers (Z-section) and hat stringers broken at the windows, window doublers,
#              walkway with treads, G-1 oxygen bottles in cradles, A-12 regulators with hoses,
#              ammunition boxes with feed chutes, interphone jack boxes, flak curtains, a spare
#              flak suit and helmet, chest-pack parachutes, extinguisher, first-aid kit, control
#              cables with pulleys, dome lamps, hand rails
#   kitRadio   radio room: operator's table, BC-348 receiver, BC-375 transmitter and tuning units,
#              swivel seat, lamp, roof hatch frame, forward bulkhead with the door open
#   kitBay     bomb bay beyond: shell, catwalk on its keel beam, racks, doors with light leaking
#              at the seams, forward bulkhead
#   kitBombs   twelve 500 lb bombs on the racks (hidden by the game after bombs away)
# Materials: kitPaint (dielectric), kitMetal (aluminium / brass / steel), kitGlow (dial lamps),
# kitSky (daylight through gaps). Vertex colour = albedo x ambient occlusion (baked in Cycles
# against a stand-in of the shell).
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_util import reset_scene, material, use_vertex_colors, MeshBuilder, prim, free_tmp, trs, look_matrix, export_glb  # noqa: E402

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.path.join(os.path.dirname(__file__), 'out', 'b17_interior.glb')
NO_BAKE = '--no-bake' in sys.argv
reset_scene()

# ---- must match src/game/Viewmodels.ts / LivingInterior.ts ----
A, B, YC = 1.08, 1.12, 0.15
FLOOR_TOP = YC - B * 0.78 + 0.015
WAIST_Z = -7.44
Z0, Z1 = WAIST_Z - 3.2, WAIST_Z + 3.2      # waist compartment
RADIO_Z1 = Z1 + 1.7                         # radio room forward bulkhead
BAY_Z1 = RADIO_Z1 + 2.9                     # bomb bay forward bulkhead
WIN_W, WIN_Y0, WIN_Y1 = 0.8, -0.06, 0.55    # waist windows (y relative to YC)
DOOR_W, DOOR_TOP = 0.5, 0.62
TA, TB = math.asin(WIN_Y0 / B), math.asin(WIN_Y1 / B)

# ---- colours (linear) ----
ALU = (0.62, 0.63, 0.64)
ALU_DULL = (0.42, 0.43, 0.43)
ZINC = (0.20, 0.25, 0.06)        # zinc chromate primer, yellow-green
INT_GREEN = (0.11, 0.13, 0.055)  # interior green paint
OD = (0.075, 0.08, 0.04)         # olive drab
OD_DARK = (0.04, 0.045, 0.025)
BLACK = (0.018, 0.018, 0.017)
CRINKLE = (0.03, 0.03, 0.028)    # black crinkle radio cases
YELLOW = (0.55, 0.38, 0.03)      # oxygen bottles
RED = (0.32, 0.03, 0.02)
CANVAS = (0.2, 0.18, 0.11)
KHAKI = (0.28, 0.24, 0.14)
PLY = (0.2, 0.13, 0.065)         # plywood walkway
BRASS = (0.55, 0.4, 0.15)
STEEL = (0.3, 0.3, 0.29)
RUBBER = (0.03, 0.03, 0.028)
WHITE = (0.6, 0.6, 0.55)
BOMB_OD = (0.06, 0.07, 0.035)
BOMB_BAND = (0.5, 0.36, 0.03)

paint = material('kitPaint', (1, 1, 1), rough=0.72, metal=0.0)
metal = material('kitMetal', (1, 1, 1), rough=0.42, metal=0.85)
glow = material('kitGlow', (1, 1, 1), rough=0.5, metal=0.0, emissive=(1.0, 0.55, 0.18), emit_strength=4.0)
sky = material('kitSky', (1, 1, 1), rough=0.5, metal=0.0, emissive=(0.85, 0.95, 1.2), emit_strength=3.0)
for m in (paint, metal, glow, sky):
    use_vertex_colors(m)


def skin_pt(t, d=0.0):
    """Point on the shell at angle t (x = A cos t, y = YC + B sin t), d metres inward."""
    x, y = A * math.cos(t), YC + B * math.sin(t)
    nx, ny = -x / (A * A), -(y - YC) / (B * B)
    ln = math.hypot(nx, ny)
    return Vector((x + nx / ln * d, y + ny / ln * d)), Vector((nx / ln, ny / ln))


def t_of_y(side, y):
    """Shell angle at height y (absolute) on side +1 (left, x > 0) / -1 (right)."""
    s = max(-1.0, min(1.0, (y - YC) / B))
    t = math.asin(s)
    return t if side > 0 else math.pi - t


T_FLOOR_L = t_of_y(1, FLOOR_TOP)            # where the walkway meets the skin
T_FLOOR_R = t_of_y(-1, FLOOR_TOP)


def in_window(t, z, pad=0.0):
    tt = math.atan2(math.sin(t), math.cos(t))
    if abs(z - WAIST_Z) > WIN_W / 2 + pad:
        return False
    if TA - pad / B < tt < TB + pad / B:
        return True
    tr = math.pi - tt if tt > 0 else -math.pi - tt
    return TA - pad / B < tr < TB + pad / B


def ring_strip(mb, z, t0, t1, d0, d1, dz0, dz1, mat, col, steps=None):
    """A box-section strip following the shell between angles t0..t1: inward depth d0..d1, axial dz0..dz1."""
    n = steps or max(2, int(abs(t1 - t0) / 0.05))
    bm = bmesh.new()
    rows = []
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        p0, _ = skin_pt(t, d0)
        p1, _ = skin_pt(t, d1)
        rows.append([bm.verts.new((p0.x, p0.y, z + dz0)), bm.verts.new((p1.x, p1.y, z + dz0)),
                     bm.verts.new((p1.x, p1.y, z + dz1)), bm.verts.new((p0.x, p0.y, z + dz1))])
    for i in range(n):
        a, b = rows[i], rows[i + 1]
        for k in range(4):
            bm.faces.new([a[k], b[k], b[(k + 1) % 4], a[(k + 1) % 4]])
    bm.faces.new(rows[0][::-1])
    bm.faces.new(rows[-1])
    me = bpy.data.meshes.new('tmp')
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    mb.add_object_data(me, Matrix.Identity(4), mat, col)


def z_strip(mb, t, z0, z1, d0, d1, w, mat, col):
    """A straight member along Z at shell angle t: inward depth d0..d1, width w (along the shell)."""
    p, n = skin_pt(t)
    tan = Vector((-n.y, n.x))
    c = p + n * ((d0 + d1) / 2)
    m = Matrix(((tan.x, n.x, 0, c.x), (tan.y, n.y, 0, c.y), (0, 0, 1, (z0 + z1) / 2), (0, 0, 0, 1)))
    mb.add_object_data(prim('box', size=(w, d1 - d0, z1 - z0)), m, mat, col)


def box(mb, size, loc, mat, col, rot=(0, 0, 0)):
    mb.add_object_data(prim('box', size=size), trs(loc, rot), mat, col)


def cyl(mb, a, b, r, mat, col, segs=16, r2=None, caps=True):
    a, b = Vector(a), Vector(b)
    mb.add_object_data(prim('cyl', r1=r, r2=r if r2 is None else r2, h=(b - a).length, segs=segs, caps=caps), look_matrix(a, b), mat, col)


def tube(mb, pts, r, mat, col, segs=8):
    mb.add_object_data(prim('tube', pts=[Vector(p) for p in pts], r=r, segs=segs), Matrix.Identity(4), mat, col)


def sphere(mb, c, r, mat, col, scale=(1, 1, 1), u=14, v=8):
    mb.add_object_data(prim('sphere', r=r, u=u, v=v, scale=scale), Matrix.Translation(Vector(c)), mat, col)


def on_wall(side, y, z, gap, size, mat, col, extra=Matrix.Identity(4)):
    """A box standing on the inner skin at height y: local X into the cabin, Y along the wall."""
    t = t_of_y(side, y)
    p, n = skin_pt(t, gap + size[0] / 2)
    tan = Vector((-n.y, n.x))
    m = Matrix(((n.x, tan.x, 0, p.x), (n.y, tan.y, 0, p.y), (0, 0, 1, z), (0, 0, 0, 1)))
    mb_m = m @ extra
    return mb_m


def wall_frame(side, y, z, gap):
    t = t_of_y(side, y)
    p, n = skin_pt(t, gap)
    tan = Vector((-n.y, n.x))
    return Matrix(((n.x, tan.x, 0, p.x), (n.y, tan.y, 0, p.y), (0, 0, 1, z), (0, 0, 0, 1)))


# ============================== waist ==============================
W = MeshBuilder('kitWaist')

# formers: Z-section frames every 0.48 m (web, outer and inner flange), broken at the windows
FORMER_ZS = [Z0 + 0.25 + i * 0.48 for i in range(14) if Z0 + 0.25 + i * 0.48 < Z1 - 0.05]


def former(mb, z, t0, t1, col=ZINC, depth=0.075):
    # split the angular range around the windows and the walkway
    spans, cur = [], None
    n = int((t1 - t0) / 0.02)
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        blocked = in_window(t, z, 0.04)
        if not blocked and cur is None:
            cur = t
        if blocked and cur is not None:
            spans.append((cur, t - 0.02)); cur = None
    if cur is not None:
        spans.append((cur, t1))
    for a, b in spans:
        if b - a < 0.03:
            continue
        ring_strip(mb, z, a, b, 0.004, depth, -0.0025, 0.0025, metal, col)          # web
        ring_strip(mb, z, a, b, 0.004, 0.009, -0.024, 0.0025, metal, col)           # outer flange (on the skin)
        ring_strip(mb, z, a, b, depth - 0.005, depth, -0.0025, 0.022, metal, col)   # inner flange
        # lightening holes would be too fine; the rivet line of the outer flange is in the skin texture


for z in FORMER_ZS:
    former(W, z, T_FLOOR_L, T_FLOOR_R)    # over the top, from the left floor edge round to the right

# stringers: hat sections along the length, broken at the windows
STRINGER_TS = [T_FLOOR_L + 0.1 + k * 0.2 for k in range(int((T_FLOOR_R - T_FLOOR_L - 0.2) / 0.2) + 1)]
for t in STRINGER_TS:
    segs = [(Z0 + 0.02, Z1 - 0.02)]
    if in_window(t, WAIST_Z, 0.05):
        segs = [(Z0 + 0.02, WAIST_Z - WIN_W / 2 - 0.06), (WAIST_Z + WIN_W / 2 + 0.06, Z1 - 0.02)]
    for a, b in segs:
        z_strip(W, t, a, b, 0.004, 0.028, 0.022, metal, ALU_DULL)
        z_strip(W, t, a, b, 0.004, 0.008, 0.05, metal, ALU_DULL)

# window doublers (a heavy frame on the skin round each opening) and the K-6 mount's sill
for side in (1, -1):
    ta, tb = (TA, TB) if side > 0 else (math.pi - TB, math.pi - TA)
    for z in (WAIST_Z - WIN_W / 2 - 0.035, WAIST_Z + WIN_W / 2 + 0.035):
        ring_strip(W, z, ta - 0.06, tb + 0.06, 0.004, 0.04, -0.035, 0.035, metal, ZINC, steps=12)
    for t in (ta - 0.03, tb + 0.03):
        z_strip(W, t, WAIST_Z - WIN_W / 2 - 0.07, WAIST_Z + WIN_W / 2 + 0.07, 0.004, 0.045, 0.065, metal, ZINC)

# walkway: plywood on a light frame, aluminium edge angles and anti-slip treads
box(W, (1.3, 0.02, Z1 - Z0 - 0.04), (0, FLOOR_TOP - 0.01, (Z0 + Z1) / 2), paint, PLY)
for x in (0.655, -0.655):
    box(W, (0.03, 0.04, Z1 - Z0 - 0.04), (x, FLOOR_TOP - 0.005, (Z0 + Z1) / 2), metal, ALU_DULL)
for i in range(int((Z1 - Z0) / 0.32)):
    z = Z0 + 0.2 + i * 0.32
    box(W, (1.2, 0.004, 0.035), (0, FLOOR_TOP + 0.002, z), paint, BLACK)
# skin below the walkway edge to the walls: a strip of floor stringers on each side
for side in (1, -1):
    for k in range(3):
        y = FLOOR_TOP - 0.02 - k * 0.06
        x = side * A * math.sqrt(max(0.0, 1 - ((y - YC) / B) ** 2))
        box(W, (abs(x) - 0.66, 0.012, Z1 - Z0 - 0.1), (side * (0.66 + abs(x)) / 2, y, (Z0 + Z1) / 2), metal, ALU_DULL)

# G-1 oxygen bottles: pairs in cradles high on each side, fore and aft of the windows
def bottle(mb, c, axis, length=0.58, r=0.105):
    c, ax = Vector(c), Vector(axis).normalized()
    a, b = c - ax * (length / 2 - r), c + ax * (length / 2 - r)
    cyl(mb, a, b, r, paint, YELLOW, segs=18, caps=False)
    sphere(mb, a, r, paint, YELLOW, u=18, v=10)
    sphere(mb, b, r, paint, YELLOW, u=18, v=10)
    cyl(mb, b + ax * (r - 0.01), b + ax * (r + 0.05), 0.022, metal, BRASS, segs=10)    # valve
    for k in (-0.15, 0.15):                                                         # straps
        p = c + ax * k
        mb.add_object_data(prim('torus', R=r + 0.006, r=0.007, nu=20, nv=4), look_matrix(p - ax * 0.001, p), paint, OD_DARK)


for side in (1, -1):
    for z0 in (WAIST_Z + 0.85, WAIST_Z - 1.55):
        t = t_of_y(side, 0.95)
        p, n = skin_pt(t, 0.16)
        for k in range(2):
            bottle(W, (p.x, p.y - k * 0.0, z0 + k * 0.62), (0, 0, 1))
        # cradle: two brackets back to the formers
        for k in range(2):
            q, _ = skin_pt(t, 0.02)
            box(W, (0.05, 0.05, 0.03), ((q.x + p.x) / 2, (q.y + p.y) / 2, z0 + k * 0.62), metal, ALU_DULL)

# A-12 demand regulator panels by each window, hose looping down, walk-around bottle clipped beside
for side, zr in ((1, WAIST_Z + 0.72), (-1, WAIST_Z - 0.72)):
    m = wall_frame(side, 0.42, zr, 0.04)
    W.add_object_data(prim('box', size=(0.06, 0.24, 0.17)), m, paint, OD)
    for dy, r in ((0.06, 0.03), (-0.04, 0.032)):     # flow blinker and pressure gauge
        W.add_object_data(prim('cyl', r1=r, h=0.012, segs=16), m @ trs((0.035, dy, 0), (0, math.pi / 2, 0)), metal, BRASS)
        W.add_object_data(prim('cyl', r1=r * 0.8, h=0.004, segs=16), m @ trs((0.042, dy, 0), (0, math.pi / 2, 0)), paint, WHITE)
    W.add_object_data(prim('box', size=(0.02, 0.05, 0.03)), m @ trs((0.04, -0.1, 0.04)), paint, RED)   # emergency lever
    # corrugated hose loop
    p0 = m @ Vector((0.05, -0.12, 0))
    pts = [p0, p0 + Vector((side * -0.06, -0.15, 0.0)), p0 + Vector((side * -0.08, -0.32, 0.06)), p0 + Vector((side * -0.04, -0.4, 0.14)), p0 + Vector((side * -0.0, -0.3, 0.2))]
    tube(W, pts, 0.016, paint, RUBBER)
    # walk-around bottle (A-4) in its clip
    q = wall_frame(side, 0.2, zr + side * 0.0 + 0.0, 0.07) @ Vector((0, 0, 0.16 * side))
    cyl(W, q + Vector((0, -0.16, 0)), q + Vector((0, 0.16, 0)), 0.06, paint, YELLOW, segs=14)
    cyl(W, q + Vector((0, 0.16, 0)), q + Vector((0, 0.2, 0)), 0.018, metal, BRASS, segs=8)

# interphone jack boxes (black box, switch, two jacks) beside each window
for side, zr in ((1, WAIST_Z - 0.62), (-1, WAIST_Z + 0.62)):
    m = wall_frame(side, 0.25, zr, 0.03)
    W.add_object_data(prim('box', size=(0.05, 0.12, 0.09)), m, paint, BLACK)
    W.add_object_data(prim('cyl', r1=0.008, h=0.04, segs=8), m @ trs((0.04, 0.03, 0), (0, math.pi / 2, 0)), metal, STEEL)
    for dz in (-0.02, 0.02):
        W.add_object_data(prim('cyl', r1=0.01, h=0.02, segs=10), m @ trs((0.032, -0.03, dz), (0, math.pi / 2, 0)), metal, BRASS)
    # interphone cord hanging down in a loop
    p0 = m @ Vector((0.03, -0.06, 0))
    tube(W, [p0, p0 + Vector((-side * 0.02, -0.12, 0.02)), p0 + Vector((-side * 0.03, -0.22, -0.04)), p0 + Vector((-side * 0.02, -0.3, 0.03))], 0.006, paint, BLACK, segs=6)

# ammunition boxes on the floor under each window, with the flexible feed chute rising to the gun
for side, zb in ((1, WAIST_Z - 0.25), (-1, WAIST_Z - 0.25)):
    x = side * 0.62
    c = Vector((x, FLOOR_TOP + 0.22, zb))
    box(W, (0.32, 0.42, 0.5), c, paint, OD)
    box(W, (0.34, 0.03, 0.52), c + Vector((0, 0.215, 0)), paint, OD_DARK)          # lid
    for dz in (-0.18, 0.18):
        box(W, (0.34, 0.06, 0.02), c + Vector((0, 0.12, dz)), metal, STEEL)         # bands
    box(W, (0.005, 0.12, 0.2), c + Vector((-side * 0.161, 0.0, 0)), paint, KHAKI)    # stencil plate
    # flexible chute: a chain of short links from the lid toward the gun's feed side
    pts = [c + Vector((0, 0.24, 0.08)), c + Vector((-side * 0.02, 0.45, 0.1)), c + Vector((-side * 0.0, 0.62, 0.08))]
    for k in range(10):
        p = pts[0].lerp(pts[1], k / 9) if k < 9 else pts[1]
        box(W, (0.11, 0.022, 0.06), p, metal, ALU_DULL, rot=(0.2, 0, 0))

# spare ammunition boxes stacked forward on the left, a box of spare barrels
for i, (x, y, z, ry) in enumerate(((0.42, 0, Z1 - 0.55, 0.1), (0.42, 0.42, Z1 - 0.55, -0.05), (-0.45, 0, Z1 - 0.7, 0.0))):
    box(W, (0.3, 0.4, 0.46), (x, FLOOR_TOP + 0.2 + y, z), paint, OD, rot=(0, ry, 0))
    box(W, (0.32, 0.03, 0.48), (x, FLOOR_TOP + 0.415 + y, z), paint, OD_DARK, rot=(0, ry, 0))

# flak curtains (quilted aprons) hung on the wall aft of each window, a spare flak suit and M4 helmet
for side, zc in ((1, WAIST_Z - 0.95), (-1, WAIST_Z + 0.95)):
    for k in range(5):
        m = wall_frame(side, 0.32 - k * 0.12, zc, 0.03 + k * 0.006)
        W.add_object_data(prim('box', size=(0.025, 0.12, 0.5)), m, paint, OD)
        W.add_object_data(prim('box', size=(0.028, 0.01, 0.48)), m @ trs((0, 0.06, 0)), paint, OD_DARK)
    m = wall_frame(side, 0.38, zc, 0.03)
    W.add_object_data(prim('cyl', r1=0.012, h=0.6, segs=6), m @ trs((0.02, 0.04, 0), (0, 0, 0)), metal, STEEL)  # curtain rod
m = wall_frame(-1, 0.1, WAIST_Z - 1.55, 0.05)
W.add_object_data(prim('box', size=(0.06, 0.55, 0.42)), m, paint, OD)
W.add_object_data(prim('sphere', r=0.13, u=16, v=8, scale=(1, 1.1, 0.75)), m @ trs((0.1, 0.38, 0)), paint, OD_DARK)   # helmet on the hook
W.add_object_data(prim('cyl', r1=0.012, h=0.08, segs=6), m @ trs((0.02, 0.32, 0), (0, math.pi / 2, 0)), metal, STEEL)

# chest-pack parachutes on hooks on the forward bulkhead side walls
for side in (1, -1):
    m = wall_frame(side, -0.25, Z1 - 0.3, 0.03)
    W.add_object_data(prim('box', size=(0.14, 0.32, 0.36)), m, paint, KHAKI)
    W.add_object_data(prim('box', size=(0.15, 0.02, 0.3)), m @ trs((0, 0.08, 0)), paint, (0.15, 0.13, 0.08))
    W.add_object_data(prim('torus', R=0.03, r=0.006, nu=12, nv=4), m @ trs((0.075, 0.0, 0.08), (0, math.pi / 2, 0)), metal, STEEL)
    W.add_object_data(prim('box', size=(0.012, 0.05, 0.02)), m @ trs((0.08, -0.08, -0.1)), paint, RED)   # rip-cord handle

# fire extinguisher (CO2) in its bracket, first-aid kit
m = wall_frame(-1, -0.2, Z0 + 0.6, 0.012)
W.add_object_data(prim('box', size=(0.025, 0.3, 0.09)), m, metal, ALU_DULL)
cyl(W, m @ Vector((0.07, -0.2, 0)), m @ Vector((0.07, 0.2, 0)), 0.06, paint, RED, segs=16)
cyl(W, m @ Vector((0.07, 0.2, 0)), m @ Vector((0.07, 0.27, 0)), 0.022, metal, BRASS, segs=10)
tube(W, [m @ Vector((0.07, 0.25, 0)), m @ Vector((0.12, 0.3, 0.04)), m @ Vector((0.13, 0.1, 0.06))], 0.01, paint, BLACK, segs=6)
m = wall_frame(1, 0.02, Z1 - 0.95, 0.04)
W.add_object_data(prim('box', size=(0.08, 0.2, 0.28)), m, paint, OD)
W.add_object_data(prim('box', size=(0.004, 0.13, 0.05)), m @ trs((0.041, 0, 0)), paint, RED)
W.add_object_data(prim('box', size=(0.004, 0.05, 0.13)), m @ trs((0.041, 0, 0)), paint, RED)
W.add_object_data(prim('box', size=(0.004, 0.17, 0.25)), m @ trs((0.0405, 0, 0)), paint, WHITE)

# control cables to the tail along the roof, with fairlead pulleys at the formers; hand rails
for x in (0.28, -0.28):
    y = YC + B * math.sqrt(max(0.0, 1 - (x / A) ** 2)) - 0.1
    cyl(W, (x, y, Z0 + 0.05), (x, y, Z1 - 0.05), 0.0045, metal, STEEL, segs=6, caps=False)
    cyl(W, (x, y - 0.05, Z0 + 0.05), (x, y - 0.05, Z1 - 0.05), 0.0045, metal, STEEL, segs=6, caps=False)
    for z in FORMER_ZS[1::3]:
        W.add_object_data(prim('cyl', r1=0.035, h=0.012, segs=14), trs((x, y - 0.025, z + 0.03), (0, math.pi / 2, 0)), metal, ALU_DULL)
for side in (1, -1):
    p, _ = skin_pt(t_of_y(side, 0.92), 0.08)
    cyl(W, (p.x, p.y, Z0 + 0.3), (p.x, p.y, WAIST_Z - 0.6), 0.013, metal, ALU_DULL, segs=8)

# dome lamps on the roof
for z in (WAIST_Z - 2.0, WAIST_Z + 1.9):
    y = YC + B - 0.012
    cyl(W, (0, y, z), (0, y - 0.035, z), 0.06, metal, ALU_DULL, r2=0.05)
    cyl(W, (0, y - 0.035, z), (0, y - 0.045, z), 0.045, glow, (0.25, 0.22, 0.18))

# electrical conduit along the right wall and junction boxes
p, _ = skin_pt(t_of_y(-1, 0.6), 0.03)
cyl(W, (p.x, p.y, Z0 + 0.1), (p.x, p.y, Z1 - 0.1), 0.012, metal, ALU_DULL, segs=8, caps=False)
for z in (WAIST_Z - 2.2, WAIST_Z + 2.2):
    W.add_object_data(prim('box', size=(0.06, 0.1, 0.1)), wall_frame(-1, 0.6, z, 0.03), paint, OD)

# ============================== radio room ==============================
Rr = MeshBuilder('kitRadio')
rz0, rz1 = Z1, RADIO_Z1
for z in (rz0 + 0.45, rz0 + 1.0, rz0 + 1.45):
    former(Rr, z, T_FLOOR_L, T_FLOOR_R)
for t in STRINGER_TS[::2]:
    z_strip(Rr, t, rz0 + 0.03, rz1 - 0.03, 0.004, 0.026, 0.02, metal, ALU_DULL)
box(Rr, (1.3, 0.02, rz1 - rz0), (0, FLOOR_TOP - 0.01, (rz0 + rz1) / 2), paint, PLY)
# operator's table on the left, receiver on it against the wall, transmitter below
tz = rz0 + 0.85
box(Rr, (0.5, 0.03, 0.95), (0.6, FLOOR_TOP + 0.74, tz), paint, INT_GREEN)
box(Rr, (0.03, 0.72, 0.03), (0.38, FLOOR_TOP + 0.37, tz - 0.42), metal, ALU_DULL)
box(Rr, (0.03, 0.72, 0.03), (0.38, FLOOR_TOP + 0.37, tz + 0.42), metal, ALU_DULL)


def radio_set(mb, c, size, face_x, dials, knobs):
    """A crinkle-black radio case; its front faces -face_x (into the cabin)."""
    c = Vector(c)
    box(mb, size, c, paint, CRINKLE)
    fx = c.x - face_x * (size[0] / 2 + 0.002)
    box(mb, (0.004, size[1] * 0.9, size[2] * 0.9), (fx, c.y, c.z), paint, (0.05, 0.05, 0.045))
    for dy, dz, r in dials:
        mb.add_object_data(prim('cyl', r1=r, h=0.006, segs=18), trs((fx - face_x * 0.004, c.y + dy, c.z + dz), (0, math.pi / 2, 0)), glow, (0.35, 0.28, 0.16))
        mb.add_object_data(prim('torus', R=r, r=0.004, nu=18, nv=4), trs((fx - face_x * 0.006, c.y + dy, c.z + dz), (0, math.pi / 2, 0)), metal, STEEL)
    for dy, dz in knobs:
        mb.add_object_data(prim('cyl', r1=0.014, r2=0.011, h=0.025, segs=10), trs((fx - face_x * 0.014, c.y + dy, c.z + dz), (0, math.pi / 2, 0)), paint, BLACK)


radio_set(Rr, (0.66, FLOOR_TOP + 0.88, tz - 0.12), (0.26, 0.24, 0.42), 1, [(0.04, -0.08, 0.045), (0.04, 0.09, 0.03)], [(-0.07, -0.15), (-0.07, -0.05), (-0.07, 0.05), (-0.07, 0.15)])   # BC-348
radio_set(Rr, (0.7, FLOOR_TOP + 1.12, tz + 0.28), (0.24, 0.2, 0.36), 1, [(0.0, 0.0, 0.04)], [(-0.06, -0.1), (-0.06, 0.1)])                                               # command receivers
box(Rr, (0.36, 0.03, 0.26), (0.6, FLOOR_TOP + 0.76, tz + 0.22), paint, (0.45, 0.42, 0.34))        # log book
box(Rr, (0.3, 0.004, 0.22), (0.6, FLOOR_TOP + 0.778, tz + 0.22), paint, (0.6, 0.58, 0.5))
cyl(Rr, (0.55, FLOOR_TOP + 0.78, tz + 0.05), (0.53, FLOOR_TOP + 0.78, tz + 0.2), 0.004, paint, (0.4, 0.3, 0.05), segs=6)   # pencil
# BC-375 transmitter and tuning units stacked on the right
radio_set(Rr, (-0.62, FLOOR_TOP + 0.38, tz + 0.1), (0.36, 0.56, 0.6), -1, [(0.12, -0.15, 0.05), (0.12, 0.15, 0.05), (-0.05, 0.0, 0.035)], [(-0.18, -0.2), (-0.18, 0.0), (-0.18, 0.2), (0.0, -0.22), (0.0, 0.22)])
radio_set(Rr, (-0.66, FLOOR_TOP + 0.9, tz + 0.1), (0.3, 0.42, 0.5), -1, [(0.08, 0.0, 0.05)], [(-0.1, -0.15), (-0.1, 0.15)])
# swivel seat (cushion, back, post)
sx, sz = 0.33, rz0 + 0.55
cyl(Rr, (sx, FLOOR_TOP, sz), (sx, FLOOR_TOP + 0.4, sz), 0.025, metal, ALU_DULL, segs=10)
cyl(Rr, (sx, FLOOR_TOP + 0.4, sz), (sx, FLOOR_TOP + 0.45, sz), 0.19, paint, (0.12, 0.07, 0.035), segs=18)
# the operator faces his table (+X): the back rest is on the -X side
box(Rr, (0.05, 0.32, 0.34), (sx - 0.2, FLOOR_TOP + 0.66, sz), paint, (0.12, 0.07, 0.035), rot=(0, 0, 0.12))
box(Rr, (0.03, 0.3, 0.03), (sx - 0.21, FLOOR_TOP + 0.55, sz), metal, ALU_DULL)
# lamp over the table: shade and a warm bulb
lp = Vector((0.55, YC + 0.75, tz - 0.05))
cyl(Rr, lp, lp + Vector((0, -0.08, 0.06)), 0.04, metal, OD, r2=0.06)
sphere(Rr, lp + Vector((0, -0.085, 0.065)), 0.02, glow, (1.0, 0.8, 0.5))
tube(Rr, [lp, lp + Vector((0.12, 0.1, 0)), lp + Vector((0.3, 0.2, -0.05))], 0.006, paint, BLACK, segs=6)
# roof hatch frame (the hatch opening itself is a sky panel: kitSky)
hz = rz0 + 0.95
hy = YC + B * 0.97
for dx in (-0.27, 0.27):
    box(Rr, (0.04, 0.06, 0.66), (dx, hy - 0.02, hz), metal, ALU_DULL)
for dz in (-0.32, 0.32):
    box(Rr, (0.58, 0.06, 0.04), (0, hy - 0.02, hz + dz), metal, ALU_DULL)
box(Rr, (0.5, 0.01, 0.6), (0, hy + 0.02, hz), sky, (1, 1, 1))
# small side window on the right with daylight
m = wall_frame(-1, 0.35, rz0 + 1.25, 0.0)
Rr.add_object_data(prim('box', size=(0.006, 0.26, 0.3)), m, sky, (1, 1, 1))
Rr.add_object_data(prim('box', size=(0.03, 0.3, 0.34)), m @ trs((0.02, 0, 0)), metal, ALU_DULL)
Rr.add_object_data(prim('box', size=(0.03, 0.22, 0.26)), m @ trs((0.02, 0, 0)), metal, ALU_DULL)   # will be hollowed by the sky pane in front
# radio-room oxygen regulator and interphone on the right wall
m = wall_frame(-1, 0.25, rz0 + 0.5, 0.04)
Rr.add_object_data(prim('box', size=(0.06, 0.24, 0.17)), m, paint, OD)
Rr.add_object_data(prim('cyl', r1=0.03, h=0.012, segs=16), m @ trs((0.035, 0.05, 0), (0, math.pi / 2, 0)), metal, BRASS)


def bulkhead(mb, z, door_open_dir, door_col=INT_GREEN):
    """Elliptical bulkhead at z with a door opening; the door stands open against the wall."""
    n = 64
    dw, y0, y1 = DOOR_W / 2, FLOOR_TOP, 0.95
    hole = [(dw, y0)] + [(dw * math.cos(math.pi * i / 8), y1 - 0.12 + 0.12 * math.sin(math.pi * i / 8)) for i in range(9)] + [(-dw, y0)]
    # the plate: the ellipse with a notch for the door, ear-clipped
    me2 = bpy.data.meshes.new('tmp')
    bm = bmesh.new()
    pts = []
    for i in range(n + 1):
        a = -math.pi / 2 + 2 * math.pi * i / n
        x, y = A * 0.995 * math.cos(a), YC + B * 0.995 * math.sin(a)
        pts.append((x, y))
    # polygon: outer ellipse from bottom centre round, then in through the door outline
    poly = [(dw, max(y0, pts[0][1]))] + [p for p in pts[1:-1] if not (abs(p[0]) < dw and p[1] < y1)]
    vs = [bm.verts.new((x, y, z)) for x, y in poly]
    vs += [bm.verts.new((x, y, z)) for x, y in reversed(hole[1:])]
    try:
        f = bm.faces.new(vs)
        bmesh.ops.triangulate(bm, faces=[f], quad_method='BEAUTY', ngon_method='EAR_CLIP')
    except ValueError:
        pass
    bm.normal_update()
    bm.to_mesh(me2)
    bm.free()
    for p in me2.polygons:
        p.use_smooth = False
    mb.add_object_data(me2, Matrix.Identity(4), paint, INT_GREEN)
    # frame round the door and stiffeners on the plate
    for x in (dw + 0.025, -dw - 0.025):
        box(mb, (0.05, y1 - y0, 0.05), (x, (y0 + y1) / 2, z), metal, ALU_DULL)
    box(mb, (DOOR_W + 0.1, 0.05, 0.05), (0, y1 + 0.01, z), metal, ALU_DULL)
    for x in (0.55, -0.55):
        box(mb, (0.04, 1.4, 0.04), (x, YC - 0.05, z), metal, ALU_DULL)
    # the door: swung open about its hinge, standing against the bulkhead
    hx = door_open_dir * dw
    ph = -door_open_dir * 1.4
    dm = trs((hx, (y0 + y1) / 2, z), (0, ph, 0)) @ trs((-door_open_dir * dw, 0, 0.0))
    mb.add_object_data(prim('box', size=(DOOR_W, y1 - y0 - 0.02, 0.03)), dm, paint, door_col)
    mb.add_object_data(prim('box', size=(0.025, 0.1, 0.05)), dm @ trs((-door_open_dir * (dw - 0.06), 0.05, 0.03)), metal, STEEL)


bulkhead(Rr, rz1, 1)

# ============================== bomb bay ==============================
Bay = MeshBuilder('kitBay')
bz0, bz1 = RADIO_Z1, BAY_Z1
# shell: an elliptical tube (normals inward)
bm = bmesh.new()
n = 40
rings = []
for zi, z in enumerate((bz0, bz1)):
    rings.append([bm.verts.new((A * math.cos(2 * math.pi * i / n), YC + B * math.sin(2 * math.pi * i / n), z)) for i in range(n)])
for i in range(n):
    bm.faces.new([rings[0][i], rings[0][(i + 1) % n], rings[1][(i + 1) % n], rings[1][i]])
me = bpy.data.meshes.new('tmp')
bm.normal_update()
bm.to_mesh(me)
bm.free()
Bay.add_object_data(me, Matrix.Identity(4), metal, ALU_DULL)
for z in (bz0 + 0.5, bz0 + 1.2, bz0 + 1.9, bz0 + 2.5):
    former(Bay, z, -math.pi / 2 + 0.25, 3 * math.pi / 2 - 0.25, col=ZINC, depth=0.09)
for t in STRINGER_TS[::2]:
    z_strip(Bay, t, bz0 + 0.03, bz1 - 0.03, 0.004, 0.026, 0.02, metal, ALU_DULL)
# catwalk: a narrow channel on its keel beam (V truss under it)
cw = 0.24
cwy = FLOOR_TOP - 0.06
box(Bay, (cw, 0.02, bz1 - bz0), (0, cwy, (bz0 + bz1) / 2), metal, ALU)
for x in (cw / 2, -cw / 2):
    box(Bay, (0.02, 0.06, bz1 - bz0), (x, cwy - 0.03, (bz0 + bz1) / 2), metal, ALU_DULL)
for i in range(9):
    z = bz0 + 0.15 + i * 0.32
    for s in (1, -1):
        cyl(Bay, (0, cwy - 0.04, z), (s * 0.4, YC - B * 0.93, z + 0.12), 0.012, metal, ALU_DULL, segs=6)
# bomb doors: two curved panels below with light leaking along their seams
for s in (1, -1):
    for k in range(6):
        z_strip(Bay, -math.pi / 2 + s * (0.06 + k * 0.1), bz0 + 0.05, bz1 - 0.05, 0.0, 0.015, 0.1, paint, INT_GREEN)
for x in (0.0,):
    box(Bay, (0.01, 0.004, bz1 - bz0 - 0.2), (x, YC - B + 0.006, (bz0 + bz1) / 2), sky, (1, 1, 1))
for s in (1, -1):
    p, _ = skin_pt(-math.pi / 2 + s * 0.62, 0.004)
    box(Bay, (0.006, 0.006, bz1 - bz0 - 0.3), (p.x, p.y, (bz0 + bz1) / 2), sky, (1, 1, 1))
# racks: vertical I-beams each side with shackle arms
RACK_X = 0.42
for s in (1, -1):
    for z in (bz0 + 0.45, bz0 + 2.25):
        box(Bay, (0.06, 1.75, 0.06), (s * RACK_X, YC - 0.05, z), metal, ZINC)
    for y in (YC - 0.62, YC - 0.12, YC + 0.38):
        box(Bay, (0.04, 0.04, 1.86), (s * (RACK_X - 0.03), y + 0.2, bz0 + 1.35), metal, ZINC)
bulkhead(Bay, bz1 - 0.01, -1, door_col=INT_GREEN)
# a stencil board and the bomb-bay lamp
cyl(Bay, (0, YC + B - 0.02, bz0 + 1.3), (0, YC + B - 0.06, bz0 + 1.3), 0.05, metal, ALU_DULL, r2=0.04)
cyl(Bay, (0, YC + B - 0.06, bz0 + 1.3), (0, YC + B - 0.07, bz0 + 1.3), 0.038, glow, (0.2, 0.18, 0.14))

Bombs = MeshBuilder('kitBombs')


def bomb(mb, c):
    c = Vector(c)
    L, r = 1.15, 0.17
    a, b = c + Vector((0, 0, -L / 2 + 0.3)), c + Vector((0, 0, L / 2 - 0.25))
    cyl(mb, a, b, r, paint, BOMB_OD, segs=18, caps=False)
    sphere(mb, b, r, paint, BOMB_OD, scale=(1, 1, 1.5), u=18, v=10)                 # ogive nose (forward, +Z)
    cyl(mb, a, a + Vector((0, 0, -0.22)), r, paint, BOMB_OD, r2=0.07, segs=18)     # tail cone
    for k in range(4):                                                              # box fin
        ang = k * math.pi / 2 + math.pi / 4
        d = Vector((math.cos(ang), math.sin(ang), 0))
        mb.add_object_data(prim('box', size=(0.006, 0.2, 0.26)), Matrix.Translation(a + Vector((0, 0, -0.3)) + d * 0.1) @ Matrix.Rotation(ang - math.pi / 2, 4, 'Z'), paint, BOMB_OD)
    mb.add_object_data(prim('torus', R=0.17, r=0.01, nu=18, nv=4), Matrix.Translation(a + Vector((0, 0, -0.36))), paint, BOMB_OD)
    mb.add_object_data(prim('cyl', r1=r + 0.002, h=0.06, segs=18, caps=False), Matrix.Translation(b + Vector((0, 0, 0.12))), paint, BOMB_BAND)   # yellow nose band
    cyl(mb, b + Vector((0, 0, 0.22)), b + Vector((0, 0, 0.3)), 0.03, metal, STEEL, segs=10)                                                      # nose fuze
    cyl(mb, c + Vector((0, r, -0.2)), c + Vector((0, r + 0.04, -0.2)), 0.012, metal, STEEL, segs=6)                                               # lugs
    cyl(mb, c + Vector((0, r, 0.15)), c + Vector((0, r + 0.04, 0.15)), 0.012, metal, STEEL, segs=6)


for s in (1, -1):
    for y in (YC - 0.62, YC - 0.12, YC + 0.38):
        bomb(Bombs, (s * (RACK_X - 0.2), y, bz0 + 1.35))

# ============================== build objects, bake AO ==============================
objs = [W.finish(), Rr.finish(), Bay.finish(), Bombs.finish()]
free_tmp()
for o in objs:
    for p in o.data.polygons:
        p.use_smooth = p.area < 0.002 or len(p.vertices) != 4

# stand-in of the procedural shell (not exported): occludes the AO bake like the real skin
bm = bmesh.new()
n = 72
zs = [Z0 - 0.05, Z1, RADIO_Z1]
rings = [[bm.verts.new((A * 1.002 * math.cos(2 * math.pi * i / n), YC + B * 1.002 * math.sin(2 * math.pi * i / n), z)) for i in range(n)] for z in zs]
for r0, r1 in zip(rings, rings[1:]):
    for i in range(n):
        bm.faces.new([r0[i], r0[(i + 1) % n], r1[(i + 1) % n], r1[i]])
bmesh.ops.contextual_create(bm, geom=rings[0])
fl = [bm.verts.new(v) for v in ((0.66, FLOOR_TOP - 0.02, Z0), (-0.66, FLOOR_TOP - 0.02, Z0), (-0.66, FLOOR_TOP - 0.02, RADIO_Z1), (0.66, FLOOR_TOP - 0.02, RADIO_Z1))]
bm.faces.new(fl)
me = bpy.data.meshes.new('occluder')
bm.to_mesh(me)
bm.free()
occ = bpy.data.objects.new('occluder', me)
bpy.context.scene.collection.objects.link(occ)
occ.data.materials.append(paint)


def bake_ao(ob):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.render.bake.target = 'VERTEX_COLORS'
    me = ob.data
    ao = me.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = ao
    scene.world = scene.world or bpy.data.worlds.new('w')
    scene.world.light_settings.distance = 0.6
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO')
    col = me.color_attributes['Col']
    for poly in me.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices):
            a = ao.data[vi].color
            k = 0.25 + 0.75 * (a[0] + a[1] + a[2]) / 3
            c = col.data[li].color
            col.data[li].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)
    me.color_attributes.remove(me.color_attributes['AO'])
    me.color_attributes.active_color = me.color_attributes['Col']


if not NO_BAKE:
    for o in objs:
        bake_ao(o)
bpy.data.objects.remove(occ)

# game frame -> Blender frame (rotate +90 degrees about X), applied to the mesh data
R = Matrix.Rotation(math.pi / 2, 4, 'X')
for o in objs:
    o.data.transform(R)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
export_glb(OUT, objects=objs)
print('interior written', OUT, [(o.name, len(o.data.polygons)) for o in objs])
