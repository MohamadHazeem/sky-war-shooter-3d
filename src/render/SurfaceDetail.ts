import * as THREE from 'three';

// Procedural surface detail on the aircraft skins, so they read as painted, worn, riveted
// machines up close (the Yarnhub look) without any new textures:
//  - panel lines (frames at constant Z, staggered seams across them) with a groove in the
//    normal and a little ambient darkening, and rivet rows beside every seam catching the
//    light; projected in model space along the dominant axis of the normal (triplanar
//    without the blend: the UV layouts are atlases, useless for this)
//  - per-panel tone: a faint touch-up patchwork on paint, the "patchwork aluminium" look on
//    natural metal (P-51, the B-17's Natural Metal scheme)
//  - weathering: paint chipped to bare aluminium on leading edges, sharp edges (curvature
//    from screen derivatives), wing roots and walkways; exhaust and oil streaks running aft
//    from the engines; grime along seams, in the wing-fuselage junction and underneath;
//    roughness variation (walkways worn shiny, grime dull, oil glossy)
// Everything fades with the pixel footprint (derivatives of the model-space position): the
// fine detail goes before it can alias, so nothing shimmers in the formation shots.
//
// How it composes. Aircraft materials are cloned all over the game (enemy tints, DamageLook,
// paint schemes, wreck pieces) and Material.clone() drops onBeforeCompile and defines but
// keeps userData. So the patch is installed on MeshStandardMaterial.prototype and keyed on
// `userData.surf` (set by prepareSurface when a model loads): every clone of a tagged
// material carries the detail, untagged materials compile exactly as before. A material
// with its own onBeforeCompile (PlayerBomberDamage's void-capable skin) calls patchSurface
// itself and adds surfaceKey() to its cache key.
// Per-model parameters (panel sizes, wear amounts, wing-root box, exhaust sources and the
// mesh-to-model transform) are per-material uniforms, so every tagged material of a given
// three.js feature set shares one program whatever the aircraft. The quality level is a
// define in the key: Low compiles the untouched shaders (no extra programs), Medium panel
// lines and rivets only, High/Ultra everything. A level change recompiles once.

export type SurfLevel = 0 | 1 | 2;

interface Source { p: [number, number, number]; w: [number, number]; len: number; k?: number }
interface Setup {
  panel: [number, number, number, number]; // frame spacing (m), seam spacing (m), seam half-width (m), rivet pitch (m)
  body: [number, number, number, number];  // fuselage half-width at the wing root, walkway width, wing-root chord z min, z max
  root: [number, number];                  // wing-root height (y) and half-height of the wing-fuselage junction
  wear: [number, number, number, number];  // chipping, grime, exhaust streaks, panel tone
  src: Source[];                           // exhaust / oil sources, streaking aft (-Z)
}

// Model frame: metres, +Z nose, +X left wing, +Y up (Models.ts). Engine positions from the
// prop_N / fan_N / exhaust nodes, moved back to the exhaust stacks / cowl flaps.
const B17_ENG = (x: number, y: number, z: number): Source => ({ p: [x, y, z], w: [0.55, 1.4], len: 6.5 });
const STACKS = (x: number, y: number, z: number, len: number, k = 1): Source[] =>
  [{ p: [x, y, z], w: [0.22, 0.16], len, k }, { p: [-x, y, z], w: [0.22, 0.16], len, k }];

