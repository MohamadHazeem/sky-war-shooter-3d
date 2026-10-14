# Shared helpers for the Blender generators in tools/interior (run inside Blender's Python).
# Game frame: metres, +X left wing, +Y up, +Z nose. Blender frame: Z up. The glTF exporter maps
# Blender (x, y, z) -> glTF (x, z, -y), so a game point (gx, gy, gz) is Blender (gx, -gz, gy).
import bpy
import bmesh
import math
from mathutils import Vector, Matrix


def G(x, y, z):
    """Game coordinates -> Blender coordinates."""
    return Vector((x, -z, y))


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def material(name, color, rough=0.8, metal=0.0, emissive=None, emit_strength=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emissive is not None:
        bsdf.inputs['Emission Color'].default_value = (*emissive, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    return m


def use_vertex_colors(mat, attr='Col'):
    """Multiply the base colour by a colour attribute (so the glTF exporter writes COLOR_0)."""
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    if any(n.type == 'VERTEX_COLOR' for n in nt.nodes):
        return
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = attr
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])


class MeshBuilder:
    """Accumulates bmesh geometry with per-face material index and per-loop colour."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Col')   # linear floats (byte colours are sRGB)
        self.mats = []

    def mat_index(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def add_object_data(self, me, matrix, mat, color=(1, 1, 1)):
        """Append a mesh datablock transformed by matrix."""
        tmp = bmesh.new()
        tmp.from_mesh(me)
        bmesh.ops.transform(tmp, matrix=matrix, verts=tmp.verts)
        idx = self.mat_index(mat)
        vmap = {}
        for v in tmp.verts:
            vmap[v] = self.bm.verts.new(v.co)
        for f in tmp.faces:
            try:
                nf = self.bm.faces.new([vmap[v] for v in f.verts])
            except ValueError:
                continue
            nf.material_index = idx
            nf.smooth = f.smooth
            for l in nf.loops:
                l[self.col] = (*color, 1.0)
        tmp.free()

    def finish(self, collection=None):
        me = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        (collection or bpy.context.scene.collection).objects.link(ob)
        return ob


def prim(kind, **kw):
    """A primitive as a temporary mesh datablock (removed by the caller via free_tmp)."""
    bm = bmesh.new()
    if kind == 'box':
        bmesh.ops.create_cube(bm, size=1.0)
        sx, sy, sz = kw.get('size', (1, 1, 1))
        bmesh.ops.scale(bm, vec=Vector((sx, sy, sz)), verts=bm.verts)
    elif kind == 'cyl':
        bmesh.ops.create_cone(bm, cap_ends=kw.get('caps', True), segments=kw.get('segs', 16),
                              radius1=kw['r1'], radius2=kw.get('r2', kw['r1']), depth=kw['h'])
    elif kind == 'sphere':
        bmesh.ops.create_uvsphere(bm, u_segments=kw.get('u', 16), v_segments=kw.get('v', 10), radius=kw['r'])
        s = kw.get('scale')
        if s:
            bmesh.ops.scale(bm, vec=Vector(s), verts=bm.verts)
    elif kind == 'torus':
        R, r = kw['R'], kw['r']
        nu, nv = kw.get('nu', 24), kw.get('nv', 8)
        arc = kw.get('arc', 2 * math.pi)
        closed = arc >= 2 * math.pi - 1e-6
        rows = []
        cnt = nu if closed else nu + 1
        for i in range(cnt):
            a = arc * i / nu
            row = []
            for j in range(nv):
                b = 2 * math.pi * j / nv
                row.append(bm.verts.new(Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))))
            rows.append(row)
        for i in range(nu if closed else nu):
            r0, r1 = rows[i], rows[(i + 1) % cnt]
            for j in range(nv):
                bm.faces.new([r0[j], r1[j], r1[(j + 1) % nv], r0[(j + 1) % nv]])
    elif kind == 'tube':
        # swept circle along a polyline of Vectors
        pts, r, segs = kw['pts'], kw['r'], kw.get('segs', 8)
        rings = []
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            a = t.cross(up).normalized()
            b = t.cross(a).normalized()
            rings.append([bm.verts.new(p + (a * math.cos(2 * math.pi * k / segs) + b * math.sin(2 * math.pi * k / segs)) * r) for k in range(segs)])
        for i in range(len(rings) - 1):
            for k in range(segs):
                bm.faces.new([rings[i][k], rings[i + 1][k], rings[i + 1][(k + 1) % segs], rings[i][(k + 1) % segs]])
    me = bpy.data.meshes.new('tmp')
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = kw.get('smooth', kind in ('cyl', 'sphere', 'torus', 'tube'))
    return me


def free_tmp():
    for me in list(bpy.data.meshes):
        if me.name.startswith('tmp') and me.users == 0:
            bpy.data.meshes.remove(me)


def trs(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    from mathutils import Euler
    return Matrix.LocRotScale(Vector(loc), Euler(rot, 'XYZ'), Vector(scale))


def look_matrix(a, b):
    """Matrix moving a +Z-aligned primitive (centred) to span from a to b."""
    d = b - a
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()


def export_glb(path, objects=None, animations=False, extra=None):
    bpy.ops.object.select_all(action='DESELECT')
    if objects:
        for o in objects:
            o.select_set(True)
    opts = dict(filepath=path, export_format='GLB', use_selection=bool(objects), export_apply=True,
                export_yup=True, export_animations=animations, export_materials='EXPORT',
                export_normals=True, export_texcoords=True)
    opts.update(extra or {})
    try:
        bpy.ops.export_scene.gltf(**opts, export_vertex_color='ACTIVE')
    except TypeError:
        bpy.ops.export_scene.gltf(**opts, export_colors=True)
