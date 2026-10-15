"""Ju 88 G-6: FlightGear Ju 88 surface with solid nose, enlarged squared fin,
FuG 220 aerials, flame dampers and 75-degree Schräge Musik installation."""
from ju88 import build as source
from geom import Body, Section as S, loft, tube
from model import Surf, SKIN, GUNMETAL
import parts as P


def build():
    m=source(); m.kind='ju88g'
    # Remove glazed bomb-aimer nose and ventral gondola, retain the flight deck.
    for node in m.nodes.values():
        for mesh,cls in node.meshes:
            mesh.faces=[f for f in mesh.faces if not (
                sum(mesh.verts[i][2] for i in f)/len(f)>2.55 and abs(sum(mesh.verts[i][0] for i in f)/len(f))<.95
                or sum(mesh.verts[i][1] for i in f)/len(f)<-.65 and abs(sum(mesh.verts[i][0] for i in f)/len(f))<.85)]
    # Replace the A-series rounded fin and rudder, retaining horizontal stabilizers.
    for nm in ['part_tail','ctl_rudder']:
        for mesh,cls in m.nodes[nm].meshes:
            mesh.faces=[f for f in mesh.faces if not (sum(mesh.verts[i][1] for i in f)/len(f)>.65 and abs(sum(mesh.verts[i][0] for i in f)/len(f))<.3)]
    m.nodes.pop('ctl_rudder');m.order.remove('ctl_rudder')
    fs=Surf('body',lines_s=[2.6,3,3.5,4],lines_t=[.8,1.6,2.4])
    nose=Body([S(2.5,.05,.62,.65,.62),S(3.2,.02,.58,.59,.58),S(4,.0,.35,.4,.35),S(4.65,-.03,.05,.08,.07)])
    m.add('part_fuselage',loft(nose,rings=28,seg=36),SKIN,fs)
    P.fin(m,(0,.5,0),2.75,lambda e:2.75-.38*e,lambda e:7.65+.65*e,lambda e:.1,.36,surf=Surf('lift',lines_s=[.5,1,1.5,2],lines_t=[.3,.6],name='tail'))
    for x in (-.4,-.2,.2,.4):
        P.gun_barrel(m,'part_fuselage',(x,-.45,3),(x,-.45,3.8),.027)
    # Four antler booms, two transverse dipole arrays each. Aerial ends ahead of nose.
    for x in (-.65,.65):
        for y in (-.5,.65):
            base=(x*.6,y*.6,3.75);end=(x,y,5.25)
            m.add('part_fuselage',tube([base,end],.026,8),GUNMETAL)
            for z in (4.85,5.25):
                m.add('part_fuselage',tube([(x-.28,y,z),(x+.28,y,z)],.018,6),GUNMETAL)
                for dx in (-.28,.28):
                    m.add('part_fuselage',tube([(x+dx,y-.38,z),(x+dx,y+.38,z)],.014,6),GUNMETAL)
    for side in (-1,1):
        # Oblique cannon and marker; ballistic direction is the same 75 degrees.
        a=(side*.22,.45,-3.0); b=(side*.22,1.7,-2.665)
        P.gun_barrel(m,'part_fuselage_aft',a,b,.032)
        m.marker('muzzle_schrage_'+('L' if side>0 else 'R'),b)
        for dx in (-.48,.48):
            m.add('part_engine1' if side>0 else 'part_engine2',tube([(side*2.78+dx,-.12,2.1),(side*2.78+dx,-.12,-.8)],.085,10),GUNMETAL)
    m.info.update(label='Ju 88 G-6',scheme='night76',seed=886,
        labels=[dict(text='4R',z=-3.4,y=.12,h=.6,color='22',gap=.35),dict(text='B',z=-5.65,y=.15,h=.6,color='22')])
    return m
