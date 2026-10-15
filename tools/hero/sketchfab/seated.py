"""Freeze our original B-17 crew's sit clip for aircraft exteriors; no third-party pilot geometry."""
import bpy,sys
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[-2])
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
action=next(a for a in bpy.data.actions if a.name=='sit')
arm.animation_data_create();arm.animation_data.action=action
if hasattr(action,'slots') and len(action.slots): arm.animation_data.action_slot=action.slots[0]
bpy.context.scene.frame_set(1)
arm.pose.bones['head'].rotation_mode='QUATERNION'
arm.pose.bones['head'].rotation_quaternion=(1,0,0,0)
bpy.context.view_layer.update()
print('CREW',[(o.name,o.type)for o in bpy.data.objects])
# Bake just the main clothed body; the heavy flak vest belongs inside the bomber.
body=next(o for o in bpy.data.objects if o.type=='MESH' and o.name=='crewBody')
dg=bpy.context.evaluated_depsgraph_get();me=bpy.data.meshes.new_from_object(body.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
me.transform(body.matrix_world)
# Origin at eyes. Imported crew has its own coordinate frame (Blender Z up).
head=arm.matrix_world @ arm.pose.bones['head'].head
for v in me.vertices:v.co-=Vector((head.x,head.y-.055,head.z+.09))
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
o=bpy.data.objects.new('own_seated_crew',me);bpy.context.collection.objects.link(o)
mod=o.modifiers.new('exterior_budget','DECIMATE');mod.ratio=min(1,3500/max(1,sum(len(p.vertices)-2 for p in me.polygons)))
bpy.context.view_layer.update()
compact=bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()),preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get())
o.modifiers.clear();o.data=compact
for p in compact.polygons:p.use_smooth=True
bpy.ops.export_scene.gltf(filepath=sys.argv[-1],export_format='GLB',export_animations=False,export_skins=False,export_yup=True)
