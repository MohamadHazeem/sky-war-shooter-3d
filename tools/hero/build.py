"""Original B-17G source. Blender 5.x; no downloaded mesh or image inputs.
Working coordinates are game coordinates; the exporter conversion is applied once.
The shared metal relief coupon is a high-poly panel/rivet surface, baked to tangent
normal, AO and curvature maps. Aircraft skin UVs use consistent metre-scale repeats.
"""
import bpy, bmesh, math, os, json, sys
import numpy as np
from mathutils import Vector, Matrix
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'tools/hero/output'; OUT.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
pi=math.pi

def material(name,color,rough=.6,metal=.0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return m
skin=material('hero_skin',(.19,.205,.12),.68,.12)
grey=material('hero_neutral_grey',(.29,.31,.32),.72,.08)
dark=material('hero_gun',(.045,.05,.055),.38,.7)
rubber=material('hero_tire',(.018,.02,.023),.94)
metal=material('hero_aluminium',(.52,.56,.58),.3,.85)
glass=material('hero_glass',(.72,.86,.92),.055)
p=glass.node_tree.nodes.get('Principled BSDF');p.inputs['Transmission Weight'].default_value=.92;p.inputs['IOR'].default_value=1.46
white=material('hero_marking_cream',(.86,.84,.74),.72)
navy=material('hero_marking_navy',(.012,.025,.055),.8)
yellow=material('hero_prop_tip',(.8,.54,.06),.7)

# High-poly relief coupon: recessed seams, domed rivets, slotted access fasteners.
# Sampled at 1024²; normal and curvature are derivatives of this SAME source surface.
S=1024
y,x=np.mgrid[0:S,0:S].astype(np.float32);u=x/S;v=y/S
edge=lambda a,n: np.minimum((a*n)%1,1-(a*n)%1)
seam=np.maximum(np.exp(-(edge(u,4)/.009)**2),np.exp(-(edge(v,3)/.009)**2))
rivet=np.exp(-((edge(u+.004,4)/.014)**2+(edge(v,48)/.22)**2))
rivet+=np.exp(-((edge(v+.005,3)/.016)**2+(edge(u,48)/.22)**2))
screws=np.exp(-((edge(u+.03,4)/.026)**2+(edge(v+.03,3)/.026)**2))
slots=screws*np.exp(-(edge(u+.03,4)/.006)**2)
height=-.0007*seam+.0009*rivet+.0011*screws-.0008*slots
# Retain the high-poly pass as an inspectable Blender mesh, separate from flight assets.
n=512;vs=[(float(a/S*2),float(b/S*2),float(height[b,a])) for b in range(0,S,2) for a in range(0,S,2)]
fs=[(j*n+i,j*n+i+1,(j+1)*n+i+1,(j+1)*n+i) for j in range(n-1) for i in range(n-1)]
me=bpy.data.meshes.new('high_panel_rivets');me.from_pydata(vs,[],fs);me.update()
hi=bpy.data.objects.new('HIGH_PANEL_RIVETS_FASTENERS',me);bpy.context.collection.objects.link(hi)
hi.hide_render=True;hi.hide_viewport=True
np.random.seed(1944)
dy,dx=np.gradient(height,2/S,2/S);normal=np.stack((-dx,-dy,np.ones_like(dx)),axis=-1);normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
curv=np.gradient(dx,axis=1)+np.gradient(dy,axis=0)
ao=np.clip(1-seam*.32-rivet*.08,0,1)
noise=np.random.random((S,S)).astype(np.float32)
fade=.94+.045*np.sin(u*41)*np.cos(v*29)+noise*.035
chip=((noise>.84)&(seam>.45)) | ((noise>.985)&(edge(u,.999)<.05))
base=np.stack([fade*.34,fade*.355,fade*.23],axis=-1)
base[chip]=(.54,.56,.53)
# Thin, directional oil streaks in the service-panel texture; localized exhaust is geometry below.
oil=(np.exp(-(edge(u,7)/.035)**2))*(np.sin(v*pi)**4)*.22
base*=1-oil[:,:,None]
orm=np.stack((ao,np.clip(.78+oil*.4-chip*.4,0,1),np.where(chip,.78,.07)),axis=-1)

def image(name,data):
    im=bpy.data.images.new(name,width=S,height=S,alpha=True);im.colorspace_settings.name='Non-Color'
    arr=np.ones((S,S,4),np.float32);arr[:,:,:3]=data if data.ndim==3 else data[:,:,None]
    im.pixels.foreach_set(arr.ravel());im.filepath_raw=str(OUT/(name+'.png'));im.file_format='PNG';im.save();return im
maps={ 'base':image('base',base), 'normal':image('normal',normal*.5+.5), 'orm':image('orm',orm), 'curvature':image('curvature',np.clip(curv*3+.5,0,1)) }
# Cycles selected-to-active bake of the actual 262k-vertex relief source.
bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=8
bpy.ops.mesh.primitive_plane_add(size=2,location=(1,1,0));coupon=bpy.context.object;coupon.name='BAKE_TARGET'
bake_mat=material('bake_target',(1,1,1));coupon.data.materials.append(bake_mat)
tex=bake_mat.node_tree.nodes.new('ShaderNodeTexImage');bake_mat.node_tree.nodes.active=tex
hi.hide_viewport=False;hi.hide_render=False
bake=bpy.context.scene.render.bake;bake.use_selected_to_active=True;bake.cage_extrusion=.008;bake.max_ray_distance=.02;bake.margin=2
for kind,key in [('NORMAL','normal'),('AO','ao')]:
    target=bpy.data.images.new('baked_'+key,width=S,height=S,alpha=True);target.colorspace_settings.name='Non-Color';tex.image=target
    bpy.ops.object.select_all(action='DESELECT');hi.select_set(True);coupon.select_set(True);bpy.context.view_layer.objects.active=coupon
    bpy.ops.object.bake(type=kind)
    target.filepath_raw=str(OUT/(key+'.png'));target.file_format='PNG';target.save()
    if key=='normal':maps['normal']=target
    else:
        px=np.empty(S*S*4,np.float32);target.pixels.foreach_get(px);orm[:,:,0]=px.reshape(S,S,4)[:,:,0];maps['orm']=image('orm_baked',orm);maps['orm'].filepath_raw=str(OUT/'orm.png');maps['orm'].save()
bpy.data.objects.remove(coupon,do_unlink=True);hi.hide_render=True;hi.hide_viewport=True
bpy.context.scene.render.bake.use_selected_to_active=False

# Compact startup images retain identical shader features while KTX2 detail loads later.
for mat in [skin,grey]:
    nt=mat.node_tree;p=nt.nodes.get('Principled BSDF')
    for key in ['base','normal','orm']:
        im=maps[key].copy();im.name='boot_'+key;im.scale(128,128);im.pack()
        t=nt.nodes.new('ShaderNodeTexImage');t.image=im
        if key=='base':
            im.colorspace_settings.name='sRGB'
            if mat==skin:nt.links.new(t.outputs['Color'],p.inputs['Base Color'])
        elif key=='normal':
            nn=nt.nodes.new('ShaderNodeNormalMap');nn.inputs['Strength'].default_value=.55;nt.links.new(t.outputs['Color'],nn.inputs['Color']);nt.links.new(nn.outputs['Normal'],p.inputs['Normal'])
        else:
            sep=nt.nodes.new('ShaderNodeSeparateColor');nt.links.new(t.outputs['Color'],sep.inputs[0]);nt.links.new(sep.outputs['Green'],p.inputs['Roughness']);nt.links.new(sep.outputs['Blue'],p.inputs['Metallic'])

nodes={}; meshes=[]
def empty(name,pos=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=pos
    if parent:o.parent=parent
    nodes[name]=o;return o
root=empty('B17G_HERO');root['hero']=True
frame=empty('airframe',parent=root)
def mesh(name,verts,faces,mat,parent=frame,uv=None):
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update()
    o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);o.parent=parent;m.materials.append(mat)
    layer=m.uv_layers.new(name='UVMap')
    axes=sorted(range(3),key=lambda axis: max(v.co[axis] for v in m.vertices)-min(v.co[axis] for v in m.vertices),reverse=True)[:2]
    for poly in m.polygons:
        poly.use_smooth=True
        for li in poly.loop_indices:
            idx=m.loops[li].vertex_index;co=m.vertices[idx].co
            layer.data[li].uv=uv[idx] if uv else (co[axes[0]]/3,co[axes[1]]/3)
    meshes.append(o);return o

def ellipsoid(name,pos,scale,mat,parent=frame,seg=32,rings=16):
    vs=[];uv=[];fs=[]
    for j in range(rings+1):
        a=pi*j/rings
        for i in range(seg+1):
            b=2*pi*i/seg;vs.append((pos[0]+scale[0]*math.sin(a)*math.cos(b),pos[1]+scale[1]*math.cos(a),pos[2]+scale[2]*math.sin(a)*math.sin(b)));uv.append((i/seg,j/rings))
    for j in range(rings):
        for i in range(seg):
            k=j*(seg+1)+i;fs.append((k,k+1,k+seg+2,k+seg+1))
    return mesh(name,vs,fs,mat,parent,uv)

def box(name,pos,size,mat,parent=frame):
    x,y,z=pos;a,b,c=[s/2 for s in size]
    return mesh(name,[(x+i*a,y+j*b,z+k*c) for i,j,k in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],mat,parent)

def tube(name,a,b,r,mat,parent=frame,seg=12):
    a=Vector(a);b=Vector(b);axis=(b-a).normalized();ref=Vector((0,1,0)) if abs(axis.y)<.9 else Vector((1,0,0));side=axis.cross(ref).normalized();up=axis.cross(side)
    vs=[]
    for p in [a,b]:
        for i in range(seg):vs.append(tuple(p+r*(side*math.cos(i*2*pi/seg)+up*math.sin(i*2*pi/seg))))
    return mesh(name,vs,[tuple(range(seg-1,-1,-1)),tuple(range(seg,seg*2))]+[(i,(i+1)%seg,(i+1)%seg+seg,i+seg) for i in range(seg)],mat,parent)

# Continuous ring loft with deliberate apertures (no painted-on windows).
sections=[(-15.7,.22,.32,.23),(-14.6,.40,.56,.30),(-12,.57,.80,.22),(-9,.86,1.03,.12),(-7.9,1.01,1.15,.08),(-7,1.08,1.18,.06),(-6.1,1.13,1.22,.05),(-5.2,1.2,1.25,.04),(-3.65,1.26,1.29,.01),(-3,1.28,1.31,0),(-1,1.30,1.33,0),(.05,1.28,1.32,0),(1,1.26,1.3,0),(2.5,1.20,1.25,0),(3.6,1.12,1.13,-.05),(4.5,1.03,1.02,-.12),(5.3,.88,.9,-.15)]
vs=[];uv=[];fs=[];bottom=[];seg=64
for z,rx,ry,cy in sections:
    for i in range(seg+1):
        a=i/seg*2*pi;vs.append((rx*math.cos(a),cy+ry*math.sin(a),z));uv.append((a*1.25/3,(z+16)/3))
for j in range(len(sections)-1):
    z=(sections[j][0]+sections[j+1][0])/2
    for i in range(seg):
        a=(i+.5)/seg*2*pi
        # Port waist at -7.44; starboard staggered forward by 0.9 m.
        aperture=(-7.9<z<-7 and (a<.65 or a>2*pi-.16)) or (-7<z<-6.1 and abs(a-pi)<.45)
        cockpit=1.0<z<3.6 and .12<a<pi-.12
        cheek=3.6<z<4.5 and (a<.7 or abs(a-pi)<.7)
        bay=-3.65<z<.05 and math.sin(a)<-.73
        if aperture or cockpit or cheek or bay:continue
        k=j*(seg+1)+i;f=(k,k+1,k+seg+2,k+seg+1)
        (bottom if math.sin(a)<-.4 else fs).append(f)
mesh('fuselage',vs,fs,skin,uv=uv);mesh('fuselage_underside',vs,bottom,grey,uv=uv)
# Nose glazing and internal Norden sight, cheek glazing.
ellipsoid('glass_nose',(0,-.15,5.25),(.88,.9,1.5),glass,seg=48,rings=24)
box('bombardier_floor',(0,-.75,4.9),(1.3,.06,2.3),dark)
box('norden_base',(0,-.44,5.65),(.26,.22,.35),dark)
ellipsoid('norden_optics',(0,-.25,5.65),(.12,.12,.16),metal,seg=16,rings=8)
# Framed greenhouse with a raised roof and sloping windscreen.
for side in [-1,1]:
    pts=[(side*1.21,.25,1.1),(side*1.12,1.05,1.1),(side*.8,1.68,2.2),(side*.70,1.55,3.15),(side*1.10,.25,3.6)]
    mesh('cockpit_glass',pts,[(0,1,2,3,4)],glass)
    for i in range(len(pts)):tube('cockpit_frame',pts[i],pts[(i+1)%len(pts)],.045,skin)
    tube('windscreen_mullion',(side*.70,1.55,3.15),(side*1.10,.25,3.6),.042,skin)
    cheek=[(side*1.03,-.1,3.65),(side*.99,.65,3.65),(side*.91,.62,4.45),(side*1.03,-.1,4.45)]
    mesh('glass_cheek',cheek,[(0,1,2,3)],glass)
    for i in range(4):tube('cheek_frame',cheek[i],cheek[(i+1)%4],.03,skin)
mesh('windscreen',[(-.70,1.55,3.15),(.70,1.55,3.15),(1.10,.25,3.6),(-1.10,.25,3.6)],[(0,1,2,3)],glass)
tube('windscreen_center',(0,1.55,3.15),(0,.25,3.6),.035,skin)
mesh('cockpit_roof',[(-1.12,1.05,1.1),(1.12,1.05,1.1),(.8,1.68,2.2),(.70,1.55,3.15),(-.70,1.55,3.15),(-.8,1.68,2.2)],[(0,1,2,3,4,5)],skin)

# NACA-like thick wing sections with correct taper, rounded tips and dihedral.
def wing(name,side,stations,parent=frame):
    vs=[];uv=[];faces=[];low=[];N=32
    for span,lead,chord,y in stations:
        for i in range(N):
            a=2*pi*i/N;t=(1-math.cos(a))*.5
            thickness=5*.15*(.2969*math.sqrt(t)-.126*t-.3516*t*t+.2843*t**3-.1036*t**4)*chord
            vs.append((side*span,y+math.copysign(thickness,math.sin(a)),lead-t*chord));uv.append((span/3,t*chord/3))
    for j in range(len(stations)-1):
        for i in range(N):
            k=j*N+i;f=(k,j*N+(i+1)%N,(j+1)*N+(i+1)%N,k+N)
            if side<0:f=tuple(reversed(f))
            (faces if i<N/2 else low).append(f)
    mesh(name,vs,faces,skin,parent,uv);mesh(name+'_lower',vs,low,grey,parent,uv)
for side,label in [(1,'L'),(-1,'R')]:
    group=empty('wing'+label,parent=frame)
    wing('wing'+label+'_skin',side,[(.9,2.0,5.4,-.3),(3,1.8,5.2,-.25),(6.5,1.15,4.6,.05),(10.5,-.0,3.4,.45),(14,-1.25,2.3,.8),(15.5,-1.85,1.25,.98),(15.81,-2.4,.12,1.02)],group)
    flap=empty('flap_'+label,(side*3.8,-.25,-2.55),group)
    box('flap_skin',(0,0,-.45),(4.2,.09,.9),skin,flap)
    wing('stabilizer'+label,side,[(.25,-11.35,3.5,.6),(2.4,-11.9,2.8,.7),(5.9,-13.2,1.2,.9),(6.35,-13.65,.1,.92)],empty('tail'+label,parent=frame))
# Tall swept fin/dorsal fillet, rounded leading edge (elliptical section extrusion).
outline=[(-8.4,.85),(-10.5,1.35),(-12.1,3.85),(-13.05,4.85),(-13.65,5.0),(-14.4,4.8),(-14.7,1.0),(-15.4,.45)]
vs=[(side*.12,y,z) for side in [-1,1] for z,y in outline];n=len(outline)
tail=empty('tail',parent=frame)
mesh('fin_skin',vs,[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],skin,tail)
ellipsoid('cheyenne_fairing',(0,.25,-14.95),(.53,.56,1.1),skin,tail)
ellipsoid('glass_cheyenne',(0,.65,-15.0),(.43,.49,.67),glass,tail)

for i,(x,y,z) in enumerate([(6.5,-.15,2),(3.02,-.5,2.5),(-3.02,-.5,2.5),(-6.5,-.15,2)],1):
    eng=empty('engine'+str(i),(x,y,z),frame)
    ellipsoid('nacelle',(0,0,-.85),(.77,.81,2.25),skin,eng)
    # Open annular cowl with a recessed radial face, rather than a solid cap.
    seg=48;vs=[];fs=[]
    for zz,r in [(1.05,.68),(.92,.86),(.0,.89),(-.25,.77)]:
        for j in range(seg):vs.append((math.cos(j*2*pi/seg)*r,math.sin(j*2*pi/seg)*r,zz))
    for k in range(3):
        for j in range(seg):fs.append(((k+1)*seg+j,(k+1)*seg+(j+1)%seg,k*seg+(j+1)%seg,k*seg+j))
    mesh('cowl',vs,fs,skin,eng)
    tube('radial_back',(0,0,.45),(0,0,.52),.68,dark,eng,32)
    for j in range(9):
        a=j*2*pi/9;tube('radial_cylinder',(math.cos(a)*.22,math.sin(a)*.22,.65),(math.cos(a)*.60,math.sin(a)*.60,.65),.12,dark,eng)
        tube('pushrod',(math.cos(a+.1)*.16,math.sin(a+.1)*.16,.81),(math.cos(a+.1)*.58,math.sin(a+.1)*.58,.81),.024,metal,eng,8)
    prop=empty('prop_'+str(i),(0,0,1.14),eng)
    ellipsoid('prop_hub',(0,0,1.14),(.23,.23,.34),metal,eng,24,12)
    for j in range(3):
        a=j*2*pi/3;blade=ellipsoid('blade',(math.sin(a)*.91,math.cos(a)*.91,0),(.13,.86,.045),dark,prop,16,10)
        # Rotate elongated blade about its centre.
        center=Vector((math.sin(a)*.91,math.cos(a)*.91,0));R=Matrix.Rotation(-a,3,'Z')
        for vert in blade.data.vertices:vert.co=center+R@(vert.co-center)
        tube('yellow_tip',(math.sin(a)*1.61,math.cos(a)*1.61,0),(math.sin(a)*1.73,math.cos(a)*1.73,0),.075,yellow,prop,8)
    tube('exhaust',(.61,-.45,-.4),(.70,-.5,-1.2),.10,dark,eng)
    # Exhaust soot is a tapered surface on the upper trailing nacelle.
    stain=material('hero_exhaust_stain_'+str(i),(.07,.065,.04),.96)
    mesh('exhaust_streak',[(.20,.78,-.1),(.55,.68,-.1),(.39,.55,-2.2),(.32,.58,-2.5)],[(0,1,2,3)],stain,eng)
    if i in [2,3]:
        gear=empty('gear_'+('L' if i==2 else 'R'),(0,-.25,-.9),eng)
        tube('gear_strut',(0,-.1,0),(0,-1.85,0),.075,metal,gear)
        wheel=ellipsoid('wheel',(0,-1.85,0),(.24,.70,.70),rubber,gear,24,12)
        gear.rotation_euler.x=pi/2

# Articulated gun mounts. Exact public node names are an API used by Aircraft.ts.
for name,pos,scale in [('top',(0,1.5,1.15),(.74,.58,.70)),('ball',(0,-1.45,-4.65),(.63,.65,.63)),('chin',(0,-1.3,5.6),(.64,.43,.66))]:
    turret=empty('turret_'+name,pos,frame)
    ellipsoid('turret_'+name+'_shell',(0,0,0),scale,glass if name!='chin' else skin,turret)
    tube('turret_ring',(0,-.12,0),(0,-.20,0),scale[0],dark,turret,32)
    guns=empty('turret_'+name+'_guns',parent=turret)
    for side in [-1,1]:
        tube('gun_barrel',(side*.23,0,.15),(side*.23,0,1.45),.028,dark,guns)
        tube('gun_jacket',(side*.23,0,.15),(side*.23,0,.85),.047,dark,guns)
        empty('muzzle_'+name+('_left' if side>0 else '_right'),(side*.23,0,1.45),guns)
for name,pos,direction in [('waist_left',(.97,.27,-7.44),(1,0,0)),('waist_right',(-1.07,.27,-6.54),(-1,0,0)),('tail',(0,.3,-15.6),(0,0,-1)),('cheek_left',(1.03,.1,4),(1,0,.3)),('cheek_right',(-1.03,.1,4),(-1,0,.3))]:
    gun=empty('gun_'+name,pos,frame);d=Vector(direction).normalized()
    for offset in ([-.16,.16] if name=='tail' else [0]):
        a=Vector((offset,0,0));tube('gun_receiver',a-d*.35,a+d*.3,.07,dark,gun);tube('gun_barrel',a+d*.3,a+d*1.25,.032,dark,gun)
    empty('muzzle_'+name,tuple(d*1.25),gun)
box('bomb_bay_ceiling',(0,.1,-1.8),(1.7,.08,3.7),dark)
for z in [-3.5,-1.8,-.1]:tube('bay_frame',(-.86,-.92,z),(.86,-.92,z),.03,metal)
for side,label in [(1,'L'),(-1,'R')]:
    door=empty('bomb_bay_'+label,(side*.88,-1.05,-1.8),frame)
    box('bay_door',(-side*.44,-.08,0),(.88,.10,3.7),grey,door)
gear=empty('gear_tail',(0,-.35,-13.7),frame);tube('tail_strut',(0,0,0),(0,-.65,0),.06,metal,gear);ellipsoid('tail_wheel',(0,-.65,0),(.1,.26,.26),rubber,gear,16,8);gear.rotation_euler.x=pi/2

# Wing insignia and wear-prone walkways are conformed to the authored airfoil.
def wing_height(x,z):
    stations=[(.9,2,5.4,-.3),(3,1.8,5.2,-.25),(6.5,1.15,4.6,.05),(10.5,0,3.4,.45),(14,-1.25,2.3,.8),(15.5,-1.85,1.25,.98)]
    x=abs(x)
    for a,b in zip(stations,stations[1:]):
        if a[0]<=x<=b[0]:
            k=(x-a[0])/(b[0]-a[0]);lead=a[1]+k*(b[1]-a[1]);chord=a[2]+k*(b[2]-a[2]);y=a[3]+k*(b[3]-a[3]);t=max(0,min(1,(lead-z)/chord))
            return y+5*.15*(.2969*math.sqrt(t)-.126*t-.3516*t*t+.2843*t**3-.1036*t**4)*chord+.014
    return 0
for side in [-1,1]:
    parent=nodes['wing'+('L' if side>0 else 'R')]
    def decal(name,points,mat):
        return mesh(name,[(side*x,wing_height(x,z),z) for x,z in points],[tuple(range(len(points)))],mat,parent)
    cx,cz=10.5,-1.6
    decal('wing_roundel',[(cx+.82*math.cos(i*2*pi/48),cz+.82*math.sin(i*2*pi/48)) for i in range(48)],navy)
    decal('wing_bars',[(cx-1.45,cz-.23),(cx+1.45,cz-.23),(cx+1.45,cz+.23),(cx-1.45,cz+.23)],white)
    pts=[]
    for i in range(10):
        a=pi/2+i*pi/5;r=.77 if i%2==0 else .31;pts.append((cx+r*math.cos(a),cz+r*math.sin(a)))
    o=decal('wing_star',pts,white)
    for vtx in o.data.vertices:vtx.co.y+=.008
    walkway=material('hero_walkway',(.055,.058,.045),.95)
    decal('walkway',[(1.65,1.5),(2.12,1.5),(2.12,-2.6),(1.65,-2.6)],walkway)

# Selectable invasion paint uses its own authored decals, never the old FG texture atlas.
invasion=empty('invasion_markings',parent=frame)
stripe=material('hero_stripe_black',(.015,.015,.012),.9)
for side in [-1,1]:
    for band in range(5):
        x=4.4+band*.52
        pts=[(x,1.35),(x+.51,1.25),(x+.51,-3.35),(x,-3.35)]
        mesh('invasion_band',[(side*a,wing_height(a,z)+.008,z) for a,z in pts],[(0,1,2,3)],white if band%2==0 else stripe,invasion)

# Original vector insignia and fictional serial (no borrowed livery artwork).
def insignia(side):
    parent=empty('insignia_'+str(side),parent=frame);cx=side*1.22;cy=.1;cz=-4.2;r=.64
    vs=[(cx,cy,cz)]+[(cx,cy+r*math.sin(a*2*pi/48),cz+r*math.cos(a*2*pi/48)) for a in range(48)]
    mesh('roundel',vs,[(0,1+i,1+(i+1)%48) for i in range(48)],navy,parent)
    box('bar',(cx+side*.008,cy,cz),(.012,.40,2.4),white,parent)
    vs=[]
    for i in range(10):
        a=pi/2+i*pi/5;rr=r*(.94 if i%2==0 else .38);vs.append((cx+side*.022,cy+rr*math.sin(a),cz+rr*math.cos(a)))
    mesh('star',vs,[tuple(range(10))],white,parent)
for side in [-1,1]:insignia(side)
# A geometric group triangle on both tail faces; serial uses Blender's bundled font.
for side in [-1,1]:
    mesh('group_triangle',[(side*.126,3,-13.1),(side*.126,4.35,-13.8),(side*.126,3,-14.4)],[(0,1,2)],white)
    cu=bpy.data.curves.new('serial','FONT');cu.body='231702';cu.size=.22;cu.extrude=.0005
    o=bpy.data.objects.new('serial',cu);bpy.context.collection.objects.link(o);o.parent=frame;o.location=(side*.14,2.6,-13.15);o.rotation_euler=(pi/2,0,side*pi/2)
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False);o.data.materials.append(yellow);meshes.append(o)