const SETUPS: Record<string, Setup> = {
  // olive drab over neutral grey (or natural metal): big, heavily used airframe
  b17: {
    panel: [0.92, 1.55, 0.011, 0.085], body: [1.2, 1.5, -2.3, 1.4], root: [-0.4, 0.7], wear: [1.0, 1.0, 1.0, 0.7],
    src: [B17_ENG(3.02, -0.55, 2.3), B17_ENG(-3.02, -0.55, 2.3), B17_ENG(6.51, -0.2, 1.8), B17_ENG(-6.51, -0.2, 1.8)],
  },
  // natural metal: patchwork aluminium, exhaust stains along the nose
  p51d: { panel: [0.62, 1.0, 0.0075, 0.065], body: [0.5, 0.8, -2.0, 0.3], root: [-0.45, 0.4], wear: [0.3, 0.7, 1.0, 1.0], src: STACKS(0.37, 0.18, 1.35, 3.6) },
  // RLM camouflage (tints kept): cleaner, but sooty BMW 801 / DB 605 stacks
  fw190: { panel: [0.6, 0.95, 0.0075, 0.065], body: [0.5, 0.75, -1.5, 0.45], root: [-0.4, 0.35], wear: [0.65, 0.7, 1.0, 0.6], src: STACKS(0.48, -0.22, 0.75, 3.2) },
  bf109: { panel: [0.58, 0.95, 0.0075, 0.065], body: [0.45, 0.7, -1.1, 0.35], root: [-0.3, 0.35], wear: [0.65, 0.7, 1.0, 0.6], src: STACKS(0.36, 0.05, 1.5, 3.2) },
  bf110: {
    panel: [0.7, 1.15, 0.009, 0.075], body: [0.6, 0.9, -1.4, 1.6], root: [-0.3, 0.45], wear: [0.6, 0.75, 1.0, 0.6],
    src: [{ p: [2.35, -0.2, 1.5], w: [0.42, 0.45], len: 4.2 }, { p: [-2.35, -0.2, 1.5], w: [0.42, 0.45], len: 4.2 }],
  },
  ju88: {
    panel: [0.75, 1.2, 0.009, 0.075], body: [0.9, 1.0, -2.4, 2.0], root: [-0.2, 0.5], wear: [0.6, 0.8, 1.0, 0.6],
    src: [{ p: [2.79, -0.25, 2.0], w: [0.5, 0.5], len: 4.6 }, { p: [-2.76, -0.25, 2.0], w: [0.5, 0.5], len: 4.6 }],
  },
  // jets: soot only round the back of the nacelles
  me262: {
    panel: [0.65, 1.05, 0.008, 0.07], body: [0.55, 0.7, -2.0, 0.8], root: [-0.45, 0.35], wear: [0.5, 0.6, 0.7, 0.55],
    src: [{ p: [1.86, -0.85, -1.2], w: [0.4, 0.4], len: 1.6 }, { p: [-1.86, -0.85, -1.2], w: [0.4, 0.4], len: 1.6 }],
  },
  me163: { panel: [0.55, 0.9, 0.007, 0.06], body: [0.5, 0.6, -1.7, 0.7], root: [0.0, 0.35], wear: [0.5, 0.6, 0, 0.5], src: [] },
};

export interface SurfTag { k: string; xf: [number, number, number, number]; on: number }

// --- quality level ------------------------------------------------------------------------
const LEVELS: Record<string, SurfLevel> = { low: 0, medium: 1, high: 2, ultra: 2 };
let level: SurfLevel = 2;
let override: SurfLevel | null = null;   // dev: swsSurf.level(n) / ?surf=n
let debug = 0;                           // dev: mask views
const known = new Set<WeakRef<THREE.Material>>();
const seen = new WeakSet<THREE.Material>();

const effective = (): SurfLevel => override ?? level;

// Program cache key suffix for a tagged material ('' when the detail is off)
export function surfaceKey(m: THREE.Material): string {
  const l = effective();
  return m.userData.surf && l ? `|sws-surf-${l}${debug ? '-d' + debug : ''}` : '';
}

function relevel() {
  for (const r of known) {
    const m = r.deref();
    if (m) m.needsUpdate = true; else known.delete(r);
  }
}

// Called with the engine's quality tier (Game.applySettings and every frame: a no-op unless
// it changed). Changing the level recompiles the aircraft programs once.
export function syncSurfaceDetail(quality: string) {
  const l = LEVELS[quality] ?? 2;
  if (l === level) return;
  const before = effective();
  level = l;
  if (effective() !== before) relevel();
}

