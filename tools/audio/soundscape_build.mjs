// Phase 8: individual CC0 previews, never bundles. Fetch with fs_get.py (IDs below).
// node tools/audio/soundscape_build.mjs /tmp/sws05-sources
import { decode, mono, encode, measure } from './lib/pcm.mjs';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const root = process.argv[2];
if (!root) throw Error('Pass the directory containing fs_<id>.mp3 and metadata from fs_get.py');
const sr = 32000, cache = new Map(), metrics = [], sources = {};
function source(id) {
  if (!cache.has(id)) {
    const meta = JSON.parse(readFileSync(join(root, `fs_${id}.json`)));
    if (!meta.license.includes('/publicdomain/zero/')) throw Error(`Unapproved licence: ${id}`);
    const d = decode(join(root, `fs_${id}.mp3`)), m = mono(d), out = new Float32Array(Math.floor(m.length * sr / d.sampleRate));
    for (let i=0;i<out.length;i++) { const p=i*d.sampleRate/sr, j=Math.floor(p); out[i]=m[j]*(1-p+j)+(m[j+1]??m[j])*(p-j); }
    cache.set(id,out); sources[id]=meta;
  }
  return cache.get(id);
}
function cut(id,start,duration,lo=40,hi=12000) {
  const data=source(id), n=Math.floor(duration*sr), out=new Float32Array(n);
  if ((start+duration)*sr>data.length) throw Error(`Short source ${id}`);
  let hp=0, lp=0; const a=1-Math.exp(-2*Math.PI*lo/sr), b=1-Math.exp(-2*Math.PI*hi/sr);
  for(let i=0;i<n;i++){ const x=data[Math.floor(start*sr)+i]; hp+=(x-hp)*a; lp+=(x-hp-lp)*b; out[i]=lp; }
  return out;
}
function strongest(id,duration,lo=100,hi=8000,skip=0,end=Infinity) {
  const a=source(id); duration=Math.min(duration,a.length/sr); skip=Math.min(skip,Math.max(0,a.length/sr-duration)); let best=skip*sr, pk=0;
  for(let i=Math.floor(skip*sr);i<Math.min(a.length-duration*sr,end*sr);i++) if(Math.abs(a[i])>pk){pk=Math.abs(a[i]);best=i;}
  return cut(id,Math.max(0,best/sr-.005),duration,lo,hi);
}
function peak(a,target){let pk=0;for(const v of a)pk=Math.max(pk,Math.abs(v));const k=10**(target/20)/Math.max(pk,1e-9);for(let i=0;i<a.length;i++)a[i]*=k;return a;}
function mix(a,b,delay,g){const out=new Float32Array(Math.max(a.length,b.length+Math.floor(delay*sr)));out.set(a);for(let i=0;i<b.length;i++)out[i+Math.floor(delay*sr)]+=b[i]*g;return out;}
function save(name,a,ids,edit,loop=false){
 if(loop){const xf=Math.floor(.1*sr),n=a.length-xf;for(let i=0;i<xf;i++)a[i]=a[i]*(i/xf)+a[n+i]*(1-i/xf);a=a.slice(0,n);}
 else for(let i=0;i<a.length;i++)a[i]*=Math.min(1,i/(sr*.001),(a.length-1-i)/(sr*.035));
 peak(a,loop?-9:-3); const file=`ss_${name}.m4a`,path=join('public/audio',file);encode([a],sr,path,80);
 const m=measure(decode(path));metrics.push({file,bytes:statSync(path).size,...Object.fromEntries(Object.entries(m).map(([k,v])=>[k,+v.toFixed(3)])),sources:ids,edit});
}
const mech=peak(mix(strongest(406226,.06,400,9000),strongest(406226,.06,400,9000,1,2),.045,.5),-8);
save('receiver',mech,[406226],'Close handling transient, high-passed, cropped receiver clack');
for(let i=0;i<2;i++) {
 const report=peak(cut(239138,3.275+i*.105,.22,60,6500),-4);
 save('m2_'+(i+1),mix(report,mech,.035,.4),[239138,406226],'M2 burst round + delayed receiver, interior low-pass');
 save('casing_'+(i+1),strongest(318964,.65,450,10000,i*4,1+i*4),[318964],'Isolated brass bounce, floor ring');
 save('skin_'+(i+1),strongest(267893,.38,650,9000,i*.4),[267893],'Short thin-metal strike, heavy low resonance removed');
}
save('flak_near',strongest(702245,1.4,35,9000),[702245],'Artillery crack with short body, mono for positional playback');
save('flak_far',strongest(702245,2.4,35,700),[702245],'Same burst, distant low-pass body');
save('patter',strongest(461779,.9,700,11000),[461779],'Small metal impacts, high-pass skin shrapnel');
save('radial',cut(437863,14,4.1,30,1600),[437863],'Interior prop texture; four offset detuned independent engine layers',true);
save('holes',cut(481148,28.5,3.1,950,6500),[481148],'High-passed air leak through damaged skin',true);
save('breath',cut(788056,.1,4.7,180,2300),[788056],'Masked breath cycle, trimmed and band-limited');
save('turret',cut(322021,3.25,.45,80,2400),[322021],'Servo section, crossfaded motor loop',true);
mkdirSync('docs/phase8/reports',{recursive:true});
writeFileSync('docs/phase8/reports/05-audio.json',JSON.stringify({sampleRate:sr,totalBytes:metrics.reduce((n,m)=>n+m.bytes,0),files:metrics},null,2)+'\n');
writeFileSync('tools/audio/soundscape_sources.json',JSON.stringify(sources,null,2)+'\n');
console.log(metrics.map(m=>`${m.file}: ${m.peakDb} dBFS, ${m.rmsDb} RMS, ${m.lufsI} LUFS`).join('\n'));

// Keep the runtime mapping/gains reproducible alongside the sample processing recipe.
const manifestPath='public/audio/manifest.json', manifest=JSON.parse(readFileSync(manifestPath));
const metadata=JSON.parse(readFileSync('tools/audio/soundscape_meta.json'));
for(const [kind,entries] of Object.entries(metadata))Object.assign(manifest[kind],entries);
writeFileSync(manifestPath,JSON.stringify(manifest,null,2).replace(/\[\s*(-?[\d.]+(?:,\s*-?[\d.]+)*)\s*\]/g,(_,v)=>'['+v.split(/,\s*/).join(', ')+']')+'\n');
