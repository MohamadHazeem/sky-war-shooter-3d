"""Original seated aircrew, authored in metres (+Y up, +Z forward, origin at eyes).
Continuous tailored sleeves and trousers avoid deforming a standing low-poly mesh.
PBR leather, wool, canvas, rubber and metal remain separate glTF materials.
"""
import bpy, math, sys
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)

def V(p): return Vector((p[0], -p[2], p[1]))
def material(name, color, rough, metal=0):
    m=bpy.data.materials.new('crew'+name); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    # Hex colours are sRGB; glTF factors are scene linear.
    rgb=[int(color[i:i+2],16)/255 for i in (0,2,4)]
    rgb=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb]
    bs.inputs['Base Color'].default_value=(*rgb,1)
    bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    return m
leather=material('Leather','48362b',.82)
cloth=material('Cloth','81714d',.88)
fleece=material('Fleece','c8b89a',.92)
skin=material('Skin','b5856b',.78)
rubber=material('Rubber','272e2a',.72)
webbing=material('Webbing','b2a582',.83)
metal=material('Metal','76776d',.48,.6)
lens=material('Lens','31434b',.3,.1)
stitch=material('Stitch','8c7053',.8)
objects=[]
def finish(o,name,mat):
    o.name=name;o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    objects.append(o);return o

def ell(name,p,r,mat,seg=24,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=V(p))
    o=bpy.context.object;o.scale=(r[0],r[2],r[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat)

def loft(name,points,radii,mat,segments=16,fold=0):
    vs=[];fs=[]
    for i,p in enumerate(points):
        c=Vector(p);d=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        d.normalize();a=Vector((0,1,0) if abs(d.x)>.9 else (1,0,0));a=(a-d*a.dot(d)).normalized();b=d.cross(a).normalized()
        rx,ry=radii[i] if isinstance(radii[i],tuple) else (radii[i],radii[i])
        for j in range(segments):
            t=2*math.pi*j/segments;f=1+fold*math.sin(t*3+i*2.3)
            vs.append(V(c+a*(math.cos(t)*rx*f)+b*(math.sin(t)*ry*f)))
    for i in range(len(points)-1):
        for j in range(segments):
            a=i*segments+j;b=i*segments+(j+1)%segments
            fs.append((a,b,b+segments,a+segments))
    fs.extend([tuple(reversed(range(segments))),tuple((len(points)-1)*segments+j for j in range(segments))])
    me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);return finish(o,name,mat)

def cord(name,pts,r,mat,n=8):return loft(name,pts,[r]*len(pts),mat,n)
# Jacket torso, shaped shoulders/waist and a naturally seated pelvis.
loft('flight_jacket',[(0,y,z)for y,z in [(-.72,-.035),(-.67,-.04),(-.59,-.055),(-.48,-.065),(-.36,-.06),(-.28,-.06),(-.22,-.045)]],[(.16,.105),(.17,.12),(.18,.13),(.205,.135),(.225,.12),(.20,.105),(.115,.075)],leather,28,.012)
ell('trouser_seat',(0,-.75,-.035),(.18,.13,.13),cloth)
ell('neck',(0,-.15,-.015),(.052,.075,.052),skin)
# One continuous head with a narrow jaw and chin; no separate spherical cheeks.
ell('leather_flying_helmet',(0,.005,-.024),(.092,.124,.094),leather,32,16)
loft('anatomical_face',[(0,y,z) for y,z in [(-.125,.025),(-.115,.032),(-.09,.034),(-.055,.032),(-.015,.025),(.025,.016),(.065,.005),(.09,-.008)]],
     [(.027,.026),(.045,.038),(.058,.046),(.068,.052),(.073,.056),(.073,.057),(.065,.052),(.042,.035)],skin,32)
# Slim bridge, mostly covered by the high-altitude oxygen mask.
loft('nose_bridge',[(0,.017,.078),(0,-.005,.086),(0,-.025,.094),(0,-.033,.091)],
     [(.007,.006),(.009,.008),(.011,.009),(.009,.006)],skin,12)
for s in (-1,1):
    ell('earphone',(s*.094,-.025,-.019),(.014,.043,.038),rubber,20,10)
    ell('earphone_cap',(s*.107,-.025,-.019),(.007,.032,.028),leather,20,10)
    # Goggles at the eyes, with cushioned surrounds and reflective blue-grey lenses.
    ell('goggle_cushion',(s*.036,.018,.087),(.034,.026,.011),rubber,20,10)
    ell('goggle_rim',(s*.036,.018,.099),(.030,.023,.005),metal,20,10)
    ell('goggle_lens',(s*.036,.018,.105),(.026,.019,.003),lens,20,10)
    cord('goggle_strap',[(s*.068,.020,.075),(s*.093,.018,.03),(s*.096,.017,-.04),(s*.079,.019,-.096)],.007,rubber)
cord('goggle_bridge',[(-.01,.02,.106),(0,.024,.112),(.01,.02,.106)],.005,metal)
# Sculpted mask shell: high bridge, sealed cheek edges, tapered chin.
# Rings follow the face instead of placing a spherical blob in front of it.
outline=[(0,.004,.094),(.018,-.015,.085),(.039,-.037,.076),(.043,-.061,.072),
         (.033,-.089,.074),(.017,-.108,.074),(0,-.114,.075),(-.017,-.108,.074),
         (-.033,-.089,.074),(-.043,-.061,.072),(-.039,-.037,.076),(-.018,-.015,.085)]
