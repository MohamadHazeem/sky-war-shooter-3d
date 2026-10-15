"""FlightGear escort shapes; measured in metres, +Z nose. No invented airframe lofts."""
from model import Model, Surf, LENS, INTERIOR, GUNMETAL, FRAME
from fg import FG, Hinge
import airframe as A
import parts as P


def build(kind):
    jug = kind == 'p47d'
    m = Model(kind)
    fg = FG(kind, refine_edge=0.14)
    fs = Surf('body', lines_s=[-5.3,-4.6,-3.9,-3.2,-2.5,-1.8,-1.1,-0.4,0.3,1.0,1.7,2.4,3.1,3.8],
              lines_t=[(0.7,-6,4),(1.5,-6,4),(2.4,-6,4)],
              hatches=[(0.6,1.2,0.4,1.0),(-2.5,-1.9,1.0,1.6)], axis_y=0)
    ws = Surf('lift', lines_s=[0.9,1.4,1.9,2.4,2.9,3.4,3.9,4.4,4.9,5.4],
              lines_t=[0.15,0.4,0.7], hatches=[(2.3,3.25,0.3,0.55)], name='wing')
    ts = Surf('lift', lines_s=[0.3,0.65,1.0,1.4,1.8,2.2], lines_t=[0.2,0.55], name='tail')
    fabric = Surf('lift', lines_s=[0.3,0.6,0.9,1.2], fabric=0.09, name='fabric')
    hinges=[]
    for s in (1,-1):
        side='L' if s>0 else 'R'
        def hinge(name,parent,a,b,**kw):
            a,b=(a,b) if s>0 else ((-b[0],b[1],b[2]),(-a[0],a[1],a[2]))
            hinges.append(Hinge(name+'_'+side,parent,a,b,**kw))
        if jug:
            hinge('ctl_aileron','part_wing'+side+'tip',(3.4,-0.43,0.17),(5.85,-0.12,0.75),depth=0.6)
            hinge('ctl_flap','part_wing'+side,(0.88,-0.65,-0.06),(3.32,-0.4,0.13),depth=0.8)
            hinge('ctl_elevator','part_tail',(0.25,0.19,-5.42),(2.35,0.19,-5.42),depth=0.7,off=0.1)
        else:
            hinge('ctl_aileron','part_wing'+side+'tip',(2.8,-0.43,-1.14),(4.85,-0.17,-0.8),depth=0.6)
            hinge('ctl_flap','part_wing'+side,(0.78,-0.63,-1.26),(2.75,-0.4,-1.24),depth=0.55)
            hinge('ctl_elevator','part_tail',(0.12,0.4,-5.65),(1.55,0.4,-5.65),depth=0.75,off=0.1)
    hinges.append(Hinge('ctl_rudder','part_tail',(0,0.1,-5.5 if jug else -5.82),
                        (0,2.0 if jug else 1.4,-5.5 if jug else -5.82),depth=0.85,rudder=True,off=0.12))
    A.assemble(m,fg.meshes['airframe'],dict(fus_split=-1.9,tail_z=-4.2 if jug else -4.8,tail_half=0.24,
        fin=(0.15,0.45),wing=dict(root=0.8 if jug else 0.65,joint=3.35 if jug else 2.8,
        y=(-0.9,0.1),z=(-1.6,2.3) if jug else (-2.0,0.8)),hinges=hinges,
        surfs=dict(fus=fs,wing_in=ws,wing_out=ws,tail=ts,fin=ts,rudder=fabric),
        cls_boxes=[((-0.7,-0.6,3.82),(0.7,0.55,4.16),GUNMETAL)] if jug else
                  [((-0.49,0.18,0.8),(0.49,0.36,1.85),GUNMETAL)]))
    A.add_simple(m,'glass',fg.meshes['glass'],LENS)
    A.add_simple(m,'interior',fg.meshes['interior'],INTERIOR)
    eye=fg.markers['eye_pilot']
    P.pilot(m,eye)
    hub=fg.markers['prop_1']
    # P-47: exposed paddle-blade hub; Spitfire: long pointed spinner.
    P.propeller(m,1,hub,0.27 if jug else 0.63,0.12 if jug else 0.295,
                1.98 if jug else 1.64,4,chord=0.3 if jug else 0.23,back=0.06,root_r=0.14)
    m.marker('eye_pilot',eye)
    for s in (1,-1):
        xs=[2.72,2.89,3.06,3.22] if jug else [2.05,3.1,3.7]
        for i,x in enumerate(xs):
            m.marker(f"muzzle_{'left' if s>0 else 'right'}_{i+1}",(s*x,-0.3 if not jug and i==2 else -0.34,2.3-i*0.09 if jug else [1.65,0.4,0.2][i]))
    m.info['exhausts'] = [(s*.46,.26,1.75-i*.15) for s in (1,-1) for i in range(6)] if not jug else [(s*.57,-.85,2.5) for s in (1,-1)]
    if not jug:
        # Local soot at the Merlin stacks, not a brown wash over the cockpit/camouflage.
        m.info.update(stain_amt=0.12, stain_len=0.32)
    m.info.update(scheme='usod' if jug else 'raf',allied='us' if jug else 'raf',seed=47 if jug else 9,
                  spinner=dict(style='plain',hubs=[hub],base='alu' if jug else 'sky'),
                  number=dict(text='47' if jug else 'JE',z=-1.65 if jug else -1.95,y=0.1,h=0.5,color='21' if jug else 'sky'),
                  wear=0.65,oil=[(0,-0.6,2.9 if jug else 1.8,0.7)],
                  label='P-47D Thunderbolt' if jug else 'Spitfire Mk IX')
    return m
