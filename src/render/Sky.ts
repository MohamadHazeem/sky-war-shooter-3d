import * as THREE from 'three';
import { Atmos, atmosUniforms, skyGLSL } from './Atmosphere';
import { TARGET_GLSL, targetUniforms } from './TargetGround';

// Sky dome that follows the camera. Writes depth at the far plane only via the
// depthWrite=false + renderOrder trick, so clouds/aerial-perspective treat it as infinity.
export class SkyDome {
  readonly mesh: THREE.Mesh;

  constructor() {
    const geo = new THREE.SphereGeometry(1, 64, 32);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...atmosUniforms, ...targetUniforms, uGroundXZ: { value: new THREE.Vector2() } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
          gl_Position = p;
        }`,
      fragmentShader: /* glsl */ `
        ${skyGLSL}
        uniform vec2 uGroundXZ;
        varying vec3 vDir;

        float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
        }
        float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
        ${TARGET_GLSL}

        // High cirrus: thin ice streaks on a plane ~11 km up. Noise is stretched along the
        // wind axis and domain-warped so the filaments curl; only the noise peaks show.
        float cirrus(vec2 xz) {
          vec2 q = vec2(0.921 * xz.x - 0.389 * xz.y, 0.389 * xz.x + 0.921 * xz.y) * vec2(0.00012, 0.0008);
          q += (vec2(vnoise(q * 1.7 + 3.1), vnoise(q * 1.7 - 7.4)) - 0.5) * 0.9;
          float n = 0.0, a = 0.5;
          for (int i = 0; i < 3; i++) { n += a * vnoise(q); q = q * 2.1 + 9.2; a *= 0.5; }
          return smoothstep(0.5, 0.8, n / 0.875);
        }

        // Patchwork farmland, woods, towns, rivers and the sea, seen from 7 km
        vec3 terrain(vec2 xz, float dist) {
          vec2 p = xz / 1000.0;
          float land = fbm(p * 0.035 + 3.0);
          // the bombing target always stands on dry land
          if (uTgt.w > 0.0) land += 0.4 * (1.0 - smoothstep(uTgt.z * 1.2, uTgt.z * 2.6, length(xz - uTgt.xy)));
          if (land < 0.4) return mix(vec3(0.025, 0.05, 0.075), vec3(0.04, 0.07, 0.09), fbm(p * 0.6)); // sea
          // field grid with varied crops
          vec2 cell = floor(p * vec2(3.1, 2.3) + vec2(fbm(p * 0.3) * 2.0));
          float crop = h2(cell);
          vec3 fields = crop < 0.3 ? vec3(0.09, 0.11, 0.05) : crop < 0.55 ? vec3(0.13, 0.12, 0.07) : crop < 0.8 ? vec3(0.07, 0.09, 0.045) : vec3(0.15, 0.13, 0.09);
          float edge = smoothstep(0.0, 0.06, min(fract(p.x * 3.1 + fbm(p * 0.3) * 2.0), fract(p.y * 2.3 + fbm(p * 0.3) * 2.0)));
          fields *= mix(0.75, 1.0, edge);
          float wood = smoothstep(0.55, 0.62, fbm(p * 0.45 + 9.0));
          vec3 c = mix(fields, vec3(0.03, 0.05, 0.03), wood);
          float town = smoothstep(0.78, 0.82, fbm(p * 0.9 + 21.0));
          c = mix(c, vec3(0.13, 0.12, 0.12), town * 0.8);
          float river = 1.0 - smoothstep(0.0, 0.012, abs(fbm(p * 0.12 + 40.0) - 0.5));
          c = mix(c, vec3(0.04, 0.07, 0.09), river * 0.9);
          float coast = smoothstep(0.4, 0.43, land);
          return mix(vec3(0.05, 0.06, 0.06), c, coast) * 1.35;
        }

        void main() {
          vec3 d = normalize(vDir);
          vec3 col = skyRadiance(d);
          // ground point relative to the bombing target, and its pixel footprint (m), taken
          // outside the branch so the derivatives stay defined
          float tg = uCamAlt / max(-d.y, 1e-3);
          vec2 relG = (uGroundXZ - uTgt.xy) + d.xz * tg;
          float fw = max(length(dFdx(relG)), length(dFdy(relG)));
          if (d.y < -0.002) {
            float t = uCamAlt / -d.y;
            vec2 xz = uGroundXZ + d.xz * t;
            vec3 light = (0.35 + 0.65 * max(uSunDir.y, 0.0)) * (uSunColor / 4.0);
            vec3 alb = terrain(xz, t);
            vec3 g;
            if (uTgt.w > 0.0) g = targetGround(relG, alb, fw, light, uGroundXZ - uTgt.xy, d);
            else g = alb * light;
            // 7 km of air: strong blue haze, heavier toward the horizon
            float haze = 1.0 - exp(-t / 24000.0);
            col = mix(g + uHorizon * 0.22, col, haze);
          }
          // Faint cirrus above the horizon, fading toward the horizon and the zenith. Skipped
          // when the camera is already above the layer (it would sit behind the viewer).
          float cirAlt = 11000.0 - uCamAlt;
          if (d.y > 0.03 && cirAlt > 0.0) {
            float tc = cirAlt / d.y;
            float band = smoothstep(0.03, 0.2, d.y) * (1.0 - smoothstep(0.5, 0.95, d.y));
            float cir = cirrus(uGroundXZ + d.xz * tc) * band;
            // Sun-tinted ice, brighter in the forward-scattering lobe toward the sun
            float forward = pow(max(dot(d, uSunDir), 0.0), 6.0);
            col = mix(col, uSunColor * (0.07 + 0.08 * forward), cir * 0.3);
          }
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
