import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { aircraftFinish, tuneAircraftGlass } from '../src/render/AircraftFinish';
import { auditMaterial } from '../src/render/MaterialAudit';
import { bindGlassReflection, reflectionUniforms } from '../src/render/GlassReflection';
import { SunCascades } from '../src/render/SunCascades';
import { Atmos } from '../src/render/Atmosphere';

describe('aircraft finishes and safe glass reflections', () => {
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
    const light = cascade.lights[1]; light.updateMatrixWorld(); light.shadow.updateMatrices(light);
    expect((light.shadow.camera.right - light.shadow.camera.left) / 2048).toBeLessThan(520 / 2048 * .7);
    for (const d of [10, 50, 100, 150, 200]) {
      const p = new T.Vector3(0, 7600, -d).applyMatrix4(light.shadow.matrix);
      expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(1);
      expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(1);
    }
    expect(Atmos.sunDir.length()).toBeCloseTo(1);
  });
});
