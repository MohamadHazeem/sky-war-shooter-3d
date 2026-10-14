import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { access } from '../core/Accessibility';
import {
  LOOK_PRESETS, SHOT_PRESETS, cocScalePx, presetFilmLook, resolveFilm,
  type FilmParams, type FilmLookSetting, type ShotLook,
} from './FilmParams';

// Film look (Phase 10 goal 10): three self-contained post passes around PostFX's composite.
//
//   scene HDR ──► ObjectMotionBlur ──► Bokeh DOF ──► [PostFX: bloom, camera blur, flare, grade]
//                                                       └─► FilmPass (LDR) ──► screen
//
// ObjectMotionBlur  per-object motion blur: the nearby aircraft and wreckage (a list the game
//                   hands in, see `heroes`) are drawn again with a velocity material into a
//                   half-res buffer (screen-space velocity from each mesh's own previous world
//                   matrix, so spinning debris and propellers blur too, camera-relative so the
//                   floating origin can't smear them); a tile-max + neighbour-max pair spreads
//                   the blur past the silhouette, then a gather pass blurs the object over the
//                   background (McGuire-style reconstruction, simplified). The shutter is in
//                   seconds of real time: a slow-motion shot blurs less, like a high-speed camera.
// Bokeh             thin-lens depth of field: physical circle of confusion from the focal length
//                   (FOV) and f-stop, a half-res single-pass scatter-as-gather (Gustafsson)
//                   that lets near blur bleed over sharp edges, composited at full res.
// FilmPass          LDR, after the grade: gate weave, halation, spherical lens ghosts + halo from
//                   the bloom buffer (no anamorphic streaks), period grades (Kodachrome, B&W
//                   newsreel, 16 mm gun camera), natural vignette, flicker, 24 fps emulsion grain,
//                   dust and scratches.
//
// Each pass owns its targets and materials and is skipped entirely when its parameter is off,
// so normal play with "Film look: Off" pays nothing. Porting to another renderer (Renderer 2.0,
// WebGPU/TSL): each pass is a function of (input texture, depth, camera) -> texture with plain
// uniforms; the velocity pass needs only "draw these objects with this material" plus each
// mesh's previous world matrix. Hooks in PostFX.render: film.pre() before bloom, film.target()
// as the composite's render target, film.present() after it.

const VEL_LAYER = 7;

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// distance from the camera, from the scene depth (1e5 for the sky)
const depthChunk = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform float uReversed;
float viewDist(vec2 uv) {
  float d = texture2D(tDepth, uv).r;
  bool sky = uReversed > 0.5 ? d <= 0.0 : d >= 1.0;
  if (sky) return 1e5;
  vec3 ndc = vec3(uv * 2.0 - 1.0, uReversed > 0.5 ? max(d, 1e-7) : d * 2.0 - 1.0);
  vec4 vp = uInvProj * vec4(ndc, 1.0);
  return length(vp.xyz / vp.w);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

const depthUniforms = (reversed: boolean) => ({ tDepth: { value: null as THREE.Texture | null }, uInvProj: { value: new THREE.Matrix4() }, uReversed: { value: reversed ? 1 : 0 } });

function rt(w: number, h: number, o: { half?: boolean; depth?: boolean; nearest?: boolean; ldr?: boolean } = {}) {
  const t = new THREE.WebGLRenderTarget(w, h, { type: o.ldr ? THREE.UnsignedByteType : THREE.HalfFloatType, depthBuffer: !!o.depth });
  t.texture.minFilter = t.texture.magFilter = o.nearest ? THREE.NearestFilter : THREE.LinearFilter;
  t.texture.generateMipmaps = false;
  return t;
}

const shader = (uniforms: Record<string, THREE.IUniform>, frag: string) =>
  new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false });

/** Fills `out` with the scene objects that get per-object motion blur this frame. */
export type HeroCollector = (out: THREE.Object3D[], camera: THREE.Camera) => void;

// ---------------------------------------------------------------- per-object motion blur

class ObjectMotionBlur {
  private velRT = rt(1, 1, { depth: true, nearest: true });
  private tileRT = rt(1, 1, { nearest: true });
  private maxRT = rt(1, 1, { nearest: true });
  private outRT = rt(1, 1);
  private quad = new FullScreenQuad();
  private prev = new Map<THREE.Object3D, { m: THREE.Matrix4; f: number }>();
  private seen: THREE.Object3D[] = [];
  private velocityScene = new THREE.Scene();
  private velocityProxies = new WeakMap<THREE.Mesh, THREE.Mesh>();
  private frame = 0;
  private hasPrev = false;
  private prevVP = new THREE.Matrix4();
  private curVP = new THREE.Matrix4();
  private rot = new THREE.Matrix4();
  private prevCam = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private clear = new THREE.Color();
  readonly heroes: THREE.Object3D[] = [];
  /** Objects drawn into the velocity buffer last frame (dev stats). */
  lastCount = 0;
  private velMat: THREE.ShaderMaterial;
  private tileMat: THREE.ShaderMaterial;
  private maxMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;

