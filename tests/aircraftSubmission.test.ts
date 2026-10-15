import { describe, expect, it, vi } from 'vitest';
import * as T from 'three';
import { AircraftSubmission, updateVisiblePose, registerFormationSource, registerBatchTint } from '../src/render/AircraftSubmission';
import { compactBomber } from '../src/world/CompactBomber';
import { HeroLOD, setHeroQuality } from '../src/world/HeroB17';

function fixture() {
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(), submit = new AircraftSubmission();
  const geometry = new T.BoxGeometry(), material = new T.MeshStandardMaterial();
  const roots = [new T.Group(), new T.Group()];
  const meshes = roots.map((r, i) => { r.userData.formationBatch = true; r.position.x = i * 10; const m = new T.Mesh<T.BufferGeometry, T.Material>(geometry, material); r.add(m); scene.add(r); return m; });
  return { scene, camera, submit, geometry, material, roots, meshes };
}
const batches = (s: T.Scene) => s.children.filter(o => (o as T.BatchedMesh).isBatchedMesh) as T.BatchedMesh[];

describe('formation submission', () => {
  it('skips opted-in empty effect callbacks but retains them during shader prewarm', () => {
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(), submit = new AircraftSubmission();
    const geometry = new T.InstancedBufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(9), 3));
    geometry.instanceCount = 0;
    const mesh = new T.Mesh(geometry, new T.ShaderMaterial());
    mesh.onBeforeRender = () => {};
    scene.add(mesh);
    expect(submit.prepare(scene, camera).children).toContain(mesh); // callbacks may generate their own geometry
    mesh.userData.emptyDrawSafe = true;
    expect(submit.prepare(scene, camera).children).not.toContain(mesh);
    submit.warming = true;
    expect(submit.prepare(scene, camera).children).toContain(mesh);
    submit.warming = false; geometry.instanceCount = 1;
    expect(submit.prepare(scene, camera).children).toContain(mesh);
  });

  it('shares a draw for repeated geometry without reparenting gameplay or hit-test objects', () => {
    const f = fixture(), out = f.submit.prepare(f.scene, f.camera), [b] = batches(out), m = new T.Matrix4();
    expect(batches(out)).toHaveLength(1); expect(b.instanceCount).toBe(2);
    b.getMatrixAt(1, m); expect(m.elements[12]).toBe(10);
    expect(f.meshes[1].parent).toBe(f.roots[1]); expect(f.scene.children).toEqual(f.roots);
    expect(f.meshes[0].visible).toBe(true); expect(b.material).toBe(f.material);
  });
  it('keeps each instance damage, material swaps, prop pivots and previous pose independent', () => {
    const f = fixture(); f.submit.prepare(f.scene, f.camera);
    f.meshes[0].position.z = 3; f.meshes[1].visible = false;
    const [b] = batches(f.submit.prepare(f.scene, f.camera)), m = new T.Matrix4();
    b.getMatrixAt(0, m); expect(m.elements[14]).toBe(3);
    expect(b.getVisibleAt(0)).toBe(true); expect(b.getVisibleAt(1)).toBe(false);
    expect(b.userData.previousBatchTexture.image.data[14]).toBe(0);
    f.meshes[1].visible = true; f.meshes[1].material = f.material.clone();
    expect(batches(f.submit.prepare(f.scene, f.camera))).toHaveLength(2);
    f.meshes[0].geometry = new T.SphereGeometry();
    expect(()=>f.submit.prepare(f.scene, f.camera)).not.toThrow();
    expect(f.meshes[1].material).not.toBe(f.material);
  });
  it('does not double draw descendants of a mesh and retains transparent ordering', () => {
    const f = fixture(), glass = new T.Mesh(f.geometry, new T.MeshBasicMaterial({transparent:true}));
    const child = new T.Mesh(f.geometry, f.material); glass.add(child); f.roots[0].add(glass);
    const out = f.submit.prepare(f.scene, f.camera), proxy = out.children.find(o=>!(o as T.BatchedMesh).isBatchedMesh)!;
    expect(proxy).not.toBe(glass); expect(proxy.children).toHaveLength(0); expect(glass.children).toEqual([child]);
    expect(batches(out)[0].instanceCount).toBe(3);
  });
  it('skips hidden matrix work, updates re-shown objects and selects LOD before descent', () => {
    const f = fixture(), lod = new HeroLOD();
    for (let i=0;i<3;i++) lod.addLevel(new T.Mesh(f.geometry, f.material), [0,180,650][i]);
    f.roots[0].add(lod); setHeroQuality(true);
    const near = vi.spyOn(lod.levels[0].object, 'updateMatrix'), far = vi.spyOn(lod.levels[2].object, 'updateMatrix');
    f.roots[1].visible = false; const hidden = vi.spyOn(f.meshes[1], 'updateMatrix');
    updateVisiblePose(f.scene, f.camera);
    expect(near).not.toHaveBeenCalled(); expect(far).toHaveBeenCalled(); expect(hidden).not.toHaveBeenCalled();
    f.roots[1].position.x = 20; f.roots[1].visible = true; updateVisiblePose(f.scene, f.camera);
    expect(f.meshes[1].matrixWorld.elements[12]).toBe(20); setHeroQuality(false);
  });
  it('resets history for reappearing sources and retires removed instances', () => {
    const f = fixture(); f.submit.prepare(f.scene, f.camera);
    f.meshes[0].visible=false;f.submit.prepare(f.scene,f.camera);
    f.meshes[0].visible=true;f.meshes[0].position.x=9;
    const [b]=batches(f.submit.prepare(f.scene,f.camera));
    expect(b.userData.previousBatchTexture.image.data[12]).toBe(9);
    f.scene.remove(f.roots[1]); for(let i=0;i<122;i++) f.submit.prepare(f.scene,f.camera);
    expect(b.instanceCount).toBe(1);
  });
  it('Low drops distant glass and prop sweeps but preserves nearby glass and the opaque airframe',()=>{
    const f=fixture();f.submit.low=true;f.roots[1].position.x=100;
    for(const r of f.roots)r.add(new T.Mesh(f.geometry,new T.MeshBasicMaterial({transparent:true})));
    const out=f.submit.prepare(f.scene,f.camera);
    expect(batches(out)[0].instanceCount).toBe(2);expect(out.children).toHaveLength(2);
  });
  it('keeps attached dust, lines and lamps in the render scene',()=>{
    const f=fixture(),dust=new T.Points(f.geometry,new T.PointsMaterial()),lamp=new T.PointLight();
    f.roots[0].add(dust,lamp);const out=f.submit.prepare(f.scene,f.camera);
    expect(out.children).toContain(dust);expect(out.children).toContain(lamp);
  });
  it('grows batch capacity with stable ids and releases GPU allocations at mission reset',()=>{
    const f=fixture();for(let i=0;i<65;i++)f.roots[0].add(f.meshes[0].clone());
    const [b]=batches(f.submit.prepare(f.scene,f.camera));expect(b.instanceCount).toBe(67);expect(b.maxInstanceCount).toBe(128);
    const dispose=vi.spyOn(b,'dispose'),texture=vi.spyOn(b.userData.previousBatchTexture,'dispose');
    f.submit.reset();expect(dispose).toHaveBeenCalledOnce();expect(texture).toHaveBeenCalledOnce();
    const [again]=batches(f.submit.prepare(f.scene,f.camera));expect(again).not.toBe(b);expect(again.instanceCount).toBe(67);
  });
  it('uses compact Low ships only while distant, closed-bay and non-player',()=>{
    const f=fixture(),compact=new T.Group(),part=new T.Mesh(f.geometry,f.material);
    compact.add(part);part.userData.batchTint=new T.Color();f.roots[0].position.x=200;f.scene.remove(f.roots[1]);
    const state={radius:1000,isPlayer:false,alive:true,falling:false,integrity:1,bayOpen:false};
    registerFormationSource(f.roots[0],state,compact);f.submit.low=true;
    const sourceUpdate=vi.spyOn(f.meshes[0],'updateMatrix');
    f.submit.prepare(f.scene,f.camera);expect(sourceUpdate).not.toHaveBeenCalled();
    for(const key of ['isPlayer','falling','bayOpen'] as const){state[key]=true;f.submit.prepare(f.scene,f.camera);expect(sourceUpdate).toHaveBeenCalled();sourceUpdate.mockClear();state[key]=false;}
    state.integrity=.5;const out=f.submit.prepare(f.scene,f.camera);expect(sourceUpdate).not.toHaveBeenCalled();
    const tint=new T.Color();batches(out)[0].getColorAt(0,tint);expect(tint.r).toBeCloseTo(.825);
  });
  it('bakes only the authored far LOD into a compact mesh without changing source transforms',()=>{
    const f=fixture(),source=new T.Group(),lod=new T.Group();lod.name='body_LOD2';
    const body=new T.Mesh(f.geometry,f.material);body.position.x=3;lod.add(body);source.add(lod);
    const near=body.clone();near.name='body_LOD0';near.position.x=100;source.add(near);
    const result=compactBomber(source);expect(result.children).toHaveLength(1);
    const mesh=result.children[0] as T.Mesh;mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox!.max.x).toBeCloseTo(3.5);expect(body.parent).toBe(lod);expect(body.position.x).toBe(3);
  });

  it('preserves partial draw ranges and mirrored transforms on the ordinary path',()=>{
    const f=fixture();f.meshes[0].geometry=f.geometry.clone();f.meshes[0].geometry.setDrawRange(0,3);
    f.meshes[1].scale.x=-1;const out=f.submit.prepare(f.scene,f.camera);
    expect(batches(out)).toHaveLength(0);expect(out.children).toEqual(f.meshes);
  });
  it('honours disabled per-object culling for deliberately unbounded geometry',()=>{
    const f=fixture();f.meshes[0].frustumCulled=false;
    const out=batches(f.submit.prepare(f.scene,f.camera));expect(out).toHaveLength(2);
    expect(out[0].perObjectFrustumCulled).toBe(false);expect(out[1].perObjectFrustumCulled).toBe(true);
  });

  it('culls off-screen aircraft as a whole but retains casters for a refreshing shadow map',()=>{
    const f=fixture();f.camera.updateMatrixWorld();
    const state={radius:1,isPlayer:false,alive:true,falling:false,integrity:1};
    f.roots[0].position.set(0,0,-10);f.roots[1].position.set(1000,0,-10);
    for(const root of f.roots)registerFormationSource(root,state,null);
    const hidden=vi.spyOn(f.meshes[1],'updateMatrix');
    f.submit.prepare(f.scene,f.camera);expect(hidden).not.toHaveBeenCalled();expect(f.roots[1].userData.submissionCulled).toBe(true);
    const sun=new T.DirectionalLight();sun.castShadow=true;sun.shadow.autoUpdate=false;sun.shadow.needsUpdate=true;
    sun.position.set(1000,100,-10);sun.target.position.set(1000,0,-10);sun.target.updateMatrixWorld();
    sun.shadow.camera.left=-50;sun.shadow.camera.right=50;sun.shadow.camera.top=50;sun.shadow.camera.bottom=-50;sun.shadow.camera.updateProjectionMatrix();
    f.scene.add(sun,sun.target);f.submit.prepare(f.scene,f.camera);
    expect(hidden).toHaveBeenCalled();expect(f.roots[1].userData.submissionCulled).toBe(false);
    hidden.mockClear();sun.shadow.needsUpdate=false;f.submit.prepare(f.scene,f.camera);expect(hidden).not.toHaveBeenCalled();
  });

});

