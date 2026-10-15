import * as T from 'three';

// Read the already completed cloud/opaque HDR composite. Never sample the target being drawn.
// Eight bounded steps, only on glass fragments; misses retain the sky IBL. No extra render pass.
export const reflectionUniforms = {
  swsReflectionColor: { value: null as T.Texture | null },
  swsReflectionDepth: { value: null as T.Texture | null },
  swsReflectionProjection: { value: new T.Matrix4() },
  swsReflectionEnvironment: { value: null as T.Texture | null },
  swsReflectionEnvSize: { value: new T.Vector3(1 / 384, 1 / 512, 7) },
  swsReflectionTexel: { value: new T.Vector2(1 / 1920, 1 / 1080) },
  swsReflectionOn: { value: 0 },
};
export function bindGlassReflection(color: T.Texture, depth: T.Texture, camera: T.Camera, enabled: boolean, environment?: T.Texture | null) {
  reflectionUniforms.swsReflectionColor.value = color;
  const size = color.image as { width?: number; height?: number } | undefined;
  reflectionUniforms.swsReflectionTexel.value.set(1 / (size?.width || 1920), 1 / (size?.height || 1080));
  reflectionUniforms.swsReflectionDepth.value = depth;
  reflectionUniforms.swsReflectionProjection.value.copy(camera.projectionMatrix);
  reflectionUniforms.swsReflectionOn.value = enabled ? 1 : 0;
  if (environment) {
    reflectionUniforms.swsReflectionEnvironment.value = environment;
    const image = environment.image as { width: number; height: number };
    reflectionUniforms.swsReflectionEnvSize.value.set(1 / image.width, 1 / image.height, Math.log2(image.height) - 2);
  }
}
export const GLASS_REFLECTION_GLSL = /* glsl */ `
uniform sampler2D swsReflectionColor, swsReflectionDepth;
uniform mat4 swsReflectionProjection;
uniform float swsReflectionOn;
uniform vec2 swsReflectionTexel;
// Small spatial footprint removes single-pixel fireflies without long streaks/history ghosts.
vec3 swsReflectionSample(vec2 uv) {
  vec2 px=swsReflectionTexel*1.5;
  vec3 c=texture2D(swsReflectionColor,uv).rgb*.4;
  c+=min(texture2D(swsReflectionColor,uv+vec2(px.x,0.)).rgb,vec3(4.))*.15;
  c+=min(texture2D(swsReflectionColor,uv-vec2(px.x,0.)).rgb,vec3(4.))*.15;
  c+=min(texture2D(swsReflectionColor,uv+vec2(0.,px.y)).rgb,vec3(4.))*.15;
  c+=min(texture2D(swsReflectionColor,uv-vec2(0.,px.y)).rgb,vec3(4.))*.15;
  return min(c,vec3(4.));
}
vec4 swsGlassReflection(vec3 p, vec3 n) {
  float facing=abs(dot(normalize(p),normalize(n)));
  float grazing=smoothstep(.12,.38,facing);
  if(swsReflectionOn<.5 || grazing<.001 || length(p)>80.) return vec4(0.);
  vec3 ray=reflect(normalize(p),normalize(n));
  // Rays returning toward the eye cannot recover hidden scenery from this depth buffer.
  if(ray.z>-.05) return vec4(0.);
  vec2 uv=vec2(0.); float previousGap=-1., previousT=0.;
  for(int i=0;i<8;i++) {
    float t=.3*pow(2.25,float(i));
    vec3 q=p+ray*t;
    vec4 clip=swsReflectionProjection*vec4(q,1.);
    if(clip.w<=.01) break;
    uv=clip.xy/clip.w*.5+.5;
    if(any(lessThan(uv,vec2(.01)))||any(greaterThan(uv,vec2(.99)))) break;
    float depth=texture2D(swsReflectionDepth,uv).r;
    bool sky=depth>=64000.;
    float edge=1.-smoothstep(.32,.48,max(abs(uv.x-.5),abs(uv.y-.5)));
    if(sky && i==7) return vec4(swsReflectionSample(uv),edge*.65*grazing);
    float gap=-q.z-depth;
    if(!sky && i>1 && previousGap<0. && gap>=0.) {
      float lo=previousT,hi=t;
      for(int j=0;j<4;j++) {
        float mid=(lo+hi)*.5;
        vec3 hit=p+ray*mid;vec4 hc=swsReflectionProjection*vec4(hit,1.);
        uv=hc.xy/hc.w*.5+.5;
        gap=-hit.z-texture2D(swsReflectionDepth,uv).r;
        if(gap>0.) hi=mid;else lo=mid;
      }
      // Do not stretch a foreground silhouette into a reflection across the side glass.
      float d=texture2D(swsReflectionDepth,uv).r;
      vec2 px=swsReflectionTexel*2.;
      float discontinuity=max(abs(d-texture2D(swsReflectionDepth,uv+px).r),abs(d-texture2D(swsReflectionDepth,uv-px).r));
      float valid=(1.-smoothstep(.15,.65,abs(gap)))*(1.-smoothstep(.3,1.5,discontinuity));
      return vec4(swsReflectionSample(uv),edge*grazing*valid);
    }
    previousGap=sky?-1.:gap;previousT=t;
  }
  return vec4(0.);
}
`;

// The overlay shares the weather-refreshed PMREM used by the aircraft materials.
// Size is uniform-driven, so weather/quality changes never compile another program.
export const GLASS_ENV_GLSL = /* glsl */ `
#include <common>
uniform sampler2D swsReflectionEnvironment;
uniform vec3 swsReflectionEnvSize;
#define ENVMAP_TYPE_CUBE_UV
#define CUBEUV_TEXEL_WIDTH swsReflectionEnvSize.x
#define CUBEUV_TEXEL_HEIGHT swsReflectionEnvSize.y
#define CUBEUV_MAX_MIP swsReflectionEnvSize.z
#include <cube_uv_reflection_fragment>
`;