  constructor(reversed: boolean) {
    this.velMat = new THREE.ShaderMaterial({
      uniforms: {
        uPrevModel: { value: new THREE.Matrix4() }, uCurVP: { value: this.curVP }, uPrevVP: { value: this.prevVP },
        uCamPos: { value: this.camPos }, uPrevCamPos: { value: this.prevCam }, uScale: { value: 1 },
      },
      vertexShader: /* glsl */ `
        uniform mat4 uPrevModel, uCurVP, uPrevVP;
        uniform vec3 uCamPos, uPrevCamPos;
        varying vec4 vCur;
        varying vec4 vPrev;
        varying float vDist;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec4 pp = uPrevModel * vec4(position, 1.0);
          vec3 rel = wp.xyz - uCamPos;
          vCur = uCurVP * vec4(rel, 1.0);
          vPrev = uPrevVP * vec4(pp.xyz - uPrevCamPos, 1.0);
          vDist = length(rel);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uScale;
        varying vec4 vCur;
        varying vec4 vPrev;
        varying float vDist;
        void main() {
          vec2 v = vec2(0.0);
          if (vPrev.w > 1e-3 && vCur.w > 1e-3) v = (vCur.xy / vCur.w - vPrev.xy / vPrev.w) * 0.5 * uScale;
          gl_FragColor = vec4(v, vDist, 1.0);
        }`,
      side: THREE.DoubleSide,
    });
    // per mesh: its own previous world matrix (spinning wreckage, propellers, turrets)
    this.velMat.onBeforeRender = (_r, _s, _c, _g, object) => {
      const e = this.prev.get(object);
      (this.velMat.uniforms.uPrevModel.value as THREE.Matrix4).copy(e && e.f === this.frame - 1 ? e.m : object.matrixWorld);
      this.velMat.uniformsNeedUpdate = true;
      this.seen.push(object);
    };
    // largest velocity in each 8x8 block of the half-res buffer (16x16 screen pixels)
    this.tileMat = shader({ tSrc: { value: null }, uSrcSize: { value: new THREE.Vector2() } }, /* glsl */ `
      uniform sampler2D tSrc; uniform vec2 uSrcSize; varying vec2 vUv;
      void main() {
        vec2 base = floor(gl_FragCoord.xy) * 8.0;
        vec2 best = vec2(0.0); float bl = 0.0;
        for (int j = 0; j < 8; j++) for (int i = 0; i < 8; i++) {
          vec4 v = texture2D(tSrc, (base + vec2(float(i), float(j)) + 0.5) / uSrcSize);
          float l = dot(v.xy, v.xy);
          if (v.w > 0.5 && l > bl) { bl = l; best = v.xy; }
        }
        gl_FragColor = vec4(best, 0.0, 1.0);
      }`);
    this.maxMat = shader({ tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, /* glsl */ `
      uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      void main() {
        vec2 best = vec2(0.0); float bl = 0.0;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 v = texture2D(tSrc, vUv + vec2(float(i), float(j)) * uTexel).xy;
          float l = dot(v, v);
          if (l > bl) { bl = l; best = v; }
        }
        gl_FragColor = vec4(best, 0.0, 1.0);
      }`);
    this.blurMat = shader({ ...depthUniforms(reversed), tColor: { value: null }, tVel: { value: null }, tMax: { value: null }, uRes: { value: new THREE.Vector2() }, uMaxLen: { value: 0.08 } }, /* glsl */ `
      precision highp float;
      uniform sampler2D tColor; uniform sampler2D tVel; uniform sampler2D tMax;
      uniform vec2 uRes; uniform float uMaxLen;
      varying vec2 vUv;
      ${depthChunk}
      // the velocity buffer only counts where its object is the visible surface
      vec4 objVel(vec2 uv) {
        vec4 v = texture2D(tVel, uv);
        if (v.w < 0.5) return vec4(0.0);
        float d = viewDist(uv);
        if (abs(v.z - d) > 0.04 * d + 0.4) return vec4(0.0);
        return v;
      }
      vec2 clampLen(vec2 v) { float l = length(v); return l > uMaxLen ? v * (uMaxLen / l) : v; }
      void main() {
        vec3 c0 = texture2D(tColor, vUv).rgb;
        vec2 vmax = clampLen(texture2D(tMax, vUv).xy);
        vec2 px = vmax * uRes;
        if (dot(px, px) < 0.6) { gl_FragColor = vec4(c0, 1.0); return; }
        const int N = 14;
        float jit = hash12(gl_FragCoord.xy) - 0.5;
        vec4 vc = objVel(vUv);
        vec3 acc = vec3(0.0);
        if (vc.w > 0.5) {
          // on the object: smear it along its own motion (its edges turn translucent)
          vec2 v = clampLen(vc.xy);
          for (int i = 0; i < N; i++) acc += texture2D(tColor, vUv + v * ((float(i) + 0.5 + jit) / float(N) - 0.5)).rgb;
          gl_FragColor = vec4(acc / float(N), 1.0);
          return;
        }
        // beside it: gather the object samples whose own blur reaches this pixel
        float lmax = length(vmax), w = 0.0;
        for (int i = 0; i < N; i++) {
          float t = (float(i) + 0.5 + jit) / float(N) - 0.5;
          vec2 uv = vUv + vmax * t;
          vec4 vs = objVel(uv);
          if (vs.w > 0.5 && abs(t) * lmax <= length(clampLen(vs.xy)) * 0.5 + 1.0 / uRes.y) { acc += texture2D(tColor, uv).rgb; w += 1.0; }
        }
        gl_FragColor = vec4(w > 0.0 ? mix(c0, acc / w, w / float(N)) : c0, 1.0);
      }`);
  }

  get materials() { return [this.velMat, this.tileMat, this.maxMat, this.blurMat]; }

  setSize(w: number, h: number) {
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    this.velRT.setSize(hw, hh);
    this.tileRT.setSize(Math.max(1, Math.ceil(hw / 8)), Math.max(1, Math.ceil(hh / 8)));
    this.maxRT.setSize(Math.max(1, Math.ceil(hw / 8)), Math.max(1, Math.ceil(hh / 8)));
    this.outRT.setSize(w, h);
    this.blurMat.uniforms.uRes.value.set(w, h);
  }

  resetHistory() { this.hasPrev = false; this.prev.clear(); }

  private enable = (o: THREE.Object3D) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return;
    let draw = m;
    if (m.children.length) {
      let proxy = this.velocityProxies.get(m);
      if (!proxy) { proxy = m.clone(false); this.velocityProxies.set(m, proxy); }
      proxy.geometry = m.geometry; proxy.material = m.material; proxy.matrixWorld.copy(m.matrixWorld);
      proxy.onBeforeRender = m.onBeforeRender; proxy.onAfterRender = m.onAfterRender;
      draw = proxy;
    }
    draw.layers.enable(VEL_LAYER); this.velocityScene.children.push(draw);
  };
  private disable = (o: THREE.Object3D) => { o.layers.disable(VEL_LAYER); };

