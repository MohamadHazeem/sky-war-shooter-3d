import * as T from 'three';

interface FormationState { isPlayer: boolean; alive: boolean; falling: boolean; integrity: number; bayOpen?: boolean; radius?: number }
const identity = new T.Matrix4();
const tintedSources = new WeakMap<T.Material, {source: T.MeshStandardMaterial; material: T.MeshStandardMaterial; tint: T.Color; version: number}>();
/** DamageLook owns the source copy; rendering can share its unchanged surface and vary soot per instance. */
export function registerBatchTint(source: T.MeshStandardMaterial, material: T.MeshStandardMaterial, tint: T.Color) {
  tintedSources.set(source, {source, material, tint, version: source.version});
}
const formationSources = new WeakMap<T.Object3D, { state: FormationState; compact: T.Object3D | null }>();
export function registerFormationSource(root: T.Object3D, state: FormationState, compact: T.Object3D | null) {
  formationSources.set(root, { state, compact });
}

/** Flat pre-order traversal: skip a hidden subtree in one jump instead of recursing
 * through thousands of authored scaffold groups. Object3D structural events invalidate
 * the plan on damage, attachment or station changes; visibility/LOD stays live. */
class PosePlan {
  readonly nodes: T.Object3D[] = [];
  readonly end: number[] = [];
  dirty = true;
  private readonly changed = () => { this.dirty = true; };
  private append(o: T.Object3D) {
    const i = this.nodes.length; this.nodes.push(o); this.end.push(0);
    o.addEventListener('childadded', this.changed); o.addEventListener('childremoved', this.changed);
    for (const child of o.children) this.append(child);
    this.end[i] = this.nodes.length;
  }
  rebuild(root: T.Object3D) {
    for (const o of this.nodes) { o.removeEventListener('childadded', this.changed); o.removeEventListener('childremoved', this.changed); }
    this.nodes.length = this.end.length = 0; this.append(root); this.dirty = false;
  }
}
const poses = new WeakMap<T.Object3D, PosePlan>();
export function updateVisiblePose(root: T.Object3D, camera: T.Camera, visit?: (o: T.Object3D) => void) {
  if (!root.visible) return;
  let plan = poses.get(root);
  if (!plan) { plan = new PosePlan(); poses.set(root, plan); }
  if (plan.dirty) plan.rebuild(root);
  const nodes = plan.nodes, end = plan.end;
  for (let i = 0; i < nodes.length;) {
    const o = nodes[i];
    if (!o.visible) { i = end[i]; continue; }
    if (o.matrixAutoUpdate) o.updateMatrix();
    if (o.matrixWorldAutoUpdate) {
      if (o.parent) {
        if (!o.matrixAutoUpdate && o.matrix.equals(identity)) o.matrixWorld.copy(o.parent.matrixWorld);
        else o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
      } else o.matrixWorld.copy(o.matrix);
      o.matrixWorldNeedsUpdate = false;
    }
    if ((o as T.LOD).isLOD && (o as T.LOD).autoUpdate) (o as T.LOD).update(camera);
    if ((o as T.SkinnedMesh).isSkinnedMesh) { o.updateMatrixWorld(); if (visit) o.traverseVisible(visit); i = end[i]; continue; }
    visit?.(o); i++;
  }
}

interface Slot { id: number; previous: T.Matrix4; frame: number }
interface Batch {
  mesh: T.BatchedMesh; previous: T.DataTexture; geometries: Map<T.BufferGeometry, number>;
  slots: Map<T.Mesh, Slot>; used: number; vertices: number; indices: number;
}
interface Cached { geometry: T.BufferGeometry; material: T.Material; flags: number; batch: Batch; slot: Slot }
const CAPACITY = 32, HISTORY_SIZE = 12;
function mirrored(matrix: T.Matrix4) {
  const e = matrix.elements;
  return e[0]*(e[5]*e[10]-e[6]*e[9])-e[4]*(e[1]*e[10]-e[2]*e[9])+e[8]*(e[1]*e[6]-e[2]*e[5]) < 0;
}
const noBefore = T.Object3D.prototype.onBeforeRender;
function emptyDraw(o: T.Object3D) {
  const m = o as T.Mesh;
  return m.isMesh && (m.onBeforeRender === noBefore || m.userData.emptyDrawSafe) && !m.children.length &&
    ((m as T.InstancedMesh).isInstancedMesh && (m as T.InstancedMesh).count === 0 ||
      (m.geometry as T.InstancedBufferGeometry).isInstancedBufferGeometry && (m.geometry as T.InstancedBufferGeometry).instanceCount === 0 || m.geometry.drawRange.count === 0);
}

