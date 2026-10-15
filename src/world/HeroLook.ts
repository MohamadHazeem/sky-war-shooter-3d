import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { assetUrl, take } from '../core/Assets';
import { useSkyEnv } from '../render/AircraftLook';
import type { Fighter } from './Aircraft';

// Runtime side of the Luftwaffe hero models (tools/hero/luftwaffe, docs/phase10/hero-parts.md):
//   prepareHero    after load: every node with <name>_lod0/1/2 children gets a HeroLOD (past LOD0 the
//                  whole airframe is one merged mesh under part_fuselage: one draw call), crew and
//                  cockpit tub drop out past LOD0, the undercarriage is hidden (retracted in flight),
//                  materials keep their baked PBR maps
//   HeroLOD        picks the level from the on-screen size (distance / world scale / zoom); the Low
//                  preset pins every aircraft to the far level (one merged mesh per airframe)
//   animateControls  ailerons, elevators and rudder(s) follow the flight model's stick inputs
//   applyHeroAce   swaps the base colour for the ace livery (<kind>_ace.webp, loaded on first use)
//   enableHeroKtx2 once the renderer exists: the shared skins swap their embedded WebP maps for the
//                  GPU-compressed <kind>_{base,normal,orm}.ktx2 (Basis UASTC); WebP stays on any failure
//   partSide       which break-up piece a named part belongs to (Wrecks.cut)

export const HERO_KINDS: ReadonlySet<string> = new Set(['bf109', 'fw190', 'me262', 'bf110', 'ju88', 'me410', 'me163', 'ju88g', 'p47d', 'spitfire9']);
export const isHero = (kind: string) => HERO_KINDS.has(kind);

// level switch distances in model metres (world distance / model scale) at the default zoom:
// LOD0 (separate parts, moving controls, crew) for close passes (the 150 m waist view of a 6x fighter
// is ~25 model metres), LOD1 (merged airframe at 40 %) once the aircraft is ~100 px across, LOD2
// (merged, ~3k triangles) for the distant swarm
export const HERO_LOD_DIST = [0, 45, 140];
const REF_TAN = Math.tan(THREE.MathUtils.degToRad(31));

let farOnly = false;
// Low preset: every hero aircraft on its far LOD, and the shared skin materials drop their normal / ORM
// maps (base colour only, constant roughness): a cheaper fragment shader for the weak machines. Fighters
// already flying keep their own material copies until they go; new spawns get the lite set.
export function syncHeroLod(quality: string) {
  const low = quality === 'low';
  if (low === farOnly) return;
  farOnly = low;
  for (const s of skins) liteSkin(s, low);
}
export const heroLodFarOnly = () => farOnly;

interface Skin { mat: THREE.MeshStandardMaterial; normal: THREE.Texture | null; orm: THREE.Texture | null; kind: string }
const skins: Skin[] = [];