  render(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera, src: THREE.Texture, depth: THREE.Texture,
    shutter: number, realDt: number, collect: HeroCollector | undefined): THREE.Texture {
    this.frame++;
    this.rot.extractRotation(cam.matrixWorld).invert();
    this.curVP.multiplyMatrices(cam.projectionMatrix, this.rot);
    this.camPos.setFromMatrixPosition(cam.matrixWorld);
    if (!this.hasPrev) { this.prevVP.copy(this.curVP); this.prevCam.copy(this.camPos); this.hasPrev = true; }
    const heroes = this.heroes;
    heroes.length = 0;
    collect?.(heroes, cam);
    this.lastCount = 0;
    let out = src;
    if (heroes.length) {
      // The film pass only needs the chosen heroes and the unchanged light slots.
      // Traversing the entire formation again costs CPU even when its layers do not match.
      this.velocityScene.children.length = 0;
      this.velocityScene.matrixWorldAutoUpdate = false;
      this.velocityScene.overrideMaterial = this.velMat;
      for (const o of scene.children) if ((o as THREE.Light).isLight) this.velocityScene.children.push(o);
      for (let i = 0; i < heroes.length; i++) {
        if (heroes[i].userData.submissionCulled) heroes[i].updateMatrixWorld(true);
        heroes[i].traverseVisible(this.enable);
      }
      const prevRT = r.getRenderTarget(), prevAuto = r.shadowMap.autoUpdate, prevOverride = scene.overrideMaterial;
      const prevBg = scene.background, prevMask = cam.layers.mask, prevAlpha = r.getClearAlpha();
      r.getClearColor(this.clear);
      this.velMat.uniforms.uScale.value = Math.min(4, shutter / Math.max(realDt, 1e-3));
      this.seen.length = 0;
      r.setRenderTarget(this.velRT);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, false);
      cam.layers.set(VEL_LAYER);
      scene.overrideMaterial = this.velMat;
      scene.background = null;
      r.shadowMap.autoUpdate = false;
      r.render(this.velocityScene, cam);
      r.shadowMap.autoUpdate = prevAuto;
      scene.overrideMaterial = prevOverride;
      scene.background = prevBg;
      cam.layers.mask = prevMask;
      r.setClearColor(this.clear, prevAlpha);
      for (const o of this.velocityScene.children) if (!(o as THREE.Light).isLight) this.disable(o);
      // remember this frame's matrices
      const seen = this.seen;
      this.lastCount = seen.length;
      for (let i = 0; i < seen.length; i++) {
        const o = seen[i];
        let e = this.prev.get(o);
        if (!e) { e = { m: new THREE.Matrix4(), f: 0 }; this.prev.set(o, e); }
        e.m.copy(o.matrixWorld); e.f = this.frame;
      }
      if (seen.length) {
        this.quad.material = this.tileMat;
        this.tileMat.uniforms.tSrc.value = this.velRT.texture;
        this.tileMat.uniforms.uSrcSize.value.set(this.velRT.width, this.velRT.height);
        r.setRenderTarget(this.tileRT);
        this.quad.render(r);
        this.quad.material = this.maxMat;
        this.maxMat.uniforms.tSrc.value = this.tileRT.texture;
        this.maxMat.uniforms.uTexel.value.set(1 / this.tileRT.width, 1 / this.tileRT.height);
        r.setRenderTarget(this.maxRT);
        this.quad.render(r);
        const u = this.blurMat.uniforms;
        u.tColor.value = src; u.tVel.value = this.velRT.texture; u.tMax.value = this.maxRT.texture;
        u.tDepth.value = depth; u.uInvProj.value.copy(cam.projectionMatrixInverse);
        this.quad.material = this.blurMat;
        r.setRenderTarget(this.outRT);
        this.quad.render(r);
        out = this.outRT.texture;
      }
      r.setRenderTarget(prevRT);
    }
    this.velocityScene.children.length = 0;
    // forget objects not seen for a few seconds (removed aircraft)
    if ((this.frame & 255) === 0) for (const [o, e] of this.prev) if (this.frame - e.f > 240) this.prev.delete(o);
    this.prevVP.copy(this.curVP);
    this.prevCam.copy(this.camPos);
    return out;
  }
}

