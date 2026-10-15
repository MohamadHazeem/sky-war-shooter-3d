"""Me 410 A-1/U4. Reuses the GPL Bf 110 DB-engine mesh detail, with a new
12.48 m fuselage, 16.35 m swept wing, single fin, two-seat canopy and armament.
Dimensions and visual references are recorded in tools/hero/enemies/README.md.
"""
import math
from bf110 import build as source
from geom import Body, Section as S, loft, ellipsoid, tube
from model import Surf, SKIN, GUNMETAL
import parts as P


def build():
    m = source()
    m.kind = 'me410'
    # Keep the source nacelles, propellers, landing gear and cockpit fittings only.
    keep = {'airframe', 'part_engine1', 'part_engine2', 'interior', 'pilot', 'crew', 'eye_pilot', 'eye_gunner'}
    keep.update(n for n in m.nodes if n.startswith(('prop_', 'spinner_', 'blades_', 'gear_')))
    m.nodes = {n: v for n, v in m.nodes.items() if n in keep}
    m.order = [n for n in m.order if n in keep]
    fs = Surf('body', lines_s=[-7,-6,-5,-4,-3,-2,-1,0,1,2,3], lines_t=[.8,1.6,2.4], hatches=[(-3.5,-2.8,.8,1.5)])
    ws = Surf('lift', lines_s=[.8,1.5,2.4,3.2,4,4.8,5.6,6.5,7.4], lines_t=[.1,.35,.65], name='wing')
    ts = Surf('lift', lines_s=[.4,.9,1.4,2], lines_t=[.25,.6], name='tail')
    body = Body([S(-8.05,.27,.035,.06,.06), S(-7,.26,.25,.35,.29), S(-5,.2,.39,.47,.44),
                 S(-3,.15,.5,.6,.56), S(-1,.12,.61,.64,.65), S(1,.08,.63,.65,.65),
                 S(2.7,.02,.51,.46,.51), S(3.65,-.12,.3,.28,.3), S(4.42,-.18,.025,.03,.03)])
    for name,a,b in [('part_tail',-8.05,-6.2),('part_fuselage_aft',-6.2,-1.8),('part_fuselage',-1.8,4.42)]:
        m.node(name,'airframe',lod=True)
        m.add(name,loft(body,a,b,rings=34,seg=40,opening=(-1.7,2.6,1.05)),SKIN,fs)
    P.canopy(m,[S(-1.7,.42,.45,.18,.1),S(-1,.5,.56,.65,.1,nt=3),S(.5,.5,.57,.8,.1,nt=3),
                S(1.5,.45,.51,.69,.1,nt=3),S(2.6,.25,.4,.25,.1)],1.55,[-1.7,-1,.1,1.3,2.6],[.65],frame_r=.024)
    for side in (1,-1):
        chord,le=P.round_tip(lambda e:3.35-1.95*e,lambda e:-1.05+1.8*e,.94)
        P.wing_half(m,side,(side*.5,-.27,0),7.69,4,chord,le,lambda e:.145-.055*e,.018,.32,
                    ail=(.56,.94,.25),flap=(.04,.55,.25),surf_in=ws,surf_out=ws)
        c,l=P.round_tip(lambda e:2.15-1.05*e,lambda e:5.9+.65*e,.88)
        P.tailplane_half(m,side,(side*.15,.43,0),2.65,0,c,l,lambda e:.1,.34,surf=ts)
        node='barbette_left' if side>0 else 'barbette_right'
        m.node(node,None,(side*.57,.14,-1.9))
        m.add(node,ellipsoid((side*.57,.14,-1.9),.22,.24,.5,20,12),SKIN,fs)
        P.gun_barrel(m,node,(side*.65,.16,-2.05),(side*.65,.16,-3.05),.028)
        m.marker('muzzle_'+node,(side*.65,.16,-3.05),node)
        P.exhaust_row(m,'part_engine1' if side>0 else 'part_engine2',side,(side*2.35+side*.36,.02,1.7),(0,0,-.19),6)
    fc,fl=P.round_tip(lambda e:2.45-1.1*e,lambda e:5.65+1.12*e,.78,k=.1)
    P.fin(m,(0,.42,0),2.55,fc,fl,lambda e:.11,.37,surf=ts)
    P.antenna(m,'part_fuselage',(0,1.05,-1.2),(0,1.65,-1.3),(0,2.3,-7.5))
    m.add('part_fuselage',ellipsoid((0,-.59,1.5),.28,.22,1.65,24,16),SKIN,fs)
    P.gun_barrel(m,'part_fuselage',(0,-.62,2),(0,-.62,5.58),.065)
    P.gun_barrel(m,'part_fuselage',(0,-.62,5.45),(0,-.62,5.75),.105)
    m.marker('muzzle_bk5',(0,-.62,5.75))
    for s in (1,-1):
        P.gun_barrel(m,'part_fuselage',(s*.25,-.32,3.4),(s*.25,-.32,4.3),.028)
        m.marker('muzzle_'+('left' if s>0 else 'right'),(s*.25,-.32,4.3))
    m.info.update(label='Me 410 A-1/U4',seed=410,scheme='7475m',
                  crosses_fus=[(-4,.15,.9)],crosses_wing=[(5.5,-1,1.25)],
                  labels=[dict(text='3U',z=-2.8,y=.12,h=.48,color='22',gap=.35),dict(text='A',z=-5,y=.12,h=.48,color='21')])
    return m
