import * as THREE from 'three';

// Original tileable cloth/leather microstructure. Generated once, mip-filtered at range.
export function fabricPixels(leather: boolean, size = 128) {
  const h = new Float32Array(size*size), normal = new Uint8Array(size*size*4), rough = new Uint8Array(size*size*4);
  let seed = 7;
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    seed = (seed*16807)%2147483647;
    const grain = seed/2147483647, u=x/size*Math.PI*2, v=y/size*Math.PI*2;
    h[y*size+x] = leather ? .22*Math.sin(u*13+Math.sin(v*7)) * Math.sin(v*11+Math.sin(u*5)) + grain*.16
      : .24*Math.sin(u*32)*Math.sin(v*32) + grain*.12;
    const i=(y*size+x)*4, r=Math.round(255*(leather?.72+.25*grain:.86+.13*grain));
    rough[i]=rough[i+1]=rough[i+2]=r;rough[i+3]=255;
  }
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const dx=h[y*size+(x+1)%size]-h[y*size+(x+size-1)%size];
    const dy=h[((y+1)%size)*size+x]-h[((y+size-1)%size)*size+x];
    const len=Math.hypot(dx,dy,1),i=(y*size+x)*4;
    normal[i]=Math.round((-dx/len*.5+.5)*255);normal[i+1]=Math.round((-dy/len*.5+.5)*255);
    normal[i+2]=Math.round((1/len*.5+.5)*255);normal[i+3]=255;
  }
  return {normal,rough};
}
const cache = new Map<boolean,{normal:THREE.DataTexture;rough:THREE.DataTexture}>();
export function crewFabric(leather: boolean) {
  const old=cache.get(leather); if(old)return old;
  const data=fabricPixels(leather), make=(pixels:Uint8Array)=>{
    const t=new THREE.DataTexture(pixels,128,128);
    t.wrapS=t.wrapT=THREE.RepeatWrapping;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;
    t.generateMipmaps=true;t.needsUpdate=true;return t;
  };
  const textures={normal:make(data.normal),rough:make(data.rough)};cache.set(leather,textures);return textures;
}
