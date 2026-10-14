import * as T from 'three';
import { Atmos } from './Atmosphere';

// Sample the same deck transmittance used by the cloud marcher at each surface,
// rather than dimming the entire formation with a delayed camera-only CPU probe.
// R holds the upper deck (indexed at its base), G the low deck (Clouds SHADOW_PASS).
export const cloudSurfaceUniforms = {
  swsCloudShadow: { value: null as T.Texture | null },
  swsCloudBox: { value: new T.Vector3() },
  swsCloudSun: { value: Atmos.sunDir },
  swsCloudBase: { value: 8900 },
  swsCloudLayers: { value: new T.Vector4(3900, 5900, 8900, 10900) },
  swsCloudOn: { value: 0 },
};
export const cloudSurfaceGLSL = /* glsl */ `
uniform sampler2D swsCloudShadow;
uniform vec3 swsCloudBox,swsCloudSun;
uniform vec4 swsCloudLayers;
uniform float swsCloudBase,swsCloudOn;
float swsDeckShadow(vec3 world,float base,float top,float channel){
  if(world.y>=top)return 1.;
  vec3 q=world+swsCloudSun*((base-world.y)/max(swsCloudSun.y,.05));
  vec2 uv=(q.xz-swsCloudBox.xy)/max(swsCloudBox.z,.001)+.5;
  float edge=1.-smoothstep(.4,.49,max(abs(uv.x-.5),abs(uv.y-.5)));
  vec2 s=texture2D(swsCloudShadow,uv).rg;
  return mix(1.,mix(s.r,s.g,channel),edge*(1.-smoothstep(base,top,world.y)));
}
float surfaceSunVisibility(vec3 viewPosition) {
  if(swsCloudOn<.5)return 1.;
  vec3 world=cameraPosition-transpose(mat3(viewMatrix))*viewPosition;
  float s=swsDeckShadow(world,swsCloudLayers.x,swsCloudLayers.y,1.)*swsDeckShadow(world,swsCloudLayers.z,swsCloudLayers.w,0.);
  return .22+.78*s;
}
`;
