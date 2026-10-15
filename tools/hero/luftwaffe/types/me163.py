"""Me 163 B: GPL FlightGear geometry, dimension-corrected to 9.3 x 5.7 m,
with named damage sections, hinged elevons, cockpit fittings and baked skin."""
import numpy as np
from model import Model, Surf, SKIN, LENS, INTERIOR, FANMETAL, GUNMETAL
from fg import FG, Hinge
import airframe as A
import parts as P
from geom import tube, Section as S


def build():
    m=Model('me163')
    fg=FG('me163',refine_edge=.13)
    # Source extents include the tiny nose generator; use those for scale registration.
    points=np.array([tuple(v.co) for src in fg.meshes.values() for v in src.bm.verts])
    sx=9.3/(points[:,0].max()-points[:,0].min());sz=5.7/(points[:,2].max()-points[:,2].min())
    def w(p): return (p[0]*sx,p[1],p[2]*sz)
    for src in fg.meshes.values():
        for v in src.bm.verts:v.co=w(v.co)
    fg.markers={n:w(p) for n,p in fg.markers.items()};fg.origins={n:w(p) for n,p in fg.origins.items()}
    fs=Surf('body',lines_s=[-3,-2.5,-2,-1.5,-1,-.5,0,.5,1,1.5],lines_t=[.8,1.6,2.4])
    ws=Surf('lift',lines_s=[.7,1.3,2,2.8,3.6,4.2],lines_t=[.15,.45,.7],name='wing')
    ts=Surf('lift',lines_s=[.4,.8,1.2],lines_t=[.25,.6],name='tail')
    # Source coordinates are inspected by the build; aft swept trailing edge follows span.
    hinges=[]
    for s in (1,-1):
        a=(s*1.5,.02,-1.25);b=(s*4.5,.02,-1.85)
        if s<0:a,b=b,a
        hinges.append(Hinge('ctl_aileron_'+('L' if s>0 else 'R'),'part_wing'+('Ltip' if s>0 else 'Rtip'),a,b,depth=.65,off=.2))
    hinges.append(Hinge('ctl_rudder','part_tail',(0,.35,-2.85),(0,1.55,-2.85),depth=.8,rudder=True,off=.2))
    A.assemble(m,fg.meshes['airframe'],dict(fus_split=-1,tail_z=-2.65,tail_half=.18,fin=(.2,.4),
        wing=dict(root=.65,joint=2.2,y=(-.7,.8),z=(-4.1,1)),hinges=hinges,nacelles=[],
        surfs=dict(fus=fs,wing_in=ws,wing_out=ws,tail=ts,fin=ts,rudder=ts,nacelle=fs)))
    for name,cls in [('interior',INTERIOR),('fan_1',FANMETAL)]:
        if name in fg.meshes:
            m.node(name,None,fg.origins.get(name,(0,0,0)));A.add_simple(m,name,fg.meshes[name],cls)
    for n,p in fg.markers.items():
        if n.startswith(('eye_','muzzle_','exhaust')):m.marker(n,p)
    eye=fg.markers.get('eye_pilot',(0,.65,.1));m.marker('eye_pilot',eye)
    P.canopy(m,[S(.33,.49,.22,.1,.05),S(.55,.5,.35,.28,.05),S(1.05,.5,.35,.31,.05),S(1.49,.48,.15,.06,.05)],1.5,[.33,1.13,1.49],[],frame_r=.012)
    P.pilot(m,(eye[0],eye[1]-.17,eye[2]-.05))
    P.cockpit_fittings(m,eye[2]-.6,eye[2]+.5,-.15,.4,.36,eye[2]+.45,seat_z=eye[2]-.15)
    m.node('gear_skid');m.add('gear_skid',tube([(0,-.75,.7),(0,-1,-.5),(0,-.8,-1.8)],.07,10),GUNMETAL)
    m.info.update(label='Me 163 B',skin_ao_floor=.72,scheme='8182',seed=163,spinner=None,yellow=[],band=None,
        crosses_fus=[(-1.8,.15,.55)],crosses_wing=[(2.7,-1.8,.95)],
        number=dict(text='14',z=.6,y=.05,h=.35,color='21',outline='22'),labels=[],exhausts=[],oil=[],walkway=[],wear=.65,
        ace=dict(kills=7,emblem=None,chevrons=False,band=(-2.3,-2,['21'])))
    return m
