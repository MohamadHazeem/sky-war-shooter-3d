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
  const r = engine.renderer, gl = r.getContext(), px = new Uint8Array(4);
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

  return { ab, configs, time };
}

// Cloud raymarch steps per tier before the temporal path (Engine QUALITY at the time)
const LEGACY_STEPS: Record<string, number> = { low: 36, medium: 52, high: 64, ultra: 88 };
