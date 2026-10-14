"""Render the exported asset (not the authoring scene), four fixed studio angles."""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'tools/hero/output/b17.glb'))
for o in bpy.data.objects:
    if '_LOD1' in o.name or '_LOD2' in o.name or 'invasion' in o.name:o.hide_render=True
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1100;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.world.color=(.25,.25,.25)
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.45,.55,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
for pos,power,size in [((10,-12,23),4000,14),((-14,-3,9),2200,12),((0,15,20),3000,10)]:
    bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,3,0))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.lens=48
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=85
for name,pos in [('front',(27,-33,17)),('rear',(-27,36,15)),('side',(37,7,7)),('nose',(10,-12,5))]:
    cam.location=pos;target=(0,-3,0) if name=='nose' else (0,4,0);cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(ROOT/f'docs/phase10/shots/02/turntable-{name}.jpg');bpy.ops.render.render(write_still=True)