// ---------------------------------------------------------------- KTX2 (goal 05b)
let ktx2: KTX2Loader | null = null;
const ktx2Kinds = new Set<string>();
const P_KTX2 = 8;   // background download priority (core/Assets.ts): after the mission files
export function enableHeroKtx2(renderer: THREE.WebGLRenderer) {
  if (ktx2) return;
  try {
    ktx2 = new KTX2Loader().setTranscoderPath(assetUrl('models/basis/')).detectSupport(renderer);
  } catch (e) {
    console.warn('KTX2 unavailable, hero aircraft keep their WebP textures', e);
    return;
  }
  for (const s of skins) upgradeKind(s.kind);
}
function upgradeKind(kind: string) {
  if (!ktx2 || ktx2Kinds.has(kind)) return;
  ktx2Kinds.add(kind);
  const loader = ktx2;
  const read = async (name: string, like: THREE.Texture | null, srgb: boolean) => {
    const bytes = await take(`models/${kind}_${name}.ktx2`, P_KTX2);
    const t = await new Promise<THREE.CompressedTexture>((res, rej) => loader.parse(bytes, res, rej));
    t.flipY = false;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    if (like) { t.wrapS = like.wrapS; t.wrapT = like.wrapT; t.channel = like.channel; }
    return t;
  };
  void (async () => {
    const own = skins.filter((s) => s.kind === kind);
    if (!own.length) return;
    const ref = own[0];
    const [base, normal, orm] = await Promise.all([read('base', ref.mat.map, true), read('normal', ref.normal, false), read('orm', ref.orm, false)]);
    for (const s of skins) {
      if (s.kind !== kind) continue;
      const old = [s.mat.map, s.normal, s.orm];
      s.mat.map = base; s.normal = normal; s.orm = orm;
      liteSkin(s, farOnly);
      for (const t of old) if (t && t !== base && t !== normal && t !== orm) t.dispose();
    }
  })().catch((e) => console.warn(`${kind}: KTX2 textures unavailable, keeping WebP`, e));
}
function liteSkin(s: Skin, lite: boolean) {
  const m = s.mat;
  m.normalMap = lite ? null : s.normal;
  m.roughnessMap = m.metalnessMap = m.aoMap = lite ? null : s.orm;
  m.roughness = lite ? 0.62 : 1;
  m.metalness = lite ? 0.1 : 1;
  m.needsUpdate = true;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _s = new THREE.Vector3();

export class HeroLOD extends THREE.LOD {
  update(camera: THREE.Camera) {
    const levels = this.levels;
    if (levels.length < 2) return;
    let k = levels.length - 1;
    if (!farOnly) {
      _a.setFromMatrixPosition(camera.matrixWorld);
      _b.setFromMatrixPosition(this.matrixWorld);
      _s.setFromMatrixScale(this.matrixWorld);
      const cam = camera as THREE.PerspectiveCamera;
      const zoom = cam.isPerspectiveCamera ? REF_TAN / Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5)) * cam.zoom : 1;
      const d = _a.distanceTo(_b) / (Math.max(1e-3, _s.x) * zoom);
      k = 0;
      while (k + 1 < levels.length && d >= levels[k + 1].distance) k++;
    }
    for (let i = 0; i < levels.length; i++) levels[i].object.visible = i === k;
    (this as unknown as { _currentLevel: number })._currentLevel = k;
  }
}

// Called by Models.ts on the loaded (shared) model; clones inherit everything.
export function prepareHero(root: THREE.Object3D, kind: string) {
  const hosts: THREE.Object3D[] = [];
  root.traverse((o) => { if (o.name && o.children.some((c) => c.name === `${o.name}_lod0`)) hosts.push(o); });
  for (const host of hosts) {
    const lod = new HeroLOD();
    lod.name = `${host.name}_lods`;
    for (let i = 0; i < HERO_LOD_DIST.length; i++) {
      const lvl = host.children.find((c) => c.name === `${host.name}_lod${i}`);
      if (lvl) host.remove(lvl);
      lod.addLevel(lvl ?? new THREE.Object3D(), HERO_LOD_DIST[i]);
    }
    host.add(lod);
  }
  // crew figures and the cockpit tub only at LOD0
  for (const name of ['pilot', 'crew', 'interior']) {
    const node = root.getObjectByName(name);
    if (!node || !node.children.length) continue;
    const near = new THREE.Group();
    near.add(...node.children);
    const lod = new HeroLOD();
    lod.name = `${name}_lods`;
    lod.addLevel(near, 0);
    lod.addLevel(new THREE.Object3D(), HERO_LOD_DIST[1]);
    node.add(lod);
  }
  root.traverse((o) => {
    if (o.name.startsWith('gear_')) o.visible = false;
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
      if (!mat.isMeshStandardMaterial) continue;
      if (mat.transparent) {
        // canopy perspex: glossy, the sky mirrored in it
        mat.depthWrite = false;
        m.castShadow = false;
        useSkyEnv(mat, 1.5);
      } else {
        useSkyEnv(mat, 0.75);
        for (const t of [mat.map, mat.normalMap, mat.roughnessMap]) if (t) t.anisotropy = 8;
        if (!skins.some((s) => s.mat === mat)) {
          const s: Skin = { mat, normal: mat.normalMap, orm: mat.roughnessMap, kind };
          skins.push(s);
          if (farOnly) liteSkin(s, true);
          upgradeKind(kind);
        }
      }
    }
  });
  root.userData.hero = kind;
}

// Undercarriage down (parked aircraft) or up (in flight, the default after prepareHero)
export function setGear(model: THREE.Object3D, down: boolean) {
  if (!model.userData.hero) return;
  for (const c of model.children) if (c.name.startsWith('gear_')) c.visible = down;
}

// ---------------------------------------------------------------- control surfaces

interface Ctl { node: THREE.Object3D; base: THREE.Quaternion; axis: 0 | 1 | 2 | 3 | 4; cur: number }
const ctlOf = new WeakMap<Fighter, Ctl[]>();
const _q = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
// max deflections (rad)
const AIL = 0.32, ELE = 0.38, RUD = 0.4;

