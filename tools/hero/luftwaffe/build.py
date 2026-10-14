"""Builds the Luftwaffe hero models in Blender (headless):

  /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/hero/luftwaffe/build.py -- bf109 fw190 ...
  options: --size 2048 (atlas)  --ao-samples 96  --out tools/hero/luftwaffe/out

Per type: geometry from types/<kind>.py (game frame, named parts) -> Blender objects -> one shared
atlas UV over every opaque mesh -> Cycles bakes of position / normal / part / surface-coordinate
maps and ambient occlusion -> paint.py synthesises base colour (camouflage, markings, weathering),
roughness, metalness and the panel-line / rivet / fabric height field, from which the tangent-space
normal map is derived -> LOD1 / LOD2 meshes (decimated copies sharing the atlas) -> GLB + PNGs in
--out. tools/hero/luftwaffe/finish.mjs then attaches the textures and compresses (meshopt + WebP).
"""
import bpy, bmesh, sys, os, math, time, importlib, json
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, 'types'))
import paint  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def opt(name, default):
    if name in argv:
        i = argv.index(name)
        v = argv[i + 1]
        del argv[i:i + 2]
        return type(default)(v)
    return default
SIZE = opt('--size', 2048)
AO_SAMPLES = opt('--ao-samples', 96)
OUT = opt('--out', os.path.join(HERE, 'out'))
NO_LOD = '--no-lod' in argv
argv = [a for a in argv if not a.startswith('--')]
KINDS = argv or ['bf109', 'fw190', 'me262', 'bf110', 'ju88']
os.makedirs(OUT, exist_ok=True)

LOD1_RATIO = 0.4
LOD1_TRIS = {'bf109': 10000, 'fw190': 10000, 'me262': 11000, 'bf110': 13000, 'ju88': 13000}
LOD2_TRIS = {'bf109': 2600, 'fw190': 2600, 'me262': 3000, 'bf110': 3600, 'ju88': 4200}


def C(v):
    """game frame (x left, y up, z nose) -> Blender (x, y back, z up)"""
    return Vector((v[0], -v[2], v[1]))


def node_matrix(n):
    if n.axes:
        x = Vector(n.axes[0]); y = Vector(n.axes[1]); z = x.cross(y)
        R = Matrix((C(x), C(y), C(z))).transposed()   # columns = local axes in Blender frame
    else:
        R = Matrix.Identity(3)
    M = R.to_4x4()
    M.translation = C(n.pos)
    return M


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = 'GPU'
    except Exception as e:  # CPU is fine, just slower
        print('cycles GPU unavailable:', e)
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.light_settings.distance = 0.7
    return sc