// --- the shader patch -----------------------------------------------------------------------
const VERT_PARS = /* glsl */ `
varying vec3 vSurfP;
varying vec3 vSurfN;
varying vec3 vSurfVX;
varying vec3 vSurfVY;
varying vec3 vSurfVZ;
uniform vec4 uSurfXf;
`;
// begin_vertex: geometry space (quantized models: a scale + offset per mesh) -> model metres;
// the model's axes in view space, to turn object-space bump gradients into view-space normals
const VERT = /* glsl */ `
vSurfP = transformed * uSurfXf.w + uSurfXf.xyz;
vSurfN = objectNormal;
vSurfVX = normalMatrix * vec3( 1.0, 0.0, 0.0 );
vSurfVY = normalMatrix * vec3( 0.0, 1.0, 0.0 );
vSurfVZ = normalMatrix * vec3( 0.0, 0.0, 1.0 );
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vSurfP;
varying vec3 vSurfN;
varying vec3 vSurfVX;
varying vec3 vSurfVY;
varying vec3 vSurfVZ;
uniform vec4 uSurfPanel;   // frame spacing, seam spacing, seam half-width, rivet pitch (m)
uniform vec4 uSurfBody;    // fuselage half-width, walkway width, wing-root z min, z max
uniform vec2 uSurfRoot;    // wing-root y, junction half-height
uniform vec4 uSurfWear;    // chips, grime, streaks, panel tone
uniform vec4 uSurfSrcA[ 4 ];  // exhaust source xyz, streak length
uniform vec4 uSurfSrcB[ 4 ];  // half-widths x / y, strength
uniform float uSurfOn;
vec3 sGradV = vec3( 0.0 );
float sOcc = 1.0;   // seam / grime occlusion of the ambient and reflected light
float sHash( vec2 p ) { p = fract( p * vec2( 0.1031, 0.1030 ) ); p += dot( p, p.yx + 33.33 ); return fract( ( p.x + p.y ) * p.x ); }
// 2D value noise on the projection plane (half the cost of 3D; the projection already
// switches with the dominant axis, like the panels)
float sNoise( vec2 x ) {
  vec2 i = floor( x ); vec2 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( sHash( i ), sHash( i + vec2( 1, 0 ) ), f.x ), mix( sHash( i + vec2( 0, 1 ) ), sHash( i + vec2( 1, 1 ) ), f.x ), f.y );
}
// One projection of the panel pattern. q.x runs along the frame axis (seams at constant q.x
// every F), q.y across it (seams every S, length and phase varying per frame bay).
// Out: seam line coverage, a soft band round the seams, rivet coverage, a per-panel random,
// the bump gradient in (q.x, q.y). w: pixel footprint (m).
void sPanels( vec2 q, float w, out float line, out float band, out float riv, out float tone, out vec2 g ) {
  float F = uSurfPanel.x, lw = uSurfPanel.z, rp = uSurfPanel.w;
  float bay = floor( q.x / F );
  float hb = sHash( vec2( bay, 17.0 ) );
  float S = uSurfPanel.y * ( 0.7 + 0.6 * hb );
  float qy = q.y + hb * 5.3;
  float col = floor( qy / S );
  float fx = fract( q.x / F ) * F, fy = fract( qy / S ) * S;
  float dx = min( fx, F - fx ), dy = min( fy, S - fy );
  float sx = fx < 0.5 * F ? 1.0 : -1.0, sy = fy < 0.5 * S ? 1.0 : -1.0;
  float d = min( dx, dy );
  // seam: anti-aliased, coverage-preserving below a pixel, gone well before it could alias
  float fade = 1.0 - smoothstep( 2.0 * lw, 7.0 * lw, w );
  line = ( 1.0 - smoothstep( max( lw - w, 0.0 ), lw + w, d ) ) * min( 1.0, lw / max( w, 1e-5 ) ) * fade;
  band = exp( -d / ( 4.5 * lw ) ) * ( 1.0 - smoothstep( 8.0 * lw, 30.0 * lw, w ) );
  // groove profile: the skin dips into the seam
  float gw = 1.6 * lw, u = d / gw;
  float slope = 1.1 * u * exp( -u * u ) * ( 1.0 - smoothstep( 1.0 * lw, 3.0 * lw, w ) );
  g = dx < dy ? vec2( sx * slope, 0.0 ) : vec2( 0.0, sy * slope );
  // rivet rows on both sides of each seam
  float ro = 3.2 * lw, rr = 0.7 * lw;
  vec2 r1 = vec2( dx - ro, ( fract( q.y / rp ) - 0.5 ) * rp );
  vec2 r2 = vec2( dy - ro, ( fract( q.x / rp + 0.5 ) - 0.5 ) * rp );
  bool first = dot( r1, r1 ) < dot( r2, r2 );
  vec2 r = first ? r1 : r2;
  float rd = length( r );
  float rfade = 1.0 - smoothstep( 0.6 * rr, 1.8 * rr, w );
  riv = ( 1.0 - smoothstep( max( rr - w, 0.0 ), rr + w, rd ) ) * rfade;
  // dome: the normal leans out from the rivet centre
  vec2 rq = first ? vec2( r.x * sx, r.y ) : vec2( r.y, r.x * sy );
  g -= rq / max( rd, 1e-4 ) * ( 0.5 * saturate( rd / rr ) * riv );
  tone = sHash( vec2( bay * 1.37 + 0.5, col ) ) - 0.5;
  tone *= 1.0 - smoothstep( 0.04, 0.25, w );
}
`;