it('shares fighter surfaces with independent soot and preserves a changed ace livery',()=>{
  const f=fixture(), shared=f.material.clone(), soot=[new T.Color(.4,.4,.4),new T.Color()];
  for(let i=0;i<2;i++) { const own=f.material.clone(); f.meshes[i].material=own; registerBatchTint(own,shared,soot[i]); }
  let out=batches(f.submit.prepare(f.scene,f.camera));expect(out).toHaveLength(1);
  const tint=new T.Color();out[0].getColorAt(0,tint);expect(tint.r).toBeCloseTo(.4);out[0].getColorAt(1,tint);expect(tint.r).toBe(1);
  const fragment = new T.Mesh(f.geometry,f.meshes[1].material); f.roots[1].add(fragment);
  soot[1].setScalar(.7);f.submit.prepare(f.scene,f.camera);out[0].getColorAt(1,tint);expect(tint.r).toBeCloseTo(.7); expect(out[0].instanceCount).toBe(3); out[0].getColorAt(2,tint);expect(tint.r).toBeCloseTo(.7);
  (f.meshes[0].material as T.MeshStandardMaterial).map=new T.Texture();
  out=batches(f.submit.prepare(f.scene,f.camera));expect(out).toHaveLength(2);
  expect(out.some(b=>b.material===f.meshes[0].material)).toBe(true);
});

