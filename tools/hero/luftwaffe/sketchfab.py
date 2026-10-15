"""CC BY 4.0 Sketchfab shape adapter. See assets-src/sketchfab/CREDITS.md.
Retains authored airframe/canopy surfaces; removes deployed gear, prop and tiny bolt meshes.
Normalizes the parked pitch and span before the shared hero cutter/UV/painter/LOD pipeline.
"""
import os, math, json
import bpy, bmesh
import numpy as np
from fg import FG, REPO, _game, refine

class Sketchfab:
    def __init__(self, kind, **unused):
        self.kind = kind
        self.meshes, self.markers, self.origins = {}, {}, {}
        # The established gameplay anchors remain independent of the visual source.
        with open(os.path.join(REPO, 'tools/hero/sketchfab/anchors.json')) as f:
            anchors = json.load(f)[kind]
        for name, position in anchors.items():
            if name.startswith(('eye_', 'muzzle_')): self.markers[name] = tuple(position)
            if name == 'prop_1': self.origins[name] = tuple(position)
        bf = kind == 'bf109'
        file = 'bf_109_f-2_messerschmitt' if bf else 'fw_190'
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(REPO, 'assets-src/sketchfab', file + '.glb'))
        new = [o for o in bpy.data.objects if o not in before]
        bpy.context.view_layer.update()
        angle = 0.0 if bf else math.atan(0.20)
        ca, sa = math.cos(angle), math.sin(angle)
        scale = 9.924 / 993.750666 if bf else 10.5 / 505.551758
        hub = np.array([0, -90, 379] if bf else [0, 13, 184])
        def turn(v):
            return np.array([v[0], ca*v[1]-sa*v[2], sa*v[1]+ca*v[2]])
        offset = np.array(self.origins['prop_1']) - turn(hub)*scale
        buckets = {k: [[], [], []] for k in ('airframe', 'glass', 'interior')}
        for o in new:
            if o.type != 'MESH': continue
            mat = o.data.materials[0].name if o.data.materials else ''
            name = o.name.split('.')[0]
            if bf and name not in ('Object_9', 'Object_10'): continue
            if not bf and (mat.startswith(('BoltsMat', 'StealMat', 'TireMat')) or name.startswith(('pHelix', 'Screw_', 'polySurface31_', 'polySurface44_', 'polySurface88_', 'FrontGun_', 'RadiaDoors_'))): continue
            vs = np.array([_game(o.matrix_world @ v.co) for v in o.data.vertices])
            if bf: vs = vs[:, [2,1,0]] * [-1,1,1]
            # Source landing-gear islands are disconnected from the skin.
            src = FG._bm(vs, [tuple(p.vertices) for p in o.data.polygons], [mat]*len(o.data.polygons), .01)
            bm = src.bm
            todo = set(bm.verts)
            while todo:
                v = todo.pop(); group = {v}; stack = [v]
                while stack:
                    for e in stack.pop().link_edges:
                        for w in e.verts:
                            if w in todo: todo.remove(w); group.add(w); stack.append(w)
                lo = np.min([v.co[:] for v in group], axis=0); hi = np.max([v.co[:] for v in group], axis=0)
                drop = bf and ((lo[2]>150 and hi[2]<220 and hi[1]<-105) or (lo[2]>-355 and hi[2]<-320 and hi[1]<-35))
                if drop: bmesh.ops.delete(bm, geom=list(group), context='VERTS')
            bm.verts.ensure_lookup_table(); bm.verts.index_update()
            V = [tuple(turn(v.co)*scale+offset) for v in bm.verts]
            # Replace source spinner with the shared animated hero spinner.
            F = [tuple(v.index for v in f.verts) for f in bm.faces if not (bf and all(v.co.z>376 for v in f.verts))]
            bucket = 'glass' if 'Glass' in mat else 'interior' if (not bf and name.startswith(('pCube4_', 'pCube5_', 'pCylinder36_', 'pCube6_', 'pCube3_'))) else 'airframe'
            a,b,c = buckets[bucket]; start=len(a); a.extend(V); b.extend([tuple(i+start for i in f) for f in F]); c.extend([mat]*len(F)); bm.free()
        for k,(V,F,M) in buckets.items():
            self.meshes[k] = FG._bm(V,F,M,.0005)
        self.markers['eye_pilot'] = (0, .78, -.85) if bf else (0, .48, -1.50)
        # Smooth the economical Fw190 skin, retaining its original vertices.
        if not bf: refine(self.meshes['airframe'], .22)
        for o in new: bpy.data.objects.remove(o, do_unlink=True)
        for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
            for d in list(coll):
                if d.users == 0: coll.remove(d)
