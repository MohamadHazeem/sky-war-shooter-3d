// Run a whole combat measurement without competing headless renderers. Never retry
// based on the timing result: only independently observed process interference.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
const [command,...args]=process.argv.slice(2);
if(!command)throw new Error('Pass the measurement command and arguments');
function competitors(){
 const rows=execFileSync('ps',['-Ao','pid,ppid,command'],{encoding:'utf8'}).split('\n').map(l=>l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean);
 const parents=new Map(rows.map(r=>[Number(r[1]),Number(r[2])]));
 return rows.filter(r=>r[3].startsWith('/')&&!r[3].startsWith('/bin/')&&r[3].includes('/chrome-headless-shell --type=gpu-process')).filter(r=>{
  let pid=Number(r[1]);while(pid>1&&pid!==process.pid)pid=parents.get(pid)??0;
  return pid!==process.pid;
 }).map(r=>Number(r[1]));
}
for(let attempt=1;;attempt++){
 let quiet=0,waits=0;
 while(quiet<3){const others=competitors();quiet=others.length?0:quiet+1;if(others.length&&waits++%10===0)console.log('Waiting for other headless renderers:',others);await new Promise(r=>setTimeout(r,1000));}
 const interference=new Set();
 const child=spawn(command,args,{stdio:'inherit',env:process.env});
 const timer=setInterval(()=>{for(const pid of competitors())interference.add(pid);},500);
 let code;
 try{code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});}
 finally{clearInterval(timer);for(const pid of competitors())interference.add(pid);}
 if(!interference.size)process.exit(code??1);
 const file=process.env.MATERIALS_ISOLATED_OUTPUT;
 if(file){const result=JSON.parse(await fs.readFile(file));await fs.writeFile(`${file}.interrupted-${attempt}.json`,JSON.stringify({competingPids:[...interference],result},null,2)+'\n');}
 console.log('Retained interrupted combat run; retrying after competing renderers exit.');
}
