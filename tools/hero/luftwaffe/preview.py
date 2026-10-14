"""Quick look at a built hero (before finish.mjs): Blender renders of out/<kind>.glb with its painted atlas.

  Blender -b -P tools/hero/luftwaffe/preview.py -- fw190 [--lod 0|1|2] [--ace] [--dbg node] [--out dir]
Writes <out>/<kind>_preview.jpg (four views: 3/4 front, 3/4 rear, below, side) - QA only.
"""
import bpy, sys, os, math
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def opt(name, default):
    if name in argv:
        i = argv.index(name); v = argv[i + 1]; del argv[i:i + 2]; return type(default)(v)
    return default
LOD = opt('--lod', 0)
OUT = opt('--out', os.path.join(HERE, 'out'))
DBG = opt('--dbg', '')
ACE = '--ace' in argv
CLOSE = '--close' in argv or '--pilot' in argv
PILOT = '--pilot' in argv
kinds = [a for a in argv if not a.startswith('--')]

for kind in kinds:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, 'out', f'{kind}.glb'))
    base = os.path.join(HERE, 'out', f'{kind}_{"dbg_" + DBG if DBG else ("ace" if ACE else "base")}.png')
    mat = bpy.data.materials.new('pv')
    mat.use_backface_culling = True          # the game's skin is single-sided
    nt = mat.node_tree
    bs = nt.nodes.get('Principled BSDF')
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(base)
    nt.links.new(tex.outputs[0], bs.inputs['Base Color'])
    orm = nt.nodes.new('ShaderNodeTexImage'); orm.image = bpy.data.images.load(os.path.join(HERE, 'out', f'{kind}_orm.png'))
    orm.image.colorspace_settings.name = 'Non-Color'
    sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(orm.outputs[0], sep.inputs[0])
    nt.links.new(sep.outputs[1], bs.inputs['Roughness']); nt.links.new(sep.outputs[2], bs.inputs['Metallic'])
    nm = nt.nodes.new('ShaderNodeTexImage'); nm.image = bpy.data.images.load(os.path.join(HERE, 'out', f'{kind}_normal.png'))
    nm.image.colorspace_settings.name = 'Non-Color'
    nmap = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(nm.outputs[0], nmap.inputs['Color']); nt.links.new(nmap.outputs[0], bs.inputs['Normal'])
    glass = bpy.data.materials.new('gl')
    gb = glass.node_tree.nodes.get('Principled BSDF'); gb.inputs['Alpha'].default_value = 0.25; gb.inputs['Roughness'].default_value = 0.05
    for o in sc.objects:
        if o.type != 'MESH':
            continue
        n = o.name
        hide = n.startswith('gear_') or n == 'blades_1' and False
        if LOD == 0:
            hide |= n.endswith('_lod1') or n.endswith('_lod2')
        else:
            hide |= n.endswith('_lod0') or (n.endswith('_lod1') and LOD != 1) or (n.endswith('_lod2') and LOD != 2)
            hide |= n in ('pilot', 'crew', 'interior')
        o.hide_render = hide
        o.data.materials.clear()
        o.data.materials.append(glass if n == 'glass' else mat)
    sc.render.engine = 'BLENDER_EEVEE'
    w = bpy.data.worlds.new('w'); sc.world = w
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.65, 0.78, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
    sun.data.energy = 3.5; sun.rotation_euler = (math.radians(40), math.radians(15), math.radians(30))
    sc.view_settings.view_transform = 'AgX'
    sc.render.resolution_x, sc.render.resolution_y = 900, 640
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 50
    xs = [(o.matrix_world @ Vector(c)).x for o in sc.objects if o.type == 'MESH' and not o.hide_render for c in o.bound_box]
    span = max(xs) - min(xs)
    files = []
    views = (('34', (1, -1.1, 0.55)), ('rear', (-0.9, 1.0, 0.6)), ('below', (0.5, -0.4, -1)), ('side', (1, 0, 0.02)))
    if CLOSE:
        views = (('c1', (0.8, -0.7, 0.45)), ('c2', (-0.7, 0.6, 0.5)), ('c3', (0.4, -0.3, -0.8)), ('c4', (0.3, 0.9, 0.35)))
    eye = next((o.matrix_world.translation.copy() for o in sc.objects if o.name == 'eye_pilot'), Vector((0, 0, 0)))
    for nmv, d in views:
        d = Vector(d).normalized()
        if CLOSE:
            cam.location = d * (1.3 if PILOT else span * 0.55) + eye
            if PILOT:
                for o in sc.objects:
                    if o.name == 'glass':
                        o.hide_render = True
        else:
            cam.location = d * span * (2.0 if nmv != 'side' else 1.85) + Vector((0, -0.8, 0.2))
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        f = os.path.join(OUT, f'_pv_{kind}_{nmv}.png'); sc.render.filepath = f
        bpy.ops.render.render(write_still=True); files.append(f)
    # 2x2 sheet
    imgs = [bpy.data.images.load(f) for f in files]
    W, H = 900, 640
    import numpy as np
    sheet = np.zeros((H * 2, W * 2, 4), np.float32)
    for i, im in enumerate(imgs):
        a = np.array(im.pixels[:], np.float32).reshape(H, W, 4)
        r, c = 1 - i // 2, i % 2
        sheet[r * H:(r + 1) * H, c * W:(c + 1) * W] = a
    out = bpy.data.images.new('sheet', W * 2, H * 2)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(OUT, f'{kind}_preview{"_lod" + str(LOD) if LOD else ""}{"_" + DBG if DBG else ""}{"_pilot" if PILOT else ("_close" if CLOSE else "")}{"_ace" if ACE else ""}.jpg')
    out.file_format = 'JPEG'
    out.save()
    for f in files:
        os.remove(f)
