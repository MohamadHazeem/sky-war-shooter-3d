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
leather=material('Leather','53382a',.47)
cloth=material('Cloth','81714d',.88)
fleece=material('Fleece','c8b89a',.92)
skin=material('Skin','bd8a6c',.63)
rubber=material('Rubber','272e2a',.72)
webbing=material('Webbing','b2a582',.83)
metal=material('Metal','8b8d80',.31,.75)
lens=material('Lens','31434b',.19,.35)
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
loft('flight_jacket',[(0,y,z)for y,z in [(-.72,-.035),(-.67,-.04),(-.59,-.055),(-.48,-.065),(-.36,-.06),(-.28,-.06),(-.22,-.045)]],[(.16,.105),(.17,.12),(.18,.13),(.205,.135),(.225,.12),(.20,.105),(.115,.075)],leather,28,.025)
ell('trouser_seat',(0,-.75,-.035),(.18,.13,.13),cloth)
ell('neck',(0,-.15,-.015),(.068,.095,.065),skin)
# Helmet follows an anatomically tapered head; face is inset, not a faceted cylinder.
ell('leather_flying_helmet',(0,.005,-.024),(.102,.134,.10),leather,32,16)
ell('face',(0,-.025,.041),(.079,.104,.055),skin,28,16)
ell('jaw',(0,-.092,.038),(.065,.041,.047),skin)
ell('nose',(0,-.015,.098),(.018,.032,.025),skin,16,8)
for s in (-1,1):
    ell('cheek',(s*.046,-.038,.081),(.031,.036,.022),skin,16,8)
    ell('earphone',(s*.104,-.025,-.019),(.019,.051,.045),rubber,20,10)
    ell('earphone_cap',(s*.118,-.025,-.019),(.009,.038,.033),leather,20,10)
    # Goggles at the eyes, with cushioned surrounds and reflective blue-grey lenses.
    ell('goggle_cushion',(s*.043,.018,.087),(.042,.032,.017),rubber,20,10)
    ell('goggle_rim',(s*.043,.018,.099),(.036,.027,.008),metal,20,10)
    ell('goggle_lens',(s*.043,.018,.105),(.031,.022,.004),lens,20,10)
    cord('helmet_seam',[(s*.045,.005+.122*math.cos(t),-.024+.090*math.sin(t)) for t in [-1.3,-1,-.7,-.4,0,.4,.7,1,1.3]],.0025,stitch)
    cord('goggle_strap',[(s*.077,.020,.075),(s*.103,.018,.03),(s*.106,.017,-.04),(s*.079,.019,-.096)],.007,rubber)
cord('goggle_bridge',[(-.01,.02,.106),(0,.024,.112),(.01,.02,.106)],.005,metal)
ell('oxygen_mask',(0,-.070,.094),(.053,.045,.034),rubber,24,12)
ell('oxygen_valve',(0,-.088,.123),(.022,.022,.013),metal,16,8)
cord('oxygen_hose',[(0,-.105,.12),(.025,-.18,.13),(.07,-.28,.14),(.09,-.40,.12),(.07,-.50,.10)],.014,rubber,12)
for i in range(13):
    t=i/12;ell('hose_rib',(.025+.065*math.sin(t*math.pi*.78),-.18-t*.30,.13-t*.02),(.0155,.003,.0155),rubber,12,6)
# Collar/shearling, arm sleeves, connected bent elbows, gloves, trousers and boots.
for s in (-1,1):
    cord('shearling_collar',[(s*.012,-.20,.066),(s*.075,-.19,.04),(s*.105,-.22,-.018),(s*.07,-.23,-.095)],.026,fleece,12)
    pts=[(s*x,y,z) for x,y,z in [(.185,-.27,-.045),(.22,-.32,-.015),(.234,-.41,.018),(.235,-.50,.073),(.218,-.54,.16),(.18,-.565,.245),(.145,-.58,.31)]]
    ell('rounded_shoulder',(s*.185,-.275,-.045),(.077,.073,.075),leather,20,10)
    loft('bent_jacket_sleeve',pts,[.078,.078,.067,.066,.061,.053,.047],leather,20,.045)
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
