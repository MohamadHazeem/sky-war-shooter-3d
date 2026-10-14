import * as THREE from 'three';
import type { Bomber } from '../world/Aircraft';
import type { Effects } from '../world/Effects';
import type { ParticleOpts } from '../render/Particles';
import { bulletHoleTexture } from '../render/Textures';
import { access } from '../core/Accessibility';

// Persistent damage at the entry/exit holes. Twelve reusable patches, no new meshes
// or particle option objects on hits/ticks. All coordinates are bomber-local.
const COUNT = 12;
const SKIN = new THREE.MeshStandardMaterial({ color: 0x252a23, roughness: 1 });
const FLUFF = new THREE.MeshStandardMaterial({ color: 0x73684e, roughness: 1, side: THREE.DoubleSide });
const WIRE = new THREE.MeshStandardMaterial({ color: 0x201a13, roughness: 0.7, metalness: 0.2 });
const FLUID = new THREE.MeshStandardMaterial({ color: 0x543c22, roughness: 0.22, metalness: 0.1 });
const ICE = new THREE.MeshStandardMaterial({ color: 0x99afb7, roughness: 0.9, transparent: true, opacity: 0.32, depthWrite: false });
const FROST_RIM = new THREE.RingGeometry(0.108, 0.138, 23, 1, 0.3, Math.PI * 1.7);
const frostPos = FROST_RIM.getAttribute('position');
for (let i = 0; i < frostPos.count; i++) {
  const k = 1 + Math.sin(i * 19.7) * 0.08;
  frostPos.setXY(i, frostPos.getX(i) * k, frostPos.getY(i) * k);
}
const PATCH = new THREE.CircleGeometry(0.14, 7);
const STRIP = new THREE.BoxGeometry(0.012, 0.32, 0.006);
const WIRE_GEO = new THREE.CylinderGeometry(0.004, 0.004, 0.22, 4);
const TEAR = new THREE.BufferGeometry();
TEAR.setAttribute('position', new THREE.Float32BufferAttribute([
  -.11, -.05, 0, -.07, .06, .01, -.03, .025, .07, .015, .09, .03,
  .04, .035, .09, .09, .06, .01, .07, -.07, 0, 0, -.03, .035,
], 3));
TEAR.setIndex([7,0,1, 7,1,2, 7,2,3, 7,3,4, 7,4,5, 7,5,6]);
TEAR.computeVertexNormals();
const Z = new THREE.Vector3(0, 0, 1);
const FROST: [number, number, number] = [0.65, 0.78, 0.86];
const DUST: [number, number, number] = [0.52, 0.46, 0.34];
const SPARK: [number, number, number] = [12, 6, 1.8];
const OIL: [number, number, number] = [0.2, 0.12, 0.045];
interface Patch { root: THREE.Group; frost: THREE.Mesh; wire: THREE.Mesh; tear: THREE.Mesh; fluid: THREE.Mesh; age: number; heavy: boolean; phase: number }

export function warmInteriorDamage(scene: THREE.Scene, at: THREE.Vector3) {
  const lights = holeLightMaterials();
  const meshes = [SKIN, FLUFF, WIRE, FLUID, ICE, lights.hole, lights.sun, lights.sky].map(mat => {
    const m = new THREE.Mesh(PATCH, mat); m.position.copy(at); scene.add(m); return m;
  });
  return () => { for (const m of meshes) m.removeFromParent(); };
}

export class InteriorDamage {
  readonly group = new THREE.Group();
  private patches: Patch[] = [];
  private next = 0;
  private tick = 0;
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private normal = new THREE.Vector3();
  private o: ParticleOpts = { pos: this.pos, vel: this.vel, life: 1, size0: 0.02, size1: 0.01, color0: DUST };

  constructor() {
    this.group.name = 'interiorBattleDamage';
    for (let i = 0; i < COUNT; i++) {
      const root = new THREE.Group(); root.visible = false;
      const scar = new THREE.Mesh(PATCH, SKIN);
      const tear = new THREE.Mesh(TEAR, FLUFF); tear.position.z = 0.008;
      const wire = new THREE.Mesh(WIRE_GEO, WIRE); wire.position.set(0.04, -0.06, 0.06); wire.rotation.z = 0.3;
      const fluid = new THREE.Mesh(STRIP, FLUID); fluid.position.set(-0.03, -0.18, 0.006);
      const frost = new THREE.Mesh(FROST_RIM, ICE); frost.position.z = 0.004;
      root.add(scar, tear, wire, fluid, frost); this.group.add(root);
      this.patches.push({ root, tear, wire, fluid, frost, age: 0, heavy: false, phase: i * 2.4 });
    }
  }

