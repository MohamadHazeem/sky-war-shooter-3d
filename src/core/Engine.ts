import * as THREE from 'three';
import { Atmos, atmosUniforms, syncAtmosUniforms } from '../render/Atmosphere';
import { CloudRenderer } from '../render/Clouds';
import { PostFX } from '../render/PostFX';
import { buildEnvironment, SkyDome } from '../render/Sky';
import { envRef } from '../render/EnvRef';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export type Quality = 'low' | 'medium' | 'high';

export interface Updatable { update(dt: number, time: number): void }

// Owns the WebGL renderer and the frame pipeline:
// scene (HDR + depth) -> volumetric clouds + aerial perspective -> bloom/motion blur/DOF/grade -> screen
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sky = new SkyDome();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly clouds: CloudRenderer;
  readonly post: PostFX;
  readonly reversed: boolean;
  private sceneRT: THREE.WebGLRenderTarget;
  private hdrRT: THREE.WebGLRenderTarget;
  private copyMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, vUv); }',
    depthTest: false, depthWrite: false,
  });
  private copyQuad = new FullScreenQuad(this.copyMat);
  private updatables = new Set<Updatable>();
  private last = 0;
  time = 0;
  timeScale = 1;
  paused = false;
  quality: Quality = 'high';
  width = 1;
  height = 1;
  pixelRatio = 1;
  onFrame?: (dt: number, time: number) => void;
  fps = 60;
  private fpsAcc = 0;
  private fpsN = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      reversedDepthBuffer: true,
      stencil: false,
    } as THREE.WebGLRendererParameters);
    this.reversed = this.renderer.capabilities.reversedDepthBuffer === true;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.localClippingEnabled = true; // aircraft breaking apart (Wrecks)
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = true;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(62, 1, this.reversed ? 0.03 : 0.08, 260000);
    this.scene.add(this.camera);

    const depthTex = () => {
      const d = new THREE.DepthTexture(1, 1);
      d.type = THREE.FloatType;
      d.format = THREE.DepthFormat;
      return d;
    };
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthTexture: depthTex(),
      samples: 0,
    });
    this.hdrRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.hdrRT.texture.minFilter = this.hdrRT.texture.magFilter = THREE.LinearFilter;

    this.scene.add(this.sky.mesh);
    syncAtmosUniforms();

    this.sun = new THREE.DirectionalLight(0xffffff, Atmos.sunIntensity * 0.95);
    this.sun.color.copy(Atmos.sunColor);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0x9fbce6, 0xd9dde4, 0.35);
    this.scene.add(this.hemi);

    this.clouds = new CloudRenderer(this.reversed);
    this.post = new PostFX(this.reversed);
    this.post.cloudTex = this.clouds.rt.texture;

    this.scene.environment = buildEnvironment(this.renderer, this.sky);
    envRef.tex = this.scene.environment;
    this.scene.environmentIntensity = 0.75;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // Re-derive sun light and the sky environment map after the atmosphere changed
  refreshLighting() {
    this.sun.color.copy(Atmos.sunColor);
    this.sun.intensity = Atmos.sunIntensity * 0.95;
    const old = this.scene.environment;
    this.scene.environment = buildEnvironment(this.renderer, this.sky);
    envRef.tex = this.scene.environment;
    old?.dispose();
    this.post.resetHistory();
  }

  add(u: Updatable) { this.updatables.add(u); }
  remove(u: Updatable) { this.updatables.delete(u); }

  setQuality(q: Quality) {
    this.quality = q;
    this.resize();
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const maxPr = this.quality === 'high' ? 1.5 : this.quality === 'medium' ? 1.0 : 0.75;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, maxPr);
    this.width = w; this.height = h;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    const pw = Math.floor(w * this.pixelRatio), ph = Math.floor(h * this.pixelRatio);
    this.sceneRT.setSize(pw, ph);
    this.hdrRT.setSize(pw, ph);
    this.clouds.setQuality(this.quality, pw, ph);
    this.post.setSize(pw, ph);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // Advance one frame. A fixed dt can be passed by automated playtests, which run in
  // background tabs where requestAnimationFrame is paused.
  frame(fixedDt?: number, render = true) {
    const now = performance.now();
    let dt = fixedDt ?? Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    const realDt = dt;
    dt = this.paused ? 0 : dt * this.timeScale;
    this.time += dt;
    Atmos.windOffset.addScaledVector(Atmos.wind, dt);
    for (const u of this.updatables) u.update(dt, this.time);
    this.onFrame?.(dt, this.time);
    if (render) this.render(realDt);
  }

  render(dt: number) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    // Keep the shadow frustum centred on the camera
    const cp = cam.getWorldPosition(new THREE.Vector3());
    this.sun.position.copy(cp).addScaledVector(Atmos.sunDir, 300);
    this.sun.target.position.copy(cp);
    this.sun.target.updateMatrixWorld();
    atmosUniforms.uCamAlt.value = cp.y;

    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    // Pass 1: opaque geometry (layer 0) -> HDR + depth
    this.sortLayers();
    cam.layers.set(0);
    r.render(this.scene, cam);
    // Clouds + aerial perspective composite
    this.clouds.render(r, cam, this.sceneRT, this.hdrRT, this.time);
    // Copy the composite back over the scene colour (keeping its depth buffer), then
    // pass 2: transparent effects (layer 1) on top of the clouds, depth-tested.
    r.autoClear = false;
    r.setRenderTarget(this.sceneRT);
    this.copyMat.uniforms.tSrc.value = this.hdrRT.texture;
    this.copyQuad.render(r);
    cam.layers.set(1);
    r.shadowMap.autoUpdate = false;
    r.render(this.scene, cam);
    r.shadowMap.autoUpdate = true;
    r.autoClear = true;
    cam.layers.set(0);
    this.post.render(r, cam, this.sceneRT, this.sceneRT.depthTexture!, this.time, dt);
  }

  // Transparent materials go to layer 1 (drawn after the clouds), everything else layer 0
  private sortLayers() {
    this.scene.traverse((o) => {
      if ((o as THREE.Light).isLight) { o.layers.enableAll(); return; }
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      const transparent = Array.isArray(m) ? m.some((x) => x.transparent) : m.transparent;
      o.layers.set(transparent && o !== this.sky.mesh ? 1 : 0);
    });
  }

  // Floating origin: shift the whole world so the camera stays near the origin horizontally.
  rebase(offset: THREE.Vector3) {
    for (const child of this.scene.children) {
      if (child === this.camera || child === this.sky.mesh || child === this.sun || child === this.sun.target || child === this.hemi) continue;
      if ((child as any).userData?.noRebase) continue;
      child.position.sub(offset);
    }
    Atmos.windOffset.add(offset);
  }
}
