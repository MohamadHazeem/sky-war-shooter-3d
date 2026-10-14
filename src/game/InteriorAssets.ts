import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assetUrl, take } from '../core/Assets';
import { envRef } from '../render/EnvRef';
import { Atmos } from '../render/Atmosphere';
import type { Quality } from '../core/Engine';
import { skinMaterial } from './InteriorKit';
import { interiorSkinTextures } from '../render/InteriorSkin';
import { crewFabric } from '../render/CrewFabric';
import { yokeMaterial } from './PlayerHands';

// B-17 interior 2.0 (Phase 10 goal 07): the Blender-made assets of the gunner's world, loaded
// lazily in the background after the menu is up (core/Preload.ts) and only used from the Medium
// preset up; Low keeps the procedural interior of Viewmodels.ts / LivingInterior.ts.
//   models/crew.glb          skinned crewman (18 bones, LOD), clips idle/fire/hit/down/help/sit/
//                            kneel, the flak vest as its own mesh, 'fpArm' (the player's own arm)
//   models/b17_interior.glb  kitWaist, kitRadio, kitBay, kitBombs (structure and equipment)
// Sources: tools/interior (build.sh runs Blender and the meshopt compression).
//
// Interior light: the fuselage is lit by the sun through the windows (shadow-mapped) and by
// the daylight that bounces round the aluminium inside. The bounce is an emissive term scaled
// by each surface's own albedo (and the AO baked into the vertex colours), set once a frame
// from the sky: interiorLight().

export const CREW_GLB = 'models/crew.glb';
export const KIT_GLB = 'models/b17_interior.glb';

export interface InteriorAssets { crew: GLTF; kit: GLTF }
let assets: InteriorAssets | null = null;
let pending: Promise<InteriorAssets | null> | null = null;
let failed = false;

// Medium and up get the new interior; Low keeps today's
export const interiorHigh = (q: Quality) => q !== 'low';

export function interiorAssets(): InteriorAssets | null { return assets; }

function loader() {
  const l = new GLTFLoader();
  l.setMeshoptDecoder(MeshoptDecoder);
  return l;
}

// Download + parse both files (once); prio: core/Assets priority. Resolves null when they fail
// (the procedural interior stays).
export function loadInteriorAssets(prio = 6): Promise<InteriorAssets | null> {
  if (assets) return Promise.resolve(assets);
  if (failed) return Promise.resolve(null);
  pending ??= (async () => {
    try {
      const l = loader();
      const [cb, kb] = await Promise.all([take(CREW_GLB, prio), take(KIT_GLB, prio)]);
      const [crew, kit] = await Promise.all([l.parseAsync(cb, assetUrl('models/')), l.parseAsync(kb, assetUrl('models/'))]);
      interiorSkinTextures();   // generated now (background) rather than at the mission start
      tuneKit(kit.scene);
      tuneCrew(crew.scene);
      assets = { crew, kit };
      return assets;
    } catch (e) {
      console.warn('Interior assets unavailable, keeping the procedural interior', e);
      failed = true;
      return null;
    }
  })();
  return pending;
}

// ---------------- materials ----------------
const bounceMats = new Set<THREE.MeshStandardMaterial>();
const skyMats = new Set<THREE.MeshStandardMaterial>();
const bounce = new THREE.Color(), _sun = new THREE.Color();

// emissive x albedo: a soft fill that follows each surface's colour (and its baked AO)
export function addBounce(m: THREE.MeshStandardMaterial, k = 1) {
  m.userData.bounceK = k;
  m.emissive.setRGB(0, 0, 0);
  m.emissiveIntensity = 1;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    prev?.call(m, s, r);
    s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= diffuseColor.rgb;');
  };
  m.customProgramCacheKey = () => 'interiorBounce';
  bounceMats.add(m);
  return m;
}

