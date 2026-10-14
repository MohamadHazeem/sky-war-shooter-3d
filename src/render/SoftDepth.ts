import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// Linear scene depth for soft particles (render/Flipbooks.ts, render/SmokeRibbons.ts).
//
// The transparent pass draws into the same target whose depth texture holds the opaque depth,
// so it cannot sample that texture (a feedback loop). Engine.render calls capture() between
// the two passes: one half-resolution full-screen pass writes the view distance of the opaque
// scene (m, half float; sky = 65000) to a small target the effects can read. It runs only on
// frames where something asked for it (`want()`), so with no smoke in view it costs nothing.
// The upper cloud layer's shadow on the sun (Clouds.sunShadow) is passed through here too, so
// the effects can dim their sunlit side under a cloud without a reference to the engine.
export class SoftDepth {
  private rt = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, format: THREE.RedFormat, depthBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
  });
  private mat = new THREE.ShaderMaterial({
    uniforms: { tDepth: { value: null as THREE.Texture | null }, uInvProj: { value: new THREE.Matrix4() }, uReversed: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tDepth; uniform mat4 uInvProj; uniform float uReversed;
      varying vec2 vUv;
      void main() {
        float d = texture2D(tDepth, vUv).r;
        bool sky = uReversed > 0.5 ? d <= 0.0 : d >= 1.0;
        float z = 65000.0;
        if (!sky) {
          vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, uReversed > 0.5 ? d : d * 2.0 - 1.0, 1.0);
          z = min(-vp.z / vp.w, 65000.0);
        }
        gl_FragColor = vec4(z, 0.0, 0.0, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  private quad = new FullScreenQuad(this.mat);
  private wanted = false;
  // Shared by every soft material: the depth copy, 1 / full-resolution size, on/off, cloud shadow
  readonly uniforms = {
    tSoftDepth: { value: this.rt.texture as THREE.Texture },
    uSoftInvRes: { value: new THREE.Vector2(1, 1) },
    uSoftOn: { value: 0 },
    uSunShadow: { value: 1 },
  };

  want() { this.wanted = true; }

  capture(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, depth: THREE.DepthTexture, sunShadow: number) {
    this.uniforms.uSunShadow.value = sunShadow;
    if (!this.wanted) return;
    this.wanted = false;
    const img = depth.image as { width: number; height: number };
    const w = Math.max(1, img.width >> 1), h = Math.max(1, img.height >> 1);
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    this.uniforms.uSoftInvRes.value.set(1 / Math.max(1, img.width), 1 / Math.max(1, img.height));
    this.mat.uniforms.tDepth.value = depth;
    this.mat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    this.mat.uniforms.uReversed.value = renderer.capabilities.reversedDepthBuffer ? 1 : 0;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    this.quad.render(renderer);
    renderer.setRenderTarget(prev);
    this.uniforms.uSoftOn.value = 1;
  }
}

export const softDepth = new SoftDepth();

// GLSL shared by the soft materials: the opaque scene's view distance at this fragment
export const SOFT_DEPTH_GLSL = /* glsl */ `
  uniform sampler2D tSoftDepth; uniform vec2 uSoftInvRes; uniform float uSoftOn; uniform float uSunShadow;
  float softScene() { return uSoftOn > 0.5 ? texture2D(tSoftDepth, gl_FragCoord.xy * uSoftInvRes).r : 65000.0; }
`;
