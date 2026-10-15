import * as THREE from 'three';

// Low-sun rim light: an aircraft between the eye and a setting (or rising) sun gets a thin
// burning edge along its silhouette, light scattering through the haze around the airframe and
// glancing off the edges of wings, fins and cowlings. Only for a low sun (the term fades out
// above ~25 degrees of elevation, so day shots are untouched) and only for surfaces seen against
// it (forward lobe). At night the moon (a dim, cold key) gets the same silver rim at any height. Fades in beyond a few metres so cockpits and turret interiors never get it.
//
// A global patch of the standard/physical lights chunk, like AircraftLook's sky rim: no new
// uniform, no new program; it reads the sun (directional light 0) and the view matrix.
export const SUN_RIM = 1.5;
const SUN_RIM_GLSL = /* glsl */ `
#if defined( STANDARD ) && NUM_DIR_LIGHTS > 0
{
  vec3 srL = directionalLights[ 0 ].direction;
  vec3 srUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  float srLow = 1.0 - smoothstep( 0.08, 0.42, dot( srL, srUp ) );
  // moonlight (a dim, cold key at any height): a silver rim keeps backlit silhouettes readable
  vec3 srC = directionalLights[ 0 ].color;
  float srMoon = step( srC.r * 1.25, srC.b ) * ( 1.0 - smoothstep( 0.5, 0.9, dot( srC, vec3( 0.2126, 0.7152, 0.0722 ) ) ) );
  float srSun = srLow;
  srLow = max( srLow, srMoon * 1.1 );
  float srDist = smoothstep( 4.0, 12.0, length( vViewPosition ) );
  if ( srLow * srDist > 0.0 ) {
    float srNoV = saturate( dot( normal, geometryViewDir ) );
    float srEdge = pow( 1.0 - srNoV, 3.0 );
    // how directly the eye looks toward the sun past this point
    float srToward = pow( saturate( dot( -geometryViewDir, srL ) ), 3.0 );
    // the edge must face away from the eye toward the sun's side, not into the camera
    float srSide = saturate( dot( normal, srL ) * 0.6 + 0.55 );
    reflectedLight.indirectSpecular += directionalLights[ 0 ].color * ( srEdge * srToward * srSide * srLow * srDist * ${SUN_RIM.toFixed(3)} );
    // against a low sun the bright haze around it fills the shadowed side a little
    reflectedLight.indirectDiffuse += material.diffuseColor * directionalLights[ 0 ].color * ( 0.07 * srToward * srSun * srDist );
  }
}
#endif
`;

let installed = false;
export function installSunRim() {
  if (installed) return;
  installed = true;
  THREE.ShaderChunk.lights_fragment_end += SUN_RIM_GLSL;
}