function controlsOf(f: Fighter): Ctl[] {
  let list = ctlOf.get(f);
  if (list) return list;
  list = [];
  if (f.model.userData.hero) {
    f.model.traverse((o) => {
      const n = o.name;
      const axis = n === 'ctl_aileron_L' ? 0 : n === 'ctl_aileron_R' ? 1 : n.startsWith('ctl_elevator') ? 2 : n.startsWith('ctl_rudder') ? 3 : n.startsWith('ctl_flap') ? 4 : -1;
      if (axis >= 0) list!.push({ node: o, base: o.quaternion.clone(), axis: axis as Ctl['axis'], cur: 0 });
    });
  }
  ctlOf.set(f, list);
  return list;
}

// Hinges rotate about their local X: +angle raises the trailing edge (rudder: +angle swings it to
// the right). Roll + = right wing down, pitch + = nose up, yaw + = nose left (FlightModel).
export function animateControls(f: Fighter, dt: number) {
  const list = controlsOf(f);
  if (!list.length || !f.alive) return;
  const k = 1 - Math.exp(-dt * 9);
  const fm = f.fm;
  for (const c of list) {
    const elevon = f.kind === 'me163' ? fm.pitch * ELE : 0;
    const want = c.axis === 0 ? -fm.roll * AIL + elevon : c.axis === 1 ? fm.roll * AIL + elevon : c.axis === 2 ? fm.pitch * ELE
      : c.axis === 3 ? -fm.yaw * RUD : 0;
    if (Math.abs(want - c.cur) < 1e-4) continue;
    c.cur += (want - c.cur) * k;
    c.node.quaternion.copy(c.base).multiply(_q.setFromAxisAngle(X, c.cur));
  }
}

// ---------------------------------------------------------------- ace livery

const aceTex = new Map<string, Promise<THREE.Texture | null>>();
function loadAce(kind: string) {
  let p = aceTex.get(kind);
  if (!p) {
    p = new THREE.TextureLoader().loadAsync(assetUrl(`models/${kind}_ace.webp`)).then((t) => {
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    }).catch(() => null);
    aceTex.set(kind, p);
  }
  return p;
}

// The ace's own livery (kill bars on the rudder, Kommandeur chevrons, emblem, spinner) on this
// fighter's own material copies (DamageLook.setup). The map exists already: no shader change.
export function applyHeroAce(f: Fighter): boolean {
  if (!f.model.userData.hero) return false;
  const name = `hero_${f.kind}`;
  void loadAce(f.kind).then((t) => {
    if (!t) return;
    f.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
        if (mat.name === name && mat.map) mat.map = t;
      }
    });
  });
  return true;
}

// ---------------------------------------------------------------- break-up by parts

// The named structural parts of a hero airframe (airframe/part_*) and the far LOD's merged mesh.
export function heroParts(model: THREE.Object3D) {
  const airframe = model.getObjectByName('airframe');
  if (!airframe || !model.userData.hero) return null;
  const parts = airframe.children.filter((c) => c.name.startsWith('part_'));
  return parts.length ? parts : null;
}

// Centre of a part in the model's own frame (cached per kind + part: every clone is the same)
const centres = new Map<string, THREE.Vector3>();
const _box = new THREE.Box3(), _m = new THREE.Matrix4();
export function partCentre(model: THREE.Object3D, part: THREE.Object3D): THREE.Vector3 {
  const key = `${model.userData.hero}:${part.name}`;
  let c = centres.get(key);
  if (c) return c;
  model.updateMatrixWorld(true);
  _m.copy(model.matrixWorld).invert();
  _box.makeEmpty();
  const lod0 = part.getObjectByName(`${part.name}_lod0`) ?? part;
  lod0.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    _box.union(new THREE.Box3().copy(m.geometry.boundingBox!).applyMatrix4(new THREE.Matrix4().multiplyMatrices(_m, m.matrixWorld)));
  });
  c = _box.isEmpty() ? new THREE.Vector3() : _box.getCenter(new THREE.Vector3());
  centres.set(key, c);
  return c;
}

// true when the model-frame point is kept by every plane (three keeps the positive side)
export function insidePlanes(p: THREE.Vector3, planes: THREE.Plane[]) {
  for (const pl of planes) if (pl.distanceToPoint(p) < 0) return false;
  return true;
}
