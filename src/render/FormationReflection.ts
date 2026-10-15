import * as T from 'three';
import { aircraftFinish } from './AircraftFinish';

export const formationReflectionUniforms = {
  swsFormationMap: { value: null as T.CubeTexture | null },
  swsFormationOn: { value: 0 },
};

/** Occupied glass sees aircraft behind the eye, outside SSR's depth buffer.
 * A small silhouette probe complements sky PMREM: one face every other frame,
 * only aircraft skins, no shadows/cloud march/interior/effects or extra scene traversal.
 * Source objects keep their parents and world matrices; only a render list is borrowed.
 */
export class FormationReflection {
  private target = new T.WebGLCubeRenderTarget(256, { type: T.HalfFloatType, generateMipmaps: false, minFilter: T.LinearFilter });
  private camera = new T.CubeCamera(22, 180, this.target);
  private scene = new T.Scene();
  private material = new T.MeshBasicMaterial({ color: new T.Color(.025, .035, .02), toneMapped: false, side: T.DoubleSide });
  private clear = new T.Color();
  private last = new T.Vector3();
  private face = 0;
  private mask = 0;
  private tick = 0;
  constructor() {
    this.camera.coordinateSystem = T.WebGLCoordinateSystem;
    this.camera.updateCoordinateSystem();
    this.scene.matrixWorldAutoUpdate = false;
    this.scene.overrideMaterial = this.material;
    formationReflectionUniforms.swsFormationMap.value = this.target.texture;
  }
  update(renderer: T.WebGLRenderer, source: T.Scene, eye: T.Camera, active: boolean, warm = false) {
    formationReflectionUniforms.swsFormationOn.value = 0;
    if (!active && !warm) { this.mask = 0; return; }
    if (this.last.distanceToSquared(eye.position) > 900) this.mask = 0;
    this.last.copy(eye.position);
    if (!warm && this.tick++ % 2) {
      formationReflectionUniforms.swsFormationOn.value = this.mask === 63 ? 1 : 0;
      return;
    }
    this.scene.children.length = 0;
    for (const o of source.children) {
      const m = (o as T.Mesh).material;
      if (m && !Array.isArray(m) && aircraftFinish(m) === 1) this.scene.children.push(o);
    }
    this.camera.position.copy(eye.position); this.camera.updateMatrixWorld(true);
    const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    const auto = renderer.autoClear, shadows = renderer.shadowMap.autoUpdate, alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clear);
    try {
      renderer.shadowMap.autoUpdate = false; renderer.autoClear = true; renderer.setClearColor(0, 0);
      renderer.setRenderTarget(this.target, this.face);
      renderer.render(this.scene, this.camera.children[this.face] as T.Camera);
      this.mask |= 1 << this.face; this.face = (this.face + 1) % 6;
    } finally {
      renderer.setClearColor(this.clear, alpha); renderer.autoClear = auto; renderer.shadowMap.autoUpdate = shadows;
      renderer.setRenderTarget(target, face, mip);
      this.scene.children.length = 0;
    }
    formationReflectionUniforms.swsFormationOn.value = this.mask === 63 ? 1 : 0;
  }
}
