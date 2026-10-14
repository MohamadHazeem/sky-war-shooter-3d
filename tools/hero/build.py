"""FlightGear-based B-17G rework. Run with Blender; see README for pinned source.
Preserve the source surfaces/UVs, add aircraft-specific relief and late-G fittings,
bake the relief onto the livery atlas, and export the shared-pivot LOD hierarchy.
"""
import bpy, bmesh, math, json, os
import numpy as np
from mathutils import Vector, Matrix
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'tools/hero/output'; OUT.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(OUT/'flightgear.glb'))
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
# Separate imported mesh holders from the named animation pivots before editing.
oldframe=bpy.data.objects.get('airframe')
if oldframe:oldframe.name='source_radials'
for spec in json.loads((ROOT/'tools/hero/flightgear.json').read_text())['nodes']:
    old=bpy.data.objects.get(spec['name'])
    if old and old.type=='MESH':
        bpy.context.view_layer.update();world=old.matrix_world.copy();children=list(old.children);parent=old.parent;old.name=spec['name']+'_surface'
        pivot=bpy.data.objects.new(spec['name'],None);bpy.context.collection.objects.link(pivot);pivot.parent=parent;pivot.matrix_world=world;bpy.context.view_layer.update()
        old.parent=pivot;old.matrix_world=world
        for child in children:
            cw=child.matrix_world.copy();child.parent=pivot;child.matrix_world=cw
# Work in game coordinates throughout, including all existing animation markers.
imported=list(bpy.context.scene.objects)
for o in imported:
    if o.type=='MESH':o.data.transform(C.inverted())
    o.matrix_basis=C.inverted()@o.matrix_basis@C
# Source's overall dimensions: 31.5204 x 23.1053 m including gun barrels.
scale=Matrix.Diagonal((31.62/31.5204,1,22.66/23.1053,1))
for o in imported:
    if o.type=='MESH':o.data.transform(scale)
    o.matrix_basis=scale@o.matrix_basis@scale.inverted()

pi=math.pi; nodes={}; meshes=[]
def empty(name,pos=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=pos;o.parent=parent;nodes[name]=o;return o
def material(name,color,rough=.6,metal=.0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
root=empty('B17G_HERO');root['hero']=True;root['source']='FGMEMBERS/B-17@949abb7615da96104a72c2b1a351a05d60a0bf3c'
frame=empty('airframe',parent=root)
parts={n:empty('part_'+n,parent=frame) for n in ['core','nose','tail','wingL','wingR','wingLtip','wingRtip']}
for n,pos in {'tail':(0,0,-10),'nose':(0,0,3.6),'wingL':(1.3,0,0),'wingR':(-1.3,0,0),'wingLtip':(7.5,.5,-1),'wingRtip':(-7.5,.5,-1)}.items():
    empty('joint_'+n,pos,parts[n]);empty('fuel_'+n,(pos[0]*1.15,pos[1],pos[2]),parts[n])
# Legacy aliases remain for the damage, paint and mechanical consumers.
for n in ['wingL','wingR','tail','tailL','tailR']:empty(n,parent=parts['tail' if n.startswith('tail') else n])
def parent_keep(o,p):
    bpy.context.view_layer.update();m=o.matrix_world.copy();o.parent=p;o.matrix_world=m

def mesh(name,verts,faces,mat,parent=frame,uv=None):
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);o.parent=parent;m.materials.append(mat)
    layer=m.uv_layers.new(name='UVMap')
    for p in m.polygons:
        p.use_smooth=True
        for li in p.loop_indices:
            co=m.vertices[m.loops[li].vertex_index].co;layer.data[li].uv=uv[m.loops[li].vertex_index] if uv else (co.x/2,co.z/2)
    meshes.append(o);return o

def tube(name,a,b,r,mat,parent=frame,seg=10):
    a=Vector(a);b=Vector(b);axis=(b-a).normalized();ref=Vector((0,1,0)) if abs(axis.y)<.9 else Vector((1,0,0));s=axis.cross(ref).normalized();t=axis.cross(s)
    vs=[tuple(p+r*(s*math.cos(i*2*pi/seg)+t*math.sin(i*2*pi/seg))) for p in [a,b] for i in range(seg)]
    return mesh(name,vs,[tuple(range(seg-1,-1,-1)),tuple(range(seg,seg*2))]+[(i,(i+1)%seg,(i+1)%seg+seg,i+seg) for i in range(seg)],mat,parent)

def ellipsoid(name,pos,size,mat,parent=frame,seg=24,rings=12):
    vs=[(pos[0]+size[0]*math.sin(pi*j/rings)*math.cos(2*pi*i/seg),pos[1]+size[1]*math.cos(pi*j/rings),pos[2]+size[2]*math.sin(pi*j/rings)*math.sin(2*pi*i/seg)) for j in range(rings+1) for i in range(seg+1)]
    fs=[(j*(seg+1)+i,j*(seg+1)+i+1,(j+1)*(seg+1)+i+1,(j+1)*(seg+1)+i) for j in range(rings) for i in range(seg)]
    return mesh(name,vs,fs,mat,parent)

def split(o,choose):
    # Keep the source UVs and smooth normals; split polygons at existing panel vertices.
    buckets={}
    for p in o.data.polygons:buckets.setdefault(choose(p.center),[]).append(p.index)
    result=[]
    for key,indices in buckets.items():
        cp=o.copy();cp.data=o.data.copy();bpy.context.collection.objects.link(cp);cp.name=o.name+'_'+key
        bm=bmesh.new();bm.from_mesh(cp.data);bm.faces.ensure_lookup_table();keep=set(indices)
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in keep],context='FACES');bm.to_mesh(cp.data);bm.free();result.append((key,cp))
    bpy.data.objects.remove(o,do_unlink=True);return result