// After metalnessmap_fragment: diffuse, roughness and metalness are all known
const FRAG_MAIN = /* glsl */ `
vec3 sp = vSurfP;
vec3 sn = normalize( vSurfN );
// pixel footprint in model metres: drives every fade (and the derivatives must come before
// the branches)
float w = max( length( dFdx( sp ) ), length( dFdy( sp ) ) );
#if SWS_SURF > 1
float curv = length( fwidth( sn ) ) / max( length( fwidth( sp ) ), 1e-4 );
#endif
// beyond ~0.35 m a pixel everything has faded out: distant aircraft (many tiny triangles,
// heavily over-shaded) pay nothing
if ( uSurfOn > 0.5 && w < 0.35 ) {
  vec3 san = abs( sn );
  // dominant-axis projection: wings and top/bottom (Y), fuselage sides and fin (X), fronts (Z)
  vec2 q; vec3 axA; vec3 axB;
  if ( san.y >= san.x && san.y >= san.z ) { q = sp.zx; axA = vSurfVZ; axB = vSurfVX; }
  else if ( san.x >= san.z ) { q = sp.zy; axA = vSurfVZ; axB = vSurfVY; }
  else { q = sp.xy; axA = vSurfVX; axB = vSurfVY; }
  float sLine, sBand, sRiv, sTone; vec2 sG;
  sPanels( q, w, sLine, sBand, sRiv, sTone, sG );
  bool sMetal = metalnessFactor > 0.5;
  float sSoot = clamp( max( diffuse.r, max( diffuse.g, diffuse.b ) ), 0.25, 1.0 );   // DamageLook soot / tints
  // panel tone: touch-up patchwork on paint, patchwork aluminium on bare metal
  float toneK = uSurfWear.w * ( sMetal ? 0.22 : 0.06 );
  diffuseColor.rgb *= 1.0 + sTone * toneK;
  roughnessFactor += sTone * ( sMetal ? 0.24 : 0.05 ) * uSurfWear.w;
  sOcc = ( 1.0 - 0.6 * sLine ) * ( 1.0 - 0.12 * sBand );
  // seams: dark line plus a little occlusion either side
  diffuseColor.rgb *= ( 1.0 - 0.55 * sLine ) * ( 1.0 - 0.1 * sBand );
  // rivets: bright, smoother heads that catch the sun
  diffuseColor.rgb *= 1.0 + 0.12 * sRiv;
  roughnessFactor -= 0.12 * sRiv;
#if SWS_SURF > 1
  // Weathering skips what is right at the camera (in the gun positions much of the screen is
  // the airframe's own inner skin within a metre or two: the most cost, the least to see) and
  // fades out with the footprint like the rest
  float sNear = smoothstep( 1.6, 2.8, length( vViewPosition ) ) * ( 1.0 - smoothstep( 0.2, 0.35, w ) );
  if ( sNear > 0.0 ) {
  float n1 = sNoise( q * 1.7 );
  float n2 = sNoise( q * 9.0 + 3.1 );
  float fine = 1.0 - smoothstep( 0.008, 0.03, w );
  float n3 = fine > 0.0 ? mix( 0.5, sNoise( q * 26.0 ), fine ) : 0.5;
  // exposure: leading edges and fronts, sharp edges (curvature), the walkway on the wing root
  float sEdge = smoothstep( 5.0, 18.0, curv ) * ( 1.0 - smoothstep( 0.03, 0.12, w ) );
  float sFwd = smoothstep( 0.4, 0.9, sn.z );
  float ax = abs( sp.x );
  float chord = smoothstep( uSurfBody.z - 0.25, uSurfBody.z + 0.25, sp.z ) * ( 1.0 - smoothstep( uSurfBody.w - 0.25, uSurfBody.w + 0.25, sp.z ) );
  float sWalk = smoothstep( uSurfBody.x - 0.2, uSurfBody.x + 0.1, ax ) * ( 1.0 - smoothstep( uSurfBody.x + 0.6 * uSurfBody.y, uSurfBody.x + uSurfBody.y, ax ) )
              * chord * smoothstep( 0.5, 0.85, sn.y );
  float sJoin = ( 1.0 - smoothstep( 0.0, 0.45, abs( ax - uSurfBody.x ) ) ) * chord
              * ( 1.0 - smoothstep( 0.5 * uSurfRoot.y, uSurfRoot.y, abs( sp.y - uSurfRoot.x ) ) );
  float expo = sFwd * 0.45 + sEdge * 0.45 + sWalk * 0.5;
  // chips through the paint to bare aluminium (painted skins only), with a dark paint edge
  float cn = n2 * 0.6 + n3 * 0.4 + ( n1 - 0.5 ) * 0.15;
  float ct = 0.94 - expo * 0.42 * uSurfWear.x;
  float sChip = sMetal ? 0.0 : smoothstep( ct, ct + 0.03, cn ) * step( 0.01, uSurfWear.x );
  float sChipEdge = sMetal ? 0.0 : ( smoothstep( ct - 0.035, ct, cn ) - sChip ) * step( 0.01, uSurfWear.x );
  // worn walkway: paint rubbed thin and shiny where boots go
  float scuff = sWalk * ( 0.55 + 0.45 * n2 ) * sNear;
  // exhaust / oil streaks running aft, spreading and fading, stretched along the flow
  float sStreak = 0.0;
  for ( int i = 0; i < 4; i ++ ) {
    vec4 a = uSurfSrcA[ i ]; vec4 b = uSurfSrcB[ i ];
    if ( b.z <= 0.0 ) continue;
    vec3 d = sp - a.xyz;
    float behind = -d.z;
    if ( behind < -0.3 || behind > a.w ) continue;
    float t = saturate( behind / a.w );
    float spread = 1.0 + 1.1 * t;
    vec2 e = d.xy / ( b.xy * spread );
    float s = exp( -dot( e, e ) * 1.6 ) * ( 1.0 - t ) * smoothstep( -0.3, 0.25, behind );
    sStreak = max( sStreak, s * b.z * 1.3 );
  }
  if ( sStreak > 0.002 ) {
    // streaky along the flow: one noise for all sources
    float flow = sNoise( vec2( ( sp.x + sp.y ) * 11.0, sp.z * 0.7 ) );
    sStreak *= 0.2 + 1.3 * flow * flow;
  }
  sStreak = saturate( sStreak * uSurfWear.z ) * sNear;
  sChip *= sNear; sChipEdge *= sNear;
  // grime: along the seams, in the wing-fuselage junction, underneath
  float sGrime = sBand * ( 0.35 + 0.65 * n2 ) * 0.5 + sJoin * ( 0.4 + 0.6 * n1 ) * 0.8
               + smoothstep( -0.3, -0.8, sn.y ) * n1 * 0.45;
  sGrime = saturate( sGrime * uSurfWear.y ) * sNear;

  diffuseColor.rgb *= 1.0 - 0.35 * sGrime;
  sOcc *= 1.0 - 0.3 * sGrime;
  roughnessFactor += 0.12 * sGrime + ( n1 - 0.5 ) * 0.12 * sNear;
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.12 + 0.015, scuff * 0.5 );
  roughnessFactor -= 0.22 * scuff;
  diffuseColor.rgb *= 1.0 - 0.45 * sChipEdge;
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.2, 0.205, 0.215 ) * sSoot, sChip );
  metalnessFactor = mix( metalnessFactor, 0.4, sChip );
  roughnessFactor = mix( roughnessFactor, 0.55, sChip );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.03, 0.026, 0.022 ), sStreak * 0.9 );
  roughnessFactor = mix( roughnessFactor, sMetal ? 0.45 : 0.4, sStreak * 0.7 );
#if SWS_SURF_DEBUG == 1
  diffuseColor.rgb = vec3( sChip, sStreak, sGrime ); metalnessFactor = 0.0;
#elif SWS_SURF_DEBUG == 2
  diffuseColor.rgb = vec3( sWalk, sJoin, sFwd ); metalnessFactor = 0.0;
#endif
  }
#endif
  roughnessFactor = clamp( roughnessFactor, 0.04, 1.0 );
  sGradV = sG.x * axA + sG.y * axB;
}
`;