  reset() {
    for (const p of this.patches) p.root.visible = false;
    this.next = this.tick = 0;
    this.group.removeFromParent();
  }

  hit(point: THREE.Vector3, outward: THREE.Vector3, heavy: boolean) {
    const p = this.patches[this.next]; this.next = (this.next + 1) % COUNT;
    p.root.visible = true; p.age = 0; p.heavy = heavy;
    p.root.position.copy(point).addScaledVector(outward, -0.018);
    p.root.quaternion.setFromUnitVectors(Z, this.normal.copy(outward).negate());
    p.root.scale.setScalar(heavy ? 1.35 : 0.65);
    p.wire.visible = p.fluid.visible = heavy;
    p.frost.visible = false;
    p.tear.rotation.set(0, 0, 0);
  }

  update(dt: number, b: Bomber, fx: Effects, cold: number, low: boolean, visible: boolean) {
    this.tick += dt;
    const emit = this.tick >= (low ? 0.25 : 0.1);
    if (emit) this.tick = 0;
    for (const p of this.patches) {
      if (!p.root.visible) continue;
      p.age += dt;
      p.frost.visible = b.pos.y > 1800 && cold > 0.1 && p.age > 2;
      p.frost.scale.setScalar(Math.min(1.35, 0.7 + p.age * 0.008 * cold));
      p.tear.rotation.y = Math.sin(p.age * 11 + p.phase) * 0.18;
      p.wire.rotation.z = 0.3 + Math.sin(p.age * 7 + p.phase) * 0.12;
      if (!visible || !emit || p.age > 24) continue;
      p.root.getWorldPosition(this.pos);
      this.vel.copy(b.vel); this.vel.y -= 0.2;
      // A draught carries insulation and frost aft in the bomber's slipstream.
      this.normal.set(0, 0, -1).applyQuaternion(b.quat);
      this.vel.addScaledVector(this.normal, 0.8);
      const o = this.o;
      o.color0 = p.frost.visible ? FROST : DUST;
      o.size0 = 0.025; o.size1 = 0.01; o.life = 0.8; o.alpha0 = 0.55; o.alpha1 = 0;
      o.rise = -0.3; o.drag = 0; o.frame = 0; o.lit = true;
      if (fx.smoke.count < 8200) fx.smoke.spawn(o);
      if (!p.heavy) continue;
      if (p.age < 8 && Math.sin(p.age * 21 + p.phase) > 0.7 && fx.glow.count < 4300) {
        o.color0 = SPARK; o.size0 = 0.035; o.life = 0.12; o.alpha0 = access.flash; o.frame = 1; o.lit = false;
        fx.glow.spawn(o);
      }
      if (p.age < 14 && fx.smoke.count < 8200) {
        o.color0 = OIL; o.size0 = 0.018; o.life = 0.45; o.alpha0 = 0.8; o.rise = -4; o.frame = 0; o.lit = true;
        fx.smoke.spawn(o);
      }
    }
  }
}

let holeLights: { hole: THREE.MeshBasicMaterial; sun: THREE.ShaderMaterial; sky: THREE.ShaderMaterial } | null = null;
export function holeLightMaterials() {
  if (holeLights) return holeLights;
  const hole = new THREE.MeshBasicMaterial({ map: bulletHoleTexture(), transparent: true, depthWrite: false, color: new THREE.Color(3.2, 3.1, 2.9), polygonOffset: true, polygonOffsetFactor: -2 });
  const sun = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color() } },
      vertexShader: /* glsl */ `
        varying float vF; varying float vL;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec3 n = normalize(mat3(modelMatrix) * normal);
          vec3 v = normalize(cameraPosition - wp.xyz);
          vF = abs(dot(n, v));
          vL = uv.y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; varying float vF; varying float vL;
        void main() {
          float a = pow(vF, 4.0) * smoothstep(0.0, 0.05, 1.0 - vL) * smoothstep(0.0, 0.45, vL) * (0.3 + 0.7 * vL);
          gl_FragColor = vec4(uCol * a, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
  return holeLights = { hole, sun, sky: sun.clone() };
}
