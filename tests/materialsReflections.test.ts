import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { aircraftFinish, tuneAircraftGlass } from '../src/render/AircraftFinish';
import { auditMaterial } from '../src/render/MaterialAudit';
import { bindGlassReflection, reflectionUniforms } from '../src/render/GlassReflection';
import { SunCascades } from '../src/render/SunCascades';
import { FormationReflection, formationReflectionUniforms } from '../src/render/FormationReflection';
import { InteriorLight } from '../src/render/InteriorLight';
import { warmBatchedShadow } from '../src/render/ShadowWarmup';
import { Atmos } from '../src/render/Atmosphere';

describe('aircraft finishes and safe glass reflections', () => {
  it('warms untextured batched debris depth without leaking shadow or clipping state', () => {
    const scene=new T.Scene(), camera=new T.PerspectiveCamera(), target=new T.WebGLRenderTarget(1,1);
    const clipping=[new T.Plane()];let current: T.WebGLRenderTarget | null=null;
    const renderer={shadowMap:{enabled:false},clippingPlanes:clipping,
      getRenderTarget:()=>current,setRenderTarget:(t:T.WebGLRenderTarget|null)=>{current=t;},
      compile:(batch:T.BatchedMesh,c:T.Camera,lighting:T.Scene)=>{
        expect(batch.isBatchedMesh).toBe(true);expect((batch.material as T.MeshDepthMaterial).isMeshDepthMaterial).toBe(true);
        expect(batch.material.side).toBe(T.DoubleSide);expect(batch.geometry.getAttribute('normal')).toBeDefined();
        expect(c).toBe(camera);expect(lighting).toBe(scene);expect(current).toBe(target);
        expect(renderer.clippingPlanes).toEqual([]);expect(renderer.shadowMap.enabled).toBe(true);
        throw new Error('compile failed');
      },
    } as unknown as T.WebGLRenderer;
    expect(()=>warmBatchedShadow(renderer,scene,camera,target)).toThrow('compile failed');
    expect(current).toBe(null);expect(renderer.clippingPlanes).toBe(clipping);expect(renderer.shadowMap.enabled).toBe(false);
  });
  it('keeps glass samplers out of opaque programs and preserves baked ORM/clone finishes', () => {
    const skin = new T.MeshStandardMaterial(); skin.name = 'hero_skin';
    const orm = new T.Texture(); skin.aoMap = skin.roughnessMap = skin.metalnessMap = orm;
    const clone = skin.clone(); auditMaterial(clone);
    const shader = { uniforms: {}, fragmentShader: T.ShaderLib.standard.fragmentShader } as T.WebGLProgramParametersWithUniforms;
    clone.onBeforeCompile(shader, {} as T.WebGLRenderer);
    expect(aircraftFinish(clone)).toBe(1);
    expect(clone.aoMap).toBe(orm); expect(clone.roughnessMap).toBe(orm);
    expect(shader.fragmentShader).not.toContain('#define SWS_GLASS');
    const glass = new T.MeshStandardMaterial({ transparent: true }); glass.name = 'hero_glass'; auditMaterial(glass);
    glass.onBeforeCompile(shader, {} as T.WebGLRenderer);
    expect(shader.fragmentShader).toContain('#define SWS_GLASS');
    expect(glass.customProgramCacheKey()).not.toBe(clone.customProgramCacheKey());
    for (const name of ['crew', 'interior', 'rubber', 'propeller']) {
      const m = new T.MeshStandardMaterial(); m.name = name; expect(aircraftFinish(m)).toBe(0);
    }
  });
  it('uses a thin dielectric without a costly transmission pass and leaves paint alone', () => {
    const glass = new T.MeshPhysicalMaterial({ transmission: .55 }); glass.name = 'hero_glass';
    tuneAircraftGlass(glass);
    expect(glass.transmission).toBe(0); expect(glass.metalness).toBe(0);
    expect(glass.ior).toBe(1.46); expect(glass.depthWrite).toBe(false);
    const paint = new T.MeshStandardMaterial({ roughness: .72 }); paint.name = 'hero_skin';
    tuneAircraftGlass(paint); expect(paint.roughness).toBe(.72);
  });
  it('shares the safe HDR/depth copy without allocations or recompiling on quality changes', () => {
    const color = new T.Texture(), linearDepth = new T.Texture(), camera = new T.PerspectiveCamera();
    const matrix = reflectionUniforms.swsReflectionProjection.value;
    bindGlassReflection(color, linearDepth, camera, true);
    expect(reflectionUniforms.swsReflectionColor.value).toBe(color);
    expect(reflectionUniforms.swsReflectionDepth.value).toBe(linearDepth);
    expect(matrix.equals(camera.projectionMatrix)).toBe(true);
    bindGlassReflection(color, linearDepth, camera, false);
    expect(reflectionUniforms.swsReflectionOn.value).toBe(0);
    expect(reflectionUniforms.swsReflectionProjection.value).toBe(matrix);
  });
  it('fits visible aircraft at 10–200 m with finer formation texels at the same map size', () => {
    const scene = new T.Scene(), sun = new T.DirectionalLight(); scene.add(sun, sun.target);
    const cascade = new SunCascades(scene, sun), camera = new T.PerspectiveCamera(62, 16 / 9, .03, 3000);
    camera.position.set(0, 7600, 0); camera.updateMatrixWorld();
    cascade.quality(2048, 40, true); cascade.update(camera, 4);
    // Nearby wing/fuselage intersections remain in the fine map through 38 m.
    const close = cascade.lights[0]; close.updateMatrixWorld(); close.shadow.updateMatrices(close);
    expect((close.shadow.camera.right - close.shadow.camera.left) / 2048).toBeLessThan(.07);
    for (const d of [10, 35, 50]) {
      const p = new T.Vector3(0, 7600, -d).applyMatrix4(close.shadow.matrix);
      expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(1);
      expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(1);
    }
    const light = cascade.lights[1]; light.updateMatrixWorld(); light.shadow.updateMatrices(light);
    expect((light.shadow.camera.right - light.shadow.camera.left) / 2048).toBeLessThan(520 / 2048 * .7);
    for (const d of [10, 50, 100, 150, 200]) {
      const p = new T.Vector3(0, 7600, -d).applyMatrix4(light.shadow.matrix);
      expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(1);
      expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(1);
    }
    expect(Atmos.sunDir.length()).toBeCloseTo(1);
  });
  it('stages six probe faces, skips unoccupied views and preserves borrowed aircraft parents', () => {
    const probe = new FormationReflection(), scene = new T.Scene(), eye = new T.PerspectiveCamera();
    const skin = new T.MeshStandardMaterial(); skin.name = 'hero_skin';
    const aircraft = new T.Mesh(new T.BoxGeometry(), skin); scene.add(aircraft);
    const ownAircraft = aircraft.clone(); ownAircraft.userData.reflectionExcluded = true; scene.add(ownAircraft);
    let draws = 0;
    const renderer = {
      autoClear: true, shadowMap: { autoUpdate: true },
      getRenderTarget: () => null, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
      getClearAlpha: () => 1, getClearColor: (c: T.Color) => c.set(0), setClearColor() {}, setRenderTarget() {},
      render: (borrowed: T.Scene) => { draws++; expect(borrowed.children).toContain(aircraft); expect(borrowed.children).not.toContain(ownAircraft); expect(aircraft.parent).toBe(scene); },
    } as unknown as T.WebGLRenderer;
    probe.update(renderer, scene, eye, false); expect(draws).toBe(0);
    for (let i = 0; i < 10; i++) probe.update(renderer, scene, eye, true);
    expect(formationReflectionUniforms.swsFormationOn.value).toBe(0);
    probe.update(renderer, scene, eye, true);
    expect(draws).toBe(6); expect(formationReflectionUniforms.swsFormationOn.value).toBe(1);
    expect(renderer.autoClear).toBe(true); expect(renderer.shadowMap.autoUpdate).toBe(true);
    eye.position.x = 100; probe.update(renderer, scene, eye, true);
    expect(formationReflectionUniforms.swsFormationOn.value).toBe(0);
    probe.update(renderer, scene, eye, false); expect(formationReflectionUniforms.swsFormationOn.value).toBe(0);
  });

  it('restores render state when the cabin-volume pass fails', () => {
    const light = new InteriorLight(), scene = new T.Scene(), camera = new T.PerspectiveCamera();
    camera.layers.set(1);
    const target = new T.WebGLRenderTarget(16, 16);
    let current: T.WebGLRenderTarget | null = target;
    const renderer = {
      autoClear: false, shadowMap: { autoUpdate: true },
      getRenderTarget: () => current, setRenderTarget: (t: T.WebGLRenderTarget | null) => { current = t; },
      getClearAlpha: () => 1, getClearColor: (c: T.Color) => c.set(0), setClearColor() {},
      render: () => { expect(camera.layers.mask).toBe(4); throw new Error('draw failed'); },
    } as unknown as T.WebGLRenderer;
    light.setSize(1920, 1080);
    expect(() => light.render(renderer, scene, camera)).toThrow('draw failed');
    expect(current).toBe(target); expect(camera.layers.mask).toBe(2);
    expect(renderer.autoClear).toBe(false); expect(renderer.shadowMap.autoUpdate).toBe(true);
  });

});
