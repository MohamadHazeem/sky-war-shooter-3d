import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ModelKind = 'b17' | 'fw190' | 'p51d' | 'p51d_cockpit';

const FILES: Record<ModelKind, string> = {
  b17: 'models/b17.glb',
  fw190: 'models/fw190.glb',
  p51d: 'models/p51d.glb',
  p51d_cockpit: 'models/p51d_cockpit.glb',
};

const cache = new Map<ModelKind, THREE.Object3D | null>();

export async function loadModels(onProgress?: (f: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  const kinds = Object.keys(FILES) as ModelKind[];
  let done = 0;
  await Promise.all(kinds.map(async (k) => {
    try {
      const gltf = await loader.loadAsync(import.meta.env.BASE_URL + FILES[k]);
      const root = gltf.scene;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats as THREE.MeshStandardMaterial[]) {
            if (mat.transparent && mat.opacity < 0.9) { m.castShadow = false; mat.depthWrite = false; }
            if (mat.map) mat.map.anisotropy = 8;
            mat.envMapIntensity = 1.0;
          }
        }
      });
      cache.set(k, root);
    } catch (e) {
      console.warn(`Model ${k} unavailable, using placeholder`, e);
      cache.set(k, null);
    }
    done++;
    onProgress?.(done / kinds.length);
  }));
}

export function hasModel(k: ModelKind) { return !!cache.get(k); }

export function instantiate(k: ModelKind): THREE.Object3D {
  const src = cache.get(k);
  if (src) return src.clone(true);
  return placeholder(k);
}

// Simple stand-in geometry so the game still runs if a model fails to load.
function placeholder(k: ModelKind): THREE.Object3D {
  const g = new THREE.Group();
  if (k === 'p51d_cockpit') return g;
  const big = k === 'b17';
  const span = big ? 31.6 : k === 'fw190' ? 10.5 : 11.3;
  const len = big ? 22.7 : 9.0;
  const col = big ? 0x7d7a55 : k === 'fw190' ? 0x6d7268 : 0xb8bcc0;
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
  const engines = big ? [7.6, 3.4, -3.4, -7.6] : [0];
  engines.forEach((x, i) => {
    const p = new THREE.Group();
    p.name = `prop_${i + 1}`;
    p.position.set(x, 0, big ? 3.2 : len / 2);
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

export interface PropInfo { node: THREE.Object3D; blades: THREE.Object3D[]; disc: THREE.Mesh; base: THREE.Quaternion; }

export function setupProps(root: THREE.Object3D, radius: number): PropInfo[] {
  const props: PropInfo[] = [];
  const nodes: THREE.Object3D[] = [];
  root.traverse((o) => { if (/^prop_\d+$/.test(o.name)) nodes.push(o); });
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  for (const node of nodes) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 48),
      new THREE.MeshBasicMaterial({ map: propDiscTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    disc.position.z = 0.05;
    disc.renderOrder = 5;
    disc.castShadow = false;
    node.add(disc);
    props.push({ node, blades: node.children.filter((c) => c !== disc), disc, base: node.quaternion.clone() });
  }
  return props;
}
