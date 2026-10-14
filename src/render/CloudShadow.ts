import * as THREE from 'three';

// Shared spatial cloud shadows for standard/physical skins. Installed through the
// existing clone-safe SurfaceDetail hook and compiled by World.prewarm.
export const cloudShadowUniforms = {
  tCloudShadow: { value: null as THREE.Texture | null },
  uCloudShadowBox: { value: new THREE.Vector3(0, 0, 1) },
  uCloudShadowLayers: { value: new THREE.Vector4(3900, 5900, 8900, 10900) },
  uCloudSun: { value: new THREE.Vector3(0, 1, 0) },
  uCloudShadowOn: { value: 0 },
};
const shadowGLSL = /* glsl */ `
uniform sampler2D tCloudShadow;
uniform vec3 uCloudShadowBox, uCloudSun;
uniform vec4 uCloudShadowLayers;
uniform float uCloudShadowOn;
float cloudLayerShadow(vec3 p, float base, float top, float channel) {
  if (p.y >= top) return 1.0;
  vec2 q = p.xz + uCloudSun.xz * ((base - p.y) / max(uCloudSun.y, 0.05));
  vec2 uv = (q - uCloudShadowBox.xy) / uCloudShadowBox.z + 0.5;
  float edge = 1.0 - smoothstep(0.4, 0.49, max(abs(uv.x - 0.5), abs(uv.y - 0.5)));
  vec2 shadow = texture2D(tCloudShadow, uv).rg;
  return mix(1.0, mix(shadow.r, shadow.g, channel), edge * (1.0 - smoothstep(base, top, p.y)));
}
float spatialCloudShadow() {
  if (uCloudShadowOn < 0.5) return 1.0;
  // Inverse view rotation without another varying or per-object CPU uniform.
  vec3 v = -vViewPosition;
  vec3 p = cameraPosition + vec3(dot(viewMatrix[0].xyz, v), dot(viewMatrix[1].xyz, v), dot(viewMatrix[2].xyz, v));
  float shadow = cloudLayerShadow(p, uCloudShadowLayers.x, uCloudShadowLayers.y, 1.0)
               * cloudLayerShadow(p, uCloudShadowLayers.z, uCloudShadowLayers.w, 0.0);
  return 0.35 + 0.65 * shadow;
}
`;
export function patchCloudShadow(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, cloudShadowUniforms);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + shadowGLSL)
    .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
      'getDirectionalLightInfo( directionalLight, directLight );',
      'getDirectionalLightInfo( directionalLight, directLight );\n directLight.color *= spatialCloudShadow();'));
}
