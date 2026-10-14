import { Engine } from '../src/core/Engine';
import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { adaptationWeight, exposureTarget, halton, historyDepthMatches, JITTER } from '../src/render/TemporalMath';
import { FILM_MOODS, filmColor, makeFilmLUT } from '../src/render/FilmLUT';
import { auditMaterial } from '../src/render/MaterialAudit';
import { SunCascades, cascadeUniform } from '../src/render/SunCascades';
import { cloudSurfaceUniforms } from '../src/render/CloudSurfaceShadow';
import { Atmos } from '../src/render/Atmosphere';
import { TemporalFrame } from '../src/render/TemporalFrame';
import { deviceTiers, pickQuality, TIERS } from '../src/render/QualityPick';

describe('renderer temporal contracts', () => {
 it('restores shared-scene matrix updates and camera projection if a pass fails',()=>{
  const e=Object.create(Engine.prototype) as Engine;
  const camera=new T.PerspectiveCamera(62,16/9,.03,260000),scene=new T.Scene(),temporal=new TemporalFrame(true);
  temporal.setSize(64,64);const projection=camera.projectionMatrix.clone();
  Object.assign(e,{camera,scene,temporal,quality:'high',cascades:{update(){}},post:{jitter:new T.Vector2()},
   sky:{mesh:{material:{uniforms:{uGroundXZ:{value:new T.Vector2()}}}}},sceneRT:{},hdrRT:{},
   renderer:{setRenderTarget(){},clear(){},render(){}},
   clouds:{sunShadow:1,groundShadowTexture:null,groundShadowBox:new T.Vector3(),render(){throw new Error('pass failed');}}});
  expect(()=>e.render(1/60)).toThrow('pass failed');
  expect(scene.matrixWorldAutoUpdate).toBe(true);expect(camera.projectionMatrix.equals(projection)).toBe(true);
 });
 it('uses eight distinct bounded subpixel offsets', () => {
  expect(halton(1,2)).toBe(.5);expect(halton(2,2)).toBe(.25);
  expect(new Set(JITTER.map(p=>p.join(','))).size).toBe(8);
  for(const p of JITTER)for(const c of p)expect(Math.abs(c)).toBeLessThanOrEqual(.5);
 });
 it('rejects disocclusion while allowing half-float depth quantisation', () => {
  expect(historyDepthMatches(.1,.101)).toBe(true);
  expect(historyDepthMatches(.1,.15)).toBe(false);
  expect(historyDepthMatches(.002,.02)).toBe(false);
  expect(historyDepthMatches(.002,.0021)).toBe(true);expect(historyDepthMatches(.002,.0023)).toBe(false);
 });
 it('adapts independently of frame rate and never brightens night without bound', () => {
  expect(1-(1-adaptationWeight(1/60,true))**60).toBeCloseTo(1-(1-adaptationWeight(1/30,true))**30,12);
  expect(adaptationWeight(0,true)).toBe(0);
  expect(adaptationWeight(1/60,false)).toBeGreaterThan(adaptationWeight(1/60,true));
  expect(exposureTarget(0)).toBe(1.6);expect(exposureTarget(1000)).toBe(.65);
 });
 it('restores projection exactly after jitter and resets on resize/cut', () => {
  const temporal=new TemporalFrame(true),cam=new T.PerspectiveCamera(62,16/9,.03,260000);
  temporal.setSize(1920,1080);cam.updateMatrixWorld();
  const original=cam.projectionMatrix.clone();temporal.begin(cam);
  expect(cam.projectionMatrix.equals(original)).toBe(false);temporal.end(cam);
  expect(cam.projectionMatrix.equals(original)).toBe(true);
  temporal.enabled=false;temporal.begin(cam);temporal.end(cam);expect(cam.projectionMatrix.equals(original)).toBe(true);
 });
});

describe('film LUTs',()=>{
 it('has bounded, monotonic neutral response and distinct moods',()=>{
  for(const mood of FILM_MOODS){let last=-1;for(let i=0;i<=100;i++){const c=filmColor(i/100,i/100,i/100,mood);for(const v of c){expect(v).toBeGreaterThanOrEqual(0);expect(v).toBeLessThanOrEqual(1);}const l=c[0]+c[1]+c[2];expect(l).toBeGreaterThanOrEqual(last);last=l;}}
  expect(filmColor(.3,.3,.3,'warm')).not.toEqual(filmColor(.3,.3,.3,'night'));
 });
 it('packs the LUT slices in shader lookup order without a colour-space conversion',()=>{
  const lut=makeFilmLUT('warm');expect(lut.image.width).toBe(256);expect(lut.image.height).toBe(16);expect(lut.colorSpace).toBe(T.NoColorSpace);
  const x=9,y=6,z=3,i=(y*256+z*16+x)*4,c=filmColor(x/15,y/15,z/15,'warm');
  for(let k=0;k<3;k++)expect(lut.image.data![i+k]).toBe(Math.round(c[k]*255));lut.dispose();
 });
});

