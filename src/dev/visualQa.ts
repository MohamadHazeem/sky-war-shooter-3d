import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import type { Engine, Quality } from '../core/Engine';
import type { Game } from '../game/Game';
import { applyWeather, ROUND_WEATHER, type Weather } from '../render/Weather';

// Development-only visual QA sweep (tools/gallery/visual-qa/README.md): an artifact detector
// for the frame that was just drawn, plus helpers to put the game into a given view / mood /
// quality and save a small JPEG through tools/gallery/save-server.mjs.
//   sws.vqa.freeze()                       stop the rAF loop (every frame is then driven by step())
//   sws.vqa.mood('night'); sws.vqa.step(120)
//   await sws.vqa.check('night-waist')     -> { hdr: {nan, hot, neg}, ldr: {black, white, clusters} }
//
// The HDR scan reads the scene target (opaque + clouds + transparent pass, before post) through a
// tiny pass that flags NaN/Inf by their exponent bits (robust under fast-math compilers), very
// bright texels and negative colour. The LDR scan reads the final canvas and clusters pure-black
// and fully clipped white pixels on an 8 px grid, so a NaN that the grade turned black, a black
// hole in a mesh or a bloom blob shows up as a cluster with its screen box.

const DETECT_FRAG = /* glsl */ `
  uniform sampler2D tSrc; uniform float uHot; varying vec2 vUv;
  bool bad(float x) { return (floatBitsToUint(x) & 0x7f800000u) == 0x7f800000u; }
  void main() {
    vec4 c = texture2D(tSrc, vUv);
    bool n = bad(c.r) || bad(c.g) || bad(c.b) || bad(c.a);
    float m = max(c.r, max(c.g, c.b));
    float hot = (!n && m > uHot) ? 1.0 : 0.0;
    float neg = (!n && min(c.r, min(c.g, c.b)) < -1e-3) ? 1.0 : 0.0;
    gl_FragColor = vec4(n ? 1.0 : 0.0, hot, neg, 1.0);
  }`;

export interface Cluster { x: number; y: number; w: number; h: number; cells: number }
export interface ScanResult {
  hdr?: { nan: number; hot: number; neg: number; nanBox: number[] | null; hotBox: number[] | null };
  ldr?: { black: number; white: number; blackClusters: Cluster[]; whiteClusters: Cluster[] };
}

