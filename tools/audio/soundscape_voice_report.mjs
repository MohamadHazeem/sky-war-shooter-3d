// Decoded AAC loudness plus Chatterbox take metadata for the Phase 8 additions.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { decode, measure } from './lib/pcm.mjs';
const man=JSON.parse(readFileSync('public/audio/voice/manifest.json'));
const quality=JSON.parse(readFileSync('tools/voice/.cache/quality.json'));
const files=[];
for(const [id,c] of Object.entries(man.clips))if(/^(ss_|pfx_ss_)/.test(id)){
 const m=measure(decode('public/audio/voice/'+c.file));const q=quality[id];
 files.push({id,file:c.file,role:c.role,text:c.text,bytes:statSync('public/audio/voice/'+c.file).size,engine:q.engine,retries:q.retries,durationOK:q.durationOK,...Object.fromEntries(Object.entries(m).map(([k,v])=>[k,+v.toFixed(3)]))});
}
writeFileSync('docs/phase8/reports/05-voice.json',JSON.stringify({files,totalBytes:files.reduce((n,f)=>n+f.bytes,0)},null,2)+'\n');
console.log({clips:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),maxPeak:Math.max(...files.map(f=>f.peakDb)),minLufs:Math.min(...files.map(f=>f.lufsI)),maxLufs:Math.max(...files.map(f=>f.lufsI)),retries:files.filter(f=>f.retries).map(f=>[f.id,f.retries])});
