import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Dual-filter bloom (Kawase-style down/up chain) on the linear HDR image.
class Bloom {
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private prefilter: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private quad = new FullScreenQuad();
  readonly levels = 6;
  threshold = 1.4;

  constructor() {
    for (let i = 0; i < this.levels; i++) {
      const opts = { type: THREE.HalfFloatType, depthBuffer: false };
      this.down.push(new THREE.WebGLRenderTarget(1, 1, opts));
      this.up.push(new THREE.WebGLRenderTarget(1, 1, opts));
    }
    for (const rt of [...this.down, ...this.up]) rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
    this.prefilter = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 } },
      vertexShader: vert,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tSrc, vUv).rgb * 0.5;
          c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb * 0.125;
          c += texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb * 0.125;
          c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb * 0.125;
          c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb * 0.125;
          float br = max(c.r, max(c.g, c.b));
          float k = max(br - uThreshold, 0.0) / max(br, 1e-4);
          gl_FragColor = vec4(min(c * k, vec3(200.0)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.downMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: vert,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
          c += texture2D(tSrc, vUv - uTexel).rgb;
          c += texture2D(tSrc, vUv + uTexel).rgb;
          c += texture2D(tSrc, vUv + vec2(uTexel.x, -uTexel.y)).rgb;
          c += texture2D(tSrc, vUv - vec2(uTexel.x, -uTexel.y)).rgb;
          gl_FragColor = vec4(c / 8.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.upMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: vert,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 uTexel; varying vec2 vUv;
        void main() {
          vec2 o = uTexel * 0.5;
          vec3 c = texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
          c += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb * 2.0;
          c += texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
          c += texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb * 2.0;
          c += texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb;
          c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb * 2.0;
          c += texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb;
          c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
          gl_FragColor = vec4(c / 12.0 + texture2D(tBase, vUv).rgb, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
  }

  setSize(w: number, h: number) {
    let cw = Math.max(1, w >> 1), ch = Math.max(1, h >> 1);
    for (let i = 0; i < this.levels; i++) {
      this.down[i].setSize(cw, ch);
      this.up[i].setSize(cw, ch);
      cw = Math.max(1, cw >> 1);
      ch = Math.max(1, ch >> 1);
    }
  }

  render(renderer: THREE.WebGLRenderer, src: THREE.Texture, srcW: number, srcH: number): THREE.Texture {
    this.prefilter.uniforms.tSrc.value = src;
    this.prefilter.uniforms.uTexel.value.set(1 / srcW, 1 / srcH);
    this.prefilter.uniforms.uThreshold.value = this.threshold;
    this.quad.material = this.prefilter;
    renderer.setRenderTarget(this.down[0]);
    this.quad.render(renderer);
    this.quad.material = this.downMat;
    for (let i = 1; i < this.levels; i++) {
      this.downMat.uniforms.tSrc.value = this.down[i - 1].texture;
      this.downMat.uniforms.uTexel.value.set(1 / this.down[i - 1].width, 1 / this.down[i - 1].height);
      renderer.setRenderTarget(this.down[i]);
      this.quad.render(renderer);
    }
    this.quad.material = this.upMat;
    let prev = this.down[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      this.upMat.uniforms.tSrc.value = prev.texture;
      this.upMat.uniforms.tBase.value = this.down[i].texture;
      this.upMat.uniforms.uTexel.value.set(1 / prev.width, 1 / prev.height);
      renderer.setRenderTarget(this.up[i]);
      this.quad.render(renderer);
      prev = this.up[i];
    }
    return this.up[0].texture;
  }
}

const finalFrag = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tBloom;
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform mat4 uPrevViewProj;
uniform float uReversed;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uMotionBlur;
uniform float uNearFocus;
uniform float uDofStrength;
uniform float uTime;
uniform float uDamageFlash;
uniform float uVignette;
uniform float uGrain;
uniform vec2 uRes;
uniform float uFlash;
uniform float uNoBlurDist;
varying vec2 vUv;

vec3 ACESFilm(vec3 x) {
  // Narkowicz ACES approximation with slightly softer toe for a filmic look
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float viewDist(vec2 uv, out vec3 worldPos, out bool sky) {
  float d = texture2D(tDepth, uv).r;
  sky = uReversed > 0.5 ? d <= 0.0 : d >= 1.0;
  vec3 ndc = vec3(uv * 2.0 - 1.0, uReversed > 0.5 ? max(d, 1e-7) : d * 2.0 - 1.0);
  vec4 vp = uInvProj * vec4(ndc, 1.0);
  vec3 v = vp.xyz / vp.w;
  if (sky) v = normalize(v) * 1e5;
  worldPos = (uCamWorld * vec4(v, 0.0)).xyz; // camera-relative, rotation only
  return length(v);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 wp; bool sky;
  float dist = viewDist(vUv, wp, sky);

  // Camera motion blur via reprojection
  vec4 prev = uPrevViewProj * vec4(wp, 1.0);
  vec2 prevUv = prev.xy / prev.w * 0.5 + 0.5;
  vec2 vel = (vUv - prevUv) * uMotionBlur;
  float vlen = length(vel);
  float maxV = 0.06;
  if (vlen > maxV) vel *= maxV / vlen;
  vel *= smoothstep(uNoBlurDist, uNoBlurDist * 1.6, dist);
  vec3 col = vec3(0.0);
  float noise = hash12(gl_FragCoord.xy + uTime * 60.0);
  const int MB = 10;
  for (int i = 0; i < MB; i++) {
    float t = (float(i) + noise) / float(MB) - 0.5;
    col += texture2D(tColor, vUv - vel * t).rgb;
  }
  col /= float(MB);

  // Near-field depth of field (the gun receiver right in front of the eye is soft, like the film)
  float coc = clamp((uNearFocus - dist) / uNearFocus, 0.0, 1.0) * uDofStrength;
  if (coc > 0.01) {
    vec3 acc = col;
    float wsum = 1.0;
    float r = coc * 22.0 * (uRes.y / 900.0);
    for (int i = 0; i < 16; i++) {
      float a = float(i) * 2.39996 + noise * 6.283;
      float rr = sqrt((float(i) + 0.5) / 16.0) * r;
      vec2 o = vec2(cos(a), sin(a)) * rr / uRes;
      vec3 wp2; bool s2;
      float d2 = viewDist(vUv + o, wp2, s2);
      float w = d2 < uNearFocus * 1.3 ? 1.0 : 0.35;
      acc += texture2D(tColor, vUv + o).rgb * w;
      wsum += w;
    }
    col = mix(col, acc / wsum, clamp(coc * 1.6, 0.0, 1.0));
  }

  vec3 bloom = texture2D(tBloom, vUv).rgb;
  col += bloom * uBloomStrength;
  col += vec3(1.0, 0.85, 0.6) * uFlash;
  col *= uExposure;

  // Subtle chromatic fringe toward the edges
  col = ACESFilm(col);

  // Grade: lift shadows slightly cool, warm the highlights (matches the reference footage)
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, col * vec3(0.96, 0.99, 1.05), 1.0 - smoothstep(0.0, 0.5, l));
  col = mix(col, col * vec3(1.03, 1.0, 0.95), smoothstep(0.5, 1.0, l));
  col = mix(vec3(l), col, 1.04);

  // Damage tint
  col = mix(col, col * vec3(1.4, 0.55, 0.5), uDamageFlash);

  // Vignette
  vec2 q = vUv - 0.5;
  float vig = 1.0 - dot(q, q) * uVignette;
  col *= clamp(vig, 0.0, 1.0);

  // linear -> sRGB
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  col += (noise - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}
`;

export class PostFX {
  private bloom = new Bloom();
  private finalMat: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  private prevViewProj = new THREE.Matrix4();
  private hasPrev = false;
  exposure = 1.0;
  bloomStrength = 0.09;
  motionBlur = 0.55;
  nearFocus = 0.9;
  dofStrength = 1.0;
  vignette = 0.9;
  grain = 0.025;
  damageFlash = 0;
  flash = 0;
  noBlurDist = 1.5;
  private rotOnly = new THREE.Matrix4();

  constructor(reversed: boolean) {
    this.finalMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tBloom: { value: null }, tDepth: { value: null },
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() }, uReversed: { value: reversed ? 1 : 0 },
        uExposure: { value: 1 }, uBloomStrength: { value: 0.1 }, uMotionBlur: { value: 0.5 },
        uNearFocus: { value: 1 }, uDofStrength: { value: 1 }, uTime: { value: 0 },
        uDamageFlash: { value: 0 }, uVignette: { value: 0.9 }, uGrain: { value: 0.03 },
        uRes: { value: new THREE.Vector2() }, uFlash: { value: 0 }, uNoBlurDist: { value: 1.5 },
      },
      vertexShader: vert,
      fragmentShader: finalFrag,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.finalMat);
  }

  setSize(w: number, h: number) {
    this.bloom.setSize(w, h);
    this.finalMat.uniforms.uRes.value.set(w, h);
  }

  resetHistory() { this.hasPrev = false; }

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, hdr: THREE.WebGLRenderTarget,
    depth: THREE.Texture, time: number, dt: number) {
    const bloomTex = this.bloom.render(renderer, hdr.texture, hdr.width, hdr.height);
    const u = this.finalMat.uniforms;
    u.tColor.value = hdr.texture;
    u.tBloom.value = bloomTex;
    u.tDepth.value = depth;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    // Rotation-only view-projection: blur comes from the camera turning, not from it
    // travelling with the formation (which would smear everything attached to it).
    this.rotOnly.extractRotation(camera.matrixWorld).invert();
    const curVP = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, this.rotOnly);
    u.uPrevViewProj.value.copy(this.hasPrev ? this.prevViewProj : curVP);
    // Normalise blur to a 60 fps shutter so low frame rates don't smear excessively
    u.uMotionBlur.value = this.motionBlur * Math.min(1.5, (1 / 60) / Math.max(dt, 1e-3));
    u.uExposure.value = this.exposure;
    u.uBloomStrength.value = this.bloomStrength;
    u.uNearFocus.value = this.nearFocus;
    u.uDofStrength.value = this.dofStrength;
    u.uTime.value = time;
    u.uDamageFlash.value = this.damageFlash;
    u.uVignette.value = this.vignette;
    u.uGrain.value = this.grain;
    u.uFlash.value = this.flash;
    u.uNoBlurDist.value = this.noBlurDist;
    renderer.setRenderTarget(null);
    this.quad.render(renderer);
    this.prevViewProj.copy(curVP);
    this.hasPrev = true;
  }
}
