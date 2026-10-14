"""Export only LOD0 projected triangles; used by silhouette.py (no render ambiguity)."""
import bpy,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
result={}
for name,file in [('hero','tools/hero/output/b17.glb'),('legacy','tools/convert_models/output/b17.glb')]:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(ROOT/file))
    triangles=[];bounds=[]
    for o in bpy.context.scene.objects:
        if o.type!='MESH':continue
        p=o;skip=False
        while p:
            if any(t in p.name for t in ['_LOD1','_LOD2','invasion','antenna_wire','prop_']):skip=True
            p=p.parent
        if skip:continue
        o.data.calc_loop_triangles()
        verts=[o.matrix_world@v.co for v in o.data.vertices]
        verts=[(v.x,v.z,-v.y) for v in verts]
        bounds.extend(verts)
        triangles.extend([[verts[i] for i in t.vertices] for t in o.data.loop_triangles])
    result[name]={'triangles':triangles,'bounds':[[min(p[i] for p in bounds) for i in range(3)],[max(p[i] for p in bounds) for i in range(3)]]}
(ROOT/'tools/hero/output/projections.json').write_text(json.dumps(result))