// ---------------------------------------------------------------- bokeh depth of field

class Bokeh {
  private preRT = rt(1, 1);
  private gatherRT = rt(1, 1);
  private outRT = rt(1, 1);
  private quad = new FullScreenQuad();
  private pre: THREE.ShaderMaterial;
  private gather: THREE.ShaderMaterial;
  private comp: THREE.ShaderMaterial;
  readonly maxCoc = 14;   // half-res px (28 screen px at the render resolution)

  constructor(reversed: boolean) {
    const lens = () => ({ uK: { value: 1 }, uFocus: { value: 100 }, uMaxCoc: { value: this.maxCoc } });
    const cocFn = /* glsl */ `
      uniform float uK; uniform float uFocus; uniform float uMaxCoc;
      float coc(float d) { return clamp(uK * (d - uFocus) / max(d, 1e-3), -uMaxCoc, uMaxCoc); }`;
    this.pre = shader({ ...depthUniforms(reversed), ...lens(), tColor: { value: null }, uTexel: { value: new THREE.Vector2() } }, /* glsl */ `
      precision highp float;
      uniform sampler2D tColor; uniform vec2 uTexel; varying vec2 vUv;
      ${depthChunk}
      ${cocFn}
      void main() {
        vec2 o = uTexel * 0.5;
        vec3 c = texture2D(tColor, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tColor, vUv + vec2(o.x, -o.y)).rgb
               + texture2D(tColor, vUv + vec2(-o.x, o.y)).rgb + texture2D(tColor, vUv + vec2(o.x, o.y)).rgb;
        // nearest of the 2x2 footprint, so a thin foreground edge (a gun barrel) keeps its blur
        float d = min(min(viewDist(vUv + vec2(-o.x, -o.y)), viewDist(vUv + vec2(o.x, o.y))), viewDist(vUv));
        gl_FragColor = vec4(min(c * 0.25, vec3(64.0)), coc(d));
      }`);
    // Scatter-as-gather on a golden-angle spiral (D. Gustafsson, "Bokeh depth of field in a single pass")
    this.gather = shader({ tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uMaxCoc: { value: this.maxCoc } }, /* glsl */ `
      precision highp float;
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uMaxCoc; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tSrc, vUv);
        float cc = c.a, cs = abs(cc);
        vec3 col = c.rgb; float tot = 1.0, nearCov = 0.0;
        float radius = 1.0, ang = 0.0;
        for (int i = 0; i < 160; i++) {
          if (radius >= uMaxCoc) break;
          vec4 s = texture2D(tSrc, vUv + vec2(cos(ang), sin(ang)) * uTexel * radius);
          float ss = abs(s.a);
          // a sample behind the centre can't blur over it by more than the centre's own blur
          if (s.a > cc) ss = min(ss, cs * 2.0);
          float m = smoothstep(radius - 0.5, radius + 0.5, ss);
          col += mix(col / tot, s.rgb, m);
          tot += 1.0;
          if (s.a < -0.5 && s.a < cc) nearCov = max(nearCov, m * ss);
          ang += 2.39996323;
          radius += 1.0 / radius;
        }
        gl_FragColor = vec4(col / tot, max(cs, nearCov));
      }`);
    this.comp = shader({ ...depthUniforms(reversed), ...lens(), tColor: { value: null }, tBokeh: { value: null } }, /* glsl */ `
      precision highp float;
      uniform sampler2D tColor; uniform sampler2D tBokeh; varying vec2 vUv;
      ${depthChunk}
      ${cocFn}
      void main() {
        vec3 sharp = texture2D(tColor, vUv).rgb;
        vec4 b = texture2D(tBokeh, vUv);
        float a = smoothstep(0.45, 1.4, max(abs(coc(viewDist(vUv))), b.a));
        gl_FragColor = vec4(mix(sharp, b.rgb, a), 1.0);
      }`);
  }

