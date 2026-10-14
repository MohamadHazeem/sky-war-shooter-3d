import * as T from 'three';
export type FilmMood='warm'|'cold'|'overcast'|'dusk'|'night';
export const FILM_MOODS:FilmMood[]=['warm','cold','overcast','dusk','night'];
const looks:Record<FilmMood,readonly number[]>={warm:[.96,1,1.035,1.04,1,.94,.94],cold:[.94,1,1.06,1.01,1,1.02,.89],overcast:[.98,1,1.025,1.015,1,.98,.83],dusk:[.96,.98,1.06,1.07,1,.91,.92],night:[.89,.96,1.06,.97,1,1.045,.76]};
export function filmColor(r:number,g:number,b:number,mood:FilmMood):[number,number,number]{
 const p=looks[mood],l=r*.2126+g*.7152+b*.0722,s=(1-l)**2,h=l*l;
 r*=1+(p[0]-1)*s+(p[3]-1)*h;g*=1+(p[1]-1)*s+(p[4]-1)*h;b*=1+(p[2]-1)*s+(p[5]-1)*h;
 const y=r*.2126+g*.7152+b*.0722;
 return [r,g,b].map(v=>Math.max(0,Math.min(1,y+(v-y)*p[6]))) as [number,number,number];
}
// 16^3 film response packed in a 256x16 strip, sampled trilinearly in the post shader.
// Built once, all moods resident; weather switches textures without changing programs.
export function makeFilmLUT(mood:FilmMood){
 const size=16,data=new Uint8Array(size*size*size*4);
 for(let b=0;b<size;b++)for(let g=0;g<size;g++)for(let r=0;r<size;r++){
  const c=filmColor(r/15,g/15,b/15,mood),i=(g*size*size+b*size+r)*4;
  data[i]=Math.round(c[0]*255);data[i+1]=Math.round(c[1]*255);data[i+2]=Math.round(c[2]*255);data[i+3]=255;
 }
 const tex=new T.DataTexture(data,256,16);tex.minFilter=tex.magFilter=T.LinearFilter;tex.colorSpace=T.NoColorSpace;tex.needsUpdate=true;return tex;
}