it('skips empty pooled draws while retaining callbacks and reappearing instances',()=>{
  const f=fixture(),pool=new T.InstancedMesh(f.geometry,f.material,3);pool.count=0;f.scene.add(pool);
  expect(f.submit.prepare(f.scene,f.camera).children).not.toContain(pool);
  pool.count=1;expect(f.submit.prepare(f.scene,f.camera).children).toContain(pool);
  pool.count=0;pool.onBeforeRender=()=>{};expect(f.submit.prepare(f.scene,f.camera).children).toContain(pool);
});

it('reuses the main-camera multi-draw list for velocity but refreshes shadows and new frames',()=>{
  const f=fixture(), call=vi.spyOn(T.BatchedMesh.prototype,'onBeforeRender');
  const [b]=batches(f.submit.prepare(f.scene,f.camera));
  const render=(c:T.Camera)=>b.onBeforeRender({} as T.WebGLRenderer,f.scene,c,b.geometry,b.material as T.Material,{} as T.Group);
  render(f.camera);render(f.camera);expect(call).toHaveBeenCalledTimes(1);
  render(new T.PerspectiveCamera());render(f.camera);expect(call).toHaveBeenCalledTimes(3);
  f.submit.prepare(f.scene,f.camera);render(f.camera);expect(call).toHaveBeenCalledTimes(4);
});

it('invalidates flat traversal on attachment, removal and reparenting',()=>{
  const scene=new T.Scene(),camera=new T.Camera(),a=new T.Group(),b=new T.Group(),child=new T.Mesh();scene.add(a,b);
  a.position.x=3;b.position.x=8; updateVisiblePose(scene,camera);
  a.add(child);updateVisiblePose(scene,camera);expect(child.matrixWorld.elements[12]).toBe(3);
  b.add(child);updateVisiblePose(scene,camera);expect(child.matrixWorld.elements[12]).toBe(8);
  child.removeFromParent();b.position.x=10;updateVisiblePose(scene,camera);expect(child.matrixWorld.elements[12]).toBe(8);
  b.visible=false;b.add(child);updateVisiblePose(scene,camera);expect(child.matrixWorld.elements[12]).toBe(8);
  b.visible=true;updateVisiblePose(scene,camera);expect(child.matrixWorld.elements[12]).toBe(10);
});