def make_mesh_object(name, node, meshes, order_index, local_M_inv):
    verts, faces, attr, fcls, ffix = [], [], [], [], []
    for mesh, cls in meshes:
        o = len(verts)
        for v in mesh.verts:
            verts.append(local_M_inv @ C(v))
        attr.extend(mesh.attr)
        fx = getattr(mesh, 'fixed', False)
        for f in mesh.faces:
            faces.append(tuple(i + o for i in f))
            fcls.append(cls)
            ffix.append(fx)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    fa = me.attributes.new('fixed', 'INT', 'FACE')
    fa.data.foreach_set('value', [1 if x else 0 for x in ffix])
    fc = me.attributes.new('fcls', 'INT', 'FACE')
    fc.data.foreach_set('value', fcls)
    me.validate(clean_customdata=False)
    ffix = [0] * len(me.polygons)
    me.attributes['fixed'].data.foreach_get('value', ffix)
    fcls = [0] * len(me.polygons)
    me.attributes['fcls'].data.foreach_get('value', fcls)
    me.attributes.remove(me.attributes['fixed'])
    me.attributes.remove(me.attributes['fcls'])
    # attributes for the bakes: per-vertex surface coords, per-face paint class + node index
    pc = me.color_attributes.new('pcoord', 'FLOAT_COLOR', 'POINT')
    flat = []
    for a in attr[:len(me.vertices)]:
        flat += [a[0] / 40 + 0.5, a[1] / 8 + 0.5, a[2] / 64, 1.0]
    if len(flat) < len(me.vertices) * 4:
        flat += [0.5, 0.5, 0.0, 1.0] * (len(me.vertices) - len(flat) // 4)
    pc.data.foreach_set('color', flat)
    pi = me.attributes.new('pinfo', 'FLOAT_COLOR', 'FACE')
    vals = []
    for i in range(len(me.polygons)):
        c = fcls[i] if i < len(fcls) else 0
        vals += [c / 64, order_index / 255, 0.0, 1.0]
    pi.data.foreach_set('color', vals)
    # consistent outward normals, smooth with sharp creases
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    own = [f for f in bm.faces if not (f.index < len(ffix) and ffix[f.index])]
    if own:     # our own parts; FlightGear-derived faces keep the winding fg.cull_hidden gave them
        bmesh.ops.recalc_face_normals(bm, faces=own)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    try:
        me.set_sharp_from_angle(angle=math.radians(38))
    except Exception:
        pass
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def build_objects(m):
    objs, world = {}, {}
    lod0, opaque, glass = {}, [], []
    for idx, name in enumerate(m.order):
        n = m.nodes[name]
        Mw = node_matrix(n)
        parent = objs.get(n.parent) if n.parent else None
        Mp = world[n.parent] if n.parent else Matrix.Identity(4)
        world[name] = Mw
        if n.meshes and not n.lod:
            ob = make_mesh_object(name, n, n.meshes, idx, Mw.inverted())
        else:
            ob = bpy.data.objects.new(name, None)
            ob.empty_display_size = 0.1
            bpy.context.scene.collection.objects.link(ob)
        ob.parent = parent
        ob.matrix_basis = Mp.inverted() @ Mw
        objs[name] = ob
        if n.meshes and n.lod:
            ch = make_mesh_object(name + '_lod0', n, n.meshes, idx, Mw.inverted())
            ch.parent = ob
            ch.matrix_basis = Matrix.Identity(4)
            lod0[name] = ch
            opaque.append(ch)
        elif n.meshes:
            (glass if name == 'glass' else opaque).append(ob)
    bpy.context.view_layer.update()
    return objs, lod0, opaque, glass


LOW_PRIORITY = ('interior', 'gear_', 'blades_')   # crew figures keep full density (faces, straps)


def unwrap(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(52), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode='OBJECT')
    # what the gunner hardly sees gets less texture
    for o in objs:
        if any(o.name.startswith(p) for p in LOW_PRIORITY):
            uv = o.data.uv_layers.active.data
            a = np.empty(len(uv) * 2, np.float32)
            uv.foreach_get('uv', a)
            a *= 0.45
            uv.foreach_set('uv', a)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin=0.0035)
    bpy.ops.object.mode_set(mode='OBJECT')


def uv_overlap(objs, res=512):
    """Fraction of atlas cells covered by triangles of more than one object (packing check), and the
    worst object pairs."""
    owner = np.full((res, res), -1, np.int32)
    clash = {}
    for oi, o in enumerate(objs):
        me = o.data
        uv = me.uv_layers.active.data
        me.calc_loop_triangles()
        for tri in me.loop_triangles:
            pts = np.array([uv[l].uv[:] for l in tri.loops]) * res
            x0, y0 = np.floor(pts.min(0)).astype(int)
            x1, y1 = np.ceil(pts.max(0)).astype(int)
            for cy in range(max(0, y0), min(res, y1)):
                for cx in range(max(0, x0), min(res, x1)):
                    px, py = cx + 0.5, cy + 0.5
                    (ax, ay), (bx, by), (qx, qy) = pts
                    d = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy)
                    if abs(d) < 1e-12:
                        continue
                    l1 = ((by - qy) * (px - qx) + (qx - bx) * (py - qy)) / d
                    l2 = ((qy - ay) * (px - qx) + (ax - qx) * (py - qy)) / d
                    if l1 < 0 or l2 < 0 or l1 + l2 > 1:
                        continue
                    prev = owner[cy, cx]
                    if prev >= 0 and prev != oi:
                        key = (objs[prev].name, o.name)
                        clash[key] = clash.get(key, 0) + 1
                    owner[cy, cx] = oi
    worst = sorted(clash.items(), key=lambda kv: -kv[1])[:6]
    return sum(clash.values()) / float(res * res), worst