def classify(p):
    if p.z < -10:return 'tail'
    if abs(p.x)>1.3:return ('wingL' if p.x>0 else 'wingR')+('tip' if abs(p.x)>7.5 else '')
    return 'nose' if p.z>3.6 else 'core'

# Retain the original glazing, crew, guns, nine-cylinder engines and source propellers.
for o in imported:
    if not o.parent:parent_keep(o,frame)
# Move starboard aperture and its glazing locally; feather the surrounding skin.
for o in imported:
    if o.type=='MESH' and o.name in ['source_fuselage','source_verriere','interior']:
        for v in o.data.vertices:
            if v.co.x<-.65 and -9.5<v.co.z<-5.2:
                w=min(1,max(0,(v.co.z+9.5)/1.2),max(0,(-5.2-v.co.z)/1.2));v.co.z+=.9*w
for name in ['gun_waist_right','eye_waist_right','window_waist_right']:
    o=bpy.data.objects.get(name)
    if o:o.location.z+=.9

engines={}
for i,(x,z,y) in enumerate([(6.525,3.045,-.0723),(3.031,3.61,-.4733),(-3.031,3.61,-.4733),(-6.525,3.045,-.0723)],1):
    engines[i]=empty('engine'+str(i),parent=parts['wingL' if x>0 else 'wingR'])
    parent_keep(bpy.data.objects['prop_'+str(i)],engines[i])
