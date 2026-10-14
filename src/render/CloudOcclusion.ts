import * as THREE from 'three';

// Transparent pass consumers share the resolved transmittance and representative cloud
// distance. No extra targets/pass; Low disables cloud-buffer sampling.
export const cloudOcclusionUniforms = {
  tCloudVeil: { value: null as THREE.Texture | null },
  tCloudDistance: { value: null as THREE.Texture | null },
  uCloudScreen: { value: new THREE.Vector2(1, 1) },
  uCloudVeilOn: { value: 0 },
};
export const cloudOcclusionGLSL = /* glsl */ `
uniform sampler2D tCloudVeil, tCloudDistance;
uniform vec2 uCloudScreen;
uniform float uCloudVeilOn;
float cloudVisibility(float distanceM) {
  if (uCloudVeilOn < 0.5) return 1.0;
  vec2 uv = gl_FragCoord.xy / uCloudScreen;
  vec2 depth = texture2D(tCloudDistance, uv).rg;
  if (depth.y > 0.5) return 1.0;
  float through = smoothstep(depth.x * 500.0, max(1.0, depth.x * 1500.0), distanceM);
  return mix(1.0, texture2D(tCloudVeil, uv).a, through);
}
`;
