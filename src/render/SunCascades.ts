import { cloudSurfaceGLSL } from './CloudSurfaceShadow';
import * as T from 'three';
import { Atmos } from './Atmosphere';
export const cascadeUniform={value:new T.Vector3(40,240,1)};
let installed=false;
export function installCascadeShader(){
 if(installed)return;installed=true;
 T.ShaderChunk.lights_pars_begin+='\nuniform vec3 swsShadowRanges;\n'+cloudSurfaceGLSL;
 // The maps describe ONE sun. Blend visibility before evaluating its BRDF once;
 // three weighted lights previously repeated GGX/IBL-side lighting work per pixel.
 const chunk=T.ShaderChunk.lights_fragment_begin;
 const start=chunk.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
 const end=chunk.indexOf('#if ( NUM_RECT_AREA_LIGHTS > 0 )',start);
 const original=chunk.slice(start,end);
 const single=/* glsl */ `
 #if NUM_DIR_LIGHTS == 3 && defined( RE_Direct )
 {
   IncidentLight directSun;
   getDirectionalLightInfo(directionalLights[0],directSun);
   float sunVisibility=1.;
   #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS == 3
   if(receiveShadow && swsShadowRanges.z>=0.){
     float dist=length(vViewPosition);
     vec2 fade=smoothstep(swsShadowRanges.xy*.6,swsShadowRanges.xy*.85,vec2(dist));
     vec3 weights=mix(vec3(1.,0.,0.),vec3(1.-fade.x,fade.x*(1.-fade.y),fade.y),swsShadowRanges.z);
     // Wide FOVs and rapid turns can expose the fitted map edge. Blend back to
     // the far map rather than treating an out-of-map receiver as fully lit.
     vec2 formationUV=vDirectionalShadowCoord[1].xy/vDirectionalShadowCoord[1].w;
     float outside=smoothstep(.86,.99,max(abs(formationUV.x*2.-1.),abs(formationUV.y*2.-1.)));
     weights.z+=weights.y*outside;weights.y*=1.-outside;
     sunVisibility=0.;
     if(weights.x>.001) sunVisibility+=weights.x*getShadow(directionalShadowMap[0],directionalLightShadows[0].shadowMapSize,directionalLightShadows[0].shadowIntensity,directionalLightShadows[0].shadowBias,directionalLightShadows[0].shadowRadius,vDirectionalShadowCoord[0]);
     if(weights.y>.001) sunVisibility+=weights.y*getShadow(directionalShadowMap[1],directionalLightShadows[1].shadowMapSize,directionalLightShadows[1].shadowIntensity,directionalLightShadows[1].shadowBias,directionalLightShadows[1].shadowRadius,vDirectionalShadowCoord[1]);
     if(weights.z>.001) sunVisibility+=weights.z*getShadow(directionalShadowMap[2],directionalLightShadows[2].shadowMapSize,directionalLightShadows[2].shadowIntensity,directionalLightShadows[2].shadowBias,directionalLightShadows[2].shadowRadius,vDirectionalShadowCoord[2]);
   }
   #endif
   #ifdef STANDARD
     sunVisibility*=surfaceSunVisibility(vViewPosition);
   #endif
   directSun.color*=sunVisibility;
   RE_Direct(directSun,geometryPosition,geometryNormal,geometryViewDir,geometryClearcoatNormal,material,reflectedLight);
 }
 #else
 `+original+`
 #endif
`;
 T.ShaderChunk.lights_fragment_begin=chunk.slice(0,start)+single+chunk.slice(end);
}
// Three nested, texel-snapped orthographic cascades. Constant light/shadow counts across
// presets avoid shader variants. Low updates only the original close cascade.
export class SunCascades {
 readonly lights:T.DirectionalLight[];
 private rotation=new T.Matrix4();private inverse=new T.Matrix4();private point=new T.Vector3();private origin=new T.Vector3();private up=new T.Vector3(0,1,0);
 private forward=new T.Vector3();
 private frame=0;private active=true;private disabled=false;private ranges=[40,240,3000];private lastSun=new T.Vector3();
 constructor(scene:T.Scene,sun:T.DirectionalLight,reversed=false){
  installCascadeShader();this.lights=[sun,new T.DirectionalLight(),new T.DirectionalLight()];
  for(let i=0;i<3;i++){const l=this.lights[i];l.castShadow=true;l.layers.enableAll();l.userData.noRebase=true;l.target.userData.noRebase=true;l.shadow.autoUpdate=false;l.shadow.normalBias=i===0?.008:.035;l.shadow.bias=(reversed?1:-1)*.000012;l.shadow.radius=1.4;
   if(i>0)scene.add(l,l.target);
  }
 }
 quality(size:number,range:number,enabled:boolean){
  this.active=enabled;this.disabled=size<=1;this.ranges[0]=range;cascadeUniform.value.set(range,240,this.disabled?-1:enabled?1:0);this.frame=0;
  for(let i=0;i<3;i++){const l=this.lights[i],s=i===0?size:enabled?(i===1?Math.min(size,2048):1024):1;
   if(l.shadow.mapSize.x!==s){l.shadow.map?.dispose();l.shadow.map=null;l.shadow.mapSize.set(s,s);}
   const c=l.shadow.camera,r=this.ranges[i];const fit=i===1?.72:1;c.left=-r*fit;c.right=r*fit;c.top=r*fit;c.bottom=-r*fit;c.near=1;c.far=r*4+600;c.updateProjectionMatrix();l.shadow.needsUpdate=true;
  }
 }
 update(camera:T.Camera,intensity:number){
  const changed=this.lastSun.distanceToSquared(Atmos.sunDir)>1e-6;
  this.lastSun.copy(Atmos.sunDir);this.rotation.lookAt(this.origin,Atmos.sunDir,this.up);this.inverse.copy(this.rotation).invert();
  for(let i=0;i<3;i++){
   const l=this.lights[i];l.color.copy(Atmos.sunColor);l.intensity=intensity;
   if((this.disabled||i>0&&!this.active)&&this.frame>0)continue;
   const range=this.ranges[i];
   // Far maps amortise submission cost; nearby aircraft/interior shadows update every frame.
   if(i>0&&!changed&&this.frame>0&&this.frame%(i===1?4:12)!==(i===1?0:6))continue;
   this.point.setFromMatrixPosition(camera.matrixWorld);
   // Fit the formation map to the visible 10–200 m corridor. Shift toward the
   // view direction in the light plane; keep its deep caster volume unchanged.
   if(i===1)this.point.addScaledVector(this.forward.set(0,0,-1).transformDirection(camera.matrixWorld),85);
   this.point.applyMatrix4(this.inverse);const texel=2*range*(i===1?.72:1)/l.shadow.mapSize.x;
   this.point.x=Math.round(this.point.x/texel)*texel;this.point.y=Math.round(this.point.y/texel)*texel;this.point.applyMatrix4(this.rotation);
   l.position.copy(this.point).addScaledVector(Atmos.sunDir,range*2+300);l.target.position.copy(this.point);l.target.updateMatrixWorld();l.shadow.needsUpdate=true;
  }
  this.frame++;
 }
 reset(){this.frame=0;}
}