for o in list(imported):
    if o.type!='MESH':continue
    name=o.name
    if name.startswith('source_'):
        key=name[7:]
        if key in ['axeG','axeG2','axeG3','roueG','axeD','axeD2','axeD3','roueD','axeA','roueA']:
            label='tail' if key.endswith('A') else ('L' if 'G' in key else 'R');gn='gear_'+label
            if gn not in nodes:
                g=empty(gn,(0,-.45,-13.7) if label=='tail' else ((3.031 if label=='L' else -3.031),-.55,0),parts['tail' if label=='tail' else 'wing'+label]);g['heroGearSign']=1 if label=='tail' else -1;g.rotation_euler.x=g['heroGearSign']*pi/2
            parent_keep(o,nodes[gn]);meshes.append(o)
        elif key in ['voletG','voletD']:
            label='L' if key.endswith('G') else 'R';g=empty('flap_'+label,(1.4 if label=='L' else -1.4,-.2,-2.7),parts['wing'+label]);parent_keep(o,g);meshes.append(o)
        elif key=='verriere':
            parent_keep(o,frame);meshes.append(o)
        elif key in ['moteurGE','moteurGI','moteurDI','moteurDE','ailetteGE','ailetteGI','ailetteDI','ailetteDE']:
            idx=['GE','GI','DI','DE'].index(key[-2:])+1;parent_keep(o,engines[idx]);meshes.append(o)
        else:
            o.data.update()
            for key,cp in split(o,classify):parent_keep(cp,parts[key]);meshes.append(cp)
    else:meshes.append(o)

# Material atlas: retain Brett Harrison's markings/UV layout; remove the flat paint response.
skin=bpy.data.materials.get('GD-L');skin.name='hero_skin'
original=next(n.image for n in skin.node_tree.nodes if n.type=='TEX_IMAGE')
original.scale(2048,2048);S=2048
px=np.empty(S*S*4,np.float32);original.pixels.foreach_get(px);atlas=px.reshape(S,S,4)[:,:,:3].copy()
y,x=np.mgrid[:S,:S].astype(np.float32);u=x/S;v=y/S;rng=np.random.default_rng(1944);noise=rng.random((S,S)).astype(np.float32)
olive=(atlas[:,:,0]>.035)&(atlas[:,:,1]>.035)&(atlas[:,:,2]<atlas[:,:,1]*.84)
# Original image values are sRGB. Keep markings, neutral grey and existing localized stains.
base=atlas.copy();lum=np.mean(atlas,axis=2);fade=.045*np.sin(u*41)*np.sin(v*37)+.018*(noise-.5)
for c,k in enumerate([.43,.435,.315]):base[:,:,c]=np.where(olive,k*(.65+.65*np.clip(lum/.25,0,1.2))+fade,atlas[:,:,c])
# Sparse panel boundaries in original UV charts. Metre-scale texture islands, not a checker overlay.
seam=np.zeros((S,S),np.float32);rivets=np.zeros_like(seam)
# Fuselage longitudinal charts, wings and stabilisers use different spacing/layout.
for x0,x1,y0,y1,nx,ny in [(0.02,.98,.65,.87,26,4),(.01,.88,.46,.64,28,7),(.01,.88,.28,.45,28,7),(.01,.87,.14,.27,22,5)]:
    region=(u>x0)&(u<x1)&(v>y0)&(v<y1)
    a=(u-x0)/(x1-x0)*nx;b=(v-y0)/(y1-y0)*ny
    da=np.minimum(a%1,1-a%1);db=np.minimum(b%1,1-b%1)
    seam=np.maximum(seam,region*np.maximum(np.exp(-(da/.022)**2),np.exp(-(db/.018)**2)))
    ra=np.minimum((a+.065)%1,1-(a+.065)%1);rb=np.minimum((b*9)%1,1-(b*9)%1)
    rivets=np.maximum(rivets,region*np.exp(-(ra/.045)**2-(rb/.17)**2))