# Merge static pieces by material and immediate parent to keep draw counts bounded.
# Named damage parts and moving pivots remain separate; the LOD tree shares these pivots.
groups={}
for o in meshes:groups.setdefault((o.parent,o.data.materials[0]),[]).append(o)
merged=[]
for (parent,mat),objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=parent.name+'_'+mat.name;merged.append(o)

stats=[]
for o in merged:
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=0.00001)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=0.000001)
    bm.to_mesh(o.data);bm.free();o.data.update()
    parent=o.parent;pivot=empty(o.name+'_lod',parent=parent);o.parent=pivot;o.name=pivot.name+'_LOD0'
    # Apply local transforms before duplicating so bounds/pivots remain identical.
    bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    for level,ratio in [(1,.38),(2,.10)]:
        lo=o.copy();lo.data=o.data.copy();bpy.context.collection.objects.link(lo);lo.parent=pivot;lo.name=pivot.name+'_LOD'+str(level)
        bpy.context.view_layer.objects.active=lo
        dec=lo.modifiers.new('silhouette_preserving','DECIMATE');dec.ratio=ratio;dec.use_collapse_triangulate=True
        if len(lo.data.polygons)>3:bpy.ops.object.modifier_apply(modifier=dec.name)
        else:lo.modifiers.remove(dec)
        if level==2:
            # The Low mesh keeps roughness but uses no transmission or texture maps.
            source=lo.data.materials[0];simple=bpy.data.materials.get(source.name+'_low')
            if not simple:simple=material(source.name+'_low',(.095,.10,.044) if source==skin else tuple(source.diffuse_color[:3]),.72,.08)
            lo.data.materials[0]=simple
        lo['heroLod']=level;lo.data.calc_loop_triangles();stats.append((level,len(lo.data.loop_triangles)))
    o['heroLod']=0;o.data.calc_loop_triangles();stats.append((0,len(o.data.loop_triangles)))

# Convert game (+Y up,+Z nose) to Blender (+Z up,-Y nose); exporter reverses it.
convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
for o in root.children_recursive:
    if o.type == 'MESH':
        for vert in o.data.vertices: vert.co = convert.to_3x3() @ vert.co
    o.matrix_basis = convert @ o.matrix_basis @ convert.inverted()
hi.hide_set(True)
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for o in root.children_recursive:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'b17.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_animations=False)
# Preserve source high-poly coupon and full editable tree for offline inspection.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'b17-source.blend'))
(OUT/'build.json').write_text(json.dumps({'source':'original parametric geometry; see README.md','trianglesByLod':{str(i):sum(n for l,n in stats if l==i) for i in range(3)},'reliefVertices':len(me.vertices),'textureSize':S},indent=2))
print('HERO BUILD COMPLETE',flush=True)
