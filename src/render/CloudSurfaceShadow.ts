import * as T from 'three';
import { Atmos } from './Atmosphere';

// Sample the same upper-deck transmittance used by the cloud marcher at each surface,
// rather than dimming the entire formation with a delayed camera-only CPU probe.
export const cloudSurfaceUniforms = {
  swsCloudShadow: { value: null as T.Texture | null },
  swsCloudBox: { value: new T.Vector3() },
  swsCloudSun: { value: Atmos.sunDir },
  swsCloudBase: { value: 8900 },
  swsCloudOn: { value: 0 },
};
export const cloudSurfaceGLSL = /* glsl */ `
uniform sampler2D swsCloudShadow;
uniform vec3 swsCloudBox,swsCloudSun;
uniform float swsCloudBase,swsCloudOn;
float surfaceSunVisibility(vec3 viewPosition) {
  if(swsCloudOn<.5)return 1.;
  vec3 world=cameraPosition-transpose(mat3(viewMatrix))*viewPosition;
  if(world.y>=swsCloudBase)return 1.;
  vec3 q=world+swsCloudSun*((swsCloudBase-world.y)/max(swsCloudSun.y,.05));
  vec2 uv=(q.xz-swsCloudBox.xy)/max(swsCloudBox.z,.001)+.5;
  float edge=1.-smoothstep(.4,.49,max(abs(uv.x-.5),abs(uv.y-.5)));
  return mix(1., .22+.78*texture2D(swsCloudShadow,uv).r,edge);
}
`;