# Larger slotted access-panel fasteners share the skin relief bake.
au=(u*26+.12)%1;av=(v*24+.12)%1
fasteners=np.exp(-(np.minimum(au,1-au)/.045)**2-(np.minimum(av,1-av)/.045)**2)*seam
slots=fasteners*np.exp(-(np.minimum(au,1-au)/.012)**2)
height=-.00035*seam+.00055*rivets+.0008*fasteners-.0005*slots
leading=((u<.43)&(abs(v-(.571+.17*u))<.003))|((u>.46)&(u<.88)&(abs(v-(.64-.17*(u-.46)))<.003))
chip=(noise>.82)&((seam>.65)|leading)&olive
base*=1-.08*seam[:,:,None];base[chip]=(.57,.59,.56)
walkway=(((u>.397)&(u<.416))|((u>.478)&(u<.497)))&(v>.475)&(v<.613)
scuff=.075+.035*noise+.025*(np.sin(v*910+u*230)**8)
for c in range(3):base[:,:,c]=np.where(walkway,scuff,base[:,:,c])
orm=np.stack((1-.16*seam,np.clip(.76+.07*(noise-.5)-chip*.35,0,1),np.where(chip,.78,.07)),axis=-1)
silver=base.copy();painted=(olive|((np.max(atlas,axis=2)-np.min(atlas,axis=2)<.08)&(lum>.25)))&~walkway
for c,k in enumerate([.60,.625,.65]):silver[:,:,c]=np.where(painted,k*(.80+.20*np.clip(lum/.3,0,1))+.012*np.sin(u*700),base[:,:,c])
silverorm=orm.copy();silverorm[:,:,1]=np.where(painted,.36+.045*np.sin(u*111),orm[:,:,1]);silverorm[:,:,2]=np.where(painted,.88,orm[:,:,2])

def image(name,data):
    im=bpy.data.images.new(name,width=S,height=S,alpha=True);im.colorspace_settings.name='Non-Color';arr=np.ones((S,S,4),np.float32);arr[:,:,:3]=data if data.ndim==3 else data[:,:,None];im.pixels.foreach_set(arr.ravel());im.filepath_raw=str(OUT/(name+'.png'));im.file_format='PNG';im.save();return im
maps={n:image(n,d) for n,d in [('base',base),('orm',orm),('silver',silver),('silver-orm',silverorm),('height',height/.002+.5)]}
# Build real high-poly relief on the source skin and bake tangent normals/AO to its UVs.
skin_objects=[o for o in meshes if skin in list(o.data.materials)]
bpy.ops.object.select_all(action='DESELECT');copies=[]
for o in skin_objects:
    cp=o.copy();cp.data=o.data.copy();bpy.context.collection.objects.link(cp);cp.parent=None;cp.matrix_world=o.matrix_world.copy();copies.append(cp);cp.select_set(True)
bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();low=bpy.context.object;low.name='BAKE_TARGET'
# Preserve only skin faces for baking; tires, engines and glazing retain their source materials.
bm=bmesh.new();bm.from_mesh(low.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if low.data.materials[f.material_index]!=skin],context='FACES');bm.to_mesh(low.data);bm.free()
hi=low.copy();hi.data=low.data.copy();bpy.context.collection.objects.link(hi);hi.name='HIGH_AIRCRAFT_PANELS_RIVETS';bpy.context.view_layer.objects.active=hi
sub=hi.modifiers.new('high_poly_relief','SUBSURF');sub.subdivision_type='SIMPLE';sub.levels=3;bpy.ops.object.modifier_apply(modifier=sub.name)
tex=bpy.data.textures.new('panel_height',type='IMAGE');tex.image=maps['height'];disp=hi.modifiers.new('fasteners_and_seams','DISPLACE');disp.texture=tex;disp.texture_coords='UV';disp.uv_layer=hi.data.uv_layers[0].name;disp.strength=.002;disp.mid_level=.5;bpy.ops.object.modifier_apply(modifier=disp.name)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8;bake=scene.render.bake;bake.use_selected_to_active=True;bake.cage_extrusion=.012;bake.max_ray_distance=.03;bake.margin=8
bm=material('bake_target',(1,1,1));low.data.materials.clear();low.data.materials.append(bm);tn=bm.node_tree.nodes.new('ShaderNodeTexImage');bm.node_tree.nodes.active=tn
for o in meshes:o.hide_render=True
for kind,name in [('NORMAL','normal'),('AO','ao')]:
    im=image(name,np.zeros((S,S,3),np.float32));tn.image=im;bpy.ops.object.select_all(action='DESELECT');hi.select_set(True);low.select_set(True);bpy.context.view_layer.objects.active=low;bpy.ops.object.bake(type=kind);im.save();maps[name]=im
