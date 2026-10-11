import * as THREE from 'three';
import { markOwned, disposeOwned } from './Dispose';

// Ground searchlights for the night-fighter mission: long additive light cones that sweep the
// sky, lock onto a raider that strays into a beam and hold him ("coned") while neighbouring
// beams swing across to join in. A coned bomber is what the night fighter goes for.
//
// The beams are children of one group in the scene, so the floating-origin rebase moves them
// with everything else. update() returns nothing; read `coned` (raiders inside a locked beam).

export interface BeamTarget { pos: THREE.Vector3; alive: boolean; remove?: boolean }

const LENGTH = 9000;            // m
const HALF_ANGLE = 0.022;       // rad, ~1.3 deg: a narrow beam that widens with range
const CONE_HIT = 0.03;          // rad: inside this a locked beam lights him up
const CATCH = 0.06;             // rad: a sweeping beam that passes this close catches him
const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

interface Beam<T extends BeamTarget> {
  mesh: THREE.Mesh;
  base: THREE.Vector3;          // group-local ground position
  dir: THREE.Vector3;           // current world direction (unit)
  yaw0: number; pitch0: number; // sweep centre
  rate: number; phase: number;
  target: T | null;
  holdT: number;                // s left on the lock
  err: THREE.Vector3;           // tracking error (the crews lag the target a little)
  scanT: number;
}