def bake_material(kind):
    mat = bpy.data.materials.get('bake_' + kind) or bpy.data.materials.new('bake_' + kind)
    pass
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs[0])
    img = nt.nodes.new('ShaderNodeTexImage')
    nt.nodes.active = img
    if kind in ('pos', 'nrm'):
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        mul = nt.nodes.new('ShaderNodeVectorMath'); mul.operation = 'MULTIPLY_ADD'
        if kind == 'pos':
            nt.links.new(geo.outputs['Position'], mul.inputs[0])
            mul.inputs[1].default_value = (1 / 40, 1 / 40, 1 / 40)
        else:
            nt.links.new(geo.outputs['Normal'], mul.inputs[0])
            mul.inputs[1].default_value = (0.5, 0.5, 0.5)
        mul.inputs[2].default_value = (0.5, 0.5, 0.5)
        nt.links.new(mul.outputs[0], em.inputs['Color'])
    elif kind in ('pinfo', 'pcoord'):
        at = nt.nodes.new('ShaderNodeAttribute')
        at.attribute_name = kind
        nt.links.new(at.outputs['Color'], em.inputs['Color'])
    else:  # ao: plain diffuse
        nt.nodes.remove(em)
        bs = nt.nodes.new('ShaderNodeBsdfDiffuse')
        nt.links.new(bs.outputs[0], out.inputs[0])
    return mat, img


def bake(objs, kind, size, samples=1, hide=()):
    sc = bpy.context.scene
    img = bpy.data.images.new('bk_' + kind, size, size, alpha=True, float_buffer=True)
    img.pixels.foreach_set(np.zeros(size * size * 4, np.float32))
    mat, node = bake_material(kind)
    node.image = img
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(mat)
    for o in hide:
        o.hide_render = True
    sc.cycles.samples = samples
    sc.render.bake.margin = 12
    sc.render.bake.margin_type = 'EXTEND'
    sc.render.bake.use_clear = False
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    t = time.time()
    bpy.ops.object.bake(type='EMIT' if kind != 'ao' else 'AO', margin=12, use_clear=False)
    for o in hide:
        o.hide_render = False
    a = np.empty(size * size * 4, np.float32)
    img.pixels.foreach_get(a)
    print(f'  bake {kind}: {time.time() - t:.1f}s')
    return a.reshape(size, size, 4)


def bake_proxy(objs, name):
    """One joined copy of objs (world space, same UVs and attributes): a multi-object bake extends each
    object's margin over the other objects' islands; one object keeps every island intact."""
    bm = bmesh.new()
    for o in objs:
        me = o.data.copy()
        me.transform(o.matrix_world)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def save_png(arr, path, size):
    """arr: (H, W, 3|4) floats 0..1 (already in the file's colour space)."""
    h, w = arr.shape[:2]
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), np.float32)], 2)
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.clip(arr, 0, 1).astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def decimated_copy(src, name, ratio, parent, local=Matrix.Identity(4)):
    ob = src.copy()
    ob.data = src.data.copy()
    ob.name = name
    bpy.context.scene.collection.objects.link(ob)
    mod = ob.modifiers.new('dec', 'DECIMATE')
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)
    ob.parent = parent
    ob.matrix_basis = local
    return ob


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def merged_lod(objs, lod0, name, target_tris=None, ratio=None, cap=None):
    """The whole airframe (every part + control surface at LOD0) merged into one mesh under part_fuselage,
    decimated to a ratio or a triangle target: one draw call per aircraft past LOD0."""
    bm = bmesh.new()
    host = objs['part_fuselage']
    inv = host.matrix_world.inverted()
    for nm, ob in lod0.items():
        me = ob.data.copy()
        me.transform(inv @ ob.matrix_world)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name + '_src')
    bm.to_mesh(me)
    bm.free()
    tmp = bpy.data.objects.new(name + '_tmp', me)
    bpy.context.scene.collection.objects.link(tmp)
    tmp.parent = host
    total = tri_count(tmp)
    r = ratio if ratio is not None else min(1.0, target_tris / max(1, total))
    if cap:
        r = min(r, cap / max(1, total))
    out = decimated_copy(tmp, name, r, host)
    bpy.data.objects.remove(tmp)
    for p in out.data.polygons:
        p.use_smooth = True
    print(f'  {name}: {total} -> {tri_count(out)} tris')
    return out


