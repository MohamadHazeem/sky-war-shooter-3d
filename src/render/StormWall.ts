import * as THREE from 'three';
import { atmosUniforms, skyGLSL } from './Atmosphere';

// A storm front seen coming (Weather.ts fronts): a wall of cumulonimbus on the horizon ahead,
// dark flanks, sunlit turrets and an anvil on top, grey rain shafts under its base, lightning
// flickering inside. It closes in over the last minute and a half before the front arrives and
// melts into the real volumetric storm as the cloud cover ramps up.
//
// One curved strip of 97 x 2 vertices, built in the vertex shader around the camera: it sits
// at most GEOM_MAX away (inside the far plane and the clouds' march range) but is scaled in
// height to subtend the angle it would at its true distance. It is drawn in the opaque pass
// right after the sky dome (renderOrder 1001: the dome writes no depth and draws last of the
// opaques, so a wall drawn before it is painted over) with alpha blending and no depth write, so to the
// cloud pass it is sky: the volumetric clouds in front draw over it, and aircraft always do.
// Always in the scene (compiled with the first frame); with uFade = 0 every vertex is clipped.

const GEOM_MAX = 14000;   // m

export class StormWall {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    ...atmosUniforms,
    uCam: { value: new THREE.Vector3() },
    uDir: { value: new THREE.Vector2(0, 1) },   // horizontal direction to the front's centre (unit, x/z)
    uD: { value: 40000 },                       // true distance (m)
    uDg: { value: GEOM_MAX },                   // geometric distance (m)
    uSpan: { value: 1.25 },                     // half-width of the arc (rad)
    uBase: { value: 4600 },                     // cloud base / top (m)
    uTop: { value: 13000 },
    uFade: { value: 0 },
    uFlash: { value: 0 },                       // lightning inside the wall (0..1)
    uFlashAt: { value: 0 },                     // where along the wall it flickers (-1..1)
    uTime: { value: 0 },
  };

  constructor() {
    const geo = new THREE.PlaneGeometry(2, 1, 96, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        uniform vec3 uCam;
        uniform vec2 uDir;
        uniform float uD, uDg, uSpan, uBase, uTop, uFade;
        varying vec2 vWall;   // x: lateral position along the wall at its true distance (m), y: altitude (m)
        varying float vU;
        varying vec3 vWorld;
        void main() {
          if (uFade <= 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
          float u = uv.x * 2.0 - 1.0;
          float a = u * uSpan;
          float c = cos(a), s = sin(a);
          vec2 d = vec2(uDir.x * c - uDir.y * s, uDir.x * s + uDir.y * c);
          // the arc curves away toward its ends (a front is a line, not a ring around us)
          float dist = uD / max(cos(a * 0.8), 0.35);
          float dg = min(uDg, dist);
          float alt = mix(uBase - 2200.0, uTop + 900.0, uv.y);
          vec3 wp = vec3(uCam.x + d.x * dg, uCam.y + (alt - uCam.y) * dg / dist, uCam.z + d.y * dg);
          vWall = vec2(u * uSpan * uD, alt);
          vU = u;
          vWorld = wp;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        ${skyGLSL}
        uniform float uD, uBase, uTop, uFade, uFlash, uFlashAt, uTime, uHaze, uSpan;
        varying vec2 vWall;
        varying float vU;
        varying vec3 vWorld;

        float h2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float vn(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 w = f * f * (3.0 - 2.0 * f);
          return mix(mix(h2(i), h2(i + vec2(1, 0)), w.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), w.x), w.y);
        }
        float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
        float fbm3(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * vn(p); p = p * 2.07 + 9.3; a *= 0.5; } return s; }

        void main() {
          float x = vWall.x, alt = vWall.y;
          float H = uTop - uBase;
          // skyline: big storm cells, smaller turrets on them, and an anvil shelf spreading at the top
          float cells = fbm3(vec2(x / 11000.0, 1.7));
          float tur = fbm3(vec2(x / 2600.0, 5.3));
          float top = uBase + H * (0.42 + 0.5 * cells + 0.16 * tur);
          float anvil = smoothstep(0.55, 0.75, cells);
          top = mix(top, uTop - 300.0 * tur, anvil * 0.85);
          // billowed edge: the outline wobbles with finer noise
          float wob = (fbm(vec2(x / 650.0, alt / 650.0)) - 0.5) * 900.0;
          float body = smoothstep(top + 250.0, top - 450.0, alt + wob);
          // cauliflower relief, lit from the sun side and from above
          vec2 q = vec2(x, alt) / 1500.0;
          vec2 warp = vec2(fbm3(q * 0.6 + 3.0), fbm3(q * 0.6 - 5.0));
          float n = fbm(q + warp * 1.6);
          float nUp = fbm(q + warp * 1.6 + vec2(0.0, 0.18));
          float relief = clamp(0.5 + (n - nUp) * 3.5, 0.0, 1.0);
          float h = clamp((alt - uBase) / H, 0.0, 1.0);
          float sunUp = max(uSunDir.y, 0.12);
          // the face toward us is sunlit when the sun is behind the viewer, in shadow against it
          vec3 V0 = normalize(vWorld - cameraPosition);
          float facing = 0.3 + 0.7 * max(dot(normalize(-V0.xz + 1e-5), normalize(uSunDir.xz + 1e-5)), 0.0);
          vec3 sunC = uSunColor * (0.02 + 0.2 * h * h + 0.1 * anvil * h) * (0.3 + 1.1 * relief) * sunUp * facing;
          vec3 amb = mix(uHorizon * 0.09 + uGround * 0.15, uZenith * 0.35 + uHorizon * 0.18, h) * (0.5 + 0.6 * n);
          vec3 col = sunC + amb;
          // rain shafts under the base: grey streaks hanging down to the cloud sea
          float below = smoothstep(uBase + 300.0, uBase - 2000.0, alt);
          float shafts = smoothstep(0.42, 0.7, fbm3(vec2(x / 900.0 + alt / 9000.0, 0.5 + uTime * 0.01)));
          float rainA = (1.0 - smoothstep(0.55, 1.0, below)) * shafts * 0.65;
          float a = max(body * (1.0 - below), rainA * below);
          col = mix(col, uHorizon * 0.35 + uZenith * 0.2, below * 0.6);
          // lightning flickering through the towers
          float fu = (vU - uFlashAt) * 6.0;
          float fl = exp(-fu * fu) * smoothstep(0.3, 0.75, n) * (1.0 - below * 0.7);
          col += vec3(0.75, 0.82, 1.0) * uFlash * fl * 2.5;
          // distance haze (the composite adds none: to the cloud pass this is sky)
          vec3 V = normalize(vWorld - cameraPosition);
          float hz = 1.0 - exp(-uD / (85000.0 * uHaze));
          col = mix(col, skyRadiance(V), hz * 0.85);
          // ends of the arc fade out
          a *= uFade * (1.0 - smoothstep(0.7, 1.0, abs(vU)));
          if (a < 0.003) discard;
          gl_FragColor = vec4(col, a);
        }`,
      depthWrite: false,
      depthTest: true,
      transparent: false,   // stays in the opaque pass (Engine.sortLayers), so it is drawn before the clouds
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1001;   // right after the sky dome (Sky.ts draws it last of the opaques, at 1000)
    this.mesh.userData.noRebase = true;
    this.mesh.name = 'storm-wall';
  }
}