// After normal_fragment_maps: lean the shading normal by the seam grooves and rivet domes
const FRAG_NORMAL = /* glsl */ `
normal = normalize( normal - 0.55 * ( sGradV - dot( sGradV, normal ) * normal ) );
`;

// Before aomap_fragment: grooves and grime hold back the sky light and reflections too (this
// is what makes seams read on bare metal, where the diffuse colour hardly matters)
const FRAG_OCC = /* glsl */ `
reflectedLight.indirectDiffuse *= sOcc;
reflectedLight.indirectSpecular *= sOcc;
reflectedLight.directSpecular *= mix( 1.0, sOcc, 0.5 );
`;

const ZERO4 = () => [0, 1, 2, 3].map(() => new THREE.Vector4());

// Patch a standard material's shader with the surface detail (no-op when untagged or off).
// Called from the MeshStandardMaterial prototype hook, or by a material with its own
// onBeforeCompile (after its own replacements: ours go right after the same includes, so
// they run first and its effects, e.g. charred void edges, land on top).
export function patchSurface(sh: THREE.WebGLProgramParametersWithUniforms, mat: THREE.Material) {
  const tag = mat.userData.surf as SurfTag | undefined;
  if (!tag) return;
  if (!seen.has(mat)) { seen.add(mat); known.add(new WeakRef(mat)); }
  const l = effective();
  if (!l) return;
  const s = SETUPS[tag.k];
  if (!s) return;
  const srcA = ZERO4(), srcB = ZERO4();
  s.src.slice(0, 4).forEach((e, i) => { srcA[i].set(e.p[0], e.p[1], e.p[2], e.len); srcB[i].set(e.w[0], e.w[1], e.k ?? 1, 0); });
  sh.uniforms.uSurfXf = { value: new THREE.Vector4(...tag.xf) };
  sh.uniforms.uSurfPanel = { value: new THREE.Vector4(...s.panel) };
  sh.uniforms.uSurfBody = { value: new THREE.Vector4(...s.body) };
  sh.uniforms.uSurfRoot = { value: new THREE.Vector2(...s.root) };
  sh.uniforms.uSurfWear = { value: new THREE.Vector4(...s.wear) };
  sh.uniforms.uSurfSrcA = { value: srcA };
  sh.uniforms.uSurfSrcB = { value: srcB };
  sh.uniforms.uSurfOn = { value: tag.on };
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT);
  sh.fragmentShader = `#define SWS_SURF ${l}\n#define SWS_SURF_DEBUG ${debug}\n` + sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + FRAG_MAIN)
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
    .replace('#include <aomap_fragment>', FRAG_OCC + '#include <aomap_fragment>');
}