vs=[];fs=[]
for scale,dz in [(1,0),(.94,.006),(.70,.022),(.33,.029)]:
    for x,y,z in outline:vs.append(V((x*scale,-.057+(y+.057)*scale,z+dz)))
for i in range(3):
    for j in range(12):fs.append((i*12+j,i*12+(j+1)%12,(i+1)*12+(j+1)%12,(i+1)*12+j))
fs.append(tuple(range(36,48)))
me=bpy.data.meshes.new('mask_shell');me.from_pydata(vs,[],fs);me.update()
o=bpy.data.objects.new('fitted_oxygen_mask',me);bpy.context.collection.objects.link(o);finish(o,'fitted_oxygen_mask',rubber)
cord('mask_face_seal',outline+[outline[0]],.0025,rubber,6)
for s in (-1,1):
    cord('mask_upper_strap',[(s*.038,-.038,.077),(s*.064,-.028,.057),(s*.091,-.021,.009)],(.006,.002),webbing,6)
    cord('mask_lower_strap',[(s*.031,-.087,.075),(s*.062,-.079,.05),(s*.09,-.047,.005)],(.006,.002),webbing,6)
ell('oxygen_valve',(0,-.082,.106),(.014,.014,.008),rubber,16,8)
hose=[(0,-.095,.105),(.025,-.18,.13),(.07,-.28,.14),(.09,-.40,.12),(.07,-.50,.10)]
cord('oxygen_hose',hose,.014,rubber,12)
for i in range(16):
    y=-.16-i*.021
    a,b=next((a,b) for a,b in zip(hose,hose[1:]) if b[1] <= y <= a[1])
    t=(y-a[1])/(b[1]-a[1])
    ell('hose_rib',(a[0]+t*(b[0]-a[0]),y,a[2]+t*(b[2]-a[2])),(.0155,.003,.0155),rubber,12,6)
# Collar/shearling, arm sleeves, connected bent elbows, gloves, trousers and boots.
for s in (-1,1):
    cord('shearling_collar',[(s*.012,-.20,.066),(s*.075,-.19,.04),(s*.105,-.22,-.018),(s*.07,-.23,-.095)],.026,fleece,12)
    pts=[(s*x,y,z) for x,y,z in [(.135,-.32,-.045),(.205,-.33,-.015),(.234,-.41,.018),(.235,-.50,.073),(.218,-.54,.16),(.18,-.565,.245),(.145,-.58,.31)]]
    sleeve=loft('bent_jacket_sleeve',pts,[.068,.073,.067,.066,.061,.053,.047],leather,20,.018)
    bpy.context.view_layer.objects.active=sleeve
    sub=sleeve.modifiers.new('tailored_sleeve','SUBSURF');sub.levels=1
    bpy.ops.object.modifier_apply(modifier=sub.name)
    cord('cuff',[pts[-1],(s*.137,-.587,.33)],.047,cloth,16)
    hand=ell('gloved_hand',(s*.124,-.59,.36),(.047,.032,.063),leather)
    ell('glove_thumb',(s*.087,-.577,.35),(.022,.02,.038),leather,16,8)
    for j in range(3):
        cord('glove_seam',[(s*(.103+j*.013),-.561,.34),(s*(.103+j*.013),-.563,.392)],.0016,stitch,6)
    loft('seated_trousers',[(s*.09,-.74,-.005),(s*.12,-.78,.08),(s*.14,-.79,.20),(s*.145,-.83,.32),(s*.145,-.91,.365),(s*.14,-1.03,.36),(s*.14,-1.14,.34)],[(.096,.085),(.096,.09),(.083,.082),(.076,.075),(.065,.065),(.056,.056),(.051,.05)],cloth,20,.035)
    loft('flying_boot',[(s*.14,-1.09,.34),(s*.14,-1.18,.34),(s*.14,-1.24,.37)],[(.06,.06),(.059,.065),(.063,.085)],leather,20)
    ell('boot_toe',(s*.14,-1.245,.427),(.065,.041,.106),leather)
    # Harness over shoulders, chest and lap; separate canvas straps with metal buckles.
    cord('shoulder_harness',[(s*.12,-.24,-.075),(s*.14,-.25,.018),(s*.135,-.32,.079),(s*.095,-.48,.083),(s*.055,-.65,.098)],(.018,.004),webbing,8)
    cord('lap_harness',[(s*.16,-.70,.035),(s*.10,-.72,.088),(0,-.71,.106)],(.022,.004),webbing,8)
    ell('strap_adjuster',(s*.102,-.45,.105),(.025,.025,.006),metal,16,8)
    cord('jacket_pocket',[(s*.07,-.52,.077),(s*.13,-.53,.074),(s*.145,-.58,.065)],.003,stitch,6)
cord('jacket_zip',[(0,-.24,.058),(0,-.38,.071),(0,-.52,.079),(0,-.66,.088)],.003,metal,8)
ell('harness_buckle',(0,-.70,.123),(.031,.025,.009),metal,16,8)
# Consolidate to one multi-material mesh. No unlit extension, no rig/deformation at runtime.
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
o=bpy.context.object;o.name='own_seated_crew'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bpy.ops.export_scene.gltf(filepath=sys.argv[-1],export_format='GLB',export_animations=False,export_skins=False,export_yup=True)
print('SEATED_TRIANGLES',sum(len(p.vertices)-2 for p in o.data.polygons))
