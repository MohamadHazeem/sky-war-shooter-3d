"""USAAF stars-and-bars and RAF roundels, projected onto the actual FlightGear skin."""
import numpy as np


def markings(col, P, N, skin, lift, nation, colors):
    x,y,z=P[...,0],P[...,1],P[...,2]
    side=(np.abs(N[...,0])>0.3)&skin&~lift
    upper=N[...,1]>0
    def roundel(u,v,r,sel,wing=False):
        nonlocal col
        d=np.sqrt(u*u+v*v)/r
        if nation=='raf':
            rings=[(1,'yellow'),(.87,'blue'),(.57,'white'),(.3,'red')] if not wing else [(1,'blue'),(.38,'red')]
            if wing:
                rings=[(1,'blue'),(.68,'white'),(.34,'red')]
            for radius,c in rings:
                mask=sel&(d<radius)
                if wing and c=='white': mask&=~upper
                col=np.where(mask[...,None],colors[c],col)
        else:
            bar=(np.abs(u)<r*1.65)&(np.abs(v)<r*.35)
            col=np.where((sel&((d<1)|bar))[...,None],colors['blue'],col)
            bar=(np.abs(u)<r*1.55)&(np.abs(v)<r*.24)
            # Five-point star via a polygon crossing test, tip points upward.
            inside=np.zeros(u.shape,dtype=bool)
            pts=[(np.sin(i*np.pi/5)*(r*.94 if i%2==0 else r*.36),np.cos(i*np.pi/5)*(r*.94 if i%2==0 else r*.36)) for i in range(10)]
            for i,(ax,ay) in enumerate(pts):
                bx,by=pts[(i+1)%10]
                inside^=((ay>v)!=(by>v))&(u<(bx-ax)*(v-ay)/(by-ay+1e-9)+ax)
            col=np.where((sel&(inside|bar))[...,None],colors['white'],col)
    roundel(z+3.0,y-0.05,.48 if nation=='us' else .42,side)
    if nation=='us':
        sel=lift&((x>0)&upper|(x<0)&~upper)
        roundel(np.abs(x)-4.3,z-0.35,.72,sel,True)
        # White recognition bands, used by US escorts before invasion stripes.
        bands=skin&(((z>3.1)&(z<3.4))|((z< -4.4)&(z> -4.7)))
        col=np.where(bands[...,None],colors['white'],col)
    else:
        roundel(np.abs(x)-4.0,z+0.25,.62,lift,True)
        band=skin&~lift&(z< -3.65)&(z> -4.05)
        col=np.where(band[...,None],colors['sky'],col)
        fin=skin&(np.abs(x)<.16)&(y>.7)&(z< -4.8)&(z> -5.5)
        col=np.where(fin[...,None],colors['blue'],col)
        col=np.where((fin&(z> -5.25))[...,None],colors['white'],col)
        col=np.where((fin&(z> -5.02))[...,None],colors['red'],col)
    return col
