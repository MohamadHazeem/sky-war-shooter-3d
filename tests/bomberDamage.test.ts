import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PlayerBomberDamage, meshToModel, skinVoidMaterial } from '../src/world/PlayerBomberDamage';

// The see-through damage voids are placed in the model frame (from hit points), while the
// shader sees each mesh's raw geometry positions. With KHR_mesh_quantization those are
// normalised int16 values and the mesh's node carries the dequantize scale + offset, so the
// shader has to map geometry space back to the model frame (uVoidM).

const Q = 32767;
// A quantized "airframe" like the compressed B-17: model root > airframe > node(T, S) > mesh
function quantizedModel(t: THREE.Vector3, s: number, rot = new THREE.Quaternion()) {
  const root = new THREE.Group();
  const airframe = new THREE.Group();
  airframe.name = 'airframe';
  const node = new THREE.Group();
  node.position.copy(t);
  node.scale.setScalar(s);
  node.quaternion.copy(rot);
  const pos = new Int16Array([0, 0, 0, Q, 0, 0, 0, Q, 0, -12000, 3000, 20000, 5000, -7000, -31000]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3, true));
  const mat = new THREE.MeshStandardMaterial({ color: 0x556644 });
  const mesh = new THREE.Mesh(g, mat);
  node.add(mesh);
  airframe.add(node);
  root.add(airframe);
  // the bomber flying somewhere, banked and yawed
  root.position.set(1234.5, 3050, -8800);
  root.quaternion.setFromEuler(new THREE.Euler(0.1, 2.3, -0.4));
  root.updateMatrixWorld(true);
  return { root, mesh, mat };
}

// What the patched vertex shader computes for vertex i: vVoidP = uVoidM * transformed
function shaderVoidP(m: THREE.Material, mesh: THREE.Mesh, i: number) {
  const sh = {
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    uniforms: {} as Record<string, THREE.IUniform>,
  };
  m.onBeforeCompile(sh as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
  expect(sh.vertexShader).toContain('vVoidP = ( uVoidM * vec4( transformed, 1.0 ) ).xyz;');
  const a = mesh.geometry.attributes.position;
  // `transformed`: the GPU dequantizes the normalised int16 to [-1, 1]
  const raw = new THREE.Vector3(a.array[i * 3] / Q, a.array[i * 3 + 1] / Q, a.array[i * 3 + 2] / Q);
  return { raw, p: raw.clone().applyMatrix4(sh.uniforms.uVoidM.value as THREE.Matrix4) };
}

describe('PlayerBomberDamage void coordinate space', () => {
  it('meshToModel includes the quantization node transform', () => {
    const { root, mesh } = quantizedModel(new THREE.Vector3(0, 1.6956, -5.0985), 15.7602);
    const m = meshToModel(mesh, root);
    // a full-scale vertex (int16 32767 on x) is 15.76 m out, offset by the node translation
    const v = new THREE.Vector3(1, 0, 0).applyMatrix4(m);
    expect(v.x).toBeCloseTo(15.7602, 4);
    expect(v.y).toBeCloseTo(1.6956, 4);
    expect(v.z).toBeCloseTo(-5.0985, 4);
  });

  it('a hit at a vertex lands exactly on that vertex in the shader space, whatever the node transform', () => {
    const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -0.7, 0.2));
    const { root, mesh, mat } = quantizedModel(new THREE.Vector3(0.4, 1.7, -5.1), 15.76, rot);
    const vm = skinVoidMaterial(mat, mesh, root);
    for (let i = 0; i < 5; i++) {
      // the hit: a world-space point on the skin (what Ballistics reports) ...
      const world = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
      mesh.localToWorld(world);
      // ... taken into the model frame as onHit does (bomber root frame, model at identity)
      const voidCentre = root.worldToLocal(world.clone());
      const { raw, p } = shaderVoidP(vm, mesh, i);
      expect(p.distanceTo(voidCentre)).toBeLessThan(1e-4);
      // the old shader compared against the raw quantized position: metres off
      if (i > 0) expect(raw.distanceTo(voidCentre)).toBeGreaterThan(1);
    }
    // distances in the shader space are model metres (void radii need no rescaling): the
    // full-scale vertex is the node scale away from the origin vertex, not 1 unit
    const { p: p1 } = shaderVoidP(vm, mesh, 1), { p: p0 } = shaderVoidP(vm, mesh, 0);
    expect(p1.distanceTo(p0)).toBeCloseTo(15.76, 3);
  });

  it('one void material per distinct mesh transform, shared when the transform repeats', () => {
    const a = quantizedModel(new THREE.Vector3(0, 1.6956, -5.0985), 15.7602);
    const b = quantizedModel(new THREE.Vector3(0, 0.2079, 0), 0.4668);
    // same source material on a second mesh with a different node transform
    b.mesh.material = a.mat;
    const ma = skinVoidMaterial(a.mat, a.mesh, a.root);
    const mb = skinVoidMaterial(a.mat, b.mesh, b.root);
    expect(ma).not.toBe(mb);
    expect((ma.userData.voidM as THREE.Matrix4).equals(meshToModel(a.mesh, a.root))).toBe(true);
    expect((mb.userData.voidM as THREE.Matrix4).equals(meshToModel(b.mesh, b.root))).toBe(true);
    // a clone of the same model (next mission, aircraft elsewhere) reuses the compiled clone
    const again = a.root.clone(true);
    again.position.set(-50, 900, 12);
    again.updateMatrixWorld(true);
    const mesh2 = again.getObjectByProperty('isMesh', true) as THREE.Mesh;
    expect(skinVoidMaterial(a.mat, mesh2, again)).toBe(ma);
    // all clones share one program
    expect(ma.customProgramCacheKey()).toBe(mb.customProgramCacheKey());
  });
});


it('warms the authored skin geometry and retains shared geometry after cleanup', () => {
  const skin = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  skin.geometry.setAttribute('tangent', new THREE.Float32BufferAttribute(new Float32Array(96), 4));
  skin.castShadow = skin.receiveShadow = true;
  let disposed = false; skin.geometry.addEventListener('dispose', () => { disposed = true; });
  const damage = Object.assign(Object.create(PlayerBomberDamage.prototype), { world: {}, skinMeshes: [skin] }) as PlayerBomberDamage;
  const scene = new THREE.Scene();
  const cleanup = damage.warmup(scene, new THREE.Vector3(0, 0, -20));
  const warm = scene.children.find(o => (o as THREE.Mesh).geometry === skin.geometry) as THREE.Mesh;
  expect(warm.material).toBe(skin.material); expect(warm.frustumCulled).toBe(false);
  expect(warm.castShadow && warm.receiveShadow).toBe(true);
  cleanup(); expect(scene.children).toHaveLength(0); expect(disposed).toBe(false);
});
