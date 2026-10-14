import {createServer} from 'node:http';
import {writeFileSync} from 'node:fs';
import sharp from 'sharp';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../../docs/phase10/shots/02');
createServer((q,r)=>{r.setHeader('Access-Control-Allow-Origin','*');if(q.method==='OPTIONS'){r.setHeader('Access-Control-Allow-Headers','*');r.end();return;}let a=[];q.on('data',c=>a.push(c));q.on('end',async()=>{try{const name=new URL(q.url,'http://localhost').searchParams.get('file');if(!/^[a-z0-9-]+\.(jpg|json)$/.test(name))throw Error('name');const data=Buffer.concat(a).toString();writeFileSync(root+'/'+name,name.endsWith('.jpg')?await sharp(Buffer.from(data.split(',')[1],'base64')).resize({width:1100,withoutEnlargement:true}).jpeg({quality:82}).toBuffer():data);r.end('saved '+name);}catch(e){r.statusCode=500;r.end(String(e));}});}).listen(5303,'127.0.0.1');