for o in meshes:o.hide_render=False
px=np.empty(S*S*4,np.float32);maps['ao'].pixels.foreach_get(px);orm[:,:,0]=np.clip(px.reshape(S,S,4)[:,:,0],.25,1);maps['orm']=image('orm_final',orm);maps['orm'].filepath_raw=str(OUT/'orm.png');maps['orm'].save();silverorm[:,:,0]=orm[:,:,0];maps['silver-orm']=image('silver-orm-final',silverorm);maps['silver-orm'].filepath_raw=str(OUT/'silver-orm.png');maps['silver-orm'].save()
dy,dx=np.gradient(height);image('curvature',np.clip(.5+300*(np.gradient(dx,axis=1)+np.gradient(dy,axis=0)),0,1))
relief_vertices=len(hi.data.vertices);bpy.data.objects.remove(low,do_unlink=True);hi.hide_render=True;hi.hide_set(True);bake.use_selected_to_active=False
# Startup maps have exactly the same slots as streamed detail (no shader define changes).
nt=skin.node_tree;p=nt.nodes.get('Principled BSDF')
for node in list(nt.nodes):
    if node.type not in ['BSDF_PRINCIPLED','OUTPUT_MATERIAL']:nt.nodes.remove(node)
p.inputs['Metallic'].default_value=1;p.inputs['Roughness'].default_value=1
for key in ['base','normal','orm']:
    im=maps[key].copy();im.name='boot_'+key;im.pack();t=nt.nodes.new('ShaderNodeTexImage');t.image=im
    if key=='base':im.colorspace_settings.name='sRGB';nt.links.new(t.outputs['Color'],p.inputs['Base Color'])
    elif key=='normal':nn=nt.nodes.new('ShaderNodeNormalMap');nn.inputs['Strength'].default_value=.38;nt.links.new(t.outputs['Color'],nn.inputs['Color']);nt.links.new(nn.outputs['Normal'],p.inputs['Normal'])
    else:sep=nt.nodes.new('ShaderNodeSeparateColor');nt.links.new(t.outputs['Color'],sep.inputs[0]);nt.links.new(sep.outputs['Green'],p.inputs['Roughness']);nt.links.new(sep.outputs['Blue'],p.inputs['Metallic'])
# Glass stays readable over clouds, with authored transmission and an opaque frame.
glass=material('hero_glass',(.28,.38,.43),.12);p=glass.node_tree.nodes.get('Principled BSDF');p.inputs['Transmission Weight'].default_value=.55;p.inputs['IOR'].default_value=1.46;p.inputs['Alpha'].default_value=.32;glass.surface_render_method='DITHERED'
for o in meshes:
    for i,m in enumerate(o.data.materials):
        if 'glass' in m.name:
            o.data.materials[i]=glass
            for vtx in o.data.vertices:vtx.co+=vtx.normal*.004
        elif m!=skin and not m.name.startswith('hero_'):m.name='hero_'+m.name
fittings=material('hero_fittings',(.18,.19,.115),.72,.15)
metal=material('hero_aluminium',(.37,.40,.43),.34,.85);dark=material('hero_exhaust',(.065,.049,.035),.77,.55);boot=material('hero_deicer',(.018,.020,.018),.86);grey=material('hero_neutral_grey',(.26,.28,.29),.76,.08)
# Airfoil-conforming de-icer strips: use the actual FlightGear wing vertices.
for o in list(meshes):
    if o.name.startswith(('source_ailes_','source_ailes2_')):
        vs=[];fs=[]
        for poly in o.data.polygons:
            pts=[o.data.vertices[i].co for i in poly.vertices];mid=sum(pts,Vector())/len(pts)
            # Leading edge is the maximum forward extent at each span station.
            lead=max((v.co.z for v in o.data.vertices if abs(v.co.x-mid.x)<.65),default=mid.z)
            if poly.normal.z>.60 and abs(mid.x)>1.4:
                fs.append(tuple(range(len(vs),len(vs)+len(pts))));vs.extend(tuple(p+poly.normal*.004) for p in pts)
        if fs:mesh('deicer_boot',vs,fs,boot,o.parent)
