import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { assetUrl, json, take } from '../core/Assets';

const materials = new Set<THREE.MeshStandardMaterial>();
let enabled = false;
export function enableHeroTextures() { enabled = true; }
let loading: Promise<void> | null = null;
let loaded: {base: THREE.Texture; normal: THREE.Texture; orm: THREE.Texture; silver: THREE.Texture; silverOrm: THREE.Texture} | null = null;
// The boot (embedded, readable) colour map of each hero material, kept when the streamed map replaces
// it: mod paint schemes recolour it on a canvas (render/Paint.ts)
const bootMaps = new WeakMap<THREE.Material, THREE.Texture>();
export const heroBootMap = (m: THREE.Material) => bootMaps.get(m);
function apply(m: THREE.MeshStandardMaterial) {
  if (m.map && !bootMaps.has(m) && !(m.map as THREE.CompressedTexture).isCompressedTexture) bootMaps.set(m, m.map);
  if (!loaded || m.name.endsWith('_low')) return;
  // Keep authored shader features stable: every replaced slot already had a boot texture.
  const silver = m.userData.paint === 'silver';
  if (m.map && !m.userData.modMap) m.map = silver ? loaded.silver : loaded.base;   // modMap: a mod's camouflage (render/Paint.ts)
  if (m.normalMap) m.normalMap = loaded.normal;
  if (m.roughnessMap) m.roughnessMap = silver ? loaded.silverOrm : loaded.orm;
  if (m.metalnessMap) m.metalnessMap = silver ? loaded.silverOrm : loaded.orm;
  if (m.aoMap) m.aoMap = silver ? loaded.silverOrm : loaded.orm;
}
export function registerHeroMaterial(m: THREE.MeshStandardMaterial) {
  if (!/^hero_(skin|neutral_grey)/.test(m.name) || materials.has(m)) return;
  materials.add(m); apply(m);
  m.addEventListener('dispose', () => materials.delete(m));
}
/** Menu is already visible when this optional upgrade starts; failure retains boot maps. */
export function loadHeroTextures(renderer: THREE.WebGLRenderer): Promise<void> {
  if (!enabled) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    const manifest = await json<{format: 'ktx2' | 'webp'}>('models/hero/manifest.json', 6);
    const loader = manifest.format === 'ktx2' ? new KTX2Loader().setTranscoderPath(assetUrl('models/hero/')).detectSupport(renderer) : null;
    try {
      const read = async (name: string) => {
        let bytes: ArrayBuffer;
        let compressed = !!loader;
        try { bytes = await take(`models/hero/${name}.${manifest.format}`, 6); }
        catch { bytes = await take(`models/hero/${name}.webp`, 6); compressed = false; }
        let t!: THREE.Texture;
        if (compressed && loader) {
          try { t = await new Promise<THREE.CompressedTexture>((resolve, reject) => loader.parse(bytes, resolve, reject)); }
          catch { bytes = await take(`models/hero/${name}.webp`, 6); compressed = false; }
        }
        if (!compressed) { const bitmap = await createImageBitmap(new Blob([bytes], {type:'image/webp'})); t = new THREE.Texture(bitmap); }
        t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
        t.colorSpace = (name === 'base' || name === 'silver') ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.needsUpdate = true; return t;
      };
      const [base, normal, orm, silver, silverOrm] = await Promise.all(['base','normal','orm','silver','silver-orm'].map(read));
      loaded = {base, normal, orm, silver, silverOrm};
      for (const m of materials) apply(m);
    } finally { loader?.dispose(); }
  })().catch(e => { console.warn('B-17 detail textures unavailable; retaining boot textures', e); });
  return loading;
}