  get materials() { return [this.pre, this.gather, this.comp]; }

  setSize(w: number, h: number) {
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    this.preRT.setSize(hw, hh);
    this.gatherRT.setSize(hw, hh);
    this.outRT.setSize(w, h);
  }

  private lens(m: THREE.ShaderMaterial, k: number, focus: number, depth: THREE.Texture, cam: THREE.PerspectiveCamera) {
    const u = m.uniforms;
    u.uK.value = k; u.uFocus.value = focus;
    u.tDepth.value = depth; u.uInvProj.value.copy(cam.projectionMatrixInverse);
  }

  render(r: THREE.WebGLRenderer, cam: THREE.PerspectiveCamera, src: THREE.Texture, depth: THREE.Texture, w: number, h: number,
    focus: number, fStop: number, artistic: number): THREE.Texture {
    const k = cocScalePx(cam.getEffectiveFOV(), focus, fStop, h * 0.5, artistic);
    this.lens(this.pre, k, focus, depth, cam);
    this.lens(this.comp, k, focus, depth, cam);
    const prevRT = r.getRenderTarget();
    this.pre.uniforms.tColor.value = src;
    this.pre.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.quad.material = this.pre;
    r.setRenderTarget(this.preRT);
    this.quad.render(r);
    this.gather.uniforms.tSrc.value = this.preRT.texture;
    this.gather.uniforms.uTexel.value.set(1 / this.preRT.width, 1 / this.preRT.height);
    this.quad.material = this.gather;
    r.setRenderTarget(this.gatherRT);
    this.quad.render(r);
    this.comp.uniforms.tColor.value = src;
    this.comp.uniforms.tBokeh.value = this.gatherRT.texture;
    this.quad.material = this.comp;
    r.setRenderTarget(this.outRT);
    this.quad.render(r);
    r.setRenderTarget(prevRT);
    return this.outRT.texture;
  }
}

// ---------------------------------------------------------------- film pass (LDR)

