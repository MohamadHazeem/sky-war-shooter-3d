import * as THREE from 'three';
import { atmosUniforms, skyGLSL } from './Atmosphere';

// Sky dome that follows the camera. Writes depth at the far plane only via the
// depthWrite=false + renderOrder trick, so clouds/aerial-perspective treat it as infinity.
export class SkyDome {
  readonly mesh: THREE.Mesh;

  constructor() {
    const geo = new THREE.SphereGeometry(1, 64, 32);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...atmosUniforms },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
          gl_Position = p;
        }`,
      fragmentShader: /* glsl */ `
        ${skyGLSL}
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 col = skyRadiance(d);
          // Sun disk (very bright so bloom catches it)
          float mu = dot(d, uSunDir);
          col += uSunColor * smoothstep(0.99985, 0.99993, mu) * 60.0;
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    // Scale is irrelevant: vertex shader uses rotation only; keep it inside the frustum.
    this.mesh.scale.setScalar(1000);
  }
}

// Renders the sky into a cube map for PBR reflections / ambient (PMREM).
export function buildEnvironment(renderer: THREE.WebGLRenderer, sky: SkyDome): THREE.Texture {
  const scene = new THREE.Scene();
  const dome = sky.mesh.clone();
  dome.material = (sky.mesh.material as THREE.ShaderMaterial).clone();
  (dome.material as THREE.ShaderMaterial).uniforms = { ...atmosUniforms };
  scene.add(dome);
  // Cloud-sea floor so the lower hemisphere reflects bright white like the real thing.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(5000, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.96, 1.0).multiplyScalar(1.6), side: THREE.DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -60;
  scene.add(floor);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0, 0.1, 20000);
  pmrem.dispose();
  return rt.texture;
}
