import * as T from 'three';
export type FilmMood='warm'|'cold'|'overcast'|'dusk'|'night';
export const FILM_MOODS:FilmMood[]=['warm','cold','overcast','dusk','night'];
// Look references: Poly Haven Kloofendal 48d (neutral sun/cool fill), Kiara 1 Dawn
// (violet shade/peach horizon). See docs/phase11/shots/02/CREDITS.md.
const looks:Record<FilmMood,readonly number[]>={warm:[.88,.97,1.08,1.045,1,.95,1.02],cold:[.80,.96,1.17,1.01,1,1.04,.97],overcast:[.87,.98,1.12,1.01,1,1,.93],dusk:[.90,.90,1.15,1.10,.97,.87,1.04],night:[.72,.88,1.15,.94,1,1.09,.88]};
export function filmColor(r:number,g:number,b:number,mood:FilmMood):[number,number,number]{
 // A bounded print shoulder/toe keeps bright cloud tops while separating middle tones.
 const contrast=mood==='night'?.10:mood==='overcast'?.22:.30;
 const curve=(v:number)=>v+(v*v*(3-2*v)-v)*contrast;
 r=curve(r);g=curve(g);b=curve(b);
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