describe('stable cascades and material audit',()=>{
 it('preserves material shader hooks, authored maps and HDR emissions',()=>{
  const material=new T.MeshStandardMaterial({roughness:0,metalness:.7,emissiveIntensity:12});material.name='paint';
  const map=new T.Texture();material.map=map;let called=0;material.onBeforeCompile=()=>{called++;};
  auditMaterial(material);auditMaterial(material);
  const shader={uniforms:{}} as T.WebGLProgramParametersWithUniforms;material.onBeforeCompile(shader,{} as T.WebGLRenderer);
  expect(called).toBe(1);expect(material.map).toBe(map);expect(material.metalness).toBe(0);expect(material.roughness).toBe(.04);expect(material.emissiveIntensity).toBe(12);expect(shader.uniforms.swsShadowRanges).toBe(cascadeUniform);
 });
 it('retains dynamic upstream shader keys across quality changes',()=>{
  const m=new T.MeshStandardMaterial();let level=0;m.customProgramCacheKey=()=>`detail-${level}`;auditMaterial(m);
  const low=m.customProgramCacheKey();level=2;expect(m.customProgramCacheKey()).not.toBe(low);
 });
 it('handles the first-render reversed depth transition without restoring a forward projection',()=>{
  const temporal=new TemporalFrame(true),camera=new T.PerspectiveCamera(60,1,.03,1000);
  temporal.setSize(64,64);camera.updateMatrixWorld();temporal.begin(camera);
  (camera as unknown as {_reversedDepth:boolean})._reversedDepth=true;camera.updateProjectionMatrix();temporal.end(camera);
  const expected=camera.projectionMatrix.clone();camera.updateProjectionMatrix();expect(camera.projectionMatrix.equals(expected)).toBe(true);
 });
 it('keeps three light slots across presets and updates the far maps at a lower cadence',()=>{
  const scene=new T.Scene(),sun=new T.DirectionalLight();scene.add(sun,sun.target);
  const cascades=new SunCascades(scene,sun),camera=new T.PerspectiveCamera();camera.position.set(0,7600,0);camera.updateMatrixWorld();
  cascades.quality(2048,40,true);cascades.update(camera,4);
  const positions=cascades.lights.map(l=>l.position.clone());
  for(const l of cascades.lights)l.shadow.needsUpdate=false;
  camera.position.x+=.00001;camera.updateMatrixWorld();cascades.update(camera,4);
  expect(cascades.lights[0].shadow.needsUpdate).toBe(true);expect(cascades.lights[1].shadow.needsUpdate).toBe(false);expect(cascades.lights[2].position.equals(positions[2])).toBe(true);
  expect(cascades.lights[0].position.distanceTo(positions[0])).toBeLessThan(.001);
  cascades.quality(1024,24,false);expect(cascades.lights).toHaveLength(3);expect(cascades.lights.every(l=>l.castShadow)).toBe(true);expect(cascadeUniform.value.z).toBe(0);expect(cascades.lights[2].shadow.mapSize.x).toBe(1);
  expect(Atmos.sunDir.length()).toBeCloseTo(1);
 });
 it('uses depth-convention-correct PCF bias and staggers expensive cascades',()=>{
  const scene=new T.Scene(),sun=new T.DirectionalLight(),camera=new T.PerspectiveCamera();
  scene.add(sun,sun.target);camera.updateMatrixWorld();
  const forward=new SunCascades(scene,sun,false),reverse=new SunCascades(scene,new T.DirectionalLight(),true);
  expect(forward.lights[0].shadow.bias).toBeLessThan(0);expect(reverse.lights[0].shadow.bias).toBeGreaterThan(0);
  reverse.quality(2048,40,true);
  for(let frame=0;frame<25;frame++){
   for(const light of reverse.lights)light.shadow.needsUpdate=false;
   reverse.update(camera,4);
   if(frame>0)expect(reverse.lights[1].shadow.needsUpdate&&reverse.lights[2].shadow.needsUpdate).toBe(false);
  }
 });
 it('shares spatial cloud-shadow uniforms with cloned PBR materials',()=>{
  const material=new T.MeshStandardMaterial(),copy=material.clone();auditMaterial(copy);
  const shader={uniforms:{}} as T.WebGLProgramParametersWithUniforms;
  copy.onBeforeCompile(shader,{} as T.WebGLRenderer);
  for(const [key,value] of Object.entries(cloudSurfaceUniforms))expect(shader.uniforms[key]).toBe(value);
 });
 it('offers Cinematic manually but caps automatic selection at Ultra',()=>{
  expect(TIERS.at(-1)).toBe('cinematic');expect(deviceTiers({touch:false,shortSide:1080,reducedData:false}).cap).toBe('ultra');
  expect(pickQuality({tier:'cinematic',stats:{p50:1,p90:1,n:90},refreshHz:60}).quality).toBe('ultra');
 });
});
