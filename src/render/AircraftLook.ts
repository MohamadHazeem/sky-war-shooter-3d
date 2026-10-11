import * as THREE from 'three';
import { Atmos } from './Atmosphere';
import { envRef } from './EnvRef';
import { installSurfaceDetail, prepareSurface } from './SurfaceDetail';

// How aircraft catch the light, tuned toward the Yarnhub "B-17 gunner" look: satin painted
// metal with a strong sun highlight, glossy canopies, matte interiors, and a sky-coloured
// Fresnel rim so the silhouettes read crisply against the sky and the cloud sea.

// --- Sky rim ---------------------------------------------------------------------------
// A global patch of the standard/physical lighting chunk (so every clone of an aircraft
// material keeps it: tints, paint schemes, damage looks and wreck pieces all clone).
// The rim colour is the hemisphere light's sky colour (synced from the atmosphere below),
// and it fades in beyond a few metres so the cockpit, guns and interior right at the
// camera never get it.
//
// Night: the fill (hemisphere light) drops to about a third of the day's (syncAircraftLook), and
// the rim with it, so aircraft read as night rather than grey-blue. What is close to the camera
// keeps some light back: the shader sees how far the fill is below the dusk level (DIM_REF, from
// the sky colour it is given: no extra uniform, no extra program) and, within a few tens of
// metres, restores the rim (a moonlit back light on the player's own P-51 in the chase view, the
// player's B-17 from the gun positions) and, right at the camera, part of the fill (cockpit and
// fuselage interiors stay readable). Enemies further out stay dark: their exhaust flames, the
// searchlights and the flares find them, as designed.
export const RIM_STRENGTH = 0.75;
export const HEMI_DAY = 0.35;          // hemisphere intensity on a clear day
const DIM_REF = HEMI_DAY * 0.7 * 0.9;  // brightest sky channel of the fill at dusk (no boost above it)
const RIM_GLSL = /* glsl */ `
#define SWS_RIM ${RIM_STRENGTH.toFixed(3)}
#define SWS_DIM_REF ${DIM_REF.toFixed(4)}
#if defined( STANDARD ) && NUM_HEMI_LIGHTS > 0
{
  float rimNoV = saturate( dot( normal, geometryViewDir ) );
  float rimView = length( vViewPosition );
  float rimDist = smoothstep( 3.5, 9.0, rimView );
  float rimF = pow( 1.0 - rimNoV, 5.0 ) * rimDist;
  // stronger where the surface faces up into the sky than toward the cloud sea
  float rimUp = 0.5 + 0.5 * saturate( dot( normal, hemisphereLights[ 0 ].direction ) * 0.5 + 0.5 );
  // how far the fill is below dusk (1 by day, ~2.2 at night), and what is near the camera
  vec3 rimSky = hemisphereLights[ 0 ].skyColor;
  float rimDim = clamp( SWS_DIM_REF / max( max( rimSky.r, max( rimSky.g, rimSky.b ) ), 1e-4 ), 1.0, 3.0 );
  float rimNear = 1.0 - smoothstep( 25.0, 60.0, rimView );
  reflectedLight.indirectSpecular += rimSky * ( rimF * rimUp * SWS_RIM * mix( 1.0, rimDim * 0.9, rimNear ) );
  reflectedLight.indirectDiffuse *= mix( 1.0, sqrt( rimDim ), 1.0 - smoothstep( 3.0, 9.0, rimView ) );
}
#endif
`;

let installed = false;
export function installAircraftLook() {
  if (installed) return;
  installed = true;
  THREE.ShaderChunk.lights_fragment_end += RIM_GLSL;
  // panel lines, rivets and weathering on the skins (SurfaceDetail.ts)
  installSurfaceDetail();
}

// Hemisphere light from the current sky: sky colour from the horizon/zenith blend, ground
// colour from the sunlit cloud sea. Feeds both the ambient fill and the rim above, so a
// dusk mission gets a warm rim and a clear day a cool blue one. The colour is normalised, so
// the darkness comes from the intensity: floored at 70 % of the day's down to dusk / storm
// light, then falling to about a third of the day's at night (the night sky is ~1/50 of the
// day's; at 80 % aircraft and cockpits read grey-blue). The rim GLSL above keeps what is near
// the camera readable.
const _c = new THREE.Color();
export function syncAircraftLook(hemi: THREE.HemisphereLight) {
  _c.copy(Atmos.horizon).lerp(Atmos.zenith, 0.4);
  const m = Math.max(_c.r, _c.g, _c.b, 1e-3);
  hemi.color.copy(_c.multiplyScalar(0.9 / m));
  _c.setRGB(1, 1, 1).lerp(Atmos.sunColor, 0.45);
  const g = Math.max(_c.r, _c.g, _c.b, 1e-3);
  hemi.groundColor.copy(_c.multiplyScalar(0.86 / g));
  const k = Atmos.cloudAmbient / 0.6;
  hemi.intensity = HEMI_DAY * (k >= 0.7 ? Math.min(k, 1.25) : 0.3 + (0.4 * Math.max(0, k)) / 0.7);
}

