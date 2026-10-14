import { beginMarkerFrame } from '../ui/MarkerAudit';
import { Precipitation } from '../render/Precipitation';
import * as THREE from 'three';
import { Atmos, atmosUniforms, syncAtmosUniforms } from '../render/Atmosphere';
import { farTerrainUniforms } from '../render/FarTerrain';
import { cloudShadowUniforms } from '../render/CloudShadow';
import { weatherNow } from '../render/WeatherState';
import { CloudRenderer } from '../render/Clouds';
import { heatHaze, type HeatHaze } from '../render/HeatHaze';
import { PostFX } from '../render/PostFX';
import { softDepth } from '../render/SoftDepth';
import { buildEnvironment, SkyDome } from '../render/Sky';
import { envRef } from '../render/EnvRef';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { freshEnv, installAircraftLook, retargetEnvMaps, retireEnv, syncAircraftLook } from '../render/AircraftLook';
import { LivingSky } from '../render/LivingSky';
import { FpsCounter } from '../render/FpsCounter';
import { DRS_FAST, DRS_HARD, DRS_SLOW, drsFloor, drsTargetMs, fasterRefreshFrom, refreshFromTimestamps } from '../render/FrameTiming';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

// Per-tier render settings. `particles` scales the purely visual particle budgets
// (living sky: distant boxes, dogfights, flak puffs); other systems may read it too.
export interface QualityPreset {
  pixels: number;        // pixel budget of the main render targets (before dynamic resolution)
  msaa: number;          // scene MSAA samples
  shadows: number;       // sun shadow map size (0 = no shadows)
  shadowRange: number;   // half-width (m) of the shadow frustum around the camera
  cloudScale: number;    // volumetric cloud buffer scale
  cloudSteps: number;    // cloud raymarch steps (temporal path: on a quarter of the texels per frame)
  cloudTemporal: boolean; // jittered march + reprojected accumulation, silver linings, cloud shadows
  haze: boolean;         // heat-haze refraction (exhausts, muzzle blasts, explosion ripples)
  ao: number;            // screen-space contact AO strength (0 = off)
  particles: number;     // visual particle budget multiplier (0 = living sky off)
}
export const QUALITY: Record<Quality, QualityPreset> = {
  low:    { pixels: 0.9e6, msaa: 0, shadows: 1024, shadowRange: 24, cloudScale: 0.33, cloudSteps: 36, cloudTemporal: false, haze: false, ao: 0,   particles: 0 },
  medium: { pixels: 1.5e6, msaa: 2, shadows: 2048, shadowRange: 48, cloudScale: 0.38, cloudSteps: 40, cloudTemporal: true,  haze: true,  ao: 0,   particles: 0.5 },
  high:   { pixels: 2.3e6, msaa: 4, shadows: 2048, shadowRange: 40, cloudScale: 0.4,  cloudSteps: 44, cloudTemporal: true,  haze: true,  ao: 0.6, particles: 1 },
  ultra:  { pixels: 3.7e6, msaa: 4, shadows: 4096, shadowRange: 40, cloudScale: 0.5,  cloudSteps: 56, cloudTemporal: true,  haze: true,  ao: 0.7, particles: 1.6 },
};
export const QUALITY_ORDER: Quality[] = ['low', 'medium', 'high', 'ultra'];
// One tier down (the auto-quality fallback): ultra -> high -> medium -> low
export const lowerQuality = (q: Quality): Quality => QUALITY_ORDER[Math.max(0, QUALITY_ORDER.indexOf(q) - 1)];

export interface Updatable { update(dt: number, time: number): void }