def make_lods(m, objs, lod0):
    merged_lod(objs, lod0, 'part_fuselage_lod1', ratio=LOD1_RATIO, cap=LOD1_TRIS.get(m.kind))
    merged_lod(objs, lod0, 'part_fuselage_lod2', target_tris=LOD2_TRIS.get(m.kind, 3000))


def export(m, objs, opaque, glass, path):
    skin = bpy.data.materials.new('hero_' + m.kind)
    pass
    gl = bpy.data.materials.new('hero_' + m.kind + '_glass')
    pass
    bs = gl.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Alpha'].default_value = 0.3
    bs.inputs['Roughness'].default_value = 0.05
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH':
            continue
        me = ob.data
        for nm in ('pinfo', 'pcoord'):
            a = me.attributes.get(nm) or me.color_attributes.get(nm)
            if a:
                me.attributes.remove(a)
        me.materials.clear()
        me.materials.append(gl if ob.name == 'glass' else skin)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False, export_extras=True,
                              export_yup=True, export_texcoords=True, export_normals=True, export_tangents=False,
                              export_materials='EXPORT', export_animations=False, export_skins=False,
                              export_morph=False, export_lights=False, export_cameras=False,
                              export_vertex_color='NONE', export_image_format='NONE')


def tris_report(objs):
    out = {}
    for ob in bpy.context.scene.objects:
        if ob.type == 'MESH':
            out[ob.name] = tri_count(ob)
    return out


for kind in KINDS:
    t0 = time.time()
    print(f'== {kind}')
    sc = reset()
    mod = importlib.import_module(kind)
    m = mod.build()
    objs, lod0, opaque, glass = build_objects(m)
    unwrap(opaque)
    if os.environ.get('HERO_UVCHECK'):
        frac, worst = uv_overlap(opaque)
        print(f'  UV overlap {frac * 100:.2f}% of the atlas; worst {worst}')
    hide = [o for o in bpy.context.scene.objects if o.type == 'MESH' and (o.name.startswith('gear_') or o.name.startswith('blades_'))]
    maps = {}
    originals = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in originals:
        o.hide_render = True
    proxy = bake_proxy(opaque, '_bake_all')
    for k in ('pos', 'nrm', 'pinfo', 'pcoord'):
        maps[k] = bake([proxy], k, SIZE)
    bpy.data.objects.remove(proxy)
    proxy = bake_proxy([o for o in opaque if o not in hide], '_bake_ao')
    maps['ao'] = bake([proxy], 'ao', SIZE, AO_SAMPLES)
    bpy.data.objects.remove(proxy)
    for o in originals:
        o.hide_render = False
    tex = paint.paint(m, maps, SIZE)
    base = os.path.join(OUT, kind)
    for k, arr in tex.items():
        save_png(arr, f'{base}_{k}.png', SIZE)
    if not NO_LOD:
        make_lods(m, objs, lod0)
    rep = tris_report(objs)
    export(m, objs, opaque, glass, base + '.glb')
    with open(base + '_report.json', 'w') as f:
        json.dump({'kind': kind, 'tris': rep, 'seconds': round(time.time() - t0, 1),
                   'lod0': sum(v for k, v in rep.items() if not k.endswith('_lod1') and not k.endswith('_lod2')),
                   'lod1': rep.get('part_fuselage_lod1', 0),
                   'lod2': rep.get('part_fuselage_lod2', 0)}, f, indent=1)
    print(f'== {kind} done in {time.time() - t0:.1f}s')
