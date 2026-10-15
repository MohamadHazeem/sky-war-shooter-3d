import * as THREE from 'three';
import { Atmos, atmosUniforms } from './Atmosphere';
import { targetUniforms, TGT_PLUMES } from './TargetGround';
import { farTerrainUniforms } from './FarTerrain';

// The sky-ground plume is naturally hidden by the deck. These sparse, soft billboards carry
// its upper portion through/above the low layer in the transparent pass. Same impact clocks,
// wind and growth as TargetGround; no particles, random sampling or allocations per frame.
export const SMOKE_CEILING = 7400;
export const smokeHeight = (age: number) => SMOKE_CEILING * (1 - Math.exp(-Math.max(0, age) / 45)) + 80;
const uniforms = { ...atmosUniforms, ...targetUniforms,
  uSmokeOrigin: { value: Atmos.originOffset },
  uSmokeDeck: { value: Atmos.lowTop }, uSmokeQuality: farTerrainUniforms.uFarQuality,
};
const geometry = new THREE.PlaneGeometry(1, 1);
const material = new THREE.ShaderMaterial({
  uniforms,
  transparent: true, depthWrite: false,
  vertexShader: /* glsl */ `
    uniform vec4 uTgt, uPlumes[${TGT_PLUMES}];
    uniform vec2 uTgtWind;
    uniform vec3 uSmokeOrigin;
    uniform float uTgtClock, uSmokeDeck, uSmokeQuality;
    varying vec2 vUv;
    varying float vFade, vHeight, vSeed, vAge;
    void main() {
      int column = gl_InstanceID / 8;
      int puff = gl_InstanceID - column * 8;
      vec4 P = uPlumes[column];
      float age = max(0.0, uTgtClock - P.z);
      float top = ${SMOKE_CEILING}.0 * (1.0 - exp(-age / 45.0)) + 80.0;
      float y = top * (0.12 + float(puff) * 0.115);
      float width = 70.0 + y * 0.085;
      float seed = float(column) * 7.13 + float(puff) * 2.71;
      vec2 drift = uTgtWind * min(y / 16.0, age);
      drift += vec2(sin(seed + age * 0.023), cos(seed * 1.7 + age * 0.019)) * width * 0.24;
      vec3 centre = vec3(uTgt.x + P.x + drift.x, y, uTgt.y + P.y + drift.y) - uSmokeOrigin;
      vec4 view = viewMatrix * vec4(centre, 1.0);
      view.xy += position.xy * vec2(width * 3.2, max(top * 0.22, width * 2.2));
      gl_Position = projectionMatrix * view;
      vUv = uv; vSeed = seed; vAge = age;
      // Fade through the upper half of the deck. Hidden below its base, no floating smoke caps.
      vFade = P.w * uTgt.w * smoothstep(0.0, 5.0, age) * smoothstep(uSmokeDeck - 1000.0, uSmokeDeck + 100.0, y);
      if (uSmokeQuality < 1.5 && puff - (puff / 2) * 2 == 1) vFade = 0.0;
      if (vFade <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vHeight = y / ${SMOKE_CEILING}.0;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uHorizon, uSunColor;
    varying vec2 vUv;
    varying float vFade, vHeight, vSeed, vAge;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y);
    }
    void main() {
      vec2 q = (vUv - 0.5) * 2.0;
      vec2 flow = q * 3.4 + vec2(vSeed, -vAge * 0.035);
      float n = noise(flow) * 0.6 + noise(flow * 2.07) * 0.28 + noise(flow * 4.13) * 0.12;
      float edge = 1.0 - smoothstep(0.35, 1.0, length(q) + (n - 0.5) * 0.38);
      float density = edge * (0.5 + n * 0.7);
      float alpha = (1.0 - exp(-density * 1.2)) * vFade * 0.72;
      if (alpha < 0.003) discard;
      // Soot-dark core, lit rolling edges; no repeated smooth discs or orange smoke caps.
      vec3 soot = mix(vec3(0.025, 0.023, 0.021), vec3(0.14, 0.13, 0.115), n * n);
      vec3 smoke = soot * uSunColor * (0.20 + 0.13 * vHeight);
      gl_FragColor = vec4(mix(smoke, uHorizon * 0.5, 0.12 + vHeight * 0.08), alpha);
    }`,
});
export function createTargetSmoke(): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, TGT_PLUMES * 8);
  mesh.name = 'target_cloud_smoke';
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}
export function syncTargetSmoke() { uniforms.uSmokeDeck.value = Atmos.lowTop; }
export function warmTargetSmoke(scene: THREE.Scene): () => void {
  const mesh = createTargetSmoke();
  scene.add(mesh);
  return () => { scene.remove(mesh); mesh.dispose(); };
}