let installed = false;
export function installSurfaceDetail() {
  if (installed) return;
  installed = true;
  const proto = THREE.MeshStandardMaterial.prototype as THREE.MeshStandardMaterial;
  const baseKey = proto.customProgramCacheKey;
  proto.onBeforeCompile = function (this: THREE.Material, sh: THREE.WebGLProgramParametersWithUniforms) { patchSurface(sh, this); };
  proto.customProgramCacheKey = function (this: THREE.Material) { return baseKey.call(this) + surfaceKey(this); };
}

// --- per-model setup (Models.ts, once per loaded model) -------------------------------------
// Tags the skin materials (`isSkin`: AircraftLook's painted / bare-metal / nacelle looks) with
// the model and the mesh-to-model transform. The meshes are quantized (each carries a scale
// and offset), so a material shared by meshes with different transforms (the B-17 skin on
// the airframe, turrets and props) gets one clone per transform: same program, own uniforms.
// Props and fans carry the tag switched off, so their blades share the program too.
const _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

export function prepareSurface(root: THREE.Object3D, kind: string, isSkin: (m: THREE.Material) => boolean,
  onClone: (orig: THREE.Material, copy: THREE.Material) => void) {
  if (!SETUPS[kind]) return;
  installSurfaceDetail();
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const made = new Map<string, THREE.Material>();
  const used = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let on = 1;
    for (let a: THREE.Object3D | null = o; a && a !== root; a = a.parent) if (/^(prop|fan)_\d+$/.test(a.name)) on = 0;
    _rel.multiplyMatrices(_inv, mesh.matrixWorld).decompose(_p, _q, _s);
    const xf: SurfTag['xf'] = [+_p.x.toFixed(4), +_p.y.toFixed(4), +_p.z.toFixed(4), +_s.x.toFixed(5)];
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((mat) => {
      if (!isSkin(mat)) return mat;
      const key = `${mat.uuid}|${xf.join()}|${on}`;
      let c = made.get(key);
      if (!c) {
        c = used.has(mat) ? mat.clone() : mat;
        if (c !== mat) onClone(mat, c);
        used.add(mat);
        c.userData.surf = { k: kind, xf, on } satisfies SurfTag;
        made.set(key, c);
      }
      return c;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
}

// --- dev hooks: window.swsSurf ------------------------------------------------------------
if (import.meta.env.DEV && typeof window !== 'undefined') {
  // ?surf=0|1|2 forces a level from the first frame (A/B program counts and benches)
  const q = new URLSearchParams(window.location.search).get('surf');
  if (q !== null && /^[012]$/.test(q)) override = Number(q) as SurfLevel;
  (window as unknown as Record<string, unknown>).swsSurf = {
    /** force a level (0 off, 1 panels, 2 full); null follows the quality tier */
    level(n: SurfLevel | null) { const b = effective(); override = n; if (effective() !== b) relevel(); return effective(); },
    /** mask views at level 2: 1 = chips / streaks / grime (RGB), 2 = walkway / junction / fronts */
    debug(n: number) { debug = n; relevel(); },
    setups: SETUPS,
  };
}