export function visualQa(engine: Engine, game: Game) {
  const quad = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uHot: { value: 64 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: DETECT_FRAG,
    depthTest: false, depthWrite: false,
  }));
  const flagRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  let loop: XRFrameRequestCallback | null = null;
  const canvas2d = document.createElement('canvas');
  // the frame as the player sees it: a screen with its own scene (aircraft gallery) draws through renderOverride
  const draw = () => { if (engine.renderOverride) engine.renderOverride(1 / 60); else engine.render(1 / 60); };


  // NaN/Inf, very bright and negative texels in an HDR texture (default: the scene target)
  function scanHdr(tex?: THREE.Texture, w?: number, h?: number, hot = 64) {
    const rt = (engine as any).sceneRT as THREE.WebGLRenderTarget;
    const src = tex ?? rt.texture;
    const W = w ?? rt.width, H = h ?? rt.height;
    if (flagRT.width !== W || flagRT.height !== H) flagRT.setSize(W, H);
    const r = engine.renderer, prev = r.getRenderTarget();
    const m = quad.material as THREE.ShaderMaterial;
    m.uniforms.tSrc.value = src; m.uniforms.uHot.value = hot;
    r.setRenderTarget(flagRT);
    quad.render(r);
    const px = new Uint8Array(W * H * 4);
    r.readRenderTargetPixels(flagRT, 0, 0, W, H, px);
    r.setRenderTarget(prev);
    let nan = 0, hotN = 0, neg = 0;
    // screen boxes (canvas pixels, y down): x0, y0, x1, y1
    const nb = [1e9, 1e9, -1, -1], hb = [1e9, 1e9, -1, -1];
    const grow = (b: number[], x: number, y: number) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); };
    for (let i = 0, p = 0; i < W * H; i++, p += 4) {
      if (px[p] > 127) { nan++; grow(nb, i % W, H - 1 - Math.floor(i / W)); }
      if (px[p + 1] > 127) { hotN++; grow(hb, i % W, H - 1 - Math.floor(i / W)); }
      if (px[p + 2] > 127) neg++;
    }
    return { nan, hot: hotN, neg, nanBox: nan ? nb : null, hotBox: hotN ? hb : null };
  }

  // Pure-black / clipped-white clusters in the final picture. Call right after a render (the
  // canvas has no preserved drawing buffer: it is read in the same task).
  function scanLdr(cell = 8, frac = 0.35) {
    const src = engine.renderer.domElement;
    const W = src.width, H = src.height;
    canvas2d.width = W; canvas2d.height = H;
    const g = canvas2d.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(src, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const cw = Math.ceil(W / cell), ch = Math.ceil(H / cell);
    const cb = new Uint16Array(cw * ch), cwt = new Uint16Array(cw * ch);
    let black = 0, white = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      const r = d[p], gg = d[p + 1], b = d[p + 2];
      const c = Math.floor(y / cell) * cw + Math.floor(x / cell);
      if (r <= 2 && gg <= 2 && b <= 2) { black++; cb[c]++; }
      else if (r >= 254 && gg >= 254 && b >= 254) { white++; cwt[c]++; }
    }
    const need = cell * cell * frac;
    const clusters = (cnt: Uint16Array): Cluster[] => {
      const seen = new Uint8Array(cw * ch), out: Cluster[] = [];
      for (let i = 0; i < cw * ch; i++) {
        if (seen[i] || cnt[i] < need) continue;
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
        const st = [i]; seen[i] = 1;
        while (st.length) {
          const j = st.pop()!, x = j % cw, y = (j / cw) | 0;
          n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= cw || yy >= ch) continue;
            const k = yy * cw + xx;
            if (!seen[k] && cnt[k] >= need) { seen[k] = 1; st.push(k); }
          }
        }
        out.push({ x: x0 * cell, y: y0 * cell, w: (x1 - x0 + 1) * cell, h: (y1 - y0 + 1) * cell, cells: n });
      }
      return out.sort((a, b) => b.cells - a.cells).slice(0, 8);
    };
    return { black, white, blackClusters: clusters(cb), whiteClusters: clusters(cwt) };
  }

  // Draw a frame, then scan it
  function scan(o: { hdr?: boolean; ldr?: boolean; hot?: number } = {}): ScanResult {
    draw();
    const out: ScanResult = {};
    if (o.ldr !== false) out.ldr = scanLdr();
    if (o.hdr !== false) out.hdr = scanHdr(undefined, undefined, undefined, o.hot);
    return out;
  }

  async function save(file: string, port = 5239) {
    draw();
    const url = engine.renderer.domElement.toDataURL('image/jpeg', 0.9);
    const r = await fetch(`http://localhost:${port}/save?file=${encodeURIComponent(file)}`, { method: 'POST', body: url });
    return r.text();
  }

  // Scan + save visual-qa/<dir>/<name>.jpg; a compact verdict string for long sweeps
  async function check(name: string, dir = 'sweep', o: { hot?: number; save?: boolean } = {}) {
    const s = scan({ hot: o.hot });
    if (o.save !== false) await save(`visual-qa/${dir}/${name}.jpg`);
    const L = s.ldr!, H = s.hdr!;
    const big = (c: Cluster[]) => c.filter((k) => k.cells >= 2).map((k) => `${k.w}x${k.h}@${k.x},${k.y}`).join(' ');
    return `${name}: nan=${H.nan}${H.nanBox ? ' ' + H.nanBox.join(',') : ''} hot=${H.hot}${H.hotBox ? ' ' + H.hotBox.join(',') : ''} neg=${H.neg} | black=${L.black} [${big(L.blackClusters)}] white=${L.white} [${big(L.whiteClusters)}]`;
  }

  // Simulation steps without rendering, then `settle` rendered frames (temporal passes converge)
  function step(n = 60, settle = 12, dt = 1 / 60) {
    for (let i = 0; i < n; i++) engine.frame(dt, false);
    for (let i = 0; i < settle; i++) engine.frame(dt, true);
  }

  // Stop / restart the live rAF loop so a set-up view does not run away between evaluations
  function freeze() {
    if (loop) return;
    loop = () => { /* frozen */ };
    engine.renderer.setAnimationLoop(null);
  }
  function unfreeze() {
    if (!loop) return;
    loop = null;
    engine.start();
  }

  function quality(q: Quality) {
    game.settings.quality = q;
    game.applySettings();
  }

  const MOODS: Record<string, Weather> = {
    clear: ROUND_WEATHER[0], golden: ROUND_WEATHER[1], overcast: ROUND_WEATHER[2], dusk: ROUND_WEATHER[3], storm: ROUND_WEATHER[4],
    night: { sunEl: 26, sunAz: 140, low: 0.55, high: 0.22, contrails: false, mood: 'night' },
  };
  function mood(name: keyof typeof MOODS | string) {
    const w = MOODS[name];
    (game as any).setWeather(w);
    applyWeather(engine, w);
    engine.post.resetHistory();
  }

  // Gunner views: station, ADS (zoom) and free look (head turned, as holding C)
  function gunner(station: string, o: { ads?: boolean; lookYaw?: number; lookPitch?: number; yaw?: number; pitch?: number } = {}) {
    const gun = game.gunner as any;
    if (gun.station !== station) gun.setStation(station, true);
    const inp = game.input as any;
    inp.buttons = o.ads ? 4 : 0;
    if (o.lookYaw !== undefined || o.lookPitch !== undefined) {
      inp.keys.add('KeyC');
      gun.lookYaw = o.lookYaw ?? 0; gun.lookPitch = o.lookPitch ?? 0;
    } else inp.keys.delete('KeyC');
    const s = gun.states.get(station);
    if (o.yaw !== undefined) s.yaw = s.tYaw = o.yaw;
    if (o.pitch !== undefined) s.pitch = s.tPitch = o.pitch;
  }

  function release() { const inp = game.input as any; inp.buttons = 0; inp.keys.clear(); }

  // Free camera for an outside look (call after the last step(): the controllers own the camera
  // inside a frame), then `settle` renders on it so the temporal passes converge
  function look(from: THREE.Vector3, at: THREE.Vector3, fov = 50, settle = 16) {
    const cam = engine.camera;
    cam.position.copy(from);
    cam.up.set(0, 1, 0);
    cam.lookAt(at);
    cam.fov = fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    engine.post.resetHistory();
    for (let i = 0; i < settle; i++) engine.render(1 / 60);
  }

  // Remove the enemy fighters (a calm frame for a view check)
  function clear() { for (const a of game.world.aircraft) if (a.team === 'axis') a.remove = true; }

  // Save a crop of the full-resolution frame (canvas pixels) as visual-qa/<file>.jpg
  async function crop(file: string, x: number, y: number, w: number, h: number, port = 5239) {
    draw();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(engine.renderer.domElement, x, y, w, h, 0, 0, w, h);
    const r = await fetch(`http://localhost:${port}/save?file=${encodeURIComponent(`visual-qa/${file}.jpg`)}`, { method: 'POST', body: c.toDataURL('image/jpeg', 0.9) });
    return r.text();
  }

  // What is under a canvas pixel: visible meshes along the ray (distance, name path, material)
  function pick(px: number, py: number, n = 6) {
    const c = engine.renderer.domElement;
    const rc = new THREE.Raycaster();
    rc.layers.enableAll();
    rc.setFromCamera(new THREE.Vector2(px / c.width * 2 - 1, -(py / c.height * 2 - 1)), engine.camera);
    const shown = (o: THREE.Object3D | null) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    return rc.intersectObjects(engine.scene.children, true).filter((h) => shown(h.object)).slice(0, n).map((h) => {
      const path: string[] = [];
      for (let o: THREE.Object3D | null = h.object, i = 0; o && i < 6; o = o.parent, i++) path.push(o.name || o.type);
      const m = (h.object as THREE.Mesh).material as THREE.Material;
      return `${h.distance.toFixed(2)} ${path.join('<')} ${m?.name || m?.type}`;
    });
  }

  // Run a named view set-up, then check it; errors come back as text so a long sweep goes on
  async function qa(name: string, setup?: () => unknown, dir = 'sweep') {
    try { await setup?.(); return await check(name, dir); } catch (e) { return `${name}: ERR ${(e as Error).message}`; }
  }

  return { scan, scanHdr, scanLdr, save, check, step, freeze, unfreeze, quality, mood, gunner, release, look, clear, crop, pick, qa, MOODS, THREE };
}
