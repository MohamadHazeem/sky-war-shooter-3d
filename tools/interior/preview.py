# Workbench preview renders of a generated glb (development aid; not part of the build).
#   Blender -b -P tools/interior/preview.py -- in.glb out_prefix [cam=front|side|waist] [clips...]
# For a skinned file it renders every clip at its start, middle and end; otherwise one still.
import bpy
import sys
import math
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
view = args[2] if len(args) > 2 else 'front'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'VERTEX' if '--mat' not in args else 'MATERIAL'
sc.display.shading.show_cavity = True
sc.render.resolution_x, sc.render.resolution_y = 700, 700
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
VIEWS = {
    'front': ((1.4, -3.2, 1.3), (0, 0, 0.9), 40),
    'side': ((3.4, 0.2, 1.1), (0, 0, 0.8), 40),
    'waist': ((0.0, 4.6, 0.5), (0.0, 7.4, 0.0), 75),   # inside the waist, looking aft
    'fwd': ((0.0, 8.8, 0.3), (0.0, 4.0, 0.1), 70),      # inside the waist, looking forward
    'radio': ((-0.2, 4.0, 0.4), (0.4, 2.8, 0.1), 80),
    'bay': ((0.0, 2.6, 0.0), (0.0, 0.0, 0.1), 70),
    'top': ((0, 6, 9), (0, 6, 0), 50),
    'face': ((0.22, -0.55, 1.7), (0, 0, 1.655), 22),
    'face3': ((0.12, -0.6, 1.68), (0, 0, 1.655), 24),
    'hand': ((0.9, -0.5, 1.1), (0.6, 0, 0.98), 25),
    'fp': ((0.35, -0.35, 0.25), (0, 0, 0), 30),
}
p, t, lens_deg = VIEWS[view]
cam.location = Vector(p)
cam.data.angle = math.radians(lens_deg)
d = Vector(t) - Vector(p)
cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
for o in sc.objects:   # the LOD overlaps the body; the first-person arm sits at the origin
    if 'Lod' in o.name or o.name.startswith('fpArm') or ('--novest' in args and ('Vest' in o.name or 'Steel' in o.name)):
        o.hide_render = True
arm = next((o for o in sc.objects if o.type == 'ARMATURE'), None)
if arm and arm.animation_data and arm.animation_data.nla_tracks:
    want = [a for a in args[3:] if not a.startswith('--')]
    for tr in arm.animation_data.nla_tracks:
        tr.mute = True
    for tr in arm.animation_data.nla_tracks:
        if want and tr.name not in want:
            continue
        st = tr.strips[0]
        arm.animation_data.action = st.action
        try:
            arm.animation_data.action_slot = st.action_slot
        except Exception:
            pass
        f0, f1 = int(st.action.frame_range[0]), int(st.action.frame_range[1])
        for k, f in enumerate((f0, (f0 + f1) // 2, f1)):
            sc.frame_set(f)
            sc.render.filepath = f'{out}_{tr.name}_{k}.png'
            bpy.ops.render.render(write_still=True)
else:
    sc.render.filepath = out + '.png'
    bpy.ops.render.render(write_still=True)
