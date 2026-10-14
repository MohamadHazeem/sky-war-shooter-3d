import * as T from 'three';
import { Atmos } from './Atmosphere';
export const cascadeUniform={value:new T.Vector3(40,260,1)};
let installed=false;
export function installCascadeShader(){
 if(installed)return;installed=true;
 T.ShaderChunk.lights_pars_begin+='\nuniform vec3 swsShadowRanges;\n';
 const needle='getDirectionalLightInfo( directionalLight, directLight );';
 T.ShaderChunk.lights_fragment_begin=T.ShaderChunk.lights_fragment_begin.replace(needle,needle+/* glsl */`
 #if NUM_DIR_LIGHT_SHADOWS == 3
 {
   float swsDist=length(vViewPosition);
   vec2 swsFade=smoothstep(swsShadowRanges.xy*.6,swsShadowRanges.xy*.85,vec2(swsDist));
   vec3 swsWeights=mix(vec3(1.,0.,0.),vec3(1.-swsFade.x,swsFade.x*(1.-swsFade.y),swsFade.y),swsShadowRanges.z);
   #if UNROLLED_LOOP_INDEX < 3
     directLight.color*=swsShadowRanges.z<.5 ? (UNROLLED_LOOP_INDEX==0 ? 1. : 0.) : swsWeights[UNROLLED_LOOP_INDEX];
     directLight.visible=swsShadowRanges.z<.5 ? UNROLLED_LOOP_INDEX==0 : swsWeights[UNROLLED_LOOP_INDEX]>.001;
   #endif
 }
 #endif
 `);
}
// Three nested, texel-snapped orthographic cascades. Constant light/shadow counts across
// presets avoid shader variants. Low updates only the original close cascade.
export class SunCascades {
 readonly lights:T.DirectionalLight[];
 private rotation=new T.Matrix4();private inverse=new T.Matrix4();private point=new T.Vector3();private origin=new T.Vector3();private up=new T.Vector3(0,1,0);
 private frame=0;private active=true;private ranges=[40,260,3000];private lastSun=new T.Vector3();
 constructor(scene:T.Scene,sun:T.DirectionalLight){
  installCascadeShader();this.lights=[sun,new T.DirectionalLight(),new T.DirectionalLight()];
  for(let i=0;i<3;i++){const l=this.lights[i];l.castShadow=true;l.layers.enableAll();l.userData.noRebase=true;l.target.userData.noRebase=true;l.shadow.autoUpdate=false;l.shadow.normalBias=.025;l.shadow.bias=-.00008;l.shadow.radius=2;
   if(i>0)scene.add(l,l.target);
  }
 }
 quality(size:number,range:number,enabled:boolean){
  this.active=enabled;this.ranges[0]=range;cascadeUniform.value.set(range,260,enabled?1:0);this.frame=0;
  for(let i=0;i<3;i++){const l=this.lights[i],s=i===0?size:enabled?(i===1?Math.min(size,2048):1024):1;
   if(l.shadow.mapSize.x!==s){l.shadow.map?.dispose();l.shadow.map=null;l.shadow.mapSize.set(s,s);}
   const c=l.shadow.camera,r=this.ranges[i];c.left=-r;c.right=r;c.top=r;c.bottom=-r;c.near=1;c.far=r*4+600;c.updateProjectionMatrix();l.shadow.needsUpdate=true;
  }
 }
 update(camera:T.Camera,intensity:number){
  const changed=this.lastSun.distanceToSquared(Atmos.sunDir)>1e-6;
  this.lastSun.copy(Atmos.sunDir);this.rotation.lookAt(this.origin,Atmos.sunDir,this.up);this.inverse.copy(this.rotation).invert();
  for(let i=0;i<3;i++){
   const l=this.lights[i];l.color.copy(Atmos.sunColor);l.intensity=intensity;
   if(i>0&&!this.active&&this.frame>0)continue;
   const range=this.ranges[i];
   // Far maps amortise submission cost; nearby aircraft/interior shadows update every frame.
   if(i>0&&!changed&&this.frame%(i===1?4:12)!==0)continue;
   this.point.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(this.inverse);const texel=2*range/l.shadow.mapSize.x;
   this.point.x=Math.round(this.point.x/texel)*texel;this.point.y=Math.round(this.point.y/texel)*texel;this.point.applyMatrix4(this.rotation);
   l.position.copy(this.point).addScaledVector(Atmos.sunDir,range*2+300);l.target.position.copy(this.point);l.target.updateMatrixWorld();l.shadow.needsUpdate=true;
  }
  this.frame++;
 }
 reset(){this.frame=0;}
}
