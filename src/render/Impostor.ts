import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Impostors: an aircraft model rendered once from IMP_AZ x IMP_EL directions into an atlas
// (albedo with coverage + object-space normal with a surface class), then drawn as one lit
// billboard per aircraft. Used by the bomber stream (BomberStream.ts) for everything beyond
// the near LOD. Baking runs a few tiles per frame so it never stalls the menu.
//
// Atlas layout: tile (k, j) = azimuth k * 360/IMP_AZ degrees (0 = seen from dead ahead, +Z;
// growing toward the left wing, +X), elevation row j centred on (j + 0.5) * 180/IMP_EL - 90
// degrees. Tile axes are those of a camera at that direction looking at the model's centre
// with up = +Y: right = (cos az, 0, -sin az), up = cross(dir, right). Texture v = 0 at the
// bottom row, as rendered.
//   albedo.rgb  linear base colour premultiplied by coverage (sRGB8 storage), a = coverage
//   normal.rgb  object-space normal * 0.5 + 0.5 (background 0.5 = no normal), a = class:
//               1.0 glass, 0.6 skin (painted / bare-metal panels), 0..0.25 other (gloss / 4)

export const IMP_AZ = 16;
export const IMP_EL = 8;

export interface ImpostorAtlas {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  center: THREE.Vector3;     // model-space centre of the frames
  radius: number;            // half size of a frame (model metres)
  tile: number;
  skinRough: number; skinMetal: number;
  ready: boolean;
}

export interface BakeOptions {
  tile: number;
  propRadius: number;
  hide?: RegExp;             // mesh names left out of the bake (crew, interior...)
  isSkin?: (m: THREE.Material) => boolean;
}

const NORMAL_VERT = /* glsl */ `
varying vec3 vN;
void main() {
  vN = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const NORMAL_FRAG = /* glsl */ `
