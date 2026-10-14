import * as THREE from 'three';

/** Shade the distant sky/terrain at its own pixel budget; aircraft and interiors retain the
 * main resolution and depth edges. Low also shades its simplified terrain at half size.
 * Both materials stay alive and are warmed before play; no defines change with the preset. */
export class SkyCache {
  scale = 1;
  private readonly scene = new THREE.Scene();
  private readonly target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private readonly display: THREE.ShaderMaterial;
  private readonly source: THREE.Material;
  private readonly size = new THREE.Vector2();

  constructor(private readonly dome: THREE.Mesh) {
    const source = dome.material as THREE.ShaderMaterial;
    this.source = source;
    const capture = dome.clone();
    capture.material = source;
    this.scene.add(capture);
    this.display = new THREE.ShaderMaterial({
      uniforms: { ...source.uniforms, tBackground: { value: this.target.texture }, uScreen: { value: this.size } },
      vertexShader: source.vertexShader,
      fragmentShader: `uniform sampler2D tBackground; uniform vec2 uScreen;
        void main(){gl_FragColor=texture2D(tBackground,gl_FragCoord.xy/uScreen);}`,
      side: source.side, depthTest: true, depthWrite: false,
    });
  }

  setSize(w: number, h: number) {
    this.size.set(w, h);
    this.target.setSize(Math.max(1, Math.ceil(w * this.scale)), Math.max(1, Math.ceil(h * this.scale)));
  }

  renderBackground(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    if (this.scale >= 1) { this.dome.material = this.source; return; }
    this.dome.material = this.display;
    const target = renderer.getRenderTarget(), shadows = renderer.shadowMap.autoUpdate;
    const autoClear = renderer.autoClear;
    try {
      renderer.shadowMap.autoUpdate = false;
      renderer.autoClear = true;
      renderer.setRenderTarget(this.target);
      renderer.render(this.scene, camera);
    } finally {
      renderer.setRenderTarget(target);
      renderer.shadowMap.autoUpdate = shadows;
      renderer.autoClear = autoClear;
    }
  }
}