/** Render-only multi-draw instancing of formation parts. Sources retain individual
 * geometry, materials, visibility, animation and damage. No reparenting. BatchedMesh
 * falls back to ordinary draws when WEBGL_multi_draw is unavailable. */
export class AircraftSubmission {
  readonly scene = new T.Scene();
  private readonly batches = new Map<string, Batch>();
  private readonly cached = new WeakMap<T.Mesh, Cached>();
  private readonly proxies = new WeakMap<T.Mesh, T.Mesh>();
  private readonly layouts = new WeakMap<T.BufferGeometry, string>();
  private frame = 0;
  low = false;
  medium = false;
  allowCompact = true;
  warming = false;
  private readonly cameraPosition = new T.Vector3();
  private aircraftDistanceSq = 0;
  private readonly cameraFrustum = new T.Frustum();
  private readonly shadowFrusta = [new T.Frustum(), new T.Frustum(), new T.Frustum()];
  private readonly projection = new T.Matrix4();
  private readonly sphere = new T.Sphere();
  private shadows = 0;
  private shadowOverflow = false;
  private readonly collect = (o: T.Object3D) => {
    const m = o as T.Mesh;
    if (emptyDraw(o) && !(this.warming && o.userData.emptyDrawSafe)) return;
    if (!m.isMesh) {
      if ((o as T.Points).isPoints || (o as T.Line).isLine || (o as T.Sprite).isSprite || (o as T.Light).isLight) this.scene.children.push(o);
      return;
    }
    if (!this.warming && this.low && this.aircraftDistanceSq > 80 * 80 && !Array.isArray(m.material) && m.material.transparent) return;
    // Keep transparency ordering, custom callbacks, skinned and already pooled draws.
    if (Array.isArray(m.material) || m.material.transparent && !m.userData.formationPropSweep ||
        !(m.material as T.MeshStandardMaterial).isMeshStandardMaterial && !m.userData.formationPropSweep ||
        (m as T.InstancedMesh).isInstancedMesh || (m as T.SkinnedMesh).isSkinnedMesh ||
        m.onBeforeRender !== noBefore || m.onAfterRender !== T.Object3D.prototype.onAfterRender ||
        m.geometry.drawRange.start !== 0 || m.geometry.drawRange.count !== Infinity || mirrored(m.matrixWorld) || m.morphTargetInfluences || m.customDepthMaterial || m.customDistanceMaterial) {
      this.passthrough(m); return;
    }
    const binding = tintedSources.get(m.material);
    // Ace livery/map changes or a new shader configuration fall back to the owned material.
    const shared = binding && m.material === binding.source && binding.source.version === binding.version &&
      binding.source.map === binding.material.map && binding.source.side === binding.material.side &&
      binding.source.normalMap === binding.material.normalMap && binding.source.roughness === binding.material.roughness &&
      binding.source.metalness === binding.material.metalness && binding.source.clippingPlanes === binding.material.clippingPlanes;
    const material = shared ? binding.material : m.material;
    const tint = shared ? binding.tint : m.userData.batchTint as T.Color | undefined;
    const flags = +m.castShadow + 2 * +m.receiveShadow + 4 * +m.frustumCulled + 8 * +(!!tint) + 16 * m.renderOrder;
    let c = this.cached.get(m);
    if (!c || c.geometry !== m.geometry || c.material !== material || c.flags !== flags || this.batches.get(c.batch.mesh.name) !== c.batch) {
      if (c) { c.batch.mesh.deleteInstance(c.slot.id); c.batch.slots.delete(m); }
      let layout = this.layouts.get(m.geometry);
      if (!layout) {
        layout = Object.entries(m.geometry.attributes).map(([n,a]) => `${n}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort().join('|') + !!m.geometry.index;
        this.layouts.set(m.geometry, layout);
      }
      const key = `${material.uuid}/${flags}/${layout}`;
      let b = this.batches.get(key);
      if (!b) {
        const mesh = new T.BatchedMesh(CAPACITY, 4096, 12288, material);
        // Opaque and temporal velocity use the identical camera/pose. Reuse the
        // multi-draw list instead of culling and uploading its indirect texture twice.
        let preparedFrame = -1, preparedCamera: T.Camera | null = null, wireframe = false;
        mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
          const wire = !!(material as T.MeshStandardMaterial).wireframe;
          if (preparedFrame === this.frame && preparedCamera === camera && wireframe === wire) return;
          T.BatchedMesh.prototype.onBeforeRender.call(mesh, renderer, scene, camera, geometry, material, group);
          preparedFrame = this.frame; preparedCamera = camera; wireframe = wire;
        };
        mesh.name = key; mesh.matrixAutoUpdate = mesh.matrixWorldAutoUpdate = false;
        mesh.castShadow = m.castShadow; mesh.receiveShadow = m.receiveShadow;
        mesh.layers.set(0); mesh.renderOrder = m.renderOrder;
        mesh.frustumCulled = false; mesh.perObjectFrustumCulled = m.frustumCulled; mesh.sortObjects = material.transparent;
        const previous = new T.DataTexture(new Float32Array(HISTORY_SIZE * HISTORY_SIZE * 4), HISTORY_SIZE, HISTORY_SIZE, T.RGBAFormat, T.FloatType);
        previous.needsUpdate = true; mesh.userData.previousBatchTexture = previous;
        b = { mesh, previous, geometries: new Map(), slots: new Map(), used: -1, vertices: 4096, indices: 12288 };
        this.batches.set(key, b);
      }
      let geometry = b.geometries.get(m.geometry);
      if (geometry === undefined) {
        const vertices = m.geometry.attributes.position.count, indices = m.geometry.index?.count ?? 0;
        if (b.mesh.unusedVertexCount < vertices || b.mesh.unusedIndexCount < indices) {
          b.vertices = Math.max(b.vertices * 2, b.vertices + vertices);
          b.indices = Math.max(b.indices * 2, b.indices + indices);
          b.mesh.setGeometrySize(b.vertices, b.indices);
        }
        geometry = b.mesh.addGeometry(m.geometry); b.geometries.set(m.geometry, geometry);
      }
      if (b.mesh.instanceCount >= b.mesh.maxInstanceCount) {
        const capacity = b.mesh.maxInstanceCount * 2, size = Math.ceil(Math.sqrt(capacity * 4) / 4) * 4;
        b.mesh.setInstanceCount(capacity);
        const previous = new T.DataTexture(new Float32Array(size * size * 4), size, size, T.RGBAFormat, T.FloatType);
        (previous.image.data as Float32Array).set(b.previous.image.data as Float32Array);
        b.previous.dispose(); b.previous = previous; b.previous.needsUpdate = true; b.mesh.userData.previousBatchTexture = previous;
      }
      const slot = { id: b.mesh.addInstance(geometry), previous: m.matrixWorld.clone(), frame: -1 };
      b.slots.set(m, slot);
      c = { geometry: m.geometry, material, flags, batch: b, slot }; this.cached.set(m, c);
    }
    const { batch: b, slot } = c;
    if (b.used !== this.frame) { this.scene.children.push(b.mesh); b.used = this.frame; }
    b.mesh.setVisibleAt(slot.id, true);
    if (tint) b.mesh.setColorAt(slot.id, tint);
    if (!slot.previous.equals(m.matrixWorld) || slot.frame < 0) b.mesh.setMatrixAt(slot.id, m.matrixWorld);
    const old = slot.frame === this.frame - 1 ? slot.previous : m.matrixWorld;
    old.toArray(b.previous.image.data as Float32Array, slot.id * 16);
    slot.previous.copy(m.matrixWorld); slot.frame = this.frame;
  };

  private passthrough(m: T.Mesh) {
    if (!m.children.length) { this.scene.children.push(m); return; }
    let proxy = this.proxies.get(m);
    if (!proxy) { proxy = m.clone(false); proxy.matrixAutoUpdate = proxy.matrixWorldAutoUpdate = false; this.proxies.set(m, proxy); }
    proxy.matrixWorld.copy(m.matrixWorld); proxy.material = m.material; proxy.geometry = m.geometry;
    proxy.layers.mask = m.layers.mask; proxy.castShadow = m.castShadow; proxy.receiveShadow = m.receiveShadow;
    proxy.onBeforeRender = m.onBeforeRender; proxy.onAfterRender = m.onAfterRender;
    this.scene.children.push(proxy);
  }

  constructor() { this.scene.matrixWorldAutoUpdate = false; }

  reset() {
    for(const b of this.batches.values()) { b.mesh.dispose(); b.previous.dispose(); }
    this.batches.clear(); this.scene.children.length = 0;
  }

  prepare(source: T.Scene, camera: T.Camera, forceShadows = false): T.Scene {
    this.frame++;
    if(source.matrixAutoUpdate)source.updateMatrix();
    source.matrixWorld.copy(source.matrix);
    this.cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    this.cameraFrustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem, camera.reversedDepth);
    this.shadows = 0; this.shadowOverflow = false;
    for (const o of source.children) {
      const light = o as T.DirectionalLight;
      if (!light.isDirectionalLight || !light.castShadow || !light.visible || !(forceShadows || light.shadow.needsUpdate || light.shadow.autoUpdate)) continue;
      if (this.shadows === this.shadowFrusta.length) { this.shadowOverflow = true; break; }
      light.updateMatrixWorld(); light.shadow.updateMatrices(light);
      this.shadowFrusta[this.shadows++].copy(light.shadow.getFrustum());
    }
    const out = this.scene; out.children.length = 0;
    out.background = source.background; out.environment = source.environment; out.fog = source.fog;
    out.environmentIntensity = source.environmentIntensity;
    out.environmentRotation.copy(source.environmentRotation);
    out.overrideMaterial = source.overrideMaterial;
    for (const b of this.batches.values()) for (const slot of b.slots.values()) b.mesh.setVisibleAt(slot.id, false);
    for (const child of source.children) {
      if (!child.visible || (emptyDraw(child) && !(this.warming && child.userData.emptyDrawSafe))) continue;
      if (child.userData.formationBatch || this.warming) {
        this.aircraftDistanceSq = child.position.distanceToSquared(this.cameraPosition);
        const f = formationSources.get(child), state = f?.state;
        child.userData.submissionCulled = false;
        if (!this.warming && state && !this.shadowOverflow) {
          child.updateMatrix(); child.matrixWorld.multiplyMatrices(source.matrixWorld, child.matrix);
          this.sphere.center.setFromMatrixPosition(child.matrixWorld);
          this.sphere.radius = ((state.radius ?? 30) * 1.25 + 8) * Math.max(child.scale.x, child.scale.y, child.scale.z);
          let visible = this.cameraFrustum.intersectsSphere(this.sphere);
          for (let i=0; !visible && i<this.shadows; i++) visible = this.shadowFrusta[i].intersectsSphere(this.sphere);
          if (!visible) { child.userData.submissionCulled = true; continue; }
        }
        if (!this.warming && (this.low || this.medium) && this.allowCompact && f?.compact && state && !state.isPlayer && state.alive && !state.falling && !state.bayOpen && this.aircraftDistanceSq > (this.low ? 120 * 120 : 350 * 350)) {
          child.updateMatrix(); child.matrixWorld.multiplyMatrices(source.matrixWorld, child.matrix);
          for (const part of f.compact.children) {
            part.matrixWorld.copy(child.matrixWorld);
            (part.userData.batchTint as T.Color).setScalar(.65 + .35 * state.integrity);
            this.collect(part);
          }
        } else { updateVisiblePose(child, camera, this.collect); }
      }
      else { updateVisiblePose(child, camera); out.children.push(child); }
    }
    for (const [key, b] of this.batches) {
      if (b.used === this.frame && (this.warming || !this.low && !this.medium)) b.previous.needsUpdate = true;
      else if (this.frame - b.used > 120) {
        b.mesh.dispose(); b.previous.dispose(); this.batches.delete(key);
      }
      // Release dead aircraft identities without changing ids of surviving instances.
      for (const [m, slot] of b.slots) if (this.frame - slot.frame > 120) {
        b.mesh.deleteInstance(slot.id); b.slots.delete(m); this.cached.delete(m);
      }
    }
    return out;
  }
}
