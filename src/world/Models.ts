import * as THREE from 'three';
import { markOwned } from '../render/Dispose';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { NOW, assetUrl, request, take } from '../core/Assets';
import { prepareAircraftSurface, tuneAircraftMaterial, useSkyEnv } from '../render/AircraftLook';

import { registerHeroMaterial } from './HeroTextures';
import { prepareHeroLODs, heroStreamGeometry } from './HeroB17';
import { isHero, prepareHero } from './HeroLook';

export type ModelKind =
  | 'b17' | 'fw190' | 'p51d' | 'p51d_cockpit'
  // Extra enemy types (see public/models/CREDITS.md). Same frame as the others: metres, +Z nose, +X left wing.
  // fw190, bf109, me262, bf110 and ju88 are the hero models (tools/hero/luftwaffe, world/HeroLook.ts):
  // named parts with three LODs, hinged control surfaces, baked PBR maps; the node names below still hold.
  | 'bf110'  // Bf 110 twin-engine heavy fighter: prop_1 (left), prop_2 (right), gun_rear (rear MG, yaw/pitch it)
  | 'me262'  // Me 262 jet: no props; fan_1/fan_2 are the intake fans (spin about local Z), exhaust_left/right markers
  | 'bf109'  // Bf 109 G-14: prop_1
  | 'ju88'   // Ju 88 A-4 twin-engine bomber: prop_1 (left), prop_2 (right)
  | 'me163'  // Me 163 Komet rocket fighter: no props; fan_1 is the small nose generator windmill, exhaust marker
  | 'he111'  // He 111 H bomber: prop_1 (left), prop_2 (right), gun_rear (dorsal MG, rest pose aft) + muzzle_rear
  | 'do335'; // Do 335 Pfeil: prop_1 (nose, tractor), prop_2 (behind the tail, pusher; also spins about local +Z)

const FILES: Record<ModelKind, string> = {
  b17: 'models/hero/b17.glb',
  fw190: 'models/fw190.glb',
  p51d: 'models/p51d.glb',
  p51d_cockpit: 'models/p51d_cockpit.glb',
  bf110: 'models/bf110.glb',
  me262: 'models/me262.glb',
  bf109: 'models/bf109.glb',
  ju88: 'models/ju88.glb',
  me163: 'models/me163.glb',
  he111: 'models/he111.glb',
  do335: 'models/do335.glb',
};

// The models the menu shows (formation + escorts) and the default enemy: loaded before the
// menu appears. The rest load in the background (see core/Preload.ts).
export const ESSENTIAL_MODELS: readonly ModelKind[] = ['b17', 'fw190', 'p51d'];
export const ALL_MODELS = Object.keys(FILES) as ModelKind[];
export const modelPath = (k: ModelKind) => FILES[k];

const cache = new Map<ModelKind, THREE.Object3D | null>();
const pending = new Map<ModelKind, Promise<void>>();
let loader: GLTFLoader | null = null;

// The .glb files are meshopt-compressed with WebP textures (tools/compress_models.mjs).
function gltfLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

// Load (download + parse) some models; resolves when all of them are in the cache
// (a model that fails keeps the placeholder). prio: download priority (core/Assets.ts).
export function loadModels(kinds: readonly ModelKind[] = ALL_MODELS, prio = NOW): Promise<void> {
  return Promise.all(kinds.map((k) => loadModel(k, prio))).then(() => {});
}

export function modelsLoaded(kinds: readonly ModelKind[] = ALL_MODELS) { return kinds.every((k) => cache.has(k)); }