// Soft-edged additive cone: brightest at the lamp, fading up the beam and toward the silhouette
function beamMaterial() {
  return markOwned(new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0.75, 0.82, 1.0) }, uIntensity: { value: 0.32 } },
    vertexShader: /* glsl */ `
      varying float vT;
      varying vec3 vN;
      varying vec3 vV;
      varying float vCut;
      void main() {
        vT = uv.y;
        // how much of the near-lamp glow to cut (see the fragment shader): by the camera's height
        // above this lamp. From the ground or low (below ~250 m) the beam starts at the lamp; from
        // ~1200 m up (the night fighter flies at 3-8 km) the cut is fully in.
        float camH = cameraPosition.y - modelMatrix[3].y;
        vCut = smoothstep(250.0, 1200.0, camH);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vT;
      varying vec3 vN;
      varying vec3 vV;
      varying float vCut;
      void main() {
        float edge = abs(dot(normalize(vN), normalize(vV)));
        // no glow right at the lamp when seen from high above: from the bomber stream the narrow
        // lamp end faced the camera and bloomed into white blobs ringed by the cone's last
        // segments. Seen from the ground or low the cut made the beams start in mid-air, so it
        // fades out with the camera's height (vCut).
        // 1 - vT is clamped: vT interpolates a hair past 1 at the open end, and pow() of a
        // negative is NaN (bloom spread those NaN pixels into white blobs at the beam tips too)
        float near = mix(smoothstep(0.0, 0.006, vT), smoothstep(0.04, 0.3, vT), vCut);
        float along = pow(clamp(1.0 - vT, 0.0, 1.0), 1.6) * near;
        float a = min(uIntensity * along * pow(edge, 1.4), 0.14);
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }));
}

export class Searchlights<T extends BeamTarget = BeamTarget> {
  readonly group = new THREE.Group();
  readonly coned = new Set<T>();
  private beams: Beam<T>[] = [];
  private geo: THREE.BufferGeometry;
  private t = 0;

  // visibleIf: false switches the beams off without touching the scene (e.g. back in the menu)
  constructor(private scene: THREE.Scene, private visibleIf: () => boolean = () => true) {
    // unit cone along +Y: lamp at the origin, open end at y = 1 (uv.y runs 0 -> 1 up the beam)
    const g = new THREE.CylinderGeometry(Math.tan(HALF_ANGLE), 0.0004, 1, 20, 1, true);
    g.translate(0, 0.5, 0);
    this.geo = g;
    this.group.name = 'searchlights';
  }

  get count() { return this.beams.length; }

  // Place n lamps on the ground (world positions, y ~ 0), sweeping the sky toward `toward`
  setup(sites: THREE.Vector3[], toward: THREE.Vector3) {
    this.clear();
    this.scene.add(this.group);
    const mat = beamMaterial();
    const bright = mat.uniforms.uIntensity.value as number;
    const gate = () => { mat.uniforms.uIntensity.value = this.visibleIf() ? bright : 0; };
    const az0 = Math.atan2(toward.x, toward.z);
    sites.forEach((s, i) => {
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.frustumCulled = false;
      mesh.onBeforeRender = gate;
      mesh.renderOrder = 2;
      mesh.position.copy(s).sub(this.group.position);
      mesh.scale.set(LENGTH, LENGTH, LENGTH);
      this.group.add(mesh);
      const b: Beam<T> = {
        mesh, base: mesh.position.clone(), dir: new THREE.Vector3(0, 1, 0),
        yaw0: az0 + (Math.random() - 0.5) * 1.6, pitch0: 0.75 + Math.random() * 0.35,
        rate: 0.11 + Math.random() * 0.09, phase: Math.random() * Math.PI * 2 + i,
        target: null, holdT: 0, err: new THREE.Vector3(), scanT: Math.random() * 0.3,
      };
      this.sweepDir(b, b.dir);
      this.orient(b);
      this.beams.push(b);
    });
  }

  clear() {
    for (const b of this.beams) b.mesh.removeFromParent();
    if (this.beams.length) disposeOwned(this.group);
    this.beams = [];
    this.coned.clear();
    this.group.removeFromParent();
    this.group.position.set(0, 0, 0);
  }

  private sweepDir(b: Beam<T>, out: THREE.Vector3) {
    const yaw = b.yaw0 + Math.sin(this.t * b.rate + b.phase) * 0.9;
    const pitch = THREE.MathUtils.clamp(b.pitch0 + Math.sin(this.t * b.rate * 1.7 + b.phase * 2) * 0.28, 0.35, 1.45);
    return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  }

  private orient(b: Beam<T>) { b.mesh.quaternion.copy(_q.setFromUnitVectors(UP, b.dir)); }

  private lamp(b: Beam<T>, out: THREE.Vector3) { return out.copy(b.base).add(this.group.position); }

  // Sweep, catch and hold the raiders (targets: the live enemy bombers)
  update(dt: number, targets: readonly T[]) {
    if (!this.beams.length) return;
    this.t += dt;
    this.coned.clear();
    for (const b of this.beams) {
      const lamp = this.lamp(b, _w);
      if (b.target && (!b.target.alive || b.target.remove || b.holdT <= 0 || b.target.pos.distanceTo(lamp) > LENGTH * 0.95)) b.target = null;
      if (b.target) {
        b.holdT -= dt;
        // track with a wandering error so the cone slides over him rather than pinning him
        b.err.lerp(_d.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.03), 1 - Math.exp(-dt * 1.5));
        const want = _d.copy(b.target.pos).sub(lamp).normalize().add(b.err).normalize();
        b.dir.lerp(want, 1 - Math.exp(-dt * 2.2)).normalize();
      } else {
        const want = this.sweepDir(b, _d);
        b.dir.lerp(want, 1 - Math.exp(-dt * 1.2)).normalize();
        b.scanT -= dt;
        if (b.scanT <= 0) {
          b.scanT = 0.25;
          // a raider in the beam, or one a neighbouring beam already holds (they converge on him)
          let pick: T | null = null, best = CATCH;
          for (const x of targets) {
            if (!x.alive || x.remove) continue;
            const to = _d.copy(x.pos).sub(lamp);
            const dist = to.length();
            if (dist > LENGTH * 0.9) continue;
            const ang = to.divideScalar(dist).angleTo(b.dir);
            let held = false;
            for (const other of this.beams) if (other !== b && other.target === x) { held = true; break; }
            const lim = held ? 0.45 : CATCH;
            if (ang < lim && ang < (held ? 0.45 : best)) { best = ang; pick = x; }
          }
          if (pick) { b.target = pick; b.holdT = 7 + Math.random() * 7; }
        }
      }
      this.orient(b);
      // lit: inside the locked beam
      if (b.target) {
        const to = _d.copy(b.target.pos).sub(lamp).normalize();
        if (to.angleTo(b.dir) < CONE_HIT) this.coned.add(b.target);
      }
    }
  }

  // Beams locked on a raider (radio / tests)
  locks(): number { return this.beams.filter((b) => b.target).length; }
}