const filmFrag = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform sampler2D tBloom;
uniform vec2 uRes;
uniform float uAspect;
uniform float uFrame;      // 24 fps film frame index
uniform vec2 uWeave;       // gate weave offset (uv)
uniform float uWeaveRot;
uniform float uOverscan;
uniform float uGrain, uGrainSize, uHalation, uGhosts, uVignette, uFlicker, uDust, uSoft, uExposure, uGradeMix;
uniform int uGrade;        // 0 none, 1 Kodachrome, 2 newsreel, 3 gun camera
varying vec2 vUv;

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// smooth value noise for grain clumps
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  // gate weave: the frame drifts and turns a hair in the gate (a small overscan hides the edge)
  vec2 c = (vUv - 0.5) * vec2(uAspect, 1.0);
  float cs = cos(uWeaveRot), sn = sin(uWeaveRot);
  c = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) / vec2(uAspect, 1.0);
  vec2 uv = 0.5 + c * uOverscan + uWeave;

  vec3 col = pow(texture2D(tSrc, uv).rgb, vec3(2.2));
  if (uSoft > 0.0) {
    // 16 mm optics: a soft halo round every edge
    vec2 o = 1.6 / uRes;
    vec3 s = pow(texture2D(tSrc, uv + vec2(o.x, o.y)).rgb, vec3(2.2)) + pow(texture2D(tSrc, uv + vec2(-o.x, o.y)).rgb, vec3(2.2))
           + pow(texture2D(tSrc, uv + vec2(o.x, -o.y)).rgb, vec3(2.2)) + pow(texture2D(tSrc, uv + vec2(-o.x, -o.y)).rgb, vec3(2.2));
    col = mix(col, s * 0.25, uSoft * 0.7);
  }
  vec3 bloom = texture2D(tBloom, uv).rgb;
  // halation: light scattering back off the film base, a red-orange fringe round highlights
  vec3 halTint = uGrade >= 2 ? vec3(1.0) : vec3(1.0, 0.3, 0.1);
  col += (1.0 - exp(-bloom * 0.7)) * halTint * uHalation;
  // spherical lens ghosts mirrored through the centre, and a halo ring (no anamorphic streaks)
  if (uGhosts > 0.0) {
    vec2 toC = vec2(0.5) - uv;
    vec3 gh = vec3(0.0);
    float k[4] = float[4](0.55, 1.0, 1.42, 1.9);
    vec3 tint[4] = vec3[4](vec3(1.0, 0.75, 0.45), vec3(0.55, 0.85, 1.0), vec3(0.75, 1.0, 0.7), vec3(1.0, 0.6, 0.85));
    for (int i = 0; i < 4; i++) {
      vec2 gp = uv + toC * 2.0 * k[i];
      float wgt = pow(max(0.0, 1.0 - length((gp - 0.5) * vec2(uAspect, 1.0)) / 0.8), 3.0);
      gh += texture2D(tBloom, gp).rgb * tint[i] * wgt;
    }
    vec2 hp = uv + normalize(toC + 1e-6) * 0.34;
    float hw = pow(max(0.0, 1.0 - length((hp - 0.5) * vec2(uAspect, 1.0)) / 0.75), 4.0);
    gh += texture2D(tBloom, hp).rgb * vec3(0.7, 0.85, 1.0) * hw * 0.22;
    col += (1.0 - exp(-gh * 0.35)) * uGhosts * 0.35;
  }
  // exposure and per-frame flicker (uneven shutter, voltage on the camera motor)
  float flick = (hash11(uFrame * 1.37 + 0.11) - 0.5) * 2.0 * uFlicker;
  col *= exp2(uExposure + flick);

  // period grades
  vec3 g = col;
  if (uGrade == 1) {
    // Kodachrome: dense, saturated reds and yellows, deep cyan-blue skies, warm highlights
    g = mat3(1.16, -0.05, -0.04,  -0.10, 1.08, -0.10,  -0.06, -0.03, 1.14) * col;
    float l = luma(g);
    g = max(mix(vec3(l), g, 1.22), 0.0) * vec3(1.04, 1.0, 0.93);
  } else if (uGrade == 2) {
    // newsreel: panchromatic B&W, a slightly warm silver
    float l = dot(col, vec3(0.30, 0.59, 0.11));
    g = vec3(l) * vec3(1.0, 0.985, 0.95);
  } else if (uGrade == 3) {
    // gun camera: B&W, reds dark (orthochromatic leaning), aged towards sepia
    float l = dot(col, vec3(0.22, 0.66, 0.12)) * 1.1;
    g = vec3(l) * vec3(1.03, 0.97, 0.86);
  }
  col = mix(col, g, uGradeMix);
  // natural vignette: cos^4 falloff (a mechanical gate edge for the gun camera)
  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
  float r2 = dot(q, q);
  col *= 1.0 / pow(1.0 + r2 * uVignette * 1.5, 2.0);
  if (uGrade == 3) col *= smoothstep(0.98, 0.62, length((vUv - 0.5) * vec2(uAspect * 0.72, 1.0)) * 1.25);

  vec3 d = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  if (uGrade >= 2) d = mix(d, d * d * (3.0 - 2.0 * d), uGrade == 3 ? 0.75 : 0.45);
  else if (uGrade == 1) d = mix(d, d * d * (3.0 - 2.0 * d), 0.3);

  // emulsion grain: a new pattern every film frame, clumped, strongest in the mid-tones
  if (uGrain > 0.0) {
    vec2 gp = gl_FragCoord.xy / max(uGrainSize, 0.5) + vec2(uFrame * 37.0, uFrame * 17.0);
    float n = vnoise(gp) * 0.6 + hash12(floor(gp * 1.7)) * 0.4 - 0.5;
    float l = luma(d);
    float w = 0.3 + 2.8 * l * (1.0 - l);
    if (uGrade >= 2) d += n * uGrain * w;
    else d += vec3(n, vnoise(gp + 19.7) * 0.6 + hash12(floor(gp * 1.7) + 7.0) * 0.4 - 0.5, n) * uGrain * w;
  }
  // dust specks (white: dirt on the negative) and a running scratch
  if (uDust > 0.0) {
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      if (hash11(uFrame * 3.17 + fi * 7.1) > uDust) continue;
      vec2 p = vec2(hash11(uFrame * 1.31 + fi * 11.3), hash11(uFrame * 2.71 + fi * 5.9));
      float rad = (0.8 + 3.5 * hash11(uFrame * 0.73 + fi)) * uRes.y / 1080.0;
      float dd = length((vUv - p) * uRes) / rad;
      float tone = hash11(fi + uFrame) < 0.7 ? 0.95 : 0.06;
      d = mix(d, vec3(tone), smoothstep(1.0, 0.3, dd) * 0.75);
    }
    float sf = floor(uFrame / 7.0);
    if (hash11(sf * 2.73) < uDust * 0.7) {
      float sx = 0.08 + 0.84 * hash11(sf * 5.31) + 0.0015 * sin(vUv.y * 23.0 + uFrame * 0.7);
      float dx = abs(vUv.x - sx) * uRes.x;
      d = mix(d, vec3(0.85), smoothstep(1.3, 0.0, dx) * 0.3 * (0.6 + 0.4 * sin(vUv.y * 9.0 + sf)));
    }
  }
  gl_FragColor = vec4(clamp(d, 0.0, 1.0), 1.0);
}
`;

class FilmPass {
  readonly target = rt(1, 1, { ldr: true });
  private quad: FullScreenQuad;
  private mat: THREE.ShaderMaterial;
  private frame = -1;
  private wx = 0; private wy = 0; private wr = 0;
  private seed = 1;

  constructor() {
    this.mat = shader({
      tSrc: { value: this.target.texture }, tBloom: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uAspect: { value: 1 },
      uFrame: { value: 0 }, uWeave: { value: new THREE.Vector2() }, uWeaveRot: { value: 0 }, uOverscan: { value: 1 },
      uGrain: { value: 0 }, uGrainSize: { value: 1.5 }, uHalation: { value: 0 }, uGhosts: { value: 0 }, uVignette: { value: 0 },
      uFlicker: { value: 0 }, uDust: { value: 0 }, uSoft: { value: 0 }, uExposure: { value: 0 }, uGradeMix: { value: 1 }, uGrade: { value: 0 },
    }, filmFrag);
    this.quad = new FullScreenQuad(this.mat);
  }

  get material() { return this.mat; }

  setSize(w: number, h: number) {
    this.target.setSize(w, h);
    this.mat.uniforms.uRes.value.set(w, h);
    this.mat.uniforms.uAspect.value = w / Math.max(1, h);
  }

  private rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647 - 0.5; }

  render(r: THREE.WebGLRenderer, p: FilmParams, bloom: THREE.Texture, time: number) {
    const u = this.mat.uniforms, h = this.target.height;
    const f = Math.floor(time * 24);
    if (f !== this.frame) {
      this.frame = f;
      // weave: a damped random walk per film frame
      this.wx = this.wx * 0.55 + this.rnd() * 0.9;
      this.wy = this.wy * 0.55 + this.rnd() * 0.9;
      this.wr = this.wr * 0.6 + this.rnd() * 0.8;
    }
    const px = p.weave * (h / 1080);
    u.uWeave.value.set((this.wx * px) / Math.max(1, this.target.width), (this.wy * px) / Math.max(1, h));
    u.uWeaveRot.value = this.wr * 0.0005 * p.weave;
    u.uOverscan.value = 1 - Math.min(0.02, (px * 2.4) / Math.max(1, h));
    u.uFrame.value = f % 4096;
    u.tBloom.value = bloom;
    u.uGrain.value = p.grain; u.uGrainSize.value = p.grainSize * (h / 1080);
    u.uHalation.value = p.halation; u.uGhosts.value = p.ghosts; u.uVignette.value = p.vignette;
    u.uFlicker.value = p.flicker; u.uDust.value = p.dust; u.uSoft.value = p.soft; u.uExposure.value = p.exposure;
    u.uGradeMix.value = p.gradeMix;
    u.uGrade.value = p.grade === 'kodachrome' ? 1 : p.grade === 'newsreel' ? 2 : p.grade === 'gunCamera' ? 3 : 0;
    r.setRenderTarget(null);
    this.quad.render(r);
  }
}

// ---------------------------------------------------------------- orchestration

export class FilmLook {
  /** The player's look in play (Settings "Film look"; goal 12's Cinematic preset). */
  look: FilmParams = LOOK_PRESETS.off;
  lookName: FilmLookSetting = 'off';
  private preset = 'high';
  private setting: string | undefined;
  private readonly flags = { calm: false, economy: false };
  /** A cinematic camera's look while it runs (null in play). */
  shot: FilmParams | null = null;
  shotName: ShotLook | null = null;
  /** Focus distance asked for by the camera (m; NaN = the look's own). Pulled smoothly. */
  focusTarget = NaN;
  /** Objects that get per-object motion blur (set by Cinematics; Theatre swaps its own in). */
  heroes: HeroCollector | undefined;
  /** This frame's resolved parameters (read-only outside). */
  readonly p: FilmParams = { ...LOOK_PRESETS.off };
  private focusNow = 100;
  private focusSnap = true;
  private motion: ObjectMotionBlur;
  private bokeh: Bokeh;
  private pass = new FilmPass();
  private w = 1; private h = 1;

  constructor(reversed: boolean) {
    this.motion = new ObjectMotionBlur(reversed);
    this.bokeh = new Bokeh(reversed);
  }

  setPreset(quality: string) { this.preset = quality; this.setLook(this.setting); }
  setLook(name?: string) { this.setting = name; this.lookName = presetFilmLook(this.preset, name); this.look = LOOK_PRESETS[this.lookName]; }

  /** Compile every pass's program up front (no hitch on the first cinematic). */
  prewarm(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera) {
    const tmp = rt(1, 1), quad = new FullScreenQuad(), prev = r.getRenderTarget();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.motion.materials[0]);
    mesh.frustumCulled = false;
    try {
      r.setRenderTarget(tmp);
      for (const m of [...this.motion.materials.slice(1), ...this.bokeh.materials, this.pass.material]) { quad.material = m; quad.render(r); }
      // Match the actual velocity pass's HDR target and the complete world's light counts.
      // Compiling against the canvas instead creates an unused output-colour variant.
      scene.add(mesh);
      r.compile(scene, cam);
    } finally {
      scene.remove(mesh); mesh.geometry.dispose();
      r.setRenderTarget(prev); tmp.dispose(); quad.dispose();
    }
  }

  setShot(name: ShotLook | null, focus = NaN) {
    if (name !== this.shotName) this.focusSnap = true;
    this.shotName = name;
    this.shot = name ? SHOT_PRESETS[name] : null;
    this.focusTarget = focus;
  }

  get objectsBlurred() { return this.motion.lastCount; }

  setSize(w: number, h: number) {
    this.w = w; this.h = h;
    this.motion.setSize(w, h);
    this.bokeh.setSize(w, h);
    this.pass.setSize(w, h);
  }

  resetHistory() { this.motion.resetHistory(); this.focusSnap = true; }

  /** Resolve this frame's parameters (PostFX.render, before anything is drawn). */
  resolve(economy: boolean): FilmParams {
    this.flags.calm = access.prefs.reduceMotion; this.flags.economy = economy;
    const p = resolveFilm(this.p, this.look, this.shot, this.flags);
    if (Number.isFinite(this.focusTarget)) p.focus = this.focusTarget;
    return p;
  }

  /** Per-object motion blur and depth of field on the HDR scene; returns the texture to composite. */
  pre(r: THREE.WebGLRenderer, scene: THREE.Scene | undefined, cam: THREE.PerspectiveCamera, src: THREE.Texture,
    depth: THREE.Texture, dt: number): THREE.Texture {
    const p = this.p;
    let out = src;
    if (p.objectBlur > 0 && scene) out = this.motion.render(r, scene, cam, out, depth, p.objectBlur, dt, this.heroes);
    else this.motion.resetHistory();
    if (p.dof) {
      // focus pull: eases in log space (a focus puller racks quickly near, slowly far)
      const want = Math.max(0.5, p.focus);
      if (this.focusSnap) this.focusNow = want;
      else this.focusNow = Math.exp(THREE.MathUtils.lerp(Math.log(this.focusNow), Math.log(want), 1 - Math.exp(-dt * 7)));
      this.focusSnap = false;
      out = this.bokeh.render(r, cam, out, depth, this.w, this.h, this.focusNow, p.fStop, p.cocScale);
    }
    return out;
  }

  /** Where PostFX's composite draws: the film pass's input, or null (the screen). */
  target(): THREE.WebGLRenderTarget | null { return this.p.on ? this.pass.target : null; }

  /** The film pass to the screen (only when target() was used). */
  present(r: THREE.WebGLRenderer, bloom: THREE.Texture, time: number) {
    if (this.p.on) this.pass.render(r, this.p, bloom, time);
  }
}