function loadModel(k: ModelKind, prio: number): Promise<void> {
  if (cache.has(k)) return Promise.resolve();
  const p0 = pending.get(k);
  if (p0) { request(FILES[k], prio); return p0; } // moves it up the queue if it was waiting
  const p = (async () => {
    try {
      const bytes = await take(FILES[k], prio);
      const gltf = await gltfLoader().parseAsync(bytes, assetUrl('models/'));
      const root = gltf.scene;
      const skins = new Set<THREE.Material>();
      const hero = isHero(k);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats as THREE.MeshStandardMaterial[]) {
            if (mat.transparent && mat.opacity < 0.9) { m.castShadow = false; mat.depthWrite = false; }
            if (mat.map) mat.map.anisotropy = 8;
            // per-part roughness / metalness / sky reflection (render/AircraftLook.ts); the Luftwaffe
            // hero models bring their own baked maps (HeroLook.prepareHero)
            if (k === 'b17') { useSkyEnv(mat, /glass/.test(mat.name) ? 1.3 : .65); registerHeroMaterial(mat); }
            else if (!hero && tuneAircraftMaterial(mat, k)) skins.add(mat);
          }
        }
      });
      // panel lines, rivets and weathering on the skins (render/SurfaceDetail.ts); baked into the hero textures
      if (k === 'b17') {
        prepareHeroLODs(root);
        const stripes = root.getObjectByName('invasion_markings');
        if (stripes) stripes.visible = false;
      }
      else if (hero) prepareHero(root, k);
      else prepareAircraftSurface(root, k, skins);
      cache.set(k, root);
    } catch (e) {
      console.warn(`Model ${k} unavailable, using placeholder`, e);
      cache.set(k, null);
    }
    pending.delete(k);
  })();
  pending.set(k, p);
  return p;
}

let streamGeometry: THREE.BufferGeometry | null = null;
export function b17StreamGeometry() {
  const root = cache.get('b17');
  return root ? (streamGeometry ??= heroStreamGeometry(root)) : null;
}

export function hasModel(k: ModelKind) { return !!cache.get(k); }

export function instantiate(k: ModelKind): THREE.Object3D {
  const src = cache.get(k);
  if (src) return src.clone(true);
  return placeholder(k);
}

// Placeholder sizes for the extra enemy types: span, length, colour, prop positions [x, z]
// (roughly the converted models' bounding boxes and prop_N pivots).
const EXTRA_PLACEHOLDERS: Partial<Record<ModelKind, { span: number; len: number; col: number; props: [number, number][] }>> = {
  bf110: { span: 16.3, len: 12.5, col: 0x6b6a52, props: [[2.35, 2.4], [-2.35, 2.4]] },
  me262: { span: 12.6, len: 10.6, col: 0x5a5840, props: [] },
  bf109: { span: 9.8, len: 8.9, col: 0x5d6b4a, props: [[0, 2.4]] },
  ju88: { span: 20.0, len: 14.3, col: 0x4f6040, props: [[2.79, 2.9], [-2.76, 2.9]] },
  me163: { span: 8.8, len: 5.9, col: 0x5b5a45, props: [] },
  he111: { span: 22.5, len: 17.0, col: 0x55604a, props: [[2.68, 3.16], [-2.68, 3.16]] },
  do335: { span: 13.8, len: 13.8, col: 0x4e5e3c, props: [[0, 4.79], [0, -8.44]] },
};

// Simple stand-in geometry so the game still runs if a model fails to load.
function placeholder(k: ModelKind): THREE.Object3D {
  const g = new THREE.Group();
  if (k === 'p51d_cockpit') return g;
  const big = k === 'b17';
  const extra = EXTRA_PLACEHOLDERS[k];
  const span = extra ? extra.span : big ? 31.6 : k === 'fw190' ? 10.5 : 11.3;
  const len = extra ? extra.len : big ? 22.7 : 9.0;
  const col = extra ? extra.col : big ? 0x7d7a55 : k === 'fw190' ? 0x6d7268 : 0xb8bcc0;
  const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.65, metalness: 0.1 });
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(big ? 1.2 : 0.6, len - (big ? 2.4 : 1.2), 6, 12), mat);
  fus.rotation.x = Math.PI / 2;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(span, big ? 0.4 : 0.2, big ? 3.5 : 1.8), mat);
  wing.position.z = big ? 1 : 0.6;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(span * 0.35, 0.15, 1.6), mat);
  tail.position.z = -len * 0.45;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, big ? 4 : 1.6, 2.2), mat);
  fin.position.set(0, big ? 2 : 0.8, -len * 0.42);
  g.add(fus, wing, tail, fin);
  const engines: [number, number][] = extra ? extra.props
    : (big ? [7.6, 3.4, -3.4, -7.6] : [0]).map((x): [number, number] => [x, big ? 3.2 : len / 2]);
  engines.forEach(([x, z], i) => {
    const p = new THREE.Group();
    p.name = `prop_${i + 1}`;
    p.position.set(x, 0, z);
    g.add(p);
  });
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = o.receiveShadow = true; } });
  return g;
}