// --- Environment map with per-material intensity ------------------------------------
// three.js ignores envMapIntensity for scene.environment lighting, so tuned materials hold
// the sky env map explicitly. When the sky is rebuilt (weather) every material in the scene
// that referenced the old map, plus the cached model materials, move to the new one.
const tracked = new Set<THREE.MeshStandardMaterial>();
let retired: THREE.Texture | null = null;

export function useSkyEnv(mat: THREE.MeshStandardMaterial, intensity: number) {
  mat.envMapIntensity = intensity;
  if (envRef.tex) mat.envMap = envRef.tex;
  tracked.add(mat);
}

export function retargetEnvMaps(scene: THREE.Object3D, old: THREE.Texture | null, next: THREE.Texture | null) {
  if (!next) return;
  for (const m of tracked) m.envMap = next;
  if (!old) return;
  pastEnvs.add(old);
  scene.traverse((o) => {
    const mm = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!mm) return;
    for (const m of Array.isArray(mm) ? mm : [mm]) {
      const s = m as THREE.MeshStandardMaterial;
      if (s.envMap && pastEnvs.has(s.envMap)) s.envMap = next;
    }
  });
}

// Every sky env map that has been replaced. Something out of the scene during a weather change
// (the turret / tail interiors of the stations not manned, a cockpit) kept an older map, which
// is disposed one change later: the day sky mirrored in the tail glass at night, or a dead
// texture. Engine.sortLayers passes every material through here each frame.
const pastEnvs = new WeakSet<THREE.Texture>();
export function freshEnv(m: THREE.Material) {
  const s = m as THREE.MeshStandardMaterial;
  if (s.envMap && envRef.tex && pastEnvs.has(s.envMap)) s.envMap = envRef.tex;
}

// The caller disposes the old env map right after retargeting; anything detached from the
// scene at that moment (a hidden turret interior) would be left with a dead texture, so
// keep the previous one alive for one more weather change.
export function retireEnv(old: THREE.Texture | null) {
  retired?.dispose();
  retired = old;
}

// --- Per-part material setup (called from Models.ts after a model loads) -------------
interface Look { rough: number; metal: number; env: number }
const LOOKS: { test: RegExp; look: Look }[] = [
  // canopies and turret glass: glossy, the sky and sun mirrored in them
  { test: /glass/i, look: { rough: 0.03, metal: 0.0, env: 1.6 } },
  // insides seen through the windows: matte, barely reflective
  { test: /interior|interiour|panel|seat|pilot|crew/i, look: { rough: 0.85, metal: 0.05, env: 0.3 } },
  // gun barrels, exhausts, undercarriage: worn bare metal
  { test: /gun|exhaust|gear/i, look: { rough: 0.4, metal: 0.65, env: 0.9 } },
  // engine nacelles and cowlings: painted but oily, a little glossier than the skin
  { test: /engine/i, look: { rough: 0.46, metal: 0.3, env: 0.8 } },
];
// airframe skin: satin painted metal (olive drab / RLM greys) with a crisp sun highlight
// (big flat surfaces seen edge-on mirror the bright sky below ~0.6 roughness and lose their paint)
const SKIN: Look = { rough: 0.66, metal: 0.12, env: 0.6 };
// natural-metal P-51: polished aluminium
const BARE: Look = { rough: 0.32, metal: 0.72, env: 0.9 };

// Returns true for the airframe skin (painted, bare metal or nacelle): the surfaces that get
// panel lines, rivets and weathering (SurfaceDetail.ts).
export function tuneAircraftMaterial(mat: THREE.Material, kind: string): boolean {
  const m = mat as THREE.MeshStandardMaterial;
  if (!m.isMeshStandardMaterial) return false;
  // the P-51 cockpit sits around the camera: keep its authored surfaces, just tame reflections
  if (kind === 'p51d_cockpit') { useSkyEnv(m, /glass/i.test(m.name) ? 1.3 : 0.55); return false; }
  const part = LOOKS.find((l) => l.test.test(m.name));
  const look = part?.look ?? (kind === 'p51d' ? BARE : SKIN);
  m.roughness = look.rough;
  m.metalness = look.metal;
  useSkyEnv(m, look.env);
  return (!part || part.look === LOOKS[3].look) && !m.transparent && !/tire|wheel/i.test(m.name);
}

// After a model's materials are tuned: tag its skins for the surface detail. Materials it
// has to split per mesh transform are tracked for sky env map changes like the originals.
export function prepareAircraftSurface(root: THREE.Object3D, kind: string, skins: Set<THREE.Material>) {
  prepareSurface(root, kind, (m) => skins.has(m), (orig, copy) => {
    const s = copy as THREE.MeshStandardMaterial;
    if (s.isMeshStandardMaterial) useSkyEnv(s, (orig as THREE.MeshStandardMaterial).envMapIntensity);
  });
}