function tuneKit(root: THREE.Object3D) {
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = mesh.receiveShadow = true;
    const m = mesh.material as THREE.MeshStandardMaterial;
    if (seen.has(m)) return;
    seen.add(m);
    m.side = THREE.FrontSide;
    m.envMap = envRef.tex;
    if (m.name === 'kitSky') { m.toneMapped = true; skyMats.add(m); mesh.castShadow = false; return; }
    if (m.name === 'kitGlow') { m.emissiveIntensity = 1.6; return; }
    if (m.name === 'kitMetal') { m.metalness = 0.6; m.roughness = 0.42; m.envMapIntensity = 0.32; addBounce(m, 0.75); }
    else { m.metalness = 0; m.roughness = 0.75; m.envMapIntensity = 0.12; addBounce(m, 1); }
  });
  root.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh && (mesh.material as THREE.Material).name === 'kitSky') mesh.castShadow = false; });
}

function tuneCrew(root: THREE.Object3D) {
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;   // skinned: the bind-pose bounds don't follow the clips
    const m = mesh.material as THREE.MeshStandardMaterial;
    if (seen.has(m)) return;
    seen.add(m);
    m.side = THREE.FrontSide;
    m.envMap = envRef.tex;
    if (m.name === 'crewHard') { m.roughness = 0.45; m.metalness = 0.15; m.envMapIntensity = 0.25; }
    else {
      const leather = m.name === 'crewLeather';
      m.roughness = leather ? 0.72 : 0.95; m.metalness = 0; m.envMapIntensity = leather ? 0.16 : 0.08;
      if (mesh.geometry.getAttribute('uv')) {
        const maps = crewFabric(leather);
        m.normalMap = maps.normal; m.roughnessMap = maps.rough; m.normalScale.setScalar(leather ? 0.55 : 0.4);
      }
    }
    addBounce(m, 1.35);
  });
}

// Per frame (LivingInterior.update): the daylight bouncing round the inside of the fuselage
export function interiorLight(sunIn: number) {
  const day = THREE.MathUtils.smoothstep(Atmos.sunElevationDeg, -4, 12);
  const h = Atmos.horizon;
  // sky light through the windows + sun bounced off the floor and the aluminium
  bounce.setRGB(h.r, h.g, h.b).multiplyScalar(0.05 + 0.03 * day)
    .add(_sun.copy(Atmos.sunColor).multiplyScalar(Atmos.sunIntensity * (0.006 + 0.012 * sunIn) * day));
  for (const m of bounceMats) m.emissive.copy(bounce).multiplyScalar(m.userData.bounceK ?? 1);
  for (const m of skyMats) m.emissive.setRGB(h.r, h.g, h.b).multiplyScalar(1.4);
}

// World.prewarm: compile the interior programs (bounce-patched standard, skinned crew) before play
let warmed = false;
export const interiorWarmed = () => warmed;
export function warmInteriorAssets(scene: THREE.Scene, at: THREE.Vector3): () => void {
  if (!assets) return () => {};
  warmed = true;
  const objs: THREE.Object3D[] = [];
  const kit = assets.kit.scene.clone();
  objs.push(kit);
  const crew = (assets.crew.scene as THREE.Object3D);
  const clone = cloneSkinned(crew);
  objs.push(clone);
  // the procedural skin (bounce-patched, vertex-coloured, one and both sides) and the turret control yokes
  const g = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.5), 3));
  objs.push(new THREE.Mesh(g, skinMaterial()), new THREE.Mesh(g, skinMaterial(true)), new THREE.Mesh(g, yokeMaterial()));
  // Authored hull meshes carry tangents; procedural shells do not. Warm both variants.
  const tangents = g.clone(); tangents.computeTangents();
  objs.push(new THREE.Mesh(tangents, skinMaterial()), new THREE.Mesh(tangents, skinMaterial(true)));
  for (const o of objs) {
    o.position.copy(at); o.position.y += 3;
    o.traverse((c) => { c.frustumCulled = false; });
    scene.add(o);
  }
  return () => { for (const o of objs) o.removeFromParent(); g.dispose(); tangents.dispose(); };
}

export function cloneSkinned(o: THREE.Object3D): THREE.Object3D { return skeletonClone(o); }