// Translucent spinning-propeller disc with faint blade streaks.
let discTex: THREE.Texture | null = null;
function propDiscTexture() {
  if (discTex) return discTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
      const r = Math.sqrt(dx * dx + dy * dy);
      const a = Math.atan2(dy, dx);
      let alpha = 0;
      let ring = 0; // 0..1 weight of the yellow tip ring
      if (r < 1 && r > 0.12) {
        const streak = 0.5 + 0.5 * Math.cos(a * 3);
        const inner = Math.min(1, (r - 0.12) * 8);
        // Faint two-blade shadow banding (cos 2a) reads as the blurred blade sweep.
        const band = 0.5 + 0.5 * Math.cos(a * 2);
        alpha = (0.05 + 0.1 * Math.pow(streak, 6) + 0.035 * Math.pow(band, 3)) * (1 - Math.pow(r, 6)) * inner;
        // Fine radial striations that fade out toward hub and rim, like motion streaks.
        alpha += 0.02 * Math.pow(0.5 + 0.5 * Math.cos(a * 17 + r * 2), 4) * 4 * r * (1 - r) * inner;
        if (r > 0.9) {
          ring = Math.exp(-Math.pow((r - 0.955) / 0.014, 2)); // thin yellow tip ring
          alpha += 0.16 * ring;
        }
      }
      const i = (y * S + x) * 4;
      img.data[i] = 40 + 160 * ring; img.data[i + 1] = 40 + 130 * ring; img.data[i + 2] = 38 + 2 * ring;
      img.data[i + 3] = Math.min(255, alpha * 255 * 1.6);
    }
  g.putImageData(img, 0, 0);
  discTex = new THREE.CanvasTexture(c);
  discTex.colorSpace = THREE.SRGBColorSpace;
  return discTex;
}

export interface PropInfo { node: THREE.Object3D; blades: THREE.Object3D[]; disc: THREE.Mesh; base: THREE.Quaternion; layered: boolean; }

const discGeos = new Map<number, THREE.CircleGeometry>(); // one disc geometry per size, shared

export function setupProps(root: THREE.Object3D, radius: number): PropInfo[] {
  const props: PropInfo[] = [];
  const nodes: THREE.Object3D[] = [];
  root.traverse((o) => { if (/^prop_\d+$/.test(o.name)) nodes.push(o); });
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  for (const node of nodes) {
    let geo = discGeos.get(radius);
    if (!geo) discGeos.set(radius, geo = new THREE.CircleGeometry(radius, 48));
    const disc = new THREE.Mesh(
      geo,
      markOwned(new THREE.MeshBasicMaterial({ map: propDiscTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide })),
    );
    disc.position.z = 0.05;
    disc.renderOrder = 5;
    disc.castShadow = false;
    node.add(disc);
    // The compressed models keep the prop's mesh on an unnamed child (extras.meshOf, see
    // tools/compress_models.mjs). Blades are what used to be the node's children: the
    // primitives of a multi-material prop; a single-mesh prop (formerly the node itself) has none.
    // A hero prop keeps its spinner (spinner_N) visible while the disc shows.
    const blades = node.children.flatMap((c) => c === disc || c.name.startsWith('spinner_') ? [] : c.userData.meshOf ? ((c as THREE.Mesh).isMesh ? [] : c.children) : [c]);
    props.push({ node, blades, disc, base: node.quaternion.clone(), layered: !!root.getObjectByName('B17G_HERO') });
  }
  return props;
}
