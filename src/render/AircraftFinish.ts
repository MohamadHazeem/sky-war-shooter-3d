import * as T from 'three';
import { GLASS_REFLECTION_GLSL } from './GlassReflection';

const glassName = /glass/i;
const aircraftName = /^hero_(skin|neutral_grey|fw190|bf109|bf110|ju88|me262)/;

export function aircraftFinish(m: T.Material): number {
  if (glassName.test(m.name)) return m.transparent ? 2 : 0;
  if (aircraftName.test(m.name) || m.userData.surf) return 1;
  return 0;
}
/** Clear perspex retains dielectric Fresnel rather than a tinted opaque bubble. */
export function tuneAircraftGlass(m: T.MeshStandardMaterial) {
  if (!glassName.test(m.name)) return;
  m.color.setRGB(.82, .91, .96);
  m.roughness = .065; m.metalness = 0;
  m.opacity = .24; m.transparent = true; m.depthWrite = false;
  m.forceSinglePass = true; // thin panes need one double-sided draw, not two sorted shells
  const physical = m as T.MeshPhysicalMaterial;
  if (physical.isMeshPhysicalMaterial) { physical.transmission = 0; physical.ior = 1.46; }
}
let installed = false;
export function installAircraftFinish() {
  if (installed) return;
  installed = true;
  T.ShaderChunk.common += '\n#ifdef STANDARD\nuniform float swsFinish;\n' + '\n#ifdef SWS_GLASS\n' + GLASS_REFLECTION_GLSL + '\n#endif\n#endif\n';
  // ORM remains authoritative: satin paint, slightly broader brushed aluminium lobes.
  T.ShaderChunk.metalnessmap_fragment += `
#ifdef STANDARD
  if(swsFinish>.5 && swsFinish<1.5) roughnessFactor=clamp(roughnessFactor*mix(.48,.78,metalnessFactor),.13,.9);
#endif
`;
  T.ShaderChunk.normal_fragment_maps += `
#if defined(STANDARD) && defined(USE_MAP)
  if(swsFinish>.5 && swsFinish<1.5 && metalnessFactor>.5) {
    // UV-aligned brushed sheet response, with derivative filtering at formation distance.
    vec3 dpdx=dFdx(-vViewPosition), dpdy=dFdy(-vViewPosition);
    vec2 du=dFdx(vMapUv), dv=dFdy(vMapUv);
    vec3 tangent=dpdx*dv.y-dpdy*du.y;
    tangent-=normal*dot(normal,tangent);
    float len2=dot(tangent,tangent);
    if(len2>1e-12) {
      tangent*=inversesqrt(len2);
      vec3 eye=normalize(vViewPosition);
      normal=normalize(normal+tangent*dot(eye,tangent)*.16*metalnessFactor);
    }
  }
#endif
`;
  // Thin, clear dielectric: reflection replaces transmitted light by Fresnel weight.
  // Ordinary alpha-blended PBR also adds diffuse paint lighting to the pane.
  T.ShaderChunk.opaque_fragment = `
#if defined(STANDARD) && defined(SWS_GLASS)
  float glassF=.04+.96*pow(1.-abs(dot(normal,normalize(vViewPosition))),5.);
  diffuseColor.a=clamp(glassF,.04,.65);
  outgoingLight=(reflectedLight.directSpecular+reflectedLight.indirectSpecular)/diffuseColor.a;
#endif
` + T.ShaderChunk.opaque_fragment;
  T.ShaderChunk.aomap_fragment += `
#ifdef STANDARD
  if(swsFinish>.5 && swsFinish<1.5) {
    // A bumped normal must not reflect light from below its geometric surface.
    vec3 reflected=reflect(-normalize(vViewPosition),normal);
    float horizon=clamp(1.+dot(reflected,nonPerturbedNormal),0.,1.);
    reflectedLight.indirectSpecular*=horizon*horizon;
  }
#endif
#if defined(STANDARD) && defined(SWS_GLASS)
  if(swsFinish>1.5) {
    vec4 reflection=swsGlassReflection(-vViewPosition,normal);
    float fresnel=.04+.96*pow(1.-max(0.,dot(normal,normalize(vViewPosition))),5.);
    reflectedLight.indirectSpecular=mix(reflectedLight.indirectSpecular,reflection.rgb*fresnel,reflection.a*.75);
  }
#endif
`;
}
