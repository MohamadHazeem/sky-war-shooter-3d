import { cloudSurfaceUniforms } from './CloudSurfaceShadow';
import * as T from 'three';
import { cascadeUniform } from './SunCascades';
const audited=new WeakSet<T.Material>();
export const materialAudit={pbr:0,unlit:0,shader:0};
// Surface shaders and emissive/transparent effect materials intentionally remain unlit.
// Authored PBR maps are preserved; scalar inputs stay in physical ranges.
export function auditMaterial(m:T.Material){
 if(audited.has(m))return;audited.add(m);
 const s=m as T.MeshStandardMaterial;
 if(s.isMeshStandardMaterial){
  s.roughness=Math.max(.04,Math.min(1,s.roughness));s.metalness=Math.max(0,Math.min(1,s.metalness));
  if(/paint|fabric|rubber|tire|seat|wood|interior|crew/i.test(m.name))s.metalness=0;
  materialAudit.pbr++;
 }else if((m as T.ShaderMaterial).isShaderMaterial){materialAudit.shader++;return;}else materialAudit.unlit++;
 const before=m.onBeforeCompile,cache=m.customProgramCacheKey.bind(m),hook=before.toString();
 m.onBeforeCompile=(shader,renderer)=>{before.call(m,shader,renderer);shader.uniforms.swsShadowRanges=cascadeUniform;Object.assign(shader.uniforms,cloudSurfaceUniforms);};
 m.customProgramCacheKey=()=>cache()+'|renderer10|'+hook;
}
