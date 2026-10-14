import { LensScatter } from './LensScatter';
import { EyeAdaptation } from './EyeAdaptation';
import { FILM_MOODS, makeFilmLUT, type FilmMood } from './FilmLUT';
import { weatherNow } from './WeatherState';
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { Atmos } from './Atmosphere';
import { mulberry } from './Particles';
import { access } from '../core/Accessibility';

// Procedural lens dirt: faint smudges, specks and a fingerprint-ish swirl
function makeDirt(): THREE.Texture {
  const W = 512, H = 288;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const rnd = mulberry(33);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W, y = rnd() * H, r = 8 + rnd() * 50;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + rnd() * 0.12;
    grd.addColorStop(0, `rgba(255,240,220,${a})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(255,255,255,${0.1 + rnd() * 0.3})`;
    g.beginPath(); g.arc(rnd() * W, rnd() * H, 0.5 + rnd() * 1.6, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(255,250,240,0.06)'; g.lineWidth = 3;
  for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(360, 90, 30 + k * 7, 20 + k * 5, 0.4, 0, Math.PI * 1.6); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

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
      uniforms: { tSrc: { value: null }, tBase: { value: null }, uConserve: { value: 1 }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: vert,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform sampler2D tBase; uniform float uConserve; uniform vec2 uTexel; varying vec2 vUv;
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
          gl_FragColor = vec4((c / 12.0 + texture2D(tBase, vUv).rgb) * mix(1., .5, uConserve), 1.0);
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

  render(renderer: THREE.WebGLRenderer, src: THREE.Texture, srcW: number, srcH: number, levels = this.levels): THREE.Texture {
    this.prefilter.uniforms.tSrc.value = src;
    this.prefilter.uniforms.uTexel.value.set(1 / srcW, 1 / srcH);
    this.prefilter.uniforms.uThreshold.value = this.threshold;
    this.quad.material = this.prefilter;
    renderer.setRenderTarget(this.down[0]);
    this.quad.render(renderer);
    this.quad.material = this.downMat;
    for (let i = 1; i < levels; i++) {
      this.downMat.uniforms.tSrc.value = this.down[i - 1].texture;
      this.downMat.uniforms.uTexel.value.set(1 / this.down[i - 1].width, 1 / this.down[i - 1].height);
      renderer.setRenderTarget(this.down[i]);
      this.quad.render(renderer);
    }
    this.upMat.uniforms.uConserve.value = levels === 3 ? 0 : 1;
    this.quad.material = this.upMat;
    let prev = this.down[levels - 1];
    for (let i = levels - 2; i >= 0; i--) {
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
uniform sampler2D tExposure;
uniform sampler2D tLUT;
uniform sampler2D tLUTNext;
uniform float uLUTBlend;
uniform float uAdvanced;
uniform float uSharpen;
uniform sampler2D tBloom;
uniform sampler2D tScatter;
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform mat4 uPrevViewProj;
uniform vec2 uJitter;
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
uniform float uGrainDark;
uniform float uChroma;
uniform vec2 uRes;
uniform float uFlash;
uniform float uHypoxia;
uniform float uZoomPulse; // kill punch: radial zoom blur folded into the motion-blur taps
uniform vec2 uSunUV;
uniform float uSunOn;
uniform vec3 uSunCol;
uniform sampler2D tCloud;
uniform sampler2D tDirt;
uniform float uDirt;
uniform float uAspect;
uniform float uDesat;   // 0..1 wounded crew: drain colour and pulse the edges
uniform float uShafts;
// Film grade (see PostFX.grade): split-tone tints, saturation, S-curve, warm black lift
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uSat;
uniform float uCurve;
uniform vec3 uLift;
// Contact AO from the depth buffer (0 = off) and the projection's y scale (1 / tan(fov/2))
uniform float uAO;
uniform float uProjY;
// Heat haze (HeatHaze.ts): screen-space offsets of the scene lookup, 0 = no emitter in view
uniform sampler2D tHaze;
uniform float uHazeOn;

uniform float uNoBlurDist;
varying vec2 vUv;

vec3 sampleLUT(sampler2D lut, vec3 c) {
  c=clamp(c,0.,1.)*15.;float b=floor(c.b);
  vec2 uv=vec2((b*16.+c.r+.5)/256.,(c.g+.5)/16.);
  return mix(texture2D(lut,uv).rgb,texture2D(lut,uv+vec2(min(1.,15.-b)/16.,0.)).rgb,fract(c.b));
}
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

// Scene tap with a faint lateral chromatic split that grows toward the screen edges
// (lens fringing). R is pushed outward and B pulled inward; the centre stays exact.
vec3 sceneTap(vec2 uv) {
  if (uChroma <= 0.0) return texture2D(tColor, uv).rgb;
  vec2 q = uv - 0.5;
  vec2 off = q * dot(q, q) * uChroma * 0.012;
  return vec3(texture2D(tColor, uv + off).r, texture2D(tColor, uv).g, texture2D(tColor, uv - off).b);
}

// Cheap contact shadowing: for 4 opposite pairs of depth taps on a ~0.35 m disc, a pair
// whose average sits in front of the centre means a crease (wing root, frames, ammo boxes).
// Planar surfaces cancel out, and a range check keeps foreground silhouettes from haloing.
float contactAO(float dist, float noise) {
  if (uAO <= 0.0 || dist > 90.0) return 1.0;
  const float R = 0.35;
  float ry = clamp(0.5 * R * uProjY / dist, 1.5 / uRes.y, 0.06);
  vec2 rad = vec2(ry / uAspect, ry);
  float occ = 0.0;
  float a0 = noise * 3.14159;
  for (int i = 0; i < 4; i++) {
    float a = a0 + float(i) * 0.785398;
    vec2 o = vec2(cos(a), sin(a)) * rad * (0.6 + 0.4 * fract(noise * 7.0 + float(i) * 0.37));
    vec3 w1, w2; bool s1, s2;
    float d1 = viewDist(vUv + o, w1, s1);
    float d2 = viewDist(vUv - o, w2, s2);
    float crease = dist - 0.5 * (d1 + d2);
    occ += clamp(crease / (R * 0.6), 0.0, 1.0) * (1.0 - smoothstep(R * 1.5, R * 4.0, crease));
  }
  return 1.0 - uAO * occ * 0.25 * (1.0 - smoothstep(50.0, 90.0, dist));
}

void main() {
  vec3 wp; bool sky;
  float dist = viewDist(vUv, wp, sky);

  // Camera motion blur via reprojection
  vec4 prev = uPrevViewProj * vec4(wp, 1.0);
  vec2 prevUv = prev.xy / prev.w * 0.5 + 0.5;
  vec2 vel = (vUv + uJitter * .5 - prevUv) * uMotionBlur;
  float vlen = length(vel);
  float maxV = 0.06;
  if (vlen > maxV) vel *= maxV / vlen;
  vel *= smoothstep(uNoBlurDist, uNoBlurDist * 1.6, dist);
  if (uZoomPulse > 0.0) vel += (vUv - 0.5) * uZoomPulse * smoothstep(uNoBlurDist, uNoBlurDist * 1.6, dist);
  vel += (vUv - .5) * uHypoxia * .016;
  vec3 col = vec3(0.0);
  float noise = hash12(gl_FragCoord.xy + uTime * 60.0);
  // heat haze: bend the lookup, unless that pulls a nearer surface (a gun barrel, a wing
  // edge) into the background
  vec2 uv0 = vUv;
  if (uHazeOn > 0.5) {
    vec2 hz = texture2D(tHaze, vUv).xy;
    if (dot(hz, hz) > 1e-10) {
      vec3 wh; bool sh;
      float dh = viewDist(vUv + hz, wh, sh);
      if (dh > dist * 0.85) uv0 = vUv + hz;
    }
  }
  if (dot(vel, vel) < 1e-10) {
    col = sceneTap(uv0);
  } else {
    const int MB = 10;
    for (int i = 0; i < MB; i++) {
      float t = (float(i) + noise) / float(MB) - 0.5;
      col += sceneTap(uv0 - vel * t);
    }
    col /= float(MB);
  }

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

  if (!sky) col *= contactAO(dist, noise);

  vec3 bloom = texture2D(tBloom, vUv).rgb;
  if(uAdvanced>.5){
    // Bounded unsharp mask after temporal resolve, before bloom and display mapping.
    vec2 px=1./uRes;vec3 blur=(texture2D(tColor,vUv+vec2(px.x,0.)).rgb+texture2D(tColor,vUv-vec2(px.x,0.)).rgb+texture2D(tColor,vUv+vec2(0.,px.y)).rgb+texture2D(tColor,vUv-vec2(0.,px.y)).rgb)*.25;
    col=max(vec3(0.),col+clamp(col-blur,-.12,.12)*uSharpen);
    col=mix(col,bloom,uBloomStrength);
  }else col += bloom * uBloomStrength;
  // lens dirt lights up where the bloom is bright
  col += bloom * texture2D(tDirt, vUv).rgb * uDirt;
  vec4 scattering = texture2D(tScatter, vUv);
  float sv = scattering.a;
  col += scattering.rgb;
  col += texture2D(tDirt, vUv).rgb * uSunCol * sv * (uDirt * 0.0714286) * exp(-length((vUv - uSunUV) * vec2(uAspect, 1.0)) * 2.5);
  col += vec3(1.0, 0.85, 0.6) * uFlash;
  col *= uExposure * (uAdvanced>.5?texture2D(tExposure,vec2(.5)).r:1.);

  col = ACESFilm(col);

  // Grade (the Yarnhub wartime palette): cool, slightly teal shadows, warm cream highlights,
  // a touch of desaturation, a gentle S-curve and blacks lifted toward warm brown like print film
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, col * uShadowTint, 1.0 - smoothstep(0.0, 0.5, l));
  col = mix(col, col * uHighTint, smoothstep(0.45, 1.0, l));
  l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(l), col, uSat), 0.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), uCurve);
  col = uLift + col * (1.0 - uLift);

  if(uAdvanced>.5){vec3 graded=sampleLUT(tLUT,col);if(uLUTBlend>.001)graded=mix(graded,sampleLUT(tLUTNext,col),uLUTBlend);col=graded;}

  // Damage tint
  col = mix(col, col * vec3(1.4, 0.55, 0.5), uDamageFlash);

  // Wounded: slow drain of colour toward grey (linear light, so it reads as fatigue, not a filter)
  col = mix(col, vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), uDesat * 0.7);

  // Vignette
  vec2 q = vUv - 0.5;
  float vig = 1.0 - dot(q, q) * uVignette;
  col *= clamp(vig, 0.0, 1.0);
  // Wounded: a dark edge that breathes slowly with the pulse of the wound
  float pulse = 0.5 + 0.5 * sin(uTime * 2.4);
  float edge = smoothstep(0.12, 0.62, length(q));
  col *= 1.0 - uDesat * edge * (0.18 + 0.12 * pulse);

  // linear -> sRGB
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  col += (noise - 0.5) * uGrain;
  // Film grain: re-rolled at 24 fps so it reads as a moving emulsion, and weighted
  // toward shadows the way silver halide grain shows up in dark negatives
  float gFrame = mod(floor(uTime * 24.0), 1024.0);
  float gNoise = hash12(gl_FragCoord.xy + vec2(gFrame * 37.0, gFrame * 17.0));
  float gLum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float darkW = 1.0 - smoothstep(0.05, 0.6, gLum);
  col += (gNoise - 0.5) * uGrainDark * darkW;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export class PostFX {
  private bloom = new Bloom();
  private eye = new EyeAdaptation();
  private luts = Object.fromEntries(FILM_MOODS.map(m => [m, makeFilmLUT(m)])) as unknown as Record<FilmMood, THREE.Texture>;
  temporal = true;
  lensDirt = true;
  sharpen = .3;
  private finalMat: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  readonly jitter = new THREE.Vector2();
  private blurProjection = new THREE.Matrix4();
  private prevViewProj = new THREE.Matrix4();
  private hasPrev = false;
  exposure = 1.0;
  bloomStrength = 0.09;
  bloomLevels = 4;
  motionBlur = 0.55;
  nearFocus = 0.9;
  dofStrength = 1.0;
  vignette = 0.9;
  grain = 0.025;
  // Lateral chromatic aberration amount at the screen edges (0 = off)
  chroma = 0.6;
  // Extra film-grain amplitude in shadows (added on top of the uniform grain)
  grainDark = 0.03;
  damageFlash = 0;
  desat = 0;   // wounded-crew look, 0..1 (set per frame by Game)
  flash = 0;
  hypoxia = 0;
  zoomPulse = 0;   // radial zoom-blur pulse on kills (GameFeel), ~0..0.05
  noBlurDist = 1.5;
  flareStrength = 1;
  shafts = 0.12;   // sun god-ray strength (0 disables)
  // Look development (Engine-owned; Game drives `exposure` per frame, this multiplies it)
  baseExposure = 1.06;
  economy = false; // Low: compact bloom, no camera blur, DOF or sun shafts; same programs
  ao = 0;        // contact AO strength (quality preset)
  readonly grade = {
    shadowTint: new THREE.Vector3(0.96, 1.0, 1.02),
    highTint: new THREE.Vector3(1.025, 1.0, 0.97),
    sat: 1.0,
    curve: 0.28,
    lift: new THREE.Vector3(0.003, 0.004, 0.006),
  };
  cloudTex: THREE.Texture | null = null;
  hazeTex: THREE.Texture | null = null;   // heat-haze offsets of this frame (Engine), null = none
  private scatter: LensScatter;
  private rotOnly = new THREE.Matrix4();
  private curVP = new THREE.Matrix4();
  private sunW = new THREE.Vector3();
  private fwd = new THREE.Vector3();

  constructor(reversed: boolean) {
    this.finalMat = new THREE.ShaderMaterial({
      uniforms: {
        tExposure: { value: null }, tLUT: { value: this.luts.warm }, tLUTNext: { value: this.luts.warm }, uLUTBlend: { value: 0 }, uAdvanced: { value: 1 }, uSharpen: { value: .3 },
        tScatter: { value: null }, tColor: { value: null }, tBloom: { value: null }, tDepth: { value: null },
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() }, uJitter: { value: this.jitter }, uReversed: { value: reversed ? 1 : 0 },
        uExposure: { value: 1 }, uBloomStrength: { value: 0.1 }, uMotionBlur: { value: 0.5 },
        uNearFocus: { value: 1 }, uDofStrength: { value: 1 }, uTime: { value: 0 },
        uDamageFlash: { value: 0 }, uVignette: { value: 0.9 }, uGrain: { value: 0.03 },
        uGrainDark: { value: 0.03 }, uChroma: { value: 0.6 },
        uRes: { value: new THREE.Vector2() }, uFlash: { value: 0 }, uZoomPulse: { value: 0 }, uHypoxia: { value: 0 }, uNoBlurDist: { value: 1.5 },
        uSunUV: { value: new THREE.Vector2() }, uSunOn: { value: 0 }, uSunCol: { value: new THREE.Vector3() },
        tCloud: { value: null }, tDirt: { value: makeDirt() }, uDirt: { value: 0.35 }, uAspect: { value: 1 },
        uDesat: { value: 0 },
        uShafts: { value: 0.35 },
        uShadowTint: { value: this.grade.shadowTint }, uHighTint: { value: this.grade.highTint },
        uSat: { value: 1 }, uCurve: { value: 0.2 }, uLift: { value: this.grade.lift },
        uAO: { value: 0 }, uProjY: { value: 1 },
        tHaze: { value: null }, uHazeOn: { value: 0 },
      },
      vertexShader: vert,
      fragmentShader: finalFrag,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.finalMat);
    this.scatter = new LensScatter(this.finalMat.uniforms);
  }

  private lutForWeather(mood: string) {
    const film: FilmMood = mood === 'night' ? 'night' : mood === 'dusk' ? 'dusk'
      : mood === 'overcast' || mood === 'storm' ? 'overcast' : Atmos.sunElevationDeg < 25 ? 'warm' : 'cold';
    return this.luts[film];
  }

  warmTextures(renderer: THREE.WebGLRenderer) { for (const texture of Object.values(this.luts)) renderer.initTexture(texture); }

  setSize(w: number, h: number) {
    this.bloom.setSize(w, h);
    this.scatter.setSize(w, h);
    this.finalMat.uniforms.uRes.value.set(w, h);
  }

  resetHistory() { this.hasPrev = false; this.eye.reset(); }

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, hdr: THREE.WebGLRenderTarget,
    depth: THREE.Texture, time: number, dt: number) {
    const exposure = this.temporal && !this.economy ? this.eye.render(renderer, hdr.texture, dt) : null;
    const bloomTex = this.bloom.render(renderer, hdr.texture, hdr.width, hdr.height, this.economy ? 3 : this.bloomLevels);
    const u = this.finalMat.uniforms;
    u.tColor.value = hdr.texture;
    u.tExposure.value = exposure;
    u.tLUT.value = this.lutForWeather(weatherNow.from);
    u.tLUTNext.value = this.lutForWeather(weatherNow.to);
    u.uLUTBlend.value = weatherNow.k;
    u.uAdvanced.value = this.temporal && !this.economy ? 1 : 0;
    u.uSharpen.value = this.sharpen;
    u.uDirt.value = this.lensDirt ? .35 : 0;
    u.tBloom.value = bloomTex;
    u.tDepth.value = depth;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    // Rotation-only view-projection: blur comes from the camera turning, not from it
    // travelling with the formation (which would smear everything attached to it).
    this.rotOnly.extractRotation(camera.matrixWorld).invert();
    this.blurProjection.copy(camera.projectionMatrix);
    this.blurProjection.elements[8] -= this.jitter.x;
    this.blurProjection.elements[9] -= this.jitter.y;
    const curVP = this.curVP.multiplyMatrices(this.blurProjection, this.rotOnly);
    u.uPrevViewProj.value.copy(this.hasPrev ? this.prevViewProj : curVP);
    // Normalise blur to a 60 fps shutter so low frame rates don't smear excessively
    u.uMotionBlur.value = (this.economy ? 0 : this.motionBlur) * Math.min(1.5, (1 / 60) / Math.max(dt, 1e-3));
    u.uExposure.value = this.exposure * this.baseExposure;
    u.uSat.value = this.grade.sat;
    u.uCurve.value = this.grade.curve;
    u.uAO.value = this.ao;
    u.uProjY.value = camera.projectionMatrix.elements[5];
    u.uBloomStrength.value = this.bloomStrength;
    u.uNearFocus.value = this.nearFocus;
    u.uDofStrength.value = this.economy ? 0 : this.dofStrength;
    u.uTime.value = time;
    u.uDamageFlash.value = this.damageFlash * access.flash;   // 'reduce flashes' setting
    u.uDesat.value = this.desat;
    u.uVignette.value = this.vignette;
    u.uGrain.value = this.grain;
    u.uGrainDark.value = this.grainDark;
    u.uChroma.value = this.chroma;
    u.uFlash.value = this.flash * access.flash;
    u.uHypoxia.value = this.hypoxia;
    u.uZoomPulse.value = this.zoomPulse * access.flash;
    u.uNoBlurDist.value = this.noBlurDist;
    // sun position on screen for the lens flare
    const sunW = this.sunW.setFromMatrixPosition(camera.matrixWorld).addScaledVector(Atmos.sunDir, 5000);
    const fwd = this.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const facing = fwd.dot(Atmos.sunDir);
    sunW.project(camera);
    u.uSunUV.value.set(sunW.x * 0.5 + 0.5, sunW.y * 0.5 + 0.5);
    const inView = facing > 0 && Math.abs(sunW.x) < 1.1 && Math.abs(sunW.y) < 1.1;
    u.uSunOn.value = inView ? this.flareStrength * THREE.MathUtils.smoothstep(facing, 0, 0.3) : 0;
    u.uSunCol.value.set(Atmos.sunColor.r, Atmos.sunColor.g, Atmos.sunColor.b).multiplyScalar(Atmos.sunIntensity);
    u.tCloud.value = this.cloudTex;
    u.uAspect.value = camera.aspect;
    u.uShafts.value = this.economy ? 0 : this.shafts;
    u.tHaze.value = this.hazeTex;
    u.uHazeOn.value = this.hazeTex ? 1 : 0;
    u.tScatter.value = this.scatter.render(renderer);
    renderer.setRenderTarget(null);
    this.quad.render(renderer);
    this.prevViewProj.copy(curVP);
    this.hasPrev = true;
  }
}
