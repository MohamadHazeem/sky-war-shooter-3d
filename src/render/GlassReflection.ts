import * as T from 'three';

// Read the already completed cloud/opaque HDR composite. Never sample the target being drawn.
// Ten bounded steps, only on glass fragments; misses retain the sky IBL. No extra render pass.
export const reflectionUniforms = {
  swsReflectionColor: { value: null as T.Texture | null },
  swsReflectionDepth: { value: null as T.Texture | null },
  swsReflectionProjection: { value: new T.Matrix4() },
  swsReflectionOn: { value: 0 },
};
export function bindGlassReflection(color: T.Texture, depth: T.Texture, camera: T.Camera, enabled: boolean) {
  reflectionUniforms.swsReflectionColor.value = color;
  reflectionUniforms.swsReflectionDepth.value = depth;
  reflectionUniforms.swsReflectionProjection.value.copy(camera.projectionMatrix);
  reflectionUniforms.swsReflectionOn.value = enabled ? 1 : 0;
}
export const GLASS_REFLECTION_GLSL = /* glsl */ `
uniform sampler2D swsReflectionColor, swsReflectionDepth;
uniform mat4 swsReflectionProjection;
uniform float swsReflectionOn;
vec4 swsGlassReflection(vec3 p, vec3 n) {
  if(swsReflectionOn<.5) return vec4(0.);
  vec3 ray=reflect(normalize(p),normalize(n));
  vec2 uv=vec2(0.); float previousGap=-1.;
  for(int i=0;i<10;i++) {
    float t=.18*pow(1.95,float(i));
    vec3 q=p+ray*t;
    vec4 clip=swsReflectionProjection*vec4(q,1.);
    if(clip.w<=.01) break;
    uv=clip.xy/clip.w*.5+.5;
    if(any(lessThan(uv,vec2(.002)))||any(greaterThan(uv,vec2(.998)))) break;
    float depth=texture2D(swsReflectionDepth,uv).r;
    bool sky=depth>=64000.;
    float edge=1.-smoothstep(.36,.49,max(abs(uv.x-.5),abs(uv.y-.5)));
    if(sky && i==9) return vec4(texture2D(swsReflectionColor,uv).rgb,edge*.65);
    float gap=-q.z-depth;
    // Thin hit interval rejects foreground silhouettes and self-intersections.
    if(!sky && i>1 && previousGap<0. && gap>=0. && gap<max(.25,t*.12))
      return vec4(texture2D(swsReflectionColor,uv).rgb,edge*(1.-smoothstep(.15,.6,gap/max(1.,t*.12))));
    previousGap=sky?-1.:gap;
  }
  return vec4(0.);
}
`;