// Owns the WebGL renderer and the frame pipeline:
// scene (HDR + depth) -> volumetric clouds + aerial perspective -> bloom/motion blur/DOF/grade -> screen
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly precipitation = new Precipitation(this.scene);
  readonly camera: THREE.PerspectiveCamera;
  readonly sky = new SkyDome();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly clouds: CloudRenderer;
  readonly post: PostFX;
  readonly livingSky: LivingSky;   // distant bomber boxes, dogfights and flak (purely visual)
  readonly heatHaze: HeatHaze = heatHaze;   // screen-space refraction emitters (HeatHaze.ts)
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
  // Runs just before onFrame, and keeps running when a screen takes over onFrame (the replay
  // theatre does): touch / gamepad input (DeviceControls)
  beforeFrame?: (dt: number) => void;
  // A screen with a scene of its own (the aircraft gallery, game/AircraftGallery.ts) draws it
  // here instead of the world: see renderStudio()
  renderOverride?: (dt: number) => void;
  // Takes over the animation loop while set: the graphics benchmark (game/AutoGraphics.ts)
  // runs its own timed frames in the menu's frame slots
  loopOverride?: () => void;
  fps = 60;
  // Dynamic resolution: the render scale drops when frames run long and creeps back up
  // when there is headroom; a scale that proved too slow becomes a ceiling for a while.
  renderScale = 1;
  private ftEma = 1 / 60;
  private drsT = 0;
  private drsHold = 0;
  private drsUp = 0;
  private drsCeil = 1;
  private drsCeilT = 0;
  private lastRaiseAt = -99;
  private fpsAcc = 0;
  private fpsN = 0;
  // Display refresh rate: measured from idle requestAnimationFrame intervals (probeRefresh)
  // and refined from live frame intervals. Dynamic resolution targets this frame time; on a
  // high-refresh display it gives up on the full rate (back to 60 fps) rather than drop the
  // resolution below a floor.
  refreshHz = 60;
  refreshMeasured = false;   // true once an idle-frame probe has run (else 60 Hz assumed)
  private intervals: number[] = [];
  private pendingHz: number | null = null;
  private hiGiveUp = false;
  private hiMiss = 0;
  private probing = false;
  private fpsCounter: FpsCounter | null = null;
  private lightRot = new THREE.Matrix4();

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
      samples: 4, // MSAA: clean aircraft and interior edges
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
    const sr = QUALITY.high.shadowRange;
    sc.left = -sr; sc.right = sr; sc.top = sr; sc.bottom = -sr; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0x9fbce6, 0xd9dde4, 0.35);
    this.scene.add(this.hemi);
    // sky rim / Fresnel on aircraft, coloured from the sky (AircraftLook.ts)
    installAircraftLook();

    this.clouds = new CloudRenderer(this.reversed);
    this.post = new PostFX(this.reversed);
    this.post.cloudTex = this.clouds.texture;
    this.heatHaze.setReversed(this.reversed);
    this.livingSky = new LivingSky();
    this.scene.add(this.livingSky.group);

    this.scene.environment = buildEnvironment(this.renderer, this.sky);
    envRef.tex = this.scene.environment;
    this.scene.environmentIntensity = 0.75;
    retargetEnvMaps(this.scene, null, envRef.tex);   // models may have loaded before the engine
    syncAircraftLook(this.hemi);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.post.film.prewarm(this.renderer, this.scene, this.camera);   // film look passes (FilmLook.ts): compiled up front
  }

  // Re-derive sun light and the sky environment map after the atmosphere changed
  // resetHistory = false: a gradual change (Weather.ts fronts rebuild the environment every few
  // seconds as the sky turns): the temporal cloud / post history stays, so nothing pops
  refreshLighting(resetHistory = true) {
    this.sun.color.copy(Atmos.sunColor);
    this.sun.intensity = Atmos.sunIntensity * 0.95;
    const old = this.scene.environment;
    this.scene.environment = buildEnvironment(this.renderer, this.sky);
    envRef.tex = this.scene.environment;
    // materials that hold the env map explicitly (per-material intensity) follow the new one
    retargetEnvMaps(this.scene, old, envRef.tex);
    syncAircraftLook(this.hemi);
    retireEnv(old);
    if (!resetHistory) return;
    this.post.resetHistory();
    this.clouds.resetHistory();
  }

  add(u: Updatable) { this.updatables.add(u); }
  remove(u: Updatable) { this.updatables.delete(u); }

  get preset(): QualityPreset { return QUALITY[this.quality]; }

  setQuality(q: Quality) {
    if (!QUALITY[q]) q = 'high';
    this.quality = q;
    const p = QUALITY[q];
    const maxSamples = (this.renderer.capabilities as { maxSamples?: number }).maxSamples ?? 4;
    this.sceneRT.samples = Math.min(p.msaa, maxSamples);
    this.sceneRT.dispose();
    this.resize();
    this.renderer.shadowMap.enabled = p.shadows > 0;
    this.sun.castShadow = p.shadows > 0;
    if (p.shadows > 0 && this.sun.shadow.mapSize.x !== p.shadows) {
      this.sun.shadow.mapSize.set(p.shadows, p.shadows);
      this.sun.shadow.map?.dispose();
      (this.sun.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
    }
    const sc = this.sun.shadow.camera;
    sc.left = -p.shadowRange; sc.right = p.shadowRange; sc.top = p.shadowRange; sc.bottom = -p.shadowRange;
    sc.updateProjectionMatrix();
    this.post.ao = p.ao;
    this.post.economy = q === 'low';
    atmosUniforms.uAtmosQuality.value = q === 'low' ? 0 : 1;
    this.heatHaze.enabled = p.haze;
    this.livingSky.setQuality(p.particles);
    // a new tier gets a fresh chance at the display's full refresh rate
    this.hiGiveUp = false; this.hiMiss = 0;
  }

  // Settings hook: quality tier and the FPS counter overlay
  applyGraphics(q: Quality, fpsCounter: boolean) {
    if (this.quality !== q) this.setQuality(q);
    this.setFpsCounter(fpsCounter);
  }

  setFpsCounter(on: boolean) {
    if (on && !this.fpsCounter) this.fpsCounter = new FpsCounter();
    else if (!on && this.fpsCounter) { this.fpsCounter.dispose(); this.fpsCounter = null; }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    // pixel budget instead of the raw device ratio: a Retina screen would otherwise render 4K
    const budget = QUALITY[this.quality].pixels;
    const base = Math.min(window.devicePixelRatio || 1, Math.sqrt(budget / Math.max(1, w * h)));
    this.pixelRatio = Math.max(0.4, base * this.renderScale);
    this.width = w; this.height = h;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    const pw = Math.floor(w * this.pixelRatio), ph = Math.floor(h * this.pixelRatio);
    this.sceneRT.setSize(pw, ph);
    this.hdrRT.setSize(pw, ph);
    this.clouds.setQuality(QUALITY[this.quality], pw, ph);
    this.post.setSize(pw, ph);
    this.heatHaze.setSize(pw, ph);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => { if (this.probing) return; if (this.loopOverride) this.loopOverride(); else this.frame(); });
    this.probeRefresh();
    // back from a hidden tab (or dragged to another screen and refocused): measure again
    document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => this.probeRefresh(), 300); });
  }

  // Measure the display refresh rate from idle requestAnimationFrame intervals: a dozen
  // frames (~0.1-0.2 s) with rendering skipped, so a slow frame can't pose as a slow
  // screen. Hidden tabs never fire rAF: the probe gives up after a second.
  probeRefresh() {
    if (this.probing || document.hidden) return;
    this.probing = true;
    const ts: number[] = [];
    const t0 = performance.now();
    const tick = (t: number) => {
      ts.push(t);
      if (ts.length < 14 && performance.now() - t0 < 1000) { requestAnimationFrame(tick); return; }
      this.probing = false;
      this.last = this.lastFrameAt = performance.now();
      const hz = refreshFromTimestamps(ts);
      if (hz) this.setRefresh(hz, true);
    };
    requestAnimationFrame(tick);
  }

  get refreshProbing() { return this.probing; }

  // One rendered frame of dt seconds, GPU synced with a 1-pixel readback: its full cost in ms
  // (sws.bench, the graphics benchmark). A fixed dt, so dynamic resolution sits it out.
  timedFrame(dt = 1 / 60): number {
    const gl = this.renderer.getContext();
    const t0 = performance.now();
    this.frame(dt, true);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _px);
    return performance.now() - t0;
  }

  private setRefresh(next: number, measured: boolean) {
    if (next !== this.refreshHz) { this.refreshHz = next; this.hiGiveUp = false; this.hiMiss = 0; this.ftEma = 1 / next; }
    if (measured) this.refreshMeasured = true;
  }

  // Frame time that dynamic resolution aims for: the refresh period, or 60 fps when a
  // high-refresh display can't be kept up with (and never faster than the display)
  get targetMs() { return drsTargetMs(this.refreshHz, this.hiGiveUp); }

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
    this.beforeFrame?.(dt);
    beginMarkerFrame();
    this.onFrame?.(dt, this.time);
    this.heatHaze.update(dt);
    this.precipitation.update(dt, this.time, this.quality);
    // after the game moved the formation, so the distant boxes stay locked to it
    this.livingSky.update(this.camera, this.time, this.height * this.pixelRatio);
    if (render) { if (this.renderOverride) this.renderOverride(realDt); else this.render(realDt); }
    if (fixedDt === undefined) {
      this.dynamicResolution(realDt);
      this.fpsCounter?.update(realDt, this);
    }
    this.lastFrameAt = now;
  }
  private lastFrameAt = 0;

  private dynamicResolution(dt: number) {
    if (dt <= 0 || dt > 0.25) return; // tab switches, breakpoints
    // live intervals: a display faster than measured shows up as frames shorter than its period
    this.intervals.push(dt * 1000);
    if (this.intervals.length >= 90) {
      // live frames can only reveal a faster display (a slow frame never means a slow screen)
      // (only after two windows in a row agree)
      const hz = fasterRefreshFrom(this.intervals, this.refreshHz);
      if (hz && hz === this.pendingHz) this.setRefresh(hz, false);
      this.pendingHz = hz;
      this.intervals = [];
    }
    this.ftEma += (dt - this.ftEma) * 0.06;
    this.drsT += dt;
    this.drsCeilT = Math.max(0, this.drsCeilT - dt);
    if (this.drsCeilT === 0) this.drsCeil = 1;
    if (this.drsT < 1) return;
    this.drsT = 0;
    if (this.drsHold > 0) { this.drsHold--; return; }
    const ms = this.ftEma * 1000;
    const target = this.targetMs;
    const hi = target < 1000 / 65;
    // high-refresh tier: don't trade more than ~28 % of the resolution for the extra frames
    const floor = drsFloor(target);
    if (hi && ms > target * DRS_SLOW && this.renderScale <= floor + 0.001) {
      // three misses in a row at the floor: this machine can't hold the full rate, run at 60
      if (++this.hiMiss >= 3) { this.hiGiveUp = true; this.hiMiss = 0; this.drsCeil = 1; this.drsCeilT = 0; }
      return;
    }
    if (ms > target * DRS_SLOW && this.renderScale > floor) {
      // a raise that made things slow sets a ceiling for the next 30 s
      if (this.time - this.lastRaiseAt < 6) { this.drsCeil = this.renderScale - 0.01; this.drsCeilT = 30; }
      this.renderScale = Math.max(floor, this.renderScale - (ms > target * DRS_HARD ? 0.15 : 0.08));
      this.drsUp = 0; this.drsHold = 1; this.hiMiss = 0;
      this.resize();
    } else if (ms < target * DRS_FAST && this.renderScale < Math.min(1, this.drsCeil)) {
      if (++this.drsUp >= 4) {
        this.renderScale = Math.min(1, this.drsCeil, this.renderScale + 0.07);
        this.drsUp = 0; this.drsHold = 2; this.lastRaiseAt = this.time;
        this.resize();
      }
    } else this.drsUp = 0;
  }

  render(dt: number) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    // Keep the shadow frustum centred on the camera, snapped to whole shadow-map texels in
    // light space so the edges of the (tight, sharp) shadows don't crawl as the camera moves
    const cp = cam.getWorldPosition(_camPos);
    const p = this.preset;
    const texel = (2 * p.shadowRange) / Math.max(1, this.sun.shadow.mapSize.x);
    this.lightRot.lookAt(_origin, Atmos.sunDir, _up);
    const ls = _v.copy(cp).applyMatrix4(_m.copy(this.lightRot).invert());
    ls.x = Math.round(ls.x / texel) * texel; ls.y = Math.round(ls.y / texel) * texel;
    const snapped = ls.applyMatrix4(this.lightRot);
    this.sun.position.copy(snapped).addScaledVector(Atmos.sunDir, 300);
    this.sun.target.position.copy(snapped);
    this.sun.target.updateMatrixWorld();
    // Spatial maps shade each aircraft skin; immersion also dims cockpit/local light.
    this.sun.intensity = Atmos.sunIntensity * 0.95 * (1 - 0.65 * weatherNow.cloudInside);
    atmosUniforms.uCamAlt.value = cp.y;
    farTerrainUniforms.uFarQuality.value = this.quality === 'low' ? 0 : this.quality === 'medium' ? 1 : 2;
    farTerrainUniforms.tFarShadow.value = this.clouds.groundShadowTexture;
    farTerrainUniforms.uFarShadowBox.value.copy(this.clouds.groundShadowBox);
    farTerrainUniforms.uFarCloudBase.value = Atmos.highBase;
    farTerrainUniforms.uFarLowBase.value = Atmos.lowBase;
    (this.sky.mesh.material as THREE.ShaderMaterial).uniforms.uGroundXZ.value.set(cp.x + Atmos.originOffset.x, cp.z + Atmos.originOffset.z);

    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    // Pass 1: opaque geometry (layer 0) -> HDR + depth
    this.sortLayers();
    cam.layers.set(0);
    r.render(this.scene, cam);
    // Clouds + aerial perspective composite
    this.clouds.render(r, cam, this.sceneRT, this.hdrRT, this.time, dt);
    this.post.cloudTex = this.clouds.texture;
    // Heat-haze offsets, soft-depth-tested against the opaque depth (before pass 2, so a
    // canopy or turret dome doesn't mask the exhaust shimmer seen through it)
    this.post.hazeTex = this.heatHaze.render(r, cam, this.sceneRT.depthTexture!);
    // linear depth copy for the soft effects (render/SoftDepth.ts), only when something wants it
    softDepth.capture(r, cam, this.sceneRT.depthTexture!, this.clouds.sunShadow);
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
    this.post.render(r, cam, this.sceneRT, this.sceneRT.depthTexture!, this.time, dt, this.scene);
  }

  // Another scene (own camera and lights, no sky or clouds) through the same MSAA target and
  // post stack as the world, so its materials keep the world's shader programs (same output
  // target; the caller mirrors the world's light counts) and it gets the game's grade.
  renderStudio(scene: THREE.Scene, cam: THREE.PerspectiveCamera, dt: number) {
    const r = this.renderer;
    cam.updateMatrixWorld();
    r.setRenderTarget(this.sceneRT);
    const cloudShadows = cloudShadowUniforms.uCloudShadowOn.value;
    cloudShadowUniforms.uCloudShadowOn.value = 0;
    r.render(scene, cam);
    cloudShadowUniforms.uCloudShadowOn.value = cloudShadows;
    this.post.render(r, cam, this.sceneRT, this.sceneRT.depthTexture!, this.time, dt);
  }

  // Compile a studio scene's programs in the background (KHR_parallel_shader_compile), for
  // the same render target renderStudio draws into
  compileStudio(scene: THREE.Scene, cam: THREE.PerspectiveCamera): Promise<unknown> {
    const r = this.renderer, prev = r.getRenderTarget();
    r.setRenderTarget(this.sceneRT);
    const p = r.compileAsync(scene, cam);
    r.setRenderTarget(prev);
    return p;
  }

  // Transparent materials go to layer 1 (drawn after the clouds), everything else layer 0
  private sortLayers() {
    this.scene.traverse((o) => {
      if ((o as THREE.Light).isLight) { o.layers.enableAll(); return; }
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      if (Array.isArray(m)) m.forEach(freshEnv); else freshEnv(m);   // back from outside the scene: the current sky
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
    this.clouds.rebase(offset);
    Atmos.windOffset.add(offset);
    Atmos.originOffset.add(offset);
  }
}

const _origin = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _px = new Uint8Array(4);

const _camPos = new THREE.Vector3();
