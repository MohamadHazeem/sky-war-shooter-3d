"""Repeatable three-view silhouette gate against digitized USAAF Figure 1.
No nonuniform fit per view: one metre-to-pixel scale (span), translation and the
manual's side-view ground pitch only. Thin appendages are not part of area IoU.
"""
import json,math,hashlib
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'docs/phase10/shots/02b'
ref=json.loads((ROOT/'tools/hero/silhouette-reference.json').read_text());data=json.loads((ROOT/'tools/hero/output/projections.json').read_text())
# Scan span establishes scale. Side drawing shares it; front is separately printed at same span.
scale=1004/31.62
# Registration was set against the legacy model using fin tip, wing tips and nacelle centres.
# The scanned elevation includes ~2.86 degree pitch and ~1.38 degree page roll.
# The SAME view registration is used for legacy and hero; never scale body sections.
def project(p,view):
    x,y,z=p
    if view=='top':return (592+x*scale,672+z*scale)
    if view=='front':return (594+x*scale,1032-(y+z*.05)*scale-.024*x*scale)
    # The manual depicts the aircraft on its wheels (fuselage tilted 2 degrees).
    return (443-z*scale,1308-y*scale+z*scale*.035)
report={'artifactSha256':hashlib.sha256((ROOT/'public/models/hero/b17.glb').read_bytes()).hexdigest(),'source':ref['source'],'manual':ref['manual'],'method':ref['method'],'uncertaintyPixels':4,'registration':{'topOrigin':[592,672],'frontOrigin':[594,1032],'frontPitchSlope':.05,'frontScanRollSlope':-.024,'sideOrigin':[443,1308],'sidePitchSlope':.035},'toleranceMetric':'boundary-tolerant IoU: mismatch within 4 scan pixels is ignored; raw IoU also reported','pixelsPerMetre':scale,'tolerance':{'top':.82,'front':.70,'side':.75},'views':{},'bounds':{k:v['bounds'] for k,v in data.items()}}
for view in ['top','front','side']:
    refim=Image.new('1',(1240,1607));ImageDraw.Draw(refim).polygon([tuple(p) for p in ref[view]],fill=1)
    refmask=np.array(refim);out=Image.new('RGB',refim.size,(245,245,241));d=ImageDraw.Draw(out);d.polygon([tuple(p) for p in ref[view]],fill=(193,213,224))
    result={}
    for name in ['legacy','hero']:
        mask=Image.new('1',refim.size);md=ImageDraw.Draw(mask)
        for tri in data[name]['triangles']:md.polygon([project(p,view) for p in tri],fill=1)
        a=np.array(mask);union=np.count_nonzero(a|refmask);iou=np.count_nonzero(a&refmask)/union
        pad=ref['uncertaintyPixels']
        dr=np.array(refim.convert('L').filter(ImageFilter.MaxFilter(pad*2+1)))>0
        dm=np.array(mask.convert('L').filter(ImageFilter.MaxFilter(pad*2+1)))>0
        tolerant=1-np.count_nonzero((a&~dr)|(refmask&~dm))/union
        result[name]={'iou':round(float(iou),4),'boundaryTolerantIoU':round(float(tolerant),4)}
        if name=='hero':
            edge=mask.convert('L').filter(ImageFilter.FIND_EDGES);out.paste((192,61,42),(0,0),edge)
    report['views'][view]=result
    crop=refim.getbbox();crop=(max(0,crop[0]-35),max(0,crop[1]-35),min(1240,crop[2]+35),min(1607,crop[3]+35));out=out.crop(crop);out.thumbnail((1100,850))
    canvas=Image.new('RGB',(out.width,out.height+48),(245,245,241));canvas.paste(out,(0,48));d=ImageDraw.Draw(canvas);d.text((10,8),f'{view.upper()} | blue: USAAF manual | red: hero boundary',fill=(20,30,40));d.text((10,25),f'IoU hero {result["hero"]["iou"]:.3f} / legacy {result["legacy"]["iou"]:.3f}; 4 px trace uncertainty',fill=(20,30,40));canvas.save(OUT/f'silhouette-{view}.jpg',quality=86)
# Section widths are cut from projected triangle edges, not bounding-box guesses.
def crossings(points,station,axis,coord):
    out=[]
    for a,b in zip(points,points[1:]+points[:1]):
        if (a[axis]<=station<b[axis]) or (b[axis]<=station<a[axis]):
            out.append(a[coord]+(b[coord]-a[coord])*(station-a[axis])/(b[axis]-a[axis]))
    return out
sections={}
for name,station,model_range,reference_range in [('forwardFuselage',3.5,(-1.5,1.5),(540,640)),('outboardNacelle',2.2,(5.5,7.5),(350,425))]:
    scan_y=672+station*scale
    ref_x=[x for x in crossings(ref['top'],scan_y,1,0) if reference_range[0]<x<reference_range[1]]
    expected=(max(ref_x)-min(ref_x))/scale
    measured=[]
    for tri in data['hero']['triangles']:
        measured.extend(x for x in crossings(tri,station,2,0) if model_range[0]<x<model_range[1])
    actual=max(measured)-min(measured)
    sections[name]={'stationZMetres':station,'referenceWidthMetres':round(expected,3),'heroWidthMetres':round(actual,3),'relativeError':round(abs(actual-expected)/expected,4),'tolerance':.10}
report['sections']=sections
report['pass']=all(report['views'][v]['hero']['boundaryTolerantIoU']>=t for v,t in report['tolerance'].items()) and all(s['relativeError']<=s['tolerance'] for s in sections.values())
(OUT/'silhouette.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if not report['pass']:raise SystemExit('Silhouette gate failed')