uniform float uCode;
varying vec3 vN;
void main() {
  vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  gl_FragColor = vec4(n * 0.5 + 0.5, uCode);
}`;

const discGeo = new THREE.CircleGeometry(1, 32);

// Bakes one atlas, a few tiles per call to step()
export class ImpostorBake {
  readonly atlas: ImpostorAtlas;
  private albedoRT: THREE.WebGLRenderTarget;
  private normalRT: THREE.WebGLRenderTarget;
  private albedoScene = new THREE.Scene();
  private normalScene = new THREE.Scene();
  private cam: THREE.OrthographicCamera;
  private next = 0;
  private owned: THREE.Material[] = [];

  constructor(source: THREE.Object3D, o: BakeOptions) {
    const T = o.tile;
    const make = (srgb: boolean) => {
      const rt = new THREE.WebGLRenderTarget(T * IMP_AZ, T * IMP_EL, {
        samples: 4, depthBuffer: true, generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
        colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
      });
      rt.texture.anisotropy = 1;
      return rt;
    };
    this.albedoRT = make(true);
    this.normalRT = make(false);
    const isSkin = o.isSkin ?? ((m: THREE.Material) => !!m.userData.surf || m.name === 'GD-L');
    const albedo = source.clone(true), normal = source.clone(true);
    let skinRough = 0.6, skinMetal = 0.15;
    const albedoOf = new Map<THREE.Material, THREE.Material>(), normalOf = new Map<THREE.Material, THREE.Material>();
    const swap = (root: THREE.Object3D, pass: 'albedo' | 'normal') => {
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (o.hide && o.hide.test(mesh.name)) { mesh.visible = false; return; }
        const conv = (m: THREE.Material) => {
          const cache = pass === 'albedo' ? albedoOf : normalOf;
          let c = cache.get(m);
          if (c) return c;
          const s = m as THREE.MeshStandardMaterial;
          if (pass === 'albedo') {
            c = new THREE.MeshBasicMaterial({
              color: s.color ? s.color.clone() : 0xffffff, map: s.map ?? null, transparent: s.transparent, opacity: s.opacity,
              side: s.side, alphaTest: s.alphaTest, depthWrite: !s.transparent, vertexColors: s.vertexColors,
            });
          } else {
            const skin = isSkin(m) && !s.transparent;
            if (skin && s.isMeshStandardMaterial) { skinRough = s.roughness; skinMetal = s.metalness; }
            const code = s.transparent ? 1 : skin ? 0.6 : 0.25 * (1 - (s.roughness ?? 0.7));
            c = new THREE.ShaderMaterial({ uniforms: { uCode: { value: code } }, vertexShader: NORMAL_VERT, fragmentShader: NORMAL_FRAG, side: s.side, blending: THREE.NoBlending });
          }
          cache.set(m, c);
          this.owned.push(c);
          return c;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material);
        mesh.castShadow = mesh.receiveShadow = false;
      });
    };
    swap(albedo, 'albedo');
    swap(normal, 'normal');
    // spinning propellers: a translucent blur disc instead of the blades (albedo only; the
    // normal pass keeps the nacelle behind it)
    const discMat = new THREE.MeshBasicMaterial({ color: 0x2a2a28, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
    this.owned.push(discMat);
    for (const root of [albedo, normal]) {
      const props: THREE.Object3D[] = [];
      root.traverse((x) => { if (/^prop_\d+$/.test(x.name)) props.push(x); });
      for (const p of props) {
        p.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.visible = false; });
        if (root === albedo) {
          const disc = new THREE.Mesh(discGeo, discMat);
          disc.scale.setScalar(o.propRadius);
          disc.position.z = 0.05;
          p.add(disc);
        }
      }
    }
    this.albedoScene.add(albedo);
    this.normalScene.add(normal);
    albedo.updateMatrixWorld(true);
    const box = new THREE.Box3();
    albedo.traverse((x) => { if ((x as THREE.Mesh).isMesh && x.visible) box.expandByObject(x); });
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() * 0.5 * 1.02;
    this.cam = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.1, radius * 6);
    this.atlas = { albedo: this.albedoRT.texture, normal: this.normalRT.texture, center, radius, tile: T, skinRough, skinMetal, ready: false };
  }

  get done() { return this.atlas.ready; }

  // Render up to n tiles (both passes). Returns true once the atlas is complete.
  step(r: THREE.WebGLRenderer, n = 16): boolean {
    if (this.atlas.ready) return true;
    const T = this.atlas.tile, R = this.atlas.radius, c = this.atlas.center;
    const prevRT = r.getRenderTarget(), prevAuto = r.autoClear, prevAlpha = r.getClearAlpha();
    const prevColor = r.getClearColor(new THREE.Color());
    r.autoClear = false;
    const total = IMP_AZ * IMP_EL;
    for (let i = 0; i < n && this.next < total; i++, this.next++) {
      const k = this.next % IMP_AZ, j = Math.floor(this.next / IMP_AZ);
      const az = (k / IMP_AZ) * Math.PI * 2, el = ((j + 0.5) / IMP_EL) * Math.PI - Math.PI / 2;
      const d = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
      this.cam.position.copy(c).addScaledVector(d, R * 3);
      this.cam.up.set(0, 1, 0);
      this.cam.lookAt(c);
      this.cam.updateMatrixWorld();
      for (const [rt, scene, clear] of [[this.albedoRT, this.albedoScene, 0], [this.normalRT, this.normalScene, 0.5]] as const) {
        rt.viewport.set(k * T, j * T, T, T);
        rt.scissor.set(k * T, j * T, T, T);
        rt.scissorTest = true;
        r.setRenderTarget(rt);
        r.setClearColor(new THREE.Color(clear, clear, clear), 0);
        r.clear(true, true, false);
        r.render(scene, this.cam);
      }
    }
    r.setRenderTarget(prevRT);
    r.autoClear = prevAuto;
    r.setClearColor(prevColor, prevAlpha);
    if (this.next >= total) this.finish();
    return this.atlas.ready;
  }

  private finish() {
    this.atlas.ready = true;
    for (const rt of [this.albedoRT, this.normalRT]) { rt.scissorTest = false; rt.viewport.set(0, 0, rt.width, rt.height); rt.scissor.set(0, 0, rt.width, rt.height); }
    // the bake scenes are no longer needed (geometry is shared with the model cache)
    for (const m of this.owned) m.dispose();
    this.owned = [];
    this.albedoScene.clear();
    this.normalScene.clear();
  }

  dispose() {
    this.finish();
    this.albedoRT.dispose();
    this.normalRT.dispose();
  }
}

// ---- GLSL: sampling an atlas on a camera-facing quad --------------------------------------
// Vertex side: frame selection and the per-frame UV reprojection (exact for a planar sprite).
// In: vl = unit view direction (aircraft centre -> camera) in aircraft space; corner = quad
// corner in [-1, 1]^2 on the view-aligned axes (right, up) returned by impAxes().
export const IMPOSTOR_VERT_GLSL = /* glsl */ `
#define IMP_AZ ${IMP_AZ}.0
#define IMP_EL ${IMP_EL}.0
varying vec4 vImpA;   // local uv of frames 0, 1
varying vec4 vImpB;   // local uv of frames 2, 3
varying vec4 vImpK;   // k0, k1, j0, j1
varying vec4 vImpW;   // weights
void impAxes(vec3 vl, out vec3 rx, out vec3 uy) {
  float az = atan(vl.x, vl.z);
  rx = vec3(cos(az), 0.0, -sin(az));
  uy = cross(vl, rx);
}
vec3 impDir(float k, float j) {
  float az = k / IMP_AZ * 6.2831853, el = (j + 0.5) / IMP_EL * 3.14159265 - 1.5707963;
  return vec3(cos(el) * sin(az), sin(el), cos(el) * cos(az));
}
vec2 impUv(vec3 q, float k, float j) {
  vec3 d = impDir(k, j);
  float az = k / IMP_AZ * 6.2831853;
  vec3 rx = vec3(cos(az), 0.0, -sin(az));
  vec3 uy = cross(d, rx);
  return vec2(dot(q, rx), dot(q, uy)) * 0.5 + 0.5;
}
// q = the corner in aircraft space, in units of the frame radius
void impFrames(vec3 vl, vec3 q) {
  float az = atan(vl.x, vl.z);
  float el = asin(clamp(vl.y, -1.0, 1.0));
  float fa = az / 6.2831853 * IMP_AZ;
  fa = mod(fa, IMP_AZ);
  float k0 = floor(fa), wa = fa - k0;
  float k1 = mod(k0 + 1.0, IMP_AZ);
  float fe = clamp((el + 1.5707963) / 3.14159265 * IMP_EL - 0.5, 0.0, IMP_EL - 1.0);
  float j0 = floor(fe), we = fe - j0;
  float j1 = min(j0 + 1.0, IMP_EL - 1.0);
  vImpA = vec4(impUv(q, k0, j0), impUv(q, k1, j0));
  vImpB = vec4(impUv(q, k0, j1), impUv(q, k1, j1));
  vImpK = vec4(k0, k1, j0, j1);
  vImpW = vec4((1.0 - wa) * (1.0 - we), wa * (1.0 - we), (1.0 - wa) * we, wa * we);
}
`;

// Fragment side: 4-frame blend of albedo (un-premultiplied) and normal + class
export const IMPOSTOR_FRAG_GLSL = /* glsl */ `
#define IMP_AZ ${IMP_AZ}.0
#define IMP_EL ${IMP_EL}.0
uniform sampler2D tImpAlbedo;
uniform sampler2D tImpNormal;
varying vec4 vImpA;
varying vec4 vImpB;
varying vec4 vImpK;
varying vec4 vImpW;
vec2 impAt(vec2 uv, float k, float j) { return (vec2(k, j) + clamp(uv, 0.004, 0.996)) / vec2(IMP_AZ, IMP_EL); }
void impSample(out vec4 alb, out vec4 nrm) {
  vec2 u0 = impAt(vImpA.xy, vImpK.x, vImpK.z), u1 = impAt(vImpA.zw, vImpK.y, vImpK.z);
  vec2 u2 = impAt(vImpB.xy, vImpK.x, vImpK.w), u3 = impAt(vImpB.zw, vImpK.y, vImpK.w);
  alb = texture2D(tImpAlbedo, u0) * vImpW.x + texture2D(tImpAlbedo, u1) * vImpW.y + texture2D(tImpAlbedo, u2) * vImpW.z + texture2D(tImpAlbedo, u3) * vImpW.w;
  nrm = texture2D(tImpNormal, u0) * vImpW.x + texture2D(tImpNormal, u1) * vImpW.y + texture2D(tImpNormal, u2) * vImpW.z + texture2D(tImpNormal, u3) * vImpW.w;
}
`;

// ---- Near LOD: a model merged into one geometry (groups per material) for instancing ------
// Skips the meshes matching `skip` and the propeller blades; transparent materials become
// opaque glass (so the whole instanced mesh stays in the opaque pass).
export function mergeForInstancing(source: THREE.Object3D, skip: RegExp): { geometry: THREE.BufferGeometry; materials: THREE.Material[] } | null {
  const root = source.clone(true);
  root.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || skip.test(mesh.name)) return;
    for (let a: THREE.Object3D | null = obj; a && a !== root; a = a.parent) if (/^prop_\d+$/.test(a.name)) return;
    const src = mesh.geometry;
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const at = src.getAttribute(name) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
      const size = name === 'uv' ? 2 : 3;
      const arr = new Float32Array(src.getAttribute('position').count * size);
      if (at) for (let i = 0; i < at.count; i++) { arr[i * size] = at.getX(i); arr[i * size + 1] = at.getY(i); if (size === 3) arr[i * size + 2] = at.getZ(i); }
      g.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    const count = src.getAttribute('position').count;
    const index = src.index ? Array.from(src.index.array as ArrayLike<number>) : Array.from({ length: count }, (_, i) => i);
    g.applyMatrix4(mesh.matrixWorld);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = Array.isArray(mesh.material) && src.groups.length ? src.groups : [{ start: 0, count: index.length, materialIndex: 0 }];
    for (const gr of groups) {
      const m = mats[gr.materialIndex ?? 0];
      if (!m) continue;
      const part = g.clone();
      part.setIndex(index.slice(gr.start, gr.start + Math.min(gr.count, index.length - gr.start)));
      const list = byMat.get(m) ?? [];
      list.push(part);
      byMat.set(m, list);
    }
  });
  if (!byMat.size) return null;
  const parts: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  for (const [m, list] of byMat) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    parts.push(merged);
    let mm = m.clone();
    delete mm.userData.surf;   // the panel-line setup is per original mesh transform
    if (mm.transparent) {
      const glass = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.06, metalness: 0.0 });
      glass.envMap = (m as THREE.MeshStandardMaterial).envMap ?? null;
      glass.envMapIntensity = 1.2;
      mm = glass;
    }
    materials.push(mm);
  }
  const geometry = mergeGeometries(parts, true);
  if (!geometry) return null;
  geometry.computeBoundingSphere();
  return { geometry, materials };
}
