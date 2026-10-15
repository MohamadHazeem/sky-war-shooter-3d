// Verify the baseline against bytes actually deployed on main; run BEFORE overwriting fighter files.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const origin='https://sky-war-shooter-3d.mhamadhazeem2001.workers.dev';
const hash=b=>createHash('sha256').update(b).digest('hex');
const records=[];
for(const kind of ['bf109','fw190'])for(const suffix of ['.glb','_base.ktx2','_normal.ktx2','_orm.ktx2','_ace.webp']){
 const path=`models/${kind}${suffix}`;const response=await fetch(`${origin}/${path}`);
 if(!response.ok)throw new Error(`${response.status}: ${path}`);
 const live=Buffer.from(await response.arrayBuffer());
 const baseline=readFileSync(`${process.env.BASELINE_DIR??'/tmp/01b-baseline'}/${kind}${suffix}`);
 records.push({path,bytes:live.length,sha256:hash(live),baselineSha256:hash(baseline),matches:hash(live)===hash(baseline)});
}
mkdirSync('docs/phase11/shots/01b',{recursive:true});
writeFileSync('docs/phase11/shots/01b/live-assets.json',JSON.stringify({origin,fetchedAt:new Date().toISOString(),records},null,2)+'\n');
console.log(records);

if(records.some(r=>!r.matches))throw new Error("Deployed fighter assets changed; refresh the baseline before comparison.");