# Individual cowl flaps, hollow exhaust stacks and turbo wastegate housings.
for i,eng in engines.items():
    prop=bpy.data.objects['prop_'+str(i)];x,y,z=prop.location
    for j in range(20):
        a=2*pi*j/20;b=2*pi*(j+.88)/20;rr=.74
        mesh('cowl_flap',[(x+rr*math.cos(t),y+rr*math.sin(t),z-.48-d) for d in [0,.20] for t in [a,b]],[(0,1,3,2)],fittings,eng)
    for side in [-1,1]:
        a=(x+side*.5,y-.60,z-1.35);b=(x+side*.57,y-.66,z-1.84)
        tube('exhaust_stack',a,b,.085,dark,eng);ellipsoid('turbo_housing',(x+side*.48,y-.68,z-1.9),(.19,.11,.28),dark,eng)
        tube('wastegate',b,(b[0],b[1]-.07,b[2]-.11),.055,metal,eng)
# Late-G Cheyenne sight enclosure over the retained tapered tail, with twin gun mount.
ellipsoid('cheyenne_glazing',(0,.45,-14.9),(.40,.55,.60),glass,frame)
for side in [-1,1]:
    tube('cheyenne_frame',(side*.35,.15,-14.4),(side*.28,.85,-14.95),.025,metal,parts['tail']);tube('cheyenne_frame',(side*.28,.85,-14.95),(side*.20,.12,-15.5),.025,metal,parts['tail'])
# Pitot and wire antenna: small enough to disappear naturally at formation range.
for side in [-1,1]:tube('pitot',(.85*side,-.6,4.45),(.85*side,-.65,5.05),.025,metal,parts['nose'])
tube('antenna_wire',(0,1.9,.6),(0,4.7,-13.9),.009,dark,parts['core'],6)
# Separate bay-door skins from the source belly, retaining the exact curvature.
for o in list(meshes):
    if not o.name.startswith('source_fuselage_core'):continue
    def doorpart(p):return ('L' if p.x>0 else 'R') if -3.4<p.z<-.2 and p.y<-.90 else 'body'
    meshes.remove(o)
    for key,cp in split(o,doorpart):
        if key=='body':parent_keep(cp,parts['core'])
        else:parent_keep(cp,empty('bomb_bay_'+key,(.78 if key=='L' else -.78,-.9,-1.8),parts['core']))
        meshes.append(cp)
for label in ['L','R']:
    if 'bomb_bay_'+label not in nodes:empty('bomb_bay_'+label,parent=parts['core'])
invasion=empty('invasion_markings',parent=frame)
white=material('hero_marking_white',(.75,.74,.68),.82);black=material('hero_marking_black',(.018,.019,.016),.86)
def clip_axis(poly,bound,greater):
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        ina=(a.x>=bound) if greater else (a.x<=bound);inb=(b.x>=bound) if greater else (b.x<=bound)
        if ina:out.append(a)
        if ina!=inb:out.append(a+(b-a)*((bound-a.x)/(b.x-a.x)))
    return out
for ob in list(meshes):
    if not ob.name.startswith(('source_ailes_','source_ailes2_')):continue
    ob.data.calc_loop_triangles()
    for band in range(5):
        vs=[];fs=[]
        for tri in ob.data.loop_triangles:
            if tri.normal.y<.3:continue
            poly=[ob.data.vertices[j].co.copy() for j in tri.vertices]
            side=1 if sum(p.x for p in poly)>0 else -1
            a,b=sorted([side*(4.3+band*.48),side*(4.3+(band+1)*.48)])
            poly=clip_axis(clip_axis(poly,a,True),b,False)
            if len(poly)>=3:fs.append(tuple(range(len(vs),len(vs)+len(poly))));vs.extend(tuple(p+tri.normal*.006) for p in poly)
        if fs:mesh('invasion_band',vs,fs,white if band%2==0 else black,invasion)
