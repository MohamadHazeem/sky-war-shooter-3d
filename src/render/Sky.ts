import * as THREE from 'three';
import { Atmos, atmosUniforms, skyGLSL } from './Atmosphere';
import { FAR_TERRAIN_GLSL, farTerrainUniforms } from './FarTerrain';
import { TARGET_GLSL, targetUniforms } from './TargetGround';

// Ground haze distance (m) for the dome's far terrain. Low-level operations (Countryside.ts) shorten
// it to match the haze on their own ground mesh, so the seam where the mesh ends disappears.
export const skyGround = { uGroundHaze: { value: 24000 } };

// Draw the sky last at the far plane. Early depth rejection skips the expensive
// procedural terrain/cirrus shader behind cockpit and aircraft pixels.
export class SkyDome {
  readonly mesh: THREE.Mesh;
  readonly cirrus = { value: 1 };

  constructor() {
    const geo = new THREE.SphereGeometry(1, 64, 32);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...atmosUniforms, ...targetUniforms, ...farTerrainUniforms, ...skyGround, uCirrus: this.cirrus, uSunDisk: { value: 1 }, uGroundXZ: { value: new THREE.Vector2() } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
          gl_Position = p;
          #ifdef USE_REVERSED_DEPTH_BUFFER
            gl_Position.z = 0.0;
          #else
            gl_Position.z = gl_Position.w;
          #endif
        }`,
      fragmentShader: /* glsl */ `
        ${skyGLSL}
        uniform vec2 uGroundXZ;
        uniform float uGroundHaze;
        uniform float uCirrus;
        uniform float uSunDisk;
        uniform float uHaze;
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

        ${FAR_TERRAIN_GLSL}

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
            float haze = 1.0 - exp(-t / max(uGroundHaze * uHaze, 1.0));
            // Desaturated blue-grey air between the camera and the countryside;
            // preserve the low-level ground match, with stronger veiling at cruise.
            float veil = (1.0 - exp(-t / 18500.0)) * smoothstep(800.0, 6500.0, uCamAlt);
            vec3 air = mix(uHorizon, vec3(dot(uHorizon, vec3(0.2126, 0.7152, 0.0722))), 0.62) * vec3(0.82, 0.89, 1.0);
            g = mix(g, air * 0.38, veil * 0.5);
            col = mix(g + uHorizon * mix(0.22, 0.18, smoothstep(800.0, 6500.0, uCamAlt)), col, haze);
          }
          // Faint cirrus above the horizon, fading toward the horizon and the zenith. Skipped
          // when the camera is already above the layer (it would sit behind the viewer).
          float cirAlt = 11000.0 - uCamAlt;
          if (uCirrus > 0.0 && d.y > 0.03 && cirAlt > 0.0) {
            float tc = cirAlt / d.y;
            float band = smoothstep(0.03, 0.2, d.y) * (1.0 - smoothstep(0.5, 0.95, d.y));
            float cir = cirrus(uGroundXZ + d.xz * tc) * band;
            // Sun-tinted ice, brighter in the forward-scattering lobe toward the sun
            float forward = pow(max(dot(d, uSunDir), 0.0), 6.0);
            col = mix(col, uSunColor * (0.07 + 0.08 * forward), cir * 0.3);
          }
          // Sun disk (very bright so bloom catches it)
          float mu = dot(d, uSunDir);
          col += uSunColor * smoothstep(0.99985, 0.99993, mu) * 60.0 * uSunDisk;
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;
    // Scale is irrelevant: vertex shader uses rotation only; keep it inside the frustum.
    this.mesh.scale.setScalar(1000);
  }
}

// Retain PMREM shaders and the capture scene across weather updates. The old implementation
// disposed/recompiled these during fronts, causing multi-hundred-ms stalls in flight.
interface EnvironmentCapture { scene: THREE.Scene; floor: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>; pmrem: THREE.PMREMGenerator }
const captures = new WeakMap<THREE.WebGLRenderer, EnvironmentCapture>();
const targets = new WeakMap<THREE.Texture, THREE.WebGLRenderTarget>();
export function disposeEnvironment(texture: THREE.Texture) {
  const rt=targets.get(texture);if(rt){rt.dispose();targets.delete(texture);}else texture.dispose();
}
export function buildEnvironment(renderer: THREE.WebGLRenderer, sky: SkyDome): THREE.Texture {
  let capture=captures.get(renderer);
  if(!capture){
    const scene=new THREE.Scene(),dome=sky.mesh.clone(),source=sky.mesh.material as THREE.ShaderMaterial;
    dome.material=new THREE.ShaderMaterial({vertexShader:source.vertexShader,fragmentShader:source.fragmentShader,
      side:source.side,depthWrite:false,depthTest:false,
      uniforms:{...source.uniforms,...atmosUniforms,uSunDisk:{value:0},uFarMapped:{value:0},uFarQuality:{value:0},uTgt:{value:new THREE.Vector4()},uGroundHaze:{value:24000}}});
    scene.add(dome);
    const floor=new THREE.Mesh(new THREE.CircleGeometry(5000,32),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-60;scene.add(floor);
    capture={scene,floor,pmrem:new THREE.PMREMGenerator(renderer)};captures.set(renderer,capture);
  }
  capture.floor.material.color.setRGB(.95,.96,1).multiplyScalar(.55*Atmos.envFloor);
  // Direct solar disk belongs to the sun light; including it in IBL double-counts energy.
  const rt=capture.pmrem.fromScene(capture.scene,0,.1,20000,{size:128});
  targets.set(rt.texture,rt);return rt.texture;
}
