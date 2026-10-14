import type { WebGLRenderTarget } from 'three';
import type { Engine } from '../core/Engine';
import type { ShotName } from './gallery';

// Development-only: A/B render-time comparison of the cloud paths on the gallery cameras.
//   sws.cloudBench.ab()                     -> median ms per rendered frame, legacy vs temporal
//   sws.cloudBench.ab(['top'], 7, 16)       -> shots, repetitions, frames per sample
// Each sample renders n frames of the same camera (no simulation) between GPU syncs (a
// 1-pixel readback), alternating the configurations so other load on the machine hits all
// of them alike. 'legacy' is the Low path at the current tier's buffer size and the
// pre-temporal step count (High: 64), with heat haze off: the frame as it was before.
export function cloudBench(engine: Engine, gallery: { setup(n: ShotName): void }) {
  const r = engine.renderer, gl = r.getContext() as WebGL2RenderingContext, px = new Uint8Array(4);
  const c = engine.clouds;
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const time = (fn: () => void, n: number) => {
    sync(); fn(); sync();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) fn();
    sync();
    return (performance.now() - t0) / n;
  };
  const tierSteps = () => engine.preset.cloudSteps;
  const configs: Record<string, () => void> = {
    legacy: () => { c.forceLegacy = true; c.steps = LEGACY_STEPS[engine.quality] ?? tierSteps(); engine.heatHaze.enabled = false; },
    temporal: () => { c.forceLegacy = false; c.steps = tierSteps(); engine.heatHaze.enabled = engine.preset.haze; },
  };
  const restore = () => configs.temporal();

  function ab(shots: ShotName[] = ['waist', 'top', 'formation'], reps = 7, n = 12) {
    const out: Record<string, Record<string, number>> = {};
    try {
      for (const shot of shots) {
        gallery.setup(shot);
        const samples: Record<string, number[]> = {};
        for (let k = 0; k < reps; k++) {
          for (const [name, apply] of Object.entries(configs)) {
            apply();
            // settle the history on this camera first
            for (let i = 0; i < 8; i++) engine.render(1 / 60);
            (samples[name] ??= []).push(time(() => engine.render(1 / 60), n));
          }
        }
        out[shot] = {};
        for (const [name, s] of Object.entries(samples)) {
          s.sort((a, b) => a - b);
          out[shot][name] = +s[s.length >> 1].toFixed(2);
        }
      }
    } finally {
      restore();
    }
    return { ...out, size: [r.domElement.width, r.domElement.height], quality: engine.quality };
  }

  // Clouds only: march, temporal resolve, amortized shadow map/probe and the full-size
  // aerial-perspective composite. GPU elapsed queries where available; otherwise a
  // fenced batch measures CPU submission + GPU time (a conservative upper bound).
  async function clouds(reps = 9, n = 16) {
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const targets = engine as unknown as { sceneRT: WebGLRenderTarget; hdrRT: WebGLRenderTarget };
    const saved = r.getRenderTarget();
    const programs = r.info.programs?.length;
    const samples: number[] = [];
    const render = () => c.render(r, engine.camera, targets.sceneRT, targets.hdrRT, engine.time, 1 / 60);
    const fence = () => { r.setRenderTarget(null); sync(); };
    const now = () => { const m = performance.mark('cloud-bench-clock'); performance.clearMarks('cloud-bench-clock'); return m.startTime; };
    try {
      for (let i = 0; i < 24; i++) render();
      for (let rep = 0; rep < reps; rep++) {
        fence();
        const query = ext ? gl.createQuery() : null;
        if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        const start = now();
        for (let i = 0; i < n; i++) render();
        if (query) gl.endQuery(ext.TIME_ELAPSED_EXT);
        fence();
        let ms = (now() - start) / n;
        if (query) {
          // Yield the browser event loop; query availability cannot advance in a tight loop.
          let ready = false;
          for (let i = 0; i < 200; i++) {
            await new Promise(resolve => setTimeout(resolve, 5));
            if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) { ready = true; break; }
          }
          const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
          if (!ready || disjoint) { gl.deleteQuery(query); throw new Error('GPU timer unavailable/disjoint; rerun the benchmark'); }
          ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6 / n;
          gl.deleteQuery(query);
        }
        samples.push(ms);
      }
    } finally { r.setRenderTarget(saved); }
    samples.sort((a, b) => a - b);
    return { method: ext ? 'GPU elapsed query' : 'fenced batch (CPU + GPU upper bound)',
      size: [targets.sceneRT.width, targets.sceneRT.height], quality: engine.quality, samples,
      median: samples[samples.length >> 1], p95: samples[Math.floor(samples.length * .95)],
      programsBefore: programs, programsAfter: r.info.programs?.length };
  }

  return { ab, configs, time, clouds };
}

// Cloud raymarch steps per tier before the temporal path (Engine QUALITY at the time)
const LEGACY_STEPS: Record<string, number> = { low: 36, medium: 52, high: 64, ultra: 88 };
