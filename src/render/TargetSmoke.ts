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
    varying float vFade, vHeight;
    void main() {
      int column = gl_InstanceID / 6;
      int puff = gl_InstanceID - column * 6;
      vec4 P = uPlumes[column];
      float age = max(0.0, uTgtClock - P.z);
      float top = ${SMOKE_CEILING}.0 * (1.0 - exp(-age / 45.0)) + 80.0;
      float y = top * (0.44 + float(puff) * 0.1);
      float width = 95.0 + y * 0.14;
      vec2 drift = uTgtWind * min(y / 16.0, age);
      vec3 centre = vec3(uTgt.x + P.x + drift.x, y, uTgt.y + P.y + drift.y) - uSmokeOrigin;
      vec4 view = viewMatrix * vec4(centre, 1.0);
      view.xy += position.xy * vec2(width * 2.7, max(top * 0.3, width * 2.0));
      gl_Position = projectionMatrix * view;
      vUv = uv;
      // Fade through the upper half of the deck. Hidden below its base, no floating smoke caps.
      vFade = P.w * uTgt.w * smoothstep(0.0, 5.0, age) * smoothstep(uSmokeDeck - 1000.0, uSmokeDeck + 100.0, y);
      if (uSmokeQuality < 0.5 || (uSmokeQuality < 1.5 && puff - (puff / 2) * 2 == 1)) vFade = 0.0;
      vHeight = y / ${SMOKE_CEILING}.0;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uHorizon, uSunColor;
    varying vec2 vUv;
    varying float vFade, vHeight;
    void main() {
      vec2 q = (vUv - 0.5) * 2.0;
      float r = dot(q, q);
      float shape = max(0.0, 1.0 - r);
      float lobes = 0.82 + 0.18 * sin(q.x * 13.0 + sin(q.y * 11.0));
      float alpha = shape * shape * lobes * vFade * 0.48;
      if (alpha < 0.003) discard;
      vec3 smoke = mix(vec3(0.035, 0.033, 0.03), vec3(0.14, 0.135, 0.13), vHeight) * uSunColor * 0.25;
      gl_FragColor = vec4(mix(smoke, uHorizon * 0.55, 0.2), alpha);
    }`,
});
export function createTargetSmoke(): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, TGT_PLUMES * 6);
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
