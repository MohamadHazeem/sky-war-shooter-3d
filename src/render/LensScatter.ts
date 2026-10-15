import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// Broad optical scattering is band limited. Quarter-resolution integration avoids doing
// the same sun-occlusion taps and radial march at every display pixel.
export class LensScatter {
  private target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private quad: FullScreenQuad;
  constructor(uniforms: Record<string, THREE.IUniform>) {
    this.target.texture.minFilter = this.target.texture.magFilter = THREE.LinearFilter;
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms,
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      depthTest: false, depthWrite: false,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D tDepth,tCloud;
        uniform float uSunOn,uReversed,uAspect,uShafts;
        uniform vec2 uSunUV;
        uniform vec3 uSunCol;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float sunVisibility() {
  if (uSunOn <= 0.0) return 0.0;
  float v = 0.0;
  for (int i = 0; i < 9; i++) {
    vec2 o = vec2(float(i % 3) - 1.0, float(i / 3) - 1.0) * 0.006;
    vec2 uv = clamp(uSunUV + o, 0.0, 1.0);
    float d = texture2D(tDepth, uv).r;
    v += (uReversed > 0.5 ? d <= 0.0 : d >= 1.0) ? 1.0 : 0.0;
  }
  v /= 9.0;
  v *= texture2D(tCloud, uSunUV).a;   // cloud transmittance toward the sun
  return v * uSunOn;
}

// Sun glare, starburst, halo and lens ghosts
vec3 lensFlare(vec2 uv, float vis) {
  if (vis <= 0.001) return vec3(0.0);
  vec2 asp = vec2(uAspect, 1.0);
  vec2 d = (uv - uSunUV) * asp;
  float r = length(d);
  float ang = atan(d.y, d.x);
  vec3 f = uSunCol * (exp(-r * 14.0) * 0.07 + exp(-r * 40.0) * 0.45); // tight glow: facing the sun no longer milks out the frame
  f += uSunCol * pow(abs(cos(ang * 3.0)), 60.0) * exp(-r * 5.0) * 0.14;      // 6-point starburst
  f += uSunCol * exp(-pow((r - 0.42) / 0.012, 2.0)) * 0.012 * vec3(0.8, 0.9, 1.2); // halo ring
  vec2 toC = vec2(0.5) - uSunUV;
  const int N = 5;
  float gpos[5] = float[5](0.45, 0.8, 1.15, 1.45, 1.8);
  float gsz[5] = float[5](0.05, 0.022, 0.09, 0.035, 0.12);
  vec3 gcol[5] = vec3[5](vec3(0.9, 0.6, 0.3), vec3(0.4, 0.8, 0.6), vec3(0.5, 0.6, 1.0), vec3(1.0, 0.7, 0.9), vec3(0.6, 0.7, 0.9));
  for (int i = 0; i < N; i++) {
    vec2 gp = uSunUV + toC * gpos[i] * 2.0;
    float gd = length((uv - gp) * asp);
    f += gcol[i] * smoothstep(gsz[i], gsz[i] * 0.65, gd) * 0.025 * length(uSunCol) * 0.25;
  }
  return f * vis;
}
// Screen-space light shafts: march from the pixel toward the sun and accumulate sky
// visibility (far depth x cloud transmittance), so sunlight reads through gaps between
// clouds. Tinted by the sun colour but normalised to unit brightness, so uShafts is the
// real strength. Static per-pixel jitter avoids temporal shimmer.
vec3 godRays(vec2 uv) {
  if (uSunOn <= 0.0 || uShafts <= 0.0) return vec3(0.0);
  const int N = 24;
  vec2 dstep = (uSunUV - uv) * (0.9 / float(N));
  vec2 p = uv + dstep * hash12(gl_FragCoord.xy);
  float acc = 0.0, wsum = 0.0, w = 1.0;
  for (int i = 0; i < N; i++) {
    vec2 s = p + dstep * float(i);
    if (all(greaterThanEqual(s, vec2(0.0))) && all(lessThanEqual(s, vec2(1.0)))) {
      float d = texture2D(tDepth, s).r;
      bool isSky = uReversed > 0.5 ? d <= 0.0 : d >= 1.0;
      if (isSky) acc += texture2D(tCloud, s).a * w;
    }
    wsum += w;
    w *= 0.93;
  }
  vec3 tint = uSunCol / max(max(uSunCol.r, uSunCol.g), max(uSunCol.b, 1e-4));
  float falloff = exp(-length((uv - uSunUV) * vec2(uAspect, 1.0)) * 1.5);
  float localSky = (uReversed > .5 ? texture2D(tDepth,uv).r <= 0. : texture2D(tDepth,uv).r >= 1.) ? texture2D(tCloud,uv).a : 0.;
  // A ray needs both an opening and a caster along its sunward path.
  // Subtracting local sky erased shafts precisely in those open channels;
  // a fully clear path must still contribute zero (no full-screen veil).
  float pathSky = clamp(acc / wsum, 0., 1.);
  float gapBeam = localSky * pow(pathSky, 3.) * (1. - pathSky) * 9.;
  float surfaceBeam = max(0., pathSky - localSky) * (1. - localSky) * .3;
  return mix(tint, vec3(1.), .35) * (gapBeam + surfaceBeam) * falloff * uShafts * uSunOn * 4.;
}


        void main(){float visibility=sunVisibility();gl_FragColor=vec4(lensFlare(vUv,visibility)+godRays(vUv),visibility);}
      `,
    }));
  }
  setSize(w: number, h: number) { this.target.setSize(Math.max(1, Math.ceil(w / 4)), Math.max(1, Math.ceil(h / 4))); }
  render(renderer: THREE.WebGLRenderer) { renderer.setRenderTarget(this.target);this.quad.render(renderer);return this.target.texture; }
}