# Merge only siblings/materials; keep named part and mechanical ownership intact.
groups={}
for o in meshes:
    # Multi-material source meshes split by material before LOD processing.
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    if len(o.data.materials)>1:
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT');obs=list(bpy.context.selected_objects)
    else:obs=[o]
    for ob in obs:groups.setdefault((ob.parent,ob.data.materials[0]),[]).append(ob)
merged=[]
for (parent,mat),objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=parent.name+'_'+mat.name;merged.append(o)
stats=[]
for o in merged:
    # Imported transforms are baked into a child, never into the mechanical parent.
    parent=o.parent;bpy.context.view_layer.update();mw=o.matrix_world.copy();pivot=empty(o.name+'_lod',parent=parent);bpy.context.view_layer.update();o.parent=pivot;o.matrix_world=mw
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o.name=pivot.name+'_LOD0'
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000001);bm.to_mesh(o.data);bm.free()
    if not o.data.uv_layers:o.data.uv_layers.new(name='UVMap')
    for level,ratio in [(1,.36),(2,.10)]:
        source=o.data.materials[0]
        if any(tag in source.name for tag in ['interior','panel','seat','pilot']):
            empty(pivot.name+'_LOD'+str(level),parent=pivot);continue
        # Keep the already economical exterior. QEM on a layered aircraft shell
        # lets the cabin/de-icer surfaces pierce it, even with correct overall bounds.
        preserve=(source==skin and parent.name.startswith(('part_','engine','flap_','bomb_bay'))) or source==boot or parent==invasion
        if preserve:ratio=1
        lo=o.copy();lo.data=o.data.copy();bpy.context.collection.objects.link(lo);lo.parent=pivot;lo.name=pivot.name+'_LOD'+str(level);bpy.context.view_layer.objects.active=lo
        if ratio<1:
            dec=lo.modifiers.new('lod','DECIMATE');dec.ratio=ratio;dec.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=dec.name)
        # Bound QEM extrapolation without snapping across opposite skin surfaces.
        lower=[min(v.co[i] for v in o.data.vertices) for i in range(3)];upper=[max(v.co[i] for v in o.data.vertices) for i in range(3)]
        for v in lo.data.vertices:
            for i in range(3):v.co[i]=min(upper[i],max(lower[i],v.co[i]))
        if level==2:
            source=lo.data.materials[0];simple=bpy.data.materials.get(source.name+'_low')
            if not simple:simple=material(source.name+'_low',(.13,.14,.075) if source==skin else ((.055,.05,.045) if source.name=='hero_engine' else ((.04,.045,.05) if source.name=='hero_guns' else tuple(source.diffuse_color[:3]))),.75,.08)
            lo.data.materials[0]=simple
        lo.data.calc_loop_triangles();stats.append((level,len(lo.data.loop_triangles)))
    o.data.calc_loop_triangles();stats.append((0,len(o.data.loop_triangles)))
# Export game local axes unchanged; high-poly bake source remains only in .blend.
for o in root.children_recursive:
    if o.type=='MESH':o.data.transform(C)
    o.matrix_basis=C@o.matrix_basis@C.inverted()
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in root.children_recursive:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'b17.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'b17-source.blend'))
(OUT/'build.json').write_text(json.dumps({'source':root['source'],'trianglesByLod':{str(i):sum(n for l,n in stats if l==i) for i in range(3)},'reliefVertices':relief_vertices,'textureSize':S},indent=2))
print('HERO BUILD COMPLETE',flush=True)
